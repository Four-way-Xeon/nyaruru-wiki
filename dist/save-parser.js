/* Local-only reader for the researched desktop build. No game code is executed.
 * The bounded XOR mask is derived from main.y over synthetic zero bytes.
 * Source/provenance and independent original-runtime checks: .qa/save-research/.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NYARURU_SAVE = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const limits = Object.freeze({ inputBytes: 4 * 1024 * 1024, jsonBytes: 32 * 1024 * 1024, depth: 100, nodes: 500000 });
  const MASK_BASE64 = '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kiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJ0g1bsyt9QpIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZL8o9Pu7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u/v1zOrVnkSRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJXtXOlCRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJ0rtkTq3eJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJPmhY2ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYP2Zlk9yqSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmS5FV8ATFHsk4=';
  const sourceHash = 'cd1a802662043ced03567bd58570be78f9523c3730eacb53c9b4d59677009e96';
  const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const get = (o, k) => own(o, k) ? o[k] : undefined;
  const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const errors = Object.freeze({
    INPUT: '请选择游戏的单个 .rmmzsave 存档文件。',
    SIZE: '文件超过 4 MiB 的本地解析上限。',
    EXPANSION: '解压后的数据超过 32 MiB，已停止读取。',
    BROWSER: '此浏览器缺少本地解压功能，请使用新版 Edge 或 Chrome。',
    FORMAT: '无法读取：文件可能损坏、不是游戏存档，或来自尚未支持的游戏版本。',
    STRUCTURE: '未识别到游戏进度结构；全局索引和设置文件不支持导入。',
    COMPLEXITY: '存档结构过深或过于复杂，已停止读取。',
    REFERENCES: '此存档使用了尚未支持的引用编码，未恢复任何游戏对象。',
    UNSAFE_KEYS: '存档含有不允许的对象属性，已停止读取。',
    PLATFORM: '设置文件只用于非 Steam 本地成就；请明确选择非 Steam 来源。',
    CONFIG: '未识别到游戏设置文件，请选择非 Steam 版本的 config.rmmzsave。'
  });
  const fail = code => { throw { saveReaderCode: code }; };
  async function inflate(bytes, maximum) {
    if (typeof DecompressionStream !== 'function' || typeof TextDecoder !== 'function') fail('BROWSER');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maximum) { await reader.cancel().catch(() => {}); fail('EXPANSION'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }
  let maskPromise;
  function mask() {
    if (!maskPromise) maskPromise = (async () => {
      const str = atob(MASK_BASE64), packed = Uint8Array.from(str, c => c.charCodeAt(0));
      const out = await inflate(packed, limits.inputBytes);
      if (out.length !== limits.inputBytes) fail('FORMAT');
      return out;
    })();
    return maskPromise;
  }
  function validate(tree) {
    const stack = [{value:tree, depth:0}];
    let nodes = 0;
    while (stack.length) {
      const {value, depth} = stack.pop();
      if (++nodes > limits.nodes || depth > limits.depth) fail('COMPLEXITY');
      if (!value || typeof value !== 'object') continue;
      for (const key of Object.keys(value)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail('UNSAFE_KEYS');
        // This game's JsonEx only uses '@' class labels. Legacy MV reference
        // markers are rejected, never linked/expanded or passed to constructors.
        if (key === '@r' || key === '@c' || key === '@a') fail('REFERENCES');
        stack.push({value:value[key], depth:depth+1});
        if (stack.length + nodes > limits.nodes) fail('COMPLEXITY');
      }
    }
  }
  const achievementIds = Object.freeze([
    ...Array.from({length:11},(_,i)=>'N'+(i+1)), 'BR','BR_30star','BR_40star','BR_50star',
    ...Array.from({length:12},(_,i)=>'HIDDEN'+(i+1)), ...Array.from({length:5},(_,i)=>'ED'+(i+1))
  ]);
  function achievementResult(tree, requested, source) {
    const selected = Array.isArray(requested) ? new Set(requested.map(x=>typeof x==='string'?x:get(x,'id'))) : null;
    const ids = achievementIds.filter(id=>!selected || selected.has(id));
    const dictionary = get(tree,'_achievementNative');
    const native = source === 'native-config';
    const validDictionary = native && record(dictionary) && Object.keys(dictionary).every(k=>typeof dictionary[k]==='boolean');
    const label = native ? '非 Steam 本地成就' : '普通进度存档（成就未知）';
    const achievements = ids.map(id=>{
      let status='unknown', basis=native?'missing-or-invalid-native-dictionary':'slot-has-no-platform-achievement-table';
      if (validDictionary) {
        status=dictionary[id]===true?'unlocked':'locked';
        basis=own(dictionary,id)?'native-explicit-boolean':'native-dictionary-absent-entry-is-false';
      }
      return {id,status,source,label,basis};
    });
    const coverage={total:ids.length,unlocked:0,locked:0,unknown:0,source,label};
    for (const row of achievements) coverage[row.status]++;
    return {achievements,coverage};
  }
  function extract(tree, catalog, format, requested) {
    const map = get(tree, 'map'), system = get(tree, 'system');
    if (!record(tree) || !record(map) || !record(system) ||
        (!record(get(tree,'party')) && !record(get(tree,'selfSwitches')))) fail('STRUCTURE');
    const summary = {}, inventory = [], completed = [];
    const coverage = {format, summary:{map:'unknown',playtime:'unknown',coin:'unknown'},
      inventory:{knownTypes:[],unknownTypes:[]},collections:{total:0,confirmedCompleted:0,confirmedNotCompleted:0,unknown:0}};
    if (integer(get(tree,'version'))) summary.version = tree.version;
    const mapId = get(map,'_mapId');
    if (integer(mapId) && mapId > 0) {
      summary.mapId = mapId; coverage.summary.map = 'known';
      const cell = (catalog.cells || []).find(c => c.mapId === mapId);
      const place = cell || (catalog.locations || []).find(c => c.mapId === mapId);
      if (place) {
        if (typeof place.mapName === 'string') summary.mapName = place.mapName;
        if (integer(place.regionId)) {
          summary.regionId = place.regionId;
          const region = (catalog.regions || []).find(r => r.id === place.regionId);
          if (region && typeof region.name === 'string') summary.regionName = region.name;
        }
      }
    }
    const frames = get(system,'_framesOnSave');
    if (integer(frames)) {
      const secs = Math.floor(frames / 60);
      summary.playtimeSeconds = secs;
      summary.playtime = [Math.floor(secs/3600),Math.floor(secs/60)%60,secs%60].map(n=>String(n).padStart(2,'0')).join(':');
      coverage.summary.playtime = 'known';
    }
    const actorIds = get(get(tree,'party'),'_actors'), actorData = get(get(tree,'actors'),'_data');
    const leader = Array.isArray(actorIds) && integer(actorIds[0]) && actorIds[0] > 0 ? get(actorData,String(actorIds[0])) : undefined;
    if (integer(get(leader,'_coin'))) { summary.coin = leader._coin; coverage.summary.coin = 'known'; }
    const items = Array.isArray(catalog.items) ? catalog.items : [];
    const supported = ['consumables','weapons','stones','ornaments','coin','joycoin','hpst','skillst'];
    for (const type of supported) {
      let known = false;
      const box = get(leader,'_'+type), unlocked = get(box,'_unlock'), equipped = get(box,'_equip');
      const scalar = {coin:'_coin',joycoin:'_joyCoin',hpst:'_hpStrengthItem',skillst:'_skillStrengthItem'}[type];
      if (scalar) {
        const count = get(leader,scalar); known = integer(count);
        if (known && count > 0 && items.some(i=>i.key===type+':0')) inventory.push({itemKey:type+':0',count});
      } else if (type === 'consumables') {
        const counts = get(box,'_data');
        known = record(counts) && Object.keys(counts).every(k=>k === '@' || (/^\d+$/.test(k) && integer(counts[k])));
        if (known) for (const item of items.filter(i=>i.type === type)) {
          const count = get(counts,String(item.id));
          if (integer(count) && count > 0) inventory.push({itemKey:item.key,count});
        }
      } else {
        known = Array.isArray(unlocked) && unlocked.every(integer);
        if (known) for (const item of items.filter(i=>i.type === type && unlocked.includes(i.id))) {
          const row = {itemKey:item.key,count:1};
          if (type === 'weapons' && integer(get(box,'_currentWeapon'))) row.equipped = box._currentWeapon === item.id;
          else if (Array.isArray(equipped) && equipped.every(integer)) row.equipped = equipped.includes(item.id);
          inventory.push(row);
        }
      }
      coverage.inventory[known?'knownTypes':'unknownTypes'].push(type);
    }
    // Bell totals depend on additional event lists outside this public catalogue.
    coverage.inventory.unknownTypes.push('bell');
    const switches = get(get(tree,'selfSwitches'),'_data');
    const keys = new Set((catalog.locations || []).filter(l=>l.official === true && /^\d+:\d+$/.test(l.collectionKey || '')).map(l=>l.collectionKey));
    coverage.collections.total = keys.size;
    for (const key of keys) {
      const state = get(switches,key.replace(':',',')+',A');
      if (state === true) completed.push(key);
      else if (state === false) coverage.collections.confirmedNotCompleted++;
      else coverage.collections.unknown++;
    }
    coverage.collections.confirmedCompleted = completed.length;
    const warnings = ['仅对当前核验游戏版本提供读取；不会修改游戏或自动合并手动清单。',
      '部分收集点的状态未能从存档确认，已保留为未知。', '暂不能从存档确认铃铛数量。'];
    const achievementData=achievementResult(tree,requested,'slot');
    coverage.achievements=achievementData.coverage;
    warnings.push('普通进度存档不含完整平台成就表，成就状态保留为未知；Steam 成就不从剧情开关推断。');
    return {ok:true,summary,inventory,completed,achievements:achievementData.achievements,coverage,warnings};
  }
  async function parse(input, options = {}) {
    try {
      if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) fail('INPUT');
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      if (bytes.byteLength > limits.inputBytes) fail('SIZE');
      if (bytes.byteLength < 6) fail('FORMAT');
      const key = await mask(), transformed = new Uint8Array(bytes.length);
      for (let i=0;i<bytes.length;i++) transformed[i] = bytes[i] ^ key[i];
      let json, format = 'desktop-xor-zlib';
      try { json = await inflate(transformed,limits.jsonBytes); }
      catch (e) {
        if (e.saveReaderCode) throw e;
        format = 'zlib';
        json = await inflate(bytes,limits.jsonBytes);
      }
      const text = new TextDecoder('utf-8',{fatal:true}).decode(json);
      const tree = JSON.parse(text);
      validate(tree);
      if (options.kind === 'native-config') {
        if (options.platform !== 'native') fail('PLATFORM');
        if (!record(tree) || own(tree,'map') || own(tree,'system') ||
            !(own(tree,'_achievementNative') || (integer(get(tree,'_version')) && typeof get(tree,'bgmVolume')==='number'))) fail('CONFIG');
        const result=achievementResult(tree,options.achievements,'native-config');
        return {ok:true,achievements:result.achievements,coverage:{format,achievements:result.coverage},
          warnings:['仅表示所选非 Steam 设置文件中的本地记录，不代表 Steam 或 4399 账号成就。',
            '完整有效的本地成就字典中未出现的条目，按游戏原版规则视为本地未解锁；缺失或异常字典保持未知。']};
      }
      return extract(tree, options.catalog || {}, format, options.achievements);
    } catch (e) {
      const code = e && own(errors,e.saveReaderCode) ? e.saveReaderCode : 'FORMAT';
      return {ok:false,error:{code,message:errors[code]}};
    }
  }
  async function parseConfig(input, options={}) { return parse(input,{...options,kind:'native-config'}); }
  return Object.freeze({parse,parseConfig,limits,sourceHash,version:2});
});
