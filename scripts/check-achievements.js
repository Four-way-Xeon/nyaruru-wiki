#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { sourceRows, publicSchema, signature, sha256 } = require('./export-achievements');
const project = path.resolve(__dirname, '..'), workspace = path.dirname(project), dist = path.join(project, 'dist');
const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(dist, 'achievements.js'), 'utf8'), context, { timeout: 1000 });
const data = context.window.NYARURU_ACHIEVEMENTS; assert.equal(data.schemaVersion, 1);
assert.equal(data.items.length, 32); assert.equal(new Set(data.items.map(x => x.id)).size, 32);
const expected = ['N1','N2','N3','N4','N5','N6','N7','N8','N9','N10','BR','BR_30star','BR_40star','BR_50star','HIDDEN1','HIDDEN2','HIDDEN3','HIDDEN4','HIDDEN5','HIDDEN6','HIDDEN7','HIDDEN8','HIDDEN9','HIDDEN10','N11','HIDDEN11','ED1','ED2','ED3','ED4','ED5','HIDDEN12'];
assert.deepEqual(Array.from(data.items, x => x.id), expected);
const imageNames = new Set();
for (const item of data.items) {
  assert.equal(typeof item.name, 'string'); assert.ok(item.name); assert.equal(typeof item.desc, 'string');
  assert.equal(typeof item.hidden, 'boolean'); assert.equal(typeof item.spoiler, 'boolean'); assert.ok(item.hiddenSource);
  assert.equal(item.hidden, /^HIDDEN/.test(item.id)); assert.equal(item.spoiler, /^ED/.test(item.id));
  assert.equal(item.icon.src, 'assets/achievements/' + item.id + '.png'); imageNames.add(item.id + '.png');
  const png = fs.readFileSync(path.join(dist, item.icon.src)); assert.ok(png.subarray(0, 8).equals(signature));
  assert.equal(png.readUInt32BE(16), item.icon.width); assert.equal(png.readUInt32BE(20), item.icon.height);
  assert.ok(item.icon.width >= 80 && item.icon.height >= 80); assert.equal(sha256(png), item.source.imageSha256);
  assert.equal(item.source.resource, 'img/achievement/' + item.id + 'A.png');
  assert.ok(Number.isInteger(item.source.steamStat) && Number.isInteger(item.source.steamBit));
  assert.equal(item.steam.statId, item.source.steamStat); assert.equal(item.steam.bit, item.source.steamBit);
  assert.match(item.source.text, /^story-schinese\.xlsx #achievement!A\d+:D\d+$/);
}
assert.deepEqual(fs.readdirSync(path.join(dist, 'assets/achievements')).sort(), [...imageNames].sort());
assert.equal(data.meta.coverage.total, 32); assert.equal(data.meta.coverage.withIcon, 32);
assert.equal(data.meta.coverage.officialHidden, 12); assert.equal(data.meta.coverage.spoiler, 5);
assert.equal(data.items.find(x => x.id === 'HIDDEN10').desc, '');
let sourceChecked = false;
if (process.argv.includes('--source')) {
  const original = sourceRows(path.join(workspace, '测试游戏'), path.join(workspace, '修改器/unpacked/data'));
  const schema = publicSchema('D:/steam/appcache/stats/UserGameStatsSchema_1478160.bin');
  assert.equal(data.meta.textSourceSha256, original.sha256); assert.equal(data.meta.hiddenSourceSha256, schema.sha256);
  assert.equal(schema.items.size, data.items.length);
  data.items.forEach((item, i) => {
    const row = original.rows[i], steam = schema.items.get(item.id);
    for (const key of ['id', 'name', 'desc', 'category']) assert.equal(item[key], row[key], key + ': ' + item.id);
    assert.equal(item.hidden, steam.hidden === 1); assert.equal(item.source.steamStat, steam.stat); assert.equal(item.source.steamBit, steam.bit);
  }); sourceChecked = true;
}
console.log('Achievements valid: 32 unique IDs, 32 original PNGs, 12 official hidden, 5 ending spoilers' + (sourceChecked ? '; original text and public schema verified.' : '.'));
