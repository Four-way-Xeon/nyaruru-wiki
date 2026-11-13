(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bosses = window.ATLAS_BOSSES && window.ATLAS_BOSSES.encounters;
  const animationData = window.ATLAS_ANIMATIONS;
  if (!Array.isArray(bosses) || !bosses.length || !animationData) {
    $('fatal-error').hidden = false;
    $('fatal-error').textContent = '图鉴资料未能载入。请保留本页旁的 bosses.js、animation-data.js、media.js 和 assets 文件夹，再重新打开页面。';
    $('atlas-content').hidden = true;
    $('boss-nav').textContent = '资料文件缺失';
    return;
  }
  const animations = new Map((animationData.animations || []).map(a => [a.id, a]));
  const media = window.ATLAS_MEDIA || {};
  const captures = window.ATLAS_CAPTURES || {};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const embedded = new URLSearchParams(location.search).get('embedded') === '1' && parent !== window;
  const imageCache = new Map();
  const state = { boss: null, move: null, animation: null, image: null, frame: 0, elapsed: 0, playing: !reducedMotion.matches, speed: 1, mode: 'material', frames: [], durations: [], loadToken: 0, lastTime: 0, capture: null, captureFrames: [] };
  const canvas = $('animation-canvas');
  const context = canvas.getContext('2d');
  const video = $('capture-video');
  const totalMoves = bosses.reduce((n, b) => n + b.moves.length, 0);
  $('encounter-count').textContent = bosses.length;
  $('nav-count').textContent = bosses.length;
  $('move-count').textContent = totalMoves;
  $('coverage-catalogue').textContent = bosses.length + ' 份档案、' + totalMoves + ' 个动作条目，涉及 20 个原版 Boss 对象。条目包含主要招式、阶段变体与衔接段，不等于全部独立技能。';
  $('boss-buttons').innerHTML = bosses.map((b,i) => {
    const a = window.ATLAS_BOSS_ICONS[b.id], scale = Math.min(48/a.width,52/a.height,1);
    return '<button class="boss-choice" type="button" data-boss-choice="' + escapeHTML(b.id) + '" aria-pressed="false"><span class="boss-avatar"><span class="boss-avatar-crop" style="width:' + a.width + 'px;height:' + a.height + 'px;transform:scale(' + scale + ')"><img src="' + escapeHTML(a.src) + '" alt="" style="width:' + a.sheetWidth + 'px;height:' + a.sheetHeight + 'px;left:-' + a.x + 'px;top:-' + a.y + 'px"></span></span><span><small>' + String(i+1).padStart(2,'0') + '</small><strong>' + escapeHTML(b.name) + '</strong></span></button>';
  }).join('');
  if (embedded) {
    document.body.classList.add('embedded');
    $('boss-picker').hidden = false;
    $('boss-search-slot').append(document.querySelector('.search-box'));
    document.querySelector('h1').textContent = 'Boss 档案';
  }
  const capturedMoves = bosses.flatMap(b => b.moves.map(m => captureForMove(b, m))).filter(hasCapture);
  $('coverage-counts').textContent = capturedMoves.length + ' 项有沙盒实拍，' + capturedMoves.reduce((n, c) => n + normalizeFrames(c).length, 0) + ' 张关键画面，' + capturedMoves.filter(c => safePath(c.gif)).length + ' 段战斗 GIF。各招式的演示范围见画面下方说明。';
  const partialCount = capturedMoves.filter(c => ['partial', 'failed'].includes(c.fullCapture && c.fullCapture.status)).length;
  $('coverage-gaps').textContent = (partialCount ? partialCount + ' 项仍有单独注明的演示限制。' : '') + '剧情相关动作在原场景恢复必要角色后演示；持续召唤与局部演示均单独标注。相同角色的不同战斗单独列出，部分挑战房模板合并说明。';

  function safePath(value) {
    return typeof value === 'string' && /^(?:assets\/)[\w\u0080-\uFFFF./%+;(),@ -]+$/.test(value) && !value.split('/').includes('..') ? value : '';
  }
  function loadImage(src) {
    if (!imageCache.has(src)) imageCache.set(src, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片无法载入'));
      image.src = src;
    }));
    return imageCache.get(src);
  }
  function captureForBoss(boss) {
    if (Array.isArray(captures)) return captures.find(c => c.encounterId === boss.id || c.bossId === boss.id) || null;
    return captures[boss.id] || null;
  }
  function captureForMove(boss, move) {
    const group = captureForBoss(boss);
    if (!group || !group.moves) return null;
    if (Array.isArray(group.moves)) return group.moves.find(c => c.attackId === move.attackId) || null;
    return group.moves[move.attackId] || null;
  }
  function normalizeFrames(capture) {
    return ((capture && capture.frames) || []).map(f => typeof f === 'string' ? f : f.src || f.path || f.poster).filter(safePath);
  }
  function hasCapture(capture) {
    return !!capture && !!(safePath(capture.poster) || safePath(capture.gif) || safePath(capture.webm) || safePath(capture.video) || normalizeFrames(capture).length);
  }
  function searchText(boss, move) {
    return [boss.name, boss.id, move.title, move.phase, move.attackId, move.description].join(' ').toLowerCase();
  }
  function renderNav(query = '') {
    const filtered = bosses.filter(b => !query || b.name.toLowerCase().includes(query) || b.moves.some(m => searchText(b, m).includes(query)));
    $('boss-nav').innerHTML = filtered.length ? filtered.map(b => {
      const index = bosses.indexOf(b);
      return '<button type="button" class="boss-nav-item" data-boss="' + escapeHTML(b.id) + '" aria-current="' + (state.boss === b) + '"><span class="nav-index">' + String(index + 1).padStart(2, '0') + '</span><span class="nav-name">' + escapeHTML(b.name) + '</span><span class="nav-moves">' + b.moves.length + '</span></button>';
    }).join('') : '<p class="empty-note">没有找到相关档案</p>';
  }
  function updateHash() {
    const hash = '#' + encodeURIComponent(state.boss.id) + '/' + encodeURIComponent(state.move.attackId);
    if (location.hash !== hash) history.replaceState(null, '', hash);
    if (embedded) parent.postMessage({type:'nyaruru-atlas-route',hash}, '*');
  }
  function readHash() {
    try {
      const parts = location.hash.slice(1).split('/').map(decodeURIComponent);
      const boss = bosses.find(b => b.id === parts[0]);
      return boss ? { boss, move: boss.moves.find(m => m.attackId === parts[1]) || boss.moves[0] } : null;
    } catch (_) { return null; }
  }
  function setDownload(id, path, filename) {
    const node = $(id);
    const src = safePath(path);
    node.hidden = !src;
    if (src) { node.href = src; node.download = filename; }
    else { node.removeAttribute('href'); node.removeAttribute('download'); }
  }
  function renderBattleCapture() {
    const cap = captureForBoss(state.boss);
    $('battle-capture').hidden = !(cap && safePath(cap.poster));
    if (cap && safePath(cap.poster)) {
      $('battle-poster').src = cap.poster;
      $('battle-poster').alt = state.boss.name + '的游戏沙盒战斗画面';
      $('battle-caption').textContent = cap.caption || cap.note || '在独立游戏沙盒中截取的战斗场景。画面仅代表当前演示条件。';
      $('battle-capture').querySelector('details').open = false;
    }
  }
  function renderMoveGrid() {
    $('move-grid').innerHTML = state.boss.moves.map((move, index) => {
      const asset = media[move.imageId] || {};
      const active = state.move === move;
      const capture = captureForMove(state.boss, move);
      return '<button type="button" class="move-card" data-attack="' + escapeHTML(move.attackId) + '" aria-pressed="' + active + '"><span class="card-art">' + (safePath(asset.poster) ? '<img src="' + escapeHTML(asset.poster) + '" alt="' + escapeHTML(move.title) + '的原版代表帧" loading="lazy">' : '') + '<span class="card-number">' + String(index + 1).padStart(2, '0') + '</span>' + (active ? '<span class="selected-mark" aria-hidden="true">✓</span>' : '') + '</span><span class="card-copy"><strong>' + escapeHTML(move.title) + '</strong><small>' + escapeHTML(move.phase || '主要动作') + (hasCapture(capture) ? '<span class="card-shot">' + (safePath(capture.gif) ? '实拍 GIF' : '实拍图') + '</span>' : '') + '</small></span></button>';
    }).join('');
  }
  function selectBoss(boss, move, options = {}) {
    state.boss = boss;
    document.querySelectorAll('[data-boss-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.bossChoice === boss.id)));
    const index = bosses.indexOf(boss) + 1;
    $('boss-number').textContent = String(index).padStart(2, '0');
    $('boss-kicker').textContent = 'BOSS DOSSIER / ' + String(index).padStart(2, '0');
    $('boss-name').textContent = boss.name;
    $('boss-summary').textContent = boss.summary;
    $('boss-move-count').textContent = boss.moves.length + ' 项动作条目';
    document.title = boss.name + ' · 敌人图鉴 · 咸鱼喵喵';
    renderNav($('search').value.trim().toLowerCase());
    renderBattleCapture();
    selectMove(move || boss.moves[0]);
    if (options.scroll) $('boss-name').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }
  function selectMove(move) {
    state.move = move;
    $('viewer-stage').dataset.attackId = move.attackId;
    $('viewer-stage').dataset.bossId = state.boss.id;
    state.capture = captureForMove(state.boss, move);
    state.captureFrames = normalizeFrames(state.capture);
    state.animation = animations.get(move.imageId) || null;
    state.image = null;
    state.frame = 0;
    state.elapsed = 0;
    state.lastTime = 0;
    state.mode = hasCapture(state.capture) ? 'capture' : 'material';
    if (state.mode === 'capture') state.frame = Math.max(0, state.captureFrames.indexOf(state.capture.poster));
    state.playing = !reducedMotion.matches && (state.mode === 'material' || captureCanPlay());
    const a = state.animation;
    state.frames = a ? Array.from({ length: Math.max(0, a.columns * a.rows - (a.end || 0) - (a.start || 0)) }, (_, i) => (a.start || 0) + i) : [];
    state.durations = state.frames.map((_, i) => Math.max(1, Number(a.durations && a.durations[i]) || Number(a.speed) || 1));
    const asset = media[move.imageId] || {};
    $('move-order').textContent = '招式 ' + String(state.boss.moves.indexOf(move) + 1).padStart(2, '0');
    $('move-phase').textContent = move.phase || '主要动作';
    $('move-title').textContent = move.title;
    $('move-description').textContent = move.description;
    window.ATLAS_COMBAT_VIEW.render(state.boss.id, move.attackId);
    setDownload('download-gif', asset.gif, move.attackId + '-sprite.gif');
    setDownload('download-png', asset.poster, move.attackId + '-sprite.png');
    setDownload('download-strip', asset.strip, move.attackId + '-sprite-3frames.png');
    setDownload('download-capture-gif', state.capture && state.capture.gif, move.attackId + '-battle.gif');
    $('download-note').textContent = captureCanPlay() ? '战斗 GIF 保留场景与本次攻击效果；角色素材仅用于观察本体动作。' : '当前仅有角色素材下载；素材 GIF 不包含完整攻击效果。';
    $('mode-capture').disabled = !hasCapture(state.capture);
    $('mode-capture').title = hasCapture(state.capture) ? '查看这招的游戏沙盒实拍' : '这招尚未收录沙盒实拍';
    $('animation-canvas').setAttribute('aria-label', state.boss.name + '，' + move.title + '的原版角色动画');
    $('capture-image').alt = state.boss.name + '，' + move.title + '的游戏沙盒实拍';
    $('capture-video').setAttribute('aria-label', state.boss.name + '，' + move.title + '的游戏沙盒实拍');
    renderMoveGrid();
    updateHash();
    updateMode();
    const token = ++state.loadToken;
    $('stage-message').hidden = true;
    if (a && safePath(a.src)) loadImage(a.src).then(image => {
      if (token !== state.loadToken) return;
      state.image = image;
      draw();
    }).catch(() => {
      if (token !== state.loadToken) return;
      $('stage-message').textContent = '动作图片暂时无法载入，请检查 assets 文件夹是否完整。';
      $('stage-message').hidden = false;
      state.playing = false;
      updateControls();
    });
    else {
      $('stage-message').textContent = '这段动作尚未附上可播放的素材。';
      $('stage-message').hidden = false;
      state.playing = false;
      updateControls();
    }
  }
  function frameCount() { return state.mode === 'material' ? state.frames.length : state.captureFrames.length; }
  function captureMovie() { return state.capture && (safePath(state.capture.webm) || safePath(state.capture.video)); }
  function captureCanPlay() { return !!(captureMovie() || safePath(state.capture && state.capture.gif)); }
  function updateMode() {
    const material = state.mode === 'material';
    $('mode-material').setAttribute('aria-selected', String(material));
    $('mode-capture').setAttribute('aria-selected', String(!material));
    $('viewer-stage').classList.toggle('capture-mode', !material);
    canvas.hidden = !material;
    $('capture-image').hidden = material;
    $('capture-tools').hidden = material;
    video.pause();
    video.hidden = true;
    const coverageStatus = state.capture && state.capture.fullCapture && state.capture.fullCapture.status;
    $('mode-status').textContent = material ? '仅角色动作' : coverageStatus === 'partial' ? '局部演示' : coverageStatus === 'failed' ? '待补实拍' : coverageStatus === 'persistent-effect' ? '持续效果' : captureCanPlay() ? '连续实拍' : '原游戏画面';
    $('stage-label').textContent = material ? 'ORIGINAL SPRITE ANIMATION' : 'GAME SANDBOX CAPTURE';
    $('stage-bottom').textContent = material ? '原版素材 · 固定位置展示' : (captureCanPlay() ? '独立沙盒 · 当前招式演示' : '独立沙盒 · 指定动作取样');
    $('viewer-note').textContent = material ? (state.move.materialNote || '仅播放角色动作，不含脚本生成的攻击波、弹幕与位移。') : (state.capture.fullCapture && state.capture.fullCapture.note || state.capture.gifNote || state.capture.note || state.capture.caption || '沙盒演示条件下截取，覆盖不代表全部难度与阶段。');
    $('viewer-stage').setAttribute('aria-label', material ? '角色动作查看器，空格播放暂停，左右方向键逐帧' : '战斗实拍查看器，空格切换演示与关键帧，左右方向键切换关键画面');
    $('keyboard-note').textContent = material ? '空格播放 · ← → 逐帧' : '空格切换 · ← → 关键帧';
    $('frame-slider').setAttribute('aria-label', material ? '选择角色动画帧' : '选择实拍关键画面');
    $('previous-frame').setAttribute('aria-label', material ? '上一帧' : '上一张关键画面');
    $('next-frame').setAttribute('aria-label', material ? '下一帧' : '下一张关键画面');
    $('previous-frame').title = material ? '上一帧' : '上一张关键画面';
    $('next-frame').title = material ? '下一帧' : '下一张关键画面';
    if (!material) {
      const movie = captureMovie();
      if (movie) {
        video.hidden = false;
        $('capture-image').hidden = true;
        if (video.getAttribute('src') !== movie) video.src = movie;
        video.playbackRate = state.speed;
        video.poster = safePath(state.capture.poster);
        if (state.playing) video.play().catch(() => { state.playing = false; updateControls(); });
      }
      if (!captureCanPlay()) state.playing = false;
      $('capture-thumbnails').innerHTML = state.captureFrames.map((src, i) => '<button type="button" data-capture-frame="' + i + '" aria-pressed="' + (i === state.frame) + '" aria-label="查看第 ' + (i + 1) + ' 张实拍取样"><img src="' + escapeHTML(src) + '" alt=""><span>' + (i + 1) + '</span></button>').join('');
    }
    draw();
    updateControls();
  }
  function updateControls() {
    const material = state.mode === 'material';
    const count = frameCount();
    $('play').disabled = material ? count < 2 : !captureCanPlay();
    $('play-label').textContent = material || captureMovie() ? (state.playing && !$('play').disabled ? '暂停' : '播放') : (state.playing && !$('play').disabled ? '看关键帧' : '播放演示');
    $('play-symbol').textContent = state.playing && !$('play').disabled ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', $('play-label').textContent);
    $('play').setAttribute('aria-pressed', String(state.playing && !$('play').disabled));
    const canStep = count > 1;
    $('previous-frame').disabled = !canStep;
    $('next-frame').disabled = !canStep;
    $('frame-slider').disabled = !canStep;
    $('frame-slider').max = Math.max(0, count - 1);
    $('frame-slider').value = Math.min(state.frame, Math.max(0, count - 1));
    $('frame-label').textContent = !material && state.playing && safePath(state.capture && state.capture.gif) ? '战斗 GIF 播放中' : count ? (Math.min(state.frame, count - 1) + 1) + ' / ' + count + (material ? ' 帧' : ' 张') : (captureMovie() ? '实拍视频' : '实拍画面');
    $('frame-slider').setAttribute('aria-valuetext', count ? '第 ' + (state.frame + 1) + (material ? ' 帧，共 ' : ' 张关键画面，共 ') + count + (material ? ' 帧' : ' 张') : '无逐帧图片');
    $('duration-label').textContent = material ? (state.durations.reduce((a, b) => a + b, 0) / 60).toFixed(2) + ' 秒' : (state.playing && Number.isFinite(state.capture.fullCapture && state.capture.fullCapture.ticks) ? '演示 ' + (state.capture.fullCapture.ticks / 60).toFixed(1) + ' 秒' : state.capture.ticks && Number.isFinite(state.capture.ticks[state.frame]) ? '取样 ' + (state.capture.ticks[state.frame] / 60).toFixed(2) + ' 秒' : '');
    document.querySelectorAll('[data-speed]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === state.speed));
      button.disabled = !material && !captureMovie();
    });
  }
  function draw() {
    if (state.mode === 'capture') {
      if (captureMovie() && state.playing) return;
      let src = state.captureFrames.length ? state.captureFrames[Math.min(state.frame, state.captureFrames.length - 1)] : safePath(state.capture.poster);
      if (state.playing && safePath(state.capture.gif)) src = state.capture.gif;
      if (!src) src = safePath(state.capture.gif);
      if (src && $('capture-image').getAttribute('src') !== src) $('capture-image').src = src;
      const png = state.captureFrames[state.frame] || safePath(state.capture.poster);
      setDownload('download-capture', png, state.move.attackId + '-capture-' + (state.frame + 1) + '.png');
      document.querySelectorAll('[data-capture-frame]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.captureFrame) === state.frame)));
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.image || !state.animation || !state.frames.length) return;
    const a = state.animation;
    const width = a.width / a.columns;
    const height = a.height / a.rows;
    const index = state.frames[state.frame];
    const fit = Math.min((canvas.width - 110) / width, (canvas.height - 85) / height, 3);
    const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
    const x = Math.round((canvas.width - width * scale) / 2);
    const y = Math.round((canvas.height - height * scale) / 2 + 12);
    context.imageSmoothingEnabled = false;
    context.drawImage(state.image, (index % a.columns) * width, Math.floor(index / a.columns) * height, width, height, x, y, width * scale, height * scale);
  }
  function setFrame(frame) {
    const count = frameCount();
    if (!count) return;
    state.frame = ((frame % count) + count) % count;
    state.elapsed = 0;
    state.playing = false;
    video.pause();
    if (state.mode === 'capture' && state.captureFrames.length) { video.hidden = true; $('capture-image').hidden = false; }
    draw();
    updateControls();
  }
  function togglePlay() {
    if ($('play').disabled) return;
    state.playing = !state.playing;
    state.lastTime = 0;
    if (state.mode === 'capture' && captureMovie()) {
      if (state.playing) { video.hidden = false; $('capture-image').hidden = true; video.play().catch(() => { state.playing = false; updateControls(); }); }
      else video.pause();
    }
    draw();
    updateControls();
  }
  function animate(time) {
    const delta = state.lastTime ? Math.min(time - state.lastTime, 150) : 0;
    state.lastTime = time;
    if (state.playing && !document.hidden && state.mode === 'material') {
      const count = frameCount();
      if (count > 1) {
        state.elapsed += delta * state.speed;
        let changed = false;
        let loops = 0;
        let duration = state.mode === 'material' ? state.durations[state.frame] * 1000 / 60 : 1000 / (state.capture.fps || 10);
        while (state.elapsed >= duration && loops < 120) {
          state.elapsed -= duration;
          state.frame = (state.frame + 1) % count;
          duration = state.mode === 'material' ? state.durations[state.frame] * 1000 / 60 : 1000 / (state.capture.fps || 10);
          changed = true;
          loops++;
        }
        if (changed) { draw(); updateControls(); }
      }
    }
    requestAnimationFrame(animate);
  }
  function clearSearch() {
    $('search').value = '';
    $('search-results').hidden = true;
    renderNav();
  }
  function performSearch() {
    const query = $('search').value.trim().toLowerCase();
    renderNav(query);
    $('search-results').hidden = !query;
    if (!query) return;
    const results = bosses.flatMap(b => b.moves.filter(m => searchText(b, m).includes(query)).map(m => ({ boss: b, move: m })));
    $('search-summary').textContent = results.length ? '找到 ' + results.length + ' 条相关招式，来自 ' + new Set(results.map(r => r.boss.id)).size + ' 个战斗版本。' : '没有找到相关招式。试试角色名、武器或“冲刺”“激光”。';
    $('search-grid').innerHTML = results.map(({ boss, move }) => '<button class="search-result" type="button" data-result-boss="' + escapeHTML(boss.id) + '" data-result-attack="' + escapeHTML(move.attackId) + '">' + escapeHTML(move.title) + '<small>' + escapeHTML(boss.name) + ' · ' + escapeHTML(move.phase) + '</small></button>').join('');
  }
  $('boss-buttons').addEventListener('click', event => { const button = event.target.closest('[data-boss-choice]'); const boss = button && bosses.find(b => b.id === button.dataset.bossChoice); if (boss) { clearSearch(); selectBoss(boss); } });
  $('boss-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-boss]');
    if (!button) return;
    const boss = bosses.find(b => b.id === button.dataset.boss);
    if (boss) { clearSearch(); selectBoss(boss, null, { scroll: matchMedia('(max-width:720px)').matches }); }
  });
  $('move-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-attack]');
    if (!button) return;
    const move = state.boss.moves.find(m => m.attackId === button.dataset.attack);
    if (move) { selectMove(move); $('viewer-stage').scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' }); }
  });
  $('search-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-result-boss]');
    if (!button) return;
    const boss = bosses.find(b => b.id === button.dataset.resultBoss);
    const move = boss && boss.moves.find(m => m.attackId === button.dataset.resultAttack);
    if (move) { clearSearch(); selectBoss(boss, move, { scroll: true }); }
  });
  $('search').addEventListener('input', performSearch);
  $('clear-search').addEventListener('click', () => { clearSearch(); $('search').focus(); });
  $('play').addEventListener('click', togglePlay);
  $('previous-frame').addEventListener('click', () => setFrame(state.frame - 1));
  $('next-frame').addEventListener('click', () => setFrame(state.frame + 1));
  $('frame-slider').addEventListener('input', event => setFrame(Number(event.target.value)));
  document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => {
    state.speed = Number(button.dataset.speed);
    video.playbackRate = state.speed;
    updateControls();
  }));
  $('mode-material').addEventListener('click', () => { state.mode = 'material'; state.frame = 0; state.elapsed = 0; state.lastTime = 0; state.playing = !reducedMotion.matches; updateMode(); });
  $('mode-capture').addEventListener('click', () => {
    if (!hasCapture(state.capture)) return;
    state.mode = 'capture'; state.frame = 0; state.elapsed = 0; state.lastTime = 0; state.playing = captureCanPlay() && !reducedMotion.matches; updateMode();
  });
  $('capture-thumbnails').addEventListener('click', event => {
    const button = event.target.closest('[data-capture-frame]');
    if (button) setFrame(Number(button.dataset.captureFrame));
  });
  $('viewer-stage').addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); togglePlay(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); setFrame(state.frame - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); setFrame(state.frame + 1); }
    else if (event.key === 'Home') { event.preventDefault(); setFrame(0); }
    else if (event.key === 'End') { event.preventDefault(); setFrame(frameCount() - 1); }
  });
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); clearSearch(); selectBoss(bosses[0]); scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' }); });
  document.addEventListener('visibilitychange', () => { state.lastTime = 0; if (document.hidden) video.pause(); else if (state.playing && state.mode === 'capture' && captureMovie()) video.play().catch(() => {}); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { state.playing = false; video.pause(); draw(); updateControls(); } });
  window.addEventListener('hashchange', () => { const route = readHash(); if (route) selectBoss(route.boss, route.move); });
  window.addEventListener('resize', draw);
  if (embedded) {
    let lastHeight = 0;
    const reportHeight = () => {
      const height = Math.ceil(document.querySelector('.workspace').getBoundingClientRect().height);
      if (height > 0 && height !== lastHeight) {
        lastHeight = height;
        parent.postMessage({type: 'nyaruru-atlas-resize', height}, '*');
      }
    };
    new ResizeObserver(reportHeight).observe(document.querySelector('.workspace'));
    window.addEventListener('message', event => {
      if (event.source !== parent) return;
      if (event.data?.type === 'nyaruru-atlas-sync') { updateHash(); reportHeight(); }
      if (event.data?.type === 'nyaruru-atlas-route' && typeof event.data.hash === 'string' && /^#[a-z0-9-]+\/[a-z0-9_]+$/.test(event.data.hash) && location.hash !== event.data.hash) location.hash = event.data.hash;
    });
  }
  const initial = readHash();
  selectBoss(initial ? initial.boss : bosses[0], initial ? initial.move : null);
  requestAnimationFrame(animate);
})();
