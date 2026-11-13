/* Independent, dependency-free Wiki. This file never connects to the game. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const readable = value => String(value ?? '').replace(/\\[CcIiVvNnPp]\[\d+\]/g, '').replace(/\\[{}.!|><^$]/g, '').replace(/\\[Gg]/g, '金币').replace(/\\n/g, '\n');
  const safeUrl = value => ['./data.js','./assets/characters/manifest.json'].includes(value) || /^https?:\/\//i.test(String(value || '')) ? String(value) : '#';
  const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
  const TYPES = {
    consumables:{ name:'食物', icon:'food' }, stones:{ name:'鱼眼宝石', icon:'gem' },
    ornaments:{ name:'配饰', icon:'ring' }, joycoin:{ name:'弧晶硬币', icon:'coin' },
    hpst:{ name:'逗猫棒', icon:'wand' }, skillst:{ name:'猫抓板', icon:'board' },
    items:{ name:'道具', icon:'bottle' }, weapons:{ name:'武器', icon:'sword' },
    armors:{ name:'配饰', icon:'ring' }, coin:{ name:'金币', icon:'coin' },
    bell:{ name:'铃铛', icon:'bell' }, bells:{ name:'铃铛', icon:'bell' },
    armor:{ name:'配饰', icon:'ring' }, weapon:{ name:'武器', icon:'sword' },
    item:{ name:'道具', icon:'bottle' }
  };
  const typeInfo = type => TYPES[type] || { name:type || '其他', icon:'box' };
  const DATA = window.NYARURU_DATA;
  if (!DATA || !Array.isArray(DATA.items) || !Array.isArray(DATA.cells)) {
    $('#data-error').hidden = false;
    return;
  }
  const { items = [], locations = [], cells = [], regions = [], pages = [], shops = [], meta = {} } = DATA;
  const iconData = window.NYARURU_ICONS || { items:{}, types:{} };
  const overviewData = window.NYARURU_OVERVIEW || { regions:[], connections:[] };
  const overviewRegions = new Map((overviewData.regions || []).map(region => [String(region.id), region]));
  const regionPalette = ['#969b00','#367f00','#2e63fd','#c146fb','#45b3ba','#8d31ff','#454b7f','#d34f7a','#a66e38','#9c739d','#5c50ff','#34798f','#9e8998','#b9544c','#fca5a4','#78805c'];
  const regionColor = id => regionPalette[regions.findIndex(region => String(region.id) === String(id))] || '#829b76';
  const originalIcon = (key, type) => iconData.items?.[key] || iconData.items?.[iconData.types?.[type]];
  const itemIcon = (key, type) => {
    const image = originalIcon(key, type);
    return image ? `<img class="game-icon" src="${esc(image.src)}" width="${esc(image.width)}" height="${esc(image.height)}" alt="" aria-hidden="true">` : '<span class="icon-unavailable" aria-hidden="true">?</span>';
  };
  const characterData = window.NYARURU_CHARACTERS || { characters:[], sources:[] };
  const endingData = window.NYARURU_ENDINGS || { items:[] };
  const achievementData = window.NYARURU_ACHIEVEMENTS || { items:[], meta:{} };
  const itemsByKey = new Map(items.map(item => [item.key, item]));
  const locationsByKey = new Map(locations.map(location => [location.key, location]));
  const cellsByKey = new Map(cells.map(cell => [cell.key, cell]));
  const regionsById = new Map(regions.map(region => [String(region.id), region]));
  const itemSources = new Map(), cellSources = new Map(), officialEvents = new Map();
  for (const location of locations) {
    if (!itemSources.has(location.itemKey)) itemSources.set(location.itemKey, []);
    itemSources.get(location.itemKey).push(location);
    if (location.cellKey) {
      if (!cellSources.has(location.cellKey)) cellSources.set(location.cellKey, []);
      cellSources.get(location.cellKey).push(location);
    }
    if (location.official && location.collectionKey) {
      if (!officialEvents.has(location.collectionKey)) officialEvents.set(location.collectionKey, []);
      officialEvents.get(location.collectionKey).push(location);
    }
  }
  const STORAGE_KEY = 'nyaruru-wiki.collection.v1';
  let completed = new Set(), storageAvailable = true, toastTimer;
  let itemLimit = 36, collectionLimit = 60, selectedCellKey = null;
  let mapCells = [], mapView = { x:0, y:0, scale:1 }, dragging = null;
  const cellSize = 52;

  function notify(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
  }

  function validateCollection(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 ||
        value.application !== 'nyaruru-wiki' || !Array.isArray(value.completed)) {
      throw new Error('文件不是受支持的咸鱼喵喵 Wiki 清单（版本 1）。');
    }
    if (value.completed.length > officialEvents.size || value.completed.some(key => typeof key !== 'string' || !officialEvents.has(key))) {
      throw new Error('清单包含未知事件或条目过多，请核对资料版本。');
    }
    if (new Set(value.completed).size !== value.completed.length) throw new Error('清单存在重复事件编号，请检查文件。');
    return value.completed;
  }

  function collectionDocument(keys = completed) {
    return { application:'nyaruru-wiki', schemaVersion:1, exportedAt:new Date().toISOString(), completed:[...keys].sort() };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) completed = new Set(validateCollection(JSON.parse(saved)));
  } catch (error) {
    storageAvailable = false;
    notify('本地记录无法读取；当前清单为空。请导出备份，或导入已有清单。');
  }

  function persist(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectionDocument(next)));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
      notify('浏览器无法保存本地记录。本次仍可勾选，请及时导出清单备份。');
    }
    completed = next;
  }

  function updateProgress() {
    $('#stat-progress').textContent = completed.size;
    $('#nav-count').textContent = completed.size;
    $('#collection-done').textContent = completed.size;
    $('#collection-total').textContent = ` / ${officialEvents.size} 个官方事件`;
    $('#collection-progress').max = officialEvents.size || 1;
    $('#collection-progress').value = completed.size;
    $$('input[data-collection]').forEach(input => { input.checked = completed.has(input.dataset.collection); });
    $$('[data-marker-event]', $('#map-drawing')).forEach(marker => {
      const isDone = completed.has(marker.dataset.markerEvent);
      marker.classList.toggle('collected', isDone);
      const check = $('.marker-check', marker);
      if (check) check.textContent = isDone ? '✓' : '';
    });
  }

  function eventCheckbox(key) {
    if (!officialEvents.has(key)) return '<span class="tag gold">额外来源 · 不计入官方清单</span>';
    return `<label class="event-check"><input type="checkbox" data-collection="${esc(key)}" ${completed.has(key) ? 'checked' : ''}>已收集此事件（全部奖励）</label>`;
  }

  document.addEventListener('change', event => {
    const input = event.target.closest('input[data-collection]');
    if (!input || !officialEvents.has(input.dataset.collection)) return;
    const next = new Set(completed);
    if (input.checked) next.add(input.dataset.collection); else next.delete(input.dataset.collection);
    persist(next);
    updateProgress();
    if ($('#map-missing').checked) renderMap(false);
    if (!$('#page-collection').hidden) {
      const activeKey = input.dataset.collection;
      renderCollection();
      const remaining = $$('input[data-collection]', $('#collection-list'));
      (remaining.find(node => node.dataset.collection === activeKey) || remaining[0])?.focus({ preventScroll:true });
    }
  });

  const homeTitle = document.title;
  const titles = { map:'世界地图', items:'物品图鉴', collection:'全收集清单', characters:'人物与剧情', bosses:'Boss 档案', achievements:'成就手册', assistant:'全能助手', save:'存档分析', about:'关于' };
  function showPage() {
    const requested = location.hash.startsWith('#bosses/') ? 'bosses' : location.hash.slice(1), active = Object.hasOwn(titles, requested) ? requested : 'map';
    $$('.page').forEach(page => { page.hidden = page.id !== `page-${active}`; });
    $$('[data-nav]').forEach(link => {
      if (link.dataset.nav === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('#breadcrumb').textContent = titles[active];
    document.title = active === 'map' ? homeTitle : `${titles[active]} · 咸鱼喵喵 Wiki`;
    if (active === 'map') requestAnimationFrame(() => { if (!$('#page-map').hidden && !mapCells.length) renderMap(true); });
    if (active === 'collection') renderCollection();
  }
  window.addEventListener('hashchange', showPage);

  function populateSelect(selector, values, firstLabel) {
    $(selector).innerHTML = (firstLabel ? `<option value="">${esc(firstLabel)}</option>` : '') + values.map(value => `<option value="${esc(value.id)}">${esc(value.label)}</option>`).join('');
  }
  const allTypes = [...new Set([...items.map(item => item.type), ...locations.map(location => location.type)])];
  const enabledTypes = new Set(allTypes);
  populateSelect('#item-type', [...new Set(items.map(item => item.type))].map(type => ({ id:type, label:typeInfo(type).name })), '全部类型');
  function updateTypeLegend() {
    $('#map-legend').innerHTML = allTypes.map(type => `<button type="button" data-map-type="${esc(type)}" aria-pressed="${enabledTypes.has(type)}">${itemIcon(null, type)}${esc(typeInfo(type).name)}</button>`).join('') + '<span>✓ 灰色：已收集</span>';
  }
  updateTypeLegend();
  $('#stat-points').textContent = officialEvents.size;
  $('#stat-regions').textContent = regions.length;
  $('#stat-items').textContent = items.length;

  const priceMarkup = item => item.shopCandidate && Number(item.price) > 0 ? `<p class="item-price">${icon('coin')}商店标价 ${esc(item.price)} 金币</p>` : '';
  function renderItems() {
    const query = $('#item-search').value.trim().toLocaleLowerCase(), type = $('#item-type').value;
    const filtered = items.filter(item => (!type || item.type === type) && (!query || `${item.name} ${readable(item.desc)} ${item.id}`.toLocaleLowerCase().includes(query)));
    $('#item-count').textContent = `${filtered.length} 件物品`;
    $('#item-grid').innerHTML = filtered.slice(0, itemLimit).map(item => {
      const info = typeInfo(item.type), sourceCount = (itemSources.get(item.key) || []).length;
      return `<button class="item-card" data-item="${esc(item.key)}" aria-label="查看 ${esc(item.name)} 的用途和来源"><div class="item-top"><span class="item-art">${itemIcon(item.key, item.type)}</span><div><h3>${esc(item.name)}</h3><span class="tag">${esc(info.name)}</span></div></div><p class="item-desc">${esc(readable(item.desc) || '暂无说明')}</p>${priceMarkup(item)}<div class="item-card-footer"><span>${sourceCount ? `${sourceCount} 条来源记录` : '获取来源待核对'}</span><span>查看手记 ↗</span></div></button>`;
    }).join('') || '<p class="empty-state">没有找到匹配物品，试试其他关键词。</p>';
    $('#item-more').hidden = filtered.length <= itemLimit;
  }
  $('#item-search').addEventListener('input', () => { itemLimit = 36; renderItems(); });
  $('#item-type').addEventListener('change', () => { itemLimit = 36; renderItems(); });
  $('#item-more').addEventListener('click', () => { itemLimit += 36; renderItems(); });

  function sourceMarkup(source) {
    const mapped = source.cellKey && cellsByKey.has(source.cellKey);
    return `<article class="source-row"><h3>${esc(source.area || '区域待核对')} · ${esc(source.mapName || `地图 ${source.mapId}`)}</h3><span class="tag ${source.official ? '' : 'gold'}">${source.official ? '官方收集事件' : '额外来源'}</span><p>地图 #${esc(source.mapId)} · 事件 #${esc(source.eventId)}${source.amount != null ? ` · 数量 ${esc(source.amount)}` : ''}</p><p>${esc(readable(source.sourceNote || '地图事件奖励'))}</p><p>${esc(readable(source.requirementNote || '获取条件待核对'))}</p>${mapped ? `<button class="secondary" data-locate="${esc(source.key)}">${icon('pin')}在地图中定位</button>` : '<p>此来源暂无对应地图方格。</p>'}${eventCheckbox(source.collectionKey)}</article>`;
  }
  function showItem(key) {
    const item = itemsByKey.get(key);
    if (!item) { notify('该奖励暂无独立图鉴条目，请查看地点手记。'); return; }
    const sources = itemSources.get(key) || [], info = typeInfo(item.type);
    $('#item-dialog-content').innerHTML = `<div class="item-top"><span class="item-art">${itemIcon(item.key, item.type)}</span><div><h2 id="dialog-title">${esc(item.name)}</h2><span class="tag">${esc(info.name)} · #${esc(item.id)}</span></div></div><p class="dialog-desc">${esc(readable(item.desc) || '暂无说明')}</p>${priceMarkup(item)}<h3>获取来源 <span class="tag">${sources.length} 条</span></h3>${sources.map(sourceMarkup).join('') || '<p class="notice">当前资料中没有已核实的获取来源。</p>'}`;
    if (!$('#item-dialog').open) $('#item-dialog').showModal();
  }
  $('#dialog-close').addEventListener('click', () => $('#item-dialog').close());
  $('#item-dialog').addEventListener('click', event => { if (event.target === $('#item-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
  document.addEventListener('click', event => {
    const itemButton = event.target.closest('[data-item]');
    if (itemButton) showItem(itemButton.dataset.item);
    const locateButton = event.target.closest('[data-locate]');
    if (locateButton) locateSource(locateButton.dataset.locate);
  });

  function renderCollection() {
    const query = $('#collection-search').value.trim().toLocaleLowerCase(), status = $('#collection-status').value;
    const filtered = [...officialEvents].filter(([key, rewards]) => {
      if (status === 'done' && !completed.has(key)) return false;
      if (status === 'missing' && completed.has(key)) return false;
      return !query || rewards.some(reward => `${reward.area} ${reward.mapName} ${itemsByKey.get(reward.itemKey)?.name || typeInfo(reward.type).name} ${key}`.toLocaleLowerCase().includes(query));
    });
    $('#collection-count').textContent = `${filtered.length} 个事件`;
    $('#collection-list').innerHTML = filtered.slice(0, collectionLimit).map(([key, rewards]) => {
      const first = rewards[0], mapped = rewards.find(reward => reward.cellKey && cellsByKey.has(reward.cellKey));
      const names = rewards.map(reward => `${itemsByKey.get(reward.itemKey)?.name || typeInfo(reward.type).name}${reward.amount != null ? ` ×${reward.amount}` : ''}`).join('、');
      return `<article class="collection-row ${completed.has(key) ? 'done' : ''}" data-event="${esc(key)}"><label><input type="checkbox" data-collection="${esc(key)}" aria-label="标记 ${esc(first.mapName)} 事件 ${esc(first.eventId)}：${esc(names)}" ${completed.has(key) ? 'checked' : ''}></label><div><h3>${esc(names)}</h3><p>${esc(first.area)} · ${esc(first.mapName)} · 事件 ${esc(first.eventId)}</p><p>${esc(readable(first.requirementNote || '获取条件待核对'))}</p></div>${mapped ? `<button class="secondary" data-locate="${esc(mapped.key)}">地图定位 ↗</button>` : '<span class="tag">地图待核对</span>'}</article>`;
    }).join('') || '<p class="empty-state">没有符合筛选条件的事件。</p>';
    $('#collection-more').hidden = filtered.length <= collectionLimit;
  }
  $('#collection-search').addEventListener('input', () => { collectionLimit = 60; renderCollection(); });
  $('#collection-status').addEventListener('change', () => { collectionLimit = 60; renderCollection(); });
  $('#collection-more').addEventListener('click', () => { collectionLimit += 60; renderCollection(); });
  $('#collection-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(collectionDocument(), null, 2)], { type:'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = `咸鱼喵喵-Wiki清单-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`已导出 ${completed.size} 个已完成事件。`);
  });
  $('#collection-import').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('文件超过 2 MB，无法作为 Wiki 清单导入。');
      const imported = validateCollection(JSON.parse(await file.text()));
      const next = new Set([...completed, ...imported]), added = next.size - completed.size;
      // Validation finishes before either persistent or in-memory state changes.
      persist(next);
      updateProgress(); renderCollection();
      if ($('#map-missing').checked) renderMap(false);
      notify(`导入成功，新增 ${added} 个已完成事件。${storageAvailable ? '原清单已保留。' : '请导出备份，本地存储当前不可用。'}`);
    } catch (error) {
      notify(`导入失败，原清单未改变。${error instanceof SyntaxError ? '文件不是有效 JSON。' : error.message}`);
    } finally { event.target.value = ''; }
  });

  function populatePages() {
    const old = $('#map-page').value;
    populateSelect('#map-page', pages.map(page => ({ id:page.id, label:page.label || `地图页 ${page.id}` })));
    if (pages.some(page => String(page.id) === old)) $('#map-page').value = old;
    if (!isOverview() && !$('#map-region').value) $('#map-page').value = '2';
    populateMapRegions();
  }
  function populateMapRegions(preferred = $('#map-region').value) {
    populateSelect('#map-region', regions.map(region => ({ id:region.id, label:region.name })), isOverview() ? `全世界（${regions.length} 区域）` : '小镇周围');
    if (!isOverview() && regions.some(region => String(region.id) === String(preferred))) $('#map-region').value = String(preferred);
  }
  const isOverview = () => $('#map-mode').value === 'overview';
  function cellPosition(cell) {
    const offset = isOverview() ? overviewRegions.get(String(cell.regionId)) : null;
    return { x:cell.x + (offset?.offsetX || 0), y:cell.y + (offset?.offsetY || 0) };
  }
  function visibleSources(cell) {
    return (cellSources.get(cell.key) || []).filter(source => enabledTypes.has(source.type) && (!$('#map-missing').checked || !completed.has(source.collectionKey)));
  }
  let selectedConnection = null, connectionGroups = [], visibleRegions = [];
  function renderMap(fit = false) {
    $$('[data-map-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mapMode === $('#map-mode').value)));
    if (!isOverview() && !$('#map-region').value) $('#map-page').value = '2';
    const page = $('#map-page').value, region = $('#map-region').value, overview = isOverview();
    mapCells = cells.filter(cell => overview || (String(cell.page) === page && (!region || String(cell.regionId) === region)));
    visibleRegions = regions.filter(region => mapCells.some(cell => String(cell.regionId) === String(region.id)));
    $('#map-heading').textContent = overview ? '世界总览' : !region ? '小镇周围' : visibleRegions.map(region => region.name).join(' · ') || '地图区域';
    $('#map-connection-note').textContent = overview ? `当前显示全世界 ${regions.length} 个区域。实线：已核实出口；虚线：剧情传送（需开启）。${overviewData.meta?.unlinkedNote || '没有已核实入口的区域保留独立位置，不推测连接。'} 点击区域名称进入分区。` : !region ? '小镇周围：喵喵小镇、幽暗之森、魔法学校、弧晶矿洞。可在区域菜单中分别查看，也可返回世界总览。' : '当前显示所选独立区域；“小镇周围”可一起查看小镇、森林、学校和矿洞。';
    $('#map-page').disabled = overview;
    $('#map-page').parentElement.classList.toggle('inactive-filter', overview);
    $('#map-region').value = overview ? '' : region;
    $('#map-stage').classList.toggle('overview', overview);
    $('#map-region-legend').innerHTML = (overview ? regions : visibleRegions).map(region => `<button data-region="${esc(region.id)}" aria-label="查看${esc(region.name)}区域"><span class="region-dot region-swatch" style="--region-color:${regionColor(region.id)}"></span>${isOverview() ? `<span class="region-index">${regions.indexOf(region)+1}</span>` : ''}${esc(region.name)}</button>`).join('');
    const positions = new Map(mapCells.map(cell => { const p = cellPosition(cell); return [`${p.x}:${p.y}`, cell]; }));
    const markedEvents = new Set();
    $('#map-drawing').innerHTML = mapCells.map(cell => {
      const sourceGroups = new Map();
      visibleSources(cell).forEach(source => { const key = `${source.collectionKey}:${source.itemKey}`; if (!sourceGroups.has(key)) sourceGroups.set(key, source); });
      const markers = [...sourceGroups.values()], position = cellPosition(cell);
      markers.forEach(marker => markedEvents.add(marker.collectionKey || marker.key));
      const fill = regionColor(cell.regionId);
      const edges = [['left',-1,0,0,0,0,52],['top',0,-1,0,0,52,0],['right',1,0,52,0,52,52],['bottom',0,1,0,52,52,52]];
      const walls = edges.map(([side, dx, dy, x1, y1, x2, y2]) => {
        const neighbor = positions.get(`${position.x + dx}:${position.y + dy}`);
        if (neighbor && neighbor.mapId === cell.mapId) return '';
        if (cell.walls?.[side] === false || cell.exits?.[side]) return `<path class="world-wall" d="M${x1} ${y1}L${x1 + (x2-x1)*.3} ${y1 + (y2-y1)*.3}M${x1 + (x2-x1)*.7} ${y1 + (y2-y1)*.7}L${x2} ${y2}"/>`;
        return `<path class="world-wall" d="M${x1} ${y1}L${x2} ${y2}"/>`;
      }).join('');
      const markerArt = markers.slice(0, 4).map((marker, index) => {
        const x = markers.length === 1 ? 15 : 4 + (index % 2) * 24;
        const y = markers.length <= 2 ? 15 : 4 + Math.floor(index / 2) * 24;
        const name = itemsByKey.get(marker.itemKey)?.name || typeInfo(marker.type).name, image = originalIcon(marker.itemKey, marker.type);
        return `<g class="map-marker ${completed.has(marker.collectionKey) ? 'collected' : ''}" data-marker-event="${esc(marker.collectionKey)}" data-marker-type="${esc(marker.type)}" data-marker-item="${esc(marker.itemKey)}" transform="translate(${x} ${y})"><title>${esc(name)}</title><rect width="21" height="21" rx="4"/>${image ? `<image class="game-icon" href="${esc(image.src)}" x="1" y="1" width="19" height="19" preserveAspectRatio="xMidYMid meet"/>` : ''}<text class="marker-check" x="16" y="7">${completed.has(marker.collectionKey) ? '✓' : ''}</text></g>`;
      }).join('');
      return `<g class="world-cell ${cell.hidden ? 'hidden-cell' : ''} ${cell.key === selectedCellKey ? 'selected' : ''}" data-cell="${esc(cell.key)}" data-region-id="${esc(cell.regionId)}" transform="translate(${position.x*cellSize} ${position.y*cellSize})" tabindex="0" role="button" aria-label="${esc(cell.mapName)}，方格 ${esc(cell.x)}, ${esc(cell.y)}，${markers.length} 件奖励"><title>${esc(cell.mapName)} · (${cell.x}, ${cell.y})${cell.hidden ? ' · 隐藏区域' : ''}</title><rect class="world-floor" width="52" height="52" style="--cell-fill:${fill}" fill-opacity=".53"/>${walls}<rect class="world-cell-outline" x="2" y="2" width="48" height="48"/>${markerArt}${markers.length > 4 ? `<text class="marker-overflow" x="34" y="50">+${markers.length - 4}</text>` : ''}</g>`;
    }).join('');
    const available = new Set(mapCells.map(cell => cell.key)), grouped = new Map();
    const connections = [...(overviewData.connections || []), ...($('#map-story').checked ? (overviewData.specialConnections || []) : [])];
    connections.filter(connection => available.has(connection.from.cellKey) && available.has(connection.to.cellKey)).forEach(connection => {
      const key = `${connection.kind === 'story' ? 'story:' : ''}${[connection.from.regionId, connection.to.regionId].sort((a,b) => a-b).join(':')}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(connection);
    });
    connectionGroups = [...grouped].map(([key, links]) => ({ key, links }));
    $('#map-empty').hidden = !!mapCells.length;
    $('#map-summary').dataset.count = `${mapCells.length} 个方格 · ${markedEvents.size} 个来源事件`;
    if (fit) fitMap(); else applyView();
    if (selectedConnection && connectionGroups.some(group => group.key === selectedConnection)) renderConnectionDetail(selectedConnection);
    else { selectedConnection = null; renderMapDetail(); }
  }
  function endpointPosition(endpoint) {
    const cell = cellsByKey.get(endpoint.cellKey);
    if (!cell) return { x:0, y:0 };
    const position = cellPosition(cell), side = { left:[0,.5], right:[1,.5], top:[.5,0], bottom:[.5,1] }[endpoint.side] || [.5,.5];
    return { x:mapView.x + (position.x + side[0])*cellSize*mapView.scale, y:mapView.y + (position.y + side[1])*cellSize*mapView.scale };
  }
  function connectionName(connection) {
    return `${regionsById.get(String(connection.from.regionId))?.name || connection.from.regionId} ${connection.bidirectional ? '↔' : '→'} ${regionsById.get(String(connection.to.regionId))?.name || connection.to.regionId}`;
  }
  function renderMapAnnotations() {
    const focused = document.activeElement, focusConnection = focused?.dataset?.connection, focusRegion = focused?.classList?.contains('region-label') ? focused.dataset.region : null;
    $('#map-links').innerHTML = $('#map-connections').checked ? connectionGroups.map(group => {
      const connection = group.links[0], a = endpointPosition(connection.from), b = endpointPosition(connection.to);
      const dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy) || 1;
      const bend = Math.min(46, Math.max(25,length*.15)), mx = (a.x+b.x)/2-dy/length*bend, my = (a.y+b.y)/2+dx/length*bend;
      // Adjacent regions share the same boundary point: an exit loop keeps that
      // exact anchor visible instead of emitting a zero-length arrow.
      const path = Math.hypot(dx,dy) < 3
        ? `M${a.x} ${a.y} C${a.x-24} ${a.y-28} ${b.x+24} ${b.y-28} ${b.x} ${b.y}`
        : `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
      return `<g class="world-connection ${connection.kind === 'story' ? 'story-connection' : ''} ${selectedConnection === group.key ? 'selected' : ''}" data-connection="${esc(group.key)}" role="button" tabindex="0" aria-label="${esc(connectionName(connection))}，${group.links.length} 条出口，查看详情"><title>${esc(connectionName(connection))} · ${group.links.length} 条出口</title><path class="connection-hit" d="${path}"/><path class="connection-line" d="${path}" marker-end="url(#exit-arrow)" ${connection.bidirectional ? 'marker-start="url(#exit-arrow)"' : ''}/><circle cx="${a.x}" cy="${a.y}" r="2.4"/><circle cx="${b.x}" cy="${b.y}" r="2.4"/>${group.links.length > 1 ? `<text class="connection-count" x="${mx}" y="${my}">${group.links.length}</text>` : ''}</g>`;
    }).join('') : '';
    // Keep text readable in screen pixels, but lay out every label relative to the
    // map, before adding its pan. Viewport edges never move or reflow labels.
    const occupied = [], compactLabels = isOverview() && window.matchMedia('(max-width:700px)').matches;
    $('.map-hint').textContent = compactLabels ? '编号对应上方区域 · 可拖动缩放' : '拖动平移 · 滚轮缩放';
    $('#map-labels').innerHTML = visibleRegions.map(region => {
      const localCells = mapCells.filter(cell => String(cell.regionId) === String(region.id)), positions = localCells.map(cellPosition);
      const cx = (Math.min(...positions.map(p=>p.x))+Math.max(...positions.map(p=>p.x))+1)/2*cellSize*mapView.scale;
      const cy = Math.min(...positions.map(p=>p.y))*cellSize*mapView.scale;
      const width = compactLabels ? 28 : region.name.length*12+22, height = 25;
      let x = cx-width/2, y = cy-30;
      const overlaps = (px,py) => occupied.some(r=>px<r.x+r.w+5 && px+width+5>r.x && py<r.y+r.h+4 && py+height+4>r.y);
      if (overlaps(x,y)) {
        const candidates = [];
        for (let row=-4;row<=4;row++) for (let col=-4;col<=4;col++) candidates.push({ x:x+col*(width+6), y:y+row*30, distance:Math.hypot(col*(width+6),row*30) });
        const best = candidates.sort((a,b)=>a.distance-b.distance).find(p=>!overlaps(p.x,p.y));
        if (best) { x=best.x; y=best.y; }
      }
      occupied.push({x,y,w:width,h:height});
      return `<g class="region-label ${compactLabels ? 'compact-region-label' : ''}" data-region="${esc(region.id)}" transform="translate(${mapView.x} ${mapView.y})" role="button" tabindex="0" aria-label="查看${esc(region.name)}分区"><title>${esc(region.name)}</title><path class="region-leader" d="M${cx} ${cy}L${x+width/2} ${y+height}"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" style="stroke:${regionColor(region.id)}"/>${compactLabels ? `<text x="${x+width/2}" y="${y+17}" text-anchor="middle">${regions.indexOf(region)+1}</text>` : `<circle cx="${x+9}" cy="${y+12}" r="3" fill="${regionColor(region.id)}"/><text x="${x+17}" y="${y+17}">${esc(region.name)}</text>`}</g>`;
    }).join('');
    if (focusConnection) $$('[data-connection]', $('#map-links')).find(node=>node.dataset.connection===focusConnection)?.focus({preventScroll:true});
    if (focusRegion) $$('[data-region]', $('#map-labels')).find(node=>node.dataset.region===focusRegion)?.focus({preventScroll:true});
  }
  function applyView() {
    $('#map-drawing').setAttribute('transform', `translate(${mapView.x} ${mapView.y}) scale(${mapView.scale})`);
    $('#map-summary').textContent = `${$('#map-summary').dataset.count || ''} · ${Math.round(mapView.scale * 100)}%`;
    renderMapAnnotations();
  }
  function fitMap() {
    if (!mapCells.length) return;
    const bounds = $('#map-svg').getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const positions = mapCells.map(cellPosition), minX = Math.min(...positions.map(p=>p.x))*cellSize, minY = Math.min(...positions.map(p=>p.y))*cellSize;
    const width = Math.max(...positions.map(p=>p.x))*cellSize-minX+cellSize, height = Math.max(...positions.map(p=>p.y))*cellSize-minY+cellSize;
    const scale = Math.min(2.5, (bounds.width-46)/width, (bounds.height-115)/height);
    mapView = { scale, x:(bounds.width-width*scale)/2-minX*scale, y:62+(bounds.height-115-height*scale)/2-minY*scale };
    applyView();
  }
  function zoomMap(factor, x, y) {
    const bounds = $('#map-svg').getBoundingClientRect();
    x ??= bounds.width/2; y ??= bounds.height/2;
    const scale = Math.min(4,Math.max(.025,mapView.scale*factor)), ratio = scale/mapView.scale;
    mapView = { scale, x:x-(x-mapView.x)*ratio, y:y-(y-mapView.y)*ratio };
    applyView();
  }
  function renderConnectionDetail(key) {
    const group = connectionGroups.find(group => group.key === key);
    if (!group) return;
    selectedConnection = key;
    $('#map-detail').innerHTML = `<h3>区域出口 · ${group.links.length} 条</h3><p class="detail-meta">${esc(connectionName(group.links[0]))}</p><p class="muted">箭头落在已核实出口。多条连接按区域对合并显示，逐条端点如下。</p>${group.links.map(connection => `<article class="reward-card"><h3>${esc(connectionName(connection))}</h3><span class="tag">${connection.kind === 'story' ? '剧情传送 · 条件见说明' : connection.bidirectional ? '双向连接' : '单向连接'}</span>${[connection.from, connection.to].map((endpoint,index) => `<p><strong>${index ? '终点' : '起点'}：${esc(regionsById.get(String(endpoint.regionId))?.name)}</strong><br>${esc(endpoint.label || '')}<br>地图 #${esc(endpoint.mapId)} · ${esc(({left:'左侧',right:'右侧',top:'上侧',bottom:'下侧'})[endpoint.side] || '固定落点')}</p><button class="secondary" data-endpoint="${esc(endpoint.cellKey)}">定位${index ? '终点' : '起点'}</button>`).join('')}<p>${connection.kind === 'story' ? '这是单向剧情传送，发生条件待核对。请结合游戏进度确认。' : connection.bidirectional ? '两端区域之间已记录双向出口，可分别定位查看。' : connection.from.side === 'bottom' ? '此处下落是单向通路，方向为起点到终点。' : '这是单向通路，方向为起点到终点。'}</p></article>`).join('')}`;
    renderMapAnnotations();
  }
  function selectCell(key) {
    selectedConnection = null;
    selectedCellKey = key;
    $$('[data-cell]', $('#map-drawing')).forEach(node => node.classList.toggle('selected', node.dataset.cell === key));
    renderMapDetail();
    renderMapAnnotations();
  }
  function renderMapDetail() {
    const cell = cellsByKey.get(selectedCellKey);
    if (!cell || !mapCells.some(current => current.key === cell.key)) {
      $('#map-detail').innerHTML = `<div class="detail-empty">${icon('map')}<h3>从一个方格开始</h3><p>点选地图中的房间，<br>查看这里记录的物品与收集事件。</p></div>`;
      return;
    }
    const sources = cellSources.get(cell.key) || [], groups = new Map();
    sources.forEach(source => { const key = source.collectionKey || source.key; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(source); });
    const localShops = shops.filter(shop => shop.mapId === cell.mapId);
    $('#map-detail').innerHTML = `<h3>${esc(cell.mapName)}</h3><p class="detail-meta">${esc(regionsById.get(String(cell.regionId))?.name || '区域待核对')} · 地图 #${esc(cell.mapId)}<br>方格 (${cell.x}, ${cell.y})${cell.hidden ? ' · 隐藏区域' : ''}</p>${[...groups].map(([key, rewards]) => `<article class="reward-card" data-detail-event="${esc(key)}"><span class="tag">事件 #${esc(rewards[0].eventId)}</span>${rewards.map(reward => `<div class="reward-line">${itemIcon(reward.itemKey, reward.type)}<button data-item="${esc(reward.itemKey)}">${esc(itemsByKey.get(reward.itemKey)?.name || typeInfo(reward.type).name)}</button>${reward.amount != null ? `<span>×${esc(reward.amount)}</span>` : ''}</div>`).join('')}<p>${esc(readable(rewards[0].sourceNote || '地图事件奖励'))}</p><p>${esc(readable(rewards[0].requirementNote || '获取条件待核对'))}</p>${eventCheckbox(key)}</article>`).join('') || '<p class="muted">这个方格暂无已记录的奖励点。</p>'}${localShops.length ? '<p class="notice">此房间记录有商店入口，具体售卖物品与条件待核对。</p>' : ''}`;
  }
  function locateCell(cell) {
    $('#item-dialog').close();
    $('#map-mode').value = 'region';
    $('#map-page').value = String(cell.page);
    populateMapRegions(cell.regionId);
    $('#map-missing').checked = false;
    (cellSources.get(cell.key) || []).forEach(source => enabledTypes.add(source.type));
    updateTypeLegend();
    selectedCellKey = cell.key;
    selectedConnection = null;
    location.hash = 'map';
    showPage();
    requestAnimationFrame(() => {
      renderMap(true);
      const bounds = $('#map-svg').getBoundingClientRect();
      mapView.scale = Math.max(mapView.scale, 1.15);
      mapView.x = bounds.width/2-(cell.x+.5)*cellSize*mapView.scale;
      mapView.y = bounds.height/2-(cell.y+.5)*cellSize*mapView.scale;
      applyView();
      $('#map-stage').scrollIntoView({ block:'center', behavior:'auto' });
      $$('[data-cell]', $('#map-drawing')).find(node => node.dataset.cell === cell.key)?.focus({ preventScroll:true });
      notify(`已定位：${cell.mapName}。`);
    });
  }
  function locateSource(key) {
    const source = locationsByKey.get(key), cell = cellsByKey.get(source?.cellKey);
    if (!cell) { notify('此来源暂无可定位的地图方格。'); return; }
    locateCell(cell);
  }
  function selectRegion(id) {
    if (!id && isOverview()) return;
    $('#map-mode').value = 'region';
    if (id) {
      const target = cells.find(cell => String(cell.regionId) === String(id));
      if (target) $('#map-page').value = String(target.page);
    } else $('#map-page').value = '2';
    populateMapRegions(id);
    selectedCellKey = null; selectedConnection = null; renderMap(true);
  }
  $('#map-mode').addEventListener('change', () => { selectedCellKey = null; selectedConnection = null; populatePages(); renderMap(true); });
  $$('[data-map-mode]').forEach(button => button.addEventListener('click', () => {
    $('#map-mode').value = button.dataset.mapMode;
    $('#map-mode').dispatchEvent(new Event('change'));
  }));
  $('#map-region').addEventListener('change', () => selectRegion($('#map-region').value));
  $('#map-page').addEventListener('change', () => { populateMapRegions(''); selectedCellKey = null; selectedConnection = null; renderMap(true); });
  $('#map-legend').addEventListener('click', event => {
    const button = event.target.closest('[data-map-type]');
    if (!button) return;
    const type = button.dataset.mapType;
    if (enabledTypes.has(type)) enabledTypes.delete(type); else enabledTypes.add(type);
    button.setAttribute('aria-pressed', String(enabledTypes.has(type)));
    renderMap(false);
  });
  document.addEventListener('click', event => {
    const region = event.target.closest('button[data-region]'), endpoint = event.target.closest('[data-endpoint]');
    if (region) selectRegion(region.dataset.region);
    if (endpoint && cellsByKey.has(endpoint.dataset.endpoint)) locateCell(cellsByKey.get(endpoint.dataset.endpoint));
  });
  $('#map-missing').addEventListener('change', () => renderMap(false));
  $('#map-connections').addEventListener('change', renderMapAnnotations);
  $('#map-story').addEventListener('change', () => renderMap(false));
  $('#map-zoom-in').addEventListener('click', () => zoomMap(1.25));
  $('#map-zoom-out').addEventListener('click', () => zoomMap(.8));
  $('#map-fit').addEventListener('click', fitMap);
  $('#map-svg').addEventListener('wheel', event => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    zoomMap(event.deltaY < 0 ? 1.12 : 1/1.12, event.clientX - bounds.left, event.clientY - bounds.top);
  }, { passive:false });
  $('#map-svg').addEventListener('click', event => {
    // Pointer gestures are handled on release; synthetic clicks aid assistive tools.
    if (event.detail !== 0) return;
    const connection = event.target.closest('[data-connection]'), region = event.target.closest('[data-region]'), cell = event.target.closest('[data-cell]');
    if (connection) renderConnectionDetail(connection.dataset.connection);
    else if (region) selectRegion(region.dataset.region);
    else if (cell) selectCell(cell.dataset.cell);
  });
  $('#map-svg').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = { id:event.pointerId, startX:event.clientX, startY:event.clientY, x:mapView.x, y:mapView.y, moved:false, key:event.target.closest('[data-cell]')?.dataset.cell, connection:event.target.closest('[data-connection]')?.dataset.connection, region:event.target.closest('[data-region]')?.dataset.region };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('dragging');
  });
  $('#map-svg').addEventListener('pointermove', event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    const dx = event.clientX - dragging.startX, dy = event.clientY - dragging.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragging.moved = true;
    if (dragging.moved) { mapView.x = dragging.x + dx; mapView.y = dragging.y + dy; applyView(); }
  });
  $('#map-svg').addEventListener('pointerup', event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    if (!dragging.moved && dragging.key) selectCell(dragging.key);
    if (!dragging.moved && dragging.connection) renderConnectionDetail(dragging.connection);
    if (!dragging.moved && dragging.region) selectRegion(dragging.region);
    dragging = null; event.currentTarget.classList.remove('dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  });
  $('#map-svg').addEventListener('pointercancel', () => { dragging = null; $('#map-svg').classList.remove('dragging'); });
  $('#map-svg').addEventListener('keydown', event => {
    const region = event.target.closest('[data-region]'), connection = event.target.closest('[data-connection]');
    if (event.key === 'Enter' || event.key === ' ') {
      if (region) { event.preventDefault(); selectRegion(region.dataset.region); }
      if (connection) { event.preventDefault(); renderConnectionDetail(connection.dataset.connection); }
    }
    const cell = event.target.closest('[data-cell]');
    if (cell && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectCell(cell.dataset.cell); }
    const delta = { ArrowLeft:[35,0], ArrowRight:[-35,0], ArrowUp:[0,35], ArrowDown:[0,-35] }[event.key];
    if (delta) { event.preventDefault(); mapView.x += delta[0]; mapView.y += delta[1]; applyView(); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomMap(1.25); }
    if (event.key === '-') { event.preventDefault(); zoomMap(.8); }
  });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!$('#page-map').hidden) fitMap(); }, 160); });

  // Achievement state is session-only. Missing evidence always remains unknown.
  let achievementState = null, achievementRequest = 0;
  const expandedAchievements = new Set();
  const achievementItems = Array.isArray(achievementData.items) ? achievementData.items : [];
  const achievementLabels = { unlocked:'已获得', locked:'未获得', unknown:'未能确认', reference:'资料展示' };
  const achievementEvidence = {
    'slot-has-no-platform-achievement-table':'普通进度存档没有账号成就表，无法确认此成就。',
    'missing-or-invalid-native-dictionary':'未找到有效的非 Steam 成就记录，无法确认此成就。',
    'native-explicit-boolean':'根据非 Steam 版配置中明确记录的成就状态。',
    'native-dictionary-absent-entry-is-false':'非 Steam 版的完整成就记录未标记此项；按该版本规则视为未获得。',
    'steam-cache-explicit-bit':'根据 Steam 本地缓存明确记录的成就状态。',
    'missing-or-invalid-steam-stat-group':'Steam 缓存缺少有效的成就记录，无法确认此项。',
    'steam-cache-conflicting-bit-and-time':'Steam 缓存中的成就状态与解锁时间冲突，暂时无法确认。'
  };
  function achievementDetails(entry) {
    const image = entry.icon;
    const art = image && /^assets\/[a-zA-Z0-9_./-]+$/.test(image.src || '') ? `<img class="achievement-icon" src="${esc(image.src)}" width="${esc(image.width || 96)}" height="${esc(image.height || 96)}" alt="" loading="lazy">` : `<span class="achievement-placeholder" aria-hidden="true">${icon('gem')}</span>`;
    const guide = typeof entry.guide === 'string' ? entry.guide : entry.guide?.text;
    return `<div class="achievement-heading">${art}<div><h2>${esc(entry.name)}</h2>${entry.category ? `<span class="tag">${esc(entry.category)}</span>` : ''}</div></div><p class="achievement-desc">${esc(entry.desc || '原版未提供说明。')}</p>${guide ? `<div class="achievement-guide"><h3>获取提示</h3><p>${esc(guide)}</p></div>` : ''}`;
  }
  function renderAchievements() {
    const search = $('#achievement-search').value.trim().toLocaleLowerCase(), filter = $('#achievement-filter').value;
    const matched = achievementItems.filter(entry => {
      const concealed = (entry.hidden || entry.spoiler) && !expandedAchievements.has(String(entry.id));
      const status = achievementState ? achievementState.byId.get(String(entry.id))?.status || 'unknown' : 'reference';
      return (filter === 'all' || status === filter) && (!search || (!concealed && `${entry.name} ${entry.desc}`.toLocaleLowerCase().includes(search)));
    });
    $('#achievement-grid').innerHTML = matched.map(entry => {
      const id = String(entry.id), index = achievementItems.indexOf(entry), secret = Boolean(entry.hidden || entry.spoiler), expanded = expandedAchievements.has(id);
      const state = achievementState?.byId.get(id), status = achievementState ? state?.status || 'unknown' : 'reference';
      const panelId = `achievement-detail-${index}`;
      return `<article class="achievement-card status-${status}${secret && !expanded ? ' concealed' : ''}" data-achievement="${esc(id)}" data-status="${status}"><span class="achievement-state">${achievementLabels[status]}</span>${secret ? `<div class="achievement-secret-intro" ${expanded ? 'hidden' : ''}><span class="achievement-placeholder" aria-hidden="true">${icon('gem')}</span><h2>尚未揭晓的成就</h2><p>名称、图标与条件可能透露剧情，展开后查看。</p></div><button type="button" class="secondary spoiler-toggle" data-achievement-toggle="${esc(id)}" aria-expanded="${expanded}" aria-controls="${panelId}">${expanded ? '收起剧透内容' : '展开剧透内容'}</button><div id="${panelId}" class="achievement-details" ${expanded ? '' : 'hidden'}>${expanded ? achievementDetails(entry) : ''}</div>` : achievementDetails(entry)}${achievementState ? `<p class="achievement-evidence">${esc(state?.basis || (status === 'unknown' ? '当前来源没有足够记录，无法确认此成就。' : '由本次读取的本地成就记录确认。'))}</p>` : ''}</article>`;
    }).join('') || '<p class="empty-state">没有符合条件的成就。未展开的剧透内容不会参与搜索。</p>';
    $('#achievement-count').textContent = `显示 ${matched.length} / ${achievementItems.length} 项`;
  }
  function setAchievementState(result, fallbackLabel = '本地存档') {
    const byId = new Map();
    const allowedIds = new Set(achievementItems.map(entry => String(entry.id)));
    for (const entry of Array.isArray(result?.achievements) ? result.achievements : []) {
      if (!allowedIds.has(String(entry.id))) continue;
      byId.set(String(entry.id), { status:['unlocked','locked'].includes(entry.status) ? entry.status : 'unknown', basis:achievementEvidence[entry.basis] || '' });
    }
    achievementState = { byId };
    const counts = { unlocked:0, locked:0, unknown:0 };
    achievementItems.forEach(entry => { counts[byId.get(String(entry.id))?.status || 'unknown'] += 1; });
    const source = result?.coverage?.achievements?.label || fallbackLabel;
    const sourceKind = result?.coverage?.achievements?.source;
    const sourceNote = sourceKind === 'steam-cache' ? ' 缓存可能落后于在线账号状态；游戏编号仅根据原始文件名识别，请勿改名导入其他游戏缓存。' : sourceKind === 'native-config' ? ' 此来源仅代表非 Steam 本地成就，不代表 Steam 或 4399 账号成就。' : '';
    $('#achievement-status').textContent = `状态来源：${source}。已获得 ${counts.unlocked} 项，未获得 ${counts.locked} 项，未能确认 ${counts.unknown} 项。状态仅反映本次读取的记录；未能确认不等于未获得。${sourceNote}`;
    $('#achievement-filter').disabled = false;
    renderAchievements();
  }
  function clearAchievementState(message = '尚未读取成就状态。彩色图标仅为资料展示，不代表已解锁。') {
    achievementRequest += 1;
    achievementState = null;
    $('#achievement-file').value = '';
    $('#achievement-filter').value = 'all';
    $('#achievement-filter').disabled = true;
    $('#achievement-status').textContent = message;
    renderAchievements();
  }
  $('#achievement-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-achievement-toggle]');
    if (!button) return;
    const id = button.dataset.achievementToggle;
    if (expandedAchievements.has(id)) expandedAchievements.delete(id); else expandedAchievements.add(id);
    renderAchievements();
    $$('[data-achievement-toggle]').find(node => node.dataset.achievementToggle === id)?.focus({ preventScroll:true });
  });
  $('#achievement-search').addEventListener('input', renderAchievements);
  $('#achievement-filter').addEventListener('change', renderAchievements);
  $('#achievement-clear').addEventListener('click', () => clearAchievementState('成就状态已清空。彩色图标恢复为资料展示，不代表已解锁。'));
  function updateAchievementSource() {
    const steam = $('#achievement-source').value === 'steam';
    $('#achievement-file').accept = steam ? '.bin' : '.rmmzsave';
    $('#achievement-input-note').textContent = steam
      ? '在 Steam 安装目录的 appcache/stats 中选择本游戏的 UserGameStats_账号数字_1478160.bin。缓存可能未同步账号最新进度；文件名及账号数字不会展示或保存。'
      : '仅适用于非 Steam 版：选择游戏存档目录中的 config.rmmzsave。请勿将 Steam 版配置当成非 Steam 成就来源。';
  }
  $('#achievement-source').addEventListener('change', () => { clearAchievementState(); updateAchievementSource(); });
  $('#achievement-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    clearAchievementState();
    if (!file) return;
    const request = achievementRequest;
    if (file.size > 4 * 1024 * 1024) { $('#achievement-status').textContent = '文件超过 4 MiB，未读取。旧成就状态已清除。'; return; }
    $('#achievement-status').textContent = '正在本机浏览器中核对成就记录…';
    try {
      const steam = $('#achievement-source').value === 'steam';
      if (steam ? !/\.bin$/i.test(file.name) : !/\.rmmzsave$/i.test(file.name)) throw new Error(steam ? '请选择本游戏的 Steam .bin 缓存文件。' : '请选择非 Steam 版的 config.rmmzsave。');
      const input = await file.arrayBuffer();
      const result = steam
        ? await window.NYARURU_ACHIEVEMENT_PARSE.parseSteam(input, { filename:file.name, achievements:achievementItems })
        : await window.NYARURU_SAVE.parseConfig(input, { achievements:achievementItems, platform:'native' });
      if (request !== achievementRequest) return;
      if (!result?.ok) throw new Error(result?.error?.message || '未能识别成就状态文件。');
      setAchievementState(result, steam ? 'Steam 本地缓存' : '非 Steam 版配置');
    } catch (error) {
      if (request !== achievementRequest) return;
      clearAchievementState(`未能读取成就记录：${error.message || '文件格式不受支持。'} 旧状态已清除，当前仅展示资料。`);
    }
  });
  $('#achievement-source-picker').hidden = !window.NYARURU_SAVE?.parseConfig && !window.NYARURU_ACHIEVEMENT_PARSE?.parseSteam;
  $('#achievement-source option[value="steam"]').disabled = !window.NYARURU_ACHIEVEMENT_PARSE?.parseSteam;
  $('#achievement-source option[value="native"]').disabled = !window.NYARURU_SAVE?.parseConfig;
  if (!window.NYARURU_ACHIEVEMENT_PARSE?.parseSteam) $('#achievement-source').value = 'native';
  updateAchievementSource();
  $('#achievement-source-note').textContent = [achievementData.meta?.sourceNote, typeof achievementData.meta?.coverage === 'string' ? achievementData.meta.coverage : ''].filter(Boolean).join(' ');

  // Read only the verified original save format. Retain only confirmed catalog keys;
  // the parser's decoded object and original file are never stored or transmitted.
  let saveRequest = 0, saveCompleted = [];
  function resetSavePreview(message = '尚未选择存档。支持当前已核实的原版存档格式。', resetAchievements = true) {
    if (resetAchievements) clearAchievementState();
    saveRequest += 1;
    saveCompleted = [];
    $('#save-preview').hidden = true;
    $('#save-merge').disabled = true;
    $('#save-merge').textContent = '将确认完成的项目合并到本地清单';
    $('#save-summary').replaceChildren();
    $('#save-inventory').replaceChildren();
    $('#save-coverage').textContent = '';
    $('#save-inventory-note').textContent = '';
    $('#save-status').textContent = message;
  }
  $('#save-clear').addEventListener('click', () => { $('#save-file').value = ''; resetSavePreview('预览已清空。Wiki 清单保留原有记录。'); });
  $('#save-file').addEventListener('change', async event => {
    resetSavePreview();
    const file = event.target.files?.[0];
    if (!file) return;
    const request = saveRequest, achievementEpoch = achievementRequest;
    if (!/\.rmmzsave$/i.test(file.name)) { $('#save-status').textContent = '请选择原版游戏的 .rmmzsave 存档文件。'; return; }
    if (file.size > 4 * 1024 * 1024) { $('#save-status').textContent = '文件超过 4 MiB，未读取。请选择单个原版存档。'; return; }
    if (!window.NYARURU_SAVE?.parse) { $('#save-status').textContent = '存档解析组件未加载，请确认 save-parser.js 与页面放在同一目录。'; return; }
    $('#save-status').textContent = '正在本机浏览器中读取存档…';
    try {
      const result = await window.NYARURU_SAVE.parse(await file.arrayBuffer(), { catalog:DATA, achievements:achievementItems });
      if (request !== saveRequest) return;
      if (!result?.ok) throw new Error(result?.error?.message || '未能识别此存档，请核对游戏版本。');
      if (achievementEpoch === achievementRequest) setAchievementState(result);
      const summary = result.summary || {}, coverage = result.coverage || {};
      const knownNumber = value => Number.isFinite(value) && value >= 0;
      const map = summary.mapName ? `${summary.regionName ? summary.regionName + ' · ' : ''}${summary.mapName}${knownNumber(summary.mapId) ? `（#${summary.mapId}）` : ''}` : knownNumber(summary.mapId) ? `地图 #${summary.mapId}` : '未能读取';
      const cards = [['所在位置', map], ['持有金币', knownNumber(summary.coin) ? `${summary.coin} 金币` : '未能读取'], ['游戏时间', typeof summary.playtime === 'string' && summary.playtime ? summary.playtime : knownNumber(summary.playtimeSeconds) ? `${Math.floor(summary.playtimeSeconds / 3600)} 小时 ${Math.floor(summary.playtimeSeconds % 3600 / 60)} 分钟` : '未能读取']];
      $('#save-summary').innerHTML = cards.map(([label, value]) => `<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('');
      saveCompleted = [...new Set((Array.isArray(result.completed) ? result.completed : []).filter(key => typeof key === 'string' && officialEvents.has(key)))];
      const collectionCoverage = coverage.collections || {};
      const unknown = knownNumber(collectionCoverage.unknown) ? collectionCoverage.unknown : Math.max(0, officialEvents.size - saveCompleted.length);
      const notCompleted = knownNumber(collectionCoverage.confirmedNotCompleted) ? `，确认尚未完成 ${collectionCoverage.confirmedNotCompleted} 个` : '';
      $('#save-coverage').textContent = `确认已完成 ${saveCompleted.length} 个${notCompleted}，未能确定 ${unknown} 个。`;
      const inventory = (Array.isArray(result.inventory) ? result.inventory : []).filter(entry => itemsByKey.has(entry.itemKey) && knownNumber(entry.count));
      $('#save-inventory').innerHTML = inventory.map(entry => {
        const item = itemsByKey.get(entry.itemKey);
        const equipped = entry.equipped === true || Number(entry.equipped) > 0;
        return `<button type="button" class="save-inventory-item" data-item="${esc(item.key)}">${itemIcon(item.key, item.type)}<span>${esc(item.name)}${equipped ? '<small>已装备</small>' : ''}</span><strong>× ${esc(entry.count)}</strong></button>`;
      }).join('') || '<p class="muted">没有可展示的已识别物品记录。</p>';
      const unknownTypes = coverage.inventory?.unknownTypes || [];
      $('#save-inventory-note').textContent = unknownTypes.length ? `以下类别未能读取：${unknownTypes.map(type => typeInfo(type).name).join('、')}。已识别条目 ${inventory.length} 项。` : `已识别条目 ${inventory.length} 项；数量为存档中的持有记录。`;
      $('#save-preview').hidden = false;
      $('#save-merge').disabled = saveCompleted.length === 0;
      $('#save-status').textContent = `解析完成。尚未修改 Wiki 清单。${Array.isArray(result.warnings) && result.warnings.length ? ' ' + result.warnings.join(' ') : ''}`;
    } catch (error) {
      if (request !== saveRequest) return;
      resetSavePreview(`未能解析：${error.message || '请确认文件来自受支持的原版游戏。'}`, achievementEpoch === achievementRequest);
    }
  });
  $('#save-merge').addEventListener('click', () => {
    if (!saveCompleted.length) return;
    const next = new Set(completed), before = next.size;
    saveCompleted.forEach(key => { if (officialEvents.has(key)) next.add(key); });
    persist(next);
    updateProgress();
    if ($('#map-missing').checked) renderMap(false);
    $('#save-merge').disabled = true;
    $('#save-merge').textContent = '已合并到本地清单';
    $('#save-status').textContent = `已合并 ${saveCompleted.length} 个确认完成的事件，本次新增 ${next.size - before} 个。原有清单记录已保留。${storageAvailable ? '' : ' 浏览器未能持久保存，请立即到清单页导出备份。'}`;
  });

  // Images are local assets; remote URLs and traversal paths are not used here.
  function characterImage(image, className, alt = '') {
    if (!image || !/^assets\/[a-z0-9_./-]+$/i.test(image.src || '') || image.src.includes('..')) return '';
    return `<img class="${className}" src="${esc(image.src)}" width="${Number(image.width) || 112}" height="${Number(image.height) || 112}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  }
  function characterSourceMarkup(character, concealed = false) {
    const credits = concealed ? '<p>这位人物的原文标题包含身份信息。请展开剧透档案后查看完整出处。</p>' : `<p>来源：<a href="${esc(safeUrl(character.sourceUrl))}" target="_blank" rel="noopener noreferrer">${esc(character.sourceName || '参考资料')} ↗</a></p>${(character.sourceRefs || []).map(source => `<p><a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ↗</a></p>`).join('')}<p>${esc(character.note || '')}</p>`;
    return `<details class="source-credit"><summary>资料来源与授权</summary>${credits}<p>文字授权：<a href="${esc(safeUrl(character.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(character.license || '请查看原始来源')}</a><br>${character.adapted ? '改写说明：本站已整理并改写原文。' : '改写说明：请参照原始来源。'}<br>游戏图片权利归各自权利人，文字许可不适用于图像。</p></details>`;
  }
  function renderEndings() {
    $('#ending-grid').innerHTML = (endingData.items || []).map((ending,index) => {
      const panelId = `ending-details-${index}`;
      return `<article class="ending-card" data-ending="${esc(ending.id)}"><button class="ending-toggle" type="button" data-ending-toggle="${esc(ending.id)}" aria-expanded="false" aria-controls="${panelId}">${characterImage(ending.icon,'ending-icon')}<span class="ending-heading"><strong>${esc(ending.name || `结局${index+1}`)}</strong><span class="ending-toggle-label">触发方式与剧情概括</span></span><span class="ending-action"><span class="ending-action-label">展开</span><svg class="ending-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></button><div class="ending-details" id="${panelId}" hidden></div></article>`;
    }).join('') || '<p class="empty-state">结局资料暂未加载，请确认 endings.js 与页面位于同一目录。</p>';
  }
  $('#ending-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-ending-toggle]');
    if (!button) return;
    const ending = (endingData.items || []).find(entry => String(entry.id) === button.dataset.endingToggle);
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!ending || !panel) return;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    if (expanded) {
      const source = ending.source || {};
      const sourceName = source.url ? `<a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.name || '原文来源')} ↗</a>` : esc(source.name || '原文来源待补充');
      const license = source.license ? `<p>文字许可：${source.licenseUrl ? `<a href="${esc(safeUrl(source.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(source.license)}</a>` : esc(source.license)}。${source.adapted ? '本站已整理并改写。' : ''}</p>` : '';
      panel.innerHTML = `<dl class="ending-facts"><div><dt>触发方式</dt><dd>${esc(ending.trigger || '触发方式待核实。')}</dd></div><div><dt>概括</dt><dd>${esc(ending.summary || '剧情概括待补充。')}</dd></div></dl><div class="ending-source"><p>来源：${sourceName}</p>${license}${source.note ? `<p>${esc(source.note)}</p>` : ''}<p>原版结局图标权利归游戏权利人，文字许可不适用于图像。</p></div>`;
    } else panel.replaceChildren();
    panel.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    $('.ending-action-label',button).textContent = expanded ? '收起' : '展开';
  });
  function renderCharacters() {
    $('#character-grid').innerHTML = (characterData.characters || []).map((character, index) => {
      const spoilerId = `character-spoilers-${index}`;
      const identityHidden = Boolean(character.identitySpoiler), imageHidden = identityHidden || Boolean(character.imageSpoiler);
      const name = identityHidden ? (character.safeName || '尚未揭晓的人物') : character.name;
      const portrait = imageHidden ? '' : characterImage(character.portrait, 'character-portrait');
      const pixel = imageHidden ? '' : characterImage(character.pixel, 'character-pixel', `${name}的像素形象`);
      const spoilers = character.spoilers || [];
      const hasSpoilers = spoilers.length > 0 || identityHidden || imageHidden;
      return `<article class="character-card${portrait ? ' has-portrait' : ''}" data-character="${esc(character.id)}">${portrait}<div class="character-main"><div class="character-heading"><span class="character-pixel-frame">${pixel || icon('cat')}</span><div><h2>${esc(name)}</h2><span class="tag">${esc(identityHidden ? '身份待揭晓' : character.role || '人物档案')}</span></div></div><p class="character-intro">${esc(identityHidden ? (character.safeIntro || '这位人物的身份与故事密切相关。可主动展开下方剧透档案了解。') : character.intro)}</p>${identityHidden ? '' : `<div class="character-details">${(character.details || []).map(detail => `<p>${esc(detail)}</p>`).join('')}</div>${(character.facts || []).length ? `<dl class="character-facts">${character.facts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`).join('')}</dl>` : ''}`}</div>${hasSpoilers ? `<div class="character-spoiler-area"><button class="secondary spoiler-toggle" type="button" data-spoiler-toggle="${spoilerId}" aria-expanded="false" aria-controls="${spoilerId}">展开剧透档案</button><div class="character-spoilers" id="${spoilerId}" hidden></div></div>` : ''}${characterSourceMarkup(character, identityHidden)}</article>`;
    }).join('') || '<p class="empty-state">人物资料暂未加载，请确认 characters.js 与页面位于同一目录。</p>';
    $('#character-sources').innerHTML = (characterData.sources || []).map(source => `<p><a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ↗</a><br>${esc(source.note || '')}</p>`).join('');
  }
  $('#character-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-spoiler-toggle]');
    if (!button) return;
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    const character = characterData.characters.find(entry => entry.id === button.closest('[data-character]').dataset.character);
    if (!panel || !character) return;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    // Insert sensitive content only after an explicit click; remove it on close.
    panel.innerHTML = expanded ? `${character.identitySpoiler ? `<h3>${esc(character.name)}</h3><p>${esc(character.intro)}</p>${(character.details || []).map(detail => `<p>${esc(detail)}</p>`).join('')}` : ''}${character.imageSpoiler || character.identitySpoiler ? `<div class="spoiler-images">${characterImage(character.pixel, 'character-pixel', '剧透人物像素形象')}${characterImage(character.portrait, 'spoiler-portrait', '剧透人物立绘')}</div>` : ''}${(character.spoilers || []).map(spoiler => `<section><h3>${esc(spoiler.title)}</h3><p>${esc(spoiler.text)}</p></section>`).join('')}` : '';
    panel.hidden = !expanded;
    if (expanded && character.identitySpoiler) {
      if ((character.facts || []).length) panel.insertAdjacentHTML('beforeend', `<dl class="character-facts">${character.facts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`).join('')}</dl>`);
      panel.insertAdjacentHTML('beforeend', characterSourceMarkup(character));
    }
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? '收起剧透档案' : '展开剧透档案';
  });
  const coverage = typeof meta.coverage === 'string' ? meta.coverage : JSON.stringify(meta.coverage || '资料覆盖范围待补充');
  $('#data-coverage').innerHTML = `<p>${esc(coverage)}</p><p>${esc(meta.sourceNote || '资料来自项目已导出的游戏数据库与地图事件记录。')}</p><p>已导出 ${items.length} 件图鉴物品、${locations.length} 条来源记录、${officialEvents.size} 个官方收集事件、${cells.length} 个地图方格、${pages.length} 个地图页。</p><p>资料生成时间：${esc(meta.generatedAt || '未标注')}<br>数据格式版本：${esc(DATA.schemaVersion || 1)}${meta.game ? `<br>游戏：${esc(meta.game)}` : ''}</p>${meta.officialTotal != null ? `<p>数据标注官方事件总数：${esc(meta.officialTotal)}；可定位官方事件：${esc(meta.mappedOfficial ?? '待核对')}。本站进度分母采用当前导出记录中去重后的官方事件数。</p>` : ''}`;
  function openEntryTarget() {
    const params = new URLSearchParams(location.search);
    const targets = ['source','item','region','character','achievement','ending'].flatMap(kind => params.getAll(kind).map(value => ({ kind,value })));
    if (!targets.length) return;
    const invalid = () => notify('这个资料链接暂时无法定位，可以继续使用页面中的搜索和地图。');
    if (targets.length !== 1 || !targets[0].value || targets[0].value.length > 200) { invalid(); return; }
    const { kind,value } = targets[0];
    const show = name => { location.hash = name; showPage(); };
    const focusCard = (selector, key, id) => requestAnimationFrame(() => {
      const card = $$(selector).find(node => node.dataset[key] === id);
      if (!card) return;
      card.tabIndex = -1;
      card.scrollIntoView({ block:'start', behavior:'auto' });
      card.focus({ preventScroll:true });
    });
    if (kind === 'source') {
      const source = locationsByKey.get(value);
      if (!source || !cellsByKey.has(source.cellKey)) { invalid(); return; }
      locateSource(value);
    } else if (kind === 'item') {
      if (!itemsByKey.has(value)) { invalid(); return; }
      show('items'); showItem(value);
    } else if (kind === 'region') {
      if (!regionsById.has(value)) { invalid(); return; }
      show('map'); selectRegion(value);
    } else if (kind === 'character') {
      if (!(characterData.characters || []).some(entry => entry.id === value)) { invalid(); return; }
      show('characters'); focusCard('#character-grid [data-character]', 'character', value);
    } else if (kind === 'ending') {
      if (!(endingData.items || []).some(entry => entry.id === value)) { invalid(); return; }
      show('characters');
      const button = $$('#ending-grid [data-ending-toggle]').find(node => node.dataset.endingToggle === value);
      if (button && button.getAttribute('aria-expanded') !== 'true') button.click();
      focusCard('#ending-grid [data-ending]', 'ending', value);
    } else {
      if (!achievementItems.some(entry => String(entry.id) === value)) { invalid(); return; }
      show('achievements'); focusCard('#achievement-grid [data-achievement]', 'achievement', value);
    }
  }
  populatePages();
  renderItems(); renderEndings(); renderCharacters(); renderAchievements(); updateProgress(); showPage(); openEntryTarget();
})();
