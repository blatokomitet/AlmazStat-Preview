const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const demoMatches = [
  { id: 1, league: 'La Liga', country: 'Spain', home: 'Sevilla', away: 'Valencia', score: '1 : 0', status: 'FT', time: '11 сент. · 21:00' },
  { id: 2, league: 'La Liga', country: 'Spain', home: 'Real Sociedad', away: 'Villarreal', score: '— : —', status: '21:30', time: 'Сегодня · 21:30' },
  { id: 3, league: 'Bundesliga', country: 'Germany', home: 'Union Berlin', away: 'Schalke 04', score: '0 : 2', status: 'FT', time: '11 сент. · 20:30' },
];

const matchViews = {
  overview: `<section class="section"><div class="section-head"><div class="section-title">Срез матча</div><div class="section-label">PREVIEW DATA</div></div><div class="overview-signal"><div class="placeholder-card"><strong>Sevilla 1:0 Valencia</strong><p>Это интерактивный preview-режим на базе реального frontend AlmazStat. Backend здесь намеренно не используется.</p></div></div></section>`,
  statistics: `<section class="section"><div class="section-head"><div class="section-title">Статистика матча</div><div class="section-label">PREVIEW</div></div><div class="placeholder-card"><p>Владение</p><strong>56% — 44%</strong><p>Удары</p><strong>14 — 8</strong><p>В створ</p><strong>5 — 2</strong><p>Угловые</p><strong>6 — 3</strong></div></section>`,
  events: `<section class="section"><div class="section-head"><div class="section-title">События матча</div><div class="section-label">TIMELINE</div></div><div class="placeholder-card"><p>67' ⚽ Sevilla — гол</p><p>54' 🟨 Valencia — предупреждение</p><p>46' ↔ Sevilla — замена</p></div></section>`,
  lineups: `<section class="section"><div class="section-head"><div class="section-title">Составы</div><div class="section-label">PREVIEW</div></div><div class="placeholder-card"><strong>Sevilla · 4-2-3-1</strong><p>11 игроков стартового состава</p><br><strong>Valencia · 4-4-2</strong><p>11 игроков стартового состава</p></div></section>`,
  form: `<section class="section"><div class="section-head"><div class="section-title">Последняя форма</div><div class="section-label">5 МАТЧЕЙ</div></div><div class="placeholder-card"><strong>Sevilla</strong><p>W · D · L · W · W</p><br><strong>Valencia</strong><p>L · W · D · W · L</p></div></section>`,
  h2h: `<section class="section"><div class="section-head"><div class="section-title">Очные встречи</div><div class="section-label">H2H</div></div><div class="placeholder-card"><p>Valencia 1:2 Sevilla</p><p>Sevilla 0:0 Valencia</p><p>Valencia 2:1 Sevilla</p></div></section>`,
  standings: `<section class="section"><div class="section-head"><div class="section-title">Таблица</div><div class="section-label">LA LIGA</div></div><div class="placeholder-card"><p>6 · Sevilla — 10 pts</p><p>12 · Valencia — 7 pts</p></div></section>`,
  odds: `<section class="section"><div class="section-head"><div class="section-title">Коэффициенты</div><div class="section-label">PREVIEW</div></div><div class="placeholder-card"><p>В preview-режиме букмекерские данные отключены.</p></div></section>`
};

function setStatus(text = 'PREVIEW MODE') {
  const el = $('#data-status-text');
  if (el) el.textContent = text;
  const status = $('#data-status');
  if (status) status.dataset.state = 'loading';
}

function hideScreens() {
  ['matches-screen', 'dashboard-screen', 'analysis-screen', 'data-screen'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

function renderMatches() {
  hideScreens();
  const screen = $('#matches-screen');
  if (!screen) return;
  screen.hidden = false;
  $('#matches-state').hidden = true;
  $('#matches-meta').textContent = `${demoMatches.length} матча · preview data`;
  $('#matches-date').textContent = '11 сентября 2026';
  $('#matches-list').innerHTML = demoMatches.map((m) => `
    <section class="league-group">
      <div class="league-group-title"><span class="league-group-logo-placeholder">◇</span><div class="league-group-copy"><div>${m.league}</div><div class="league-group-country">${m.country}</div></div></div>
      <div class="matches-grid">
        <button class="fixture-card ${m.status === 'FT' ? '' : 'live'}" type="button" data-preview-match="${m.id}">
          <div class="fixture-card-top"><span>${m.time}</span><span class="fixture-card-status">${m.status}</span></div>
          <div class="fixture-card-teams">
            <div class="fixture-card-team"><span class="team-logo-placeholder">${m.home[0]}</span><span>${m.home}</span></div>
            <div class="fixture-card-team"><span class="team-logo-placeholder">${m.away[0]}</span><span>${m.away}</span></div>
            <div class="fixture-card-score">${m.score}</div>
          </div>
        </button>
      </div>
    </section>`).join('');
}

function renderMatch() {
  hideScreens();
  const screen = $('#analysis-screen');
  if (!screen) return;
  screen.hidden = false;
  $('#analysis-state').hidden = true;
  $('#analysis-content').hidden = false;
  $('#league-name').textContent = 'La Liga';
  $('#home-name').textContent = 'Sevilla';
  $('#away-name').textContent = 'Valencia';
  $('#match-score').textContent = '1 : 0';
  $('#fixture-status').textContent = 'Full Time';
  $('#match-date').textContent = '11 сент. 2026 г., 21:00';
  showTab('form');
}

function showTab(name) {
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.content-view').forEach((view) => view.classList.remove('active'));
  const target = document.getElementById(`view-${name}`);
  if (target) {
    target.classList.add('active');
    target.innerHTML = matchViews[name] || matchViews.overview;
  }
}

function renderDataSection(name) {
  hideScreens();
  const screen = $('#data-screen');
  if (!screen) return;
  screen.hidden = false;
  const title = $('#data-title');
  const desc = $('#data-description');
  const content = $('#data-content');
  const map = {
    '/': ['Главная', 'AlmazStat preview'],
    '/leagues': ['Лиги', 'Раздел турниров'],
    '/teams': ['Команды', 'Раздел команд'],
    '/players': ['Игроки', 'Раздел игроков'],
    '/statistics': ['Статистика', 'Общая статистика'],
  };
  const item = map[name] || ['AlmazStat', 'Preview'];
  title.textContent = item[0];
  desc.textContent = item[1];
  content.innerHTML = `<div class="placeholder-card"><div class="placeholder-badge">PREVIEW</div><strong>${item[0]} работает</strong><p>Это рабочая frontend-песочница: навигация и экраны переключаются без перезапуска FPS.</p></div>`;
}

function go(route) {
  if (route === '/matches') renderMatches();
  else if (route.startsWith('/match/')) renderMatch();
  else renderDataSection(route);
  location.hash = route;
  $$('[data-shell-nav]').forEach((el) => el.classList.toggle('active', el.dataset.shellNav === route));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', (event) => {
  const fixture = event.target.closest('[data-preview-match]');
  if (fixture) {
    event.preventDefault();
    go('/match/1');
    return;
  }
  const routeEl = event.target.closest('[data-route]');
  if (routeEl) {
    event.preventDefault();
    go(routeEl.dataset.route || '/');
  }
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.view)));
$$('.language-option').forEach((button) => button.addEventListener('click', () => {
  $$('.language-option').forEach((el) => {
    const active = el === button;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}));

setStatus();
const initial = location.hash.replace(/^#/, '') || '/matches';
go(initial);
