#!/usr/bin/env node
'use strict';
// All inputs below are synthetic. No user save paths are accepted or scanned.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const assert = require('node:assert/strict'), vm = require('node:vm');
const project = path.resolve(__dirname,'..');
const parser = require('../dist/save-parser.js');
function fixtureData() {
  return {version:42,system:{'@':'Game_System',_framesOnSave:223380},
    map:{'@':'Game_Map',_mapId:6},party:{'@':'Game_Party',_actors:[1]},
    actors:{'@':'Game_Actors',_data:[null,{'@':'Game_Actor',_name:'SYNTHETIC_PRIVATE_NAME',
      _coin:1234,_joyCoin:2,_hpStrengthItem:3,_skillStrengthItem:4,
      _weapons:{'@':'Game_Weapons',_unlock:[0,2],_currentWeapon:2},
      _stones:{'@':'Game_Stones',_unlock:[1,3],_equip:[1]},
      _ornaments:{'@':'Game_Ornaments',_unlock:[0,4],_equip:[4]},
      _consumables:{'@':'Game_Consumables',_data:{0:5,2:1}}}]},
    selfSwitches:{'@':'Game_SelfSwitches',_data:{'6,10,A':true,'6,11,A':false}},
    unrelated:{steamId:'SYNTHETIC_PRIVATE_ACCOUNT',script:'globalThis.saveScriptExecuted = true;'}};
}
function encode(json, encrypted = true) {
  const bytes = zlib.deflateSync(Buffer.from(json));
  if (!encrypted) return new Uint8Array(bytes);
  const source = fs.readFileSync(path.join(project,'dist/save-parser.js'),'utf8');
  const packed = source.match(/const MASK_BASE64 = '([^']+)';/)[1];
  const mask = zlib.inflateSync(Buffer.from(packed,'base64'));
  if (bytes.length > mask.length) throw Error('Synthetic input exceeds researched domain');
  return Uint8Array.from(bytes,(v,i)=>v^mask[i]);
}
function makeFixture(data = fixtureData(), options = {}) { return encode(JSON.stringify(data), options.encrypted !== false); }
function catalog() {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(project,'dist/data.js'),'utf8'),context,{timeout:1000});
  return context.window.NYARURU_DATA;
}
async function run() {
  const actualCatalog = catalog();
  const testCatalog = {...actualCatalog,locations:[
    {official:true,collectionKey:'6:10'},{official:true,collectionKey:'6:10'},
    {official:true,collectionKey:'6:11'},{official:true,collectionKey:'6:12'},
    {official:false,collectionKey:'6:13'}]};
  const read = data => parser.parse(data,{catalog:testCatalog});
  let checks = 0;
  const check = (condition,label) => { assert.ok(condition,label); checks++; };
  const a = await read(makeFixture());
  check(a.ok,'desktop encrypted source format');
  check(a.coverage.format==='desktop-xor-zlib','format identity');
  assert.deepEqual(a.completed,['6:10']); checks++;
  assert.deepEqual(a.coverage.collections,{total:3,confirmedCompleted:1,confirmedNotCompleted:1,unknown:1}); checks++;
  check(a.summary.coin===1234 && a.summary.mapId===6 && a.summary.regionName==='喵喵小镇','verified leader and public map lookup');
  check(a.summary.playtime==='01:02:03','stored frame count');
  check(a.inventory.some(i=>i.itemKey==='weapons:2'&&i.equipped&&i.count===1),'weapon equipped field');
  check(a.inventory.some(i=>i.itemKey==='consumables:0'&&i.count===5),'consumable count');
  check(a.coverage.inventory.unknownTypes.includes('bell'),'bell count remains unknown');
  check(!JSON.stringify(a).includes('SYNTHETIC_PRIVATE') && !JSON.stringify(a).includes('saveScriptExecuted'),'output whitelist');
  check(globalThis.saveScriptExecuted===undefined,'script text never runs');
  check((await read(makeFixture(undefined,{encrypted:false}))).coverage.format==='zlib','untransformed browser zlib');
  const buffer=makeFixture(); const padded=new Uint8Array(buffer.length+32);padded.set(buffer,16);
  check((await read(padded.subarray(16,-16))).ok,'view offsets respected');
  check((await read(buffer.buffer)).ok,'ArrayBuffer interface');
  const missing = fixtureData(); delete missing.selfSwitches._data; delete missing.actors;
  const partial = await read(makeFixture(missing));
  check(partial.ok && partial.coverage.collections.unknown===3 && !partial.completed.length,'missing fields stay unknown');
  check(partial.coverage.summary.coin==='unknown' && !partial.inventory.length,'unknown actor never guessed');
  const invalid = fixtureData();invalid.actors._data[1]._stones._unlock='bad';invalid.selfSwitches._data['6,10,A']='true';
  const malformed = await read(makeFixture(invalid));
  check(malformed.coverage.inventory.unknownTypes.includes('stones') && !malformed.completed.length,'bad types stay unknown');
  for (const data of [{},[],{volume:80},{system:{},map:{}},null]) check(!(await read(makeFixture(data))).ok,'non-save rejected');
  for (const input of [new Uint8Array(),new Uint8Array([1,2,3,4,5,6,7]),'text',new Uint8Array(parser.limits.inputBytes+1)]) check(!(await read(input)).ok,'invalid/oversize inputs');
  const damaged=makeFixture();damaged[damaged.length-1]^=1;
  check(!(await read(damaged)).ok,'checksum corruption');
  check(!(await read(encode('{bad JSON'))).ok,'invalid JSON');
  for (const key of ['__proto__','prototype','constructor']) {
    const json=JSON.stringify(fixtureData()).replace(/}$/,',"'+key+'":{"polluted":true}}');
    check((await read(encode(json))).error.code==='UNSAFE_KEYS','prototype-key rejection');
  }
  check(({}).polluted===undefined,'global prototype intact');
  for (const marker of ['@r','@c','@a']) {
    const data=fixtureData(); data.unrelated={[marker]:1};
    check((await read(makeFixture(data))).error.code==='REFERENCES','reference encodings rejected without expansion');
  }
  const named=fixtureData();named.actors._data[1]['@']='Function';
  check((await read(makeFixture(named))).ok,'class labels ignored as plain strings');
  const deep=fixtureData();let node=deep.unrelated;for(let i=0;i<110;i++)node=node.child={};
  check((await read(makeFixture(deep))).error.code==='COMPLEXITY','depth cap');
  const broad=fixtureData();broad.unrelated=new Array(500001).fill(0);
  check((await read(makeFixture(broad))).error.code==='COMPLEXITY','node cap');
  const expanded=encode(' '.repeat(parser.limits.jsonBytes+1),false);
  check((await read(expanded)).error.code==='EXPANSION','streaming expansion cap');
  const source=fs.readFileSync(path.join(project,'dist/save-parser.js'),'utf8');
  check(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|eval)\s*\(/.test(source),'no network/storage/eval calls');
  const originalFixture=path.join(project,'.qa/save-research/original-synthetic.rmmzsave');
  if(fs.existsSync(originalFixture)) check((await read(new Uint8Array(fs.readFileSync(originalFixture)))).ok,'independent original main.y fixture');
  console.log('Save parser: '+checks+' synthetic checks passed; no real save read.');
  return {ok:true,checks};
}
module.exports={makeFixture,fixtureData,run};
if(require.main===module) run().catch(e=>{console.error(e);process.exitCode=1;});
