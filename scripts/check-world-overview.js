#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function validate(overview, data) {
  assert.equal(overview.schemaVersion, 1, '总览版本错误');
  assert.equal(overview.regions.length, data.regions.length, '必须包含所有区域');
  const regions = new Map(overview.regions.map(r => [r.id, r])), cells = new Map(data.cells.map(c => [c.key, c]));
  assert.equal(regions.size, overview.regions.length, '区域重复');
  const positions = new Set();
  for (const region of data.regions) {
    const entry = regions.get(region.id);
    assert(entry, `缺少区域 ${region.id}`);
    for (const k of ['offsetX', 'offsetY', 'minX', 'minY', 'maxX', 'maxY']) assert(Number.isFinite(entry[k]), `区域 ${region.id} ${k} 无效`);
    const members = data.cells.filter(c => c.regionId === region.id);
    assert.equal(entry.minX, Math.min(...members.map(c => c.x + entry.offsetX)));
    assert.equal(entry.maxX, Math.max(...members.map(c => c.x + entry.offsetX)));
    assert.equal(entry.minY, Math.min(...members.map(c => c.y + entry.offsetY)));
    assert.equal(entry.maxY, Math.max(...members.map(c => c.y + entry.offsetY)));
    for (const c of members) {
      const key = `${c.x + entry.offsetX}:${c.y + entry.offsetY}`;
      assert(!positions.has(key), `总览格子重叠 ${key}`); positions.add(key);
    }
  }
  const keys = new Set(), pairs = new Set();
  const opposites = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  for (const connection of [...overview.connections, ...overview.specialConnections]) {
    assert(!keys.has(connection.key), '连线 key 重复'); keys.add(connection.key);
    assert(['boundary', 'transfer', 'story'].includes(connection.kind), '连接类型无效');
    assert.equal(overview.specialConnections.includes(connection), connection.kind === 'story', '特殊连接必须单列');
    assert.equal(typeof connection.bidirectional, 'boolean');
    assert(connection.note && /Map\d+/.test(connection.note), '缺少可追溯来源');
    assert.notEqual(connection.from.regionId, connection.to.regionId, '不得混入同区域连线');
    for (const endpoint of [connection.from, connection.to]) {
      const cell = cells.get(endpoint.cellKey);
      assert(cell, `连接格子不存在 ${endpoint.cellKey}`);
      assert.equal(endpoint.mapId, cell.mapId, '端点地图编号不匹配');
      assert.equal(endpoint.regionId, cell.regionId, '端点区域不匹配');
      assert(endpoint.side in opposites, '端点方向无效');
      assert(endpoint.label && /[\u4e00-\u9fff]/.test(endpoint.label), '缺少中文出口说明');
    }
    const pair = [connection.from.cellKey, connection.to.cellKey].sort().join('|');
    assert(!pairs.has(pair), '往返或重复出口未去重'); pairs.add(pair);
    if (connection.kind === 'boundary') {
      const from = cells.get(connection.from.cellKey), to = cells.get(connection.to.cellKey);
      assert.equal(Math.abs(from.x - to.x) + Math.abs(from.y - to.y), 1, '自动边界必须原图相邻');
      assert.equal(connection.to.side, opposites[connection.from.side]);
      assert.equal(connection.bidirectional, true);
    }
  }
  assert(overview.meta.coverage && overview.meta.unlinkedNote && overview.meta.excludedNote, '缺少覆盖/缺口说明');
  const linked = new Set(overview.connections.flatMap(c => [c.from.regionId, c.to.regionId]));
  assert.deepEqual([...overview.meta.unlinkedRegionIds].sort((a, b) => a - b), Array.from(data.regions, r => r.id).filter(id => !linked.has(id)).sort((a, b) => a - b));
  return { regions: regions.size, cells: positions.size, connections: overview.connections.length, allConnections: keys.size,
    boundary: overview.connections.filter(c => c.kind === 'boundary').length,
    transfer: overview.connections.filter(c => c.kind === 'transfer').length,
    oneWay: overview.connections.filter(c => !c.bidirectional).length, special: overview.specialConnections.length,
    unlinkedRegionIds: overview.meta.unlinkedRegionIds };
}
function main() {
  const context = { window: {} }, project = path.resolve(__dirname, '..');
  for (const file of ['data.js', 'world-overview.js']) vm.runInNewContext(fs.readFileSync(path.join(project, 'dist', file), 'utf8'), context, { timeout: 5000 });
  const summary = validate(context.window.NYARURU_OVERVIEW, context.window.NYARURU_DATA);
  // Mutation checks ensure that real failure modes are detected by this validator.
  for (const mutate of [o => o.connections[0].from.cellKey = 'missing', o => o.connections[0].to.mapId = -1,
    o => o.regions.pop(), o => o.connections.push(o.connections[0]), o => o.connections[0].from.side = 'north']) {
    const invalid = JSON.parse(JSON.stringify(context.window.NYARURU_OVERVIEW)); mutate(invalid);
    assert.throws(() => validate(invalid, context.window.NYARURU_DATA));
  }
  console.log(JSON.stringify({ ok: true, ...summary, rejectedInvalidFixtures: 5 }, null, 2));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error('总览校验失败：' + error.message); process.exitCode = 1; }
}
module.exports = { validate };
