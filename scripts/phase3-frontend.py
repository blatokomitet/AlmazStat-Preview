from pathlib import Path

index = Path('index.html')
html = index.read_text()
old = '''        <div class="status" id="data-status" data-state="loading" role="status">\n          <span class="status-dot"></span>\n          <span id="data-status-text">ЗАГРУЗКА</span>\n        </div>'''
new = '''        <div class="header-actions">\n          <div class="language-switch" role="group" aria-label="Language / Язык">\n            <button type="button" class="language-option active" data-language="ru" aria-pressed="true">РУС</button>\n            <button type="button" class="language-option" data-language="en" aria-pressed="false">ENG</button>\n          </div>\n          <div class="status" id="data-status" data-state="loading" role="status">\n            <span class="status-dot"></span>\n            <span id="data-status-text">ЗАГРУЗКА</span>\n          </div>\n        </div>'''
if old in html:
    html = html.replace(old, new, 1)
html = html.replace('<div class="section-label">Прогноз API-Football</div>', '<div class="section-label">Источник данных</div>', 1)
index.write_text(html)

css = Path('style.css')
style = css.read_text()
marker = '/* Phase 3 language switch */'
if marker not in style:
    style += '''\n\n/* Phase 3 language switch */\n.header-actions { display:flex; align-items:center; gap:10px; }\n.language-switch { display:flex; padding:3px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:#101219; }\n.language-option { border:0; background:transparent; color:#858b99; font:inherit; font-size:11px; font-weight:700; letter-spacing:.04em; padding:6px 8px; border-radius:7px; cursor:pointer; }\n.language-option.active { background:#1b1e29; color:#f5f7fb; }\n@media (max-width:520px) { .header-actions { gap:6px; } .language-option { padding:5px 7px; } }\n'''
css.write_text(style)

app = Path('app.js')
js = app.read_text()
insert_after = '  const params = new URLSearchParams(window.location.search);\n'
i18n = '''\n\n  const languageCopy = {\n    ru: { loading: "ЗАГРУЗКА", live: "ДАННЫЕ АКТУАЛЬНЫ", error: "ОШИБКА ДАННЫХ", statisticsUnavailable: "Статистика матча недоступна", eventsUnavailable: "События матча недоступны", lineupsUnavailable: "Составы матча недоступны" },\n    en: { loading: "LOADING", live: "DATA LIVE", error: "DATA ERROR", statisticsUnavailable: "Match statistics unavailable", eventsUnavailable: "Match events unavailable", lineupsUnavailable: "Lineups unavailable" },\n  };\n  let uiLanguage = localStorage.getItem("almazstat.language") === "en" ? "en" : "ru";\n  function t(key) { return languageCopy[uiLanguage]?.[key] || languageCopy.ru[key] || key; }\n  function applyLanguage() {\n    document.documentElement.lang = uiLanguage;\n    document.querySelectorAll("[data-language]").forEach((button) => {\n      const active = button.dataset.language === uiLanguage;\n      button.classList.toggle("active", active);\n      button.setAttribute("aria-pressed", active ? "true" : "false");\n    });\n    const labels = uiLanguage === "en" ? { overview:"Overview", statistics:"Statistics", events:"Events", lineups:"Lineups", form:"Form", h2h:"H2H", standings:"Standings", odds:"Odds" } : { overview:"Обзор", statistics:"Статистика", events:"События", lineups:"Составы", form:"Форма", h2h:"Очные", standings:"Таблица", odds:"Коэффициенты" };\n    Object.entries(labels).forEach(([view, text]) => { const node = document.querySelector(`[data-view="${view}"]`); if (node) node.textContent = text; });\n    if (window.__almazstatRefreshLanguage) window.__almazstatRefreshLanguage();\n  }\n  document.addEventListener("click", (event) => {\n    const button = event.target.closest?.("[data-language]");\n    if (!button) return;\n    uiLanguage = button.dataset.language === "en" ? "en" : "ru";\n    localStorage.setItem("almazstat.language", uiLanguage);\n    applyLanguage();\n  });\n'''
if 'const languageCopy = {' not in js:
    if insert_after not in js:
        raise SystemExit('app.js insert anchor missing')
    js = js.replace(insert_after, insert_after + i18n, 1)

js = js.replace('      loading: "ЗАГРУЗКА",\n      live: "ДАННЫЕ АКТУАЛЬНЫ",\n      error: "ОШИБКА ДАННЫХ",', '      loading: t("loading"),\n      live: t("live"),\n      error: t("error"),', 1)
js = js.replace('`<div class="empty-state">Статистика матча недоступна</div>`', '`<div class="empty-state">${escapeHtml(t("statisticsUnavailable"))}</div>`')
js = js.replace('`<div class="empty-state">События матча недоступны</div>`', '`<div class="empty-state">${escapeHtml(t("eventsUnavailable"))}</div>`')
js = js.replace('`<div class="empty-state">Составы матча недоступны</div>`', '`<div class="empty-state">${escapeHtml(t("lineupsUnavailable"))}</div>`')

init_anchor = '  if (telegram) {\n    telegram.ready();\n    telegram.expand();\n  }\n'
if 'queueMicrotask(applyLanguage);' not in js:
    if init_anchor not in js:
        raise SystemExit('telegram init anchor missing')
    js = js.replace(init_anchor, init_anchor + '\n  queueMicrotask(applyLanguage);\n', 1)

app.write_text(js)
