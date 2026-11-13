/* Boss atlas integration; the existing Wiki pages retain their own styles and state. */
(() => {
  'use strict';
  const frame = document.getElementById('boss-atlas-frame');
  let loaded = false, requestedRoute = '';
  const active = () => /^#bosses(?:\/|$)/.test(location.hash);
  const childRoute = () => {
    const parts = location.hash.split('/').slice(1);
    return parts.length === 2 && /^[a-z0-9-]+$/.test(parts[0]) && /^[a-z0-9_]+$/.test(parts[1]) ? '#' + parts.join('/') : '';
  };
  function navigate() {
    if (!active()) return;
    requestedRoute = childRoute();
    if (!frame.hasAttribute('src')) {
      frame.src = 'boss-atlas/index.html?embedded=1' + requestedRoute;
    } else if (loaded) {
      frame.contentWindow.postMessage(requestedRoute ? {type: 'nyaruru-atlas-route', hash: requestedRoute} : {type: 'nyaruru-atlas-sync'}, '*');
    }
  }
  frame.addEventListener('load', () => { loaded = true; navigate(); });
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message?.type === 'nyaruru-atlas-resize' && Number.isFinite(message.height) && message.height > 0 && message.height < 50000) frame.style.height = Math.ceil(message.height) + 'px';
    if (message?.type === 'nyaruru-atlas-route' && active() && typeof message.hash === 'string' && /^#[a-z0-9-]+\/[a-z0-9_]+$/.test(message.hash)) {
      if (requestedRoute && requestedRoute !== message.hash) return;
      requestedRoute = '';
      const hash = '#bosses/' + message.hash.slice(1);
      if (location.hash !== hash) history.replaceState(null, '', hash);
    }
  });
  window.addEventListener('hashchange', navigate);
  navigate();
})();
