/* Read-only Steam binary KeyValues reader, independently implemented.
 * Format evidence and public schema provenance: .qa/achievement-research/parser-notes.txt.
 * No filesystem discovery, account identity, writes, network, or game runtime.
 */
(function(root,factory){
  'use strict'; const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NYARURU_ACHIEVEMENT_PARSE=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const limits=Object.freeze({inputBytes:4*1024*1024,depth:48,nodes:50000,stringBytes:16384});
  // Public schema for app 1478160. Holes 8, 26, 28 in group 1 are intentional.
  const group1=['N1','N2','N3','N4','N5','N6','N7','N8',null,'N9','N10','BR','BR_30star','BR_40star','BR_50star',
    'HIDDEN1','HIDDEN2','HIDDEN3','HIDDEN4','HIDDEN5','HIDDEN6','HIDDEN7','HIDDEN8','HIDDEN9','HIDDEN10','N11',null,'HIDDEN11',null,'ED1','ED2','ED3'];
  const mapping=Object.freeze([...group1.map((id,bit)=>({id,statId:1,bit})),
    ...['ED4','ED5','HIDDEN12'].map((id,bit)=>({id,statId:2,bit}))].filter(x=>x.id).map(Object.freeze));
  const errors=Object.freeze({INPUT:'请选择 Steam 成就缓存二进制文件。',SIZE:'文件超过 4 MiB 的本地解析上限。',
    FILENAME:'请选择原始文件名为 UserGameStats_账号数字_1478160.bin 的文件；其他游戏和公共定义文件不适用。',
    FORMAT:'无法识别此 Steam 缓存格式，文件可能损坏或来自尚未支持的版本。',
    COMPLEXITY:'Steam 缓存结构过深或过于复杂，已停止读取。',
    STRUCTURE:'未找到支持的 Steam 成就缓存结构，未推断任何成就状态。'});
  const fail=code=>{throw {achievementCode:code};};
  const own=(o,k)=>o!==null&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k);
  const field=(node,k)=>node&&node.type===0&&own(node.value,k)?node.value[k]:undefined;
  const integer=node=>node&&node.type===2?node.value:undefined;
  function decode(bytes){
    let offset=0,nodes=0; const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const decoder=new TextDecoder('utf-8',{fatal:true});
    const need=n=>{if(offset+n>bytes.length)fail('FORMAT');};
    function str(){
      const start=offset;
      while(offset<bytes.length&&bytes[offset]!==0){if(offset-start>=limits.stringBytes)fail('COMPLEXITY');offset++;}
      need(1);const s=decoder.decode(bytes.subarray(start,offset));offset++;return s;
    }
    function object(depth,root=false){
      if(depth>limits.depth)fail('COMPLEXITY');
      const value=Object.create(null);
      while(offset<bytes.length){
        const type=bytes[offset++];
        if(type===8)return {type:0,value};
        if(++nodes>limits.nodes)fail('COMPLEXITY');
        const key=str();
        if(['__proto__','constructor','prototype'].includes(key)||own(value,key))fail('FORMAT');
        let node;
        if(type===0)node=object(depth+1);
        else if(type===1)node={type,value:str()};
        else if(type===2){need(4);node={type,value:view.getUint32(offset,true)};offset+=4;}
        else if([3,4,6].includes(type)){need(4);offset+=4;node={type};}
        else if(type===7||type===10){need(8);offset+=8;node={type};}
        else fail('FORMAT');
        value[key]=node;
      }
      if(!root)fail('FORMAT');
      return {type:0,value};
    }
    const result=object(0,true);
    if(offset!==bytes.length)fail('FORMAT');
    return result;
  }
  function parseSteam(input,options={}){
    try{
      if(!(input instanceof Uint8Array)&&!(input instanceof ArrayBuffer))fail('INPUT');
      const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
      if(bytes.length>limits.inputBytes)fail('SIZE');
      // The Steam cache itself has no app ID. Never guess its game from layout.
      if(typeof options.filename!=='string'||!/^UserGameStats_[0-9]{1,20}_1478160\.bin$/i.test(options.filename))fail('FILENAME');
      if(bytes.length<8)fail('FORMAT');
      const root=decode(bytes),cache=field(root,'cache');
      if(!cache||cache.type!==0||Object.keys(root.value).length!==1)fail('STRUCTURE');
      const selected=Array.isArray(options.achievements)?new Set(options.achievements.map(x=>typeof x==='string'?x:x&&x.id)):null;
      const source='steam-cache',label='Steam 本地缓存';
      const achievements=mapping.filter(x=>!selected||selected.has(x.id)).map(({id,statId,bit})=>{
        const group=field(cache,String(statId)),mask=integer(field(group,'data'));
        const times=field(group,'AchievementTimes'),stamp=integer(field(times,String(bit)));
        let status='unknown',basis='missing-or-invalid-steam-stat-group';
        if(mask!==undefined){
          status=((mask>>>bit)&1)===1?'unlocked':'locked';basis='steam-cache-explicit-bit';
          if(status==='locked'&&stamp!==undefined&&stamp>0){status='unknown';basis='steam-cache-conflicting-bit-and-time';}
        }
        return {id,status,source,label,basis};
      });
      const coverage={total:achievements.length,unlocked:0,locked:0,unknown:0,source,label};
      for(const row of achievements)coverage[row.status]++;
      return {ok:true,achievements,coverage:{format:'steam-binary-vdf',achievements:coverage},warnings:[
        '表示所选 Steam 本地缓存的记录，可能落后于账号在线状态；未联网验证或确认文件所属账号。',
        '游戏编号由原始文件名识别，请勿改名导入其他游戏缓存。缺失或冲突字段保持未知。']};
    }catch(e){const code=e&&own(errors,e.achievementCode)?e.achievementCode:'FORMAT';return {ok:false,error:{code,message:errors[code]}};}
  }
  return Object.freeze({parseSteam,limits,version:1});
});
