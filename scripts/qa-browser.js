'use strict';

// Zero-dependency browser checks. Uses an isolated headless Edge profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { createPreviewServer } = require('./preview-server');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.qa');
const edge = process.env.WIKI_EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
const pending = new Map();
const checks = [];
const networkRequests = [];
const syntheticFiles = [];
let browser, socket, server, nextId = 0, browserLog = '', browserExit = null;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(expression, context = '') {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error('Page condition timed out' + (context ? ' [' + context + ']' : '') + ': ' + expression);
}

async function capture(name) {
  await evaluate('if(document.querySelector("#toast"))document.querySelector("#toast").hidden=true');
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'));
}

async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}

async function setFile(selector, filename) {
  const document = await send('DOM.getDocument');
  const element = await send('DOM.querySelector', { nodeId:document.root.nodeId, selector });
  assert.ok(element.nodeId, 'File input exists: ' + selector);
  await send('DOM.setFileInputFiles', { nodeId:element.nodeId, files:[filename] });
}

async function checkBrandMaintainer(context) {
  const brand=await evaluate(`(() => {
    const sub=document.querySelector('.brand-sub');
    const note=document.querySelector('.brand-note');
    if(!sub||!note||note.textContent.trim()!=='非官方百科，由爱好者维护')return null;
    const r=note.getBoundingClientRect(),s=sub.getBoundingClientRect(),style=getComputedStyle(note);
    return {visible:note.getClientRects().length>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,
      width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,subBottom:s.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,
      fits:note.scrollWidth<=note.clientWidth+1};
  })()`);
  assert.ok(brand&&brand.visible&&brand.width>0&&brand.height>0,context+' maintainer notice visible');
  assert.ok(brand.top>=brand.subBottom-1&&brand.left>=0&&brand.right<=brand.viewportWidth+1&&brand.top<brand.viewportHeight&&brand.bottom>0&&brand.fits,
    context+' maintainer notice below brand subtitle and inside viewport without clipped text');
}

async function checkEndings(context, screenshot) {
  await waitFor('window.NYARURU_ENDINGS && document.querySelectorAll("#ending-grid .ending-card").length===5');
  assert.equal(await evaluate('document.querySelector("[data-nav=characters]").textContent.trim()'),'人物与剧情');
  assert.equal(await evaluate('document.querySelector("#characters-title").textContent.trim()'),'人物与剧情');
  assert.equal(await evaluate('document.querySelector("#breadcrumb").textContent.trim()'),'人物与剧情');
  assert.equal(await evaluate('location.hash'),'#characters');
  assert.equal(await evaluate(`!!(document.querySelector('#ending-grid').compareDocumentPosition(document.querySelector('#character-grid'))&Node.DOCUMENT_POSITION_FOLLOWING)`),true);
  const rows=await evaluate('NYARURU_ENDINGS.items.map(item=>({id:item.id,name:item.name}))');
  assert.deepEqual(rows.map(item=>item.id),['ED1','ED2','ED3','ED4','ED5']);
  assert.ok(rows.every(item=>typeof item.name==='string'&&item.name.length>0),'ending display names come from the public catalogue');
  const allConcealed=()=>evaluate(`[...document.querySelectorAll('#ending-grid .ending-card')].every(card=>{
    const panel=card.querySelector('.ending-details');return panel.hidden&&panel.childNodes.length===0;
  })`);
  assert.equal(await allConcealed(),true,context+' ending spoilers absent from initial DOM');
  assert.equal(await evaluate(`[...document.querySelectorAll('#ending-grid .ending-toggle')].every(button=>{
    const arrow=button.querySelector('svg.ending-chevron'),r=arrow?.getBoundingClientRect();
    return button.querySelector('.ending-action-label')?.textContent==='展开'&&r?.width>=12&&r?.height>=12;
  })`),true,context+' each closed ending has a visible arrow and explicit expand action');
  if(screenshot)await capture(screenshot+'-closed');
  assert.equal(await evaluate(`[...document.querySelectorAll('#ending-grid .ending-card')].every(card=>{
    const item=NYARURU_ENDINGS.items.find(row=>row.id===card.dataset.ending),image=card.querySelector('img');
    return item&&image&&image.getAttribute('src')===item.icon.src&&card.querySelector('.ending-heading strong').textContent===item.name&&
      !card.textContent.includes(item.trigger)&&!card.textContent.includes(item.summary)&&card.querySelectorAll('a').length===0;
  })`),true,context+' closed ending cards show only public names and original icons');
  await evaluate('document.querySelectorAll("#ending-grid img").forEach(image=>image.loading="eager")');
  await waitFor('[...document.querySelectorAll("#ending-grid img")].every(image=>image.complete&&image.naturalWidth>0)');
  assert.equal(await evaluate(`[...document.querySelectorAll('#ending-grid .ending-card')].every(card=>{
    const item=NYARURU_ENDINGS.items.find(row=>row.id===card.dataset.ending),image=card.querySelector('img');
    return image.naturalWidth===item.icon.width&&image.naturalHeight===item.icon.height;
  })`),true,context+' ending images decode at original dimensions');
  for(const [index,row] of rows.entries()) {
    await evaluate(`document.querySelector('[data-ending="${row.id}"] [data-ending-toggle]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-ending="${row.id}"] .ending-action-label').textContent`),'收起');
    assert.equal(await evaluate(`(() => {
      const item=NYARURU_ENDINGS.items.find(row=>row.id==='${row.id}'),card=document.querySelector('[data-ending="${row.id}"]'),panel=card.querySelector('.ending-details');
      const facts=[...panel.querySelectorAll('.ending-facts dd')].map(node=>node.textContent);
      return !panel.hidden&&panel.childElementCount>0&&facts.length===2&&facts[0]===item.trigger&&facts[1]===item.summary&&
        panel.textContent.includes(item.source.name)&&panel.textContent.includes(item.source.license)&&
        [...panel.querySelectorAll('a')].some(a=>a.getAttribute('href')===item.source.url)&&
        [...panel.querySelectorAll('a')].some(a=>a.getAttribute('href')===item.source.licenseUrl)&&
        [...document.querySelectorAll('#ending-grid .ending-card')].filter(other=>other!==card).every(other=>{
          const details=other.querySelector('.ending-details');return details.hidden&&details.childNodes.length===0;
        });
    })()`),true,context+' only selected ending reveals factual trigger, summary and attribution: '+row.id);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,context+' revealed ending causes no overflow');
    if(index===0&&screenshot){await evaluate('scrollTo(0,0)');await capture(screenshot);}
    await evaluate(`document.querySelector('[data-ending="${row.id}"] [data-ending-toggle]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-ending="${row.id}"] .ending-action-label').textContent`),'展开');
    assert.equal(await allConcealed(),true,context+' collapsing removes all spoiler DOM: '+row.id);
  }
  assert.equal(await evaluate('document.querySelectorAll("#character-grid .character-card").length'),16,'ending cards preserve the 16 character dossiers');
  checks.push(context+' story section: five original ending icons, empty concealed details, independent reversible reveal with factual text and source/license links');
}

async function checkAssistantCover(context) {
  await waitFor('document.querySelector(".assistant-cover img")?.complete && document.querySelector(".assistant-cover img").naturalWidth>0');
  const cover=await evaluate(`(() => {
    const image=document.querySelector('.assistant-cover img'),r=image.getBoundingClientRect(),style=getComputedStyle(image);
    return {src:image.getAttribute('src'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
      width:r.width,height:r.height,left:r.left,right:r.right,viewportWidth:innerWidth,fit:style.objectFit,
      visible:image.getClientRects().length>0&&style.visibility!=='hidden'&&style.display!=='none'};
  })()`);
  assert.equal(cover.src,'assets/brand/header.jpg');
  assert.equal(cover.naturalWidth,460);assert.equal(cover.naturalHeight,215);
  assert.ok(cover.visible&&cover.width>0&&cover.height>0&&cover.left>=0&&cover.right<=cover.viewportWidth+1,context+' assistant original cover visible');
  assert.ok(cover.fit!=='cover'&&(cover.fit==='contain'||Math.abs(cover.width/cover.height-460/215)<0.025),context+' assistant cover preserves full image without cropping');
}

async function checkGuidePages(origin) {
  const navigate=async url=>{await send('Page.navigate',{url});await waitFor(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`);};
  const click=async selector=>{
    const point=await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center',behavior:'instant'});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  };
  const images=()=>waitFor('[...document.images].filter(img=>img.getClientRects().length).every(img=>img.complete&&img.naturalWidth>0)');
  const fits=async label=>assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,label);
  const navigation=async()=>{
    const links=await evaluate(`[...document.querySelectorAll('.guide-nav a')].map(a=>({label:a.querySelector('span').textContent.trim(),target:new URL(a.href).pathname+new URL(a.href).hash}))`);
    assert.deepEqual(links,[{label:'世界地图',target:'/index.html#map'},{label:'物品图鉴',target:'/index.html#items'},
      {label:'全收集清单',target:'/index.html#collection'},{label:'人物与剧情',target:'/index.html#characters'},
      {label:'成就手册',target:'/index.html#achievements'},{label:'全能助手',target:'/index.html#assistant'},
      {label:'存档分析',target:'/index.html#save'},{label:'关于',target:'/index.html#about'}]);
  };
  const primaryAction=async label=>{
    const state=await evaluate(`(() => {
      const a=document.querySelector('.reader-heading-actions > a.primary');if(!a)return null;
      const r=a.getBoundingClientRect(),h=document.querySelector('h1').getBoundingClientRect(),s=getComputedStyle(a);
      const lum=value=>{const rgb=value.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
      const bg=lum(s.backgroundColor),fg=lum(s.color);
      return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,headingBottom:h.bottom,
        font:parseFloat(s.fontSize),viewportWidth:innerWidth,viewportHeight:innerHeight,background:s.backgroundColor,
        visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0,contrast:(Math.max(bg,fg)+0.05)/(Math.min(bg,fg)+0.05)};
    })()`);
    assert.ok(state&&state.visible&&state.width>=110&&state.height>=44&&state.font>=14,label+' main action is a substantial readable button');
    assert.ok(state.left>=0&&state.right<=state.viewportWidth+1&&state.top>=state.headingBottom&&state.top<state.viewportHeight,label+' main action is below heading and visible without horizontal scrolling');
    assert.ok(!/rgba\([^)]*,\s*0\)/.test(state.background)&&state.contrast>=3,label+' primary action has an opaque contrasting background');
  };
  await viewport(1440,1000);await navigate(origin+'/index.html');
  await waitFor('window.NYARURU_DATA&&window.NYARURU_CHARACTERS&&window.NYARURU_ACHIEVEMENTS');
  const sample=await evaluate(`(() => {const source=NYARURU_DATA.locations.find(row=>row.official&&row.cellKey);return {source,item:NYARURU_DATA.items.find(row=>row.key===source.itemKey),character:NYARURU_CHARACTERS.characters.find(row=>row.identitySpoiler),achievement:NYARURU_ACHIEVEMENTS.items.find(row=>row.hidden),regionCells:NYARURU_DATA.cells.filter(cell=>cell.regionId===source.regionId).map(cell=>({key:cell.key,x:cell.x,y:cell.y})),regions:NYARURU_DATA.regions.map(region=>({id:region.id,cells:NYARURU_DATA.cells.filter(cell=>cell.regionId===region.id).length})),progress:localStorage.getItem('nyaruru-wiki.collection.v1')};})()`);
  const itemPath='guide/items/'+sample.item.key.replace(':','-')+'.html';
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  try{
    await navigate(origin+'/guide/index.html');
    assert.ok(await evaluate('document.querySelector("h1").textContent.trim().length>0'));
    assert.equal(await evaluate('document.scripts.length'),0);assert.equal(await evaluate('typeof window.NYARURU_DATA'),'undefined');
    await images();assert.ok(await evaluate('document.styleSheets.length>0'));await navigation();await primaryAction('Desktop guide');await capture('desktop-guide');
    await navigate(origin+'/guide/regions/index.html');await navigation();await primaryAction('Desktop regions');
    const previews=await evaluate(`[...document.querySelectorAll('.region-card[data-region-id]')].map(card=>{
      const svg=card.querySelector('svg.region-preview'),r=svg.getBoundingClientRect(),cells=[...svg.querySelectorAll('.region-cell')];
      return {id:Number(card.dataset.regionId),count:cells.length,width:r.width,height:r.height,visible:cells.every(cell=>getComputedStyle(cell).fill!=='none'),href:card.querySelector('.region-preview-link').href};
    })`);
    assert.equal(previews.length,16,'all 16 regional maps are previewed');
    for(const preview of previews){assert.equal(preview.count,sample.regions.find(region=>region.id===preview.id).cells);assert.ok(preview.width>=150&&preview.height>=120&&preview.visible,'regional map has visible grid cells');assert.equal(new URL(preview.href).searchParams.get('region'),String(preview.id));}
    const layout=await evaluate(`[...document.querySelectorAll('.region-card[data-region-id="${sample.source.regionId}"] .region-cell')].map(cell=>({key:cell.dataset.cellKey,x:Number(cell.getAttribute('x')),y:Number(cell.getAttribute('y'))}))`);
    const first=layout[0],reference=sample.regionCells.find(cell=>cell.key===first.key);
    assert.ok(layout.every(cell=>{const actual=sample.regionCells.find(row=>row.key===cell.key);return actual&&Math.sign(cell.x-first.x)===Math.sign(actual.x-reference.x)&&Math.sign(cell.y-first.y)===Math.sign(actual.y-reference.y);}), 'preview preserves the real relative map grid layout');
    await capture('desktop-guide-regions');
    await navigate(origin+'/guide/regions/'+sample.source.regionId+'.html');await primaryAction('Desktop region');await capture('desktop-guide-region');
    await navigate(origin+'/guide/characters/index.html');await images();await navigation();await primaryAction('Desktop story guide');
    assert.match(await evaluate('document.querySelector(".reader-heading-actions > a.primary").textContent'),/完整版.*人物与剧情/);
    await capture('desktop-guide-story');
    for(const part of ['image','blank']){
      await navigate(origin+'/guide/characters/index.html');await images();
      assert.equal(await evaluate('document.querySelectorAll(".ending-reader-grid > a.reader-card-link").length'),5);
      const point=await evaluate(`(() => {
        const card=document.querySelector('.ending-reader-grid > a.reader-card-link');card.scrollIntoView({block:'center',behavior:'instant'});
        const r=(${JSON.stringify(part)}==='image'?card.querySelector('img'):card).getBoundingClientRect();
        return ${JSON.stringify(part)}==='image'?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:r.right-10,y:r.top+10};
      })()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      await waitFor('location.pathname==="/index.html"&&new URLSearchParams(location.search).get("ending")==="ED1"&&location.hash==="#characters"');
    }
    await navigate(origin+'/guide/endings/ed1.html');
    assert.equal(await evaluate('document.querySelector("details.spoiler-details").open'),false);
    assert.equal(await evaluate('!!document.querySelector("details.spoiler-details").closest("div[data-nosnippet],span[data-nosnippet],section[data-nosnippet]") || !!document.querySelector("details.spoiler-details div[data-nosnippet],details.spoiler-details span[data-nosnippet],details.spoiler-details section[data-nosnippet]")'),true,'spoiler text uses supported nosnippet container');
    await click('details.spoiler-details summary');
    assert.equal(await evaluate('document.querySelector("details.spoiler-details").open'),true,'native ending expands without JavaScript');
    assert.ok(await evaluate('document.querySelector("details.spoiler-details").innerText.length>50'));
    await click('details.spoiler-details summary');assert.equal(await evaluate('document.querySelector("details.spoiler-details").open'),false);
    await navigate(origin+'/'+itemPath);await images();assert.ok(await evaluate('document.styleSheets.length>0'));await fits('nested static item fits desktop');await primaryAction('Desktop item');await capture('desktop-guide-item');
    await viewport(390,844,true);
    for(const page of ['guide/index.html','guide/regions/index.html','guide/regions/'+sample.source.regionId+'.html',itemPath,'guide/characters/index.html','guide/endings/ed1.html']){
      await navigate(origin+'/'+page);await fits('mobile '+page);await navigation();await primaryAction('Mobile '+page);
      if(page.endsWith('/ed1.html')){await click('details.spoiler-details summary');await fits('expanded mobile ending');}
      if(page==='guide/index.html')await capture('mobile-guide');
      if(page===itemPath)await capture('mobile-guide-item');
      if(page==='guide/regions/index.html')await capture('mobile-guide-regions');
      if(page==='guide/characters/index.html'){await images();await capture('mobile-guide-story');}
    }
  }finally{await send('Emulation.setScriptExecutionDisabled',{value:false});}
  checks.push('Static guides work without JavaScript: nested assets/styles, native reversible spoilers and desktop/mobile layouts');
  checks.push('Static navigation matches the eight tools; desktop/mobile primary actions are visible, sized and contrasting; all 16 SVG previews preserve regional grids');
  checks.push('Static ending artwork and blank card space link directly to the full app without an intermediate guide page or source-page JavaScript');
  await viewport(1440,1000);
  for(const key of ['map','items','collection','characters','achievements','assistant','save','about']){
    await navigate(origin+'/guide/characters/index.html');await click('.guide-nav [data-nav="'+key+'"]');
    await waitFor(`location.pathname==='/index.html'&&location.hash==='#${key}'&&window.NYARURU_DATA&&!document.querySelector('#page-${key}').hidden`);
    assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
  }
  await navigate(origin+'/guide/characters/index.html');await click('.reader-heading-actions > a.primary');
  await waitFor('location.pathname==="/index.html"&&location.hash==="#characters"&&document.querySelectorAll("#ending-grid .ending-card").length===5');
  assert.equal(await evaluate('[...document.querySelectorAll("#ending-grid .ending-details")].every(panel=>panel.hidden&&panel.childNodes.length===0)'),true);
  checks.push('All eight static sidebar links and the clearly labelled full-version story button open the matching full app view without changing progress or revealing endings');
  for(const [index,id]of ['ED1','ED2','ED3','ED4','ED5'].entries()){
    await navigate(origin+'/guide/characters/index.html');await click('.ending-reader-grid > a:nth-child('+(index+1)+')');
    await waitFor(`window.NYARURU_ENDINGS&&document.activeElement?.dataset.ending==='${id}'&&document.querySelector('[data-ending="${id}"] [data-ending-toggle]').getAttribute('aria-expanded')==='true'`);
    assert.equal(await evaluate(`(() => {
      const panels=[...document.querySelectorAll('#ending-grid .ending-details')],card=document.querySelector('[data-ending="${id}"]'),entry=NYARURU_ENDINGS.items.find(row=>row.id==='${id}');
      return panels.filter(panel=>!panel.hidden&&panel.childNodes.length>0).length===1&&card.textContent.includes(entry.trigger)&&card.textContent.includes(entry.summary)&&
        [...document.querySelectorAll('.character-spoilers')].every(panel=>panel.hidden&&panel.childNodes.length===0);
    })()`),true,'only the clicked ending expands, with original facts and character spoilers concealed');
    assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
    if(index===0)await capture('desktop-guide-ending-open');
  }
  await navigate(origin+'/guide/endings/ed1.html');await click('.reader-heading-actions > a.primary');
  await waitFor('document.activeElement?.dataset.ending==="ED1"&&document.querySelector("[data-ending=ED1] [data-ending-toggle]").getAttribute("aria-expanded")==="true"');
  checks.push('All five ending cards directly locate and expand only their own ending in the full app; legacy guide detail buttons use the same target and preserve progress');
  await navigate(origin+'/guide/characters/index.html');
  const characterTargets=await evaluate(`[...document.querySelectorAll('.character-reader-grid > a')].map(a=>new URL(a.href).searchParams.get('character'))`);
  assert.equal(characterTargets.length,16);
  for(const [index,id]of characterTargets.entries()){
    await navigate(origin+'/guide/characters/index.html');await click('.character-reader-grid > a:nth-child('+(index+1)+') .reader-card-cta');
    await waitFor(`window.NYARURU_CHARACTERS&&document.activeElement?.dataset.character===${JSON.stringify(id)}`);
    assert.equal(await evaluate(`[...document.querySelectorAll('.character-spoilers,.ending-details')].every(panel=>panel.hidden&&panel.childNodes.length===0)`),true,'character navigation never reveals character or ending spoilers');
    assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
    if(index===0)await capture('desktop-guide-character-target');
  }
  checks.push('All 16 static character cards open and focus their complete dossier while every character spoiler and ending remains concealed and progress is unchanged');
  await viewport(1440,1000);await navigate(origin+'/guide/regions/index.html');
  await click('.region-card[data-region-id="'+sample.source.regionId+'"] .region-preview-link');
  await waitFor(`window.NYARURU_DATA&&!document.querySelector('#page-map').hidden&&document.querySelector('#map-region').value==='${sample.source.regionId}'`);
  assert.equal(await evaluate('document.querySelectorAll("#map-drawing [data-cell]").length'),sample.regionCells.length);
  assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
  await navigate(origin+'/guide/regions/'+sample.source.regionId+'.html');await click('.reader-heading-actions > a.primary');
  await waitFor(`window.NYARURU_DATA&&document.querySelector('#map-region').value==='${sample.source.regionId}'`);
  assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
  checks.push('Regional preview and region-detail primary action both open the intended map region without changing progress');
  await viewport(1440,1000);await navigate(origin+'/'+itemPath);
  const mainSource=await evaluate(`new URL(document.querySelector('.reader-heading-actions > a.primary').href).searchParams.get('source')`);
  assert.ok(mainSource,'item main action provides a concrete source location');
  await click('.reader-heading-actions > a.primary');
  await waitFor(`window.NYARURU_DATA&&!document.querySelector('#page-map').hidden&&document.querySelector('#map-drawing [data-cell].selected')`);
  assert.equal(await evaluate(`document.querySelector('#map-drawing [data-cell].selected').dataset.cell===NYARURU_DATA.locations.find(row=>row.key===${JSON.stringify(mainSource)}).cellKey`),true);
  assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
  await navigate(origin+'/'+itemPath);
  await click('.reader-location a[href*="?source='+encodeURIComponent(sample.source.key)+'"]');
  await waitFor(`window.NYARURU_DATA&&!document.querySelector('#page-map').hidden&&!!document.querySelector('[data-cell="${sample.source.cellKey}"].selected')`);
  assert.equal(await evaluate('document.querySelector("#map-page").value'),String(sample.source.page));
  assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
  await navigate(origin+'/'+itemPath);await click('a[href*="?item="]');
  await waitFor('window.NYARURU_DATA&&document.querySelector("#item-dialog")?.open');
  assert.ok(await evaluate(`document.querySelector('#item-dialog').textContent.includes(${JSON.stringify(sample.item.name)})`));
  checks.push('Static item links open the exact source map cell and item dialog without changing collection progress');
  await navigate(origin+'/index.html?character='+encodeURIComponent(sample.character.id)+'#characters');
  await waitFor('window.NYARURU_DATA&&!document.querySelector("#page-characters").hidden');
  assert.equal(await evaluate(`document.querySelector('[data-character="${sample.character.id}"] .character-spoilers').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('[data-character="${sample.character.id}"] .character-spoilers').childElementCount`),0);
  await click('[data-nav=map]');await waitFor('!document.querySelector("#page-map").hidden&&document.querySelectorAll("#map-drawing [data-cell]").length>0');await sleep(200);
  assert.equal(await evaluate(`(() => {const map=document.querySelector('#map-svg').getBoundingClientRect(),r=document.querySelector('#map-drawing').getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=map.left-2&&r.right<=map.right+2&&r.top>=map.top-2&&r.bottom<=map.bottom+2;})()`),true,'first map after character deep link fits');
  await navigate(origin+'/index.html?achievement='+encodeURIComponent(sample.achievement.id)+'#achievements');
  await waitFor('window.NYARURU_DATA&&!document.querySelector("#page-achievements").hidden');
  assert.equal(await evaluate(`document.querySelector('[data-achievement="${sample.achievement.id}"] [data-achievement-toggle]').getAttribute('aria-expanded')`),'false');
  for(const query of ['source=not-a-source','item=not-an-item','item=weapons%3A0&region=6','region=6&region=7','ending=not-an-ending','ending=ED1&ending=ED2','ending=ED1&character='+encodeURIComponent(sample.character.id)]){
    await navigate(origin+'/index.html?'+query+'#map');await waitFor('window.NYARURU_DATA&&document.querySelector("#toast").textContent.includes("暂时无法定位")');
    assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),sample.progress);
  }
  checks.push('Deep links preserve character/achievement spoilers, fit the first map view and safely reject invalid/conflicting parameters');
  await navigate(pathToFileURL(path.join(root,'dist',itemPath)).href);await images();assert.ok(await evaluate('document.styleSheets.length>0&&document.querySelector("h1").textContent.length>0'));
  await click('a[href*="?item="]');await waitFor('location.protocol==="file:"&&window.NYARURU_DATA&&document.querySelector("#item-dialog")?.open');
  await navigate(pathToFileURL(path.join(root,'dist/guide/endings/index.html')).href);await click('.ending-reader-grid > a:first-child');
  await waitFor('location.protocol==="file:"&&document.activeElement?.dataset.ending==="ED1"&&document.querySelector("[data-ending=ED1] [data-ending-toggle]").getAttribute("aria-expanded")==="true"');
  await viewport(390,844,true);await navigate(origin+'/guide/endings/index.html');await click('.ending-reader-grid > a:first-child');
  await waitFor('document.activeElement?.dataset.ending==="ED1"&&document.querySelector("[data-ending=ED1] [data-ending-toggle]").getAttribute("aria-expanded")==="true"');
  await fits('mobile directly expanded ending');await capture('mobile-guide-ending-open');
  checks.push('Direct file:// guides open the item dialog and the selected ending; mobile ending links expand and focus the target without overflow');
}

async function checkLocalSave(origin, view, storage, alreadyCompleted) {
  const { makeFixture, fixtureData } = require('./check-save-parser');
  const officialKeys = await evaluate('[...new Set(NYARURU_DATA.locations.filter(row=>row.official).map(row=>row.collectionKey))]');
  const key = officialKeys.find(value=>!alreadyCompleted.has(value));
  const falseKey = officialKeys.find(value=>value!==key && !alreadyCompleted.has(value));
  const fixture = fixtureData();
  fixture.map._mapId = Number(key.split(':')[0]);
  fixture.selfSwitches._data = { [key.replace(':',',')+',A']:true, [falseKey.replace(':',',')+',A']:false };
  const bytes = makeFixture(fixture);
  const validFile = path.join(artifacts, 'synthetic-save.rmmzsave');
  const invalidFile = path.join(artifacts, 'invalid-save.rmmzsave');
  const oversizedFile = path.join(artifacts, 'oversized-save.rmmzsave');
  fs.writeFileSync(validFile, bytes);
  fs.writeFileSync(invalidFile, Buffer.from('not a game save'));
  fs.writeFileSync(oversizedFile, Buffer.alloc(4*1024*1024+1));
  await view('save');
  const storedBefore = await storage();
  const storageKeysBefore = await evaluate('Object.keys(localStorage).sort()');
  const requestsBefore = networkRequests.length;
  await setFile('#save-file', validFile);
  await waitFor('document.querySelector("#save-status").textContent.includes("解析完成")');
  assert.equal(await evaluate('document.querySelector("#save-preview").hidden'), false);
  assert.match(await evaluate('document.querySelector("#save-summary").textContent'), /1234/);
  assert.match(await evaluate('document.querySelector("#save-summary").textContent'), /01:02:03/);
  assert.equal(await evaluate('document.querySelector("#save-merge").disabled'), false);
  assert.deepEqual(await storage(), storedBefore, 'Parsing does not change the manual checklist');
  assert.deepEqual(await evaluate('Object.keys(localStorage).sort()'), storageKeysBefore, 'Raw save is not persisted');
  assert.doesNotMatch(await evaluate('document.querySelector("#save-preview").textContent'), /SYNTHETIC_PRIVATE_NAME|SYNTHETIC_PRIVATE_ACCOUNT|saveScriptExecuted/);
  assert.equal(await evaluate('globalThis.saveScriptExecuted'), undefined);
  assert.ok(await evaluate('document.querySelectorAll("#save-inventory [data-item]").length > 0'));
  assert.match(await evaluate('document.querySelector("#save-coverage").textContent'), /未能确定/);
  await capture('desktop-save');
  const fileRequests = networkRequests.slice(requestsBefore);
  assert.ok(fileRequests.every(request=>request.method==='GET' && !request.hasPostData && request.url.startsWith(origin+'/assets/') && !new URL(request.url).search), 'File analysis triggers no upload or query transmission');
  await evaluate('document.querySelector("#save-merge").click()');
  const merged = await storage();
  assert.deepEqual(new Set(merged.completed), new Set([...alreadyCompleted,key]));
  assert.equal(await evaluate('document.querySelector("#save-merge").disabled'), true);
  await evaluate('document.querySelector("#save-clear").click()');
  assert.equal(await evaluate('document.querySelector("#save-preview").hidden'), true);
  assert.deepEqual(await storage(), merged);
  await setFile('#save-file', invalidFile);
  await waitFor('document.querySelector("#save-status").textContent.includes("未能解析")');
  assert.equal(await evaluate('document.querySelector("#save-preview").hidden'), true);
  assert.equal(await evaluate('document.querySelector("#save-merge").disabled'), true);
  assert.deepEqual(await storage(), merged);
  await setFile('#save-file', oversizedFile);
  await waitFor('document.querySelector("#save-status").textContent.includes("4 MiB")');
  assert.equal(await evaluate('document.querySelector("#save-preview").hidden'), true);
  assert.equal(await evaluate('document.querySelector("#save-merge").disabled'), true);
  await setFile('#save-file', validFile);
  await setFile('#save-file', invalidFile);
  await waitFor('document.querySelector("#save-status").textContent.includes("未能解析")');
  await sleep(250);
  assert.equal(await evaluate('document.querySelector("#save-preview").hidden'), true, 'Stale parsing cannot restore the prior preview');
  assert.deepEqual(fs.readFileSync(validFile), Buffer.from(bytes), 'Original selected file is unchanged');
  checks.push('Local save selection: no upload or raw persistence, white-list summary, explicit merge, corrupt/oversized/racing selections safe');
  return { validFile, key };
}

async function checkAchievements(origin, view, control, saveTest) {
  const { makeSteamFixture, makeNativeFixture, binaryFixture } = require('./check-achievement-parser');
  const { makeFixture } = require('./check-save-parser');
  const steam = makeSteamFixture(), native = makeNativeFixture();
  const directory = path.join(artifacts, 'synthetic-achievements');
  const write = (folder, filename, bytes) => {
    const target = path.join(directory, folder);
    fs.mkdirSync(target, {recursive:true});
    const filenamePath = path.join(target, filename);
    fs.writeFileSync(filenamePath, bytes);
    return filenamePath;
  };
  const steamFile = write('valid', steam.filename, steam.bytes);
  const nativeFile = write('native', native.filename, native.bytes);
  const partialFile = write('partial', steam.filename, binaryFixture({cache:{1:{data:0}}}));
  const invalidFile = write('invalid', steam.filename, Buffer.from('not a Steam cache'));
  const oversizedFile = write('oversized', steam.filename, Buffer.alloc(4*1024*1024+1));
  const wrongNameFile = write('wrong-game', 'UserGameStats_123456_999.bin', steam.bytes);
  const privateFile = write('privacy', native.filename, makeFixture({_version:1,bgmVolume:80,
    _achievementNative:{N1:true,HIDDEN1:true},unrelated:{account:'SYNTHETIC_PRIVATE_ACCOUNT',name:'SYNTHETIC_PRIVATE_NAME',
      script:'globalThis.achievementScriptExecuted=true',html:'<img src=x onerror="globalThis.achievementScriptExecuted=true">'}}));
  const originals = new Map([steamFile,nativeFile,partialFile,invalidFile,oversizedFile,wrongNameFile,privateFile].map(file=>[file,fs.readFileSync(file)]));
  const snapshotStorage = () => evaluate('JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])))');
  const storedBefore = await snapshotStorage(), requestsBefore = networkRequests.length;
  const counts = () => evaluate(`Object.fromEntries(['reference','unlocked','locked','unknown'].map(status=>[status,document.querySelectorAll('#achievement-grid [data-status="'+status+'"]').length]))`);
  const assertCounts = async (unlocked, locked, unknown, reference = 0) => assert.deepEqual(await counts(), {reference,unlocked,locked,unknown});
  const isReference = async () => {
    await assertCounts(0,0,0,32);
    assert.equal(await evaluate('document.querySelector("#achievement-filter").disabled'), true);
  };
  const select = async (source, file) => {
    await control('#achievement-source', source);
    await setFile('#achievement-file', file);
    await waitFor('document.querySelector("#achievement-status").textContent.includes("状态来源")');
  };
  await view('achievements');
  await isReference();
  assert.equal(await evaluate('document.querySelectorAll("#achievement-grid .achievement-card").length'), 32);
  assert.equal(await evaluate('document.querySelectorAll("#achievement-grid .achievement-icon").length'), 15);
  assert.equal(await evaluate('document.querySelectorAll("#achievement-grid .concealed").length'), 17);
  assert.equal(await evaluate(`NYARURU_ACHIEVEMENTS.items.filter(item=>item.hidden||item.spoiler).every(item=>{
    const card=document.querySelector('[data-achievement="'+item.id+'"]');
    return !card.querySelector('img')&&!card.textContent.includes(item.name)&&(!item.desc||!card.textContent.includes(item.desc))&&!card.innerHTML.includes(item.icon.src);
  })`), true, 'Hidden names, descriptions and image sources never enter collapsed cards');
  assert.equal(await evaluate('[...document.querySelectorAll("#achievement-grid .achievement-icon")].every(image=>getComputedStyle(image).filter==="none"&&image.getBoundingClientRect().width===96)'), true);
  await evaluate('document.querySelectorAll("#achievement-grid img").forEach(image=>image.loading="eager")');
  await waitFor('[...document.querySelectorAll("#achievement-grid img")].every(image=>image.complete&&image.naturalWidth===128)');
  const hiddenItem = await evaluate('NYARURU_ACHIEVEMENTS.items.find(item=>item.hidden)');
  await control('#achievement-search', hiddenItem.name, 'input');
  assert.equal(await evaluate(`!!document.querySelector('[data-achievement="${hiddenItem.id}"]')`), false, 'Search cannot reveal a concealed real name');
  await control('#achievement-search', '', 'input');
  await evaluate(`document.querySelector('[data-achievement-toggle="${hiddenItem.id}"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-achievement="${hiddenItem.id}"] .achievement-details h2').textContent`), hiddenItem.name);
  assert.equal(await evaluate(`document.querySelector('[data-achievement="${hiddenItem.id}"] .achievement-icon').getAttribute('src')`), hiddenItem.icon.src);
  await control('#achievement-search', hiddenItem.name, 'input');
  assert.equal(await evaluate(`!!document.querySelector('[data-achievement="${hiddenItem.id}"]')`), true);
  await control('#achievement-search', '', 'input');
  await evaluate(`document.querySelector('[data-achievement-toggle="${hiddenItem.id}"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-achievement="${hiddenItem.id}"] .achievement-details').childElementCount`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-achievement="${hiddenItem.id}"] img').length`), 0);
  await capture('desktop-achievements');
  checks.push('Achievement reference: 32 cards, 15 original 96px color icons, 17 concealed cards, no secret search leak and reversible reveal');

  await select('steam',steamFile);
  await assertCounts(3,29,0);
  assert.match(await evaluate('document.querySelector("#achievement-status").textContent'), /Steam 本地缓存/);
  assert.equal(await evaluate('[...document.querySelectorAll(".status-locked .achievement-icon")].every(image=>getComputedStyle(image).filter.includes("grayscale"))'), true);
  assert.equal(await evaluate('[...document.querySelectorAll(".status-unlocked .achievement-icon")].every(image=>getComputedStyle(image).filter==="none")'), true);
  for (const [filter,count] of [['unlocked',3],['locked',29],['unknown',0]]) {
    await control('#achievement-filter',filter);
    assert.equal(await evaluate('document.querySelectorAll("#achievement-grid .achievement-card").length'),count);
  }
  await control('#achievement-filter','all');
  await select('steam',partialFile);
  await assertCounts(0,29,3);
  await select('native',nativeFile);
  await assertCounts(2,30,0);
  assert.match(await evaluate('document.querySelector("#achievement-status").textContent'), /非 Steam 本地成就/);
  await select('native',privateFile);
  await assertCounts(2,30,0);
  assert.doesNotMatch(await evaluate('document.body.innerText'), /SYNTHETIC_PRIVATE|achievementScriptExecuted|123456/);
  assert.equal(await evaluate('globalThis.achievementScriptExecuted'), undefined);
  await setFile('#achievement-file',saveTest.validFile);
  await waitFor('document.querySelector("#achievement-status").textContent.includes("未能读取")');
  await isReference();
  await control('#achievement-source','steam');
  await isReference();
  for (const [file,pattern] of [[invalidFile,'未能读取'],[wrongNameFile,'未能读取'],[oversizedFile,'4 MiB']]) {
    await select('steam',steamFile);
    await setFile('#achievement-file',file);
    await waitFor(`document.querySelector('#achievement-status').textContent.includes(${JSON.stringify(pattern)})`);
    await isReference();
  }
  await select('steam',steamFile);
  await evaluate('document.querySelector("#achievement-clear").click()');
  await isReference();
  await view('save');
  await setFile('#save-file',saveTest.validFile);
  await waitFor('document.querySelector("#save-status").textContent.includes("解析完成")');
  await assertCounts(0,0,32);
  await evaluate('document.querySelector("#save-clear").click()');
  await isReference();
  await select('steam',steamFile);
  await setFile('#save-file',path.join(artifacts,'invalid-save.rmmzsave'));
  await waitFor('document.querySelector("#save-status").textContent.includes("未能解析")');
  await isReference();
  checks.push('Steam/native/partial/slot statuses: 3+29, 2+30, 29+3 unknown and slot 32 unknown; filters, source changes, invalid/oversized files and clears remove stale state');

  // Hold parser promises explicitly so completion order is deterministic, independent of machine speed.
  const deferParser = async kind => evaluate(`(() => {
    const globalName=${JSON.stringify(kind==='steam'?'NYARURU_ACHIEVEMENT_PARSE':'NYARURU_SAVE')}, method=${JSON.stringify(kind==='steam'?'parseSteam':'parse')};
    const original=window[globalName];
    let holdNext=true;
    window.__qaOriginalParser=original;
    window.__qaDeferredRelease=null;
    window[globalName]={...original,[method](...args){if(!holdNext)return original[method](...args);holdNext=false;return new Promise(resolve=>{
      window.__qaDeferredRelease=()=>Promise.resolve(original[method](...args)).then(resolve);
    });}};
    window.__qaRestoreParser=()=>{window[globalName]=original;};
  })()`);
  const finishDeferred = async () => {
    await evaluate('window.__qaRestoreParser();window.__qaDeferredRelease();undefined');
    await sleep(150);
  };
  await view('achievements');
  for (const action of ['clear','switch','new-source','save-clear','invalid']) {
    await control('#achievement-source','steam');
    await deferParser('steam');
    await setFile('#achievement-file',steamFile);
    await waitFor('typeof window.__qaDeferredRelease==="function"', 'Steam race: ' + action);
    if (action==='clear') await evaluate('document.querySelector("#achievement-clear").click()');
    if (action==='switch') await control('#achievement-source','native');
    if (action==='new-source') await select('native',nativeFile);
    if (action==='save-clear') await evaluate('document.querySelector("#save-clear").click()');
    if (action==='invalid') {
      await setFile('#achievement-file',invalidFile);
      await waitFor('document.querySelector("#achievement-status").textContent.includes("未能读取")');
    }
    await finishDeferred();
    if (action==='new-source') await assertCounts(2,30,0); else await isReference();
  }
  for (const action of ['clear','new-source','new-source-failure']) {
    await deferParser('slot');
    await evaluate('document.querySelector("#save-file").value=""');
    await setFile('#save-file',action==='new-source-failure'?path.join(artifacts,'invalid-save.rmmzsave'):saveTest.validFile);
    await waitFor('typeof window.__qaDeferredRelease==="function"', 'Slot race: ' + action);
    if (action==='clear') await evaluate('document.querySelector("#achievement-clear").click()');
    else await select('native',nativeFile);
    await finishDeferred();
    await waitFor(`document.querySelector('#save-status').textContent.includes(${JSON.stringify(action==='new-source-failure'?'未能解析':'解析完成')})`);
    if (action!=='clear') await assertCounts(2,30,0); else await isReference();
  }
  await evaluate('delete window.__qaOriginalParser;delete window.__qaDeferredRelease;delete window.__qaRestoreParser');
  await view('achievements');
  assert.equal(await snapshotStorage(),storedBefore,'Achievement files do not change any localStorage key/value');
  assert.doesNotMatch(await evaluate('document.body.innerText'),/SYNTHETIC_PRIVATE|achievementScriptExecuted|123456/);
  assert.equal(await evaluate('globalThis.achievementScriptExecuted'),undefined);
  assert.ok(networkRequests.slice(requestsBefore).every(request=>request.method==='GET'&&!request.hasPostData&&request.url.startsWith(origin+'/assets/')&&!new URL(request.url).search),'Achievement analysis only requests local static art; no upload or query transmission');
  for(const [file,bytes] of originals) assert.deepEqual(fs.readFileSync(file),bytes,'Selected synthetic achievement file is unchanged');
  checks.push('Deterministic achievement/slot races cannot revive cleared state or overwrite a newer source; no account/private/script leakage, persistence, uploads or source-file writes');
  return {steamFile,nativeFile,files:[...originals.keys()].map(file=>path.relative(artifacts,file).replaceAll('\\','/'))};
}

async function checkMapLabelMotion(context, expectedLabels, screenshot) {
  const close = (actual, expected, description, tolerance = .15) => assert.ok(Math.abs(actual-expected) <= tolerance,
    `${context}: ${description}; actual=${actual}, expected=${expected}`);
  const snapshot = () => evaluate(`(() => {
    const svg=document.querySelector('#map-svg'),bounds=svg.getBoundingClientRect();
    const drawing=document.querySelector('#map-drawing'),matrix=drawing.getScreenCTM();
    const relative=rect=>({x:rect.left-bounds.left,y:rect.top-bounds.top,w:rect.width,h:rect.height});
    return {width:bounds.width,height:bounds.height,matrix:{a:matrix.a,d:matrix.d,e:matrix.e-bounds.left,f:matrix.f-bounds.top},
      labels:[...document.querySelectorAll('#map-labels .region-label')].map(label=>{
        const rect=relative(label.querySelector('rect').getBoundingClientRect());
        const leader=label.querySelector('.region-leader'),leaderMatrix=leader.getScreenCTM();
        const start=leader.getPointAtLength(0).matrixTransform(leaderMatrix),end=leader.getPointAtLength(leader.getTotalLength()).matrixTransform(leaderMatrix);
        const worldStart=start.matrixTransform(matrix.inverse());
        const cell=[...drawing.querySelectorAll('[data-cell]')].find(node=>node.dataset.regionId===label.dataset.region);
        return {id:label.dataset.region,rect,cellKey:cell.dataset.cell,cell:relative(cell.querySelector('.world-floor').getBoundingClientRect()),
          anchor:{x:start.x-bounds.left,y:start.y-bounds.top},end:{x:end.x-bounds.left,y:end.y-bounds.top},worldAnchor:{x:worldStart.x,y:worldStart.y}};
      })};
  })()`);
  const pan = async (key, times) => evaluate(`(() => {
    const svg=document.querySelector('#map-svg');
    for(let i=0;i<${times};i++) svg.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}));
  })()`);
  const inspect = (state, base) => {
    assert.equal(state.labels.length,expectedLabels,`${context}: labels remain generated even beyond viewport`);
    for(const label of state.labels) {
      const initial=base.labels.find(entry=>entry.id===label.id);
      assert.ok(initial,`${context}: expected region ${label.id}`);
      assert.equal(label.cellKey,initial.cellKey);
      close(label.worldAnchor.x,initial.worldAnchor.x,`region ${label.id} leader stays attached to map x`);
      close(label.worldAnchor.y,initial.worldAnchor.y,`region ${label.id} leader stays attached to map y`);
      close(label.rect.w,initial.rect.w,`region ${label.id} label keeps readable screen width`);
      close(label.rect.h,initial.rect.h,`region ${label.id} label keeps readable screen height`);
      assert.ok(label.end.x>=label.rect.x-.2&&label.end.x<=label.rect.x+label.rect.w+.2&&label.end.y>=label.rect.y-.2&&label.end.y<=label.rect.y+label.rect.h+.2,`${context}: region ${label.id} leader terminates on its label`);
    }
  };
  const comparePan = (before,after) => {
    const dx=after.matrix.e-before.matrix.e,dy=after.matrix.f-before.matrix.f;
    close(after.matrix.a,before.matrix.a,'pan preserves scale');
    for(const current of after.labels) {
      const previous=before.labels.find(label=>label.id===current.id);
      assert.ok(previous,`${context}: pan keeps region ${current.id}`);
      for(const field of ['rect','cell','anchor','end']) {
        close(current[field].x-previous[field].x,dx,`region ${current.id} ${field} follows map dx`);
        close(current[field].y-previous[field].y,dy,`region ${current.id} ${field} follows map dy`);
      }
    }
  };
  await evaluate('document.querySelector("#map-fit").click();document.querySelector("#map-stage").scrollIntoView({block:"center"})');
  assert.equal(await evaluate(`['#map-svg','#map-stage'].every(selector=>{const style=getComputedStyle(document.querySelector(selector));return ['hidden','clip'].includes(style.overflowX)&&['hidden','clip'].includes(style.overflowY);})`),true,context+': SVG and map stage clip content');
  const fitted=await snapshot();
  inspect(fitted,fitted);
  const visible=fitted.labels.filter(({rect})=>rect.x+rect.w>0&&rect.x<fitted.width&&rect.y+rect.h>0&&rect.y<fitted.height);
  assert.ok(visible.length>0,context+': fitted view has visible labels');
  for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
    const a=visible[i].rect,b=visible[j].rect;
    const overlapX=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),overlapY=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
    assert.ok(overlapX<=.2||overlapY<=.2,`${context}: fitted visible labels ${visible[i].id} and ${visible[j].id} do not overlap`);
  }
  for(const zoom of [0,1]) {
    if(zoom) await evaluate('document.querySelector("#map-zoom-in").click();document.querySelector("#map-zoom-in").click()');
    const start=await snapshot();
    inspect(start,fitted);
    if(zoom) {
      assert.ok(start.matrix.a>fitted.matrix.a,context+': zoom increases map scale');
      for(const label of start.labels) {
        const original=fitted.labels.find(entry=>entry.id===label.id),ratio=start.matrix.a/fitted.matrix.a;
        close(label.cell.x,(original.cell.x-fitted.matrix.e)*ratio+start.matrix.e,`region ${label.id} cell remains attached after zoom`);
        close(label.cell.y,(original.cell.y-fitted.matrix.f)*ratio+start.matrix.f,`region ${label.id} cell remains attached after zoom`);
      }
    }
    const horizontal=Math.ceil((start.width+450)/35),vertical=Math.ceil((start.height+450)/35);
    const moves=[['ArrowLeft',horizontal],['ArrowUp',vertical],['ArrowRight',horizontal*2],['ArrowDown',vertical*2],['ArrowLeft',horizontal],['ArrowUp',vertical]];
    let previous=start,offscreen=false;
    for(const [key,times] of moves) {
      await pan(key,times);
      const current=await snapshot();
      inspect(current,fitted);
      comparePan(previous,current);
      offscreen ||= current.labels.some(({rect})=>rect.x+rect.w<0||rect.x>current.width||rect.y+rect.h<0||rect.y>current.height);
      previous=current;
    }
    assert.ok(offscreen,`${context}: zoom ${zoom} exercises labels beyond viewport`);
    comparePan(start,previous);
    close(previous.matrix.e,start.matrix.e,'round trip restores map x');
    close(previous.matrix.f,start.matrix.f,'round trip restores map y');
    for(const label of previous.labels) {
      const original=start.labels.find(entry=>entry.id===label.id);
      close(label.rect.x,original.rect.x,`region ${label.id} returns to original x`);
      close(label.rect.y,original.rect.y,`region ${label.id} returns to original y`);
    }
    if(zoom&&screenshot) {
      await pan('ArrowLeft',5);await pan('ArrowUp',3);
      await capture(screenshot);
      await pan('ArrowRight',5);await pan('ArrowDown',3);
    }
  }
  await evaluate('document.querySelector("#map-fit").click()');
  checks.push(`${context}: all ${expectedLabels} labels and leaders follow map pan at fitted/zoomed scales, retain offscreen positions, avoid initial overlap, clip naturally and restore round-trip coordinates`);
}

async function run() {
  assert.ok(fs.existsSync(edge), 'Microsoft Edge is installed (or set WIKI_EDGE_PATH).');
  fs.mkdirSync(artifacts, { recursive: true });
  server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(origin + '/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(origin + '/%2e%2e%5cpackage.json')).status, 404);
  assert.equal((await fetch(origin + '/api/world-map')).status, 404);
  const faviconResponse = await fetch(origin + '/assets/brand/icon.jpg');
  assert.equal(faviconResponse.status, 200);
  assert.match(faviconResponse.headers.get('content-type'), /image\/jpeg/);
  checks.push('HTTP page and isolated static directory');

  const profile = fs.mkdtempSync(path.join(artifacts, 'edge-'));
  browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio:['ignore','pipe','pipe'] });
  browser.stdout.on('data', chunk => { browserLog += chunk.toString(); });
  browser.stderr.on('data', chunk => { browserLog += chunk.toString(); });
  browser.on('error', error => { browserLog += error.message; });
  browser.on('exit', code => { browserExit = code; });
  const activePortFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !fs.existsSync(activePortFile); attempt++) await sleep(100);
  assert.ok(fs.existsSync(activePortFile), 'Edge debugging endpoint is ready; exit=' + browserExit + '; ' + browserLog.slice(-3000));
  const port = Number(fs.readFileSync(activePortFile, 'utf8').split(/\r?\n/)[0]);
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(item => item.type === 'page' && item.url === 'about:blank');
  assert.ok(target, 'Test browser owns a blank tab');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Network.requestWillBeSent') networkRequests.push({ url:message.params.request.url, method:message.params.request.method, hasPostData:Boolean(message.params.request.hasPostData) });
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id);
    clearTimeout(promise.timer);
    if (message.error) promise.reject(new Error(JSON.stringify(message.error)));
    else promise.resolve(message.result);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await viewport(1440, 1000);
  await send('Page.navigate', { url: origin + '/' });
  await waitFor('window.NYARURU_DATA && document.querySelector("#map-svg") && document.readyState === "complete"');
  checks.push('Standalone scripts loaded');

  // Functional assertions are kept here so the complete prototype is checked together.
  await checkWiki(origin);
  await checkGuidePages(origin);

  assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
  const report = { ok: true, checks, javascriptErrors: errors.length, liveWebsiteChanged: false,
    screenshots: ['desktop-map-header.png', 'desktop-overview.png', 'connection-detail.png', 'desktop-map.png', 'desktop-map-panned.png', 'desktop-items.png', 'desktop-story.png', 'desktop-story-closed.png', 'desktop-characters.png', 'desktop-achievements.png', 'desktop-assistant.png', 'desktop-about.png', 'desktop-save.png', 'mobile-map-header.png', 'mobile-map.png', 'mobile-map-panned.png', 'mobile-story.png', 'mobile-story-closed.png', 'mobile-characters.png', 'mobile-achievements.png', 'mobile-about.png', 'wordpress-embed.png', 'desktop-guide.png', 'mobile-guide.png', 'desktop-guide-regions.png', 'desktop-guide-region.png', 'desktop-guide-item.png', 'desktop-guide-story.png', 'mobile-guide-regions.png', 'mobile-guide-item.png', 'mobile-guide-story.png', 'desktop-guide-ending-open.png', 'desktop-guide-character-target.png', 'mobile-guide-ending-open.png'],
    syntheticFiles,
    completedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

async function checkWiki(origin) {
  const control = async (selector, value, event = 'change') => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles:true }));
  })()`);
  const view = async name => {
    await evaluate(`document.querySelector('[data-nav="${name}"]').click()`);
    await waitFor(`!document.querySelector('#page-${name}').hidden`);
    await evaluate('scrollTo(0,0)');
  };
  const storage = () => evaluate(`JSON.parse(localStorage.getItem('nyaruru-wiki.collection.v1'))`);
  const importFile = async text => {
    await evaluate(`(() => {
      const input = document.querySelector('#collection-import');
      const transfer = new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(text)}], 'checklist.json', { type:'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles:true }));
    })()`);
    await waitFor(`document.querySelector('#collection-import').value === ''`);
  };

  await waitFor('document.querySelectorAll("#map-drawing [data-cell]").length > 0');
  await checkBrandMaintainer('Desktop');
  assert.equal(await evaluate('document.querySelector("#stat-points").textContent'), '411');
  assert.equal(await evaluate('document.querySelector("#stat-items").textContent'), '49');
  assert.equal(await evaluate('document.querySelector("#stat-progress").textContent'), '0');
  assert.equal(await storage(), null, 'First visit has no game progress');
  assert.equal(await evaluate('document.querySelector("#map-mode").value'), 'overview');
  assert.equal(await evaluate('document.querySelector("#map-mode").type'), 'hidden');
  assert.equal(await evaluate('document.querySelector("[data-map-mode=overview]").getAttribute("aria-pressed")'), 'true');
  const modeLayout = await evaluate(`(() => {const switcher=document.querySelector('.map-mode-switch').getBoundingClientRect(),region=document.querySelector('#map-region').getBoundingClientRect();return {switchLeft:switcher.left,regionLeft:region.left};})()`);
  assert.ok(modeLayout.switchLeft < modeLayout.regionLeft, 'Segmented mode switch is left of the region selector');
  await evaluate('document.querySelector("[data-map-mode=region]").click()');
  assert.equal(await evaluate('document.querySelector("#map-mode").value'), 'region');
  await evaluate('document.querySelector("[data-map-mode=overview]").click()');
  assert.equal(await evaluate('document.querySelectorAll("#map-drawing [data-cell]").length'), 996);
  assert.equal(await evaluate('document.querySelectorAll("#map-labels .region-label").length'), 16);
  assert.equal(await evaluate('document.querySelectorAll("#map-region-legend button[data-region]").length'), 16);
  assert.equal(await evaluate('new Set([...document.querySelectorAll(".region-swatch")].map(node=>getComputedStyle(node).backgroundColor)).size'), 16);
  assert.equal(await evaluate('document.querySelector("#map-heading").textContent'), '世界总览');
  assert.ok(await evaluate('document.querySelectorAll("#map-links [data-connection]").length > 0'));
  const imageResults = await evaluate(`Promise.all(NYARURU_DATA.items.map(item=>new Promise(resolve=>{
    const img=new Image(), info=NYARURU_ICONS.items[item.key];
    img.onload=()=>resolve({key:item.key,ok:img.naturalWidth===info.width&&img.naturalHeight===info.height});
    img.onerror=()=>resolve({key:item.key,ok:false});
    img.src=info.src;
  })))`);
  assert.equal(imageResults.length, 49);
  assert.ok(imageResults.every(result=>result.ok), 'All 49 original icons decode in the browser');
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-marker-item]')].every(marker=>marker.querySelector('image')?.getAttribute('href')===NYARURU_ICONS.items[marker.dataset.markerItem].src)`), true);
  assert.equal(await evaluate('document.querySelectorAll("#map-legend button[data-map-type]").length'), 9);
  await evaluate('scrollTo(0,0)');
  await capture('desktop-map-header');
  await evaluate('document.querySelector("#map-heading").scrollIntoView({block:"start"})');
  await capture('desktop-overview');
  checks.push('V2 world overview: 996 cells, 16 region labels and distinct colors, 49 original PNGs');
  await checkMapLabelMotion('Desktop world overview',16,'desktop-map-panned');
  await waitFor('document.querySelector(".brand-logo")?.complete && document.querySelector(".brand-logo").naturalWidth > 0');
  assert.equal(await evaluate('document.querySelector(".brand-logo").getAttribute("src")'), 'assets/brand/logo.png');
  assert.equal(await evaluate('document.querySelector(\'link[rel="icon"]\').getAttribute("href")'), 'assets/brand/icon.jpg');
  checks.push('Steam official branding and two-button map mode control');

  for (const type of ['consumables', 'coin']) {
    await evaluate(`document.querySelector('[data-map-type="${type}"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-map-type="${type}"]').getAttribute('aria-pressed')`), 'false');
    assert.equal(await evaluate(`document.querySelectorAll('[data-marker-type="${type}"]').length`), 0);
    assert.equal(await evaluate('document.querySelectorAll("#map-drawing [data-cell]").length'), 996);
  }
  assert.equal(await evaluate(`document.querySelector('[data-map-type="ornaments"]').getAttribute('aria-pressed')`), 'true');
  for (const type of ['consumables', 'coin']) await evaluate(`document.querySelector('[data-map-type="${type}"]').click()`);
  checks.push('Independent reward visibility buttons keep other categories and room structure');

  await evaluate(`document.querySelector('#map-links [data-connection]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  assert.ok(await evaluate('document.querySelectorAll("#map-detail [data-endpoint]").length >= 2'));
  assert.doesNotMatch(await evaluate('document.querySelector("#map-detail").textContent'), /nya_event_trigger|autoTransfer|eor\/eol|Map001/);
  const endpoint = await evaluate('document.querySelector("#map-detail [data-endpoint]").dataset.endpoint');
  await capture('connection-detail');
  await evaluate('document.querySelector("#map-detail [data-endpoint]").click()');
  assert.equal(await evaluate('document.querySelector("#map-mode").value'), 'region');
  assert.ok(await evaluate(`document.querySelector('[data-cell="${endpoint}"]').classList.contains('selected')`));
  await control('#map-mode', 'overview');
  await evaluate('document.querySelector("#map-story").click()');
  assert.ok(await evaluate('document.querySelectorAll("#map-links .story-connection").length > 0'));
  await evaluate('document.querySelector("#map-connections").click()');
  assert.equal(await evaluate('document.querySelectorAll("#map-links [data-connection]").length'), 0);
  await evaluate('document.querySelector("#map-connections").click();document.querySelector("#map-story").click()');
  checks.push('Verified exit arrows, endpoint navigation and separate story-transfer toggle');

  await control('#map-mode', 'region');
  assert.equal(await evaluate('document.querySelector("#map-page").closest("label").hidden'), true, 'Internal page state is not another visible map selector');
  assert.equal(await evaluate('document.querySelector("#map-region").options.length'), 17);
  assert.equal(await evaluate('document.querySelector("#map-region").options[0].textContent'), '小镇周围');
  const regionIds = await evaluate('NYARURU_DATA.regions.map(region => region.id)');
  for (const id of regionIds) {
    await control('#map-region', String(id));
    const counts = await evaluate(`({
      expected:NYARURU_DATA.cells.filter(cell => String(cell.regionId) === document.querySelector('#map-region').value && String(cell.page) === document.querySelector('#map-page').value).length,
      actual:document.querySelectorAll('#map-drawing [data-cell]').length,
      transform:document.querySelector('#map-drawing').getAttribute('transform')
    })`);
    assert.equal(counts.actual, counts.expected);
    assert.ok(counts.actual > 0 && !/NaN|Infinity/.test(counts.transform));
    const regionName = await evaluate(`NYARURU_DATA.regions.find(region=>region.id===${id}).name`);
    assert.ok((await evaluate('document.querySelector("#map-heading").textContent')).includes(regionName));
    await control('#map-region', '');
    assert.equal(await evaluate('document.querySelector("#map-page").value'), '2', 'Town surroundings always returns to original page 2');
    assert.equal(await evaluate('document.querySelectorAll("#map-drawing [data-cell]").length'), 172);
    assert.equal(await evaluate('new Set([...document.querySelectorAll("#map-drawing [data-cell]")].map(node=>node.dataset.regionId)).size'), 4);
    assert.equal(await evaluate('document.querySelector("#map-heading").textContent'), '小镇周围');
  }
  await control('#map-region', '');
  checks.push('All 16 independent regions resolve correctly; every return to Town surroundings restores page 2, 172 cells and four regions');
  await control('#map-mode','overview');
  assert.equal(await evaluate('document.querySelectorAll("#map-drawing [data-cell]").length'),996);
  assert.match(await evaluate('document.querySelector("#map-region").options[0].textContent'),/全世界/);
  await control('#map-mode','region');
  assert.equal(await evaluate('document.querySelectorAll("#map-region-legend button[data-region]").length'), 4);
  await evaluate('document.querySelector("#map-heading").scrollIntoView({block:"start"})');
  await capture('desktop-map');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  await checkMapLabelMotion('Desktop Town surroundings',4);

  const beforeZoom = await evaluate('document.querySelector("#map-drawing").getAttribute("transform")');
  await evaluate('document.querySelector("#map-zoom-in").click()');
  assert.notEqual(await evaluate('document.querySelector("#map-drawing").getAttribute("transform")'), beforeZoom);
  await evaluate('document.querySelector("#map-stage").scrollIntoView({block:"center"})');
  const dragPoint = await evaluate(`(() => { const r=document.querySelector('#map-svg').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  const beforeDrag = await evaluate('document.querySelector("#map-drawing").getAttribute("transform")');
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:dragPoint.x, y:dragPoint.y });
  await send('Input.dispatchMouseEvent', { type:'mousePressed', x:dragPoint.x, y:dragPoint.y, button:'left', clickCount:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:dragPoint.x+35, y:dragPoint.y+20, button:'left', buttons:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:dragPoint.x+35, y:dragPoint.y+20, button:'left', clickCount:1 });
  assert.notEqual(await evaluate('document.querySelector("#map-drawing").getAttribute("transform")'), beforeDrag);
  checks.push('Map zoom and pointer drag');

  const test = await evaluate(`(() => {
    const groups = new Map();
    for (const row of NYARURU_DATA.locations.filter(row=>row.official)) {
      if (!groups.has(row.collectionKey)) groups.set(row.collectionKey,[]);
      groups.get(row.collectionKey).push(row);
    }
    const group = [...groups.values()].find(rows=>rows.length>1) || [...groups.values()][0];
    return {source:group[0],rewardRows:group.length,secondKey:[...groups.keys()].find(key=>key!==group[0].collectionKey)};
  })()`);
  const { source, secondKey } = test;
  const sourceRegion = await evaluate(`String(NYARURU_DATA.cells.find(cell=>cell.key===${JSON.stringify(source.cellKey)}).regionId)`);
  await control('#map-region', sourceRegion);
  await evaluate(`(() => {
    const cell = [...document.querySelectorAll('[data-cell]')].find(cell=>cell.dataset.cell===${JSON.stringify(source.cellKey)});
    cell.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  })()`);
  assert.ok(await evaluate(`!!document.querySelector('#map-detail [data-detail-event="${source.collectionKey}"]')`));
  await evaluate(`document.querySelector('#map-detail input[data-collection="${source.collectionKey}"]').click()`);
  assert.equal(await evaluate('document.querySelector("#stat-progress").textContent'), '1');
  assert.deepEqual((await storage()).completed, [source.collectionKey]);
  checks.push('Keyboard room selection and event-level progress');

  await view('items');
  await control('#item-type', 'ornaments');
  assert.equal(await evaluate('document.querySelectorAll("#item-grid .item-card").length'), 26);
  assert.equal(await evaluate('document.querySelector("#item-type option:checked").textContent'), '配饰');
  assert.equal(await evaluate(`[...document.querySelectorAll('#item-grid [data-item]')].every(card=>card.querySelector('img')?.getAttribute('src')===NYARURU_ICONS.items[card.dataset.item].src)`), true);
  await waitFor('[...document.querySelectorAll("#item-grid img")].every(img=>img.complete&&img.naturalWidth>0)');
  assert.ok(await evaluate('document.querySelector("#item-grid .item-art .game-icon").getBoundingClientRect().width >= 48'));
  assert.equal(await evaluate(`[...document.querySelectorAll('#item-grid [data-item]')].every(card=>{
    const item=NYARURU_DATA.items.find(item=>item.key===card.dataset.item);
    return item.shopCandidate&&Number(item.price)>0 ? card.querySelector('.item-price')?.textContent.includes(String(item.price)) : !card.querySelector('.item-price');
  })`), true);
  await capture('desktop-items');
  await control('#item-type', '');
  const itemName = await evaluate(`NYARURU_DATA.items.find(item=>item.key===${JSON.stringify(source.itemKey)}).name`);
  await control('#item-search', itemName, 'input');
  assert.ok(await evaluate(`!!document.querySelector('#item-grid [data-item="${source.itemKey}"]')`));
  await evaluate(`document.querySelector('#item-grid [data-item="${source.itemKey}"]').click()`);
  assert.equal(await evaluate('document.querySelector("#item-dialog").open'), true);
  assert.equal(await evaluate(`document.querySelector('#item-dialog input[data-collection="${source.collectionKey}"]').checked`), true);
  await evaluate(`document.querySelector('#item-dialog [data-locate="${source.key}"]').click()`);
  await waitFor(`!document.querySelector('#page-map').hidden && !!document.querySelector('[data-cell="${source.cellKey}"].selected')`);
  assert.equal(await evaluate('document.querySelector("#item-dialog").open'), false);
  assert.equal(await evaluate('document.querySelector("#map-page").value'), String(source.page));
  assert.equal(await evaluate(`document.querySelector('[data-marker-event="${source.collectionKey}"]').classList.contains('collected')`), true);
  await evaluate('document.querySelector("#map-missing").click()');
  assert.equal(await evaluate(`document.querySelector('[data-marker-event="${source.collectionKey}"]')`), null);
  await evaluate('document.querySelector("#map-missing").click()');
  checks.push('Accessory filter, item search, source-to-map linking, completed markers');

  await view('collection');
  await evaluate(`(() => {
    const button = document.querySelector('#collection-more');
    for(let i=0;i<10 && !button.hidden;i++) button.click();
  })()`);
  assert.equal(await evaluate('document.querySelectorAll("#collection-list [data-event]").length'), 411);
  assert.equal(await evaluate('new Set([...document.querySelectorAll("#collection-list [data-event]")].map(row=>row.dataset.event)).size'), 411);
  await control('#collection-status', 'done');
  assert.equal(await evaluate('document.querySelectorAll("#collection-list [data-event]").length'), 1);
  await send('Page.reload');
  await waitFor('document.readyState === "complete" && document.querySelector("#collection-done")?.textContent === "1"');
  assert.deepEqual((await storage()).completed, [source.collectionKey]);
  checks.push('411 unique checklist events and reload persistence');

  // Capture the download in this test tab without writing to the user's Downloads folder.
  await evaluate(`(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__qaExport = blob; return originalCreate(blob); };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download) window.__qaExportName = this.download;
      else originalClick.call(this);
    };
    document.querySelector('#collection-export').click();
  })()`);
  const exported = JSON.parse(await evaluate('window.__qaExport.text()'));
  assert.equal(exported.application, 'nyaruru-wiki');
  assert.equal(exported.schemaVersion, 1);
  assert.deepEqual(exported.completed, [source.collectionKey]);
  await importFile(JSON.stringify({ ...exported, completed:[secondKey] }));
  await waitFor('document.querySelector("#collection-done").textContent === "2"');
  assert.deepEqual(new Set((await storage()).completed), new Set([source.collectionKey, secondKey]));
  for (const invalid of ['{broken', JSON.stringify({ ...exported, completed:['999999:999999'] }), JSON.stringify({ ...exported, completed:[secondKey,secondKey] })]) {
    await importFile(invalid);
    assert.equal(await evaluate('document.querySelector("#collection-done").textContent'), '2');
    assert.match(await evaluate('document.querySelector("#toast").textContent'), /导入失败/);
    assert.deepEqual(new Set((await storage()).completed), new Set([source.collectionKey, secondKey]));
  }
  checks.push('JSON export and merge import; malformed, unknown and duplicate entries rejected');

  await view('characters');
  await checkEndings('Desktop','desktop-story');
  assert.equal(await evaluate('document.querySelectorAll("#character-grid .character-card").length'), 16);
  assert.equal(await evaluate(`[...document.querySelectorAll('#character-grid .character-card')].every(card=>{
    const character=NYARURU_CHARACTERS.characters.find(item=>item.id===card.dataset.character);
    return character.identitySpoiler ? card.querySelector('h2').textContent===character.safeName : card.textContent.includes('CC BY-NC-SA 4.0') && !!card.querySelector('a[href^="https://zh.moegirl.org.cn/"]');
  })`), true);
  assert.equal(await evaluate('[...document.querySelectorAll(".character-spoilers")].every(panel=>panel.hidden && panel.childElementCount===0)'), true);
  assert.equal(await evaluate(`NYARURU_CHARACTERS.characters.filter(c=>c.imageSpoiler||c.identitySpoiler).every(c=>!document.querySelector('[data-character="'+c.id+'"] img'))`), true);
  assert.ok(await evaluate('document.querySelector(".character-pixel-frame").getBoundingClientRect().width >= 96'));
  await evaluate('document.querySelectorAll("#character-grid img").forEach(image=>image.loading="eager")');
  await waitFor('[...document.querySelectorAll("#character-grid img")].every(img=>img.complete&&img.naturalWidth>0)');
  assert.match(await evaluate('getComputedStyle(document.querySelector(".character-portrait")).maskImage'), /linear-gradient/);
  await evaluate('document.querySelector("#character-grid").scrollIntoView({block:"start"})');
  await capture('desktop-characters');
  await evaluate('scrollTo(0,0)');
  const protectedId = await evaluate('NYARURU_CHARACTERS.characters.find(c=>c.identitySpoiler).id');
  await evaluate(`document.querySelector('[data-character="${protectedId}"] [data-spoiler-toggle]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-character="${protectedId}"] .character-spoilers').hidden`), false);
  assert.ok(await evaluate(`document.querySelectorAll('[data-character="${protectedId}"] .character-spoilers img').length > 0`));
  await evaluate(`document.querySelector('[data-character="${protectedId}"] [data-spoiler-toggle]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-character="${protectedId}"] .character-spoilers').childElementCount`), 0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-character="${protectedId}"] img').length`), 0);
  checks.push('Sixteen character dossiers: large pixel art, masked portraits and explicit reversible spoiler reveal');

  await view('assistant');
  await evaluate('document.querySelectorAll("#page-assistant img").forEach(image=>image.loading="eager")');
  await waitFor('[...document.querySelectorAll("#page-assistant img")].every(img=>img.complete&&img.naturalWidth>0)');
  await checkAssistantCover('Desktop');
  assert.ok(await evaluate('!!document.querySelector(\'#page-assistant a[href="https://github.com/Four-way-Xeon/Nyaruru_modifier"]\')'));
  assert.ok(await evaluate('!!document.querySelector(\'#page-assistant a[href="https://git.serversalem.top/Kitasami_Nya/Nyaruru_modifier_public"]\')'));
  assert.doesNotMatch(await evaluate('document.querySelector("#page-assistant").textContent'), /TAS|快照/);
  await capture('desktop-assistant');
  checks.push('Assistant guide uses real screenshots and working repository destinations');

  const saveTest = await checkLocalSave(origin, view, storage, new Set([source.collectionKey,secondKey]));
  const achievementTest = await checkAchievements(origin, view, control, saveTest);
  syntheticFiles.push('synthetic-save.rmmzsave','invalid-save.rmmzsave','oversized-save.rmmzsave',...achievementTest.files);
  await view('about');
  assert.equal(await evaluate('!!document.querySelector(\'#character-sources a[href="./data.js"]\')'), true);
  assert.equal(await evaluate('document.querySelector("[data-nav=about]").textContent.trim()'),'关于');
  assert.equal(await evaluate('document.querySelector("#breadcrumb").textContent.trim()'),'关于');
  assert.equal(await evaluate(`(() => {
    const note=document.querySelector('#site-note'),grid=document.querySelector('#page-about .about-grid');
    if(!note||!grid)return false;
    const a=note.getBoundingClientRect(),b=grid.getBoundingClientRect();
    return note.textContent.trim().length>0&&a.height>0&&a.width>=b.width-2&&a.bottom<=b.top+1&&
      !!(note.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_FOLLOWING);
  })()`),true,'About site notice spans the content width before the retained source grid');
  assert.match(await evaluate('document.querySelector("#page-about").textContent'),/CC BY-NC-SA 4\.0/);
  await capture('desktop-about');
  checks.push('About navigation and breadcrumb renamed; full-width site notice precedes the existing source and license sections');
  checks.push('Character source and license links retained');

  await viewport(390, 844, true);
  for (const name of ['map','items','collection','characters','achievements','save','assistant','about']) {
    await view(name);
    await evaluate('scrollTo(0,0)');
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, name + ' mobile overflow');
    if(name==='about')await capture('mobile-about');
  }
  await view('map');
  await checkBrandMaintainer('Mobile');
  checks.push('Desktop and mobile branding show the unofficial maintainer notice below NYARURU WIKI without overflow');
  await control('#map-mode', 'overview');
  await evaluate('scrollTo(0,0)');
  await capture('mobile-map-header');
  await evaluate('document.querySelector("#map-fit").click();document.querySelector("#toast").hidden=true;document.querySelector("#map-stage").scrollIntoView({block:"start"})');
  await sleep(200);
  const mobileBounds = await evaluate(`(() => {
    const map=document.querySelector('#map-svg').getBoundingClientRect(), drawing=document.querySelector('#map-drawing').getBoundingClientRect();
    return {left:drawing.left-map.left,right:drawing.right-map.right,top:drawing.top-map.top,bottom:drawing.bottom-map.bottom};
  })()`);
  assert.ok(mobileBounds.left >= -2 && mobileBounds.right <= 2 && mobileBounds.top >= -2 && mobileBounds.bottom <= 2, 'Mobile fit keeps the entire world within the map viewport');
  assert.equal(await evaluate('document.querySelectorAll("#map-labels .compact-region-label").length'), 16);
  assert.equal(await evaluate('document.querySelectorAll("#map-region-legend .region-index").length'), 16);
  await capture('mobile-map');
  await checkMapLabelMotion('Mobile world overview',16,'mobile-map-panned');
  await view('characters');
  await checkEndings('Mobile','mobile-story');
  await evaluate('document.querySelector("#character-grid").scrollIntoView({block:"start"})');
  await capture('mobile-characters');
  await evaluate('scrollTo(0,0)');
  await view('assistant');
  await checkAssistantCover('Mobile');
  checks.push('Desktop and mobile assistant hero show the complete original 460x215 cover while repository destinations and screenshot guide remain available');
  await view('achievements');
  await capture('mobile-achievements');
  assert.equal(await evaluate('document.querySelectorAll("nav [data-nav]").length'),8);
  assert.equal(await evaluate(`(() => {const nav=document.querySelector('.sidebar nav');nav.scrollLeft=nav.scrollWidth;return nav.scrollLeft>0&&nav.scrollWidth>nav.clientWidth;})()`),true,'Mobile navigation scrolls inside its own container');
  await evaluate('document.querySelector(".sidebar nav").scrollLeft=0');
  checks.push('All eight views fit a 390px mobile viewport; navigation scrolls horizontally without widening the document');

  await viewport(1440, 1000);
  const fileUrl = pathToFileURL(path.join(root, 'dist/index.html')).href;
  await send('Page.navigate', { url:fileUrl });
  await waitFor(`location.href === ${JSON.stringify(fileUrl)} && window.NYARURU_DATA && document.querySelectorAll('#map-drawing [data-cell]').length > 0 && document.readyState === 'complete'`);
  assert.equal(await evaluate('document.querySelectorAll("#map-drawing [data-cell]").length'), 996);
  await waitFor('[...document.images].filter(img=>img.getClientRects().length).every(img=>img.complete&&img.naturalWidth>0)');
  await view('save');
  await setFile('#save-file', saveTest.validFile);
  await waitFor('document.querySelector("#save-status").textContent.includes("解析完成")');
  assert.equal(await evaluate('document.querySelector("#save-preview").hidden'), false);
  assert.match(await evaluate('document.querySelector("#save-summary").textContent'), /1234/);
  await evaluate('document.querySelector("#save-clear").click()');
  await view('achievements');
  const fileStorageBefore = await storage();
  await control('#achievement-source','steam');
  await setFile('#achievement-file',achievementTest.steamFile);
  await waitFor('document.querySelector("#achievement-status").textContent.includes("Steam 本地缓存")');
  assert.equal(await evaluate('document.querySelectorAll("#achievement-grid [data-status=unlocked]").length'),3);
  assert.equal(await evaluate('document.querySelectorAll("#achievement-grid [data-status=locked]").length'),29);
  assert.deepEqual(await storage(),fileStorageBefore);
  assert.doesNotMatch(await evaluate('document.querySelector("#page-achievements").innerText'),/123456|SYNTHETIC_PRIVATE/);
  await evaluate('document.querySelector("#achievement-clear").click()');
  checks.push('Direct local HTML works for save analysis and Steam achievement status with no persistence');

  // The same-origin iframe uses the exact WP snippet under deliberately conflicting theme CSS.
  await send('Page.navigate', { url:origin + '/qa-host-not-found.html' });
  await waitFor(`location.href === ${JSON.stringify(origin + '/qa-host-not-found.html')} && !window.NYARURU_DATA && document.readyState === 'complete'`);
  const snippet = fs.readFileSync(path.join(root, 'WordPress自定义HTML示例.html'), 'utf8')
    .replaceAll('https://www.serversalem.top/nyaruru-wiki/', origin + '/');
  const tree = await send('Page.getFrameTree');
  await send('Page.setDocumentContent', { frameId:tree.frameTree.frame.id,
    html:'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}.article{width:760px;margin:auto}button{font-size:60px!important;background:red!important}</style></head><body><main class="article">' + snippet + '</main></body></html>' });
  await waitFor(`document.querySelector('iframe')?.contentWindow?.NYARURU_DATA && document.querySelector('iframe').contentDocument.querySelectorAll('#map-drawing [data-cell]').length > 0`);
  assert.equal(await evaluate(`(() => {const frame=document.querySelector('iframe');return frame.contentDocument.documentElement.scrollWidth>frame.contentWindow.innerWidth;})()`), false);
  assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('iframe').contentDocument.querySelector('#map-fit')).fontSize)<30`));
  await capture('wordpress-embed');
  checks.push('WordPress iframe example loads at 760px and isolates parent theme styles');
  const frameRequestStart = networkRequests.length;
  const frameStorageBefore = await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")');
  await evaluate(`(() => {
    const frame=document.querySelector('iframe'), child=frame.contentWindow;
    child.document.querySelector('[data-nav="save"]').click();
    const transfer=new child.DataTransfer();
    transfer.items.add(new child.File([new Uint8Array(${JSON.stringify([...fs.readFileSync(saveTest.validFile)])})],'synthetic-save.rmmzsave',{type:'application/octet-stream'}));
    const input=child.document.querySelector('#save-file');
    input.files=transfer.files;
    input.dispatchEvent(new child.Event('change',{bubbles:true}));
  })()`);
  await waitFor('document.querySelector("iframe").contentDocument.querySelector("#save-status").textContent.includes("解析完成")');
  assert.match(await evaluate('document.querySelector("iframe").contentDocument.querySelector("#save-summary").textContent'), /1234/);
  assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'), frameStorageBefore);
  assert.ok(networkRequests.slice(frameRequestStart).every(request=>request.method==='GET'&&!request.hasPostData&&request.url.startsWith(origin+'/assets/')&&!new URL(request.url).search));
  checks.push('Embedded save analysis runs locally and keeps shared checklist unchanged before merge');
  const frameAchievementRequests = networkRequests.length;
  await evaluate(`(() => {
    const frame=document.querySelector('iframe'),child=frame.contentWindow,doc=child.document;
    doc.querySelector('[data-nav="achievements"]').click();
    const source=doc.querySelector('#achievement-source');source.value='steam';source.dispatchEvent(new child.Event('change',{bubbles:true}));
    const transfer=new child.DataTransfer();
    transfer.items.add(new child.File([new Uint8Array(${JSON.stringify([...fs.readFileSync(achievementTest.steamFile)])})],${JSON.stringify(path.basename(achievementTest.steamFile))},{type:'application/octet-stream'}));
    const input=doc.querySelector('#achievement-file');input.files=transfer.files;input.dispatchEvent(new child.Event('change',{bubbles:true}));
  })()`);
  await waitFor('document.querySelector("iframe").contentDocument.querySelector("#achievement-status").textContent.includes("Steam 本地缓存")');
  assert.equal(await evaluate('document.querySelector("iframe").contentDocument.querySelectorAll("#achievement-grid [data-status=unlocked]").length'),3);
  assert.equal(await evaluate('document.querySelector("iframe").contentDocument.querySelectorAll("#achievement-grid [data-status=locked]").length'),29);
  assert.equal(await evaluate('localStorage.getItem("nyaruru-wiki.collection.v1")'),frameStorageBefore);
  assert.doesNotMatch(await evaluate('document.querySelector("iframe").contentDocument.querySelector("#page-achievements").innerText'),/123456|SYNTHETIC_PRIVATE/);
  assert.equal(await evaluate(`(() => {const frame=document.querySelector('iframe');return frame.contentDocument.documentElement.scrollWidth>frame.contentWindow.innerWidth;})()`),false);
  assert.ok(networkRequests.slice(frameAchievementRequests).every(request=>request.method==='GET'&&!request.hasPostData&&request.url.startsWith(origin+'/assets/')&&!new URL(request.url).search));
  checks.push('WordPress iframe reads synthetic Steam achievement cache locally, preserves checklist, conceals account fields and fits its viewport');

  const hook = await send('Page.addScriptToEvaluateOnNewDocument', { source:`Storage.prototype.getItem=function(){throw new DOMException('blocked','SecurityError')};Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')};` });
  await send('Page.navigate', { url:origin + '/' });
  await waitFor('window.NYARURU_DATA && document.querySelectorAll("#map-drawing [data-cell]").length > 0 && document.readyState === "complete"');
  await view('collection');
  await evaluate('document.querySelector("#collection-list input[data-collection]").click()');
  assert.equal(await evaluate('document.querySelector("#collection-done").textContent'), '1');
  assert.match(await evaluate('document.querySelector("#toast").textContent'), /无法保存/);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier:hook.identifier });
  checks.push('Blocked browser storage preserves usable in-memory checklist with notice');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  try { if (socket?.readyState === WebSocket.OPEN) await send('Browser.close'); } catch {}
  for (const promise of pending.values()) { clearTimeout(promise.timer); promise.reject(new Error('Test browser closed')); }
  pending.clear();
  try { socket?.close(); } catch {}
  browser?.kill();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});
