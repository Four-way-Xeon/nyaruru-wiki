#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const fields = {
  root: 'schemaVersion meta items locations shops regions pages cells',
  meta: 'title game generatedAt coverage officialTotal mappedOfficial sourceNote',
  items: 'key type id name desc price shopCandidate',
  locations: 'key itemKey type id kind amount mapId mapName area regionId eventId x y official collectionKey sourceNote requirementNote cellKey page',
  shops: 'mapId mapName area regionId eventId x y requirementNote',
  regions: 'id name color', pages: 'id label regionIds minX maxX minY maxY',
  cells: 'key page regionId mapId mapName x y hidden walls exits', directions: 'left top right bottom'
};
function exact(object, kind) {
  assert(object && typeof object === 'object' && !Array.isArray(object), `${kind} 必须是对象`);
  assert.equal(Object.keys(object).sort().join(' '), fields[kind].split(' ').sort().join(' '), `${kind} 字段不符合公开白名单`);
}
function unique(rows, key, label) {
  const keys = rows.map(row => row[key]);
  assert.equal(new Set(keys).size, keys.length, `${label} 有重复编号`);
  return new Map(rows.map(row => [row[key], row]));
}
function integer(value, label) { assert(Number.isSafeInteger(value), `${label} 不是整数`); }
function walk(value) {
  if (typeof value === 'string') {
    assert(!/[a-z]:[\\/]|file:\/\/|127\.0\.0\.1|localhost|<[^>]+>|\$game|__nyaruru|STATIC_TEXT_|(?:独立)?开关\s|变量\s/i.test(value), '包含内部文本、路径或未转换文本');
  } else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    assert(!/^(count|equipped|collected|explored|player|conditions|met|subject|stats|capacity|openTask|eventName|antiCollection)$/i.test(key), `包含运行态字段 ${key}`);
    walk(child);
  }
}
function validate(data) {
  exact(data, 'root'); exact(data.meta, 'meta'); assert.equal(data.schemaVersion, 1);
  for (const kind of ['items', 'locations', 'shops', 'regions', 'pages', 'cells']) {
    assert(Array.isArray(data[kind]), `${kind} 必须是数组`);
    for (const row of data[kind]) exact(row, kind);
  }
  walk(data);
  const items = unique(data.items, 'key', '物品'), locations = unique(data.locations, 'key', '奖励地点');
  const cells = unique(data.cells, 'key', '地图格'), pages = unique(data.pages, 'id', '地图页');
  const regions = unique(data.regions, 'id', '区域');
  assert(!Number.isNaN(Date.parse(data.meta.generatedAt)), '导出时间无效');
  for (const item of items.values()) {
    assert.equal(item.key, `${item.type}:${item.id}`); integer(item.id, '物品编号');
    assert(item.name && typeof item.desc === 'string', '物品名称或描述缺失');
    assert(item.price === null || (Number.isFinite(item.price) && item.price >= 0), '价格无效');
    assert.equal(item.shopCandidate, Number(item.price) > 0, '商店候选与基础价格不一致');
  }
  for (const page of pages.values()) {
    integer(page.id, '地图页编号');
    for (const id of page.regionIds) assert(regions.has(id), '地图页引用未知区域');
    const group = data.cells.filter(cell => cell.page === page.id);
    assert(group.length > 0, '空地图页');
    for (const [axis, min, max] of [['x', 'minX', 'maxX'], ['y', 'minY', 'maxY']]) {
      assert.equal(page[min], Math.min(...group.map(cell => cell[axis])));
      assert.equal(page[max], Math.max(...group.map(cell => cell[axis])));
    }
  }
  for (const cell of cells.values()) {
    assert.equal(cell.key, `${cell.page}:${cell.x}:${cell.y}`);
    for (const name of ['page', 'regionId', 'mapId', 'x', 'y']) integer(cell[name], name);
    assert(pages.has(cell.page) && regions.has(cell.regionId), '地图格页面或区域缺失');
    assert.equal(typeof cell.hidden, 'boolean');
    for (const name of ['walls', 'exits']) { exact(cell[name], 'directions'); for (const value of Object.values(cell[name])) assert.equal(typeof value, 'boolean'); }
  }
  for (const location of locations.values()) {
    assert.equal(location.itemKey, `${location.type}:${location.id}`);
    assert(items.has(location.itemKey), '奖励引用未知物品');
    assert.equal(location.collectionKey, `${location.mapId}:${location.eventId}`);
    const cell = cells.get(location.cellKey);
    assert(cell, '奖励地点缺少地图格');
    assert.equal(cell.mapId, location.mapId, '奖励地图编号不匹配');
    assert.equal(cell.page, location.page, '奖励地图页不匹配');
    assert.equal(cell.regionId, location.regionId, '奖励区域不匹配');
    assert.equal(typeof location.official, 'boolean');
    for (const name of ['id', 'mapId', 'regionId', 'eventId']) integer(location[name], name);
    assert(Number.isFinite(location.x) && Number.isFinite(location.y), '奖励坐标无效');
    assert(location.amount === null || Number.isFinite(location.amount), '奖励数量无效');
    assert(['', '获取条件待核对'].includes(location.requirementNote), '条件说明包含未核实文本');
  }
  for (const shop of data.shops) {
    assert(regions.has(shop.regionId), '商店区域不存在');
    assert(data.cells.some(cell => cell.mapId === shop.mapId), '商店地图不存在');
    assert(['', '获取条件待核对'].includes(shop.requirementNote));
  }
  const official = new Set(data.locations.filter(location => location.official).map(location => location.collectionKey));
  assert.equal(official.size, data.meta.officialTotal, '官方收集数量不一致');
  assert.equal(official.size, data.meta.mappedOfficial, '官方收集地图映射不完整');
  // This prototype targets the already verified game dataset. Fail instead of silently
  // publishing a truncated export or an unreviewed new game version.
  for (const [key, expected] of Object.entries({ items: 49, locations: 426, regions: 16, pages: 12, cells: 996 })) {
    assert.equal(data[key].length, expected, `${key} 与已核对版本不一致`);
  }
  assert.equal(official.size, 411, '官方收集应为 411 个唯一事件');
  return { items: items.size, locations: locations.size, officialCollections: official.size,
    mappedOfficial: data.meta.mappedOfficial, shops: data.shops.length, regions: regions.size,
    pages: pages.size, cells: cells.size, privacy: 'public allowlist passed', joins: 'all passed' };
}
if (require.main === module) {
  try {
    const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'data.js'));
    const context = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { timeout: 5000 });
    console.log(JSON.stringify({ ok: true, ...validate(context.window.NYARURU_DATA) }, null, 2));
  } catch (error) { console.error('校验失败：' + error.message); process.exitCode = 1; }
}
module.exports = { validate };
