#!/usr/bin/env node
'use strict';
// Offline original-art exporter, Node.js 22+, no downloaded dependencies.
// Run: node scripts/export-icons.js
// Optional: --game-dir PATH --data-dir PATH --nw-path PATH --out-dir PATH
// Uses the existing matching NW.js SDK only as a hidden image/bytecode utility.
// The game entry page, runtime scripts, Steam and save files are never loaded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const workspace = path.dirname(project);
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const allowed = ['img/ui/icons.png', 'img/ui/bell.png', 'img/ui/hpst.png',
  'img/ui/joycoin.png', 'img/ui/skillst.png', 'img/characters/%3Bcoin_gold.png'];

function option(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error('Missing ' + name);
  return path.resolve(process.argv[i + 1]);
}
function extractFunction(source, qualifiedName) {
  const start = source.indexOf(qualifiedName + ' = function(');
  assert.ok(start >= 0, 'Original icon method exists: ' + qualifiedName);
  const fn = source.indexOf('function(', start), end = source.indexOf('\n};', fn);
  assert.ok(end > fn);
  return source.slice(fn, end + 2);
}

// Executed only inside the separate, hidden utility window. Its VM context has
// no window/document/require/process/nw/timers; BUILD stops the game's boot path.
// File I/O occurs outside that context and only for the explicit resource list.
async function utility() {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const zlib = require('zlib'), crypto = require('crypto');
  const job = JSON.parse(fs.readFileSync(path.resolve('job.json'), 'utf8'));
  const reportFile = path.resolve('result.json');
  try {
    const binary = fs.readFileSync(path.join(job.gameDir, 'js/main.bin'));
    const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256(binary) !== job.binaryHash) throw Error('Game bytecode changed during export');
    const source = '"' + '\u200b'.repeat(binary.readUInt32LE(8) - 2) + '"';
    const matching = new vm.Script(source, { produceCachedData: true }).createCachedData();
    if (binary.readUInt32LE(4) !== matching.readUInt32LE(4)) throw Error('Use the matching NW.js SDK version');
    // Adapt only the cache flags hash for this isolated VM, retaining version and payload.
    matching.copy(binary, 12, 12, 16);
    const cached = new vm.Script(source, { cachedData: binary });
    if (cached.cachedDataRejected) throw Error('V8 rejected the original bytecode');
    const context = vm.createContext({ module: { exports: {} }, NYA: { BUILD: true }, Uint8Array });
    cached.runInContext(context, { timeout: 1000 });
    if (!vm.runInContext('typeof main.x === "function" && typeof window === "undefined" && NYA.BUILD', context)) {
      throw Error('Isolated resource decoder is unavailable');
    }
    function decode(bytes, offset = 0) {
      context.bytes = new Uint8Array(bytes); context.offset = offset;
      vm.runInContext('main.x(bytes, offset)', context, { timeout: 2000 });
      return Buffer.from(context.bytes);
    }
    const index = JSON.parse(zlib.inflateSync(decode(fs.readFileSync(path.join(job.gameDir, 'resource.index')))).toString('utf8'));
    const bitmaps = {}, resources = [];
    for (const name of job.allowed) {
      const entry = index[name];
      if (!entry || !Number.isInteger(entry.file) || entry.file < 0 || entry.file > 20 ||
          !Number.isSafeInteger(entry.pos) || entry.pos < 0 || !Number.isSafeInteger(entry.size) ||
          entry.size <= 0 || entry.size > 1024 * 1024) throw Error('Invalid resource entry: ' + name);
      const fd = fs.openSync(path.join(job.gameDir, 'file' + entry.file + '.data'), 'r');
      const encrypted = Buffer.alloc(entry.size);
      try {
        if (fs.readSync(fd, encrypted, 0, entry.size, entry.pos) !== entry.size) throw Error('Short resource read');
      } finally { fs.closeSync(fd); }
      const png = decode(encrypted, entry.pos);
      if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Resource is not PNG: ' + name);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = () => reject(Error('Cannot decode PNG: ' + name));
        image.src = 'data:image/png;base64,' + png.toString('base64');
      });
      bitmaps[name] = image;
      resources.push({ name: decodeURIComponent(name), width: image.width, height: image.height, sha256: sha256(png) });
    }
    // Evaluate only the original two inventory icon methods, never the UI file.
    const iconContext = vm.createContext({ Sprite_ItemIcon: { prototype: {} },
      ImageManager: { loadUI(name) {
        const key = 'img/ui/' + name + '.png', bitmap = bitmaps[key];
        if (!bitmap) throw Error('Unexpected icon source: ' + name);
        return { key, width: bitmap.width, height: bitmap.height };
      } } });
    vm.runInContext('Sprite_ItemIcon.prototype.itemBitmap = ' + job.itemBitmap +
      '; Sprite_ItemIcon.prototype.refreshIdx = ' + job.refreshIdx + ';', iconContext, { timeout: 1000 });
    const methods = iconContext.Sprite_ItemIcon.prototype;
    const items = {}, types = {}, frames = {};
    for (const item of job.items) {
      let bitmap, frame;
      if (item.type === 'coin') {
        const key = 'img/characters/%3Bcoin_gold.png', image = bitmaps[key];
        const width = image.width / job.coinColumns, height = image.height / job.coinRows;
        bitmap = { key, width: image.width, height: image.height };
        frame = { x: width * 3, y: 0, width, height }; // Original front-facing fourth animation frame.
      } else {
        bitmap = methods.itemBitmap(item.type);
        methods.refreshIdx.call({ _type: item.type, bitmap,
          setFrame(x, y, width, height) { frame = { x, y, width, height }; } }, item.id);
      }
      const { x, y, width, height } = frame;
      if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
          width > 512 || height > 512 || x + width > bitmap.width || y + height > bitmap.height) {
        throw Error('Invalid original frame: ' + item.key);
      }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmaps[bitmap.key], x, y, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      if (!pixels.some((value, i) => i % 4 === 3 && value > 0)) throw Error('Empty icon: ' + item.key);
      const src = 'assets/items/' + item.type + '-' + item.id + '.png';
      fs.writeFileSync(path.join(job.outDir, src), Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'));
      items[item.key] = { src, width, height };
      if (!types[item.type]) types[item.type] = item.key;
      frames[item.key] = { resource: decodeURIComponent(bitmap.key), x, y, width, height };
    }
    const manifest = { schemaVersion: 1, items, types, source: {
      note: '离线提取《咸鱼喵喵》原版 PNG，物品采用 Sprite_ItemIcon 原始裁切规则；金币采用原版金币掉落动画正面帧。未重绘、调色或读取存档。素材权利归游戏原作者。',
      mapping: 'js/nya/nya_ui.js: Sprite_ItemIcon.itemBitmap / refreshIdx',
      coinMapping: 'js/nya/nya_map.js: Game_MapCoin.determineCharacterName; data/iframe.xlsx: ImageFrame ;coin_gold; frame 4 of 7',
      binarySha256: job.binaryHash, resources, frames
    } };
    fs.writeFileSync(path.join(job.outDir, 'icons.js'), '// Generated by scripts/export-icons.js from original game art.\nwindow.NYARURU_ICONS = ' + JSON.stringify(manifest, null, 2) + ';\n');
    fs.writeFileSync(reportFile, JSON.stringify({ ok: true, count: Object.keys(items).length, resources: resources.length }));
  } catch (error) {
    fs.writeFileSync(reportFile, JSON.stringify({ ok: false, error: String(error.stack || error) }));
  } finally { nw.App.quit(); }
}

async function run() {
  const gameDir = option('--game-dir', path.join(workspace, '测试游戏'));
  const dataDir = option('--data-dir', path.join(workspace, '修改器/unpacked/data'));
  const nwPath = option('--nw-path', path.join(workspace, '修改器/nwjs-sdk-v0.64.1-win-x64/nw.exe'));
  const outDir = option('--out-dir', path.join(project, 'dist'));
  const dataContext = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(outDir, 'data.js'), 'utf8'), dataContext, { timeout: 1000 });
  const items = dataContext.window.NYARURU_DATA.items.map(({ key, type, id }) => ({ key, type, id }));
  assert.equal(items.length, 49, 'Expected the current 49-item catalogue');
  for (const item of items) assert.ok(/^[a-z]+$/.test(item.type) && Number.isInteger(item.id) && item.id >= 0 && item.key === item.type + ':' + item.id);
  const ui = fs.readFileSync(path.join(gameDir, 'js/nya/nya_ui.js'), 'utf8');
  const XLSX = require(path.join(gameDir, 'js/libs/xlsx.mini.min.js'));
  const sheet = XLSX.read(fs.readFileSync(path.join(dataDir, 'iframe.xlsx'))).Sheets.ImageFrame;
  const coin = XLSX.utils.sheet_to_json(sheet, { header: 1 }).find(row => row[0] === ';coin_gold');
  assert.ok(coin && coin[1] === 7 && coin[2] === 1, 'Verify the original gold coin animation grid');
  const binaryHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(gameDir, 'js/main.bin'))).digest('hex');
  const job = { gameDir, outDir, allowed, items, binaryHash, coinColumns: coin[1], coinRows: coin[2],
    itemBitmap: extractFunction(ui, 'Sprite_ItemIcon.prototype.itemBitmap'),
    refreshIdx: extractFunction(ui, 'Sprite_ItemIcon.prototype.refreshIdx') };
  fs.mkdirSync(path.join(outDir, 'assets/items'), { recursive: true });
  const base = path.join(project, '.icon-work'); fs.mkdirSync(base, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(base, 'export-'));
  fs.writeFileSync(path.join(temporary, 'job.json'), JSON.stringify(job));
  fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ name: 'wiki-offline-icon-export', main: 'index.html',
    window: { show: false }, 'chromium-args': '--disable-gpu --no-first-run --disable-background-networking' }));
  fs.writeFileSync(path.join(temporary, 'index.html'), '<!doctype html><meta charset="utf-8"><script>(' + utility.toString() + ')();</script>');
  let log = '';
  const child = spawn(nwPath, ['--disable-gpu', '--user-data-dir=' + path.join(temporary, 'profile'), temporary],
    { cwd: temporary, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Offline icon utility timed out')); }, 45000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  const resultPath = path.join(temporary, 'result.json');
  if (!fs.existsSync(resultPath)) throw Error('Offline icon utility failed: ' + log.slice(-1500));
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  if (!result.ok) throw Error(result.error);
  const manifestContext = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(outDir, 'icons.js'), 'utf8'), manifestContext, { timeout: 1000 });
  const icons = manifestContext.window.NYARURU_ICONS;
  assert.equal(Object.keys(icons.items).length, 49); assert.equal(Object.keys(icons.types).length, 9);
  for (const item of items) {
    const icon = icons.items[item.key]; assert.ok(icon, item.key);
    assert.match(icon.src, /^assets\/items\/[a-z]+-\d+\.png$/);
    const png = fs.readFileSync(path.join(outDir, icon.src));
    assert.ok(png.subarray(0, 8).equals(signature), 'PNG signature: ' + item.key);
    assert.equal(png.readUInt32BE(16), icon.width); assert.equal(png.readUInt32BE(20), icon.height);
    assert.ok(icons.items[icons.types[item.type]], 'Valid representative icon');
  }
  // Delete only this run's verified child directory, never a supplied game/output path.
  assert.ok(path.resolve(temporary).startsWith(path.resolve(base) + path.sep) && path.basename(temporary).startsWith('export-'));
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  console.log('Original icons exported and verified: 49 items, 9 types, 6 source PNGs; local relative URLs only.');
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
