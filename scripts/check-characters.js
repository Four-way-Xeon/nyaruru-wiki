#!/usr/bin/env node
'use strict';
// Run from the project root: node scripts/check-characters.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(dist, 'characters.js'), 'utf8'), context, { timeout: 1000 });
const data = context.window.NYARURU_CHARACTERS;
const expected = ['喵露露', '菓酱', '莉莉亚', '樱', '莲', '心渊', '德古拉', '缇娅', '喵可莉', '莉伊', '璃音', '瘟疫魔女', '喵露朵露薇', '奇怪的生物', '橘花花', '莉珑'];
assert.equal(data.characters.length, expected.length);
assert.deepEqual(Array.from(data.characters, c => c.name).sort(), expected.slice().sort());
assert.equal(new Set(data.characters.map(c => c.id)).size, expected.length);
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'assets/characters/manifest.json'), 'utf8'));
const sources = new Set(data.sources.map(s => s.url));
assert.equal(new Set(data.sources.map(s => s.id)).size, data.sources.length);
let pixels = 0, portraits = 0, spoilers = 0;
function plain(text) {
  assert.equal(typeof text, 'string');
  assert.ok(text.trim());
  assert.ok(!/<\/?[a-z][^>]*>|<script|javascript:|onerror\s*=/i.test(text), 'Plain text only');
}
function attribution(source) {
  assert.equal(source.license, 'CC BY-NC-SA 4.0');
  assert.equal(source.licenseUrl, 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans');
  assert.equal(source.adapted, true);
  assert.ok(!/redlink=|action=edit/.test(source.url || source.sourceUrl));
}
for (const c of data.characters) {
  for (const field of ['id', 'name', 'role', 'intro', 'sourceName', 'sourceUrl', 'note']) plain(c[field]);
  attribution(c);
  assert.match(c.sourceName, /贡献者/);
  assert.ok(Array.isArray(c.details) && Array.isArray(c.facts) && Array.isArray(c.spoilers));
  c.details.forEach(plain);
  c.facts.forEach(f => { plain(f.label); plain(f.value); });
  c.spoilers.forEach(s => { plain(s.title); plain(s.text); spoilers++; });
  assert.ok(c.sourceRefs.length);
  for (const s of c.sourceRefs) { attribution(s); assert.ok(sources.has(s.url)); assert.match(s.name, /贡献者/); }
  if (c.identitySpoiler) { plain(c.safeName); assert.notEqual(c.safeName, c.name); }
  const original = manifest.characters[c.id];
  assert.ok(original);
  for (const kind of ['pixel', 'portrait']) {
    const art = c[kind];
    if (art === null) { assert.equal(original[kind], null); plain(c.artNote); continue; }
    assert.match(art.src, new RegExp('^assets/characters/' + c.id + '-' + kind + '\\.png$'));
    assert.equal(JSON.stringify(art), JSON.stringify(original[kind]));
    const png = fs.readFileSync(path.join(dist, art.src));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), art.width); assert.equal(png.readUInt32BE(20), art.height);
    assert.ok(art.width > 0 && art.height > 0);
    const evidence = original[kind + 'Evidence']; assert.ok(evidence);
    const resource = manifest.source.resources.find(r => r.name === evidence.resource); assert.ok(resource);
    if (kind === 'portrait') {
      assert.equal(crypto.createHash('sha256').update(png).digest('hex'), resource.sha256, 'Portrait is byte-identical original PNG');
      portraits++;
    } else {
      const { crop, trim, grid, frame } = evidence;
      assert.equal(crop.width * grid[0], resource.width); assert.equal(crop.height * grid[1], resource.height);
      assert.equal(crop.x, frame % grid[0] * crop.width); assert.equal(crop.y, Math.floor(frame / grid[0]) * crop.height);
      assert.equal(trim.width, art.width); assert.equal(trim.height, art.height);
      assert.ok(trim.x >= 0 && trim.y >= 0 && trim.x + trim.width <= crop.width && trim.y + trim.height <= crop.height);
      pixels++;
    }
  }
}
// Where the research cache is present, verify coverage against the actual source table.
const originalHtml = path.join(root, '../.site-diagnostic/wiki-research/moegirl-game.html');
if (fs.existsSync(originalHtml)) {
  const html = fs.readFileSync(originalHtml, 'utf8');
  const start = html.indexOf('id="登场人物"');
  const table = html.slice(html.indexOf('<table', start), html.indexOf('</table>', start));
  const names = [...table.matchAll(/<b><a\b[^>]*>([^<]+)<\/a><\/b>/g)].map(m => m[1]);
  assert.deepEqual(names.sort(), expected.slice().sort(), 'All original listed characters covered');
}
assert.equal(pixels, 15); assert.equal(portraits, 13);
assert.ok(data.characters.find(c => c.id === 'nyarutoru').identitySpoiler);
assert.ok(data.characters.find(c => c.id === 'plague-witch').imageSpoiler);
console.log(`Characters verified: ${data.characters.length}; original pixels: ${pixels}; original portraits: ${portraits}; spoiler sections: ${spoilers}; sources: ${data.sources.length}.`);
console.log('Known art gaps: 莉珑 pixel/portrait; 奇怪的生物 portrait; 橘花花 portrait.');
