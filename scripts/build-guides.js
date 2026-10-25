#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { dataFiles, typeNames, escapeHtml: esc, safeUrl, assetPath, loadGuideModel } = require('./lib/guide-model');
const { renderRegionPreview } = require('./lib/guide-map-preview');
const defaultRoot = path.resolve(__dirname, '..');
const manifestName = 'build-manifest.json';
const categories = [
  ['items','物品图鉴'], ['characters','人物与剧情'], ['endings','结局一览'], ['achievements','成就手册'], ['regions','区域地图']
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const paragraph = value => '<p>' + esc(value) + '</p>';
const link = (href, label, cls = '') => '<a href="' + esc(href) + '"' + (cls ? ' class="' + esc(cls) + '"' : '') + '>' + esc(label) + '</a>';
const section = (title, body, cls = '', id = '') => '<section class="reader-section ' + esc(cls) + '"' + (id ? ' id="' + esc(id) + '"' : '') + '><h2>' + esc(title) + '</h2>' + body + '</section>';
const list = entries => '<ul class="reader-list">' + entries.map(entry => '<li>' + entry + '</li>').join('') + '</ul>';
const folded = (label, body) => '<details class="spoiler-details"><summary>' + esc(label) + '</summary><div class="reader-prose" data-nosnippet>' + body + '</div></details>';
const grid = cards => '<div class="reader-grid">' + cards.map(card => '<article class="paper reader-card">' + card + '</article>').join('') + '</div>';
const publicDataNote = '未核实的获取条件会标为“待核对”。基础标价不代表具体商店当前有售，实际解锁条件与库存以游戏为准。';

function readConfig(projectRoot, siteUrl) {
  const raw = JSON.parse(fs.readFileSync(path.join(projectRoot, 'site.config.json'), 'utf8'));
  const base = new URL(safeUrl(siteUrl === undefined ? raw.siteUrl : siteUrl));
  assert.ok(!base.search && !base.hash, 'siteUrl must be a base URL without query or fragment');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  assert.equal(typeof raw.siteName, 'string'); assert.ok(raw.siteName.trim(), 'siteName is required');
  return { siteUrl: base.href, blogUrl: safeUrl(raw.blogUrl), siteName: raw.siteName };
}
function pageContext(file, config) {
  const root = file === 'index.html';
  const assetRoot = root ? '..' : '../..';
  const guideRoot = root ? '.' : '..';
  return { assetRoot, guideRoot, interactiveRoot: assetRoot + '/index.html', canonical: new URL('guide/' + file, config.siteUrl).href };
}
function interactive(ctx, key, value, anchor) {
  return ctx.interactiveRoot + (key ? '?' + key + '=' + encodeURIComponent(String(value)) : '') + '#' + anchor;
}
function headingActions(model, ctx, file, activeNav) {
  const target = {
    home: [null, null, 'map', '进入完整版 · 世界地图'],
    regions: [null, null, 'map', '进入完整版 · 世界地图'],
    items: [null, null, 'items', '进入完整版 · 物品图鉴'],
    characters: [null, null, 'characters', '进入完整版 · 人物与剧情'],
    endings: [null, null, 'characters', '进入完整版 · 人物与剧情'],
    achievements: [null, null, 'achievements', '进入完整版 · 成就手册']
  }[activeNav];
  let [key, value, anchor, label] = target;
  let secondary = '', note = '';
  if (activeNav === 'regions') {
    const entry = model.regions.find(row => file === 'regions/' + row.slug + '.html');
    if (entry) [key, value, anchor, label] = ['region', entry.id, 'map', '进入完整版 · ' + entry.name + '地图'];
  } else if (activeNav === 'items') {
    const entry = model.items.find(row => file === 'items/' + row.slug + '.html');
    if (entry) {
      const rows = model.locations.filter(row => row.itemKey === entry.key);
      const first = rows.find(row => model.cells.some(cell => cell.key === row.cellKey));
      if (first) {
        [key, value, anchor, label] = ['source', first.key, 'map', '在完整版地图查看获取位置'];
        secondary = link(entry.slug + '.html#item-sources', '查看全部 ' + rows.length + ' 条来源');
        if (rows.length > 1) note = '按钮先定位其中一处获取位置；下方来源列表可逐条打开其他位置。';
      } else {
        [key, value, anchor, label] = ['item', entry.key, 'items', '在完整版图鉴中查看'];
        note = '暂未找到可定位的获取位置，可先查看物品说明；获取方式与前置条件待核对。';
      }
    }
  } else if (activeNav === 'characters') {
    const entry = model.characters.find(row => file === 'characters/' + row.slug + '.html');
    if (entry) [key, value, anchor, label] = ['character', entry.id, 'characters', '在完整版查看人物档案'];
  } else if (activeNav === 'endings') {
    const entry = model.endings.find(row => file === 'endings/' + row.slug + '.html');
    if (entry) [key, value, anchor, label] = ['ending', entry.id, 'characters', '在完整版展开' + entry.name];
  } else if (activeNav === 'achievements') {
    const entry = model.achievements.find(row => file === 'achievements/' + row.slug + '.html');
    if (entry) [key, value, anchor, label] = ['achievement', entry.id, 'achievements', '在完整版查看此成就'];
  }
  return '<p class="reader-actions reader-heading-actions">' + link(interactive(ctx, key, value, anchor), label, 'primary') + (secondary ? secondary : '') + '</p>' +
    (note ? '<p class="reader-meta">' + esc(note) + '</p>' : '');
}
function regionPreviewLink(model, ctx, entry) {
  return '<a class="region-preview-link" href="' + esc(interactive(ctx, 'region', entry.id, 'map')) + '" aria-label="' + esc('打开' + entry.name + '地图') + '">' + renderRegionPreview(entry, model.cells) + '</a>';
}
function regionCards(model, ctx) {
  return '<div class="region-grid">' + model.regions.map(entry => {
    const count = model.cells.filter(cell => cell.regionId === entry.id).length;
    const rows = model.locations.filter(row => row.regionId === entry.id && row.official);
    const events = new Set(rows.map(row => row.collectionKey)).size;
    const mapHref = interactive(ctx, 'region', entry.id, 'map');
    return '<article class="paper region-card" data-region-id="' + esc(entry.id) + '"><h2>' + link(mapHref, entry.name) + '</h2>' + regionPreviewLink(model, ctx, entry) +
      '<p class="region-card-stats"><span>' + count + ' 个地图格</span><span>' + events + ' 个收集事件</span></p>' +
      '<p class="reader-actions region-card-actions">' + link(mapHref, '打开' + entry.name + '地图', 'primary') + link(ctx.guideRoot + '/regions/' + entry.slug + '.html', '查看收集列表') + '</p></article>';
  }).join('') + '</div>';
}
function endingCards(model, ctx) {
  return '<div class="reader-grid ending-reader-grid">' + model.endings.map(entry =>
    '<a class="paper reader-card reader-card-link" href="' + esc(interactive(ctx, 'ending', entry.id, 'characters')) + '">' +
    image(ctx, entry.icon, entry.name + '图标') + '<h2>' + esc(entry.name) + '</h2><p class="reader-card-cta">在完整版展开结局 <span aria-hidden="true">↗</span></p></a>'
  ).join('') + '</div>';
}
function characterCards(model, ctx) {
  return '<div class="reader-grid character-reader-grid">' + model.characters.map(entry => {
    const name = entry.identitySpoiler ? entry.safeName || '尚未揭晓的人物' : entry.name;
    const intro = entry.identitySpoiler ? '身份与剧情含剧透，进入完整档案后可按需展开。' : entry.intro;
    return '<a class="paper reader-card reader-card-link" href="' + esc(interactive(ctx, 'character', entry.id, 'characters')) + '">' +
      (!entry.identitySpoiler && !entry.imageSpoiler ? image(ctx, entry.pixel, name, 'reader-image') : '') +
      '<h2>' + esc(name) + '</h2>' + paragraph(intro) + '<p class="reader-card-cta">查看完整档案 <span aria-hidden="true">↗</span></p></a>';
  }).join('') + '</div>';
}
function image(ctx, value, alt, cls = 'reader-icon') {
  if (!value) return '';
  const src = ctx.assetRoot + '/' + assetPath(value.src);
  return '<img class="' + esc(cls) + '" src="' + esc(src) + '" alt="' + esc(alt) + '" width="' + Number(value.width) + '" height="' + Number(value.height) + '" loading="lazy" decoding="async">';
}
function sourceBlock(refs, note = '') {
  const lines = (refs || []).map(ref => {
    let line = link(safeUrl(ref.url), ref.name || '原文来源');
    if (ref.license && ref.licenseUrl) line += ' · ' + link(safeUrl(ref.licenseUrl), ref.license);
    if (ref.adapted) line += ' · 节选整理与改写';
    if (ref.note) line += paragraph(ref.note);
    return line;
  });
  return section('来源与许可', list(lines) + (note ? paragraph(note) : '') + paragraph('原版游戏图像的权利归相应权利人；文字的知识共享许可不适用于这些图像。'), 'reader-source');
}
function dataSource(model) {
  return section('资料范围', paragraph('物品说明、图像与地图位置整理自游戏原版资料。收集清单按官方事件核对，部分动态奖励和普通敌人掉落尚未收录。') + paragraph(publicDataNote) + paragraph('原版图像与游戏文字、名称、设定的权利归相应权利人；资料整理和导出不代表取得再分发许可。'), 'reader-source');
}
function locationList(model, ctx, rows) {
  if (!rows.length) return '<p class="reader-empty">暂未整理出可靠的获取位置，获取方式与前置条件待核对。</p>';
  return list(rows.map(row => {
    const item = model.items.find(candidate => candidate.key === row.itemKey);
    const region = model.regions.find(candidate => candidate.id === row.regionId);
    const itemName = item ? item.name : row.itemKey;
    const place = row.area || region?.name || '区域待核对';
    const itemHref = item ? ctx.guideRoot + '/items/' + item.slug + '.html' : null;
    const regionHref = region ? ctx.guideRoot + '/regions/' + region.slug + '.html' : null;
    return '<div class="reader-location">' + (itemHref ? link(itemHref, itemName) : esc(itemName)) +
      (Number.isFinite(row.amount) && row.amount > 0 ? ' × ' + esc(row.amount) : '') + ' · ' + (regionHref ? link(regionHref, place) : esc(place)) +
      ' · 地图 ' + esc(row.mapId) + ' · ' + esc(row.official ? '官方收集事件' : '额外来源记录') +
      '<p class="reader-actions">' + link(interactive(ctx, 'source', row.key, 'map'), '在地图上查看') + '</p>' +
      (row.requirementNote ? paragraph(row.requirementNote) : '') + (row.sourceNote ? paragraph(row.sourceNote) : '') + '</div>';
  }));
}
function characterBody(ctx, entry) {
  let body = '<h2>' + esc(entry.name) + '</h2>' + paragraph(entry.role) + paragraph(entry.intro);
  const artwork = image(ctx, entry.portrait, entry.name + '原版立绘', 'reader-portrait') + image(ctx, entry.pixel, entry.name + '原版像素形象', 'reader-image');
  if (!entry.identitySpoiler && entry.imageSpoiler) body += folded('展开人物图像（含剧透）', artwork);
  else body += artwork;
  if (entry.details?.length) body += list(entry.details.map(esc));
  if (entry.facts?.length) body += '<dl class="reader-facts">' + entry.facts.map(fact => '<div><dt>' + esc(fact.label) + '</dt><dd>' + esc(fact.value) + '</dd></div>').join('') + '</dl>';
  if (entry.spoilers?.length) body += folded('展开剧情与身份资料', entry.spoilers.map(spoiler => '<h3>' + esc(spoiler.title) + '</h3>' + paragraph(spoiler.text)).join(''));
  return body + sourceBlock(entry.sourceRefs?.length ? entry.sourceRefs : [{ name: entry.sourceName, url: entry.sourceUrl, license: entry.license, licenseUrl: entry.licenseUrl, adapted: entry.adapted }], entry.note);
}
function achievementBody(ctx, entry) {
  return image(ctx, entry.icon, entry.name + '成就图标') + '<h2>' + esc(entry.name) + '</h2>' + paragraph(entry.desc || '原版未提供说明。') +
    paragraph('原文类型：' + entry.category) + paragraph(entry.hidden ? '此项由 Steam 公共定义标为隐藏成就。' : entry.spoiler ? '此项为结局剧透分类，不等同于 Steam 官方隐藏标志。' : '普通成就资料。') +
    section('资料来源', paragraph(entry.source?.text || '原版成就简体中文表') + paragraph(entry.hiddenSource) + paragraph('图标直接采用原版游戏成就图像，权利归相应权利人。'), 'reader-source');
}

function makePages(model, config, renderPage) {
  const pages = new Map();
  function add(file, title, description, activeNav, body, breadcrumbLabel) {
    const ctx = pageContext(file, config);
    const breadcrumbs = [{ label: '资料首页', href: ctx.guideRoot + '/index.html' }];
    if (activeNav !== 'home') {
      const category = categories.find(([key]) => key === activeNav);
      breadcrumbs.push({ label: category[1], href: 'index.html' });
      if (breadcrumbLabel) breadcrumbs.push({ label: breadcrumbLabel });
    }
    const heading = '<header class="reader-heading"><p class="reader-meta">咸鱼喵喵 · 查资料，找位置</p><h1>' + esc(title) + '</h1>' + paragraph(description) + headingActions(model, ctx, file, activeNav) + '</header>';
    const html = renderPage({ ...ctx, title, description: title + '：' + description, activeNav, breadcrumbs, body: heading + body(ctx), siteName: config.siteName, blogUrl: config.blogUrl, version: '0.6.0' });
    assert.equal(typeof html, 'string'); assert.ok(!pages.has(file), 'Unique page ' + file); pages.set(file, html);
  }
  add('index.html', '咸鱼喵喵百科', '查物品、看人物与剧情，或点击下方区域，打开地图寻找收集点。', 'home', ctx =>
    '<div class="guide-intro">' + paragraph(model.counts.cells + ' 个地图格 · ' + model.counts.regions + ' 个区域 · ' + model.counts.officialEvents + ' 个收集事件') + '</div>' +
    regionCards(model, ctx) +
    section('继续查阅', '<nav class="reader-quicklinks" aria-label="更多资料">' + categories.filter(([key]) => key !== 'regions' && key !== 'endings').map(([key, label]) => link(key + '/index.html', label)).join('') + '</nav>') +
    section('记录探索进度', paragraph('在 Wiki 中可以勾选收集清单、导入导出进度，或选择本地存档核对已完成的收集点。') +
      '<p class="reader-actions">' + link(interactive(ctx, null, null, 'collection'), '打开收集清单') + link(interactive(ctx, null, null, 'save'), '分析本地存档') + '</p>') + dataSource(model));

  add('items/index.html', '物品图鉴', model.items.length + ' 件物品的用途、基础标价与获取位置。打开交互图鉴可以搜索和筛选。', 'items', ctx =>
    grid(model.items.map(entry => image(ctx, entry.icon, entry.name) + '<h2>' + link(entry.slug + '.html', entry.name) + '</h2>' + paragraph(typeNames[entry.type] || entry.type) + paragraph(entry.desc))) + dataSource(model));
  for (const entry of model.items) add('items/' + entry.slug + '.html', entry.name, '查看' + entry.name + '的用途与获取位置。', 'items', ctx => {
    const rows = model.locations.filter(row => row.itemKey === entry.key);
    const price = entry.shopCandidate && Number.isFinite(entry.price) && entry.price > 0 ? section('基础商店标价', paragraph(entry.price + ' 金币') + paragraph('这是游戏资料中的基础标价，不代表任意商店当前都有售；解锁条件、库存与限购仍以游戏为准。')) : '';
    return '<article class="paper reader-detail">' + image(ctx, entry.icon, entry.name) + '<div class="reader-prose">' + paragraph(entry.desc) + price +
      '<p class="reader-actions">' + link(interactive(ctx, 'item', entry.key, 'items'), '在交互物品图鉴查看') + '</p>' +
      section('获取位置（' + rows.length + ' 条）', locationList(model, ctx, rows), '', 'item-sources') + dataSource(model) + '</div></article>';
  }, entry.name);

  add('characters/index.html', '人物与剧情', model.characters.length + ' 位人物与 ' + model.endings.length + ' 个结局。点击结局直接展开完整版内容；查看人物完整档案时，剧透仍保持收起。', 'characters', ctx =>
    section('结局一览', endingCards(model, ctx) + '<p class="reader-actions">' + link(ctx.guideRoot + '/endings/index.html', '查看全部结局') + '</p>') +
    section('人物档案', characterCards(model, ctx)) + paragraph('人物文字摘编自萌娘百科及其贡献者，各档案保留原文链接、CC BY-NC-SA 4.0 许可与改写说明。'));
  for (const entry of model.characters) {
    const name = entry.identitySpoiler ? entry.safeName || '尚未揭晓的人物' : entry.name;
    add('characters/' + entry.slug + '.html', name, entry.identitySpoiler ? '此人物的身份、资料和图像包含剧透，请按自己的进度展开。' : entry.intro, 'characters', ctx =>
      '<article class="paper reader-detail">' + (entry.identitySpoiler ? folded('展开人物身份与档案', characterBody(ctx, entry)) : characterBody(ctx, entry)) +
      '<p class="reader-actions">' + link(interactive(ctx, 'character', entry.id, 'characters'), '在交互人物档案查看') + '</p></article>', name);
  }

  add('endings/index.html', '结局一览', model.endings.length + ' 个结局。点击卡片，直接在完整版展开对应结局的触发方式与剧情概括。', 'endings', ctx =>
    endingCards(model, ctx) + paragraph('根据萌娘百科《咸鱼喵喵》结局表整理，保留来源与许可。'));
  for (const entry of model.endings) add('endings/' + entry.slug + '.html', entry.name, '展开后阅读此结局的触发方式、剧情概括与原文来源。', 'endings', ctx =>
    '<article class="paper reader-detail">' + image(ctx, entry.icon, entry.name + '图标') + folded('展开结局触发方式与概括', section('触发方式', paragraph(entry.trigger)) + section('概括', paragraph(entry.summary)) + sourceBlock([entry.source])) +
    '<p class="reader-actions">' + link(interactive(ctx, 'ending', entry.id, 'characters'), '在完整版展开这个结局') + '</p></article>', entry.name);

  add('achievements/index.html', '成就手册', model.achievements.length + ' 项原版成就资料。隐藏与结局成就的名称、图标和说明默认收起。', 'achievements', ctx =>
    grid(model.achievements.map(entry => {
      const secret = entry.hidden || entry.spoiler;
      return (secret ? '' : image(ctx, entry.icon, entry.name + '成就图标')) + '<h2>' + link(entry.slug + '.html', secret ? entry.safeTitle : entry.name) + '</h2>' +
        (secret ? folded('展开成就资料（含剧透）', achievementBody(ctx, entry)) : paragraph(entry.desc || '原版未提供说明。'));
    })) + paragraph('彩色图标不代表已解锁。普通进度存档不能确认 Steam 账号成就；可以打开 Wiki 的成就手册，选择本地成就缓存核对。'));
  for (const entry of model.achievements) {
    const secret = entry.hidden || entry.spoiler, name = secret ? entry.safeTitle : entry.name;
    add('achievements/' + entry.slug + '.html', name, secret ? '真实名称、图标和解锁说明包含剧透，展开后查看。' : '原版成就说明与图像；这里不显示个人账号状态。', 'achievements', ctx =>
      '<article class="paper reader-detail">' + (secret ? folded('展开成就资料（含剧透）', achievementBody(ctx, entry)) : achievementBody(ctx, entry)) +
      '<p class="reader-actions">' + link(interactive(ctx, 'achievement', entry.id, 'achievements'), '在交互成就手册查看') + '</p>' + paragraph('图标不代表你已获得此成就。普通进度存档无法确认 Steam 账号成就。') + '</article>', name);
  }

  add('regions/index.html', '区域地图', model.regions.length + ' 个区域，点击缩略图或名称直接打开对应地图；也可以先看收集列表。', 'regions', ctx =>
    regionCards(model, ctx) + dataSource(model));
  for (const entry of model.regions) add('regions/' + entry.slug + '.html', entry.name, '打开区域地图找位置，或向下查看物品获取位置与相邻区域。', 'regions', ctx => {
    const rows = model.locations.filter(row => row.regionId === entry.id);
    const exits = model.overview.connections.filter(connection => connection.from.regionId === entry.id || connection.to.regionId === entry.id);
    const connections = exits.length ? list(exits.map(connection => {
      const otherId = connection.from.regionId === entry.id ? connection.to.regionId : connection.from.regionId;
      const other = model.regions.find(region => region.id === otherId);
      return (other ? link(other.slug + '.html', other.name) : esc('区域待核对')) + ' · ' + esc(connection.bidirectional ? '已核实双向连接' : '已核实连接，方向以原文为准') + paragraph(connection.from.label + ' → ' + connection.to.label);
    })) : paragraph('现有资料未核实普通跨区域出口，保留未知，不推测连接。');
    return '<article class="paper reader-detail">' + regionPreviewLink(model, ctx, entry) +
      section('收集列表（' + rows.length + ' 条）', locationList(model, ctx, rows)) +
      section('已核实的普通跨区域连接', connections + paragraph('连接关系不保证任意剧情阶段均可通行；地形、能力与剧情条件仍以游戏为准。')) + dataSource(model) + '</article>';
  }, entry.name);
  assert.equal(pages.size, model.counts.html, 'Complete static page coverage');
  return pages;
}

function planGuides(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || defaultRoot);
  const config = readConfig(projectRoot, options.siteUrl);
  const model = options.model || loadGuideModel(projectRoot);
  const { renderPage } = require(path.join(projectRoot, 'scripts/lib/guide-template.js'));
  const files = makePages(model, config, renderPage);
  const htmlFiles = [...files.keys()];
  files.set('guide.css', fs.readFileSync(path.join(projectRoot, 'scripts/lib/guide.css'), 'utf8'));
  files.set('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    htmlFiles.map(file => '  <url><loc>' + esc(new URL('guide/' + file, config.siteUrl).href) + '</loc></url>').join('\n') + '\n</urlset>\n');
  const inputs = {};
  const sourceFiles = [
    'site.config.json', 'package.json', 'scripts/build-guides.js', 'scripts/lib/guide-model.js', 'scripts/lib/guide-map-preview.js', 'scripts/lib/guide-template.js', 'scripts/lib/guide.css',
    'dist/assets/brand/logo.png', 'dist/assets/brand/icon.jpg',
    ...Object.values(dataFiles).map(([name]) => 'dist/' + name)
  ];
  for (const entries of [model.items, model.characters, model.endings, model.achievements]) for (const entry of entries) {
    for (const art of [entry.icon, entry.pixel, entry.portrait]) if (art) sourceFiles.push('dist/' + assetPath(art.src));
  }
  for (const file of [...new Set(sourceFiles)].sort()) inputs[file] = hash(fs.readFileSync(path.join(projectRoot, file)));
  const manifest = {
    schemaVersion: 1, generator: 'scripts/build-guides.js', version: '0.6.0', inputs, config,
    modelSha256: hash(JSON.stringify(model)), counts: model.counts,
    files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, content]) => ({ path: file, sha256: hash(content) }))
  };
  files.set(manifestName, JSON.stringify(manifest, null, 2) + '\n');
  return { files, manifest, model };
}

function safeRelative(file) {
  return typeof file === 'string' && /^(?:index\.html|guide\.css|sitemap\.xml|build-manifest\.json|(?:items|characters|endings|achievements|regions)\/[a-z0-9][a-z0-9-]*\.html)$/.test(file);
}
function safeOutputPath(outputDir, file) {
  assert.ok(safeRelative(file), 'Unsafe generated path: ' + String(file));
  const target = path.resolve(outputDir, file);
  assert.ok(target.startsWith(outputDir + path.sep), 'Output must remain inside guide directory');
  let current = outputDir;
  const parts = file.split('/');
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) current = path.join(current, parts[index]);
    if (!fs.existsSync(current)) {
      // lstat also catches dangling links, which existsSync deliberately hides.
      try { assert.ok(!fs.lstatSync(current).isSymbolicLink(), 'No output symlinks'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      continue;
    }
    const stat = fs.lstatSync(current);
    assert.ok(!stat.isSymbolicLink(), 'No output symlinks: ' + current);
    assert.ok(index < parts.length - 1 ? stat.isDirectory() : stat.isFile(), 'Unexpected output file type: ' + current);
  }
  return target;
}
function buildGuides(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || defaultRoot);
  const outputDir = path.resolve(options.outDir || path.join(projectRoot, 'dist/guide'));
  const plan = planGuides({ ...options, projectRoot });
  const manifestPath = safeOutputPath(outputDir, manifestName);
  let oldFiles = [];
  const oldHashes = new Map();
  if (fs.existsSync(manifestPath)) {
    const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(old.schemaVersion, 1, 'Supported build manifest'); assert.ok(Array.isArray(old.files), 'Build manifest file list');
    oldFiles = old.files.map(entry => {
      assert.ok(entry && safeRelative(entry.path) && entry.path !== manifestName, 'Unsafe previous generated entry');
      assert.match(entry.sha256, /^[a-f0-9]{64}$/); safeOutputPath(outputDir, entry.path); oldHashes.set(entry.path, entry.sha256); return entry.path;
    });
    assert.equal(new Set(oldFiles).size, oldFiles.length, 'Unique previous generated paths');
  }
  // Preflight every planned and old path before creating, writing or removing anything.
  for (const file of plan.files.keys()) safeOutputPath(outputDir, file);
  const stale = oldFiles.filter(file => !plan.files.has(file));
  for (const file of stale) {
    const target = safeOutputPath(outputDir, file);
    if (fs.existsSync(target) && hash(fs.readFileSync(target)) !== oldHashes.get(file)) {
      throw Error('旧生成页面已被手工修改，未清理或写入任何页面：' + file);
    }
  }
  const differences = [];
  for (const [file, content] of plan.files) {
    const target = safeOutputPath(outputDir, file);
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(Buffer.from(content, 'utf8'))) differences.push(file);
  }
  for (const file of stale) if (fs.existsSync(safeOutputPath(outputDir, file))) differences.push(file);
  const result = { ok: !options.check || differences.length === 0, outputDir, htmlCount: plan.manifest.counts.html, counts: plan.manifest.counts, files: [...plan.files.keys()], differences, removed: [], changed: differences.length > 0 };
  if (options.check) return result;
  for (const [file, content] of plan.files) {
    const target = safeOutputPath(outputDir, file);
    if (!differences.includes(file)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, 'utf8');
  }
  // Unlink only specific safe files recorded by the old manifest; never recurse into a directory.
  for (const file of stale) {
    const target = safeOutputPath(outputDir, file);
    if (fs.existsSync(target)) { fs.unlinkSync(target); result.removed.push(file); }
  }
  return result;
}

function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--check') options.check = true;
    else if (args[index] === '--site-url') { assert.ok(args[index + 1] && !args[index + 1].startsWith('--'), '--site-url requires a URL'); options.siteUrl = args[++index]; }
    else throw Error('Unknown argument: ' + args[index]);
  }
  const result = buildGuides(options);
  if (!result.ok) { console.error('资料页需要重新生成：' + result.differences.join(', ')); process.exitCode = 1; }
  else console.log((options.check ? '资料页检查通过' : '资料页已生成') + '：' + result.htmlCount + ' 个 HTML 页面。' + (options.check ? '' : '入口 dist/guide/index.html'));
  return result;
}

module.exports = { buildGuides, planGuides, makePages, readConfig, safeRelative, safeOutputPath, main };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message || error); process.exitCode = 1; }
}
