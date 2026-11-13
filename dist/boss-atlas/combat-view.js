(function () {
  'use strict';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const textList = values => (Array.isArray(values) ? values : values ? [values] : []).filter(Boolean);
  let preferredMode = 'base';
  let currentBoss, currentAttack;
  function notes(values, className = 'combat-note') {
    return textList(values).map(value => '<p class="' + className + '">' + escape(value) + '</p>').join('');
  }
  function display(value) {
    if (value == null) return '—';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '—';
    return String(value);
  }
  function table(rows, difficulties, caption) {
    if (!rows || !rows.length) return '';
    const headers = difficulties.map(d => '<th scope="col">' + escape(d.label) + '</th>').join('');
    const body = rows.map(row => '<tr><th scope="row">' + escape(row.label) + '</th>' + difficulties.map(d => '<td>' + escape(display(row.values[String(d.value)])) + '</td>').join('') + '</tr>').join('');
    const rowNotes = [...new Set(rows.flatMap(row => textList(row.notes)))];
    return '<table class="combat-table"><caption>' + escape(caption) + '</caption><thead><tr><th scope="col">项目</th>' + headers + '</tr></thead><tbody>' + body + '</tbody></table>' + notes(rowNotes);
  }
  function render(bossId, attackId) {
    currentBoss = bossId; currentAttack = attackId;
    const container = document.getElementById('combat-stats');
    const data = window.ATLAS_COMBAT;
    const boss = data && data.encounters[bossId];
    const move = boss && boss.moves[attackId];
    container.dataset.bossId = bossId;
    container.dataset.attackId = attackId;
    if (!boss || !move) {
      container.innerHTML = '<p class="combat-note">战斗数值暂未载入，请检查 combat-data.js 是否完整。</p>';
      container.dataset.ready = 'false';
      return;
    }
    const health = boss.health;
    const challenge = preferredMode === 'challenge' && move.challengeAvailable;
    const damageRows = move.rows.map(row => challenge ? {...row, values: row.challengeValues} : row);
    const summary = challenge ? '按挑战有强化条件列出各部件的单次伤害，命中次数依实战而定。' : move.summary;
    const modeButtons = move.challengeAvailable ? '<div class="combat-modes" role="group" aria-label="伤害参考条件"><button type="button" data-damage-mode="base" aria-pressed="' + !challenge + '">基础伤害</button><button type="button" data-damage-mode="challenge" aria-pressed="' + challenge + '">挑战有强化</button></div>' : '';
    const variants = (health.variants || []).filter(v => v.differs && v.rows.length);
    const healthHtml = '<section class="combat-panel" data-combat="health"><div class="combat-heading"><h4>Boss 生命值</h4><span>剧情战</span></div>' +
      table(health.rows, data.difficulties, '剧情战各难度生命值') + notes(health.notes) +
      variants.map(v => '<div class="combat-variant" data-health-variant="' + escape(v.id) + '"><h5>' + escape(v.label) + '</h5>' + table(v.rows, data.difficulties, v.label + '各难度生命值') + notes(v.notes) + '</div>').join('') + '</section>';
    const damageHtml = '<section class="combat-panel" data-combat="damage"><div class="combat-heading"><h4>招式伤害</h4><span>' + escape(move.unit || '单次命中') + '</span></div>' +
      modeButtons +
      (summary ? '<p class="combat-summary">' + escape(summary) + '</p>' : '') +
      table(damageRows, data.difficulties, '当前招式各难度' + (challenge ? '挑战伤害' : '基础伤害')) + notes(move.notes) + notes(challenge ? data.challengeDamageBasis : data.damageBasis, 'combat-basis') + '</section>';
    container.innerHTML = healthHtml + damageHtml;
    container.dataset.ready = 'true';
    container.dataset.damageMode = challenge ? 'challenge' : 'base';
  }
  document.getElementById('combat-stats').addEventListener('click', event => {
    const button = event.target.closest('[data-damage-mode]');
    if (!button) return;
    preferredMode = button.dataset.damageMode;
    render(currentBoss, currentAttack);
    document.querySelector('[data-damage-mode="' + preferredMode + '"]')?.focus({preventScroll: true});
  });
  window.ATLAS_COMBAT_VIEW = {render};
})();
