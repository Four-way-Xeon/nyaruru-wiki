#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/endings.js'), 'utf8'), context, { timeout: 1000 });
const data = context.window.NYARURU_ENDINGS;
assert.equal(data.schemaVersion, 1); assert.equal(data.items.length, 5);
assert.deepEqual(Array.from(data.items, item => item.id), ['ED1','ED2','ED3','ED4','ED5']);
assert.equal(new Set(data.items.map(item => item.id)).size, 5);
const expectedNames = ['结局1','结局2','结局3','结局4','隐藏结局'];
const allowedKeys = ['id','name','trigger','summary','icon','source'].sort();
const sourceUrl = 'https://zh.moegirl.org.cn/咸鱼喵喵#故事';
for (const [index, item] of data.items.entries()) {
  assert.deepEqual(Object.keys(item).sort(), allowedKeys, 'Only requested fields');
  assert.equal(item.name, expectedNames[index]);
  for (const field of ['trigger','summary']) {
    assert.equal(typeof item[field], 'string'); assert.ok(item[field].trim().length > 20);
    assert.ok(!/<[^>]*>|游戏作者对结局的评价|全场唯一硬控|这次真的是糖|DLC的计划|现代医学/.test(item[field]), 'No markup or author commentary');
  }
  assert.equal(item.source.url, sourceUrl); assert.ok(item.source.name.includes('萌娘百科') && item.source.name.includes('贡献者'));
  assert.equal(item.source.license, 'CC BY-NC-SA 4.0');
  assert.equal(item.source.licenseUrl, 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
  assert.equal(item.source.adapted, true); assert.ok(item.source.note);
  assert.equal(item.icon.src, 'assets/achievements/' + item.id + '.png');
  assert.equal(item.icon.width, 128); assert.equal(item.icon.height, 128);
  const png = fs.readFileSync(path.join(root, 'dist', item.icon.src));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128);
}
assert.equal(data.meta.sourceUrl, sourceUrl); assert.equal(data.meta.sourceRevision, 8087105);
assert.equal(data.meta.oldid, 8087105); assert.ok(data.meta.sourceRevisionUrl.includes('oldid=8087105#故事'));
assert.equal(data.meta.license, 'CC BY-NC-SA 4.0'); assert.equal(data.meta.adapted, true);
assert.ok(!/authorReview|authorComment|evaluation/.test(JSON.stringify(data)));
if (process.argv.includes('--source')) {
  const filename = path.join(root, '../.site-diagnostic/wiki-research/moegirl-game.html');
  const html = fs.readFileSync(filename, 'utf8');
  assert.ok(html.includes('"wgRevisionId":8087105')); assert.ok(html.includes('id="故事"'));
  const section = html.slice(html.indexOf('data-expandtext="点我展开结局"'));
  const table = section.slice(section.indexOf('<table'), section.indexOf('</table>') + 8);
  assert.ok(table.includes('触发方式') && table.includes('概括'));
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].filter(match => match[1].includes('<td'));
  assert.equal(rows.length, 5, 'Full original ending table coverage');
  rows.forEach((row, index) => {
    const cells = [...row[1].matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)];
    assert.ok(cells[0][1].includes(expectedNames[index]));
    assert.ok(cells[1][1].trim() && cells[2][1].trim());
  });
  assert.ok(rows[3][1].includes('colspan="2"'), 'Ending 4 combined source cell');
  assert.ok(decodeURIComponent(rows[4][1]).includes('这就是我们的齐心协力'), 'ED5 original icon identity');
}
console.log('Endings valid: 5 original table entries, trigger and summary only, attribution and 128px local icons' + (process.argv.includes('--source') ? '; original table coverage verified.' : '.'));
