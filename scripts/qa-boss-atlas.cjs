'use strict';
// Independent file:// QA. Own headless Edge profile; never attaches to the game.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL,fileURLToPath}=require('node:url');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'.qa'),edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const captureList=process.argv.find(a=>a.startsWith('--capture-list='))?.slice('--capture-list='.length);
const selectedCaptures=captureList?JSON.parse(fs.readFileSync(captureList,'utf8')):[];
const checkCombat=process.argv.includes('--combat');
assert.ok(Array.isArray(selectedCaptures)&&selectedCaptures.every(key=>typeof key==='string'&&/^[\w-]+\/[\w-]+$/.test(key)),'Capture list contains boss/attack keys');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(qa,{recursive:true});
const checks=[],issues=[],errors=[],browserWarnings=[],requests=[],screenshots=[],cancelledRequests=[],requestUrls=new Map();const contexts=new Map();let server;let child,socket,log='',id=0;const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id,t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},30000);pending.set(key,{resolve,reject,t});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression,options={}){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,...options});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function waitFor(expr){for(let i=0;i<100;i++){if(await evaluate(expr))return;await sleep(50);}const state=await evaluate('({hash:location.hash,title:document.querySelector("#move-title")?.textContent,attack:document.querySelector("#viewer-stage")?.dataset.attackId,ready:document.readyState})');throw Error('Timed out: '+expr+'; state='+JSON.stringify(state));}
async function suite(name,fn){try{const result=await fn();checks.push({name,ok:true,...(result||{})});console.log('PASS '+name);}catch(e){issues.push({name,error:String(e.stack||e)});console.log('FAIL '+name+': '+e.message);}}
async function click(selector){if(/data-(boss|attack|result)/.test(selector))await sleep(200);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`,{userGesture:true});}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(qa,name+'.png'),Buffer.from(r.data,'base64'));screenshots.push(name+'.png');}
async function key(key,code,virtualKey){const text=key==='Enter'?'\r':key===' '?' ':undefined;await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey,nativeVirtualKeyCode:virtualKey});}
// Pace automated navigation below browser flooding limits, as a person would navigate.
async function select(boss,attack){await sleep(200);await evaluate(`location.hash=${JSON.stringify('#'+boss+'/'+attack)}`,{userGesture:true});await waitFor(`location.hash===${JSON.stringify('#'+boss+'/'+attack)}&&document.querySelector('#viewer-stage').dataset.attackId===${JSON.stringify(attack)}`);await waitFor(`!document.querySelector('#stage-message').getClientRects().length`);}
async function overflow(){return evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.body.querySelectorAll('*')].filter(e=>e.getClientRects().length&&getComputedStyle(e).position!=='fixed').filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+2&&e.closest('#boss-nav')===null}).slice(0,8).map(e=>({tag:e.tagName,id:e.id,className:e.className,right:e.getBoundingClientRect().right}))})`);}
function localFile(src){const p=path.resolve(root,src);assert.ok(p.startsWith(root+path.sep),'Asset stays inside lab');assert.ok(fs.statSync(p).isFile(),'Asset exists '+src);return p;}

async function main(){
 const profile=fs.mkdtempSync(path.join(qa,'edge-profile-'));
 child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
 child.on('error',e=>log+=e.message);
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
 assert.ok(fs.existsSync(portFile),'Own Edge endpoint: '+log.slice(-1000));const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);assert.notEqual(port,9247);
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const target=targets.find(t=>t.type==='page'&&t.url==='about:blank');assert.ok(target,'Owned blank page');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.method==='Runtime.executionContextCreated'&&m.params.context.auxData?.isDefault)contexts.set(m.params.context.auxData.frameId,m.params.context.id);if(m.method==='Runtime.executionContextsCleared')contexts.clear();if(m.method==='Log.entryAdded')browserWarnings.push(m.params.entry);if(m.method==='Runtime.exceptionThrown')errors.push({type:'exception',details:m.params.exceptionDetails});if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push({type:'console',args:m.params.args.map(a=>a.value||a.description)});if(m.method==='Network.requestWillBeSent'){requests.push(m.params.request.url);requestUrls.set(m.params.requestId,m.params.request.url);}if(m.method==='Network.loadingFailed'){const failure={type:'network',details:m.params.errorText,url:requestUrls.get(m.params.requestId),cancelled:m.params.canceled};if(m.params.canceled&&m.params.errorText==='net::ERR_ABORTED')cancelledRequests.push(failure);else errors.push(failure);}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.t);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);};
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});

 server=require('./preview-server.js').createPreviewServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const origin='http://127.0.0.1:'+server.address().port;
 const childEvaluate=async expr=>{const tree=await send('Page.getFrameTree');const find=n=>n.frame.url.includes('/boss-atlas/index.html')?n.frame:(n.childFrames||[]).map(find).find(Boolean);const frame=find(tree.frameTree);assert.ok(frame,'Atlas child frame');const contextId=contexts.get(frame.id);assert.ok(contextId,'Atlas execution context');return evaluate(expr,{contextId});};
 const childWait=async expr=>{for(let i=0;i<100;i++){try{if(await childEvaluate(expr))return;}catch(e){if(i===99)throw e;}await sleep(100);}throw Error('Atlas timed out: '+expr)};
 const nav=async hash=>{await evaluate('location.hash='+JSON.stringify(hash));await sleep(150)};
 await send('Page.navigate',{url:origin+'/'});await waitFor('document.querySelector("#stat-items").textContent!=="—"');
 await suite('Original navigation and lazy Boss assets',async()=>{assert.equal(await evaluate('document.querySelectorAll(".sidebar nav [data-nav]").length'),9);assert.equal(await evaluate('document.querySelector("#boss-atlas-frame").hasAttribute("src")'),false);assert.equal(requests.some(u=>u.includes('/boss-atlas/')),false);});
 await nav('#bosses');await childWait('window.ATLAS_BOSSES&&document.querySelectorAll("[data-boss-choice]").length===18');
 await suite('Integrated portrait buttons and removed blocks',async()=>{const info=await childEvaluate('({embedded:document.body.classList.contains("embedded"),sidebar:getComputedStyle(document.querySelector(".sidebar")).display,select:!!document.querySelector("select"),removed:!!document.querySelector(".read-tip,.source-details,#move-tip,#move-source"),buttons:document.querySelectorAll("[data-boss-choice]").length})');assert.deepEqual(info,{embedded:true,sidebar:'none',select:false,removed:false,buttons:18});await childWait('[...document.querySelectorAll(".boss-avatar img")].every(i=>i.complete&&i.naturalWidth>0)');assert.equal(await evaluate('document.querySelector("#breadcrumb").textContent'),'Boss 档案');});
 await suite('All Boss portrait buttons select their own moves',async()=>{const bosses=await childEvaluate('ATLAS_BOSSES.encounters.map(b=>({id:b.id,name:b.name,moves:b.moves.length}))');for(const b of bosses){await sleep(200);await childEvaluate('document.querySelector('+JSON.stringify('[data-boss-choice="'+b.id+'"]').toString()+').click()');assert.equal(await childEvaluate('document.querySelector("#boss-name").textContent'),b.name);assert.equal(await childEvaluate('document.querySelectorAll("#move-grid button").length'),b.moves);assert.equal(await childEvaluate('document.querySelector("[data-boss-choice][aria-pressed=true]").dataset.bossChoice'),b.id);}return{bosses:bosses.length};});
 if(checkCombat){
  await suite('Release version and every Boss combat table',async()=>{
   assert.match(await evaluate('document.querySelector(".edition").textContent'),/0\.7\.0/);
   const info=await childEvaluate(`(()=>{
    const saved={...document.querySelector('#viewer-stage').dataset},data=ATLAS_COMBAT,failures=[];let moves=0,variants=0;
    for(const boss of ATLAS_BOSSES.encounters){
     const h=data.encounters[boss.id]?.health;if(!h){failures.push(boss.id+' missing health');continue;}
     const expectedVariants=h.variants.filter(v=>v.differs&&v.rows.length).length;
     for(const move of boss.moves){
      ATLAS_COMBAT_VIEW.render(boss.id,move.attackId);moves++;
      const panel=document.querySelector('#combat-stats');
      if(panel.dataset.ready!=='true'||panel.dataset.attackId!==move.attackId)failures.push(boss.id+'/'+move.attackId+' unavailable');
      if(panel.querySelectorAll('[data-health-variant]').length!==expectedVariants)failures.push(boss.id+' duplicate or missing challenge data');
      if(/undefined|NaN|Infinity|暂未载入/.test(panel.textContent))failures.push(boss.id+'/'+move.attackId+' invalid text');
      if([...panel.querySelectorAll('tbody tr')].some(r=>r.children.length!==5))failures.push(boss.id+'/'+move.attackId+' incomplete difficulty columns');
     }
     variants+=expectedVariants;
    }
    ATLAS_COMBAT_VIEW.render(saved.bossId,saved.attackId);
    return{version:data.version,difficulties:data.difficulties.map(d=>d.label),bosses:ATLAS_BOSSES.encounters.length,moves,variants,failures};
   })()`);
   assert.equal(info.version,'0.7.0');assert.deepEqual(info.difficulties,['简单','普通','困难','噩梦']);assert.equal(info.bosses,18);assert.equal(info.moves,152);assert.deepEqual(info.failures,[]);return info;
  });
  await suite('Combat stats follow real move selection on desktop and mobile',async()=>{
   for(const route of ['lily/lily_pan_attack','berries/berries_stage2','eliza/heart_laser_summon','plague-witch-rematch/irin2_copy_dash_summon_ex']){
    const [boss,attack]=route.split('/');await nav('#bosses/'+route);
    await childWait('document.querySelector("#combat-stats").dataset.bossId==='+JSON.stringify(boss)+'&&document.querySelector("#combat-stats").dataset.attackId==='+JSON.stringify(attack)+'&&document.querySelector("#combat-stats").dataset.ready==="true"');
    if(boss==='lily'){
     assert.deepEqual(await childEvaluate('[...document.querySelectorAll("[data-combat=health] > table tbody tr:first-child td")].map(e=>e.textContent)'),['475','475','475','475']);
     assert.deepEqual(await childEvaluate('[...document.querySelectorAll("[data-combat=damage] table tbody tr:first-child td")].map(e=>e.textContent)'),['19','19','19','19']);
     await childEvaluate('document.querySelector('+JSON.stringify('[data-damage-mode="challenge"]')+').click()');
     assert.deepEqual(await childEvaluate('[...document.querySelectorAll("[data-combat=damage] table tbody tr:first-child td")].map(e=>e.textContent)'),['26','26','26','26']);
     assert.equal(await childEvaluate('document.querySelector("#combat-stats").dataset.damageMode'),'challenge');
     await childEvaluate('document.querySelector('+JSON.stringify('[data-damage-mode="base"]')+').click()');
    }
    if(boss==='berries')assert.deepEqual(await childEvaluate('[...document.querySelectorAll("[data-combat=health] > table tbody tr:nth-child(2) td")].map(e=>e.textContent)'),['250','330','400','470']);
    await childEvaluate('document.querySelector("#combat-stats").scrollIntoView({block:"center",behavior:"instant"})');await screenshot('combat-'+boss);
   }
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
   const heaviest=await childEvaluate(`ATLAS_BOSSES.encounters.flatMap(b=>b.moves.map(m=>({boss:b.id,attack:m.attackId,size:JSON.stringify(ATLAS_COMBAT.encounters[b.id].health).length+JSON.stringify(ATLAS_COMBAT.encounters[b.id].moves[m.attackId]).length}))).sort((a,b)=>b.size-a.size)[0]`);
   await nav('#bosses/'+heaviest.boss+'/'+heaviest.attack);await childWait('document.querySelector("#combat-stats").dataset.attackId==='+JSON.stringify(heaviest.attack));
   await childEvaluate('document.querySelector("#combat-stats").scrollIntoView({block:"start",behavior:"instant"})');await sleep(150);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   assert.equal(await childEvaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
   assert.equal(await childEvaluate('[...document.querySelectorAll("#combat-stats th,#combat-stats td")].every(e=>e.getBoundingClientRect().right<=innerWidth+1)'),true);
   await screenshot('combat-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});return{routes:4,mobile:heaviest};
  });
 }
 await suite('Sakura horizontal barrage and GIF download',async()=>{await nav('#bosses/sakura/sakura_horizontal_paw');await childWait('document.querySelector("#viewer-stage").dataset.attackId==="sakura_horizontal_paw"');await childWait('document.querySelector("#capture-image").complete&&document.querySelector("#capture-image").naturalWidth>0');const info=await childEvaluate('({title:document.querySelector("#move-title").textContent,gif:document.querySelector("#download-capture-gif").getAttribute("href"),status:ATLAS_CAPTURES.sakura.moves.sakura_horizontal_paw.fullCapture.status,ticks:ATLAS_CAPTURES.sakura.moves.sakura_horizontal_paw.fullCapture.ticks})');assert.match(info.title,/横/);assert.match(info.gif,/sakura_horizontal_paw.*\.gif$/);assert.equal(info.status,'effects-observed');assert.ok(info.ticks>=1020);return info;});
 if(selectedCaptures.length){
  await suite('Updated captures: routes, every GIF frame, key pictures and downloads',async()=>{
   const results=[];
   for(const key of selectedCaptures){
    const [boss,attack]=key.split('/');await nav('#bosses/'+key);
    await childWait('document.querySelector("#viewer-stage").dataset.bossId==='+JSON.stringify(boss)+'&&document.querySelector("#viewer-stage").dataset.attackId==='+JSON.stringify(attack));
    await childWait('document.querySelector("#capture-image").complete&&document.querySelector("#capture-image").naturalWidth>0');
    const info=await childEvaluate(`(async()=>{
     const cap=ATLAS_CAPTURES[${JSON.stringify(boss)}].moves[${JSON.stringify(attack)}];
     const link=document.querySelector('#download-capture-gif');
     const response=await fetch(link.href);if(!response.ok)throw Error('GIF download failed');
     const decoder=new ImageDecoder({data:await response.arrayBuffer(),type:'image/gif'});await decoder.tracks.ready;
     const count=decoder.tracks.selectedTrack.frameCount;let duration=0;
     try{for(let index=0;index<count;index++){const {image}=await decoder.decode({frameIndex:index});if(!image.displayWidth||!image.displayHeight)throw Error('Empty frame '+index);duration+=image.duration;image.close();}}finally{decoder.close();}
     return{key:${JSON.stringify(key)},title:document.querySelector('#move-title').textContent,href:link.getAttribute('href'),expectedHref:cap.gif,playing:document.querySelector('#capture-image').getAttribute('src')===cap.gif,frames:count,expectedFrames:cap.fullCapture.frameCount,ticks:cap.fullCapture.ticks,durationSeconds:duration/1000000,keys:cap.frames.map(f=>typeof f==='string'?f:f.src||f.path||f.poster)};
    })()`);
    assert.equal(info.href,info.expectedHref);assert.equal(info.playing,true);assert.equal(info.frames,info.expectedFrames);assert.ok(Math.abs(info.durationSeconds-info.ticks/60)<0.02,'GIF duration matches capture');
    for(let index=0;index<info.keys.length;index++){
     await childEvaluate(`document.querySelector('[data-capture-frame="${index}"]').click()`);
     await childWait('document.querySelector("#capture-image").getAttribute("src")==='+JSON.stringify(info.keys[index])+'&&document.querySelector("#capture-image").complete&&document.querySelector("#capture-image").naturalWidth>0');
     assert.equal(await childEvaluate('document.querySelector("#download-capture").getAttribute("href")'),info.keys[index]);
    }
    await childEvaluate('document.querySelector('+JSON.stringify('[data-capture-frame="1"]')+').click()');
    await childWait('document.querySelector("#capture-image").complete&&document.querySelector("#capture-image").naturalWidth>0');
    await childEvaluate('document.querySelector("#viewer-stage").scrollIntoView({block:"center",behavior:"instant"})');await screenshot('boss-capture-'+boss+'--'+attack);
    results.push(info);
   }
   return{captures:results.length,decodedFrames:results.reduce((n,r)=>n+r.frames,0),results};
  });
  await nav('#bosses/sakura/sakura_horizontal_paw');await childWait('document.querySelector("#viewer-stage").dataset.attackId==="sakura_horizontal_paw"');
 }
 await suite('Desktop layout and auto height',async()=>{await evaluate('scrollTo(0,0)');await sleep(250);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);const size=await childEvaluate('({height:document.querySelector(".workspace").getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+1})');assert.equal(size.overflow,false);assert.ok(Math.abs(await evaluate('document.querySelector("#boss-atlas-frame").getBoundingClientRect().height')-size.height)<2);await screenshot('boss-atlas-desktop');await childEvaluate('document.querySelector("#viewer-stage").scrollIntoView({block:"center",behavior:"instant"})');await screenshot('boss-atlas-sakura');});
 await suite('Route survives reload and returning from other pages',async()=>{await send('Page.reload');await childWait('document.querySelector("#viewer-stage").dataset.attackId==="sakura_horizontal_paw"');assert.equal(await evaluate('location.hash'),'#bosses/sakura/sakura_horizontal_paw');await nav('#items');assert.equal(await evaluate('document.querySelector("#page-items").hidden'),false);assert.equal(await evaluate('document.querySelector("#page-bosses").hidden'),true);await nav('#bosses');await waitFor('location.hash==="#bosses/sakura/sakura_horizontal_paw"');});
 await suite('390px mobile portrait grid and viewer',async()=>{await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await evaluate('scrollTo(0,0)');await sleep(200);await screenshot('boss-atlas-mobile-diagnostic');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);assert.equal(await childEvaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,JSON.stringify(await childEvaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right}))})')));assert.equal(await childEvaluate('[...document.querySelectorAll("[data-boss-choice]")].every(b=>b.getBoundingClientRect().width>60)'),true);await screenshot('boss-atlas-mobile-top');await childEvaluate('document.querySelector("#boss-picker").scrollIntoView({block:"start",behavior:"instant"})');await screenshot('boss-atlas-mobile-buttons');await childEvaluate('document.querySelector("#viewer-stage").scrollIntoView({block:"start",behavior:"instant"})');await screenshot('boss-atlas-mobile-viewer');});
 await suite('Direct local Wiki opens the integrated Boss page',async()=>{await send('Page.navigate',{url:pathToFileURL(path.join(root,'dist/index.html')).href+'#bosses/sakura/sakura_horizontal_paw'});await childWait('document.querySelector("#viewer-stage").dataset.attackId==="sakura_horizontal_paw"');await childWait('document.querySelector("#capture-image").complete&&document.querySelector("#capture-image").naturalWidth>0');assert.equal(await evaluate('document.querySelector("#page-bosses").hidden'),false);});
 await suite('No browser errors or remote requests',async()=>{assert.deepEqual(errors,[]);assert.equal(requests.some(u=>/^https?:/.test(u)&&!u.startsWith(origin+'/')),false);});
 return{ok:issues.length===0,completedAt:new Date().toISOString(),checks,issues,errors,screenshots,browserClosed:true};
}
let report;
main().then(r=>{report=r;}).catch(e=>{report={ok:false,fatal:String(e.stack||e),checks,issues,errors,screenshots,browserLog:log.slice(-2000)};process.exitCode=1;}).finally(async()=>{try{if(socket?.readyState===WebSocket.OPEN)await send('Browser.close');}catch(_){}try{socket?.close();}catch(_){}if(server){server.closeAllConnections();server.close();}if(child&&child.exitCode===null)child.kill();for(const p of pending.values()){clearTimeout(p.t);}pending.clear();if(report){fs.writeFileSync(path.join(qa,'boss-atlas-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,checks:checks.length,issues:issues.map(i=>({name:i.name,error:i.error.split('\n')[0]})),screenshots}));if(!report.ok)process.exitCode=1;}});
