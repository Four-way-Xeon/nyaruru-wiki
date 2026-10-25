'use strict';

// body is a trusted HTML fragment assembled and escaped by the guide builder.
// All page metadata, navigation labels and URLs are escaped here.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[character]));

function safeLink(value, fallback = '#') {
  const link = String(value ?? '').trim();
  if (!link || /[\u0000-\u001f\u007f]/.test(link) || link.startsWith('//')) return fallback;
  if (/^[a-z][a-z\d+.-]*:/i.test(link) && !/^https?:\/\//i.test(link)) return fallback;
  return link;
}

function joinRoot(root, filename) {
  return `${String(root || '.').replace(/\/+$/, '')}/${filename}`;
}

const iconPaths = {
  items:'<path d="m3 7 9-4 9 4-9 4ZM3 7v10l9 4 9-4V7M12 11v10"/>',
  collection:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
  characters:'<path d="m4 10-1-7 7 4h4l7-4-1 7c5 12-21 12-16 0Z"/><path d="M8 12h.01M16 12h.01m-6 4 2 1 2-1"/>',
  achievements:'<path d="m3 8 4-5h10l4 5-9 13ZM3 8h18M7 3l5 18 5-18"/>',
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16"/>',
  assistant:'<path d="m4 21 10-10M14 3l2 4 5 1-4 3v5l-4-3-5 1 2-5-2-4Z"/>',
  save:'<rect x="5" y="3" width="14" height="18" rx="3"/><path d="m8 8 3-2m-3 7 8-5m-8 10 8-5m-3 5 3-2"/>',
  about:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-11v1"/>'
};

function renderPage({
  title = '资料首页', description = '', body = '', canonical = '',
  assetRoot = '..', guideRoot = '.', interactiveRoot = '../index.html',
  activeNav = 'home', breadcrumbs = [], siteName = '咸鱼喵喵百科',
  blogUrl = 'https://www.serversalem.top/'
} = {}) {
  const html = escapeHtml;
  const href = value => html(safeLink(value));
  const interactivePage = safeLink(interactiveRoot, '../index.html').split('#')[0];
  const home = joinRoot(guideRoot, 'index.html');
  const navigation = [
    ['map','世界地图',`${interactivePage}#map`],
    ['items','物品图鉴',`${interactivePage}#items`],
    ['collection','全收集清单',`${interactivePage}#collection`],
    ['characters','人物与剧情',`${interactivePage}#characters`],
    ['achievements','成就手册',`${interactivePage}#achievements`],
    ['assistant','全能助手',`${interactivePage}#assistant`],
    ['save','存档分析',`${interactivePage}#save`],
    ['about','关于',`${interactivePage}#about`]
  ];
  const selectedNav = activeNav === 'regions' ? 'map' : activeNav === 'endings' ? 'characters' : activeNav;
  const documentTitle = title === siteName ? title : `${title} · ${siteName}`;
  const crumbItems = Array.isArray(breadcrumbs) && breadcrumbs.length ? breadcrumbs : [{label:'资料首页',href:home},{label:title}];
  const canonicalLink = /^https?:\/\//i.test(String(canonical)) ? safeLink(canonical, '') : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#23685a">
  <title>${html(documentTitle)}</title>
  <meta name="description" content="${html(description)}">
${canonicalLink ? `  <link rel="canonical" href="${href(canonicalLink)}">\n` : ''}  <link rel="icon" href="${href(joinRoot(assetRoot,'assets/brand/icon.jpg'))}" type="image/jpeg">
  <link rel="stylesheet" href="${href(joinRoot(guideRoot,'guide.css'))}">
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <aside class="sidebar">
    <a class="brand" href="${href(`${interactivePage}#map`)}" aria-label="${html(siteName)}首页"><img class="brand-logo" src="${href(joinRoot(assetRoot,'assets/brand/logo.png'))}" width="612" height="359" alt="咸鱼喵喵"><span class="brand-sub">NYARURU WIKI</span><span class="brand-note">非官方百科，由爱好者维护</span></a>
    <div class="sidebar-label">旅 行 手 记</div>
    <nav class="guide-nav" aria-label="主要导航">
${navigation.map(([key,label,url]) => `      <a href="${href(url)}" data-nav="${key}"${selectedNav===key?' aria-current="page"':''}><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[key]}</svg><span>${label}</span>${key==='map'?'<span class="nav-arrow" aria-hidden="true">↗</span>':''}</a>`).join('\n')}
    </nav>
    <div class="sidebar-bottom"><span class="status-dot" aria-hidden="true"></span>独立玩家资料站<p>记下人物与故事，<br>找到下一段旅程。</p><a href="${href(`${interactivePage}#about`)}">关于这份旅行手记 ↗</a></div>
  </aside>
  <div class="workspace">
    <header class="topbar"><nav class="breadcrumbs" aria-label="当前位置"><ol>${crumbItems.map((crumb,index) => `<li>${crumb.href&&index<crumbItems.length-1?`<a href="${href(crumb.href)}">${html(crumb.label)}</a>`:`<span${index===crumbItems.length-1?' aria-current="page"':''}>${html(crumb.label)}</span>`}</li>`).join('')}</ol></nav><a class="map-shortcut" href="${href(`${interactivePage}#map`)}" aria-label="进入完整版世界地图">进入完整版 <span aria-hidden="true">↗</span></a></header>
    <main id="main" tabindex="-1">${body}</main>
    <footer class="site-footer"><div><span>${html(siteName)} · 非官方玩家资料站</span><p>游戏图片权利归原权利人，文字来源与许可见各条目。</p></div><a href="${href(`${interactivePage}#about`)}">关于与资料来源 ↗</a></footer>
  </div>
</body>
</html>
`;
}

module.exports = { renderPage };
