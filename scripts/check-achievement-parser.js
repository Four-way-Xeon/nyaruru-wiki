#!/usr/bin/env node
'use strict';
// Synthetic fixtures only. Never searches for game saves or Steam account files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('../dist/save-parser.js');
const steamParser = require('../dist/achievement-parser.js');
const {makeFixture,fixtureData} = require('./check-save-parser.js');
function binaryFixture(tree){
  const parts=[];
  function add(obj){for(const [key,value]of Object.entries(obj)){
    const type=typeof value==='number'?2:typeof value==='string'?1:0;
    parts.push(Buffer.from([type]),Buffer.from(key+'\0'));
    if(type===0)add(value);
    else if(type===1)parts.push(Buffer.from(value+'\0'));
    else {const b=Buffer.alloc(4);b.writeUInt32LE(value>>>0);parts.push(b);}
  }parts.push(Buffer.from([8]));}
  add(tree);return new Uint8Array(Buffer.concat(parts));
}
function makeSteamFixture(){
  return {filename:'UserGameStats_123456_1478160.bin',
    bytes:binaryFixture({cache:{crc:123,PendingChanges:0,1:{data:0x80000001,AchievementTimes:{0:1700000000,31:1700000001}},2:{data:4},
      unrelated:'SYNTHETIC_PRIVATE_ACCOUNT'}}),
    expected:{unlocked:3,locked:29,unknown:0,unlockedIds:['N1','ED3','HIDDEN12'],source:'steam-cache'}};
}
function makeNativeFixture(){
  return {filename:'config.rmmzsave',
    bytes:makeFixture({_version:1,bgmVolume:80,_achievementNative:{N1:true,N2:false,HIDDEN1:true},unrelated:'SYNTHETIC_PRIVATE_ACCOUNT'}),
    expected:{unlocked:2,locked:30,unknown:0,unlockedIds:['N1','HIDDEN1'],source:'native-config'}};
}
async function run() {
  let checks=0;
  const check=(condition,label)=>{assert.ok(condition,label);checks++;};
  const native=(data,extra={})=>parser.parseConfig(makeFixture(data),{platform:'native',...extra});
  const config={_version:1,bgmVolume:80,_achievementNative:{N1:true,N2:false,HIDDEN1:true},
    unrelated:{account:'SYNTHETIC_PRIVATE_ACCOUNT',script:'globalThis.achievementScriptExecuted=true'}};
  const result=await native(config);
  check(result.ok && result.achievements.length===32,'32 allowlisted IDs');
  check(result.coverage.achievements.unlocked===2 && result.coverage.achievements.locked===30,'native game dictionary semantics');
  check(result.achievements.find(x=>x.id==='N2').basis==='native-explicit-boolean','explicit locked');
  check(result.achievements.find(x=>x.id==='N3').basis==='native-dictionary-absent-entry-is-false','absent native entry explained');
  check(result.achievements.every(x=>x.source==='native-config'),'native source never says Steam');
  check(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE') && !JSON.stringify(result).includes('achievementScriptExecuted'),'privacy output whitelist');
  check(globalThis.achievementScriptExecuted===undefined,'script never runs');
  check((await parser.parseConfig(makeFixture(config))).error.code==='PLATFORM','explicit native selection required');
  check((await native(config,{platform:'steam'})).error.code==='PLATFORM','Steam config cannot be treated as native');
  check((await parser.parse(makeFixture(config))).error.code==='STRUCTURE','config never accepted as slot');
  check((await native(fixtureData())).error.code==='CONFIG','slot never accepted as config');
  check((await native({_version:1,bgmVolume:80})).coverage.achievements.unknown===32,'missing dictionary is unknown');
  for (const dictionary of [null,[],false,{N1:'true'},{N1:1},{N1:{value:true}}]) {
    check((await native({...config,_achievementNative:dictionary})).coverage.achievements.unknown===32,'invalid dictionary stays unknown');
  }
  check((await native({...config,_achievementNative:{}})).coverage.achievements.locked===32,'valid empty native dictionary uses original game rule');
  const subset=await native(config,{achievements:[{id:'N1'},{id:'N1'},{id:'UNKNOWN_PRIVATE_ID'},{id:'N2'}]});
  check(subset.achievements.length===2 && !JSON.stringify(subset).includes('UNKNOWN_PRIVATE_ID'),'catalog IDs filtered and deduplicated');
  const slot=fixtureData();slot._achievementNative={N1:true};slot.system._achievementShowing=['N1'];
  slot.switches={_data:new Array(170).fill(true)};
  const progress=await parser.parse(makeFixture(slot));
  check(progress.achievements.every(x=>x.status==='unknown' && x.source==='slot'),'slot switches, notifications and injected dictionary cannot impersonate platform achievements');
  check(progress.coverage.achievements.unknown===32,'slot coverage complete');
  check(!(await native({})).ok,'unrecognized config rejected');
  const bad=makeFixture(config);bad[bad.length-1]^=1;
  check(!(await parser.parseConfig(bad,{platform:'native'})).ok,'corruption rejected');
  check((await parser.parseConfig(new Uint8Array(parser.limits.inputBytes+1),{platform:'native'})).error.code==='SIZE','config keeps size bounds');
  const source=fs.readFileSync(path.join(__dirname,'../dist/save-parser.js'),'utf8');
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|eval)\s*\(/.test(source),'no network/storage/eval');
  const steamOptions={filename:'UserGameStats_123456789_1478160.bin'};
  const steam=(tree,options={})=>steamParser.parseSteam(binaryFixture(tree),{...steamOptions,...options});
  const steamTree={cache:{crc:123,PendingChanges:0,1:{data:0x80000001,AchievementTimes:{0:1700000000,31:1700000001}},2:{data:4},
    unrelated:'SYNTHETIC_PRIVATE_ACCOUNT'}};
  const sr=steam(steamTree);
  check(sr.ok&&sr.coverage.achievements.unlocked===3&&sr.coverage.achievements.locked===29,'Steam explicit bitmap');
  check(sr.achievements.find(x=>x.id==='ED3').status==='unlocked','high bit31 unsigned correctly');
  check(sr.achievements.find(x=>x.id==='HIDDEN12').status==='unlocked','second stat group');
  check(!JSON.stringify(sr).includes('123456789')&&!JSON.stringify(sr).includes('SYNTHETIC_PRIVATE'),'Steam output excludes filename/account/unrelated fields');
  check(steam({cache:{1:{data:(1<<8)|(1<<26)|(1<<28)},2:{data:0}}}).coverage.achievements.unlocked===0,'unused schema bit holes not shifted');
  check(steam({cache:{1:{data:0}}}).coverage.achievements.unknown===3,'missing group never locked');
  check(steam({cache:{1:{AchievementTimes:{0:1700000000}},2:{data:'4'}}}).coverage.achievements.unknown===32,'missing or wrong-type mask never guessed');
  check(steam({cache:{1:{data:0,AchievementTimes:{0:1700000000}}}}).achievements.find(x=>x.id==='N1').status==='unknown','conflicting timestamp and mask');
  check(steam({cache:{}}).coverage.achievements.unknown===32,'empty cache unknown');
  check(steam(steamTree,{achievements:[{id:'N1',steam:{statId:2,bit:1}},{id:'PRIVATE'}]}).achievements[0].status==='unlocked','untrusted catalog cannot override public mapping');
  for(const filename of ['UserGameStats_123_123.bin','UserGameStatsSchema_1478160.bin','../UserGameStats_123_1478160.bin','x.bin','',undefined]){
    check(steam(steamTree,{filename}).error.code==='FILENAME','wrong game/schema/invalid name rejected');
  }
  check(!steam({wrong:{1:{data:1}}}).ok,'wrong root rejected');
  check(!steam({'1478160':{stats:{}}}).ok,'public schema never treated as user state');
  const sb=binaryFixture(steamTree),sp=new Uint8Array(sb.length+10);sp.set(sb,5);
  check(steamParser.parseSteam(sp.subarray(5,-5),steamOptions).ok,'Steam view offset preserved');
  check(steamParser.parseSteam(sb.buffer,steamOptions).ok,'Steam ArrayBuffer accepted');
  check(!steamParser.parseSteam(sb.subarray(0,sb.length-2),steamOptions).ok,'truncated nested object rejected');
  check(!steamParser.parseSteam(new Uint8Array([...sb,1]),steamOptions).ok,'trailing data rejected');
  check(steamParser.parseSteam(new Uint8Array(steamParser.limits.inputBytes+1),steamOptions).error.code==='SIZE','Steam size cap');
  const deepSteam={cache:{}};let deepNode=deepSteam.cache;for(let i=0;i<55;i++)deepNode=deepNode.child={};
  check(steam(deepSteam).error.code==='COMPLEXITY','Steam depth cap');
  check(steam({cache:{text:'x'.repeat(steamParser.limits.stringBytes+1)}}).error.code==='COMPLEXITY','Steam string cap');
  const broadSteam={cache:{}};for(let i=0;i<steamParser.limits.nodes+1;i++)broadSteam.cache['v'+i]=0;
  check(steam(broadSteam).error.code==='COMPLEXITY','Steam node cap');
  const proto=JSON.parse('{"cache":{"__proto__":{"polluted":1}}}');
  check(!steam(proto).ok&&({}).polluted===undefined,'Steam prototype keys rejected');
  const steamSource=fs.readFileSync(path.join(__dirname,'../dist/achievement-parser.js'),'utf8');
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|eval)\s*\(/.test(steamSource),'Steam no network/storage/eval');
  // Execute only the project's public static catalogue, never uploaded bytes.
  const publicContext={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/achievements.js'),'utf8'),publicContext,{timeout:1000});
  const publicItems=publicContext.window.NYARURU_ACHIEVEMENTS.items;
  check(publicItems.length===32&&new Set(publicItems.map(item=>item.id)).size===32,'public catalogue contains 32 distinct achievements');
  for(const item of publicItems){
    const groups={1:{data:0},2:{data:0}};
    assert.ok([1,2].includes(item.steam.statId)&&Number.isInteger(item.steam.bit)&&item.steam.bit>=0&&item.steam.bit<32,'valid public bit mapping: '+item.id);
    groups[item.steam.statId].data=(2**item.steam.bit)>>>0;
    const single=steam({cache:groups});
    check(single.ok&&single.achievements.length===32&&single.coverage.achievements.unlocked===1&&
      single.coverage.achievements.locked===31&&single.coverage.achievements.unknown===0&&
      single.achievements.every(row=>row.status===(row.id===item.id?'unlocked':'locked')),
    'public catalogue bit independently resolves exactly '+item.id);
  }
  console.log('Achievement parser: '+checks+' synthetic checks passed; no real save or account cache read.');
  return {ok:true,checks};
}
module.exports={run,binaryFixture,makeSteamFixture,makeNativeFixture};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
