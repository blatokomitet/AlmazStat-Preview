from pathlib import Path

path = Path("server.js")
text = path.read_text()

helper_anchor = 'app.get("/api/match/:fixture/form", async (request, response) => {'
helper = '''async function getSportmonksMatchCentre(fixtureId) {
  if (!sportmonksToken) return null;
  const key = `sportmonks:match-centre:${fixtureId}`;
  const cached = cachedValue(key);
  if (cached !== undefined) return cached;

  const result = await sportmonksProvider.fixtureById(fixtureId, { deep: true });
  const centre = result?.fixture || null;
  if (!centre) return null;

  setCachedValue(key, centre, fixtureCacheTtl(centre.fixture?.status?.short));
  return centre;
}

function sportmonksStatisticsForUi(centre) {
  const homeId = centre?.home?.id;
  const awayId = centre?.away?.id;
  const rows = Array.isArray(centre?.statistics) ? centre.statistics : [];
  const byType = new Map();

  for (const row of rows) {
    const type = String(row?.type?.name || row?.type?.developerName || "").trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (!byType.has(key)) {
      byType.set(key, {
        type,
        label: statisticLabels.get(key) || type,
        home: null,
        away: null,
      });
    }
    const target = byType.get(key);
    const value = normalizeStatisticValue(row?.value);
    if (Number(row?.teamId) === Number(homeId)) target.home = value;
    if (Number(row?.teamId) === Number(awayId)) target.away = value;
  }

  return {
    home: { id: centre?.home?.id ?? null, name: centre?.home?.name ?? null, logo: centre?.home?.logo ?? null },
    away: { id: centre?.away?.id ?? null, name: centre?.away?.name ?? null, logo: centre?.away?.logo ?? null },
    rows: [...byType.values()].filter((row) => row.home !== null || row.away !== null),
  };
}

function sportmonksEventsForUi(centre) {
  const teamForId = (teamId) => {
    if (Number(teamId) === Number(centre?.home?.id)) return centre.home;
    if (Number(teamId) === Number(centre?.away?.id)) return centre.away;
    return null;
  };

  return (Array.isArray(centre?.events) ? centre.events : []).map((event) => {
    const team = teamForId(event?.teamId);
    return {
      elapsed: event?.minute ?? null,
      extra: event?.extraMinute ?? null,
      team: { id: team?.id ?? event?.teamId ?? null, name: team?.name ?? null, logo: team?.logo ?? null },
      player: { id: event?.player?.id ?? null, name: event?.player?.name ?? null },
      assist: { id: event?.relatedPlayer?.id ?? null, name: event?.relatedPlayer?.name ?? null },
      type: event?.type?.name ?? event?.type?.developerName ?? null,
      detail: event?.info ?? event?.addition ?? event?.result ?? null,
      comments: event?.addition ?? null,
      developerName: event?.type?.developerName ?? null,
      playerImage: event?.player?.image ?? null,
    };
  });
}

function sportmonksLineupsForUi(centre) {
  const mapPlayer = (entry) => {
    const rating = entry?.details?.find?.((detail) => detail?.type?.developerName === "RATING")?.value ?? null;
    return {
      id: entry?.playerId ?? null,
      name: entry?.playerName ?? null,
      number: entry?.jerseyNumber ?? null,
      position: entry?.positionId ?? null,
      grid: entry?.formationField ?? null,
      formationPosition: entry?.formationPosition ?? null,
      photo: entry?.playerImage ?? null,
      rating,
      details: entry?.details ?? [],
    };
  };

  const mapTeam = (side) => {
    const team = centre?.[side] || {};
    const lineup = centre?.lineups?.[side] || {};
    return {
      team: { id: team?.id ?? null, name: team?.name ?? null, logo: team?.logo ?? null },
      formation: null,
      coach: { id: null, name: null, photo: null },
      startXI: (lineup?.starters || []).map(mapPlayer),
      substitutes: (lineup?.bench || []).map(mapPlayer),
    };
  };

  return { home: mapTeam("home"), away: mapTeam("away") };
}

'''

if "async function getSportmonksMatchCentre" not in text:
    if helper_anchor not in text:
        raise SystemExit("Could not find Match Centre insertion anchor")
    text = text.replace(helper_anchor, helper + helper_anchor, 1)

route_patches = [
    (
        'app.get("/api/match/:fixture/statistics", async (request, response) => {\n  if (!requireApiKey(response)) return;\n  const fixtureId = String(request.params.fixture || "").trim();',
        '''app.get("/api/match/:fixture/statistics", async (request, response) => {
  const fixtureId = String(request.params.fixture || "").trim();

  if (sportmonksToken) {
    try {
      const centre = await getSportmonksMatchCentre(fixtureId);
      if (!centre) return response.status(404).json({ error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." } });
      const statistics = sportmonksStatisticsForUi(centre);
      return response.json({ statistics, source: statistics.rows.length > 0, dataState: statistics.rows.length > 0 ? "available" : "provider_empty", provider: "sportmonks", meta: { apiRequestCount: 1 } });
    } catch (error) {
      console.error("Sportmonks statistics request failed:", error?.message || error);
      if (!apiFootballKey) return response.status(502).json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось получить статистику." }, provider: "sportmonks" });
    }
  }

  if (!requireApiKey(response)) return;'''
    ),
    (
        'app.get("/api/match/:fixture/events", async (request, response) => {\n  if (!requireApiKey(response)) return;\n  const fixtureId = String(request.params.fixture || "").trim();',
        '''app.get("/api/match/:fixture/events", async (request, response) => {
  const fixtureId = String(request.params.fixture || "").trim();

  if (sportmonksToken) {
    try {
      const centre = await getSportmonksMatchCentre(fixtureId);
      if (!centre) return response.status(404).json({ error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." } });
      const events = sportmonksEventsForUi(centre);
      return response.json({ events, status: centre.fixture?.status ?? null, source: events.length > 0, dataState: events.length > 0 ? "available" : "provider_empty", provider: "sportmonks", meta: { apiRequestCount: 1 } });
    } catch (error) {
      console.error("Sportmonks events request failed:", error?.message || error);
      if (!apiFootballKey) return response.status(502).json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось получить события матча." }, provider: "sportmonks" });
    }
  }

  if (!requireApiKey(response)) return;'''
    ),
    (
        'app.get("/api/match/:fixture/lineups", async (request, response) => {\n  if (!requireApiKey(response)) return;\n  const fixtureId = String(request.params.fixture || "").trim();',
        '''app.get("/api/match/:fixture/lineups", async (request, response) => {
  const fixtureId = String(request.params.fixture || "").trim();

  if (sportmonksToken) {
    try {
      const centre = await getSportmonksMatchCentre(fixtureId);
      if (!centre) return response.status(404).json({ error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." } });
      const lineups = sportmonksLineupsForUi(centre);
      const count = (lineups.home?.startXI?.length || 0) + (lineups.away?.startXI?.length || 0);
      return response.json({ lineups, status: centre.fixture?.status ?? null, source: count > 0, dataState: count > 0 ? "available" : "provider_empty", provider: "sportmonks", meta: { apiRequestCount: 1 } });
    } catch (error) {
      console.error("Sportmonks lineups request failed:", error?.message || error);
      if (!apiFootballKey) return response.status(502).json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось получить составы." }, provider: "sportmonks" });
    }
  }

  if (!requireApiKey(response)) return;'''
    ),
]

for old, new in route_patches:
    if old in text:
        text = text.replace(old, new, 1)

path.write_text(text)
