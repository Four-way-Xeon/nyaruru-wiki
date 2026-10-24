#!/usr/bin/env node
'use strict';
// Read-only, offline extraction. Never loads a save or executes game event scripts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const project = path.resolve(__dirname, '..');
const workspace = path.resolve(project, '..');
const directions = {
  left: { dx: -1, dy: 0, opposite: 'right', flag: 'eol', title: '左侧' },
  right: { dx: 1, dy: 0, opposite: 'left', flag: 'eor', title: '右侧' },
  top: { dx: 0, dy: -1, opposite: 'bottom', flag: 'eot', title: '上侧' },
  bottom: { dx: 0, dy: 1, opposite: 'top', flag: 'eob', title: '下侧' }
};
function option(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error(`缺少参数 ${name}`);
  return path.resolve(process.argv[i + 1]);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function metadata(object) {
  object.meta = {};
  for (const m of String(object.note || '').matchAll(/<([^<>:]+)(:?)([^>]*)>/g)) object.meta[m[1]] = m[2] ? m[3] : true;
}
function extractFunction(source, name) {
  const start = source.indexOf(name + ' = function(');
  if (start < 0) throw Error(`缺少原版读取函数 ${name}`);
  const begin = source.indexOf('function(', start), end = source.indexOf('\n};', begin);
  if (end < 0) throw Error(`无法解析原版读取函数 ${name}`);
  return source.slice(begin, end + 2);
}
function readPublicData() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(project, 'dist/data.js'), 'utf8'), context, { timeout: 5000 });
  return context.window.NYARURU_DATA;
}
function loadSources() {
  const gameDir = option('--game-dir', path.join(workspace, '测试游戏'));
  const dataDir = option('--data-dir', path.join(workspace, '修改器/unpacked/data'));
  const data = readPublicData();
  const mapInfos = readJson(path.join(dataDir, 'MapInfos.json')), maps = {};
  for (const info of mapInfos.filter(Boolean)) {
    const map = readJson(path.join(dataDir, `Map${String(info.id).padStart(3, '0')}.json`));
    metadata(map);
    for (const event of map.events.filter(Boolean)) metadata(event);
    maps[info.id] = map;
  }
  const XLSX = require(path.join(gameDir, 'js/libs/xlsx.mini.min.js'));
  const sheet = XLSX.read(fs.readFileSync(path.join(dataDir, 'story-schinese.xlsx')), { type: 'buffer' }).Sheets['#region'];
  const regionDefinitions = {};
  for (let r = 2; sheet['A' + r]; r++) regionDefinitions[Number(sheet['A' + r].v)] = {
    autoConnectEnabled: String(sheet['D' + r]?.w ?? sheet['D' + r]?.v ?? '') === '1'
  };
  const manager = { getCachedData: id => maps[id] };
  const context = vm.createContext({ DataManager: manager, $dataRegion: regionDefinitions,
    $dataMapInfos: mapInfos, NYA: { MAP: { CONST: { DATA_ID: 1 } } },
    Utils: { tryParseInt: x => parseInt(x, 10) || 0, tryParseNumber: x => Number(x) || 0 } });
  vm.runInContext('Number.prototype.clamp = function(a,b) { return Math.min(b,Math.max(a,this)); };', context);
  const source = fs.readFileSync(path.join(gameDir, 'js/nya/nya_map.js'), 'utf8');
  for (const name of ['cacheThumbnailMapData', 'autoConnectDetermined', 'makePosKey', 'getThumbnailPos', 'getThumbnailCell']) {
    vm.runInContext(`DataManager.${name} = ${extractFunction(source, 'DataManager.' + name)};`, context);
  }
  vm.runInContext('DataManager.cacheThumbnailMapData();', context, { timeout: 10000 });
  // Guard the particular game semantics this exporter mirrors. No gameplay functions are run.
  const triggerSource = fs.readFileSync(path.join(gameDir, 'js/nya/nya_event_trigger.js'), 'utf8');
  for (const expression of ['cell.eot || connectCell.eob', 'cell.eob || connectCell.eot',
    'cell.eol || connectCell.eor', 'cell.eor || connectCell.eol']) {
    if (!triggerSource.includes(expression)) throw Error('原版自动切图规则已变化，请重新核对');
  }
  return { data, maps, manager };
}
function buildOverview({ data, maps, manager }) {
  const publicByKey = new Map(data.cells.map(c => [c.key, c]));
  const keyOf = c => `${c.page}:${c.x}:${c.y}`;
  const publicCell = c => c && publicByKey.get(keyOf(c));
  const rawCells = Object.values(manager._thumbnailMapCell);
  const byPosition = new Map(rawCells.map(c => [`${c.x}:${c.y}`, c]));
  const regionById = new Map(data.regions.map(r => [r.id, r]));
  const endpoint = (cell, side, role) => ({ regionId: cell.regionId, cellKey: keyOf(cell), mapId: cell.mapId,
    side, label: `${regionById.get(cell.regionId).name} · 地图 ${cell.mapId} ${directions[side].title}${role}` });
  const connections = [], seen = new Map();
  const pairKey = (a, b) => [keyOf(a), keyOf(b)].sort().join('|');
  for (const cell of rawCells) {
    const published = publicCell(cell);
    if (!published || published.mapId !== cell.mapId || published.regionId !== cell.regionId) throw Error('总览与既有地图格子不一致');
    // Right/bottom visits each adjacent pair exactly once. Runtime accepts an offset
    // tag on either side, so the topology supports both directions, subject to gameplay.
    for (const side of ['right', 'bottom']) {
      const direction = directions[side], reverse = directions[direction.opposite];
      const next = byPosition.get(`${cell.x + direction.dx}:${cell.y + direction.dy}`);
      if (!next || next.regionId === cell.regionId || next.mapId === cell.mapId) continue;
      if (!(cell[direction.flag] || next[reverse.flag])) continue;
      const connection = { key: 'boundary:' + pairKey(cell, next), from: endpoint(cell, side, '出口'),
        to: endpoint(next, direction.opposite, '入口'), bidirectional: true, kind: 'boundary',
        note: `Map001 相邻缩略格 ${keyOf(cell)} ↔ ${keyOf(next)}；${direction.flag}/${reverse.flag} 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。` };
      connections.push(connection); seen.set(pairKey(cell, next), connection);
    }
  }
  const transferCandidates = [], excluded = { storyOrConditional: 0, unmapped: 0, dynamic: 0, sameRegion: 0 };
  for (const [mapKey, map] of Object.entries(maps)) {
    const mapId = Number(mapKey);
    for (const event of map.events.filter(Boolean)) for (const [pageIndex, page] of event.pages.entries()) {
      const range = page.list.find(c => c.code === 357 && c.parameters[0] === 'NYA.EVENT.TRIGGER_Adapter' && c.parameters[1] === 'range');
      for (const command of page.list) {
        if (command.code !== 201) continue;
        const [mode, destMap, x, y] = command.parameters;
        if (mode !== 0) { excluded.dynamic++; continue; }
        const from = publicCell(manager.getThumbnailCell(event.x, event.y, mapId));
        const to = maps[destMap] && publicCell(manager.getThumbnailCell(x, y, destMap));
        if (!from || !to || from.mapId !== mapId || to.mapId !== destMap) { excluded.unmapped++; continue; }
        if (from.regionId === to.regionId) { excluded.sameRegion++; continue; }
        if (seen.has(pairKey(from, to))) continue;
        // Conservative ordinary-exit rule: local touch/action event, fixed destination,
        // unconditional event page and unconditional transfer command, no story call.
        // Conditional story portals and their Map001 <c> links are deliberately excluded.
        const conditional = Object.entries(page.conditions || {}).some(([k, v]) => k.endsWith('Valid') && v);
        const story = page.list.some(c => c.code === 357 && c.parameters[0] === 'NYA.ACHIEVES_Adapter' && c.parameters[1] === 'call_story');
        if (!range || page.trigger > 2 || conditional || command.indent !== 0 || story) { excluded.storyOrConditional++; continue; }
        transferCandidates.push({ from, to, mapId, destMap, eventId: event.id, pageIndex,
          sourceX: event.x, sourceY: event.y, x, y, hasOverride: event.pages.length > pageIndex + 1 });
      }
    }
  }
  const localSide = (cell, other, x, y) => {
    const dx = other.x - cell.x, dy = other.y - cell.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) return dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'bottom' : 'top';
    const map = maps[cell.mapId];
    return [['left', x], ['right', map.width - 1 - x], ['top', y], ['bottom', map.height - 1 - y]].sort((a, b) => a[1] - b[1])[0][0];
  };
  for (const candidate of transferCandidates) {
    const { from, to } = candidate, pair = pairKey(from, to);
    if (seen.has(pair)) continue;
    const reverse = transferCandidates.find(t => t.from.key === to.key && t.to.key === from.key);
    const fromSide = localSide(from, to, candidate.sourceX, candidate.sourceY);
    const toSide = reverse ? localSide(to, from, reverse.sourceX, reverse.sourceY) : localSide(to, from, candidate.x, candidate.y);
    const evidence = t => `Map${String(t.mapId).padStart(3, '0')} 事件 ${t.eventId} 第 ${t.pageIndex + 1} 页 code201 → 地图 ${t.destMap} (${t.x},${t.y})`;
    const connection = { key: 'transfer:' + pair, from: endpoint(from, fromSide, '出口'), to: endpoint(to, toSide, '入口'),
      bidirectional: !!reverse, kind: 'transfer', note: evidence(candidate) + (reverse ? '；返程 ' + evidence(reverse) : '；仅核实此方向，未发现对应返程出口') +
        '。方位按相邻缩略格或事件所在地图边缘标示。' + ((candidate.hasOverride || reverse?.hasOverride) ? '事件存在后续条件页，通行可能受剧情阶段限制。' : '') };
    connections.push(connection); seen.set(pair, connection);
  }
  const regions = data.regions.map(region => {
    const cells = data.cells.filter(c => c.regionId === region.id);
    if (new Set(cells.map(c => c.page)).size !== 1) throw Error('区域跨页面：请先重新核对总览布局');
    return { id: region.id, offsetX: 0, offsetY: 0, minX: Math.min(...cells.map(c => c.x)), minY: Math.min(...cells.map(c => c.y)),
      maxX: Math.max(...cells.map(c => c.x)), maxY: Math.max(...cells.map(c => c.y)) };
  });
  const linked = new Set(connections.flatMap(c => [c.from.regionId, c.to.regionId]));
  const unlinked = data.regions.filter(r => !linked.has(r.id));
  const specialConnections = [];
  for (const cell of rawCells) {
    const target = manager._thumbnailMapCell[cell.connect];
    if (!target || target.regionId === cell.regionId) continue;
    if (!publicCell(target)) throw Error('原版特殊连接目标缺少公开地图格子');
    const dx = target.x - cell.x, dy = target.y - cell.y;
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
    const from = endpoint(cell, side, '特殊连接点'), to = endpoint(target, directions[side].opposite, '特殊连接点');
    // These are schematic anchor directions, not a claim about a physical map edge.
    from.label = `${regionById.get(cell.regionId).name} · 地图 ${cell.mapId} 特殊连接点`;
    to.label = `${regionById.get(target.regionId).name} · 地图 ${target.mapId} 特殊连接点`;
    specialConnections.push({ key: 'story:' + keyOf(cell) + '>' + keyOf(target), from, to,
      bidirectional: target.connect === manager.makePosKey(cell.x, cell.y), kind: 'story',
      note: `Map001 的 c 标签明确连接缩略格 ${keyOf(cell)} → ${keyOf(target)}（nya_map.js 原版特殊路径链接）。剧情或特殊传送，实际触发条件与返程方式待核对；不作为普通步行出口。` });
  }
  return { schemaVersion: 1, regions, connections, specialConnections,
    meta: { coverage: '依据 Map001 原版缩略格、nya_map.js 坐标映射、nya_event_trigger.js 自动边界规则与各地图固定 code201 接触/门口事件核对。仅展示普通跨区域出口；双向表示两向连接有依据，不代表任意剧情阶段或能力状态均可通行。剧情传送、动态传送与同区域路线未混入普通出口。',
      layout: '保留 Map001 全局格子坐标与同页相对位置；996 格互不重叠。区域包围框可以相交，不等于地图格子重叠。方位为示意，不代表实地距离。',
      unlinkedRegionIds: unlinked.map(r => r.id),
      unlinkedNote: unlinked.map(r => r.name).join('、') + '未核实到普通跨区域出口；保留原坐标独立展示，不推测连线。',
      excludedNote: '另列原版 c 标签核实的学校→封印结界、森林城堡→封印结界·里、冰雪山丘→星之海特殊连接，触发条件待核对，不属于普通步行出口。其余动态/剧情事件未枚举；崩坏的结界与头目连战不据地名补线。',
      sourceCounts: { cells: data.cells.length, regions: regions.length,
        boundary: connections.filter(c => c.kind === 'boundary').length,
        transfer: connections.filter(c => c.kind === 'transfer').length, special: specialConnections.length, excludedCommands: excluded } } };
}
function build() {
  const sources = loadSources(), overview = buildOverview(sources);
  const { validate } = require('./check-world-overview');
  const summary = validate(overview, sources.data);
  fs.writeFileSync(path.join(project, 'dist/world-overview.js'), '// Generated offline by scripts/export-world-overview.js. Public map topology only.\nwindow.NYARURU_OVERVIEW = ' +
    JSON.stringify(overview, null, 2).replace(/</g, '\\u003c') + ';\n');
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}
if (require.main === module) {
  try { build(); } catch (error) { console.error('总览导出失败：' + error.message); process.exitCode = 1; }
}
module.exports = { build, loadSources, buildOverview };
