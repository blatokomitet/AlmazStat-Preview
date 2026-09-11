(function () {
  "use strict";

  const telegram = window.Telegram && window.Telegram.WebApp;
  const params = new URLSearchParams(window.location.search);


  const languageCopy = {
    ru: { loading: "ЗАГРУЗКА", live: "ДАННЫЕ АКТУАЛЬНЫ", error: "ОШИБКА ДАННЫХ", statisticsUnavailable: "Статистика матча недоступна", eventsUnavailable: "События матча недоступны", lineupsUnavailable: "Составы матча недоступны" },
    en: { loading: "LOADING", live: "DATA LIVE", error: "DATA ERROR", statisticsUnavailable: "Match statistics unavailable", eventsUnavailable: "Match events unavailable", lineupsUnavailable: "Lineups unavailable" },
  };
  let uiLanguage = localStorage.getItem("almazstat.language") === "en" ? "en" : "ru";
  function t(key) { return languageCopy[uiLanguage]?.[key] || languageCopy.ru[key] || key; }
  function applyLanguage() {
    document.documentElement.lang = uiLanguage;
    document.querySelectorAll("[data-language]").forEach((button) => {
      const active = button.dataset.language === uiLanguage;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const labels = uiLanguage === "en" ? { overview:"Overview", statistics:"Statistics", events:"Events", lineups:"Lineups", form:"Form", h2h:"H2H", standings:"Standings", odds:"Odds" } : { overview:"Обзор", statistics:"Статистика", events:"События", lineups:"Составы", form:"Форма", h2h:"Очные", standings:"Таблица", odds:"Коэффициенты" };
    Object.entries(labels).forEach(([view, text]) => { const node = document.querySelector(`[data-view="${view}"]`); if (node) node.textContent = text; });
    if (window.__almazstatRefreshLanguage) window.__almazstatRefreshLanguage();
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-language]");
    if (!button) return;
    uiLanguage = button.dataset.language === "en" ? "en" : "ru";
    localStorage.setItem("almazstat.language", uiLanguage);
    applyLanguage();
  });

  if (telegram) {
    telegram.ready();
    telegram.expand();
  }

  queueMicrotask(applyLanguage);

  const fixtureFromQuery = (params.get("fixture") || "").trim();
  const fixtureFromTelegram = (
    (telegram && telegram.initDataUnsafe && telegram.initDataUnsafe.start_param) ||
    params.get("tgWebAppStartParam") ||
    ""
  ).trim();
  const fixtureId = fixtureFromQuery || fixtureFromTelegram;
  const priorityCompetitions = [
    { id: 2, name: "UEFA Champions League" },
    { id: 39, name: "Premier League" },
    { id: 140, name: "La Liga" },
    { id: 135, name: "Serie A" },
    { id: 78, name: "Bundesliga" },
    { id: 61, name: "Ligue 1" },
    { id: 3, name: "Europa League" },
    { id: 848, name: "Conference League" },
  ];
  const priorityCompetitionIds = new Map(priorityCompetitions.map((item, index) => [String(item.id), index]));
  function priorityRank(item) {
    const id = item?.league?.id ?? item?.id;
    if (id !== null && id !== undefined && priorityCompetitionIds.has(String(id))) return priorityCompetitionIds.get(String(id));
    const name = String(item?.league?.name || item?.name || "").toLocaleLowerCase("ru-RU");
    const match = priorityCompetitions.findIndex((entry) => name.includes(entry.name.toLocaleLowerCase("ru-RU")));
    return match < 0 ? priorityCompetitions.length : match;
  }
  function sortByCompetitionPriority(items) {
    return [...(items || [])].sort((a, b) => priorityRank(a) - priorityRank(b));
  }
  const shellRoutes = {
    "/": {
      kind: "dashboard",
      title: "Главная",
      kicker: "Сегодня в футболе",
      description: "Матчи, турниры и контекст на одной ленте.",
    },
    "/home": {
      kind: "dashboard",
      title: "Главная",
      kicker: "Сегодня в футболе",
      description: "Матчи, турниры и контекст на одной ленте.",
    },
    "/matches": {
      kind: "match-center",
      title: "Матчи",
      kicker: "Матч-центр",
      description: "Дата, статус и быстрый переход к деталям матча.",
    },
    "/leagues": {
      kind: "data",
      title: "Лиги",
      kicker: "Соревнования",
      description: "Главные турниры — сверху, остальные доступны через поиск.",
    },
    "/teams": {
      kind: "data",
      title: "Команды",
      kicker: "Клубы",
      description: "Популярные клубы и поиск по каталогу.",
    },
    "/players": {
      kind: "data",
      title: "Игроки",
      kicker: "Поиск игроков",
      description: "Поиск футболистов и сезонный контекст.",
    },
    "/statistics": {
      kind: "data",
      title: "Статистика",
      kicker: "Лиги и сезоны",
      description: "Таблицы, лидеры и показатели выбранного турнира.",
    },
    "/news": {
      kind: "data",
      title: "Новости",
      kicker: "Новости футбола",
      description: "Новости, трансферы и контекст матчей.",
    },
  };
  const loadedSections = new Set();
  const failedSections = new Set();
  const loadingSections = new Map();
  let currentMatch = null;
  let currentForm = null;
  let sourceState = {
    fixture: true,
    prediction: false,
    statistics: "unknown",
    events: "unknown",
    lineups: "unknown",
    form: "unknown",
    h2h: "unknown",
    standings: "unknown",
    odds: "unknown",
  };
  const matchCenterStateKey = "almazstat.matchCenter";
  const liveStatuses = new Set([
    "1H",
    "HT",
    "2H",
    "ET",
    "BT",
    "P",
    "LIVE",
    "INT",
    "SUSP",
  ]);
  const upcomingStatuses = new Set(["NS", "TBD"]);
  const finishedStatuses = new Set(["FT", "AET", "PEN"]);
  const validFilters = new Set(["all", "live", "upcoming", "finished"]);
  let allMatches = [];
  let selectedDate = "";
  let selectedFilter = "all";
  let searchQuery = "";
  let matchesLoadSequence = 0;
  let matchCenterInitialized = false;
  let dataLoadSequence = 0;

  const elements = {
    matchesScreen: document.getElementById("matches-screen"),
    dashboardScreen: document.getElementById("dashboard-screen"),
    analysisScreen: document.getElementById("analysis-screen"),
    analysisState: document.getElementById("analysis-state"),
    analysisContent: document.getElementById("analysis-content"),
    matchesHeading: document.getElementById("matches-heading"),
    matchesDate: document.getElementById("matches-date"),
    matchesMeta: document.getElementById("matches-meta"),
    matchesState: document.getElementById("matches-state"),
    matchesList: document.getElementById("matches-list"),
    matchSearch: document.getElementById("match-search"),
    matchFilters: document.getElementById("match-filters"),
    matchesNav: document.getElementById("matches-nav"),
    dataScreen: document.getElementById("data-screen"),
    dataKicker: document.getElementById("data-kicker"),
    dataTitle: document.getElementById("data-title"),
    dataDescription: document.getElementById("data-description"),
    dataContent: document.getElementById("data-content"),
    shellNav: Array.from(document.querySelectorAll("[data-shell-nav]")),
    dataStatus: document.getElementById("data-status"),
    dataStatusText: document.getElementById("data-status-text"),
    leagueLink: document.getElementById("league-link"),
    leagueName: document.getElementById("league-name"),
    homeTeamLink: document.getElementById("home-team-link"),
    awayTeamLink: document.getElementById("away-team-link"),
    homeName: document.getElementById("home-name"),
    awayName: document.getElementById("away-name"),
    homeLogo: document.getElementById("home-logo"),
    awayLogo: document.getElementById("away-logo"),
    homeCrest: document.getElementById("home-crest"),
    awayCrest: document.getElementById("away-crest"),
    matchScore: document.getElementById("match-score"),
    fixtureStatus: document.getElementById("fixture-status"),
    matchDate: document.getElementById("match-date"),
    predictionContent: document.getElementById("prediction-content"),
    predictionEmpty: document.getElementById("prediction-empty"),
    predictionPick: document.getElementById("prediction-pick"),
    predictionWinner: document.getElementById("prediction-winner"),
    predictionHome: document.getElementById("prediction-home"),
    predictionDraw: document.getElementById("prediction-draw"),
    predictionAway: document.getElementById("prediction-away"),
    predictionAdvice: document.getElementById("prediction-advice"),
    metricsSection: document.getElementById("metrics-section"),
    metricsList: document.getElementById("metrics-list"),
    overviewSignal: document.getElementById("overview-signal"),
    statisticsContent: document.getElementById("statistics-content"),
    eventsContent: document.getElementById("events-content"),
    lineupsContent: document.getElementById("lineups-content"),
    formContent: document.getElementById("form-content"),
    h2hContent: document.getElementById("h2h-content"),
    standingsContent: document.getElementById("standings-content"),
    standingsLabel: document.getElementById("standings-label"),
    oddsContent: document.getElementById("odds-content"),
    riskLevel: document.getElementById("risk-level"),
    riskDescription: document.getElementById("risk-description"),
    riskScore: document.getElementById("risk-score"),
    riskFill: document.getElementById("risk-fill"),
    riskSources: document.getElementById("risk-sources"),
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setDataStatus(state) {
    const labels = {
      loading: t("loading"),
      live: t("live"),
      error: t("error"),
    };
    elements.dataStatus.dataset.state = state;
    elements.dataStatusText.textContent = labels[state];
  }

  function formatDate(value, compact) {
    if (!value) return "Нет данных";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Нет данных";

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: compact ? "2-digit" : "short",
      year: compact ? "2-digit" : "numeric",
      hour: compact ? undefined : "2-digit",
      minute: compact ? undefined : "2-digit",
    }).format(date);
  }

  function dateForOffset(offset) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && dateForDate(date) === value;
  }

  function dateForDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function restoreMatchCenterState() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(matchCenterStateKey) || "{}");
      selectedDate = isDateString(saved.selectedDate)
        ? saved.selectedDate
        : dateForOffset(0);
      selectedFilter = validFilters.has(saved.selectedFilter)
        ? saved.selectedFilter
        : "all";
      searchQuery =
        typeof saved.searchQuery === "string" ? saved.searchQuery.slice(0, 120) : "";
    } catch {
      selectedDate = dateForOffset(0);
      selectedFilter = "all";
      searchQuery = "";
    }
  }

  function saveMatchCenterState() {
    try {
      sessionStorage.setItem(
        matchCenterStateKey,
        JSON.stringify({ selectedDate, selectedFilter, searchQuery }),
      );
    } catch {
      // Match Center remains usable when browser storage is unavailable.
    }
  }

  function formatMatchDay(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Нет данных";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatMatchTime(value) {
    if (!value) return "Нет данных";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Нет данных";
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function countLabel(value, one, few, many) {
    const mod100 = value % 100;
    const mod10 = value % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${value} ${many}`;
    if (mod10 === 1) return `${value} ${one}`;
    if (mod10 >= 2 && mod10 <= 4) return `${value} ${few}`;
    return `${value} ${many}`;
  }

  function setLogo(image, crest, url, teamName) {
    const placeholder = crest.querySelector(".crest-placeholder");
    image.hidden = true;
    placeholder.hidden = false;

    if (!url) return;

    image.alt = teamName ? `Логотип ${teamName}` : "Логотип команды";
    image.onload = function () {
      image.hidden = false;
      placeholder.hidden = true;
    };
    image.onerror = function () {
      image.hidden = true;
      placeholder.hidden = false;
    };
    image.src = url;
  }

  function renderFixture(match) {
    const home = match.home || {};
    const away = match.away || {};
    const goals = match.score || {};
    const fixture = match.fixture || {};
    const status = fixture.status || {};

    elements.leagueName.textContent = match.league?.name || "Нет данных";
    elements.homeName.textContent = home.name || "Нет данных";
    elements.awayName.textContent = away.name || "Нет данных";
    elements.matchScore.textContent = `${goals.home ?? "—"} : ${goals.away ?? "—"}`;
    elements.fixtureStatus.textContent =
      status.long || status.short || "Нет данных";
    elements.matchDate.textContent = formatDate(fixture.date, false);
    const setEntityLink = (element, kind, id) => {
      if (id === null || id === undefined) {
        element.removeAttribute("href");
        return;
      }
      element.href = `${applicationBasePath()}/${kind}/${encodeURIComponent(id)}`;
    };
    setEntityLink(elements.leagueLink, "league", match.league?.id);
    setEntityLink(elements.homeTeamLink, "team", home.id);
    setEntityLink(elements.awayTeamLink, "team", away.id);

    setLogo(elements.homeLogo, elements.homeCrest, home.logo, home.name);
    setLogo(elements.awayLogo, elements.awayCrest, away.logo, away.name);
  }

  function numericPercent(value) {
    if (value === null || value === undefined) return null;
    const parsed = Number.parseFloat(String(value).replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function displayPercent(value) {
    if (value === null || value === undefined || value === "") return "Нет данных";
    return String(value).includes("%") ? String(value) : `${value}%`;
  }

  function addMetric(name, value, extra) {
    if (value === null || value === undefined || value === "") return;
    const card = document.createElement("div");
    card.className = "stat";
    card.innerHTML = `
      <div class="stat-name">${escapeHtml(name)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      ${extra ? `<div class="stat-extra">${escapeHtml(extra)}</div>` : ""}
    `;
    elements.metricsList.appendChild(card);
  }

  function formPercentage(matches) {
    const completed = (matches || []).filter((match) =>
      ["W", "D", "L"].includes(match.result),
    );
    if (completed.length === 0) return null;
    const points = completed.reduce(
      (total, match) =>
        total + (match.result === "W" ? 3 : match.result === "D" ? 1 : 0),
      0,
    );
    return Math.round((points / (completed.length * 3)) * 100);
  }

  function renderMetrics(prediction, form) {
    elements.metricsList.replaceChildren();
    const goals = prediction?.goals || {};
    addMetric("Голы хозяев", goals.home, "Прогноз API-Football");
    addMetric("Голы гостей", goals.away, "Прогноз API-Football");
    addMetric("Тотал", prediction?.underOver, "Прогноз API-Football");
    const homeForm = formPercentage(form?.home);
    const awayForm = formPercentage(form?.away);
    addMetric(
      "Форма хозяев",
      homeForm === null ? null : `${homeForm}%`,
      "Последние матчи",
    );
    addMetric(
      "Форма гостей",
      awayForm === null ? null : `${awayForm}%`,
      "Последние матчи",
    );
    elements.metricsSection.hidden = elements.metricsList.children.length === 0;
  }

  function renderPrediction(prediction, form) {
    const data = prediction;
    renderMetrics(data, form);
    const percent = data && data.percent;
    const hasPercent =
      percent &&
      [percent.home, percent.draw, percent.away].some(
        (value) => value !== null && value !== undefined && value !== "",
      );

    if (!data || !hasPercent) {
      elements.predictionContent.hidden = true;
      elements.predictionEmpty.hidden = false;
      return;
    }

    const options = [
      { key: "home", label: "П1", value: numericPercent(percent.home) },
      { key: "draw", label: "X", value: numericPercent(percent.draw) },
      { key: "away", label: "П2", value: numericPercent(percent.away) },
    ].filter((item) => item.value !== null);
    const highestValue = Math.max(...options.map((item) => item.value));
    const best = options.filter((item) => item.value === highestValue);
    elements.predictionPick.textContent = best.length
      ? best.map((item) => item.label).join(" / ")
      : "Нет данных";
    elements.predictionWinner.textContent =
      data.winner ||
      data.winnerComment ||
      (best.length === 1 && best[0].key === "draw" ? "Ничья" : "");
    elements.predictionHome.textContent = displayPercent(percent.home);
    elements.predictionDraw.textContent = displayPercent(percent.draw);
    elements.predictionAway.textContent = displayPercent(percent.away);

    if (data.advice) {
      elements.predictionAdvice.textContent = data.advice;
      elements.predictionAdvice.hidden = false;
    } else {
      elements.predictionAdvice.hidden = true;
    }

    elements.predictionContent.hidden = false;
    elements.predictionEmpty.hidden = true;

  }

  function renderOverviewSignal(match, prediction) {
    if (!elements.overviewSignal) return;
    const fixture = match?.fixture || {};
    const status = fixture.status || {};
    const sources = Object.values(sourceState);
    const known = sources.filter((value) => value === true || value === false);
    const available = known.filter(Boolean).length;
    const predictionValues = [
      numericPercent(prediction?.percent?.home),
      numericPercent(prediction?.percent?.draw),
      numericPercent(prediction?.percent?.away),
    ].filter((value) => value !== null);
    const strongest =
      predictionValues.length ? `${Math.max(...predictionValues)}%` : "Нет данных";
    const statusLabel = liveStatuses.has(status.short)
      ? "В эфире"
      : finishedStatuses.has(status.short)
        ? "Завершён"
        : upcomingStatuses.has(status.short)
          ? "Предстоящий"
          : status.long || "Нет данных";
    elements.overviewSignal.innerHTML = `
      <div class="signal-cell ${liveStatuses.has(status.short) ? "accent" : ""}">
        <span>Статус</span>
        <strong>${escapeHtml(statusLabel)}</strong>
        <em>${escapeHtml(status.short || "—")}</em>
      </div>
      <div class="signal-cell">
        <span>Прогноз</span>
        <strong>${escapeHtml(strongest)}</strong>
        <em>${predictionValues.length ? "максимум вероятности" : "прогноз не загружен"}</em>
      </div>
      <div class="signal-cell">
        <span>Данные</span>
        <strong>${available}/${known.length || 1}</strong>
        <em>источников проверено</em>
      </div>
    `;
  }

  function renderFormRow(team, matches) {
    const resultClasses = {
      W: "win",
      D: "draw",
      L: "loss",
    };
    const resultLabels = {
      W: "В",
      D: "Н",
      L: "П",
    };
    const matchesHtml = (matches || []).length
      ? matches
          .slice(0, 5)
          .map(
            (match) => `
              <div class="form-match">
                <div class="result ${resultClasses[match.result] || ""}">
                  ${escapeHtml(resultLabels[match.result] || "—")}
                </div>
                <div class="form-match-opponent">
                  ${escapeHtml(match.opponent?.name || "Нет данных")}
                  <div class="list-secondary">
                    ${escapeHtml(formatDate(match.date, true))} ·
                    ${escapeHtml(match.side || "—")} ·
                    ${escapeHtml(match.league || "Нет данных")}
                  </div>
                </div>
                <div class="form-match-score">
                  ${escapeHtml(match.score?.home ?? "—")} :
                  ${escapeHtml(match.score?.away ?? "—")}
                </div>
              </div>
            `,
          )
          .join("")
      : `<div class="empty-state">Нет данных</div>`;

    return `
      <div class="form-team-block">
        <div class="form-team-title">${escapeHtml(team.name || "Нет данных")}</div>
        ${matchesHtml}
      </div>
    `;
  }

  function renderForm(match, form) {
    if (!(form?.home?.length || form?.away?.length)) {
      elements.formContent.innerHTML =
        `<div class="empty-state">Форма команд недоступна</div>`;
      return;
    }
    elements.formContent.innerHTML =
      renderFormRow(match.home, form && form.home) +
      renderFormRow(match.away, form && form.away);
  }

  function renderH2h(matches) {
    if (!matches || matches.length === 0) {
      elements.h2hContent.innerHTML =
        `<div class="empty-state">История очных встреч недоступна</div>`;
      return;
    }

    elements.h2hContent.innerHTML = matches
      .slice(0, 5)
      .map(
        (match) => `
          <div class="list-row">
            <div class="list-primary">
              ${escapeHtml(match.home?.name || "Нет данных")} —
              ${escapeHtml(match.away?.name || "Нет данных")}
              <div class="list-secondary">
                ${escapeHtml(formatDate(match.date, true))} ·
                ${escapeHtml(match.league || "Нет данных")}
              </div>
            </div>
            <div class="list-value">${match.score?.home ?? "—"} : ${match.score?.away ?? "—"}</div>
          </div>
        `,
      )
      .join("");
  }

  function renderStandingCard(row) {
    if (!row) return "";

    return `
      <article class="standing-card">
        <div class="standing-head">
          <div class="standing-team">${escapeHtml(row.team?.name || "Нет данных")}</div>
          <div class="standing-rank">#${escapeHtml(row.rank ?? "—")}</div>
        </div>
        <div class="standing-grid">
          <div class="standing-stat"><span>И</span><strong>${escapeHtml(row.played ?? "—")}</strong></div>
          <div class="standing-stat"><span>В</span><strong>${escapeHtml(row.win ?? "—")}</strong></div>
          <div class="standing-stat"><span>Н</span><strong>${escapeHtml(row.draw ?? "—")}</strong></div>
          <div class="standing-stat"><span>П</span><strong>${escapeHtml(row.lose ?? "—")}</strong></div>
          <div class="standing-stat"><span>ГЗ</span><strong>${escapeHtml(row.goalsFor ?? "—")}</strong></div>
          <div class="standing-stat"><span>ГП</span><strong>${escapeHtml(row.goalsAgainst ?? "—")}</strong></div>
          <div class="standing-stat"><span>±</span><strong>${escapeHtml(row.goalDifference ?? "—")}</strong></div>
          <div class="standing-stat"><span>О</span><strong>${escapeHtml(row.points ?? "—")}</strong></div>
        </div>
        ${row.form ? `<div class="list-secondary">Форма: ${escapeHtml(row.form)}</div>` : ""}
      </article>
    `;
  }

  function renderStandings(standings, season) {
    elements.standingsLabel.textContent = season ? `Сезон ${season}` : "Сезон";
    const html =
      renderStandingCard(standings && standings.home) +
      renderStandingCard(standings && standings.away);
    elements.standingsContent.innerHTML =
      html ||
      `<div class="list-card"><div class="empty-state">Таблица недоступна для этого турнира</div></div>`;
  }

  function renderOdds(odds) {
    const rows = (odds || []).slice(0, 24);
    if (rows.length === 0) {
      elements.oddsContent.innerHTML =
        `<div class="empty-state">Коэффициенты недоступны</div>`;
      return;
    }

    elements.oddsContent.innerHTML = rows
      .map(
        (row) => `
          <div class="list-row">
            <div class="list-primary">
              ${escapeHtml(row.option || "Нет данных")}
              <div class="list-secondary">${escapeHtml(row.bookmaker)} · ${escapeHtml(row.market)}</div>
            </div>
            <div class="list-value">${escapeHtml(row.odd)}</div>
          </div>
        `,
      )
      .join("");
  }

  function renderStatisticTeam(team) {
    const logo = team?.logo
      ? `<img src="${escapeHtml(team.logo)}" alt="" loading="lazy" />`
      : `<span class="statistics-team-placeholder" aria-hidden="true">◇</span>`;
    return `
      <div class="statistics-team">
        ${logo}
        <strong>${escapeHtml(team?.name || "Команда")}</strong>
      </div>
    `;
  }

  function renderStatistics(statistics) {
    const rows = Array.isArray(statistics?.rows) ? statistics.rows : [];
    if (rows.length === 0) {
      elements.statisticsContent.innerHTML =
        `<div class="empty-state">${escapeHtml(t("statisticsUnavailable"))}</div>`;
      return;
    }

    const rowsHtml = rows
      .map((row) => {
        const home = row?.home || null;
        const away = row?.away || null;
        const homeNumeric =
          typeof home?.numeric === "number" && Number.isFinite(home.numeric)
            ? Math.max(0, home.numeric)
            : null;
        const awayNumeric =
          typeof away?.numeric === "number" && Number.isFinite(away.numeric)
            ? Math.max(0, away.numeric)
            : null;
        const total =
          homeNumeric !== null && awayNumeric !== null
            ? homeNumeric + awayNumeric
            : 0;
        const comparison =
          total > 0
            ? `
              <div class="statistics-comparison" aria-hidden="true">
                <span class="statistics-home-fill" style="width:${(homeNumeric / total) * 100}%"></span>
                <span class="statistics-away-fill" style="width:${(awayNumeric / total) * 100}%"></span>
              </div>
            `
            : "";
        return `
          <div class="statistics-row">
            <div class="statistics-values">
              <strong>${escapeHtml(home?.display || "—")}</strong>
              <span>${escapeHtml(row?.label || row?.type || "Показатель")}</span>
              <strong>${escapeHtml(away?.display || "—")}</strong>
            </div>
            ${comparison}
          </div>
        `;
      })
      .join("");

    elements.statisticsContent.innerHTML = `
      <div class="statistics-teams">
        ${renderStatisticTeam(statistics.home)}
        <span>Сравнение</span>
        ${renderStatisticTeam(statistics.away)}
      </div>
      <div class="statistics-rows">${rowsHtml}</div>
    `;
  }

  function eventPresentation(event) {
    const type = String(event?.type || "").toLowerCase();
    const detail = String(event?.detail || "").toLowerCase();
    if (type.includes("goal")) {
      if (detail.includes("missed penalty")) {
        return { label: "Незабитый пенальти", marker: "×", tone: "missed" };
      }
      if (detail.includes("own goal")) {
        return { label: "Автогол", marker: "●", tone: "goal" };
      }
      if (detail.includes("penalty")) {
        return { label: "Пенальти", marker: "●", tone: "goal" };
      }
      return { label: "Гол", marker: "●", tone: "goal" };
    }
    if (type.includes("card")) {
      if (detail.includes("second yellow")) {
        return { label: "Вторая жёлтая", marker: "▰", tone: "red" };
      }
      if (detail.includes("red")) {
        return { label: "Красная карточка", marker: "▰", tone: "red" };
      }
      return { label: "Жёлтая карточка", marker: "▰", tone: "yellow" };
    }
    if (type.includes("subst")) {
      return { label: "Замена", marker: "↔", tone: "substitution" };
    }
    if (type.includes("var")) {
      return { label: "VAR", marker: "VAR", tone: "var" };
    }
    return {
      label: event?.detail || event?.type || "Событие",
      marker: "·",
      tone: "neutral",
    };
  }

  function eventSide(event) {
    const teamId = event?.team?.id;
    if (teamId !== null && teamId === currentMatch?.home?.id) return "home";
    if (teamId !== null && teamId === currentMatch?.away?.id) return "away";
    const teamName = String(event?.team?.name || "").toLowerCase();
    if (teamName && teamName === String(currentMatch?.home?.name || "").toLowerCase()) {
      return "home";
    }
    if (teamName && teamName === String(currentMatch?.away?.name || "").toLowerCase()) {
      return "away";
    }
    return "neutral";
  }

  function renderEventDetails(event, presentation) {
    const type = String(event?.type || "").toLowerCase();
    const rows = [];
    if (type.includes("subst")) {
      if (event?.player?.name) {
        rows.push(
          `<div class="event-person out"><span>OUT</span>${matchEntityLink("player", event.player)}</div>`,
        );
      }
      if (event?.assist?.name) {
        rows.push(
          `<div class="event-person in"><span>IN</span>${matchEntityLink("player", event.assist)}</div>`,
        );
      }
    } else {
      if (event?.player?.name) {
        rows.push(
          `<div class="event-player">${matchEntityLink("player", event.player)}</div>`,
        );
      }
      if (type.includes("goal") && event?.assist?.name) {
        rows.push(
          `<div class="event-assist">Ассист: ${matchEntityLink("player", event.assist)}</div>`,
        );
      }
    }

    const normalizedLabel = presentation.label.toLowerCase();
    if (
      event?.detail &&
      String(event.detail).toLowerCase() !== normalizedLabel &&
      !type.includes("subst")
    ) {
      rows.push(`<div class="event-detail">${escapeHtml(event.detail)}</div>`);
    }
    if (event?.comments) {
      rows.push(`<div class="event-comments">${escapeHtml(event.comments)}</div>`);
    }
    return rows.join("");
  }

  function matchEntityLink(kind, entity) {
    if (!entity?.name) return "";
    if (entity.id === null || entity.id === undefined) return escapeHtml(entity.name);
    return `<a class="match-inline-link" href="${applicationBasePath()}/${kind}/${encodeURIComponent(entity.id)}">${escapeHtml(entity.name)}</a>`;
  }

  function renderEvents(events, status) {
    const rows = Array.isArray(events) ? events : [];
    if (rows.length === 0) {
      const notStarted = upcomingStatuses.has(status?.short);
      elements.eventsContent.innerHTML = `
        <div class="empty-state">
          ${notStarted ? "Матч ещё не начался" : "События матча недоступны"}
        </div>
      `;
      return;
    }

    elements.eventsContent.innerHTML = `
      <div class="events-timeline">
        ${rows
          .map((event) => {
            const presentation = eventPresentation(event);
            const side = eventSide(event);
            const minute =
              event?.elapsed === null || event?.elapsed === undefined
                ? "—"
                : `${event.elapsed}${event?.extra ? `+${event.extra}` : ""}′`;
            return `
              <article class="event-item ${side}">
                <time class="event-minute">${escapeHtml(minute)}</time>
                <div class="event-rail">
                  <span class="event-marker ${presentation.tone}">${escapeHtml(presentation.marker)}</span>
                </div>
                <div class="event-card">
                  <div class="event-card-head">
                    <strong>${escapeHtml(presentation.label)}</strong>
                    ${event?.team?.name ? `<span>${matchEntityLink("team", event.team)}</span>` : ""}
                  </div>
                  ${renderEventDetails(event, presentation)}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderLineupPlayer(player) {
    const number =
      player?.number === null || player?.number === undefined
        ? `<span class="lineup-number empty" aria-hidden="true"></span>`
        : `<span class="lineup-number">${escapeHtml(player.number)}</span>`;
    const position = player?.position
      ? `<span class="lineup-position">${escapeHtml(player.position)}</span>`
      : "";
    return `
      <li class="lineup-player">
        ${number}
        <strong>${player?.name ? matchEntityLink("player", player) : "—"}</strong>
        ${position}
      </li>
    `;
  }

  function renderLineupGroup(title, players) {
    if (!Array.isArray(players) || players.length === 0) return "";
    return `
      <div class="lineup-group">
        <div class="lineup-group-title">${escapeHtml(title)}</div>
        <ol class="lineup-list">
          ${players.map(renderLineupPlayer).join("")}
        </ol>
      </div>
    `;
  }

  function renderTeamLineup(lineup, side) {
    if (!lineup) return "";
    const logo = lineup.team?.logo
      ? `<img src="${escapeHtml(lineup.team.logo)}" alt="" loading="lazy" />`
      : `<span class="lineup-logo-placeholder" aria-hidden="true">◇</span>`;
    const coach =
      lineup.coach?.name || lineup.coach?.photo
        ? `
          <div class="lineup-coach">
            <div class="lineup-group-title">Тренер</div>
            <div class="lineup-coach-card">
              ${
                lineup.coach?.photo
                  ? `<img src="${escapeHtml(lineup.coach.photo)}" alt="" loading="lazy" />`
                  : ""
              }
              ${lineup.coach?.name ? `<strong>${escapeHtml(lineup.coach.name)}</strong>` : ""}
            </div>
          </div>
        `
        : "";
    return `
      <article class="lineup-team-card ${side}">
        <header class="lineup-team-head">
          ${logo}
          <div>
            <span>${side === "home" ? "Хозяева" : "Гости"}</span>
            <strong>${lineup.team?.name ? matchEntityLink("team", lineup.team) : "Команда"}</strong>
          </div>
          ${
            lineup.formation
              ? `<div class="lineup-formation"><span>Схема</span><strong>${escapeHtml(lineup.formation)}</strong></div>`
              : ""
          }
        </header>
        ${renderLineupGroup("Стартовый состав", lineup.startXI)}
        ${renderLineupGroup("Запасные", lineup.substitutes)}
        ${coach}
      </article>
    `;
  }

  function renderLineups(lineups, status) {
    const home = lineups?.home || null;
    const away = lineups?.away || null;
    if (!home && !away) {
      const notPublished = upcomingStatuses.has(status?.short);
      elements.lineupsContent.innerHTML = `
        <div class="empty-state">
          ${notPublished ? "Составы ещё не опубликованы" : "Составы матча недоступны"}
        </div>
      `;
      return;
    }

    const summaries = [home, away]
      .filter(Boolean)
      .map(
        (lineup, index) => `
          <div class="lineup-summary ${index === 0 && home ? "home" : "away"}">
            <strong>${escapeHtml(lineup.team?.name || "Команда")}</strong>
            <span>${escapeHtml(lineup.formation || "Схема не указана")}</span>
          </div>
        `,
      )
      .join("");

    elements.lineupsContent.innerHTML = `
      <div class="lineups-summary">${summaries}</div>
      <div class="lineups-teams">
        ${renderTeamLineup(home, "home")}
        ${renderTeamLineup(away, "away")}
      </div>
    `;
  }

  function renderRisk() {
    return;
  }

  function riskFromCurrentSources() {
    const values = Object.values(sourceState);
    const known = values.filter((value) => value === true || value === false);
    const available = known.filter(Boolean).length;
    const score =
      known.length === 0
        ? 0
        : Math.round(((known.length - available) / known.length) * 100);
    return {
      score,
      level:
        score <= 33
          ? "LOW DATA RISK"
          : score <= 66
            ? "MEDIUM DATA RISK"
            : "HIGH DATA RISK",
      availableSources: available,
      totalSources: Object.keys(sourceState).length,
      knownSources: known.length,
    };
  }

  function refreshRisk() {
    if (currentMatch) {
      renderOverviewSignal(currentMatch, currentMatch.prediction);
    }
  }

  function renderSectionLoading(view) {
    const loading = `<div class="empty-state">Загрузка данных</div>`;
    if (view === "statistics") {
      elements.statisticsContent.innerHTML = `
        <div class="statistics-skeleton" aria-label="Загрузка статистики">
          ${Array.from({ length: 6 }, () => `<span></span>`).join("")}
        </div>
      `;
    }
    if (view === "events") {
      elements.eventsContent.innerHTML = `
        <div class="events-skeleton" aria-label="Загрузка событий">
          ${Array.from({ length: 5 }, () => `<span></span>`).join("")}
        </div>
      `;
    }
    if (view === "lineups") {
      elements.lineupsContent.innerHTML = `
        <div class="lineups-skeleton" aria-label="Загрузка составов">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
    }
    if (view === "form") elements.formContent.innerHTML = loading;
    if (view === "h2h") elements.h2hContent.innerHTML = loading;
    if (view === "standings") elements.standingsContent.innerHTML = loading;
    if (view === "odds") elements.oddsContent.innerHTML = loading;
  }

  function renderSectionUnavailable(view) {
    if (view === "statistics") renderStatistics(null);
    if (view === "events") renderEvents([], currentMatch?.fixture?.status);
    if (view === "lineups") renderLineups(null, currentMatch?.fixture?.status);
    if (view === "form") renderForm(currentMatch, { home: [], away: [] });
    if (view === "h2h") renderH2h([]);
    if (view === "standings") {
      renderStandings({ home: null, away: null }, currentMatch?.league?.season);
    }
    if (view === "odds") renderOdds([]);
  }

  function renderRetry(container, message, retry) {
    container.innerHTML = `
      <div class="request-error">
        <div>${escapeHtml(message)}</div>
        <button class="retry-button" type="button">Повторить</button>
      </div>
    `;
    container
      .querySelector(".retry-button")
      .addEventListener("click", retry, { once: true });
  }

  function renderSectionError(view) {
    const containers = {
      statistics: elements.statisticsContent,
      events: elements.eventsContent,
      lineups: elements.lineupsContent,
      form: elements.formContent,
      h2h: elements.h2hContent,
      standings: elements.standingsContent,
      odds: elements.oddsContent,
    };
    const messages = {
      statistics: "Не удалось получить статистику",
      events: "Не удалось получить события матча",
      lineups: "Не удалось получить составы",
      form: "Не удалось загрузить форму команд",
      h2h: "Не удалось загрузить очные встречи",
      standings: "Не удалось загрузить турнирную таблицу",
      odds: "Не удалось загрузить коэффициенты",
    };
    renderRetry(containers[view], messages[view], () => loadSection(view, true));
  }

  async function loadSection(view, retryFailed = false) {
    const endpoints = {
      statistics: "statistics",
      events: "events",
      lineups: "lineups",
      form: "form",
      h2h: "h2h",
      standings: "standings",
      odds: "odds",
    };
    const endpoint = endpoints[view];
    if (
      !endpoint ||
      loadedSections.has(view) ||
      (failedSections.has(view) && !retryFailed)
    ) {
      return;
    }
    if (loadingSections.has(view)) return loadingSections.get(view);
    if (retryFailed) failedSections.delete(view);

    renderSectionLoading(view);
    const loadingPromise = (async () => {
      let succeeded = false;
      try {
        const response = await fetch(
          `/api/match/${encodeURIComponent(fixtureId)}/${endpoint}`,
        );
        const payload = await response.json();
        if (!response.ok) throw new Error("Section request failed");

        sourceState[view] = payload.source === true;
        if (view === "statistics") {
          renderStatistics(payload.statistics || null);
        }
        if (view === "events") {
          renderEvents(payload.events || [], payload.status || currentMatch?.fixture?.status);
        }
        if (view === "lineups") {
          renderLineups(
            payload.lineups || null,
            payload.status || currentMatch?.fixture?.status,
          );
        }
        if (view === "form") {
          currentForm = payload.form || { home: [], away: [] };
          renderForm(currentMatch, currentForm);
          renderMetrics(currentMatch?.prediction, currentForm);
        }
        if (view === "h2h") renderH2h(payload.h2h || []);
        if (view === "standings") {
          renderStandings(
            payload.standings || { home: null, away: null },
            payload.season || currentMatch?.league?.season,
          );
        }
        if (view === "odds") renderOdds(payload.odds || []);
        failedSections.delete(view);
        succeeded = true;
      } catch {
        sourceState[view] = false;
        failedSections.add(view);
        renderSectionError(view);
      } finally {
        if (succeeded) loadedSections.add(view);
        loadingSections.delete(view);
        refreshRisk();
      }
    })();

    loadingSections.set(view, loadingPromise);
    return loadingPromise;
  }

  function teamLogo(team) {
    if (!team || !team.logo) {
      return `<span class="team-logo-placeholder" aria-hidden="true">◇</span>`;
    }

    return `<img src="${escapeHtml(team.logo)}" alt="${escapeHtml(
      team.name ? `Логотип ${team.name}` : "Логотип команды",
    )}" loading="lazy" />`;
  }

  function showMatchScore(match) {
    return (
      !upcomingStatuses.has(match.status?.short) &&
      match.goals?.home !== null &&
      match.goals?.home !== undefined &&
      match.goals?.away !== null &&
      match.goals?.away !== undefined
    );
  }

  function leagueLogo(league) {
    if (!league?.logo) {
      return `<span class="league-group-logo-placeholder" aria-hidden="true">◇</span>`;
    }
    return `<img class="league-group-logo" src="${escapeHtml(league.logo)}" alt="" loading="lazy" />`;
  }

  function matchStatusLabel(match) {
    const status = match.status || {};
    if (liveStatuses.has(status.short)) {
      return status.elapsed !== null && status.elapsed !== undefined
        ? `${status.elapsed}'`
        : "LIVE";
    }
    if (finishedStatuses.has(status.short)) return "Завершён";
    if (upcomingStatuses.has(status.short)) return formatMatchTime(match.date);
    return status.long || status.short || "Нет данных";
  }

  function matchesForCurrentView() {
    const query = searchQuery.trim().toLocaleLowerCase("ru-RU");
    return allMatches.filter((match) => {
      const status = match.status?.short;
      const matchesFilter =
        selectedFilter === "all" ||
        (selectedFilter === "live" && liveStatuses.has(status)) ||
        (selectedFilter === "upcoming" && upcomingStatuses.has(status)) ||
        (selectedFilter === "finished" && finishedStatuses.has(status));
      if (!matchesFilter) return false;
      if (!query) return true;

      return [
        match.home?.name,
        match.away?.name,
        match.league?.name,
        match.league?.country,
      ].some((value) =>
        String(value || "")
          .toLocaleLowerCase("ru-RU")
          .includes(query),
      );
    });
  }

  function renderMatches(matches) {
    const groups = new Map();

    for (const match of matches) {
      const league = match.league || {};
      const key = `${league.id ?? "unknown"}:${league.name ?? ""}:${league.country ?? ""}`;
      if (!groups.has(key)) {
        groups.set(key, {
          league,
          matches: [],
        });
      }
      groups.get(key).matches.push(match);
    }

    elements.matchesList.innerHTML = sortByCompetitionPriority(Array.from(groups.values()).map((group) => group.league))
      .map((league) => {
        const key = `${league.id ?? "unknown"}:${league.name ?? ""}:${league.country ?? ""}`;
        const leagueMatches = [...(groups.get(key)?.matches || [])].sort((a, b) =>
          new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
        );
        return (() => {
        const cards = leagueMatches
          .map((match) => {
            const status = match.status || {};
            const isLive = liveStatuses.has(status.short);
            const score = showMatchScore(match)
              ? `<div class="fixture-card-score">${escapeHtml(
                  match.goals.home,
                )} : ${escapeHtml(match.goals.away)}</div>`
              : "";

            return `
              <button class="fixture-card${isLive ? " live" : ""}" type="button" data-fixture-id="${escapeHtml(match.fixtureId)}">
                <div class="fixture-card-top">
                  <span>${escapeHtml(
                    finishedStatuses.has(status.short)
                      ? formatMatchTime(match.date)
                      : status.short || "—",
                  )}</span>
                  <span class="fixture-card-status">${escapeHtml(matchStatusLabel(match))}</span>
                </div>
                <div class="fixture-card-teams">
                  <div class="fixture-card-team">
                    ${teamLogo(match.home)}
                    <span>${escapeHtml(match.home?.name || "Нет данных")}</span>
                  </div>
                  <div class="fixture-card-team">
                    ${teamLogo(match.away)}
                    <span>${escapeHtml(match.away?.name || "Нет данных")}</span>
                  </div>
                  ${score}
                </div>
              </button>
            `;
          })
          .join("");

        return `
          <section class="league-group">
            <div class="league-group-title">
              ${leagueLogo(league)}
              <div class="league-group-copy">
                ${escapeHtml(league.name || "Нет данных")}
                <div class="league-group-country">${escapeHtml(
                  league.country || "Нет данных",
                )}</div>
              </div>
            </div>
            <div class="matches-grid">${cards}</div>
          </section>
        `;
        })();
      })
      .join("");

    for (const card of elements.matchesList.querySelectorAll("[data-fixture-id]")) {
      card.addEventListener("click", function () {
        const selectedFixture = card.dataset.fixtureId;
        if (selectedFixture) {
          saveMatchCenterState();
          window.location.href = `${applicationBasePath()}/?fixture=${encodeURIComponent(selectedFixture)}`;
        }
      });
    }
  }

  function renderCurrentMatches() {
    const matches = matchesForCurrentView();
    const leagueCount = new Set(
      matches.map((match) => match.league?.id ?? match.league?.name).filter(Boolean),
    ).size;
    if (elements.matchesMeta) {
      elements.matchesMeta.textContent = allMatches.length === 0
        ? "Сегодня матчей нет"
        : matches.length === allMatches.length
          ? `${countLabel(allMatches.length, "матч", "матча", "матчей")} · ${countLabel(leagueCount, "лига", "лиги", "лиг")}`
          : `${matches.length} из ${countLabel(allMatches.length, "матча", "матчей", "матчей")} · ${countLabel(leagueCount, "лига", "лиги", "лиг")}`;
    }
    elements.matchesList.replaceChildren();
    if (allMatches.length === 0) {
      elements.matchesState.innerHTML = `
        <div class="matches-empty">
          <div class="matches-empty-icon" aria-hidden="true">◇</div>
          <strong>На эту дату матчей нет</strong>
          <p>Выберите «Вчера», «Сегодня» или «Завтра», чтобы посмотреть другие матчи.</p>
        </div>
      `;
      elements.matchesState.hidden = false;
      return;
    }
    if (matches.length === 0) {
      elements.matchesState.innerHTML = `
        <div class="matches-empty">
          <div class="matches-empty-icon" aria-hidden="true">⌕</div>
          <strong>Матчей не найдено</strong>
          <p>Измените поиск или выберите другой фильтр матчей.</p>
        </div>
      `;
      elements.matchesState.hidden = false;
      return;
    }
    elements.matchesState.hidden = true;
    renderMatches(matches);
  }

  function updateMatchCenterControls() {
    const today = dateForOffset(0);
    const labels = {
      [dateForOffset(-1)]: "Вчера",
      [today]: "Сегодня",
      [dateForOffset(1)]: "Завтра",
    };
    elements.matchesHeading.textContent = labels[selectedDate] || "Матч-центр";
    elements.matchesDate.textContent = formatMatchDay(selectedDate);
    elements.matchSearch.value = searchQuery;

    for (const button of document.querySelectorAll("[data-day-offset]")) {
      button.classList.toggle(
        "active",
        dateForOffset(Number(button.dataset.dayOffset)) === selectedDate,
      );
    }
    for (const button of elements.matchFilters.querySelectorAll(
      "[data-match-filter]",
    )) {
      button.classList.toggle(
        "active",
        button.dataset.matchFilter === selectedFilter,
      );
    }
  }

  async function loadMatches(date, minimumLoadingTime = 0) {
    matchCenterInitialized = true;
    selectedDate = isDateString(date) ? date : dateForOffset(0);
    saveMatchCenterState();
    updateMatchCenterControls();
    const requestSequence = ++matchesLoadSequence;
    allMatches = [];
    elements.matchesList.replaceChildren();
    elements.matchesState.textContent = "Загрузка матчей";
    elements.matchesState.hidden = false;
    setDataStatus("loading");
    const loadingStartedAt = performance.now();

    try {
      const response = await fetch(
        `/api/matches?date=${encodeURIComponent(selectedDate)}`,
      );
      const payload = await response.json();
      if (requestSequence !== matchesLoadSequence) return;

      if (!response.ok) throw new Error("Не удалось загрузить матчи");
      const remainingLoadingTime =
        minimumLoadingTime - (performance.now() - loadingStartedAt);
      if (remainingLoadingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingLoadingTime));
      }
      if (requestSequence !== matchesLoadSequence) return;

      allMatches = Array.isArray(payload.matches) ? payload.matches : [];
      const leagueCount = new Set(
        allMatches.map((match) => match.league?.id ?? match.league?.name).filter(Boolean),
      ).size;
      elements.matchesMeta.textContent = allMatches.length
        ? `${countLabel(allMatches.length, "матч", "матча", "матчей")} · ${countLabel(leagueCount, "лига", "лиги", "лиг")}`
        : "Сегодня матчей нет";
      renderCurrentMatches();
      setDataStatus("live");
    } catch {
      if (requestSequence !== matchesLoadSequence) return;
      allMatches = [];
      if (elements.matchesMeta) {
        elements.matchesMeta.textContent = "Матчи недоступны · проверьте соединение";
      }
      elements.matchesList.replaceChildren();
      elements.matchesState.hidden = false;
      renderRetry(elements.matchesState, "Не удалось загрузить матчи", () =>
        loadMatches(selectedDate),
      );
      setDataStatus("error");
    }
  }

  function setupMatchCenter() {
    for (const button of document.querySelectorAll("[data-day-offset]")) {
      button.addEventListener("click", function () {
        loadMatches(dateForOffset(Number(button.dataset.dayOffset)), 650);
      });
    }
    for (const button of elements.matchFilters.querySelectorAll(
      "[data-match-filter]",
    )) {
      button.addEventListener("click", function () {
        selectedFilter = button.dataset.matchFilter;
        saveMatchCenterState();
        updateMatchCenterControls();
        renderCurrentMatches();
      });
    }
    elements.matchSearch.addEventListener("input", function () {
      searchQuery = elements.matchSearch.value;
      saveMatchCenterState();
      renderCurrentMatches();
    });
  }

  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const views = Array.from(document.querySelectorAll(".content-view"));

    for (const tab of tabs) {
      const view = document.getElementById(`view-${tab.dataset.view}`);
      tab.id = `match-tab-${tab.dataset.view}`;
      tab.tabIndex = tab.classList.contains("active") ? 0 : -1;
      view?.setAttribute("aria-labelledby", tab.id);
      tab.addEventListener("click", function () {
        for (const item of tabs) {
          const active = item === tab;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", String(active));
          item.tabIndex = active ? 0 : -1;
        }
        for (const view of views) {
          view.classList.toggle("active", view.id === `view-${tab.dataset.view}`);
        }
        loadSection(tab.dataset.view);
      });
      tab.addEventListener("keydown", function (event) {
        const currentIndex = tabs.indexOf(tab);
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
        if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        }
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    }
  }

  function normalizedRoute(pathname = window.location.pathname) {
    let path = pathname.replace(/\/+$/, "");
    const basePath = applicationBasePath(path);
    if (basePath && path !== basePath) {
      path = path.slice(basePath.length).replace(/\/+$/, "");
    }
    return path || "/";
  }

  function applicationBasePath(pathname = window.location.pathname) {
    return pathname === "/preview" || pathname.startsWith("/preview/")
      ? "/preview"
      : "";
  }

  function syncShellNavigation(routePath) {
    for (const item of elements.shellNav) {
      const itemPath = item.dataset.shellNav;
      const isActive =
        routePath === itemPath ||
        (routePath === "/home" && itemPath === "/");
      item.classList.toggle("active", isActive);
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
  }

  function routeParams() {
    return new URLSearchParams(window.location.search);
  }

  function dataLogo(url, alt, className = "data-logo") {
    if (!url) return `<span class="${className}-placeholder" aria-hidden="true">◇</span>`;
    return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(
      alt || "",
    )}" loading="lazy" />`;
  }

  function dataForm(routePath, query) {
    const value = (name) => escapeHtml(query.get(name) || "");
    if (routePath === "/leagues") {
      return `
        <form class="data-form" data-data-form="/leagues">
          <label class="data-field">
            <span>Поиск лиги</span>
            <input name="search" value="${value("search")}" placeholder="Например, Premier League" autocomplete="off" />
          </label>
          <label class="data-field">
            <span>Страна</span>
            <input name="country" value="${value("country")}" placeholder="Необязательно" autocomplete="off" />
          </label>
          <button class="data-submit" type="submit">Найти</button>
        </form>
      `;
    }
    if (routePath === "/teams") {
      return `
        <form class="data-form" data-data-form="/teams">
          <label class="data-field data-field-wide">
            <span>Название команды</span>
            <input name="search" value="${value("search")}" placeholder="Например, Arsenal" autocomplete="off" />
          </label>
          <button class="data-submit" type="submit">Найти</button>
        </form>
      `;
    }
    if (routePath === "/players") {
      return `
        <form class="data-form" data-data-form="/players">
          <label class="data-field data-field-wide">
            <span>Имя игрока</span>
            <input name="search" value="${value("search")}" placeholder="Например, Mbappe" autocomplete="off" />
          </label>
          <button class="data-submit" type="submit">Найти</button>
        </form>
      `;
    }
    if (routePath === "/statistics") {
      return "";
    }
    if (routePath === "/news") {
      return `
        <form class="data-form" data-data-form="/news">
          <label class="data-field data-field-wide">
            <span>Фильтр публикаций</span>
            <input name="query" value="${value("query")}" placeholder="Например, Arsenal" autocomplete="off" />
          </label>
          <button class="data-submit" type="submit">Обновить</button>
        </form>
      `;
    }
    return "";
  }

  function dataMeta(payload) {
    return "";
  }

  function dataState(message, kind = "empty", retryPath = "") {
    const retry = kind === "error"
      ? `<button class="retry-button" type="button" data-data-retry="${escapeHtml(retryPath)}">Повторить</button>`
      : "";
    return `
      <div class="data-state ${kind}">
        <div class="data-state-mark" aria-hidden="true">${kind === "loading" ? "…" : kind === "error" ? "!" : "◇"}</div>
        <strong>${escapeHtml(message)}</strong>
        ${retry}
      </div>
    `;
  }

  function renderDataPage(route, content) {
    elements.dashboardScreen.hidden = true;
    elements.matchesScreen.hidden = true;
    elements.analysisScreen.hidden = true;
    elements.dataScreen.hidden = false;
    elements.dataKicker.textContent = route.kicker;
    elements.dataTitle.textContent = route.title;
    elements.dataDescription.textContent = route.description;
    elements.dataContent.innerHTML = content;
    document.title = `AlmazStat — ${route.title}`;

    const retry = elements.dataContent.querySelector("[data-data-retry]");
    if (retry) {
      retry.addEventListener("click", () => {
        if (retry.dataset.dataRetry === "player-profile") {
          const match = normalizedRoute().match(/^\/player\/([^/]+)$/);
          if (match) loadPlayerRoute(decodeURIComponent(match[1]));
          return;
        }
        if (retry.dataset.dataRetry === "player-stats" && playerDetailState) {
          playerDetailState.statsError = null;
          loadPlayerStatistics(playerDetailState, playerRouteSequence);
          return;
        }
        if (retry.dataset.dataRetry === "league-details") {
          const leagueMatch = normalizedRoute().match(/^\/league\/([^/]+)$/);
          if (leagueMatch) loadLeagueStage3(decodeURIComponent(leagueMatch[1]));
          return;
        }
        if (retry.dataset.dataRetry === "statistics:leagues") {
          loadStatisticsRoute();
          return;
        }
        if (retry.dataset.dataRetry?.startsWith("statistics:")) {
          renderGlobalStatisticsRoute(dataLoadSequence, globalStatisticsState.leagues || []);
          return;
        }
        loadDataRoute(normalizedRoute(), true);
      });
    }
  }

  function dataListContent(routePath, query, body) {
    return `${dataForm(routePath, query)}${body}`;
  }

  const priorityCatalogContext = { value: null, inflight: null };
  function loadPriorityCatalogContext() {
    if (priorityCatalogContext.value) return Promise.resolve(priorityCatalogContext.value);
    if (!priorityCatalogContext.inflight) {
      priorityCatalogContext.inflight = fetchDataJson("/api/leagues").then((payload) => {
        const leagues = sortByCompetitionPriority(Array.isArray(payload?.leagues) ? payload.leagues : []);
        const league = leagues.find((item) => priorityCompetitionIds.has(String(item?.id)));
        const seasons = league?.seasons || [];
        const season = seasons.find((item) => item.current) || [...seasons].sort((a, b) => Number(b.year) - Number(a.year))[0];
        if (!league?.id || !season?.year) throw new Error("Популярные соревнования пока недоступны");
        priorityCatalogContext.value = { league, season: season.year };
        return priorityCatalogContext.value;
      }).finally(() => { priorityCatalogContext.inflight = null; });
    }
    return priorityCatalogContext.inflight;
  }

  async function loadPriorityCatalogLanding(route, routePath, query, sequence) {
    renderDataPage(route, dataListContent(routePath, query, dataState("Загрузка подборки", "loading")));
    try {
      const context = await loadPriorityCatalogContext();
      const endpoint = routePath === "/teams"
        ? `/api/teams?league=${encodeURIComponent(context.league.id)}&season=${encodeURIComponent(context.season)}`
        : `/api/players?league=${encodeURIComponent(context.league.id)}&season=${encodeURIComponent(context.season)}&page=1`;
      const payload = await fetchDataJson(endpoint);
      if (sequence !== dataLoadSequence) return;
      const body = routePath === "/teams"
        ? renderTeamCards(payload.teams || [])
        : renderPlayerCards(payload.players || [], payload.paging, query);
      renderDataPage(route, dataListContent(routePath, query, body));
      setDataStatus("live");
    } catch {
      if (sequence !== dataLoadSequence) return;
      renderDataPage(route, dataListContent(routePath, query, dataState("Подборка временно недоступна", "error", routePath)));
      setDataStatus("error");
    }
  }

  function renderLeagueCards(leagues) {
    if (!leagues.length) return dataState("Лиги по этому запросу не найдены");
    leagues = sortByCompetitionPriority(leagues);
    return `
      <div class="data-grid">
        ${leagues
          .map(
            (league) => `
              <a class="data-card league-card" data-route="/league/${encodeURIComponent(league.id)}" href="/league/${encodeURIComponent(league.id)}">
                <div class="data-card-top">
                  ${dataLogo(league.logo, league.name, "data-logo")}
                  <div>
                    <strong>${escapeHtml(league.name || "Нет данных")}</strong>
                    <span>${league.country?.flag ? `<img class="country-flag" src="${escapeHtml(league.country.flag)}" alt="" />` : ""}${escapeHtml(league.country?.name || league.type || "Нет данных")}</span>
                  </div>
                </div>
                <div class="data-card-foot"><span>${escapeHtml(league.type || "Соревнование")}</span><span>${escapeHtml((league.seasons || []).find((s) => s.current)?.year || (league.seasons || [])[0]?.year || "—")} →</span></div>
              </a>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderTeamCards(teams) {
    if (!teams.length) return dataState("Команды по этому запросу не найдены");
    return `
      <div class="data-grid">
        ${teams
          .map(
            (team) => `
              <a class="data-card" data-route="/team/${encodeURIComponent(team.id)}" href="/team/${encodeURIComponent(team.id)}">
                <div class="data-card-top">
                  ${dataLogo(team.logo, team.name, "data-logo")}
                  <div>
                    <strong>${escapeHtml(team.name || "Нет данных")}</strong>
                    <span>${escapeHtml(team.country || team.code || "Нет данных")}</span>
                  </div>
                </div>
                <div class="data-card-foot">${escapeHtml(team.venue?.name || "Профиль команды")} <span>→</span></div>
              </a>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderPlayerCards(players, paging = null, query = routeParams()) {
    if (!players.length) return dataState("Игроки по этому запросу не найдены");
    const current = Number(paging?.current) || 1;
    const total = Number(paging?.total) || 1;
    const pageLink = (page, label) => {
      const next = new URLSearchParams(query);
      next.set("page", String(page));
      return `<a class="player-page-link" data-route="/players?${escapeHtml(next.toString())}" href="/players?${escapeHtml(next.toString())}">${escapeHtml(label)}</a>`;
    };
    return `
      <div class="data-grid">
        ${players
          .map(
            (player) => `
              <a class="data-card player-card" data-route="/player/${encodeURIComponent(player.id)}" href="/player/${encodeURIComponent(player.id)}">
                <div class="data-card-top">
                  ${dataLogo(player.photo, player.name, "data-logo player-logo")}
                  <div>
                    <strong>${escapeHtml(player.name || "Нет данных")}</strong>
                    <span>${escapeHtml([player.age != null ? `${player.age} лет` : "", player.nationality, player.position, player.team?.name].filter(Boolean).join(" · ") || "Профиль игрока")}</span>
                  </div>
                </div>
                <div class="data-card-foot">${escapeHtml(player.position || player.team?.name || "Профиль игрока")} <span>→</span></div>
              </a>
            `,
          )
          .join("")}
      </div>
      ${total > 1 ? `<nav class="player-pagination" aria-label="Страницы игроков">${current > 1 ? pageLink(current - 1, "← Назад") : "<span></span>"}<strong>${escapeHtml(current)} / ${escapeHtml(total)}</strong>${current < total ? pageLink(current + 1, "Далее →") : "<span></span>"}</nav>` : ""}
    `;
  }

  function renderDetailBack(path, label) {
    return `<a class="back-link data-back-link" data-route="${path}" href="${path}">← ${label}</a>`;
  }

  function renderLeagueDetail(league) {
    const seasons = league.seasons || [];
    return `
      ${renderDetailBack("/leagues", "Все лиги")}
      <article class="data-detail">
        <div class="data-detail-head">
          ${dataLogo(league.logo, league.name, "data-logo data-detail-logo")}
          <div>
            <h2>${escapeHtml(league.name || "Нет данных")}</h2>
            <p>${escapeHtml(league.country?.name || league.type || "Нет данных")}</p>
          </div>
        </div>
        <div class="data-detail-grid">
          <div><span>Тип</span><strong>${escapeHtml(league.type || "Нет данных")}</strong></div>
          <div><span>Код страны</span><strong>${escapeHtml(league.country?.code || "Нет данных")}</strong></div>
        </div>
      </article>
      <div class="data-section-heading"><strong>Доступные сезоны</strong><span>${seasons.length}</span></div>
      ${
        seasons.length
          ? `<div class="season-list">${seasons
              .map(
                (season) => `
                  <div class="season-row">
                    <strong>${escapeHtml(season.year)}</strong>
                    <span>${escapeHtml(season.start || "Нет данных")} — ${escapeHtml(season.end || "Нет данных")}</span>
                    ${season.current ? '<em>текущий</em>' : ""}
                  </div>
                `,
              )
              .join("")}</div>`
          : dataState("Сезоны для этой лиги не найдены")
      }
    `;
  }

  function renderTeamDetail(team) {
    const venue = team.venue || {};
    return `
      ${renderDetailBack("/teams", "Все команды")}
      <article class="data-detail">
        <div class="data-detail-head">
          ${dataLogo(team.logo, team.name, "data-logo data-detail-logo")}
          <div>
            <h2>${escapeHtml(team.name || "Нет данных")}</h2>
            <p>${escapeHtml(team.country || "Нет данных")}</p>
          </div>
        </div>
        <div class="data-detail-grid">
          <div><span>Код</span><strong>${escapeHtml(team.code || "Нет данных")}</strong></div>
          <div><span>Основан</span><strong>${escapeHtml(team.founded ?? "Нет данных")}</strong></div>
          <div><span>Национальная</span><strong>${team.national ? "Да" : team.national === false ? "Нет" : "Нет данных"}</strong></div>
          <div><span>Стадион</span><strong>${escapeHtml(venue.name || "Нет данных")}</strong></div>
          <div><span>Город</span><strong>${escapeHtml(venue.city || "Нет данных")}</strong></div>
          <div><span>Вместимость</span><strong>${escapeHtml(venue.capacity ?? "Нет данных")}</strong></div>
        </div>
      </article>
    `;
  }

  function renderPlayerDetail(player) {
    const statCards = [
      ["Матчи", player.appearances],
      ["Голы", player.goals],
      ["Передачи", player.assists],
      ["Минуты", player.minutes],
      ["Удары", player.shots],
      ["Рейтинг", player.rating],
    ].filter(([, value]) => value !== null && value !== undefined);
    return `
      ${renderDetailBack("/players", "Все игроки")}
      <article class="data-detail">
        <div class="data-detail-head">
          ${dataLogo(player.photo, player.name, "data-logo data-detail-logo player-logo")}
          <div>
            <h2>${escapeHtml(player.name || "Нет данных")}</h2>
            <p>${escapeHtml(player.team?.name || player.position || "Нет данных")}</p>
          </div>
        </div>
        <div class="data-detail-grid">
          <div><span>Национальность</span><strong>${escapeHtml(player.nationality || "Нет данных")}</strong></div>
          <div><span>Дата рождения</span><strong>${escapeHtml(player.birth?.date || "Нет данных")}</strong></div>
          <div><span>Позиция</span><strong>${escapeHtml(player.position || "Нет данных")}</strong></div>
          <div><span>Сезон</span><strong>${escapeHtml(player.league?.season ?? "Нет данных")}</strong></div>
        </div>
      </article>
      ${
        statCards.length
          ? `<div class="data-stat-grid">${statCards
              .map(
                ([label, value]) =>
                  `<div class="data-stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
              )
              .join("")}</div>`
          : dataState("Сезонная статистика игрока недоступна")
      }
    `;
  }

  /* Stage 5 player profile: profile/context are route-scoped, statistics are
     cached by player + season and are deliberately requested lazily. */
  const playerProfileCache = new Map();
  const playerContextCache = new Map();
  const playerStatisticsCache = new Map();
  const playerInflight = new Map();
  let playerRouteSequence = 0;
  let playerDetailState = null;

  function playerFetchCached(key, endpoint, cache) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (playerInflight.has(key)) return playerInflight.get(key);
    const request = fetchDataJson(endpoint).then((payload) => {
      cache.set(key, payload);
      playerInflight.delete(key);
      return payload;
    }).catch((error) => {
      playerInflight.delete(key);
      throw error;
    });
    playerInflight.set(key, request);
    return request;
  }

  function playerValue(value, suffix = "") {
    return value !== null && value !== undefined && value !== "" ? `${value}${suffix}` : "";
  }
  function playerStatValue(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "object") return "";
    return String(value);
  }
  function playerMetaGrid(items) {
    const rows = items.filter(([, value]) => value !== null && value !== undefined && value !== "");
    return rows.length ? `<div class="player-meta-grid">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>` : "";
  }
  function playerStatisticsRows(state) {
    const payload = state.statistics.get(String(state.season));
    return Array.isArray(payload?.statistics) ? payload.statistics : [];
  }
  function playerContextLabel(row) {
    return [row?.team?.name, row?.league?.name, row?.position].filter(Boolean).join(" · ");
  }
  function playerSummaryMarkup(state) {
    const rows = playerStatisticsRows(state);
    if (!rows.length) return dataState("Статистика за выбранный сезон недоступна");
    const context = state.statistics.get(String(state.season))?.context || rows[0];
    const first = rows[0];
    const metrics = [
      ["Матчи", first.appearances], ["В старте", first.lineups],
      ["Минуты", first.minutes], ["Голы", first.goals?.total],
      ["Ассисты", first.goals?.assists], ["Рейтинг", first.rating],
    ];
    return `<div class="player-context-card"><strong>${escapeHtml(playerContextLabel(context) || playerContextLabel(first) || "Контекст не указан")}</strong>${rows.length > 1 ? `<span>${rows.length} соревнования за сезон</span>` : ""}</div>${playerMetaGrid(metrics)}`;
  }
  function playerCategoryMarkup(label, entries) {
    const visible = entries.filter(([, value]) => value !== null && value !== undefined && value !== "" && typeof value !== "object");
    return visible.length ? `<section class="player-stat-category"><h3>${escapeHtml(label)}</h3><div class="player-stat-grid">${visible.map(([name, value]) => `<div><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></section>` : "";
  }
  function playerStatisticsMarkup(state) {
    const rows = playerStatisticsRows(state);
    if (!rows.length) return dataState("Статистика за выбранный сезон недоступна");
    return rows.map((row, index) => `<article class="player-row-card"><div class="player-row-head"><strong>${escapeHtml(row.league?.name || `Соревнование ${index + 1}`)}</strong><span>${escapeHtml([row.team?.name, row.position].filter(Boolean).join(" · "))}</span></div>${playerCategoryMarkup("Матчи", [["Матчи", row.appearances], ["В старте", row.lineups], ["Минуты", row.minutes], ["Номер", row.number], ["Рейтинг", row.rating], ["Капитан", row.captain === true ? "Да" : row.captain === false ? "Нет" : null], ["Вышел на замену", row.substitutesIn], ["Заменён", row.substitutesOut], ["На скамейке", row.substitutesBench]])}${playerCategoryMarkup("Голы и передачи", [["Голы", row.goals?.total], ["Ассисты", row.goals?.assists], ["Пропущено", row.goals?.conceded], ["Сейвы", row.goals?.saves]])}${playerCategoryMarkup("Удары", [["Всего", row.shots?.total], ["В створ", row.shots?.on]])}${playerCategoryMarkup("Пасы", [["Всего", row.passes?.total], ["Ключевые", row.passes?.key], ["Точность", row.passes?.accuracy]])}${playerCategoryMarkup("Оборона", [["Отборы", row.tackles?.total], ["Блоки", row.tackles?.blocks], ["Перехваты", row.tackles?.interceptions]])}${playerCategoryMarkup("Дуэли и дриблинг", [["Дуэли", row.duels?.total], ["Выиграно дуэлей", row.duels?.won], ["Попытки дриблинга", row.dribbles?.attempts], ["Успешный дриблинг", row.dribbles?.success], ["Обошёл соперников", row.dribbles?.past]])}${playerCategoryMarkup("Фолы и карточки", [["Заработано фолов", row.fouls?.drawn], ["Совершено фолов", row.fouls?.committed], ["Жёлтые", row.cards?.yellow], ["Вторая жёлтая", row.cards?.yellowRed], ["Красные", row.cards?.red]])}${playerCategoryMarkup("Пенальти", [["Заработано", row.penalties?.won], ["Совершено", row.penalties?.committed], ["Забито", row.penalties?.scored], ["Мимо", row.penalties?.missed], ["Отбито", row.penalties?.saved]])}</article>`).join("");
  }
  function playerCareerMarkup(state) {
    const rows = playerStatisticsRows(state);
    if (!rows.length) return dataState("Сезонная карьера недоступна");
    return `<div class="player-career-list">${rows.map((row) => `<div class="player-career-row"><strong>${escapeHtml(String(state.season))}</strong><div><b>${escapeHtml(row.team?.name || "Команда не указана")}</b><span>${escapeHtml(row.league?.name || "Соревнование не указано")}</span></div><em>${escapeHtml([row.appearances != null ? `${row.appearances} матч.` : "", row.goals?.total != null ? `${row.goals.total} гол.` : "", row.goals?.assists != null ? `${row.goals.assists} асс.` : "", row.rating != null ? `рейтинг ${row.rating}` : ""].filter(Boolean).join(" · ") || "Нет сезонных показателей")}</em></div>`).join("")}</div>`;
  }
  function renderPlayerDetailShell(state) {
    const p = state.profile?.player || {};
    const fullName = [p.firstname, p.lastname].filter(Boolean).join(" ") || p.name;
    const seasons = state.context?.seasons || [];
    const heroMeta = [["Возраст", playerValue(p.age, " лет")], ["Дата рождения", p.birth?.date], ["Место рождения", p.birth?.place || p.birth?.country], ["Национальность", p.nationality], ["Рост", playerValue(p.height)], ["Вес", playerValue(p.weight)]];
    const active = state.tab;
    const seasonControl = seasons.length ? `<label class="player-season"><span>Сезон</span><select data-player-season>${seasons.map((season) => `<option value="${escapeHtml(season)}" ${String(season) === String(state.season) ? "selected" : ""}>${escapeHtml(season)}</option>`).join("")}</select></label>` : `<div class="player-season-unavailable">Сезоны недоступны</div>`;
    const contextError = state.contextError && active !== "matches";
    return `${renderDetailBack("/players", "Все игроки")}<article class="player-hero">${dataLogo(p.photo, fullName, "data-logo player-hero-photo player-logo")}<div class="player-hero-copy"><h1>${escapeHtml(fullName || "Имя недоступно")}</h1><p>${escapeHtml([state.teamName, state.position].filter(Boolean).join(" · ") || "Профиль игрока")}</p>${typeof p.injured === "boolean" ? `<span class="player-injured ${p.injured ? "" : "is-available"}">${p.injured ? "Травмирован" : "Не травмирован"}</span>` : ""}</div>${seasonControl}${playerMetaGrid(heroMeta)}</article><div class="player-tabs" role="tablist" aria-label="Разделы игрока">${["overview", "statistics", "matches", "career"].map((tab) => `<button class="tab ${active === tab ? "active" : ""}" id="player-tab-${tab}" type="button" role="tab" aria-selected="${active === tab}" aria-controls="player-panel-${tab}" tabindex="${active === tab ? "0" : "-1"}" data-player-tab="${tab}">${tab === "overview" ? "Overview" : tab === "statistics" ? "Statistics" : tab === "matches" ? "Matches" : "Career"}</button>`).join("")}</div><section id="player-panel-${active}" class="player-panel" role="tabpanel" aria-labelledby="player-tab-${active}" tabindex="0">${contextError ? dataState("Контекст игрока недоступен", "error", "player-profile") : active === "overview" ? (state.statsLoading ? dataState("Загрузка статистики", "loading") : state.statsError ? dataState("Данные статистики недоступны", "error", "player-stats") : playerSummaryMarkup(state)) : active === "statistics" ? (state.statsLoading ? dataState("Загрузка статистики", "loading") : state.statsError ? dataState("Данные статистики недоступны", "error", "player-stats") : playerStatisticsMarkup(state)) : active === "career" ? (state.statsLoading ? dataState("Загрузка статистики", "loading") : state.statsError ? dataState("Данные статистики недоступны", "error", "player-stats") : playerCareerMarkup(state)) : `<div class="data-state"><strong>Матчи игрока недоступны</strong><span>API-Football не предоставляет эффективный endpoint матчей игрока. Отдельные запросы на каждый матч намеренно не выполняются.</span></div>`}</section>`;
  }
  function renderPlayerDetailView(state) {
    elements.dataContent.innerHTML = renderPlayerDetailShell(state);
    document.title = `AlmazStat — ${state.profile?.player?.name || "Player"}`;
  }
  function bindPlayerDetail(state, sequence) {
    const root = elements.dataContent;
    root.querySelector("[data-player-season]")?.addEventListener("change", (event) => {
      state.season = Number(event.target.value); state.tab = "overview"; state.statsLoading = false; state.statsError = null;
      const nextUrl = new URL(window.location.href); nextUrl.searchParams.set("season", String(state.season)); window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
      renderPlayerDetailView(state); bindPlayerDetail(state, sequence); loadPlayerStatistics(state, sequence);
    });
    root.querySelectorAll("[data-player-tab]").forEach((button) => button.addEventListener("click", () => {
      state.tab = button.dataset.playerTab; renderPlayerDetailView(state); bindPlayerDetail(state, sequence);
      if (state.tab !== "matches") loadPlayerStatistics(state, sequence);
    }));
    root.querySelector(".player-tabs")?.addEventListener("keydown", (event) => {
      const tabs = [...root.querySelectorAll("[data-player-tab]")]; const index = tabs.indexOf(document.activeElement);
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); tabs[next].click();
    });
    root.querySelectorAll("[data-data-retry]").forEach((retry) => retry.addEventListener("click", () => {
      if (retry.dataset.dataRetry === "player-profile") {
        playerContextCache.delete(`context:${state.id}`);
        loadPlayerRoute(state.id);
      } else if (retry.dataset.dataRetry === "player-stats") {
        playerStatisticsCache.delete(`${state.id}:${state.season}`);
        state.statsError = null; state.statsLoading = false; loadPlayerStatistics(state, sequence);
      }
    }));
  }
  async function loadPlayerStatistics(state, sequence) {
    if (!state.season || state.statsLoading || playerStatisticsCache.has(`${state.id}:${state.season}`)) { if (state.season && playerStatisticsCache.has(`${state.id}:${state.season}`)) { state.statistics.set(String(state.season), playerStatisticsCache.get(`${state.id}:${state.season}`)); renderPlayerDetailView(state); bindPlayerDetail(state, sequence); } return; }
    state.statsLoading = true; renderPlayerDetailView(state); bindPlayerDetail(state, sequence);
    try {
      const payload = await playerFetchCached(`${state.id}:${state.season}`, `/api/players/${encodeURIComponent(state.id)}/statistics?season=${encodeURIComponent(state.season)}`, playerStatisticsCache);
      if (sequence !== playerRouteSequence) return;
      state.statistics.set(String(state.season), payload); state.statsLoading = false;
      const row = payload.context || payload.statistics?.[0] || {}; state.teamName = row.team?.name || state.teamName; state.position = row.position || state.position;
      renderPlayerDetailView(state); bindPlayerDetail(state, sequence);
    } catch {
      if (sequence !== playerRouteSequence) return;
      state.statsLoading = false; state.statsError = true; renderPlayerDetailView(state); bindPlayerDetail(state, sequence);
    }
  }
  async function loadPlayerRoute(id) {
    const sequence = ++playerRouteSequence; const query = routeParams(); const state = playerDetailState = { id, tab: "overview", season: null, profile: null, context: null, contextError: false, statistics: new Map(), statsLoading: false, statsError: null, teamName: "", position: "" };
    syncShellNavigation("/players"); setDataStatus("loading"); renderDataPage(shellRoutes["/players"], dataState("Загрузка профиля", "loading"));
    try {
      const results = await Promise.allSettled([playerFetchCached(`profile:${id}`, `/api/players/${encodeURIComponent(id)}`, playerProfileCache), playerFetchCached(`context:${id}`, `/api/players/${encodeURIComponent(id)}/context`, playerContextCache)]);
      if (sequence !== playerRouteSequence) return;
      if (results[0].status === "rejected") throw results[0].reason;
      state.profile = results[0].value; state.context = results[1].status === "fulfilled" ? results[1].value : null; state.contextError = results[1].status === "rejected"; const seasons = state.context?.seasons || []; const requested = query.get("season"); state.season = seasons.includes(Number(requested)) ? Number(requested) : seasons[0];
      setDataStatus("live"); renderDataPage(shellRoutes["/players"], renderPlayerDetailShell(state)); bindPlayerDetail(state, sequence);
      loadPlayerStatistics(state, sequence);
    } catch (error) {
      if (sequence !== playerRouteSequence) return;
      setDataStatus("error"); renderDataPage(shellRoutes["/players"], `${renderDetailBack("/players", "Все игроки")}${dataState(error.message || "Профиль игрока недоступен", "error", "player-profile")}`);
    }
  }

  function renderLeagueStatistics(payload) {
    const scorers = payload.scorers || [];
    if (!scorers.length) return dataState("Статистика для этого турнира не найдена");
    return `
      <div class="data-section-heading"><strong>Лучшие бомбардиры</strong><span>Сезон ${escapeHtml(payload.season)}</span></div>
      <div class="scorers-list">
        ${scorers
          .map(
            (row) => `
              <div class="scorer-row">
                <span class="scorer-rank">#${escapeHtml(row.rank)}</span>
                ${dataLogo(row.player?.photo, row.player?.name, "data-logo scorer-logo")}
                <div class="scorer-copy">
                  <strong>${escapeHtml(row.player?.name || "Нет данных")}</strong>
                  <span>${escapeHtml(row.team?.name || "Нет данных")}</span>
                </div>
                <div class="scorer-goals"><strong>${escapeHtml(row.goals ?? "—")}</strong><span>голов</span></div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  const newsCategories = ["latest", "transfers", "matches", "leagues", "teams"];
  const newsCategoryLabels = { latest: "Последние", transfers: "Трансферы", matches: "Матчи", leagues: "Лиги", teams: "Команды" };
  const newsCache = new Map();
  const newsInflight = new Map();
  const newsDetailCache = new Map();
  const newsDetailInflight = new Map();
  let newsRouteSequence = 0;

  function newsFilterKey(query) {
    return `${query.get("search") || ""}::${query.get("category") || "latest"}`;
  }

  function newsProviderStatus(payload) {
    return String(payload?.provider?.status || payload?.provider?.state || payload?.provider || "").toLowerCase();
  }

  function newsFilters(query) {
    const category = newsCategories.includes(query.get("category")) ? query.get("category") : "latest";
    const search = (query.get("search") || "").slice(0, 120);
    return { category, search };
  }

  function renderNewsControls(query) {
    const { category, search } = newsFilters(query);
    return `
      <form class="news-tools" data-news-form>
        <label class="news-search"><span class="visually-hidden">Поиск новостей</span><span aria-hidden="true">⌕</span>
          <input name="search" value="${escapeHtml(search)}" placeholder="Поиск по новостям" autocomplete="off" />
          <button type="submit">Найти</button>
        </label>
        <div class="news-categories" aria-label="Категории новостей">
          ${newsCategories.map((item) => `<button type="button" aria-pressed="${item === category}" class="${item === category ? "active" : ""}" data-news-category="${item}">${newsCategoryLabels[item]}</button>`).join("")}
        </div>
      </form>
    `;
  }

  function newsEntityLink(entity, kind) {
    if (!entity?.name || entity.id === null || entity.id === undefined) return "";
    return `<a class="news-entity-link" data-route="/${kind}/${encodeURIComponent(entity.id)}" href="/${kind}/${encodeURIComponent(entity.id)}">${escapeHtml(entity.name)}</a>`;
  }

  function renderNewsCards(items) {
    if (!items.length) return dataState("Публикации по этому фильтру не найдены");
    return `<div class="news-list">${items.map((item) => {
      const titleHtml = item.title
        ? item.id
          ? `<a class="news-card-title" data-route="/news/${encodeURIComponent(item.id)}" href="/news/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>`
          : `<strong class="news-card-title">${escapeHtml(item.title)}</strong>`
        : "";
      return `<article class="news-card">
        ${item.image ? `<img class="news-card-image" src="${escapeHtml(item.image)}" alt="" loading="lazy" />` : ""}
        <div class="news-card-body">
          ${item.category || item.publishedAt ? `<div class="news-card-top">${item.category ? `<span>${escapeHtml(item.category)}</span>` : ""}${item.publishedAt ? `<time>${escapeHtml(formatDate(item.publishedAt, true))}</time>` : ""}</div>` : ""}
          ${titleHtml}
          ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
          <div class="news-card-meta">${item.source ? `<span>${escapeHtml(item.source)}</span>` : ""}${item.relatedTeam ? newsEntityLink(item.relatedTeam, "team") : ""}${item.relatedLeague ? newsEntityLink(item.relatedLeague, "league") : ""}</div>
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function newsStateContent(payload) {
    if (newsProviderStatus(payload) === "not_configured") {
      return newsProviderUnavailable();
    }
    return renderNewsCards(Array.isArray(payload?.items) ? payload.items : []);
  }

  function newsErrorState(message) {
    return `<div class="data-state error"><div class="data-state-mark" aria-hidden="true">!</div><strong>${escapeHtml(message)}</strong><button class="retry-button" type="button" data-news-retry>Повторить</button></div>`;
  }
  function newsProviderUnavailable(includeBack = false) {
    return `${includeBack ? `<a class="back-link" data-route="/news" href="/news">← Все новости</a>` : ""}<section class="news-provider-state"><span aria-hidden="true">◇</span><div><strong>Новостной источник пока не подключён.</strong><p>Раздел готов к публикациям. После подключения отдельного новостного provider здесь появятся реальные материалы без изменений интерфейса.</p></div></section>`;
  }

  function bindNewsControls(query) {
    const form = elements.dataContent.querySelector("[data-news-form]");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const next = new URLSearchParams();
      const search = new FormData(form).get("search")?.toString().trim();
      if (search) next.set("search", search);
      next.set("category", newsFilters(query).category);
      window.history.pushState({}, "", `${applicationBasePath()}/news?${next}`);
      renderShellRoute();
    });
    form.querySelectorAll("[data-news-category]").forEach((button) => button.addEventListener("click", () => {
      const next = new URLSearchParams();
      const search = form.querySelector("[name=search]").value.trim();
      if (search) next.set("search", search);
      next.set("category", button.dataset.newsCategory);
      window.history.pushState({}, "", `${applicationBasePath()}/news?${next}`);
      renderShellRoute();
    }));
  }

  function renderNewsPage(query, body) {
    renderDataPage(shellRoutes["/news"], `${renderNewsControls(query)}${body}`);
    bindNewsControls(query);
    const retry = elements.dataContent.querySelector("[data-news-retry]");
    if (retry) retry.addEventListener("click", () => loadNewsRoute(true));
  }

  function newsDetailContent(payload) {
    if (newsProviderStatus(payload) === "not_configured") return newsProviderUnavailable(true);
    const item = payload?.article;
    if (!item) return dataState("Эта публикация не найдена.");
    return `<a class="back-link" data-route="/news" href="/news">← Все новости</a><article class="news-detail">
      ${item.image ? `<img class="news-detail-image" src="${escapeHtml(item.image)}" alt="" />` : ""}
      ${item.category || item.publishedAt ? `<div class="news-card-top">${item.category ? `<span>${escapeHtml(item.category)}</span>` : ""}${item.publishedAt ? `<time>${escapeHtml(formatDate(item.publishedAt, false))}</time>` : ""}</div>` : ""}
      ${item.title ? `<h1>${escapeHtml(item.title)}</h1>` : ""}
      ${item.source ? `<div class="news-detail-source">${escapeHtml(item.source)}</div>` : ""}
      ${item.article || item.summary ? `<div class="news-detail-copy">${escapeHtml(item.article || item.summary)}</div>` : ""}
      <div class="news-card-meta">${item.relatedTeam ? newsEntityLink(item.relatedTeam, "team") : ""}${item.relatedLeague ? newsEntityLink(item.relatedLeague, "league") : ""}</div>
    </article>`;
  }

  async function loadNewsRoute(force = false) {
    const path = normalizedRoute();
    const detail = path.match(/^\/news\/([^/]+)$/);
    const query = routeParams();
    const sequence = ++newsRouteSequence;
    setDataStatus("loading");
    if (detail) {
      renderDataPage(shellRoutes["/news"], dataState("Загрузка публикации", "loading"));
      try {
        const articleId = decodeURIComponent(detail[1]);
        let promise = !force && newsDetailCache.has(articleId)
          ? Promise.resolve(newsDetailCache.get(articleId))
          : newsDetailInflight.get(articleId);
        if (!promise) {
          promise = fetchDataJson(`/api/news/${encodeURIComponent(articleId)}`)
            .then((payload) => {
              newsDetailCache.set(articleId, payload);
              return payload;
            })
            .finally(() => newsDetailInflight.delete(articleId));
          newsDetailInflight.set(articleId, promise);
        }
        const payload = await promise;
        if (sequence !== newsRouteSequence) return;
        setDataStatus("live"); renderDataPage(shellRoutes["/news"], newsDetailContent(payload));
        if (payload?.article?.title) document.title = `AlmazStat — ${payload.article.title}`;
      } catch (error) {
        if (sequence !== newsRouteSequence) return;
        setDataStatus("error");
        renderDataPage(shellRoutes["/news"], newsErrorState(error.message || "Новость недоступна."));
        const retry = elements.dataContent.querySelector("[data-news-retry]");
        if (retry) retry.addEventListener("click", () => loadNewsRoute(true));
      }
      return;
    }
    const { category, search } = newsFilters(query);
    const key = `${search}::${category}`;
    const params = new URLSearchParams({ category });
    if (search) params.set("search", search);
    renderNewsPage(query, dataState("Загрузка новостей", "loading"));
    try {
      let promise = !force && newsCache.has(key) ? Promise.resolve(newsCache.get(key)) : newsInflight.get(key);
      if (!promise) {
        promise = fetchDataJson(`/api/news?${params}`).then((payload) => { newsCache.set(key, payload); return payload; }).finally(() => newsInflight.delete(key));
        newsInflight.set(key, promise);
      }
      const payload = await promise;
      if (sequence !== newsRouteSequence) return;
      setDataStatus("live"); renderNewsPage(query, newsStateContent(payload));
    } catch (error) {
      if (sequence !== newsRouteSequence) return;
      setDataStatus("error");
      renderNewsPage(query, newsErrorState(error.message || "Источник новостей недоступен."));
      const retry = elements.dataContent.querySelector("[data-news-retry]");
      if (retry) retry.addEventListener("click", () => loadNewsRoute(true));
    }
  }

  async function fetchDataJson(path) {
    const response = await fetch(path);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Источник данных недоступен.");
    }
    return payload;
  }

  const globalStatisticsState = {
    leagues: null,
    leaguesInflight: null,
    payloads: new Map(),
    inflight: new Map(),
    tab: "standings",
  };
  const globalStatisticsTabs = ["standings", "scorers", "assists", "cards", "teams"];
  const globalStatisticsLabels = {
    standings: "Таблица",
    scorers: "Бомбардиры",
    assists: "Ассисты",
    cards: "Карточки",
    teams: "Команды",
  };

  function globalStatisticsKey(league, season, category) {
    return `${league}:${season}:${category}`;
  }

  function loadGlobalLeagues() {
    if (globalStatisticsState.leagues) return Promise.resolve(globalStatisticsState.leagues);
    if (!globalStatisticsState.leaguesInflight) {
      globalStatisticsState.leaguesInflight = fetchDataJson("/api/leagues").then((payload) => {
        globalStatisticsState.leagues = Array.isArray(payload.leagues) ? payload.leagues : [];
        return globalStatisticsState.leagues;
      }).finally(() => { globalStatisticsState.leaguesInflight = null; });
    }
    return globalStatisticsState.leaguesInflight;
  }

  function globalStatisticsStateMarkup(message, kind = "empty", retry = "") {
    return dataState(message, kind, retry ? `statistics:${retry}` : "");
  }

  function globalStatisticsContextHtml(league, season) {
    if (!league || !season) return globalStatisticsStateMarkup("Выберите лигу и сезон, чтобы открыть статистику.");
    return "";
  }

  function globalStatisticsSelectors(leagues, selectedLeague, selectedSeason) {
    const seasons = selectedLeague?.seasons || [];
    return `
      <div class="statistics-filters" aria-label="Контекст статистики">
        <label class="data-field"><span>Лига</span><select data-global-league aria-label="Лига">
          <option value="">Выберите лигу</option>
          ${leagues.map((league) => `<option value="${escapeHtml(league.id)}" ${String(league.id) === String(selectedLeague?.id) ? "selected" : ""}>${escapeHtml(league.name || league.id)}</option>`).join("")}
        </select></label>
        <label class="data-field"><span>Сезон</span><select data-global-season aria-label="Сезон" ${selectedLeague ? "" : "disabled"}>
          <option value="">Выберите сезон</option>
          ${seasons.map((item) => `<option value="${escapeHtml(item.year)}" ${String(item.year) === String(selectedSeason || "") ? "selected" : ""}>${escapeHtml(item.year)}${item.current ? " · текущий" : ""}</option>`).join("")}
        </select></label>
      </div>
      ${selectedLeague && selectedSeason ? `<a class="statistics-context" data-route="/league/${encodeURIComponent(selectedLeague.id)}" href="/league/${encodeURIComponent(selectedLeague.id)}">${dataLogo(selectedLeague.logo, selectedLeague.name, "statistics-context-logo")}<span><strong>${escapeHtml(selectedLeague.name)}</strong><small>${escapeHtml(selectedLeague.country?.name || selectedLeague.type || "")} · сезон ${escapeHtml(selectedSeason)}</small></span><b>→</b></a>` : ""}
    `;
  }

  function globalStatisticsTabsHtml(active) {
    return `<div class="statistics-tabs" role="tablist" aria-label="Статистика турнира">
      ${globalStatisticsTabs.map((tab) => `<button class="tab ${tab === active ? "active" : ""}" type="button" role="tab" id="global-tab-${tab}" aria-selected="${tab === active}" aria-controls="global-panel-${tab}" tabindex="${tab === active ? "0" : "-1"}" data-global-tab="${tab}">${globalStatisticsLabels[tab]}</button>`).join("")}
    </div>`;
  }

  function globalValue(value) { return value === null || value === undefined || value === "" ? null : escapeHtml(value); }
  function globalPersonLink(player, season) {
    const name = player?.name || "Игрок";
    return player?.id ? `<a class="global-player-link" data-route="/player/${encodeURIComponent(player.id)}?season=${encodeURIComponent(season)}" href="/player/${encodeURIComponent(player.id)}?season=${encodeURIComponent(season)}">${dataLogo(player.photo, name, "global-player-photo")}<span>${escapeHtml(name)}${player.nationality ? `<small>${escapeHtml(player.nationality)}</small>` : ""}</span></a>` : `<span class="global-player-link">${dataLogo(player?.photo, name, "global-player-photo")}<span>${escapeHtml(name)}</span></span>`;
  }
  function globalTeamLink(team) {
    return team?.id ? `<a class="global-team-link" data-route="/team/${encodeURIComponent(team.id)}" href="/team/${encodeURIComponent(team.id)}">${dataLogo(team.logo, team.name, "global-team-logo")}<span>${escapeHtml(team.name || "Команда")}</span></a>` : `<span class="global-team-link">${escapeHtml(team?.name || "Команда")}</span>`;
  }
  function globalMetric(label, value) { return globalValue(value) === null ? "" : `<span><small>${label}</small><strong>${globalValue(value)}</strong></span>`; }

  function renderGlobalStandings(payload) {
    const groups = Array.isArray(payload?.groups) ? payload.groups : [];
    if (!groups.length || !groups.some((g) => g.rows?.length)) return globalStatisticsStateMarkup("Таблица для этого контекста пуста.");
    return `<div class="global-groups">${groups.map((group) => `<section class="global-group"><h2>${escapeHtml(group.name || "Группа")}</h2><div class="table-scroll"><table class="league-table global-table"><thead><tr><th>#</th><th>Команда</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>ГЗ</th><th>ГП</th><th>РМ</th><th>О</th><th>Форма</th></tr></thead><tbody>${(group.rows || []).map((row) => `<tr><td>${escapeHtml(row.rank ?? "—")}</td><td>${row.team?.id ? `<a class="global-team-link" data-route="/team/${encodeURIComponent(row.team.id)}" href="/team/${encodeURIComponent(row.team.id)}">${dataLogo(row.team.logo, row.team.name, "table-logo")}${escapeHtml(row.team.name || "Команда")}</a>` : escapeHtml(row.team?.name || "Команда")}</td><td>${escapeHtml(row.played ?? "—")}</td><td>${escapeHtml(row.win ?? "—")}</td><td>${escapeHtml(row.draw ?? "—")}</td><td>${escapeHtml(row.lose ?? "—")}</td><td>${escapeHtml(row.goalsFor ?? "—")}</td><td>${escapeHtml(row.goalsAgainst ?? "—")}</td><td>${escapeHtml(row.goalDifference ?? "—")}</td><td><strong>${escapeHtml(row.points ?? "—")}</strong></td><td>${escapeHtml(row.form ?? "—")}</td></tr>`).join("")}</tbody></table></div></section>`).join("")}</div>`;
  }

  function renderGlobalLeaders(payload, category, season) {
    const rows = Array.isArray(payload?.leaders) ? payload.leaders : [];
    if (!rows.length) return globalStatisticsStateMarkup("Лидеры для этого контекста не найдены.");
    const primary = category === "assists" ? "assists" : "goals";
    return `<div class="global-leaders">${rows.map((row) => `<article class="global-leader"><strong class="global-rank">#${escapeHtml(row.rank ?? "—")}</strong>${globalPersonLink(row.player, season)}${globalTeamLink(row.team)}<div class="global-metrics">${globalMetric("И", row.appearances)}${primary === "assists" ? globalMetric("Г", row.goals) : globalMetric("А", row.assists)}${globalMetric("Рейтинг", row.rating)}${row[primary] !== null && row[primary] !== undefined ? `<span class="global-primary"><small>${primary === "goals" ? "ГОЛЫ" : "АССИСТЫ"}</small><strong>${escapeHtml(row[primary])}</strong></span>` : ""}</div></article>`).join("")}</div>`;
  }

  function renderGlobalCards(payload, season) {
    const section = (title, rows, tone) => `<section class="global-card-section"><h2 class="${tone}">${title}</h2>${rows?.length ? `<div class="global-leaders">${rows.map((row) => `<article class="global-leader"><strong class="global-rank">#${escapeHtml(row.rank ?? "—")}</strong>${globalPersonLink(row.player, season)}${globalTeamLink(row.team)}<div class="global-metrics">${globalMetric("Жёлтые", row.yellowCards)}${globalMetric("Жёлтые+красные", row.yellowRedCards)}${globalMetric("Красные", row.redCards)}</div></article>`).join("")}</div>` : globalStatisticsStateMarkup(`Список ${title.toLowerCase()} пуст.`)}</section>`;
    if (!payload || (!payload.yellow?.length && !payload.red?.length)) return globalStatisticsStateMarkup("Карточки для этого контекста не найдены.");
    return `${section("Yellow cards", payload.yellow, "yellow-card-title")}${section("Red cards", payload.red, "red-card-title")}`;
  }

  function renderGlobalStatisticsPanel(tab, payload, season) {
    if (tab === "teams") return `<div class="data-state statistics-unavailable"><div class="data-state-mark">—</div><strong>Team Statistics недоступна</strong><p>API-Football предоставляет командную статистику только для конкретной команды. Fan-out запросы по всем командам намеренно не выполняются.</p></div>`;
    if (tab === "standings") return renderGlobalStandings(payload);
    if (tab === "cards") return renderGlobalCards(payload, season);
    return renderGlobalLeaders(payload, tab, season);
  }

  async function loadGlobalStatisticsPayload(league, season, tab) {
    const category = tab === "standings" ? "standings" : tab;
    const key = globalStatisticsKey(league, season, category);
    if (globalStatisticsState.payloads.has(key)) return globalStatisticsState.payloads.get(key);
    if (!globalStatisticsState.inflight.has(key)) {
      const endpoint = tab === "standings"
        ? `/api/leagues/${encodeURIComponent(league)}/standings?season=${encodeURIComponent(season)}`
        : `/api/statistics?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}&category=${encodeURIComponent(category)}`;
      globalStatisticsState.inflight.set(key, fetchDataJson(endpoint).then((payload) => { globalStatisticsState.payloads.set(key, payload); return payload; }).finally(() => globalStatisticsState.inflight.delete(key)));
    }
    return globalStatisticsState.inflight.get(key);
  }

  function bindGlobalStatistics(routeSequence, leagues, selectedLeague, selectedSeason) {
    const root = elements.dataContent;
    const leagueSelect = root.querySelector("[data-global-league]");
    const seasonSelect = root.querySelector("[data-global-season]");
    const navigate = (league, season) => {
      const params = new URLSearchParams();
      if (league) params.set("league", league);
      if (season) params.set("season", season);
      window.history.pushState({}, "", `${applicationBasePath()}/statistics${params.toString() ? `?${params}` : ""}`);
      loadStatisticsRoute();
    };
    leagueSelect?.addEventListener("change", () => navigate(leagueSelect.value, ""));
    seasonSelect?.addEventListener("change", () => navigate(selectedLeague?.id || "", seasonSelect.value));
    root.querySelectorAll("[data-global-tab]").forEach((button, index, buttons) => {
      button.addEventListener("click", () => {
        globalStatisticsState.tab = button.dataset.globalTab;
        const nextSequence = ++dataLoadSequence;
        renderGlobalStatisticsRoute(nextSequence, leagues);
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus(); buttons[next].click();
      });
    });
  }

  async function renderGlobalStatisticsRoute(sequence, leagues) {
    const query = routeParams();
    const selectedLeague = leagues.find((item) => String(item.id) === String(query.get("league")));
    const selectedSeason = selectedLeague?.seasons?.some((item) => String(item.year) === String(query.get("season"))) ? query.get("season") : "";
    const tab = globalStatisticsState.tab;
    const shell = `${globalStatisticsSelectors(leagues, selectedLeague, selectedSeason)}${globalStatisticsTabsHtml(tab)}<section id="global-panel-${tab}" class="global-statistics-panel" role="tabpanel" aria-labelledby="global-tab-${tab}" tabindex="0">`;
    if (!selectedLeague || !selectedSeason) {
      renderDataPage(shellRoutes["/statistics"], `${shell}${globalStatisticsContextHtml(selectedLeague, selectedSeason)}</section>`);
      bindGlobalStatistics(sequence, leagues, selectedLeague, selectedSeason);
      return;
    }
    if (tab === "teams") {
      renderDataPage(shellRoutes["/statistics"], `${shell}${renderGlobalStatisticsPanel(tab, null, selectedSeason)}</section>`);
      bindGlobalStatistics(sequence, leagues, selectedLeague, selectedSeason);
      return;
    }
    renderDataPage(shellRoutes["/statistics"], `${shell}${globalStatisticsStateMarkup("Загрузка данных", "loading")}</section>`);
    bindGlobalStatistics(sequence, leagues, selectedLeague, selectedSeason);
    try {
      const payload = await loadGlobalStatisticsPayload(selectedLeague.id, selectedSeason, tab);
      if (sequence !== dataLoadSequence || normalizedRoute() !== "/statistics") return;
      renderDataPage(shellRoutes["/statistics"], `${shell}${renderGlobalStatisticsPanel(tab, payload, selectedSeason)}</section>`);
      bindGlobalStatistics(sequence, leagues, selectedLeague, selectedSeason);
      setDataStatus("live");
    } catch (error) {
      if (sequence !== dataLoadSequence) return;
      renderDataPage(shellRoutes["/statistics"], `${shell}${globalStatisticsStateMarkup(error.message || "Источник данных недоступен.", "error", tab)}</section>`);
      bindGlobalStatistics(sequence, leagues, selectedLeague, selectedSeason);
      setDataStatus("error");
    }
  }

  async function loadStatisticsRoute() {
    const sequence = ++dataLoadSequence;
    globalStatisticsState.tab = routeParams().get("tab") && globalStatisticsTabs.includes(routeParams().get("tab")) ? routeParams().get("tab") : globalStatisticsState.tab;
    setDataStatus("loading");
    renderDataPage(shellRoutes["/statistics"], globalStatisticsStateMarkup("Загрузка лиг", "loading"));
    try {
      const leagues = await loadGlobalLeagues();
      if (sequence !== dataLoadSequence) return;
      await renderGlobalStatisticsRoute(sequence, leagues);
      setDataStatus("live");
    } catch (error) {
      if (sequence !== dataLoadSequence) return;
      renderDataPage(shellRoutes["/statistics"], globalStatisticsStateMarkup(error.message || "Не удалось загрузить лиги.", "error", "leagues"));
      setDataStatus("error");
    }
  }

  const leagueStage3 = {
    id: null,
    league: null,
    season: null,
    tab: "overview",
    cache: new Map(),
    inflight: new Map(),
  };
  const leagueTabs = ["overview", "matches", "standings", "teams", "statistics"];
  const leagueTabLabels = { overview: "Обзор", matches: "Матчи", standings: "Таблица", teams: "Команды", statistics: "Статистика" };
  const leagueStatus = (fixture) => String(fixture?.status?.short || "").toUpperCase();
  const leagueDate = (fixture) => new Date(fixture?.timestamp ? fixture.timestamp * 1000 : fixture?.date || 0);
  function leagueSeason(league) {
    const seasons = Array.isArray(league?.seasons) ? league.seasons : [];
    return seasons.find((s) => s.current)?.year || seasons[0]?.year || "";
  }
  function leagueState(message, kind = "loading", retry) {
    return dataState(message, kind, retry ? `league:${retry}` : "");
  }
  function leagueFixtureRow(fixture) {
    const status = leagueStatus(fixture);
    const live = liveStatuses.has(status);
    return `<button class="league-fixture-row ${live ? "is-live" : ""}" type="button" data-fixture-id="${escapeHtml(fixture.fixtureId ?? "")}">
      <span class="league-fixture-date">${escapeHtml(Number.isNaN(leagueDate(fixture).getTime()) ? "—" : formatDate(leagueDate(fixture), true))}<b>${escapeHtml(fixture.league?.round || "—")}</b><em>${escapeHtml(fixture.status?.long || status || "—")}</em></span>
      <span class="league-fixture-teams">
        <span>${dataLogo(fixture.home?.logo, fixture.home?.name, "league-fixture-logo")}${escapeHtml(fixture.home?.name || "—")}</span>
        <span>${dataLogo(fixture.away?.logo, fixture.away?.name, "league-fixture-logo")}${escapeHtml(fixture.away?.name || "—")}</span>
      </span>
      <strong>${fixture.goals?.home ?? "—"}<br>${fixture.goals?.away ?? "—"}</strong>
    </button>`;
  }
  function leagueFixturesView(fixtures, filter = "all") {
    const now = Date.now();
    const rows = (fixtures || []).filter((f) => {
      const s = leagueStatus(f);
      if (filter === "live") return liveStatuses.has(s);
      if (filter === "finished") return finishedStatuses.has(s);
      if (filter === "upcoming") return upcomingStatuses.has(s) || leagueDate(f).getTime() > now;
      return true;
    }).sort((a, b) => leagueDate(a) - leagueDate(b));
    return `<div class="league-fixtures">${
      rows.length
        ? rows.map(leagueFixtureRow).join("")
        : '<div class="empty-state">Матчи этого типа не найдены</div>'
    }</div>`;
  }
  function leagueOverview(fixtures) {
    const list = (fixtures || []).slice().sort((a, b) => leagueDate(a) - leagueDate(b));
    const done = list.filter((f) => finishedStatuses.has(leagueStatus(f)));
    const upcoming = list.filter((f) => upcomingStatuses.has(leagueStatus(f)) || leagueDate(f) > Date.now());
    const teams = new Set(list.flatMap((f) => [f.home?.id, f.away?.id].filter(Boolean)));
    const currentFixture =
      list.find((fixture) => liveStatuses.has(leagueStatus(fixture))) ||
      upcoming[0] ||
      done[done.length - 1];
    return `<div class="league-overview-grid">
      <div class="data-stat-card"><span>Матчи</span><strong>${list.length || "—"}</strong></div>
      <div class="data-stat-card"><span>Команды в данных</span><strong>${teams.size || "—"}</strong></div>
      <div class="data-stat-card"><span>Текущий раунд</span><strong>${escapeHtml(currentFixture?.league?.round || "—")}</strong></div>
    </div>
    <div class="data-section-heading"><strong>Ближайшие</strong><span>${upcoming.length}</span></div>${leagueFixturesView(upcoming.slice(0, 5))}
    <div class="data-section-heading"><strong>Последние результаты</strong><span>${done.length}</span></div>${leagueFixturesView(done.slice(-5).reverse())}`;
  }
  function leagueStandings(payload) {
    const groups = payload?.groups || [];
    if (!groups.length) return `<div class="empty-state">Таблица недоступна для этого сезона</div>`;
    return groups.map((group) => `<section class="league-group"><div class="data-section-heading"><strong>${escapeHtml(group.name || "Группа")}</strong></div><div class="table-scroll"><table class="league-table"><thead><tr><th>#</th><th>Команда</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>ГЗ</th><th>ГП</th><th>±</th><th>О</th><th>Форма</th></tr></thead><tbody>${(group.rows || []).map((r) => `<tr><td>${escapeHtml(r.rank ?? "—")}</td><td>${dataLogo(r.team?.logo, r.team?.name, "table-logo")} ${escapeHtml(r.team?.name || "—")}</td><td>${r.played ?? "—"}</td><td>${r.win ?? "—"}</td><td>${r.draw ?? "—"}</td><td>${r.lose ?? "—"}</td><td>${r.goalsFor ?? "—"}</td><td>${r.goalsAgainst ?? "—"}</td><td>${r.goalDifference ?? "—"}</td><td><strong>${r.points ?? "—"}</strong></td><td>${escapeHtml(r.form || "—")}</td></tr>`).join("")}</tbody></table></div></section>`).join("");
  }
  function leagueTeams(payload) {
    const teams = payload?.teams || [];
    return teams.length ? `<div class="data-grid">${teams.map((t) => `<a class="data-card" data-route="/team/${encodeURIComponent(t.id)}" href="/team/${encodeURIComponent(t.id)}"><div class="data-card-top">${dataLogo(t.logo, t.name, "data-logo")}<div><strong>${escapeHtml(t.name || "—")}</strong><span>${escapeHtml(t.country || "—")}</span></div></div></a>`).join("")}</div>` : `<div class="empty-state">Команды недоступны для этого сезона</div>`;
  }
  function leagueStatistics(payload) {
    const rows = payload?.scorers || [];
    return rows.length ? `<div class="scorers-list">${rows.map((r) => `<div class="scorer-row"><span class="scorer-rank">#${escapeHtml(r.rank ?? "—")}</span>${dataLogo(r.player?.photo, r.player?.name, "data-logo scorer-logo")}<div class="scorer-copy"><strong>${escapeHtml(r.player?.name || "—")}</strong><span>${escapeHtml(r.team?.name || "—")}</span></div><div class="scorer-goals"><strong>${r.goals ?? "—"}</strong><span>голов</span></div></div>`).join("")}</div>` : `<div class="empty-state">Статистика бомбардиров недоступна</div>`;
  }
  async function leagueTabData(tab, retry = false) {
    const key = `${leagueStage3.id}:${leagueStage3.season}:${tab}`;
    if (!retry && leagueStage3.cache.has(key)) return leagueStage3.cache.get(key);
    if (leagueStage3.inflight.has(key)) return leagueStage3.inflight.get(key);
    const endpoints = {
      matches: `/api/leagues/${encodeURIComponent(leagueStage3.id)}/fixtures?season=${encodeURIComponent(leagueStage3.season)}`,
      standings: `/api/leagues/${encodeURIComponent(leagueStage3.id)}/standings?season=${encodeURIComponent(leagueStage3.season)}`,
      teams: `/api/teams?league=${encodeURIComponent(leagueStage3.id)}&season=${encodeURIComponent(leagueStage3.season)}`,
      statistics: `/api/statistics?league=${encodeURIComponent(leagueStage3.id)}&season=${encodeURIComponent(leagueStage3.season)}`,
    };
    if (!endpoints[tab]) return null;
    const request = fetchDataJson(endpoints[tab])
      .then((payload) => {
        leagueStage3.cache.set(key, payload);
        return payload;
      })
      .finally(() => leagueStage3.inflight.delete(key));
    leagueStage3.inflight.set(key, request);
    return request;
  }
  function renderLeagueStage3(payload) {
    const league = payload || {};
    leagueStage3.league = league;
    leagueStage3.season = leagueStage3.season || leagueSeason(league);
    const seasons = league.seasons || [];
    const seasonControl = seasons.length > 1
      ? `<label class="season-select">Сезон<select data-league-season>${seasons.map((season) => `<option value="${escapeHtml(season.year)}" ${String(season.year) === String(leagueStage3.season) ? "selected" : ""}>${escapeHtml(season.year)}${season.current ? " · текущий" : ""}</option>`).join("")}</select></label>`
      : `<div class="season-current"><span>Сезон</span><strong>${escapeHtml(seasons[0]?.year || "Недоступен")}</strong></div>`;
    renderDataPage(shellRoutes["/leagues"], `<a class="back-link data-back-link" data-route="/leagues" href="/leagues">← Все лиги</a>
      <article class="league-hero"><div class="league-hero-main">${dataLogo(league.logo, league.name, "data-logo league-hero-logo")}<div><h1>${escapeHtml(league.name || "—")}</h1><p>${league.country?.flag ? `<img class="country-flag" src="${escapeHtml(league.country.flag)}" alt="" />` : ""}${escapeHtml(league.country?.name || "—")} · ${escapeHtml(league.type || "—")}</p></div></div>
      ${seasonControl}</article>
      <div class="tabs league-tabs" role="tablist" aria-label="Разделы лиги">${leagueTabs.map((tab) => `<button id="league-tab-${tab}" class="tab ${tab === leagueStage3.tab ? "active" : ""}" type="button" role="tab" aria-selected="${tab === leagueStage3.tab}" aria-controls="league-panel" tabindex="${tab === leagueStage3.tab ? "0" : "-1"}" data-league-tab="${tab}">${leagueTabLabels[tab]}</button>`).join("")}</div>
      <div id="league-panel" class="league-panel" role="tabpanel" aria-labelledby="league-tab-${leagueStage3.tab}"></div>`);
    document.title = `AlmazStat — ${league.name || "League"}`;
    const panel = document.getElementById("league-panel");
    if (!leagueStage3.season) {
      panel.innerHTML = leagueState("Для этой лиги нет доступных сезонов", "empty");
      bindLeagueStage3();
      return;
    }
    if (leagueStage3.tab === "overview") {
      const cached = leagueStage3.cache.get(`${leagueStage3.id}:${leagueStage3.season}:matches`);
      panel.innerHTML = cached ? leagueOverview(cached.fixtures || []) : leagueState("Загрузка обзора", "loading");
      if (!cached) leagueTabData("matches").then((data) => { if (leagueStage3.tab === "overview") { panel.innerHTML = leagueOverview(data.fixtures || []); bindLeagueStage3(); } }).catch((e) => { panel.innerHTML = leagueState(e.message, "error", "matches"); bindLeagueStage3(); });
    } else {
      const requestedTab = leagueStage3.tab;
      panel.innerHTML = leagueState("Загрузка данных", "loading");
      leagueTabData(leagueStage3.tab).then((data) => {
        if (leagueStage3.tab !== requestedTab) return;
        panel.innerHTML = leagueStage3.tab === "matches" ? `<div class="match-filters league-match-filters"><button class="active" data-league-filter="all">Все</button><button data-league-filter="upcoming">Скоро</button><button data-league-filter="live">LIVE</button><button data-league-filter="finished">Завершённые</button></div>${leagueFixturesView(data.fixtures || [])}` : leagueStage3.tab === "standings" ? leagueStandings(data) : leagueStage3.tab === "teams" ? leagueTeams(data) : leagueStatistics(data);
        bindLeagueStage3();
      }).catch((e) => { panel.innerHTML = leagueState(e.message || "Раздел недоступен", "error", requestedTab); bindLeagueStage3(); });
    }
    bindLeagueStage3();
  }
  function bindLeagueStage3() {
    const bindOnce = (element, eventName, handler) => {
      const marker = `leagueBound${eventName[0].toUpperCase()}${eventName.slice(1)}`;
      if (!element || element.dataset[marker]) return;
      element.dataset[marker] = "true";
      element.addEventListener(eventName, handler);
    };
    const seasonSelect = elements.dataContent.querySelector("[data-league-season]");
    bindOnce(seasonSelect, "change", (event) => {
      leagueStage3.season = event.target.value;
      leagueStage3.tab = "overview";
      renderLeagueStage3(leagueStage3.league);
    });
    const tabs = Array.from(elements.dataContent.querySelectorAll("[data-league-tab]"));
    tabs.forEach((button) => {
      bindOnce(button, "click", () => {
        leagueStage3.tab = button.dataset.leagueTab;
        renderLeagueStage3(leagueStage3.league);
      });
      bindOnce(button, "keydown", (event) => {
        const currentIndex = tabs.indexOf(button);
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    });
    elements.dataContent.querySelectorAll("[data-league-filter]").forEach((button) => {
      bindOnce(button, "click", () => {
        elements.dataContent.querySelectorAll("[data-league-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        const payload = leagueStage3.cache.get(`${leagueStage3.id}:${leagueStage3.season}:matches`);
        const existing = document.getElementById("league-panel").querySelector(".league-fixtures");
        if (existing) {
          existing.outerHTML = leagueFixturesView(payload?.fixtures || [], button.dataset.leagueFilter);
          bindLeagueStage3();
        }
      });
    });
    elements.dataContent.querySelectorAll("[data-fixture-id]").forEach((button) => {
      bindOnce(button, "click", () => {
        if (button.dataset.fixtureId) {
          window.location.href = `${applicationBasePath()}/?fixture=${encodeURIComponent(button.dataset.fixtureId)}`;
        }
      });
    });
    elements.dataContent.querySelectorAll("[data-data-retry]").forEach((button) => {
      bindOnce(button, "click", () => {
        const tab = button.dataset.dataRetry.replace("league:", "");
        leagueStage3.cache.delete(`${leagueStage3.id}:${leagueStage3.season}:${tab}`);
        renderLeagueStage3(leagueStage3.league);
      });
    });
  }
  async function loadLeagueStage3(id) {
    const sequence = ++dataLoadSequence;
    leagueStage3.id = id;
    leagueStage3.tab = "overview";
    leagueStage3.season = null;
    renderDataPage(shellRoutes["/leagues"], leagueState("Загрузка лиги", "loading"));
    try {
      const payload = await fetchDataJson(`/api/leagues/${encodeURIComponent(id)}`);
      if (sequence !== dataLoadSequence) return;
      leagueStage3.season = leagueSeason(payload.league);
      setDataStatus("live");
      renderLeagueStage3(payload.league);
    } catch (error) {
      if (sequence !== dataLoadSequence) return;
      setDataStatus("error");
      renderDataPage(
        shellRoutes["/leagues"],
        dataState(error.message || "Лига недоступна", "error", "league-details"),
      );
    }
  }

  const teamDetailCache = new Map();
  const teamDetailInflight = new Map();
  let teamDetailSequence = 0;
  const teamDetailTabs = ["overview", "matches", "squad", "statistics", "form", "standings"];
  const teamDetailLabels = { overview: "Обзор", matches: "Матчи", squad: "Состав", statistics: "Статистика", form: "Форма", standings: "Таблица" };
  const teamDetailState = {
    id: null,
    team: null,
    context: null,
    contextError: false,
    tab: "overview",
    filter: "all",
    league: null,
    season: null,
  };

  function teamValue(value, fallback = "—") {
    return value === null || value === undefined || value === "" ? fallback : String(value);
  }
  function teamDataKey(id, dataset, league, season) {
    return `${id}:${league || "none"}:${season || "none"}:${dataset}`;
  }
  async function teamCached(key, endpoint, retry = false) {
    if (!retry && teamDetailCache.has(key)) return teamDetailCache.get(key);
    if (!retry && teamDetailInflight.has(key)) return teamDetailInflight.get(key);
    const request = fetchDataJson(endpoint).then((payload) => {
      teamDetailCache.set(key, payload);
      teamDetailInflight.delete(key);
      return payload;
    }).catch((error) => {
      teamDetailInflight.delete(key);
      throw error;
    });
    teamDetailInflight.set(key, request);
    return request;
  }
  function teamState(message, kind = "empty", retryKey = "") {
    return `<div class="team-state ${kind}"><strong>${kind === "error" ? "Ошибка данных" : kind === "loading" ? "Загрузка" : "Нет данных"}</strong><span>${escapeHtml(message)}</span>${kind === "error" && retryKey ? `<button class="retry-button" data-team-retry="${escapeHtml(retryKey)}">Повторить</button>` : ""}</div>`;
  }
  function teamLogo(url, name, className = "team-detail-logo") {
    return url ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(name || "")}" loading="lazy">` : `<span class="${className} team-logo-placeholder" aria-hidden="true">◇</span>`;
  }
  function teamFixtureLink(fixture, teamId) {
    const home = fixture.home || {}, away = fixture.away || {}, score = fixture.goals || {};
    const status = fixture.status || {};
    const finished = finishedStatuses.has(status.short);
    const statusText = liveStatuses.has(status.short) ? "LIVE" : finished ? (status.long || status.short || "Finished") : (status.long || status.short || "Upcoming");
    return `<button class="team-fixture-row ${liveStatuses.has(status.short) ? "is-live" : ""}" type="button" data-fixture-id="${escapeHtml(fixture.fixtureId ?? "")}">
      <span class="team-fixture-date">${escapeHtml(formatDate(fixture.date, true))}<b>${escapeHtml(statusText)}</b><em>${escapeHtml(fixture.league?.name || "—")} · ${escapeHtml(fixture.league?.round || "—")}</em></span>
      <span class="team-fixture-teams"><span>${teamLogo(home.logo, home.name, "team-row-logo")}${escapeHtml(home.name || "—")}</span><span>${teamLogo(away.logo, away.name, "team-row-logo")}${escapeHtml(away.name || "—")}</span></span>
      <strong>${score.home ?? "—"}<br>${score.away ?? "—"}</strong>
    </button>`;
  }
  function teamFixturesMarkup(fixtures, filter = "all") {
    const list = (fixtures || []).filter((fixture) => {
      const short = fixture.status?.short;
      return filter === "live"
        ? liveStatuses.has(short)
        : filter === "upcoming"
          ? upcomingStatuses.has(short) ||
            new Date(fixture.date || 0).getTime() > Date.now()
          : filter === "finished"
            ? finishedStatuses.has(short)
            : true;
    });
    return list.length ? `<div class="team-fixtures">${list.map((fixture) => teamFixtureLink(fixture, teamDetailState.id)).join("")}</div>` : teamState("No fixtures for this filter.");
  }
  function teamContextUnavailable() {
    return !teamDetailState.league || !teamDetailState.season;
  }
  function teamMetric(label, value) {
    return `<div class="data-stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(teamValue(value))}</strong></div>`;
  }
  function teamTabShell(active) {
    return `<div class="team-tabs" role="tablist" aria-label="Team sections">${teamDetailTabs.map((tab) => `<button class="tab ${tab === active ? "active" : ""}" id="team-tab-${tab}" type="button" role="tab" aria-selected="${tab === active}" aria-controls="team-panel-${tab}" tabindex="${tab === active ? "0" : "-1"}" data-team-tab="${tab}">${teamDetailLabels[tab]}</button>`).join("")}</div><section id="team-panel-${active}" class="team-panel" role="tabpanel" aria-labelledby="team-tab-${active}" tabindex="0"></section>`;
  }
  function renderTeamHero(team) {
    const venue = team?.venue || {};
    const metadata = [["Founded", team?.founded], ["Venue", venue.name], ["City", venue.city], ["Capacity", venue.capacity], ["Address", venue.address]].filter(([, value]) => value !== null && value !== undefined && value !== "");
    return `<a class="back-link data-back-link" data-route="/teams" href="/teams">← All teams</a><article class="team-hero"><div class="team-hero-main">${teamLogo(team?.logo, team?.name)}<div><h1>${escapeHtml(teamValue(team?.name, "Team"))}</h1><p>${escapeHtml(teamValue(team?.country, "Country unavailable"))}${team?.code ? ` · ${escapeHtml(team.code)}` : ""}</p></div></div>${metadata.length ? `<div class="team-meta-grid">${metadata.map(([label, value]) => teamMetric(label, value)).join("")}</div>` : ""}</article>`;
  }
  function renderTeamOverview(fixtures) {
    const rows = [...(fixtures || [])];
    const finished = rows
      .filter((fixture) => finishedStatuses.has(fixture.status?.short))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);
    const next = rows
      .filter((fixture) =>
        upcomingStatuses.has(fixture.status?.short) ||
        new Date(fixture.date || 0).getTime() > Date.now(),
      )
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
      .slice(0, 5);
    return `<div class="team-section-title"><strong>Recent results</strong><span>${finished.length} matches</span></div>${teamFixturesMarkup(finished)}<div class="team-section-title"><strong>Next fixtures</strong><span>${next.length} matches</span></div>${teamFixturesMarkup(next)}`;
  }
  function renderTeamMatches(fixtures) {
    return `<div class="team-filter-tabs">${["all", "upcoming", "live", "finished"].map((filter) => `<button type="button" class="${teamDetailState.filter === filter ? "active" : ""}" data-team-filter="${filter}">${filter[0].toUpperCase() + filter.slice(1)}</button>`).join("")}</div>${teamFixturesMarkup(fixtures, teamDetailState.filter)}`;
  }
  function renderTeamSquad(squad) {
    const groups = { Goalkeeper: [], Defender: [], Midfielder: [], Attacker: [], Other: [] };
    (squad || []).forEach((player) => {
      const position = String(player.position || "").toUpperCase();
      const group = position === "GK" || position.includes("GOAL") ? "Goalkeeper" : position === "DEF" || position.includes("DEF") ? "Defender" : position === "MID" || position.includes("MID") ? "Midfielder" : position.startsWith("ATT") || position.includes("FORWARD") || position.includes("STRIK") ? "Attacker" : "Other";
      groups[group].push(player);
    });
    const squadSeason = teamDetailState.season ? `?season=${encodeURIComponent(teamDetailState.season)}` : "";
    return Object.entries(groups).filter(([, players]) => players.length).map(([group, players]) => `<section class="team-squad-group"><div class="team-section-title"><strong>${group}</strong><span>${players.length}</span></div><div class="team-squad-grid">${players.map((player) => `<a class="team-player" data-route="/player/${encodeURIComponent(player.id)}${squadSeason}" href="/player/${encodeURIComponent(player.id)}${squadSeason}"><span class="team-player-link">${teamLogo(player.photo, player.name, "team-player-photo")}<span><strong>${escapeHtml(player.name || "—")}</strong><span>${escapeHtml(player.position || group)}${player.age !== null && player.age !== undefined ? ` · ${escapeHtml(player.age)} yrs` : ""}</span></span></span>${player.number !== null && player.number !== undefined ? `<b>#${escapeHtml(player.number)}</b>` : ""}</a>`).join("")}</div></section>`).join("");
  }
  function teamSplitMetric(label, value) {
    return `<section class="team-stat-block"><h3>${escapeHtml(label)}</h3><div class="team-stat-split">${teamMetric("Home", value?.home)}${teamMetric("Away", value?.away)}${teamMetric("Total", value?.total)}</div></section>`;
  }
  function renderTeamStats(statistics) {
      if (!statistics) return teamState("Статистика для этого контекста недоступна.");
    return `<div class="team-stat-sections">
      ${teamSplitMetric("Played", statistics.played)}
      ${teamSplitMetric("Wins", statistics.wins)}
      ${teamSplitMetric("Draws", statistics.draws)}
      ${teamSplitMetric("Losses", statistics.losses)}
      ${teamSplitMetric("Goals for", statistics.goalsFor?.total)}
      ${teamSplitMetric("Goals against", statistics.goalsAgainst?.total)}
      ${teamSplitMetric("Clean sheets", statistics.cleanSheets)}
      ${teamSplitMetric("Failed to score", statistics.failedToScore)}
    </div>`;
  }
  function renderTeamForm(form) {
    if (!form?.length) return teamState("Form is not available for this context.");
    return `<div class="team-form-list">${form.slice(0, 5).map((row) => `<div class="team-form-row"><b class="result ${String(row.result || "").toLowerCase()}">${escapeHtml(row.result || "—")}</b>${teamLogo(row.opponent?.logo, row.opponent?.name, "team-row-logo")}<span>${escapeHtml(row.opponent?.name || "—")}<small>${escapeHtml(formatDate(row.date, true))} · ${escapeHtml(row.side || "—")}</small></span><strong>${row.score?.home ?? "—"} : ${row.score?.away ?? "—"}</strong></div>`).join("")}</div>`;
  }
  function renderTeamStandings(payload) {
    const groups = payload?.groups || [];
    if (!groups.length) return teamState("Standings are not available for this context.");
    return groups.map((group) => `<section class="team-standing-group"><div class="team-section-title"><strong>${escapeHtml(group.name || "Standings")}</strong></div><div class="table-scroll"><table class="league-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${(group.rows || []).map((row) => `<tr class="${String(row.team?.id) === String(teamDetailState.id) ? "is-selected" : ""}"><td>${escapeHtml(row.rank ?? "—")}</td><td>${dataLogo(row.team?.logo, row.team?.name, "table-logo")} ${escapeHtml(row.team?.name || "—")}</td><td>${row.played ?? "—"}</td><td>${row.win ?? "—"}</td><td>${row.draw ?? "—"}</td><td>${row.lose ?? "—"}</td><td>${row.goalDifference ?? "—"}</td><td><strong>${row.points ?? "—"}</strong></td></tr>`).join("")}</tbody></table></div></section>`).join("");
  }
  async function loadTeamTab(tab, retry = false) {
    const id = teamDetailState.id, league = teamDetailState.league, season = teamDetailState.season;
    if (tab !== "squad" && teamContextUnavailable()) {
      document.getElementById(`team-panel-${tab}`).innerHTML = teamDetailState.contextError
        ? teamState("Competition context could not be loaded. Squad remains available.", "error", "context")
        : teamState("No current competition context was returned by the API.");
      bindTeamDetail();
      return;
    }
    const dataset = tab === "squad"
      ? "squad"
      : tab === "standings"
        ? "standings"
        : tab === "statistics"
          ? "statistics"
          : "fixtures";
    const key = tab === "squad"
      ? teamDataKey(id, dataset)
      : teamDataKey(id, dataset, league, season);
    const endpoint = tab === "squad" ? `/api/teams/${encodeURIComponent(id)}/squad` : tab === "standings" ? `/api/leagues/${encodeURIComponent(league)}/standings?season=${encodeURIComponent(season)}` : tab === "statistics" ? `/api/teams/${encodeURIComponent(id)}/statistics?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}` : `/api/teams/${encodeURIComponent(id)}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`;
    const panel = document.getElementById(`team-panel-${tab}`);
    panel.innerHTML = teamState("Loading data", "loading");
    try {
      const payload = await teamCached(key, endpoint, retry);
      if (teamDetailState.id !== id) return;
      if (tab === "overview" || tab === "matches" || tab === "form") return;
      panel.innerHTML = tab === "squad" ? (payload.squad?.length ? renderTeamSquad(payload.squad) : teamState("Squad is empty.")) : tab === "statistics" ? renderTeamStats(payload.statistics) : renderTeamStandings(payload);
      if (tab === "standings") panel.querySelector(".is-selected")?.scrollIntoView({ block: "nearest", inline: "center" });
      bindTeamDetail();
    } catch (error) {
      panel.innerHTML = teamState(error.message || "Could not load this section.", "error", tab);
      bindTeamDetail();
    }
  }
  async function ensureTeamFixtures(tab, retry = false) {
    if (teamContextUnavailable()) {
      const panel = document.getElementById(`team-panel-${tab}`);
      if (panel) {
        panel.innerHTML = teamDetailState.contextError
          ? teamState("Competition context could not be loaded. Squad remains available.", "error", "context")
          : teamState("No current competition context was returned by the API.");
        bindTeamDetail();
      }
      return;
    }
    const id = teamDetailState.id;
    const league = teamDetailState.league;
    const season = teamDetailState.season;
    const key = teamDataKey(teamDetailState.id, "fixtures", teamDetailState.league, teamDetailState.season);
    try {
      const payload = await teamCached(key, `/api/teams/${encodeURIComponent(id)}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, retry);
      const panel = document.getElementById(`team-panel-${tab}`);
      if (
        !panel ||
        teamDetailState.tab !== tab ||
        teamDetailState.id !== id ||
        teamDetailState.league !== league ||
        teamDetailState.season !== season
      ) return;
      panel.innerHTML = tab === "overview" ? renderTeamOverview(payload.fixtures || []) : tab === "form" ? renderTeamForm(payload.form) : renderTeamMatches(payload.fixtures || []);
      bindTeamDetail();
    } catch (error) {
      const panel = document.getElementById(`team-panel-${tab}`);
      if (panel) {
        panel.innerHTML = teamState(error.message || "Could not load fixtures.", "error", "fixtures");
        bindTeamDetail();
      }
    }
  }
  function bindTeamDetail() {
    const root = elements.dataContent;
    const bindOnce = (element, eventName, handler) => {
      const marker = `teamBound${eventName[0].toUpperCase()}${eventName.slice(1)}`;
      if (!element || element.dataset[marker]) return;
      element.dataset[marker] = "true";
      element.addEventListener(eventName, handler);
    };
    root.querySelectorAll("[data-team-tab]").forEach((button) => bindOnce(button, "click", () => {
      teamDetailState.tab = button.dataset.teamTab;
      root.querySelectorAll("[data-team-tab]").forEach((item) => { const selected = item === button; item.classList.toggle("active", selected); item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1; });
      root.querySelector(".team-panel")?.remove();
      const panel = document.createElement("section"); panel.id = `team-panel-${teamDetailState.tab}`; panel.className = "team-panel"; panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", `team-tab-${teamDetailState.tab}`); panel.tabIndex = 0; root.querySelector(".team-tabs").after(panel);
      if (["overview", "matches", "form"].includes(teamDetailState.tab)) ensureTeamFixtures(teamDetailState.tab); else loadTeamTab(teamDetailState.tab);
    }));
    root.querySelectorAll("[data-team-tab]").forEach((button) => bindOnce(button, "keydown", (event) => {
      const tabs = Array.from(root.querySelectorAll("[data-team-tab]")); const index = tabs.indexOf(button); let next = null;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length; if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length; if (event.key === "Home") next = 0; if (event.key === "End") next = tabs.length - 1;
      if (next !== null) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
    }));
    root.querySelectorAll("[data-team-filter]").forEach((button) => bindOnce(button, "click", () => { teamDetailState.filter = button.dataset.teamFilter; ensureTeamFixtures("matches"); }));
    root.querySelectorAll("[data-team-retry]").forEach((button) => bindOnce(button, "click", () => {
      const key = button.dataset.teamRetry;
      if (key === "metadata" || key === "context") {
        teamDetailCache.delete(teamDataKey(teamDetailState.id, key));
        loadTeamRoute(teamDetailState.id);
        return;
      }
      if (key === "fixtures") {
        const fixtureKey = teamDataKey(teamDetailState.id, "fixtures", teamDetailState.league, teamDetailState.season);
        teamDetailCache.delete(fixtureKey);
        ensureTeamFixtures(teamDetailState.tab, true);
        return;
      }
      [...teamDetailCache.keys()]
        .filter((item) => item.startsWith(`${teamDetailState.id}:`) && item.endsWith(`:${key}`))
        .forEach((item) => teamDetailCache.delete(item));
      loadTeamTab(key, true);
    }));
    root.querySelectorAll("[data-fixture-id]").forEach((button) => bindOnce(button, "click", () => { if (button.dataset.fixtureId) window.location.href = `${applicationBasePath()}/?fixture=${encodeURIComponent(button.dataset.fixtureId)}`; }));
  }
  function teamContextControl(competitions) {
    if (!competitions.length) return "";
    return `<label class="team-context-select">Соревнование<select data-team-context>${competitions.map((competition) => {
      const season = competition.seasons?.find((item) => item.current) || competition.seasons?.[0];
      return `<option value="${escapeHtml(competition.id)}" ${String(competition.id) === String(teamDetailState.league) ? "selected" : ""}>${escapeHtml(competition.name || competition.id)} · ${escapeHtml(season?.year || "—")}</option>`;
    }).join("")}</select></label>`;
  }
  async function loadTeamRoute(id) {
    const sequence = ++teamDetailSequence;
    teamDetailState.id = id; teamDetailState.team = null; teamDetailState.context = null; teamDetailState.contextError = false; teamDetailState.tab = "overview"; teamDetailState.filter = "all"; teamDetailState.league = null; teamDetailState.season = null;
    syncShellNavigation("/teams"); setDataStatus("loading"); renderDataPage(shellRoutes["/teams"], teamState("Загрузка команды", "loading"));
    try {
      const [teamResult, contextResult] = await Promise.allSettled([teamCached(teamDataKey(id, "metadata"), `/api/teams/${encodeURIComponent(id)}`), teamCached(teamDataKey(id, "context"), `/api/teams/${encodeURIComponent(id)}/context`)]);
      if (sequence !== teamDetailSequence) return;
      if (teamResult.status === "rejected") throw teamResult.reason;
      const teamPayload = teamResult.value;
      const contextPayload = contextResult.status === "fulfilled" ? contextResult.value : null;
      teamDetailState.team = teamPayload.team; teamDetailState.context = contextPayload; teamDetailState.contextError = contextResult.status === "rejected"; const competitions = contextPayload?.competitions || [];
      const context = competitions[0]; const season = context?.seasons?.find((item) => item.current) || context?.seasons?.[0];
      teamDetailState.league = context?.id || null; teamDetailState.season = season?.year || null;
      renderDataPage(shellRoutes["/teams"], `${renderTeamHero(teamPayload.team)}${teamContextControl(competitions)}${teamTabShell("overview")}`);
      document.title = `AlmazStat — ${teamPayload.team?.name || "Команда"}`;
      setDataStatus(contextResult.status === "rejected" ? "error" : "live"); bindTeamDetail();
      if (contextResult.status === "rejected") document.getElementById("team-panel-overview").innerHTML = teamState("Competition context failed. Retry context-dependent sections; Squad is still available.", "error", "context");
      else if (competitions.length) ensureTeamFixtures("overview"); else document.getElementById("team-panel-overview").innerHTML = teamState("No current competition was returned. Squad remains available.");
      bindTeamDetail();
      const select = elements.dataContent.querySelector("[data-team-context]");
      select?.addEventListener("change", () => {
        const selected = competitions.find((item) => String(item.id) === select.value);
        const selectedSeason = selected?.seasons?.find((item) => item.current) || selected?.seasons?.[0];
        teamDetailState.league = selected?.id || null;
        teamDetailState.season = selectedSeason?.year || null;
        teamDetailState.tab = "overview";
        teamDetailState.filter = "all";
        renderDataPage(shellRoutes["/teams"], `${renderTeamHero(teamDetailState.team)}${teamContextControl(competitions)}${teamTabShell("overview")}`);
        bindTeamDetail();
        ensureTeamFixtures("overview");
      });
    } catch (error) {
      if (sequence !== teamDetailSequence) return;
      setDataStatus("error");
      renderDataPage(
        shellRoutes["/teams"],
        `${renderDetailBack("/teams", "Все команды")}${teamState(error.message || "Не удалось загрузить профиль команды.", "error", "metadata")}`,
      );
      bindTeamDetail();
    }
  }
  async function loadDataRoute(routePath) {
    if (routePath === "/statistics") {
      loadStatisticsRoute();
      return;
    }
    const route = shellRoutes[routePath];
    if (!route || route.kind !== "data") return;
    const query = routeParams();
    const id = query.get("id");
    const sequence = ++dataLoadSequence;
    const withMeta = (body) => body;
    let dataLoadPayload = null;

    setDataStatus("loading");
    renderDataPage(
      route,
      dataListContent(
        id ? "" : routePath,
        query,
        dataState("Загрузка данных", "loading"),
      ),
    );

    if (!id && (routePath === "/teams" || routePath === "/players") && !query.get("search") && !query.get("league")) {
      loadPriorityCatalogLanding(route, routePath, query, sequence);
      return;
    }

    const needsInput =
      (routePath === "/teams" && !id && !query.get("search") && !(query.get("league") && query.get("season"))) ||
      (routePath === "/players" && !id && !query.get("team") && !query.get("league") && (!query.get("search") || query.get("search").trim().length < 3)) ||
      (routePath === "/statistics" && !(query.get("league") && query.get("season")));
    if (needsInput) {
      setDataStatus("live");
      renderDataPage(
        route,
        dataListContent(
          routePath,
          query,
          dataState(
            routePath === "/statistics"
              ? "Выберите лигу и сезон, чтобы открыть статистику."
              : routePath === "/players" && query.get("search") && query.get("search").trim().length < 3
                ? "Введите минимум 3 символа имени игрока."
              : routePath === "/teams"
                ? "Найдите клуб или откройте профиль из матча."
                : "Введите имя игрока или выберите турнир.",
          ),
        ),
      );
      return;
    }

    let endpoint = "";
    let renderSuccess;
    if (routePath === "/leagues") {
      endpoint = id
        ? `/api/leagues/${encodeURIComponent(id)}`
        : `/api/leagues?${query.toString()}`;
      renderSuccess = (payload) =>
        id
          ? renderLeagueDetail(payload.league)
          : dataListContent(routePath, query, renderLeagueCards(payload.leagues || []));
    } else if (routePath === "/teams") {
      endpoint = id
        ? `/api/teams/${encodeURIComponent(id)}`
        : `/api/teams?${query.toString()}`;
      renderSuccess = (payload) =>
        id
          ? renderTeamDetail(payload.team)
          : dataListContent(routePath, query, renderTeamCards(payload.teams || []));
    } else if (routePath === "/players") {
      endpoint = id
        ? `/api/players/${encodeURIComponent(id)}${query.get("season") ? `?season=${encodeURIComponent(query.get("season"))}` : ""}`
        : `/api/players?${query.toString()}`;
      renderSuccess = (payload) =>
        id
          ? renderPlayerDetail(payload.player)
          : dataListContent(routePath, query, renderPlayerCards(payload.players || [], payload.paging, query));
    } else if (routePath === "/news") {
      endpoint = `/api/news?${query.toString()}`;
      renderSuccess = (payload) => dataListContent(routePath, query, renderNewsCards(payload.items || []));
    }

    try {
      dataLoadPayload = await fetchDataJson(endpoint);
      if (sequence !== dataLoadSequence) return;
      setDataStatus("live");
      renderDataPage(route, withMeta(renderSuccess(dataLoadPayload)));
    } catch (error) {
      if (sequence !== dataLoadSequence) return;
      setDataStatus("error");
      const body = dataState(error.message || "Источник данных недоступен.", "error", routePath);
      renderDataPage(
        route,
        dataListContent(id ? "" : routePath, query, body),
      );
    }
  }

  const dashboardData = {
    matches: null,
    matchesDate: null,
    matchesInflight: null,
  };
  let dashboardRouteSequence = 0;

  function dashboardState(title, copy, error = false, retry = "") {
    return `<div class="dashboard-state${error ? " is-error" : ""}">
      <strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span>
      ${retry ? `<button class="retry-button" type="button" data-dashboard-retry="${retry}">Повторить</button>` : ""}
    </div>`;
  }

  function dashboardFixtureButton(match, compact = false) {
    const status = match?.status || {};
    const home = match?.home?.name || "Команда не указана";
    const away = match?.away?.name || "Команда не указана";
    const score = match?.goals && (match.goals.home !== null || match.goals.away !== null)
      ? `${match.goals.home ?? "—"} : ${match.goals.away ?? "—"}` : formatMatchTime(match?.date);
    return `<button class="dashboard-fixture${liveStatuses.has(status.short) ? " is-live" : ""}${compact ? " is-compact" : ""}" type="button" data-dashboard-fixture="${escapeHtml(match?.fixtureId || "")}">
      <span class="dashboard-fixture-league">${escapeHtml(match?.league?.name || "Соревнование не указано")}</span>
      <span class="dashboard-fixture-teams"><b>${escapeHtml(home)}</b><b>${escapeHtml(away)}</b></span>
      <span class="dashboard-fixture-score">${escapeHtml(score)}</span>
      <span class="dashboard-fixture-status">${escapeHtml(matchStatusLabel(match))}</span>
    </button>`;
  }

  function dashboardSignals(match) {
    const hasScore = match?.goals?.home !== null && match?.goals?.home !== undefined
      || match?.goals?.away !== null && match?.goals?.away !== undefined;
    const signals = [
      [match?.fixtureId, "fixture"],
      [match?.date, "date"],
      [match?.status?.short || match?.status?.long, "status"],
      [match?.league?.name, "league"],
      [match?.home?.name && match?.away?.name, "teams"],
      [hasScore ? "available" : null, "score"],
      [match?.league?.round, "round"],
    ];
    const labels = { fixture: "Fixture", date: "Дата", status: "Статус", league: "Лига", teams: "Команды", score: "Счёт", round: "Тур" };
    return signals.filter(([value]) => value !== null && value !== undefined && value !== "").map(([, key]) => `<span>${labels[key]}</span>`).join("");
  }

  function dashboardAnalysis(matches) {
    return (matches || []).map((match, index) => {
      const hasScore = match?.goals?.home !== null && match?.goals?.home !== undefined
        || match?.goals?.away !== null && match?.goals?.away !== undefined;
      const count = [match?.fixtureId, match?.date, match?.status?.short || match?.status?.long, match?.league?.name, match?.home?.name && match?.away?.name, hasScore ? "available" : null, match?.league?.round]
        .filter((value) => value !== null && value !== undefined && value !== "").length;
      return { match, count, index };
    }).sort((a, b) => b.count - a.count || Number(liveStatuses.has(b.match?.status?.short)) - Number(liveStatuses.has(a.match?.status?.short)) || (new Date(a.match?.date || 0).getTime() - new Date(b.match?.date || 0).getTime()) || a.index - b.index).slice(0, 3);
  }

  function dashboardNews(payload) {
    if (newsProviderStatus(payload) === "not_configured") {
      return `<div class="dashboard-empty"><strong>Новости пока не подключены</strong><span>Раздел готов к публикациям из провайдера.</span><a class="dashboard-cta secondary" data-route="/news" href="/news">Открыть News</a></div>`;
    }
    const items = Array.isArray(payload?.items) ? payload.items.filter((item) => item && (item.title || item.summary || item.source)).slice(0, 3) : [];
    if (!items.length) return `<div class="dashboard-empty"><strong>Последних публикаций нет</strong><span>Новые материалы появятся здесь после поступления данных.</span><a class="dashboard-cta secondary" data-route="/news" href="/news">Открыть News</a></div>`;
    return `<div class="dashboard-news-list">${items.map((item) => `<article class="dashboard-news-item">
      ${item.category || item.publishedAt ? `<small>${escapeHtml(item.category || "")}${item.publishedAt ? ` · ${escapeHtml(formatDate(item.publishedAt, true))}` : ""}</small>` : ""}
      ${item.id && item.title ? `<a data-route="/news/${encodeURIComponent(item.id)}" href="/news/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>` : item.title ? `<strong>${escapeHtml(item.title)}</strong>` : ""}
      ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}${item.source ? `<em>${escapeHtml(item.source)}</em>` : ""}
    </article>`).join("")}</div>`;
  }

  function renderDashboardBlock(kind, content) {
    const block = elements.dashboardScreen.querySelector(`[data-dashboard-block="${kind}"]`);
    if (block) block.innerHTML = content;
  }

  function renderDashboardShell() {
    elements.dashboardScreen.innerHTML = `
      <section class="dashboard-hero"><div class="screen-kicker">AlmazStat · сегодня</div><h1>Главное в футболе</h1><p id="dashboard-date">Матчи, которые стоит увидеть сегодня.</p><div class="dashboard-actions"><a class="dashboard-cta" data-route="/matches" href="/matches">Открыть все матчи</a><a class="dashboard-cta secondary" data-route="/leagues" href="/leagues">Топ-лиги</a></div></section>
      <section class="dashboard-section" data-dashboard-block="live"><div class="dashboard-section-head"><div><small>ПРЯМО СЕЙЧАС</small><h2>Идёт игра</h2></div><a data-route="/matches" href="/matches">Матч-центр</a></div></section>
      <section class="dashboard-section" data-dashboard-block="main"><div class="dashboard-section-head"><div><small>ГЛАВНЫЕ МАТЧИ</small><h2>Сегодня</h2></div></div></section>
      <section class="dashboard-section" data-dashboard-block="upcoming"><div class="dashboard-section-head"><div><small>ДАЛЬШЕ</small><h2>Предстоящие</h2></div></div></section>
      <section class="dashboard-section" data-dashboard-block="recent"><div class="dashboard-section-head"><div><small>РЕЗУЛЬТАТЫ</small><h2>Недавние</h2></div></div></section>
      <section class="dashboard-section" data-dashboard-block="leagues"><div class="dashboard-section-head"><div><small>ПРИОРИТЕТ</small><h2>Топ-лиги</h2></div><a data-route="/leagues" href="/leagues">Все лиги</a></div></section>
      <section class="dashboard-section" data-dashboard-block="all"><div class="dashboard-section-head"><div><small>ПОЛНАЯ ЛЕНТА</small><h2>Все матчи сегодня</h2></div><a data-route="/matches" href="/matches">Матч-центр</a></div></section>`;
  }

  async function loadDashboard(forceMatches = false) {
    const sequence = ++dashboardRouteSequence;
    const retryMatchesOnly = forceMatches;
    if (!retryMatchesOnly) {
      renderDashboardShell();
      ["live", "main", "upcoming", "recent", "leagues", "all"].forEach((kind) => renderDashboardBlock(kind, dashboardState("Загрузка матчей", "Получаем сегодняшние матчи…")));
    } else if (retryMatchesOnly) {
      ["live", "main", "upcoming", "recent", "leagues", "all"].forEach((kind) => renderDashboardBlock(kind, dashboardState("Загрузка матчей", "Повторяем запрос сегодняшних матчей…")));
    }
    const todayDate = dateForOffset(0);
    const fetchMatches = () => {
      if (!forceMatches && dashboardData.matches && dashboardData.matchesDate === todayDate) return Promise.resolve(dashboardData.matches);
      if (!dashboardData.matchesInflight) dashboardData.matchesInflight = fetchDataJson(`/api/matches?date=${encodeURIComponent(todayDate)}`).then((payload) => {
        dashboardData.matches = payload;
        dashboardData.matchesDate = todayDate;
        return payload;
      }).finally(() => { dashboardData.matchesInflight = null; });
      return dashboardData.matchesInflight;
    };
    fetchMatches().then((payload) => {
      if (sequence !== dashboardRouteSequence) return;
      const matches = Array.isArray(payload?.matches) ? payload.matches : [];
      const ordered = sortByCompetitionPriority(matches);
      const live = sortByCompetitionPriority(matches.filter((item) => liveStatuses.has(item?.status?.short)));
      const upcoming = sortByCompetitionPriority(matches.filter((item) => upcomingStatuses.has(item?.status?.short)));
      const recent = sortByCompetitionPriority(matches.filter((item) => finishedStatuses.has(item?.status?.short)));
      const ranked = ordered;
      const leagueNames = [...new Map(ranked.map((item) => [String(item?.league?.id ?? item?.league?.name), item?.league])).values()].filter((league) => league?.id !== null && league?.id !== undefined).slice(0, 6);
      const block = (items, empty) => items.length ? `<div class="dashboard-fixtures">${items.slice(0, 6).map((item) => dashboardFixtureButton(item)).join("")}</div>` : `<div class="dashboard-empty"><strong>${empty}</strong></div>`;
      renderDashboardBlock("live", block(live, "Сейчас матчей нет"));
      renderDashboardBlock("main", block(ranked.filter((item) => !liveStatuses.has(item?.status?.short)).slice(0, 6), "Матчей на сегодня нет"));
      renderDashboardBlock("upcoming", block(upcoming, "Предстоящих матчей нет"));
      renderDashboardBlock("recent", block(recent, "Завершённых матчей нет"));
      renderDashboardBlock("all", block(ordered, "Матчей на сегодня нет"));
      renderDashboardBlock("leagues", leagueNames.length ? `<div class="dashboard-league-strip">${leagueNames.map((league) => `<a data-route="/league/${encodeURIComponent(league?.id || "")}" href="/league/${encodeURIComponent(league?.id || "")}">${leagueLogo(league)}<span>${escapeHtml(league?.name || "Соревнование")}</span></a>`).join("")}</div>` : `<div class="dashboard-empty"><strong>Лиги не найдены</strong></div>`);
      setDataStatus("live");
    }).catch((error) => {
      if (sequence !== dashboardRouteSequence) return;
      ["live", "main", "upcoming", "recent", "leagues", "all"].forEach((kind) => renderDashboardBlock(kind, dashboardState("Матчи недоступны", error.message || "Проверьте соединение.", true, "matches")));
      setDataStatus("error");
    });
  }

  function renderShellRoute() {
    if (fixtureId) return;
    const requestedPath = normalizedRoute();
    const isNewsRoute = requestedPath === "/news" || /^\/news\/[^/]+$/.test(requestedPath);
    if (!isNewsRoute) newsRouteSequence += 1;
    if (isNewsRoute) {
      syncShellNavigation("/news");
      loadNewsRoute();
      return;
    }
    if (requestedPath !== "/statistics") dataLoadSequence += 1;
    const playerMatch = requestedPath.match(/^\/player\/([^/]+)$/);
    if (playerMatch) {
      loadPlayerRoute(decodeURIComponent(playerMatch[1]));
      return;
    }
    playerRouteSequence += 1;
    const teamMatch = requestedPath.match(/^\/team\/([^/]+)$/);
    if (teamMatch) {
      loadTeamRoute(decodeURIComponent(teamMatch[1]));
      return;
    }
    teamDetailSequence += 1;
    const leagueMatch = requestedPath.match(/^\/league\/([^/]+)$/);
    if (leagueMatch) {
      syncShellNavigation("/leagues");
      loadLeagueStage3(decodeURIComponent(leagueMatch[1]));
      return;
    }
    const route = shellRoutes[requestedPath] || shellRoutes["/"];
    const routePath = shellRoutes[requestedPath] ? requestedPath : "/";

    if (requestedPath !== routePath) {
      window.history.replaceState({}, "", routePath);
    }

    if (route.kind !== "dashboard") dashboardRouteSequence += 1;
    syncShellNavigation(routePath);
    if (route.kind === "dashboard") {
      elements.matchesScreen.hidden = true;
      elements.analysisScreen.hidden = true;
      elements.dataScreen.hidden = true;
      elements.dashboardScreen.hidden = false;
      document.title = "AlmazStat — футбол без лишнего";
      loadDashboard();
    } else if (route.kind === "match-center") {
      dashboardRouteSequence += 1;
      elements.dashboardScreen.hidden = true;
      elements.dataScreen.hidden = true;
      elements.analysisScreen.hidden = true;
      elements.matchesScreen.hidden = false;
      document.title = `AlmazStat — ${route.title}`;
      if (!matchCenterInitialized) loadMatches(selectedDate);
    } else {
      if (routePath === "/statistics") loadStatisticsRoute();
      else loadDataRoute(routePath);
    }
  }

  function setupShellRouting() {
    if (fixtureId) {
      const basePath = applicationBasePath();
      if (basePath) {
        for (const link of document.querySelectorAll("a[data-route]")) {
          const href = link.getAttribute("href");
          if (href?.startsWith("/") && !href.startsWith(`${basePath}/`)) {
            link.setAttribute("href", `${basePath}${href}`);
          }
        }
      }
    }

    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-route]");
      if (!link || link.target === "_blank" || event.defaultPrevented) return;
      if (fixtureId) return;

      const href = link.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      event.preventDefault();
      const nextUrl = new URL(href, window.location.href);
      const nextPath = normalizedRoute(nextUrl.pathname);
      window.history.pushState(
        {},
        "",
        `${applicationBasePath()}${nextPath}${nextUrl.search}`,
      );
      renderShellRoute();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    elements.dataContent.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-data-form]");
      if (!form) return;
      event.preventDefault();
      const values = new URLSearchParams();
      for (const [key, value] of new FormData(form).entries()) {
        if (String(value).trim()) values.set(key, String(value).trim());
      }
      const target = `${applicationBasePath()}${form.dataset.dataForm}${values.toString() ? `?${values}` : ""}`;
      window.history.pushState({}, "", target);
      renderShellRoute();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    elements.dashboardScreen.addEventListener("click", (event) => {
      const fixtureButton = event.target.closest("[data-dashboard-fixture]");
      if (fixtureButton?.dataset.dashboardFixture) {
        window.location.href = `${applicationBasePath()}/?fixture=${encodeURIComponent(fixtureButton.dataset.dashboardFixture)}`;
        return;
      }
      const retry = event.target.closest("[data-dashboard-retry]");
      if (retry) {
        loadDashboard(retry.dataset.dashboardRetry === "matches", retry.dataset.dashboardRetry === "news");
      }
    });

    window.addEventListener("popstate", renderShellRoute);
  }

  async function loadMatch() {
    setDataStatus("loading");
    elements.analysisState.textContent = "Загрузка аналитики";
    elements.analysisState.hidden = false;
    elements.analysisContent.hidden = true;

    try {
      const response = await fetch(`/api/match?fixture=${encodeURIComponent(fixtureId)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload && payload.error && payload.error.message
            ? payload.error.message
            : "Не удалось получить данные матча.",
        );
      }

      if (!payload.fixture) {
        throw new Error("Не удалось загрузить аналитику");
      }

      currentMatch = payload;
      currentForm = null;
      sourceState = {
        fixture: true,
        prediction: Boolean(payload.prediction),
        statistics: "unknown",
        events: "unknown",
        lineups: "unknown",
        form: "unknown",
        h2h: "unknown",
        standings: "unknown",
        odds: "unknown",
      };
      renderFixture(payload);
      renderPrediction(payload.prediction, null);
      renderOverviewSignal(payload, payload.prediction);
      refreshRisk();
      elements.analysisContent.hidden = false;
      elements.analysisState.hidden = true;
      setDataStatus("live");
    } catch {
      elements.analysisState.hidden = false;
      elements.analysisContent.hidden = true;
      renderRetry(
        elements.analysisState,
        "Не удалось загрузить аналитику",
        loadMatch,
      );
      setDataStatus("error");
    }
  }

  setupTabs();
  restoreMatchCenterState();
  setupMatchCenter();
  setupShellRouting();

  if (fixtureId) {
    elements.analysisScreen.hidden = false;
    elements.matchesScreen.hidden = true;
    elements.dataScreen.hidden = true;
    syncShellNavigation("/matches");
    document.title = "AlmazStat — Match Details";
    loadMatch();
  } else {
    elements.analysisScreen.hidden = true;
    updateMatchCenterControls();
    renderShellRoute();
  }
})();