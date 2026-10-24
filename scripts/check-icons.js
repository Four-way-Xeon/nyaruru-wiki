'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dist = path.resolve(__dirname, '../dist');

function readData(filename, key) {
  const context = vm.createContext({ window:{} });
  vm.runInContext(fs.readFileSync(path.join(dist, filename), 'utf8'), context, { timeout:5000 });
  return context.window[key];
}

function checkIcons() {
  const data = readData('data.js', 'NYARURU_DATA');
  const icons = readData('icons.js', 'NYARURU_ICONS');
  assert.equal(icons.schemaVersion, 1);
  assert.deepEqual(Object.keys(icons.items).sort(), Array.from(data.items, item => item.key).sort());
  assert.equal(typeof icons.source.note, 'string');
  assert.ok(icons.source.note.length > 0);
  const types = [...new Set(data.items.map(item => item.type))];
  assert.deepEqual(Object.keys(icons.types).sort(), Array.from(types).sort());
  for (const type of types) {
    const representative = data.items.find(item => item.key === icons.types[type]);
    assert.ok(representative && representative.type === type, '分类图标必须引用同类型物品');
  }
  const files = new Set();
  for (const [key, icon] of Object.entries(icons.items)) {
    assert.match(icon.src, /^assets\/items\/[a-zA-Z0-9_-]+\.png$/, key + ' 图标路径必须在本地素材目录');
    const file = path.resolve(dist, icon.src);
    assert.ok(file.startsWith(path.join(dist, 'assets', 'items') + path.sep));
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a', key + ' 不是 PNG');
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
    assert.equal(bytes.readUInt32BE(16), icon.width, key + ' 图标宽度错误');
    assert.equal(bytes.readUInt32BE(20), icon.height, key + ' 图标高度错误');
    assert.ok(icon.width > 0 && icon.height > 0 && icon.width <= 512 && icon.height <= 512);
    files.add(icon.src);
  }
  return { ok:true, itemIcons:Object.keys(icons.items).length, typeIcons:types.length, pngFiles:files.size };
}

if (require.main === module) {
  try { console.log(JSON.stringify(checkIcons())); }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { checkIcons };
