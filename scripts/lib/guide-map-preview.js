'use strict';

const assert = require('node:assert/strict');
const { escapeHtml: esc } = require('./guide-model');

// Use only the original room-grid coordinates: no invented terrain, routes or exits.
function renderRegionPreview(region, allCells) {
  const cells = allCells.filter(cell => cell.regionId === region.id);
  if (!cells.length) return '<p class="reader-empty">此区域暂未整理地图格。</p>';
  assert.equal(new Set(cells.map(cell => cell.page)).size, 1, 'Region preview needs an explicit layout for multiple map pages: ' + region.id);
  assert.equal(new Set(cells.map(cell => cell.x + ':' + cell.y)).size, cells.length, 'Region preview cannot overlap source room coordinates');
  for (const cell of cells) assert.ok(Number.isInteger(cell.x) && Number.isInteger(cell.y), 'Original room-grid coordinates');
  const minX = Math.min(...cells.map(cell => cell.x)), maxX = Math.max(...cells.map(cell => cell.x));
  const minY = Math.min(...cells.map(cell => cell.y)), maxY = Math.max(...cells.map(cell => cell.y));
  const step = 10, padding = 10;
  const width = (maxX - minX + 1) * step + padding * 2;
  const height = (maxY - minY + 1) * step + padding * 2;
  const color = /^#[0-9a-f]{6}$/i.test(region.color) ? region.color : '#23685a';
  const rooms = cells.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(cell =>
    '<rect class="region-cell" data-cell-key="' + esc(cell.key) + '" x="' + ((cell.x - minX) * step + padding) + '" y="' + ((cell.y - minY) * step + padding) + '" width="9" height="9"/>').join('');
  return '<svg class="region-preview" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(region.name + '地图格布局') + '" data-map-page="' + esc(cells[0].page) + '"><title>' + esc(region.name + '：原版地图格布局') + '</title><g fill="' + color + '">' + rooms + '</g></svg>';
}

module.exports = { renderRegionPreview };
