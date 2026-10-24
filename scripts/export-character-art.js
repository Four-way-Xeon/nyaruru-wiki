#!/usr/bin/env node
'use strict';
// Offline export of original character art; no game boot, Steam or player saves.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..'),workspace=path.dirname(project);
// actor: story-schinese.xlsx #actor id; object: nya_game_system.js battle object.
const mappings=[
 {id:'nyaruru',actor:1,object:0,animation:';toru_standing',alias:'Nyarutoru'},
 {id:'berries',actor:2,object:11,animation:';berries_standing',alias:'Berries'},
 {id:'lily',actor:3,object:34,animation:';lily_standing',alias:'Lily'},
 {id:'sakura',actor:13,object:438,animation:';sakura_standing',alias:'Sakura'},
 {id:'lianne',actor:17,object:176,animation:';laine_stand',alias:'Laine'},
 {id:'eliza',actor:18,object:277,animation:';heart_stand',alias:'Heart'},
 {id:'dracula',actor:16,object:220,animation:';dracula_stand',alias:'Dracula'},
 {id:'theia',actor:22,object:368,animation:';tiya_standing',alias:'Theia'},
 {id:'nyakori',actor:10,object:254,animation:';kori_stand',alias:'Nyakori'},
 {id:'yuri',actor:11,object:252,animation:';liei_stand',alias:'Yuri'},
 {id:'irin',actor:15,object:436,animation:';irin_standing',alias:'Irin'},
 {id:'plague-witch',actor:23,object:405,animation:';irin2_standing',alias:'Irin2'},
 {id:'nyarutoru',actor:19,object:149,animation:';toruc_standing',alias:'Nyarutoru2'},
 {id:'strange-creature',actor:12,object:27,animation:';author',alias:null},
 {id:'orange-flower',actor:14,object:61,animation:';orange_cat_stand',alias:null}
];
async function utility() {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const zlib = require('zlib'), crypto = require('crypto');
  const job = JSON.parse(fs.readFileSync(path.resolve('job.json'), 'utf8'));
  const reportFile = path.resolve('result.json');
  try {
    const binary = fs.readFileSync(path.join(job.gameDir, 'js/main.bin'));
    const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256(binary) !== job.binaryHash) throw Error('Game bytecode changed during export');
    const source = '"' + '\u200b'.repeat(binary.readUInt32LE(8) - 2) + '"';
    const matching = new vm.Script(source, { produceCachedData: true }).createCachedData();
    if (binary.readUInt32LE(4) !== matching.readUInt32LE(4)) throw Error('Use the matching NW.js SDK version');
    // Adapt only the cache flags hash for this isolated VM, retaining version and payload.
    matching.copy(binary, 12, 12, 16);
    const cached = new vm.Script(source, { cachedData: binary });
    if (cached.cachedDataRejected) throw Error('V8 rejected the original bytecode');
    const context = vm.createContext({ module: { exports: {} }, NYA: { BUILD: true }, Uint8Array });
    cached.runInContext(context, { timeout: 1000 });
    if (!vm.runInContext('typeof main.x === "function" && typeof window === "undefined" && NYA.BUILD', context)) {
      throw Error('Isolated resource decoder is unavailable');
    }
    function decode(bytes, offset = 0) {
      context.bytes = new Uint8Array(bytes); context.offset = offset;
      vm.runInContext('main.x(bytes, offset)', context, { timeout: 2000 });
      return Buffer.from(context.bytes);
    }
    const index = JSON.parse(zlib.inflateSync(decode(fs.readFileSync(path.join(job.gameDir, 'resource.index')))).toString('utf8'));
    const manifest={schemaVersion:1,characters:{},source:{name:'《咸鱼喵喵》本地原版游戏素材',rights:'游戏图片权利归赤瞳大白猫、猫尾巴制作组等各自权利人；文字的 CC BY-NC-SA 4.0 不适用于这些图片。导出不代表取得再分发许可。',binarySha256:job.binaryHash,mapping:'story-schinese.xlsx #actor + nya_game_system.js + iframe.xlsx ImageFrame',resources:[]}};
    async function readImage(name){
      if(!job.allowed.includes(name))throw Error('Not whitelisted: '+name);
      const entry=index[name];
      if(!entry||!Number.isInteger(entry.file)||entry.file<0||entry.file>20||!Number.isSafeInteger(entry.pos)||entry.pos<0||!Number.isSafeInteger(entry.size)||entry.size<=0||entry.size>16*1024*1024)throw Error('Invalid image entry '+name);
      const fd=fs.openSync(path.join(job.gameDir,'file'+entry.file+'.data'),'r'),encrypted=Buffer.alloc(entry.size);
      try{if(fs.readSync(fd,encrypted,0,entry.size,entry.pos)!==entry.size)throw Error('Short read');}finally{fs.closeSync(fd)}
      const png=decode(encrypted,entry.pos);if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Not PNG');
      const image=new Image();await new Promise((yes,no)=>{image.onload=yes;image.onerror=no;image.src='data:image/png;base64,'+png.toString('base64')});
      manifest.source.resources.push({name:decodeURIComponent(name),width:image.width,height:image.height,sha256:sha256(png)});return {image,png};
    }
    for(const m of job.mappings){
      const target=manifest.characters[m.id]={pixel:null,portrait:null};
      const {image}=await readImage(m.resource),w=image.width/m.columns,h=image.height/m.rows,x=(m.start%m.columns)*w,y=Math.floor(m.start/m.columns)*h;
      if(![w,h,x,y].every(Number.isInteger)||w<1||h<1||x+w>image.width||y+h>image.height)throw Error('Invalid frame '+m.id);
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,x,y,w,h,0,0,w,h);
      const pixels=ctx.getImageData(0,0,w,h).data;if(!pixels.some((v,i)=>i%4===3&&v))throw Error('Empty image '+m.id);
      // Trim transparent padding only. Every retained pixel keeps its original RGBA value.
      let l=w,t=h,r=0,b=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(pixels[(yy*w+xx)*4+3]){l=Math.min(l,xx);r=Math.max(r,xx);t=Math.min(t,yy);b=Math.max(b,yy)}
      const cut=document.createElement('canvas');cut.width=r-l+1;cut.height=b-t+1;cut.getContext('2d').putImageData(ctx.getImageData(l,t,cut.width,cut.height),0,0);
      let src='assets/characters/'+m.id+'-pixel.png';fs.writeFileSync(path.join(job.outDir,src),Buffer.from(cut.toDataURL('image/png').split(',')[1],'base64'));
      target.pixel={src,width:cut.width,height:cut.height};target.pixelEvidence={actor:m.actor,battleObject:m.object,animation:m.animation,resource:decodeURIComponent(m.resource),grid:[m.columns,m.rows],frame:m.start,crop:{x,y,width:w,height:h},trim:{x:l,y:t,width:cut.width,height:cut.height}};
      if(m.portraitResource){const portrait=await readImage(m.portraitResource);src='assets/characters/'+m.id+'-portrait.png';fs.writeFileSync(path.join(job.outDir,src),portrait.png);target.portrait={src,width:portrait.image.width,height:portrait.image.height};target.portraitEvidence={actor:m.actor,alias:m.alias,resource:m.portraitResource};}
    }
    manifest.characters.lilong={pixel:null,portrait:null,note:'未发现可核实的独立原版素材，不以其他人物素材替代。'};
    fs.writeFileSync(path.join(job.outDir,'assets/characters/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    fs.writeFileSync(reportFile,JSON.stringify({ok:true,count:Object.keys(manifest.characters).length}));
  }catch(error){fs.writeFileSync(reportFile,JSON.stringify({ok:false,error:String(error.stack||error)}));}finally{nw.App.quit()}
}
async function run(){
 const gameDir=path.join(workspace,'测试游戏'),dataDir=path.join(workspace,'修改器/unpacked/data'),outDir=path.join(project,'dist');
 const X=require(path.join(gameDir,'js/libs/xlsx.mini.min.js'));
 const rows=X.utils.sheet_to_json(X.read(fs.readFileSync(path.join(dataDir,'iframe.xlsx'))).Sheets.ImageFrame,{header:1});
 const actors=X.utils.sheet_to_json(X.read(fs.readFileSync(path.join(dataDir,'story-schinese.xlsx'))).Sheets['#actor'],{header:1});
 const system=fs.readFileSync(path.join(gameDir,'js/nya/nya_game_system.js'),'utf8');
 const templateStart=system.indexOf('Game_BattleObject.template = function');
 assert.ok(templateStart>=0,'Original battle object table exists');
 const table=system.slice(templateStart);
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(outDir,'characters.js'),'utf8'),context,{timeout:1000});
 for(const m of mappings){const actor=actors.find(a=>a[0]===m.actor);assert.ok(actor,'Actor '+m.id);if(m.alias)assert.equal(actor[2],m.alias);if(!['plague-witch'].includes(m.id))assert.equal(actor[1],context.window.NYARURU_CHARACTERS.characters.find(c=>c.id===m.id).name);
 const objectStart=table.indexOf('"'+m.object+'":');assert.ok(objectStart>=0,'Battle object '+m.id);
 const objectEnd=table.indexOf('\n\t\t,',objectStart);const block=table.slice(objectStart,objectEnd<0?undefined:objectEnd);
 const standing=block.match(/standingImage\s*:\s*['"]([^'"]+)['"]/);assert.equal(standing&&standing[1],m.animation,'Original standing image: '+m.id);
 const row=rows.find(r=>r[0]===m.animation);assert.ok(row,'Animation '+m.animation);m.columns=row[1];m.rows=row[2];m.start=row[12]||0;m.resource='img/characters/'+encodeURIComponent(row[8]||m.animation)+'.png';m.portraitResource=m.alias?'img/artwork/'+m.alias+'/normal.png':null;}
 const allowed=mappings.flatMap(m=>[m.resource,m.portraitResource].filter(Boolean));
 const binaryHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(gameDir,'js/main.bin'))).digest('hex');
 fs.mkdirSync(path.join(outDir,'assets/characters'),{recursive:true});const base=path.join(project,'.qa/character-research');fs.mkdirSync(base,{recursive:true});const temporary=fs.mkdtempSync(path.join(base,'export-'));
 fs.writeFileSync(path.join(temporary,'job.json'),JSON.stringify({gameDir,outDir,binaryHash,mappings,allowed}));
 fs.writeFileSync(path.join(temporary,'package.json'),JSON.stringify({name:'wiki-offline-character-export',main:'index.html',window:{show:false},'chromium-args':'--disable-gpu --no-first-run --disable-background-networking'}));
 fs.writeFileSync(path.join(temporary,'index.html'),'<!doctype html><script>('+utility.toString()+')();</script>');
 const child=spawn(path.join(workspace,'修改器/nwjs-sdk-v0.64.1-win-x64/nw.exe'),['--disable-gpu','--user-data-dir='+path.join(temporary,'profile'),temporary],{cwd:temporary,windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{let timer=setTimeout(()=>{child.kill();reject(Error('Utility timed out'))},45000);child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',()=>{clearTimeout(timer);resolve()})});
 const result=JSON.parse(fs.readFileSync(path.join(temporary,'result.json'),'utf8'));if(!result.ok)throw Error(result.error);
 const manifest=JSON.parse(fs.readFileSync(path.join(outDir,'assets/characters/manifest.json'),'utf8'));for(const c of context.window.NYARURU_CHARACTERS.characters){const art=manifest.characters[c.id];c.pixel=art?.pixel||null;c.portrait=art?.portrait||null;}
 fs.writeFileSync(path.join(outDir,'characters.js'),'/* 人物文字按 CC BY-NC-SA 4.0 共享；原版游戏图片权利另计。 */\nwindow.NYARURU_CHARACTERS = '+JSON.stringify(context.window.NYARURU_CHARACTERS,null,2)+';\n');
 assert.ok(path.resolve(temporary).startsWith(path.resolve(base)+path.sep)&&path.basename(temporary).startsWith('export-'));fs.rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:200});
 console.log('Original character art exported: 15 pixel sprites, 13 portraits. No recoloring, game boot or saves.');
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1});

