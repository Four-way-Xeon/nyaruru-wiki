#!/usr/bin/env node
'use strict';
// Offline, read-only exporter. Node.js 22+. No server, save file or game process is used.
// Run from any directory: node scripts/export-data.js
// Optional: --game-dir <game root> --data-dir <unpacked data> --helper-dir <assistant lib>
// Only the allowlisted public object is written. Raw snapshots are never saved.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validate } = require('./check-data');
const project = path.resolve(__dirname, '..');
const workspace = path.resolve(project, '..');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw Error(`缺少参数 ${name}`);
  return path.resolve(process.argv[index + 1]);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function metadata(object) {
  object.meta = {};
  for (const match of String(object.note || '').matchAll(/<([^<>:]+)(:?)([^>]*)>/g)) {
    object.meta[match[1]] = match[2] === ':' ? match[3] : true;
  }
}
function plain(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/\\(?:C|I|FS|PX|PY)\[[^\]]*\]/gi, '')
    .replace(/\\[{}.!|><^]/g, '').replace(/\r\n/g, '\n').trim();
}
// Extract only named, static data/read functions into an isolated JavaScript context.
// The rest of the game source (hooks, timers, writes and runtime setup) is not executed.
function extractFunction(source, qualifiedName) {
  const start = source.indexOf(qualifiedName + ' = function(');
  if (start < 0) throw Error(`源代码缺少读取函数：${qualifiedName}`);
  const functionStart = source.indexOf('function(', start);
  const end = source.indexOf('\n};', functionStart);
  if (end < 0) throw Error(`无法解析读取函数：${qualifiedName}`);
  return source.slice(functionStart, end + 2);
}
function requirement(location) {
  return location.branch || location.conditions?.length ? '获取条件待核对' : '';
}

function build() {
  const gameDir = option('--game-dir', path.join(workspace, '测试游戏'));
  const dataDir = option('--data-dir', path.join(workspace, '修改器', 'unpacked', 'data'));
  const helperDir = option('--helper-dir', path.join(workspace, '修改器', 'tool', 'lib'));
  const XLSX = require(path.join(gameDir, 'js', 'libs', 'xlsx.mini.min.js'));
  const book = XLSX.read(fs.readFileSync(path.join(dataDir, 'story-schinese.xlsx')), { type: 'buffer' });
  const text = {}, regionDefinitions = {};
  const ui = book.Sheets['#ui'], regionSheet = book.Sheets['#region'];
  if (!ui || !regionSheet) throw Error('简体中文文本表缺少 #ui 或 #region');
  for (let row = 2; ui['A' + row]; row++) text[ui['A' + row].v] = plain(ui['B' + row]?.v);
  for (let row = 2; regionSheet['A' + row]; row++) {
    const id = Number(regionSheet['A' + row].v);
    regionDefinitions[id] = { name: plain(regionSheet['B' + row]?.v) || '???', exploreItem: [],
      autoConnectEnabled: String(regionSheet['D' + row]?.w ?? regionSheet['D' + row]?.v ?? '') === '1' };
  }
  const mapInfos = readJson(path.join(dataDir, 'MapInfos.json'));
  const maps = {};
  // Match PreloadManager: load maps listed by MapInfos, including the schematic Map001.
  for (const info of mapInfos) {
    if (!info) continue;
    const filename = `Map${String(info.id).padStart(3, '0')}.json`;
    const map = readJson(path.join(dataDir, filename));
    metadata(map);
    for (const event of map.events || []) if (event) metadata(event);
    maps[info.id] = map;
  }
  const manager = { _cacheMapData: maps, getCachedData(id) { return maps[id]; } };
  const context = vm.createContext({ DataManager: manager, $dataRegion: regionDefinitions,
    $dataMapInfos: mapInfos, NYA: { MAP: { CONST: { DATA_ID: 1 } } },
    Utils: { tryParseInt: value => parseInt(value, 10) || 0, tryParseNumber: value => Number(value) || 0 } });
  vm.runInContext('Number.prototype.clamp = function(min,max) { return Math.min(max,Math.max(min,this)); };', context);
  const mapSource = fs.readFileSync(path.join(gameDir, 'js', 'nya', 'nya_map.js'), 'utf8');
  for (const name of ['cacheThumbnailMapData', 'autoConnectDetermined', 'makePosKey', 'getThumbnailPos',
    'getThumbnailCell', 'regionColor', 'mapRegion']) {
    vm.runInContext(`DataManager.${name} = ${extractFunction(mapSource, 'DataManager.' + name)};`, context);
  }
  vm.runInContext('DataManager.cacheThumbnailMapData();', context, { timeout: 10000 });
  // Mirror PreloadManager.extractPluginResource and DataManager.cacheExploreItem.
  // Official keys are event-level; duplicate reward commands do not add collection entries.
  const official = new Set();
  for (const [mapKey, map] of Object.entries(maps)) for (const event of map.events || []) {
    if (!event) continue;
    const counts = (event.pages || []).some(page => (page.list || []).some(command => {
      if (command.code !== 357) return false;
      const [plugin, operation, , args = {}] = command.parameters || [];
      return (plugin === 'NYA.Utils' && ['addItem', 'add_coin'].includes(operation) && args.antiCollection !== 'true') ||
        (plugin === 'NYA.EVENT.AI_Adapter' && operation === 'ai' && args.type === '60');
    }));
    if (!counts) continue;
    const mapId = Number(mapKey), cell = manager.getThumbnailCell(event.x, event.y, mapId);
    if (!cell) continue;
    const key = mapId + ':' + event.id;
    official.add(key);
    regionDefinitions[cell.regionId].exploreItem.push([mapId, event.id]);
  }
  const itemSource = fs.readFileSync(path.join(gameDir, 'js', 'nya', 'nya_game_system.js'), 'utf8');
  const definitions = {}, inventoryItems = [];
  const methods = { consumables: 'Game_Consumables.prototype.data', weapons: 'Game_Weapons.prototype.data',
    stones: 'Game_Stones.prototype.data', ornaments: 'Game_Ornaments.prototype.data',
    joycoin: 'Game_Actor.prototype.joyCoinData', hpst: 'Game_Actor.prototype.hpStrengthData',
    skillst: 'Game_Actor.prototype.skillStrengthData', bell: 'Game_Ornaments.prototype.bellData' };
  for (const [type, method] of Object.entries(methods)) {
    const result = vm.runInContext(`(${extractFunction(itemSource, method)})()`, context, { timeout: 1000 });
    const group = method.endsWith('.data') ? result : { 0: result };
    definitions[type] = group;
    for (const [id, definition] of Object.entries(group)) {
      if (!(definition.name in text) || !(definition.desc in text)) throw Error(`物品翻译不完整：${type}:${id}`);
      inventoryItems.push({ type, id: Number(id), name: text[definition.name], desc: text[definition.desc] });
    }
  }
  // Existing assistant readers are reused with synthetic, empty runtime getters in this
  // isolated process. They never connect to a game, install a trainer, or inspect a save.
  const actor = Object.fromEntries(['consumables', 'weapons', 'stones', 'ornaments'].map(type =>
    ['_' + type, { data: () => definitions[type] }]));
  actor._ornaments.bellData = () => definitions.bell[0];
  actor.hpStrengthData = () => definitions.hpst[0];
  actor.skillStrengthData = () => definitions.skillst[0];
  actor.joyCoinData = () => definitions.joycoin[0];
  Object.assign(context, { $dataSystem: { switches: [], variables: [] }, $gameSwitches: { value: () => false },
    $gameVariables: { value: () => 0 }, $gameSelfSwitches: { value: () => false },
    $gameSystem: { isThumbnailActive: () => false }, $gamePlayer: { actor: () => actor },
    $gameMap: { mapId: () => 0 }, inventory: { items: inventoryItems, stats: { coin: { value: 0 } } } });
  manager.getCurrentThumbnailCell = () => null;
  const { readEncyclopedia } = require(path.join(helperDir, 'encyclopedia.js'));
  const { readWorldMap } = require(path.join(helperDir, 'world-map.js'));
  const encyclopedia = vm.runInContext(`(${readEncyclopedia.toString()})(inventory)`, context, { timeout: 10000 });
  context.encyclopedia = encyclopedia;
  const world = vm.runInContext(`(${readWorldMap.toString()})(encyclopedia)`, context, { timeout: 10000 });
  if (world.coverage.unmapped.length || world.coverage.missing.length) throw Error('存在未映射地点，停止输出');
  const markers = new Map(world.markers.map(marker => [marker.key, marker]));
  const data = {
    schemaVersion: 1,
    meta: { title: '咸鱼喵喵 Wiki · 初版', game: '咸鱼喵喵 / Nyaruru Fishy Fight', generatedAt: new Date().toISOString(),
      coverage: '涵盖地图物品指令、正数金币奖励、猫币堆和商店入口；官方收集按地图与事件编号去重。脚本动态奖励及普通敌人掉落不在此索引内。商店候选仅表示基础资料含价格，不代表当前店内售卖。',
      officialTotal: official.size, mappedOfficial: world.coverage.mappedOfficial,
      sourceNote: '离线读取游戏既有解包资料 MapInfos.json、Map*.json 与 story-schinese.xlsx 的 #ui/#region 文本；按 nya_map.js 原版缩略格映射及 nya_preload.js 官方收集规则解析，复用本项目助手 readEncyclopedia/readWorldMap 关联。仅输出公开资料白名单；未读取存档、未连接游戏、未包含玩家进度。游戏文字与数据权利归原作者，本页为非官方资料原型。' },
    items: encyclopedia.items.map(item => ({ key: item.type + ':' + item.id, type: item.type, id: item.id,
      name: plain(item.name), desc: plain(item.desc), price: item.price ?? null, shopCandidate: !!item.shopCandidate })),
    locations: encyclopedia.locations.map(location => {
      const marker = markers.get(location.key);
      return { key: location.key, itemKey: location.type + ':' + location.id, type: location.type, id: location.id,
        kind: location.kind, amount: location.amount ?? null, mapId: location.mapId, mapName: plain(location.mapName),
        area: plain(location.area), regionId: marker.regionId, eventId: location.eventId, x: location.x, y: location.y,
        official: !!location.official, collectionKey: location.mapId + ':' + location.eventId,
        sourceNote: plain(location.sourceNote), requirementNote: requirement(location), cellKey: marker.cellKey, page: marker.page };
    }),
    shops: encyclopedia.shops.map(shop => ({ mapId: shop.mapId, mapName: plain(shop.mapName), area: plain(shop.area),
      regionId: shop.regionId, eventId: shop.eventId, x: shop.x, y: shop.y, requirementNote: requirement(shop) })),
    regions: world.regions.map(region => ({ id: region.id, name: plain(region.name), color: region.color })),
    pages: world.pages.map(page => ({ id: page.id, label: page.label, regionIds: Array.from(page.regionIds),
      minX: page.minX, maxX: page.maxX, minY: page.minY, maxY: page.maxY })),
    cells: world.cells.map(cell => ({ key: cell.key, page: cell.page, regionId: cell.regionId, mapId: cell.mapId,
      mapName: plain(cell.mapName), x: cell.x, y: cell.y, hidden: !!cell.hidden,
      walls: { left: cell.walls.left, top: cell.walls.top, right: cell.walls.right, bottom: cell.walls.bottom },
      exits: { left: cell.exits.left, top: cell.exits.top, right: cell.exits.right, bottom: cell.exits.bottom } }))
  };
  const summary = validate(data);
  const mapped = new Set(data.locations.filter(location => location.official).map(location => location.collectionKey));
  if ([...official].some(key => !mapped.has(key)) || mapped.size !== official.size) throw Error('官方收集集合不一致');
  const output = path.join(project, 'dist', 'data.js');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '// Generated by scripts/export-data.js. Public reference data only.\nwindow.NYARURU_DATA = ' +
    JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n');
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}
if (require.main === module) {
  try { build(); } catch (error) { console.error('导出失败：' + error.message); process.exitCode = 1; }
}
module.exports = { build };
