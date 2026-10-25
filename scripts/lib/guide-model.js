'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const dataFiles = Object.freeze({
  data: ['data.js', 'NYARURU_DATA'],
  icons: ['icons.js', 'NYARURU_ICONS'],
  characters: ['characters.js', 'NYARURU_CHARACTERS'],
  endings: ['endings.js', 'NYARURU_ENDINGS'],
  achievements: ['achievements.js', 'NYARURU_ACHIEVEMENTS'],
  overview: ['world-overview.js', 'NYARURU_OVERVIEW']
});
const typeNames = Object.freeze({ consumables: '食物', weapons: '武器', stones: '鱼眼宝石', ornaments: '配饰', joycoin: '弧晶硬币', hpst: '逗猫棒', skillst: '猫抓板', bell: '铃铛', coin: '金币' });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function safeUrl(value) {
  const url = new URL(String(value));
  assert.ok(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Only public HTTP(S) links');
  return url.href;
}
function assetPath(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^assets\/[A-Za-z0-9/_-]+\.(?:png|jpg|jpeg|svg|webp)$/i, 'Local game image path');
  assert.ok(!value.split('/').includes('..'));
  return value;
}
function slug(value) {
  assert.match(String(value), /^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Stable public ID');
  return String(value).toLowerCase().replace(/_/g, '-');
}
function unique(entries, field, label) {
  assert.ok(Array.isArray(entries), label + ' list');
  assert.equal(new Set(entries.map(x => x[field])).size, entries.length, label + ' unique IDs');
}
function createGuideModel(raw) {
  // JSON values from the trusted repository exports only; player data is never an input.
  const data = raw.data;
  assert.ok(data && raw.icons && raw.characters && raw.endings && raw.achievements && raw.overview, 'All public datasets required');
  const items = data.items.map(item => ({ ...item, slug: slug(item.type) + '-' + slug(item.id), icon: raw.icons.items[item.key] || null }));
  const characters = raw.characters.characters.map((entry, index) => ({ ...entry, slug: entry.identitySpoiler ? 'unrevealed-' + (index + 1) : slug(entry.id) }));
  const endings = raw.endings.items.map(entry => ({ ...entry, slug: slug(entry.id) }));
  const achievements = raw.achievements.items.map((entry, index) => ({ ...entry, slug: slug(entry.id), safeTitle: '未揭晓的成就 · ' + String(index + 1).padStart(2, '0') }));
  const regions = data.regions.map(entry => ({ ...entry, slug: slug(entry.id) }));
  for (const [entries, field, label] of [[items,'key','items'],[characters,'id','characters'],[endings,'id','endings'],[achievements,'id','achievements'],[regions,'id','regions']]) {
    unique(entries, field, label); unique(entries, 'slug', label + ' paths');
  }
  const model = {
    items, characters, endings, achievements, regions,
    locations: data.locations, shops: data.shops, cells: data.cells,
    overview: raw.overview,
    meta: { data: data.meta, icons: raw.icons.source, characters: raw.characters.sources, endings: raw.endings.meta, achievements: raw.achievements.meta },
    counts: { items: items.length, characters: characters.length, endings: endings.length, achievements: achievements.length, regions: regions.length,
      cells: data.cells.length, officialEvents: data.meta.officialTotal,
      html: 6 + items.length + characters.length + endings.length + achievements.length + regions.length }
  };
  for (const item of model.items) assert.ok(item.icon, 'Original item icon: ' + item.key);
  for (const list of [model.items, model.characters, model.endings, model.achievements]) for (const entry of list) {
    for (const image of [entry.icon, entry.pixel, entry.portrait]) if (image) {
      assetPath(image.src); assert.ok(Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0);
    }
  }
  return model;
}
function loadGuideModel(projectRoot = path.resolve(__dirname, '../..')) {
  const raw = {};
  for (const [name, [filename, globalName]] of Object.entries(dataFiles)) {
    const context = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
    vm.runInContext(fs.readFileSync(path.join(projectRoot, 'dist', filename), 'utf8'), context, { timeout: 1500, filename });
    assert.ok(context.window[globalName], 'Dataset export: ' + globalName);
    raw[name] = JSON.parse(JSON.stringify(context.window[globalName]));
  }
  return createGuideModel(raw);
}

module.exports = { dataFiles, typeNames, escapeHtml, safeUrl, assetPath, slug, createGuideModel, loadGuideModel };
