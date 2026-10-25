#!/usr/bin/env node
'use strict';
// Public static references and isolated synthetic filesystem fixtures only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildGuides,planGuides}=require('./build-guides');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),guide=path.join(dist,'guide');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const decode=text=>text.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const attribute=(tag,name)=>{const match=tag.match(new RegExp('\\b'+name+'="([^"]*)"','i'));return match?decode(match[1]):null;};
function snapshot(directory){
  const result={};function visit(current){for(const entry of fs.readdirSync(current,{withFileTypes:true})){const filename=path.join(current,entry.name);if(entry.isDirectory())visit(filename);else result[path.relative(directory,filename)]={sha:sha(fs.readFileSync(filename)),mtime:fs.statSync(filename).mtimeMs};}}visit(directory);return result;
}
function outsideSnippetExclusions(html){
  const stack=[],output=[];const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){
    const close=token.match(/^<\/([a-z][\w-]*)/i),open=token.match(/^<([a-z][\w-]*)/i);
    if(close){const index=stack.map(row=>row.tag).lastIndexOf(close[1].toLowerCase());if(index>=0)stack.length=index;continue;}
    const inherited=stack.some(row=>row.excluded);
    const excluded=open&&['span','div','section'].includes(open[1].toLowerCase())&&/\bdata-nosnippet(?:[\s=>])/i.test(token);
    if(!inherited&&!excluded)output.push(token);
    if(open&&!voids.has(open[1].toLowerCase())&&!/\/>$/.test(token))stack.push({tag:open[1].toLowerCase(),excluded:Boolean(excluded)});
  }
  return decode(output.join(''));
}
function run(){
  let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
  const manifest=JSON.parse(fs.readFileSync(path.join(guide,'build-manifest.json'),'utf8'));
  const htmlFiles=manifest.files.map(row=>row.path).filter(file=>file.endsWith('.html'));
  check(htmlFiles.length===124,'124 standalone HTML reference pages');
  const counts={items:49,characters:16,endings:5,achievements:32,regions:16};
  for(const [kind,count]of Object.entries(counts))check(htmlFiles.filter(file=>file.startsWith(kind+'/')&&!file.endsWith('/index.html')).length===count,kind+' complete public coverage');
  const titles=new Set(),descriptions=new Set(),canonicals=new Set();
  const publicModel=planGuides({projectRoot:root}).model;
  const targetIds={source:new Set(publicModel.locations.map(row=>row.key)),item:new Set(publicModel.items.map(row=>row.key)),
    region:new Set(publicModel.regions.map(row=>String(row.id))),character:new Set(publicModel.characters.map(row=>row.id)),achievement:new Set(publicModel.achievements.map(row=>row.id)),ending:new Set(publicModel.endings.map(row=>row.id))};
  const sitemap=fs.readFileSync(path.join(guide,'sitemap.xml'),'utf8');
  const sitemapUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>decode(match[1]));
  const navExpected=[['map','世界地图','/index.html#map'],['items','物品图鉴','/index.html#items'],
    ['collection','全收集清单','/index.html#collection'],['characters','人物与剧情','/index.html#characters'],
    ['achievements','成就手册','/index.html#achievements'],['assistant','全能助手','/index.html#assistant'],
    ['save','存档分析','/index.html#save'],['about','关于','/index.html#about']];
  for(const file of htmlFiles){
    const filename=path.join(guide,file),html=fs.readFileSync(filename,'utf8');
    const title=html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(match=>match[0]).find(tag=>attribute(tag,'name')==='description');
    const canonical=[...html.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0]).find(tag=>attribute(tag,'rel')==='canonical');
    const description=meta&&attribute(meta,'content'),url=canonical&&attribute(canonical,'href');
    check(title&&description&&url&&/^https?:\/\//.test(url),'title, description and absolute canonical: '+file);
    check(!titles.has(title)&&!descriptions.has(description)&&!canonicals.has(url),'unique SEO metadata: '+file);
    titles.add(title);descriptions.add(description);canonicals.add(url);
    check(!/<script\b|\son\w+\s*=|(?:href|src)="javascript:/i.test(html),'standalone HTML without scripts or event handlers: '+file);
    check(/<h1\b/.test(html)&&/<main\b/.test(html),'reference text available without JavaScript: '+file);
    check(!/<details\b[^>]*\bopen(?:\s|=|>)/i.test(html),'spoilers initially collapsed: '+file);
    const nav=html.match(/<nav\b[^>]*class="[^"]*\bguide-nav\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/i)?.[1]||'';
    const navLinks=[...nav.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)];
    check(navLinks.length===8,'exactly eight main navigation destinations: '+file);
    for(const [index,[key,label,target]]of navExpected.entries()){
      const [,,body]=navLinks[index],tag=navLinks[index][1];
      const url=new URL(attribute(tag,'href'),'https://local.invalid/guide/'+file);
      check(attribute(tag,'data-nav')===key&&decode(body.match(/<span\b[^>]*>([^<]*)<\/span>/i)?.[1]||'')===label&&url.pathname+url.hash===target,'ordered navigation destination '+key+': '+file);
    }
    const category=file.split('/')[0],active={regions:'map',endings:'characters'}[category]||category;
    if(category!=='index.html')check(navLinks.some(row=>attribute(row[1],'data-nav')===active&&attribute(row[1],'aria-current')==='page'),'current navigation groups endings and regions correctly: '+file);
    const heading=html.match(/<header\b[^>]*class="[^"]*reader-heading[^"]*"[^>]*>([\s\S]*?)<\/header>/i)?.[1]||'';
    check(/class="[^"]*reader-heading-actions/.test(heading)&&/<a\b[^>]*class="[^"]*\bprimary\b/.test(heading),'prominent action belongs below the page heading: '+file);
    for(const tag of html.match(/<(?:a|img|link|source)\b[^>]*>/gi)||[]){
      for(const name of ['href','src']){
        const value=attribute(tag,name);if(!value||/^(?:https?:|mailto:|data:|tel:)/i.test(value))continue;
        check(!/^(?:javascript:|file:|[a-z]:[\\/])/i.test(value),'safe local URL scheme: '+file);
        const target=new URL(value,'https://local.invalid/'+path.relative(dist,filename).split(path.sep).join('/'));
        check(target.origin==='https://local.invalid','no protocol-relative external source: '+file);
        let local=path.resolve(dist,'.'+decodeURIComponent(target.pathname));
        check(local.startsWith(dist+path.sep),'local link remains in dist: '+file);
        if(fs.existsSync(local)&&fs.statSync(local).isDirectory())local=path.join(local,'index.html');
        check(fs.existsSync(local)&&fs.statSync(local).isFile(),'local target exists: '+file+' -> '+value);
        if(local===path.join(dist,'index.html')&&target.search){
          const entries=[...target.searchParams];
          check(entries.length===1&&targetIds[entries[0][0]]?.has(entries[0][1]),'interactive link targets an existing public record: '+file);
          const anchors={source:'#map',item:'#items',region:'#map',character:'#characters',achievement:'#achievements',ending:'#characters'};
          check(target.hash===anchors[entries[0][0]],'interactive link opens matching tool: '+file);
        }
        if(target.hash&&local.endsWith('.html')&&local!==path.join(dist,'index.html')){
          const destination=fs.readFileSync(local,'utf8');
          check(destination.includes('id="'+decodeURIComponent(target.hash.slice(1))+'"'),'local fragment exists: '+value);
        }
      }
    }
  }
  assert.deepEqual(new Set(sitemapUrls),canonicals);checks++;
  check(sitemapUrls.length===124,'sitemap lists each canonical once');
  const regionIndex=fs.readFileSync(path.join(guide,'regions/index.html'),'utf8');
  for(const region of publicModel.regions){
    const card=regionIndex.match(new RegExp('<article\\b[^>]*data-region-id="'+region.id+'"[^>]*>([\\s\\S]*?)<\\/article>'))?.[1]||'';
    check(/<svg\b[^>]*class="[^"]*region-preview/.test(card),'region directory contains actual inline map preview: '+region.id);
    const keys=[...card.matchAll(/data-cell-key="([^"]+)"/g)].map(match=>decode(match[1]));
    assert.deepEqual(new Set(keys),new Set(publicModel.cells.filter(cell=>cell.regionId===region.id).map(cell=>cell.key)));checks++;
    const collectionLink=[...card.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)].find(match=>match[2].includes('查看收集列表'));
    check(collectionLink&&new URL(attribute(collectionLink[1],'href'),'https://local.invalid/guide/regions/index.html').pathname==='/guide/regions/'+region.id+'.html','region card exposes its own secondary collection list entry');
  }
  for(const item of publicModel.items){
    const html=fs.readFileSync(path.join(guide,'items',item.slug+'.html'),'utf8');
    const sourceKeys=(html.match(/<a\b[^>]*>/g)||[]).map(tag=>new URL(attribute(tag,'href'),'https://local.invalid/guide/items/'+item.slug+'.html').searchParams.get('source')).filter(Boolean);
    assert.deepEqual(new Set(sourceKeys),new Set(publicModel.locations.filter(row=>row.itemKey===item.key).map(row=>row.key)));checks++;
  }
  for(const character of publicModel.characters.filter(row=>row.identitySpoiler)){
    const html=fs.readFileSync(path.join(guide,'characters',character.slug+'.html'),'utf8'),outside=outsideSnippetExclusions(html);
    check(outside.includes(character.safeName)&&!outside.includes(character.name),'hidden character identity excluded from title/description and snippet text');
  }
  for(const achievement of publicModel.achievements.filter(row=>row.hidden||row.spoiler)){
    const html=fs.readFileSync(path.join(guide,'achievements',achievement.id.toLowerCase().replaceAll('_','-')+'.html'),'utf8');
    check(!outsideSnippetExclusions(html).includes(achievement.name),'hidden achievement name inside supported nosnippet container: '+achievement.id);
  }
  for(const ending of publicModel.endings){
    const html=fs.readFileSync(path.join(guide,'endings',ending.id.toLowerCase()+'.html'),'utf8'),outside=outsideSnippetExclusions(html);
    check(html.includes(ending.summary)&&!outside.includes(ending.summary)&&!outside.includes(ending.trigger),'ending facts available in HTML but excluded from snippets: '+ending.id);
  }
  const before=snapshot(guide),checked=buildGuides({projectRoot:root,check:true});
  check(checked.ok,'committed static output is current');assert.deepEqual(snapshot(guide),before);checks++;
  const parent=path.join(root,'.qa');fs.mkdirSync(parent,{recursive:true});
  const temporary=fs.mkdtempSync(path.join(parent,'guide-fixtures-'));
  try{
    const project=path.join(temporary,'project');fs.mkdirSync(project);fs.cpSync(dist,path.join(project,'dist'),{recursive:true});
    fs.cpSync(path.join(root,'scripts'),path.join(project,'scripts'),{recursive:true});
    fs.copyFileSync(path.join(root,'package.json'),path.join(project,'package.json'));
    fs.copyFileSync(path.join(root,'site.config.json'),path.join(project,'site.config.json'));
    const outDir=path.join(project,'dist/guide');
    const first=buildGuides({projectRoot:project}),firstBytes=Object.fromEntries(Object.entries(snapshot(outDir)).map(([f,s])=>[f,s.sha]));
    check(first.ok,'isolated build succeeds without original game files');
    check(buildGuides({projectRoot:project}).ok,'repeat build succeeds');
    assert.deepEqual(Object.fromEntries(Object.entries(snapshot(outDir)).map(([f,s])=>[f,s.sha])),firstBytes);checks++;
    const altered=path.join(outDir,'index.html');fs.appendFileSync(altered,'\n<!-- synthetic stale content -->');
    const staleBefore=snapshot(outDir),stale=buildGuides({projectRoot:project,check:true});
    check(!stale.ok,'check detects stale generated output');assert.deepEqual(snapshot(outDir),staleBefore);checks++;
    buildGuides({projectRoot:project});
    const userFile=path.join(outDir,'reader-notes.txt');fs.writeFileSync(userFile,'synthetic user-owned note');
    const manifestPath=path.join(outDir,'build-manifest.json'),oldManifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const obsolete='items/synthetic-obsolete.html',obsoleteBytes='synthetic old generated page';
    fs.writeFileSync(path.join(outDir,obsolete),obsoleteBytes);oldManifest.files.push({path:obsolete,sha256:sha(obsoleteBytes)});
    fs.writeFileSync(manifestPath,JSON.stringify(oldManifest));
    buildGuides({projectRoot:project});
    check(!fs.existsSync(path.join(outDir,obsolete)),'obsolete manifest-owned output is removed');
    check(fs.readFileSync(userFile,'utf8')==='synthetic user-owned note','unlisted user file preserved');
    const cleanManifest=fs.readFileSync(manifestPath,'utf8'),editedManifest=JSON.parse(cleanManifest);
    const edited='items/edited-stale.html';
    fs.writeFileSync(path.join(outDir,edited),'synthetic hand-edited content to preserve');
    editedManifest.files.push({path:edited,sha256:sha('older generated content')});
    fs.writeFileSync(manifestPath,JSON.stringify(editedManifest));
    const beforeEdited=snapshot(outDir);
    let protectedEdit=false;try{buildGuides({projectRoot:project});}catch(error){protectedEdit=error instanceof Error;}
    check(protectedEdit,'modified obsolete generated page stops build with a clear error');
    assert.deepEqual(snapshot(outDir),beforeEdited);checks++;
    fs.writeFileSync(manifestPath,cleanManifest);
    const outside=path.join(project,'dist/outside-sentinel.txt');fs.writeFileSync(outside,'synthetic outside sentinel');
    const hostile=JSON.parse(fs.readFileSync(manifestPath,'utf8'));hostile.files.push({path:'../outside-sentinel.txt',sha256:sha('synthetic outside sentinel')});
    fs.writeFileSync(manifestPath,JSON.stringify(hostile));
    try{buildGuides({projectRoot:project});}catch(error){check(error instanceof Error,'unsafe manifest rejected clearly');}
    check(fs.readFileSync(outside,'utf8')==='synthetic outside sentinel','manifest traversal cannot delete outside output directory');
    const override=planGuides({projectRoot:root,siteUrl:'https://example.test/nested/wiki/'});
    check([...override.files.values()].some(text=>text.includes('https://example.test/nested/wiki/guide/')),'site-url override reaches canonical and sitemap');
    const model=planGuides({projectRoot:root}).model;
    const marker='<img src=x onerror="globalThis.injected=true">&"';
    model.items[0].name=marker;
    const injected=planGuides({projectRoot:root,model});
    const output=[...injected.files.values()].join('\n');
    check(!output.includes(marker)&&output.includes('&lt;img'),'public data text is escaped rather than injected as HTML');
  }finally{
    const resolved=path.resolve(temporary),expected=path.resolve(parent)+path.sep;
    assert.ok(resolved.startsWith(expected)&&path.basename(resolved).startsWith('guide-fixtures-'),'cleanup stays inside this test fixture directory');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
  console.log('Static guides: '+checks+' checks passed; 124 HTML pages, local links, metadata, deterministic isolated builds, check-only mode, escaping and safe cleanup.');
  return {ok:true,checks};
}
module.exports={run};
if(require.main===module){try{run();}catch(error){console.error(error.stack||error);process.exitCode=1;}}
