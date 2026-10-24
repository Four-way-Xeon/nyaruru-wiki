#!/usr/bin/env node
'use strict';
// Read only original game resources and the public Steam schema. Never load user stats or saves.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const project = path.resolve(__dirname, '..'), workspace = path.dirname(project);
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function option(name, fallback) { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; }
function publicSchema(filename) {
  // The exact public filename prevents accidentally importing any account's achievement state.
  assert.equal(path.basename(filename), 'UserGameStatsSchema_1478160.bin');
  const bytes = fs.readFileSync(filename); let offset = 0;
  function string() {
    const end = bytes.indexOf(0, offset); assert.ok(end >= offset, 'Terminated schema string');
    const value = bytes.toString('utf8', offset, end); offset = end + 1; return value;
  }
  function object(depth = 0) {
    assert.ok(depth < 32, 'Schema nesting'); const out = Object.create(null);
    while (offset < bytes.length) {
      const type = bytes[offset++]; if (type === 8) return out;
      const key = string(); assert.ok(!Object.hasOwn(out, key), 'Unique schema key');
      if (type === 0) out[key] = object(depth + 1);
      else if (type === 1) out[key] = string();
      else if (type === 2) { assert.ok(offset + 4 <= bytes.length); out[key] = bytes.readInt32LE(offset); offset += 4; }
      else throw Error('Unsupported public schema type ' + type);
    }
    return out;
  }
  const tree = object(); assert.equal(offset, bytes.length);
  const stats = tree['1478160']?.stats; assert.ok(stats, 'Correct public app schema');
  const items = new Map();
  for (const [stat, value] of Object.entries(stats)) for (const [bit, row] of Object.entries(value.bits || {})) {
    assert.ok(row.name && row.display && [0, 1].includes(row.display.hidden));
    assert.ok(!items.has(row.name)); items.set(row.name, { ...row.display, stat: Number(stat), bit: Number(bit) });
  }
  return { items, sha256: sha256(bytes) };
}
function sourceRows(gameDir, dataDir) {
  const X = require(path.join(gameDir, 'js/libs/xlsx.mini.min.js'));
  const bytes = fs.readFileSync(path.join(dataDir, 'story-schinese.xlsx'));
  const sheet = X.read(bytes).Sheets['#achievement']; assert.ok(sheet);
  const rows = []; for (let row = 2; sheet['A' + row]; row++) {
    const cell = c => sheet[c + row]?.v || '';
    rows.push({ id: cell('A'), name: cell('B'), desc: cell('C'), category: cell('D'), row });
  }
  assert.equal(rows.length, 32); assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  return { rows, sha256: sha256(bytes) };
}
async function utility() {
  const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), crypto = require('crypto');
  const job = JSON.parse(fs.readFileSync(path.resolve('job.json'), 'utf8')), report = path.resolve('result.json');
  const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
  try {
    const binary = fs.readFileSync(path.join(job.gameDir, 'js/main.bin'));
    if (sha256(binary) !== job.binaryHash) throw Error('Original binary changed');
    const source = '"' + '\u200b'.repeat(binary.readUInt32LE(8) - 2) + '"';
    const matching = new vm.Script(source, { produceCachedData: true }).createCachedData();
    if (binary.readUInt32LE(4) !== matching.readUInt32LE(4)) throw Error('Matching NW.js SDK required');
    matching.copy(binary, 12, 12, 16);
    const cached = new vm.Script(source, { cachedData: binary });
    if (cached.cachedDataRejected) throw Error('Original resource decoder rejected');
    const context = vm.createContext({ module: { exports: {} }, NYA: { BUILD: true }, Uint8Array });
    cached.runInContext(context, { timeout: 1000 });
    if (!vm.runInContext('typeof main.x === "function" && typeof window === "undefined" && NYA.BUILD', context)) throw Error('Decoder isolation failed');
    function decode(bytes, offset = 0) {
      context.bytes = new Uint8Array(bytes); context.offset = offset;
      vm.runInContext('main.x(bytes, offset)', context, { timeout: 2000 }); return Buffer.from(context.bytes);
    }
    const index = JSON.parse(zlib.inflateSync(decode(fs.readFileSync(path.join(job.gameDir, 'resource.index')))).toString('utf8'));
    const images = {};
    for (const id of job.ids) {
      if (!/^(N\d+|HIDDEN\d+|ED\d+|BR(?:_\d+star)?)$/.test(id)) throw Error('Unexpected achievement ID');
      const resource = 'img/achievement/' + id + 'A.png', entry = index[resource];
      if (!entry || !Number.isInteger(entry.file) || entry.file < 0 || entry.file > 20 || !Number.isSafeInteger(entry.pos) || entry.pos < 0 || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > 16 * 1024 * 1024) throw Error('Invalid resource: ' + resource);
      const encrypted = Buffer.alloc(entry.size), fd = fs.openSync(path.join(job.gameDir, 'file' + entry.file + '.data'), 'r');
      try { if (fs.readSync(fd, encrypted, 0, entry.size, entry.pos) !== entry.size) throw Error('Short resource read'); } finally { fs.closeSync(fd); }
      const png = decode(encrypted, entry.pos);
      if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Resource is not PNG');
      const image = new Image(); await new Promise((yes, no) => { image.onload = yes; image.onerror = no; image.src = 'data:image/png;base64,' + png.toString('base64'); });
      if (image.width < 80 || image.height < 80) throw Error('Original achievement art unexpectedly small');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      if (!ctx.getImageData(0, 0, image.width, image.height).data.some((v, i) => i % 4 === 3 && v)) throw Error('Empty image');
      const src = 'assets/achievements/' + id + '.png';
      fs.writeFileSync(path.join(job.outDir, src), png); // Preserve original bytes; no resizing or repainting.
      images[id] = { src, width: image.width, height: image.height, resource, sha256: sha256(png) };
    }
    fs.writeFileSync(report, JSON.stringify({ ok: true, images }));
  } catch (error) { fs.writeFileSync(report, JSON.stringify({ ok: false, error: String(error.stack || error) })); }
  finally { nw.App.quit(); }
}
async function run() {
  const gameDir = path.resolve(option('--game-dir', path.join(workspace, '测试游戏')));
  const dataDir = path.resolve(option('--data-dir', path.join(workspace, '修改器/unpacked/data')));
  const outDir = path.resolve(option('--out-dir', path.join(project, 'dist')));
  const schemaPath = path.resolve(option('--schema', 'D:/steam/appcache/stats/UserGameStatsSchema_1478160.bin'));
  const original = sourceRows(gameDir, dataDir), schema = publicSchema(schemaPath);
  assert.equal(schema.items.size, original.rows.length);
  for (const row of original.rows) assert.ok(schema.items.has(row.id), 'Public schema ID: ' + row.id);
  const ui = fs.readFileSync(path.join(gameDir, 'js/nya/nya_ui.js'), 'utf8');
  assert.match(ui, /ImageManager\.loadBitmap\("img\/achievement\/", name \+ "A"\)/);
  const binaryHash = sha256(fs.readFileSync(path.join(gameDir, 'js/main.bin')));
  const base = path.join(project, '.qa/achievement-research'); fs.mkdirSync(base, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(base, 'export-'));
  fs.mkdirSync(path.join(outDir, 'assets/achievements'), { recursive: true });
  fs.writeFileSync(path.join(temporary, 'job.json'), JSON.stringify({ gameDir, outDir, binaryHash, ids: original.rows.map(r => r.id) }));
  fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ name: 'wiki-offline-achievement-export', main: 'index.html', window: { show: false }, 'chromium-args': '--disable-gpu --no-first-run --disable-background-networking' }));
  fs.writeFileSync(path.join(temporary, 'index.html'), '<!doctype html><script>(' + utility.toString() + ')();</script>');
  const child = spawn(path.join(workspace, '修改器/nwjs-sdk-v0.64.1-win-x64/nw.exe'), ['--disable-gpu', '--user-data-dir=' + path.join(temporary, 'profile'), temporary], { cwd: temporary, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Isolated image export timed out')); }, 45000);
    child.once('error', e => { clearTimeout(timer); reject(e); }); child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  const result = JSON.parse(fs.readFileSync(path.join(temporary, 'result.json'), 'utf8')); if (!result.ok) throw Error(result.error);
  const items = original.rows.map(row => {
    const publicItem = schema.items.get(row.id), image = result.images[row.id];
    const spoiler = row.category === '结局';
    return { id: row.id, name: row.name, desc: row.desc, category: row.category,
      hidden: publicItem.hidden === 1, spoiler,
      hiddenSource: 'Steam 公共成就 schema：display.hidden',
      spoilerSource: spoiler ? 'Wiki 剧透分类：原文类型为结局；不等同于 Steam 隐藏标志。' : '',
      icon: { src: image.src, width: image.width, height: image.height },
      steam: { statId: publicItem.stat, bit: publicItem.bit },
      source: { text: 'story-schinese.xlsx #achievement!A' + row.row + ':D' + row.row,
        resource: image.resource, imageSha256: image.sha256, steamStat: publicItem.stat, steamBit: publicItem.bit } };
  });
  const manifest = { schemaVersion: 1, items, meta: {
    sourceNote: '名称、描述与类型逐字采用原版简体中文表；隐藏标志来自 Steam 公共成就定义。图片直接复制游戏成就通知使用的原始 PNG，无重绘或缩放；不读取玩家存档或账户成就状态。',
    coverage: { total: items.length, withIcon: items.length, officialHidden: items.filter(x => x.hidden).length, spoiler: items.filter(x => x.spoiler).length },
    textSource: 'story-schinese.xlsx #achievement A/B/C/D；DataManager.loadAchievement',
    textSourceSha256: original.sha256, hiddenSource: 'UserGameStatsSchema_1478160.bin（仅公共定义）', hiddenSourceSha256: schema.sha256,
    iconSource: 'nya_ui.js Sprite_AchievementNotificationBar.setAchievement → img/achievement/{id}A.png', binarySha256: binaryHash,
    descriptionNote: 'HIDDEN10 的原版描述为空，保留空串；不把开发用剧情解释列当作玩家可见的解锁说明。',
    spoilerNote: '官方隐藏成就与结局剧透分类分开记录；页面在用户揭示前应遮蔽名称、描述和图片。',
    rights: '原版成就图片权利归游戏各自权利人；Wiki 文字许可证不适用于这些图片。'
  } };
  fs.writeFileSync(path.join(outDir, 'achievements.js'), '// Generated from original game text, PNG resources and public Steam schema.\nwindow.NYARURU_ACHIEVEMENTS = ' + JSON.stringify(manifest, null, 2) + ';\n');
  assert.ok(path.resolve(temporary).startsWith(path.resolve(base) + path.sep) && path.basename(temporary).startsWith('export-'));
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  console.log('Exported 32 original achievement PNGs and text; 12 official hidden, 5 ending spoilers.');
}
module.exports = { publicSchema, sourceRows, signature, sha256 };
if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
