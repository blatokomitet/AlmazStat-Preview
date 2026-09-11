import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSportmonksProvider } from "./lib/sportmonks-provider.js";

const app = express();
const port = Number(process.env.PORT);
const apiFootballKey = process.env.API_FOOTBALL_KEY;
const sportmonksToken = process.env.SPORTMONKS_API_TOKEN;
const apiFootballBaseUrl = "https://v3.football.api-sports.io";
const sportmonksProvider = createSportmonksProvider({ token: sportmonksToken });
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataCache = new Map();
const apiFootballInflight = new Map();

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT environment variable must contain a valid port number.");
}

function serverDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeMatch(match) {
  return {
    fixtureId: match.fixture?.id ?? null,
    date: match.fixture?.date ?? null,
    timestamp: match.fixture?.timestamp ?? null,
    status: {
      short: match.fixture?.status?.short ?? null,
      long: match.fixture?.status?.long ?? null,
      elapsed: match.fixture?.status?.elapsed ?? null,
    },
    league: {
      id: match.league?.id ?? null,
      name: match.league?.name ?? null,
      country: match.league?.country ?? null,
      logo: match.league?.logo ?? null,
      round: match.league?.round ?? null,
    },
    home: {
      id: match.teams?.home?.id ?? null,
      name: match.teams?.home?.name ?? null,
      logo: match.teams?.home?.logo ?? null,
    },
    away: {
      id: match.teams?.away?.id ?? null,
      name: match.teams?.away?.name ?? null,
      logo: match.teams?.away?.logo ?? null,
    },
    goals: {
      home: match.goals?.home ?? null,
      away: match.goals?.away ?? null,
    },
  };
}

function formResult(match, teamId) {
  const isHome = match.teams?.home?.id === teamId;
  const isAway = match.teams?.away?.id === teamId;
  const homeGoals = match.goals?.home;
  const awayGoals = match.goals?.away;
  if (
    (!isHome && !isAway) ||
    homeGoals === null ||
    homeGoals === undefined ||
    awayGoals === null ||
    awayGoals === undefined
  ) {
    return null;
  }
  const teamGoals = isHome ? homeGoals : awayGoals;
  const opponentGoals = isHome ? awayGoals : homeGoals;
  if (teamGoals > opponentGoals) return "W";
  if (teamGoals < opponentGoals) return "L";
  return "D";
}

function normalizeFormMatch(match, teamId) {
  const isHome = match.teams?.home?.id === teamId;
  const opponent = isHome ? match.teams?.away : match.teams?.home;
  return {
    fixtureId: match.fixture?.id ?? null,
    date: match.fixture?.date ?? null,
    opponent: {
      id: opponent?.id ?? null,
      name: opponent?.name ?? null,
      logo: opponent?.logo ?? null,
    },
    side: isHome ? "H" : "A",
    score: {
      home: match.goals?.home ?? null,
      away: match.goals?.away ?? null,
    },
    result: formResult(match, teamId),
    league: match.league?.name ?? null,
  };
}

function normalizeH2hMatch(match) {
  return {
    fixtureId: match.fixture?.id ?? null,
    date: match.fixture?.date ?? null,
    league: match.league?.name ?? null,
    home: {
      id: match.teams?.home?.id ?? null,
      name: match.teams?.home?.name ?? null,
      logo: match.teams?.home?.logo ?? null,
    },
    away: {
      id: match.teams?.away?.id ?? null,
      name: match.teams?.away?.name ?? null,
      logo: match.teams?.away?.logo ?? null,
    },
    score: {
      home: match.goals?.home ?? null,
      away: match.goals?.away ?? null,
    },
  };
}

function normalizeStanding(row) {
  if (!row) return null;
  return {
    rank: row.rank ?? null,
    team: {
      id: row.team?.id ?? null,
      name: row.team?.name ?? null,
      logo: row.team?.logo ?? null,
    },
    played: row.all?.played ?? null,
    win: row.all?.win ?? null,
    draw: row.all?.draw ?? null,
    lose: row.all?.lose ?? null,
    goalsFor: row.all?.goals?.for ?? null,
    goalsAgainst: row.all?.goals?.against ?? null,
    goalDifference: row.goalsDiff ?? null,
    points: row.points ?? null,
    form: row.form ?? null,
  };
}

function normalizeLeague(row) {
  const league = row?.league || {};
  const country = row?.country || {};
  return {
    id: league.id ?? null,
    name: league.name ?? null,
    type: league.type ?? null,
    logo: league.logo ?? null,
    country: {
      name: country.name ?? null,
      code: country.code ?? null,
      flag: country.flag ?? null,
    },
    seasons: Array.isArray(row?.seasons)
      ? row.seasons
          .map((season) => ({
            year: season.year ?? null,
            start: season.start ?? null,
            end: season.end ?? null,
            current: season.current ?? false,
          }))
          .filter((season) => season.year !== null)
          .sort((a, b) => Number(b.year) - Number(a.year))
      : [],
  };
}

function normalizeTeam(row) {
  const team = row?.team || {};
  const venue = row?.venue || {};
  return {
    id: team.id ?? null,
    name: team.name ?? null,
    code: team.code ?? null,
    country: team.country ?? null,
    founded: team.founded ?? null,
    national: team.national ?? null,
    logo: team.logo ?? null,
    venue: {
      id: venue.id ?? null,
      name: venue.name ?? null,
      address: venue.address ?? null,
      city: venue.city ?? null,
      capacity: venue.capacity ?? null,
      surface: venue.surface ?? null,
      image: venue.image ?? null,
    },
  };
}

function normalizeSquadPlayer(player) {
  return {
    id: player?.id ?? null,
    name: player?.name ?? null,
    age: player?.age ?? null,
    number: player?.number ?? null,
    position: player?.position ?? null,
    photo: player?.photo ?? null,
  };
}

function normalizeTeamStatistics(payload) {
  const fixtures = payload?.fixtures || {};
  const goalsFor = payload?.goals?.for || {};
  const goalsAgainst = payload?.goals?.against || {};
  const cleanSheet = payload?.clean_sheet || {};
  const failedToScore = payload?.failed_to_score || {};
  const total = (value) => ({
    home: value?.home ?? null,
    away: value?.away ?? null,
    total: value?.total ?? null,
  });
  return {
    league: {
      id: payload?.league?.id ?? null,
      name: payload?.league?.name ?? null,
      logo: payload?.league?.logo ?? null,
      country: payload?.league?.country ?? null,
      season: payload?.league?.season ?? null,
    },
    team: {
      id: payload?.team?.id ?? null,
      name: payload?.team?.name ?? null,
      logo: payload?.team?.logo ?? null,
    },
    played: total(fixtures.played),
    wins: total(fixtures.wins),
    draws: total(fixtures.draws),
    losses: total(fixtures.loses),
    goalsFor: {
      total: total(goalsFor.total),
      average: total(goalsFor.average),
    },
    goalsAgainst: {
      total: total(goalsAgainst.total),
      average: total(goalsAgainst.average),
    },
    cleanSheets: total(cleanSheet),
    failedToScore: total(failedToScore),
  };
}

function normalizePlayer(row) {
  const player = row?.player || {};
  const statistics = Array.isArray(row?.statistics) ? row.statistics : [];
  const firstStatistics = statistics[0] || {};
  const games = firstStatistics.games || {};
  const goals = firstStatistics.goals || {};
  const shots = firstStatistics.shots || {};
  const passes = firstStatistics.passes || {};
  const cards = firstStatistics.cards || {};

  return {
    id: player.id ?? null,
    name: player.name ?? null,
    firstname: player.firstname ?? null,
    lastname: player.lastname ?? null,
    age: player.age ?? null,
    nationality: player.nationality ?? null,
    birth: {
      date: player.birth?.date ?? null,
      place: player.birth?.place ?? null,
      country: player.birth?.country ?? null,
    },
    height: player.height ?? null,
    weight: player.weight ?? null,
    injured: player.injured ?? null,
    photo: player.photo ?? null,
    position: games.position ?? null,
    team: {
      id: firstStatistics.team?.id ?? null,
      name: firstStatistics.team?.name ?? null,
      logo: firstStatistics.team?.logo ?? null,
    },
    league: {
      id: firstStatistics.league?.id ?? null,
      name: firstStatistics.league?.name ?? null,
      season: firstStatistics.league?.season ?? null,
    },
    appearances: games.appearences ?? null,
    lineups: games.lineups ?? null,
    minutes: games.minutes ?? null,
    rating: games.rating ?? null,
    goals: goals.total ?? null,
    assists: goals.assists ?? null,
    shots: shots.total ?? null,
    shotsOn: shots.on ?? null,
    passes: passes.total ?? null,
    keyPasses: passes.key ?? null,
    yellowCards: cards.yellow ?? null,
    redCards: cards.red ?? null,
    statistics: statistics.map((stat) => ({
      team: {
        id: stat.team?.id ?? null,
        name: stat.team?.name ?? null,
        logo: stat.team?.logo ?? null,
      },
      league: {
        id: stat.league?.id ?? null,
        name: stat.league?.name ?? null,
        logo: stat.league?.logo ?? null,
        country: stat.league?.country ?? null,
        season: stat.league?.season ?? null,
      },
      position: stat.games?.position ?? null,
      appearances: stat.games?.appearences ?? null,
      lineups: stat.games?.lineups ?? null,
      minutes: stat.games?.minutes ?? null,
      number: stat.games?.number ?? null,
      rating: stat.games?.rating ?? null,
      captain: stat.games?.captain ?? null,
      substitutesIn: stat.substitutes?.in ?? null,
      substitutesOut: stat.substitutes?.out ?? null,
      substitutesBench: stat.substitutes?.bench ?? null,
      shots: {
        total: stat.shots?.total ?? null,
        on: stat.shots?.on ?? null,
      },
      goals: {
        total: stat.goals?.total ?? null,
        conceded: stat.goals?.conceded ?? null,
        assists: stat.goals?.assists ?? null,
        saves: stat.goals?.saves ?? null,
      },
      passes: {
        total: stat.passes?.total ?? null,
        key: stat.passes?.key ?? null,
        accuracy: stat.passes?.accuracy ?? null,
      },
      tackles: {
        total: stat.tackles?.total ?? null,
        blocks: stat.tackles?.blocks ?? null,
        interceptions: stat.tackles?.interceptions ?? null,
      },
      duels: {
        total: stat.duels?.total ?? null,
        won: stat.duels?.won ?? null,
      },
      dribbles: {
        attempts: stat.dribbles?.attempts ?? null,
        success: stat.dribbles?.success ?? null,
        past: stat.dribbles?.past ?? null,
      },
      fouls: {
        drawn: stat.fouls?.drawn ?? null,
        committed: stat.fouls?.committed ?? null,
      },
      cards: {
        yellow: stat.cards?.yellow ?? null,
        yellowRed: stat.cards?.yellowred ?? null,
        red: stat.cards?.red ?? null,
      },
      penalties: {
        won: stat.penalty?.won ?? null,
        committed: stat.penalty?.commited ?? null,
        scored: stat.penalty?.scored ?? null,
        missed: stat.penalty?.missed ?? null,
        saved: stat.penalty?.saved ?? null,
      },
    })),
  };
}

function normalizePlayerTeam(row) {
  return {
    team: {
      id: row?.team?.id ?? null,
      name: row?.team?.name ?? null,
      logo: row?.team?.logo ?? null,
    },
    seasons: Array.isArray(row?.seasons)
      ? row.seasons
          .filter((season) => Number.isInteger(Number(season)))
          .map(Number)
          .sort((a, b) => b - a)
      : [],
  };
}

function normalizeLeaderboardPlayer(row, rank) {
  const player = row?.player || {};
  const statistics = row?.statistics?.[0] || {};
  return {
    rank,
    player: {
      id: player.id ?? null,
      name: player.name ?? null,
      photo: player.photo ?? null,
      nationality: player.nationality ?? null,
    },
    team: {
      id: statistics.team?.id ?? null,
      name: statistics.team?.name ?? null,
      logo: statistics.team?.logo ?? null,
    },
    appearances: statistics.games?.appearences ?? null,
    minutes: statistics.games?.minutes ?? null,
    rating: statistics.games?.rating ?? null,
    goals: statistics.goals?.total ?? null,
    assists: statistics.goals?.assists ?? null,
    shots: statistics.shots?.total ?? null,
    passes: statistics.passes?.total ?? null,
    penalties: statistics.penalty?.scored ?? null,
    yellowCards: statistics.cards?.yellow ?? null,
    yellowRedCards: statistics.cards?.yellowred ?? null,
    redCards: statistics.cards?.red ?? null,
  };
}

const statisticsLeaderEndpoints = {
  scorers: "/players/topscorers",
  assists: "/players/topassists",
  yellow: "/players/topyellowcards",
  red: "/players/topredcards",
};

function normalizeOdds(oddsResponse) {
  const rows = [];
  const preferredMarkets = new Set([
    "match winner",
    "goals over/under",
    "both teams score",
    "double chance",
  ]);
  for (const fixtureOdds of oddsResponse || []) {
    for (const bookmaker of fixtureOdds.bookmakers || []) {
      for (const market of bookmaker.bets || []) {
        for (const option of market.values || []) {
          rows.push({
            bookmaker: bookmaker.name ?? null,
            market: market.name ?? null,
            option: option.value ?? null,
            odd: option.odd ?? null,
          });
        }
      }
    }
  }
  const preferred = rows.filter((row) =>
    preferredMarkets.has(String(row.market || "").toLowerCase()),
  );
  return (preferred.length ? preferred : rows).slice(0, 24);
}

function normalizePrediction(prediction) {
  const data = prediction?.predictions;
  if (!data) return null;
  return {
    winner: data.winner?.name ?? null,
    winnerComment: data.winner?.comment ?? null,
    advice: data.advice ?? null,
    percent: {
      home: data.percent?.home ?? null,
      draw: data.percent?.draw ?? null,
      away: data.percent?.away ?? null,
    },
    goals: {
      home: data.goals?.home ?? null,
      away: data.goals?.away ?? null,
    },
    underOver: data.under_over ?? null,
  };
}

const statisticLabels = new Map([
  ["ball possession", "Владение"],
  ["total shots", "Удары"],
  ["shots on goal", "В створ"],
  ["shots off goal", "Мимо ворот"],
  ["blocked shots", "Заблокированные удары"],
  ["shots insidebox", "Удары из штрафной"],
  ["shots outsidebox", "Удары из-за штрафной"],
  ["corner kicks", "Угловые"],
  ["offsides", "Офсайды"],
  ["fouls", "Фолы"],
  ["yellow cards", "Жёлтые карточки"],
  ["red cards", "Красные карточки"],
  ["goalkeeper saves", "Сейвы вратаря"],
  ["total passes", "Передачи"],
  ["passes accurate", "Точные передачи"],
  ["passes %", "Точность передач"],
  ["expected_goals", "Ожидаемые голы (xG)"],
]);

const statisticPriority = Array.from(statisticLabels.keys());

function normalizeStatisticValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return {
      display: String(value),
      numeric: value,
      isPercentage: false,
    };
  }

  const display = String(value).trim();
  if (!display) return null;
  const isPercentage = display.endsWith("%");
  const numericText = isPercentage ? display.slice(0, -1).trim() : display;
  const numericValue = Number(numericText.replace(",", "."));
  return {
    display,
    numeric: Number.isFinite(numericValue) ? numericValue : null,
    isPercentage,
  };
}

function normalizeFixtureStatistics(statisticsResponse, fixtureData) {
  const findTeam = (team) =>
    (statisticsResponse || []).find(
      (entry) =>
        entry?.team?.id === team.id ||
        (entry?.team?.name &&
          team.name &&
          entry.team.name.toLowerCase() === team.name.toLowerCase()),
    );
  const homeEntry = findTeam(fixtureData.home);
  const awayEntry = findTeam(fixtureData.away);

  const toStatisticMap = (entry) => {
    const map = new Map();
    for (const statistic of entry?.statistics || []) {
      const type = String(statistic?.type || "").trim();
      if (!type) continue;
      const key = type.toLowerCase();
      map.set(key, {
        type,
        value: normalizeStatisticValue(statistic?.value),
      });
    }
    return map;
  };

  const homeStatistics = toStatisticMap(homeEntry);
  const awayStatistics = toStatisticMap(awayEntry);
  const upstreamOrder = [
    ...homeStatistics.keys(),
    ...awayStatistics.keys(),
  ].filter((key, index, values) => values.indexOf(key) === index);
  const orderedKeys = [
    ...statisticPriority.filter(
      (key) => homeStatistics.has(key) || awayStatistics.has(key),
    ),
    ...upstreamOrder.filter((key) => !statisticPriority.includes(key)),
  ];

  const rows = orderedKeys
    .map((key) => {
      const home = homeStatistics.get(key);
      const away = awayStatistics.get(key);
      return {
        type: home?.type || away?.type || key,
        label: statisticLabels.get(key) || home?.type || away?.type || key,
        home: home?.value || null,
        away: away?.value || null,
      };
    })
    .filter((row) => row.home !== null || row.away !== null);

  return {
    home: {
      id: fixtureData.home.id,
      name: fixtureData.home.name,
      logo: fixtureData.home.logo,
    },
    away: {
      id: fixtureData.away.id,
      name: fixtureData.away.name,
      logo: fixtureData.away.logo,
    },
    rows,
  };
}

function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeFixtureEvents(eventsResponse) {
  return (eventsResponse || [])
    .map((event, index) => ({
      elapsed: nullableNumber(event?.time?.elapsed),
      extra: nullableNumber(event?.time?.extra),
      team: {
        id: event?.team?.id ?? null,
        name: nullableText(event?.team?.name),
        logo: nullableText(event?.team?.logo),
      },
      player: {
        id: event?.player?.id ?? null,
        name: nullableText(event?.player?.name),
      },
      assist: {
        id: event?.assist?.id ?? null,
        name: nullableText(event?.assist?.name),
      },
      type: nullableText(event?.type),
      detail: nullableText(event?.detail),
      comments: nullableText(event?.comments),
      order: index,
    }))
    .filter(
      (event) =>
        event.elapsed !== null ||
        event.team.id !== null ||
        event.player.name !== null ||
        event.type !== null ||
        event.detail !== null ||
        event.comments !== null,
    )
    .sort((first, second) => {
      const firstMinute = first.elapsed ?? Number.MAX_SAFE_INTEGER;
      const secondMinute = second.elapsed ?? Number.MAX_SAFE_INTEGER;
      if (firstMinute !== secondMinute) return firstMinute - secondMinute;
      const firstExtra = first.extra ?? 0;
      const secondExtra = second.extra ?? 0;
      if (firstExtra !== secondExtra) return firstExtra - secondExtra;
      return first.order - second.order;
    })
    .map(({ order: _order, ...event }) => event);
}

function normalizeLineupPlayer(entry) {
  const player = entry?.player;
  return {
    id: nullableNumber(player?.id),
    name: nullableText(player?.name),
    number: nullableNumber(player?.number),
    position: nullableText(player?.pos),
    grid: nullableText(player?.grid),
  };
}

function normalizeTeamLineup(entry, fixtureTeam) {
  if (!entry) return null;
  return {
    team: {
      id: nullableNumber(entry?.team?.id ?? fixtureTeam?.id),
      name: nullableText(entry?.team?.name) ?? fixtureTeam?.name ?? null,
      logo: nullableText(entry?.team?.logo) ?? fixtureTeam?.logo ?? null,
    },
    formation: nullableText(entry?.formation),
    coach: {
      id: nullableNumber(entry?.coach?.id),
      name: nullableText(entry?.coach?.name),
      photo: nullableText(entry?.coach?.photo),
    },
    startXI: Array.isArray(entry?.startXI)
      ? entry.startXI.map(normalizeLineupPlayer)
      : [],
    substitutes: Array.isArray(entry?.substitutes)
      ? entry.substitutes.map(normalizeLineupPlayer)
      : [],
  };
}

function normalizeFixtureLineups(lineupsResponse, fixtureData) {
  const findLineup = (team) =>
    (lineupsResponse || []).find(
      (entry) =>
        entry?.team?.id === team.id ||
        (entry?.team?.name &&
          team.name &&
          entry.team.name.toLowerCase() === team.name.toLowerCase()),
    );
  return {
    home: normalizeTeamLineup(findLineup(fixtureData.home), fixtureData.home),
    away: normalizeTeamLineup(findLineup(fixtureData.away), fixtureData.away),
  };
}

function riskFromSources(sources) {
  const totalSources = Object.keys(sources).length;
  const knownValues = Object.values(sources).filter(
    (value) => value === true || value === false,
  );
  const availableSources = knownValues.filter(Boolean).length;
  const knownSources = knownValues.length;
  const score =
    knownSources === 0
      ? 0
      : Math.round(((knownSources - availableSources) / knownSources) * 100);
  return {
    score,
    level:
      score <= 33
        ? "LOW DATA RISK"
        : score <= 66
          ? "MEDIUM DATA RISK"
          : "HIGH DATA RISK",
    availableSources,
    totalSources,
    knownSources,
  };
}

function matchDataIntegrityState(upstreamCount, normalizedCount) {
  if (normalizedCount > 0) return "available";
  if (upstreamCount === 0) return "provider_empty";
  return "normalization_failed";
}

function fixtureCacheTtl(statusShort) {
  if (["FT", "AET", "PEN"].includes(statusShort)) {
    return 24 * 60 * 60 * 1000;
  }
  if (
    ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(
      statusShort,
    )
  ) {
    return 5 * 60 * 1000;
  }
  return 30 * 60 * 1000;
}

function statisticsCacheTtl(statusShort) {
  if (["FT", "AET", "PEN"].includes(statusShort)) {
    return 24 * 60 * 60 * 1000;
  }
  if (
    ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(
      statusShort,
    )
  ) {
    return 5 * 60 * 1000;
  }
  return 15 * 60 * 1000;
}

function eventsCacheTtl(statusShort) {
  if (["FT", "AET", "PEN"].includes(statusShort)) {
    return 24 * 60 * 60 * 1000;
  }
  if (
    ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(
      statusShort,
    )
  ) {
    return 2 * 60 * 1000;
  }
  return 15 * 60 * 1000;
}

function lineupsCacheTtl(statusShort) {
  if (["FT", "AET", "PEN"].includes(statusShort)) {
    return 24 * 60 * 60 * 1000;
  }
  if (
    ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(
      statusShort,
    )
  ) {
    return 30 * 60 * 1000;
  }
  return 15 * 60 * 1000;
}

function cachedValue(key) {
  const entry = dataCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    dataCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedValue(key, value, ttl) {
  dataCache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
  return value;
}

async function fetchApiFootball(pathname, parameters, counter) {
  const payload = await fetchApiFootballPayload(pathname, parameters, counter);
  return payload.response;
}

function rateLimitFromHeaders(headers) {
  const parseHeader = (name) => {
    const value = headers.get(name);
    if (value === null || value === "") return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    limit: parseHeader("x-ratelimit-requests-limit"),
    remaining: parseHeader("x-ratelimit-requests-remaining"),
  };
}

async function fetchApiFootballPayload(pathname, parameters, counter) {
  const url = new URL(`${apiFootballBaseUrl}${pathname}`);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const requestKey = url.toString();
  const existing = apiFootballInflight.get(requestKey);
  if (existing) return existing;
  counter.count += 1;
  const request = (async () => {
    const upstreamResponse = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "x-apisports-key": apiFootballKey,
      },
    });
    const payload = await upstreamResponse.json();
    if (
      !upstreamResponse.ok ||
      (payload.errors && Object.keys(payload.errors).length > 0)
    ) {
      throw new Error("API-Football вернул ошибку.");
    }
    return {
      response: payload.response ?? [],
      paging: payload.paging ?? null,
      rateLimit: rateLimitFromHeaders(upstreamResponse.headers),
    };
  })().finally(() => {
    apiFootballInflight.delete(requestKey);
  });
  apiFootballInflight.set(requestKey, request);
  return request;
}

function normalizeFixtureDetails(match) {
  return {
    fixture: {
      id: match.fixture?.id ?? null,
      date: match.fixture?.date ?? null,
      timestamp: match.fixture?.timestamp ?? null,
      status: {
        short: match.fixture?.status?.short ?? null,
        long: match.fixture?.status?.long ?? null,
        elapsed: match.fixture?.status?.elapsed ?? null,
      },
      venue: match.fixture?.venue?.name ?? null,
    },
    league: {
      id: match.league?.id ?? null,
      name: match.league?.name ?? null,
      country: match.league?.country ?? null,
      logo: match.league?.logo ?? null,
      season: match.league?.season ?? null,
      round: match.league?.round ?? null,
    },
    home: {
      id: match.teams?.home?.id ?? null,
      name: match.teams?.home?.name ?? null,
      logo: match.teams?.home?.logo ?? null,
      winner: match.teams?.home?.winner ?? null,
    },
    away: {
      id: match.teams?.away?.id ?? null,
      name: match.teams?.away?.name ?? null,
      logo: match.teams?.away?.logo ?? null,
      winner: match.teams?.away?.winner ?? null,
    },
    score: {
      home: match.goals?.home ?? null,
      away: match.goals?.away ?? null,
    },
  };
}

async function getFixtureDetails(fixtureId, counter) {
  const key = `fixture:${fixtureId}`;
  const cached = cachedValue(key);
  if (cached !== undefined) return cached;
  const matches = await fetchApiFootball("/fixtures", { id: fixtureId }, counter);
  if (!matches[0]) return null;
  const normalized = normalizeFixtureDetails(matches[0]);
  return setCachedValue(
    key,
    normalized,
    fixtureCacheTtl(normalized.fixture.status.short),
  );
}

function positiveInteger(value) {
  const raw = String(value || "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function queryText(value, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength);
}

function apiMeta(counter, rateLimit = null) {
  return {
    apiRequestCount: counter.count,
    ...(rateLimit ? { rateLimit } : {}),
  };
}

function sortByName(rows) {
  return rows.sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "ru"),
  );
}

const newsCategories = new Set([
  "latest",
  "transfers",
  "matches",
  "leagues",
  "teams",
]);
const newsCacheTtlMs = 5 * 60 * 1000;

// Provider boundary for a future news integration. UI contracts remain stable
// when this adapter is replaced with a configured provider implementation.
const newsDataAdapter = {
  provider: null,
  status: "not_configured",
  async list() {
    return [];
  },
  async getById() {
    return null;
  },
};

function newsProviderMetadata() {
  return {
    provider: newsDataAdapter.provider,
    status: newsDataAdapter.status,
    configured: newsDataAdapter.status === "configured",
  };
}

function requireApiKey(response) {
  if (apiFootballKey) return true;
  response.status(503).json({
    error: {
      code: "MISSING_API_KEY",
      message:
        "Сервис API-Football не настроен: добавьте API_FOOTBALL_KEY в environment variables.",
    },
  });
  return false;
}

app.get("/health", (_request, response) => {
  return response.json({
    status: "ok",
    service: "almazstat",
  });
});

app.get("/api/leagues", async (request, response) => {
  const search = queryText(request.query.search);
  const country = queryText(request.query.country);
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `leagues:${search}:${country}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/leagues",
        { search, country },
        counter,
      );
      const leagues = payload.response
        .map(normalizeLeague)
        .filter((league) => league.id !== null);
      result = { leagues: sortByName(leagues) };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football leagues request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить список лиг.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/leagues/:leagueId", async (request, response) => {
  const leagueId = positiveInteger(request.params.leagueId);
  if (!leagueId) {
    return response.status(400).json({
      error: { code: "INVALID_LEAGUE", message: "Укажите корректный ID лиги." },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `league:${leagueId}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/leagues",
        { id: leagueId },
        counter,
      );
      const league = normalizeLeague(payload.response[0]);
      if (!league.id) {
        return response.status(404).json({
          error: { code: "LEAGUE_NOT_FOUND", message: "Лига не найдена." },
        });
      }
      result = { league };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football league request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить данные лиги.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/leagues/:leagueId/fixtures", async (request, response) => {
  const leagueId = positiveInteger(request.params.leagueId);
  const season = positiveInteger(request.query.season);
  if (!leagueId || !season) {
    return response.status(400).json({
      error: {
        code: "INVALID_LEAGUE_FIXTURES_QUERY",
        message: "Укажите корректные league и season.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `league:fixtures:${leagueId}:${season}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/fixtures",
        { league: leagueId, season },
        counter,
      );
      const fixtures = payload.response
        .map(normalizeMatch)
        .filter((fixture) => fixture.fixtureId !== null)
        .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
      result = { league: leagueId, season, fixtures };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 5 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football league fixtures request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить матчи лиги.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/leagues/:leagueId/standings", async (request, response) => {
  const leagueId = positiveInteger(request.params.leagueId);
  const season = positiveInteger(request.query.season);
  if (!leagueId || !season) {
    return response.status(400).json({
      error: {
        code: "INVALID_LEAGUE_STANDINGS_QUERY",
        message: "Укажите корректные league и season.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `league:standings:${leagueId}:${season}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/standings",
        { league: leagueId, season },
        counter,
      );
      const rawGroups = payload.response[0]?.league?.standings;
      const groups = Array.isArray(rawGroups)
        ? rawGroups
            .map((rows, index) => {
              const normalizedRows = Array.isArray(rows)
                ? rows.map(normalizeStanding).filter(Boolean)
                : [];
              return {
                name: rows?.[0]?.group || `Группа ${index + 1}`,
                rows: normalizedRows,
              };
            })
            .filter((group) => group.rows.length > 0)
        : [];
      result = { league: leagueId, season, groups };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 15 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football league standings request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить таблицу лиги.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/teams", async (request, response) => {
  const search = queryText(request.query.search);
  const league = positiveInteger(request.query.league);
  const season = positiveInteger(request.query.season);
  if (!search && !(league && season)) {
    return response.status(400).json({
      error: {
        code: "MISSING_TEAM_QUERY",
        message: "Введите название команды или укажите league и season.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `teams:${search}:${league || ""}:${season || ""}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/teams",
        { search, league, season },
        counter,
      );
      const teams = payload.response
        .map(normalizeTeam)
        .filter((team) => team.id !== null);
      result = { teams: sortByName(teams) };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 30 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football teams request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить список команд.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/teams/:teamId", async (request, response) => {
  const teamId = positiveInteger(request.params.teamId);
  if (!teamId) {
    return response.status(400).json({
      error: { code: "INVALID_TEAM", message: "Укажите корректный ID команды." },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `team:${teamId}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/teams",
        { id: teamId },
        counter,
      );
      const team = normalizeTeam(payload.response[0]);
      if (!team.id) {
        return response.status(404).json({
          error: { code: "TEAM_NOT_FOUND", message: "Команда не найдена." },
        });
      }
      result = { team };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football team request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить данные команды.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/teams/:teamId/context", async (request, response) => {
  const teamId = positiveInteger(request.params.teamId);
  if (!teamId) {
    return response.status(400).json({
      error: { code: "INVALID_TEAM", message: "Укажите корректный ID команды." },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `team:context:${teamId}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/leagues",
        { team: teamId, current: "true" },
        counter,
      );
      const competitions = payload.response
        .map(normalizeLeague)
        .filter((league) => league.id !== null && league.seasons.length > 0);
      result = { team: teamId, competitions };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football team context request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось определить текущий турнир команды.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/teams/:teamId/fixtures", async (request, response) => {
  const teamId = positiveInteger(request.params.teamId);
  const league = positiveInteger(request.query.league);
  const season = positiveInteger(request.query.season);
  if (!teamId || !league || !season) {
    return response.status(400).json({
      error: {
        code: "INVALID_TEAM_FIXTURES_QUERY",
        message: "Укажите корректные team, league и season.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `team:fixtures:${teamId}:${league}:${season}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/fixtures",
        { team: teamId, league, season },
        counter,
      );
      const rawFixtures = payload.response
        .filter(
          (fixture) =>
            fixture.teams?.home?.id === teamId ||
            fixture.teams?.away?.id === teamId,
        )
        .sort(
          (a, b) =>
            Number(a.fixture?.timestamp || 0) -
            Number(b.fixture?.timestamp || 0),
        );
      result = {
        team: teamId,
        league,
        season,
        fixtures: rawFixtures
          .map(normalizeMatch)
          .filter((fixture) => fixture.fixtureId !== null),
        form: rawFixtures
          .filter((fixture) =>
            ["FT", "AET", "PEN"].includes(fixture.fixture?.status?.short),
          )
          .slice(-10)
          .reverse()
          .map((fixture) => normalizeFormMatch(fixture, teamId)),
      };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 5 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football team fixtures request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить матчи команды.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/teams/:teamId/squad", async (request, response) => {
  const teamId = positiveInteger(request.params.teamId);
  if (!teamId) {
    return response.status(400).json({
      error: { code: "INVALID_TEAM", message: "Укажите корректный ID команды." },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `team:squad:${teamId}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/players/squads",
        { team: teamId },
        counter,
      );
      const squad = Array.isArray(payload.response[0]?.players)
        ? payload.response[0].players
            .map(normalizeSquadPlayer)
            .filter((player) => player.id !== null)
        : [];
      result = { team: teamId, squad };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football team squad request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить состав команды.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/teams/:teamId/statistics", async (request, response) => {
  const teamId = positiveInteger(request.params.teamId);
  const league = positiveInteger(request.query.league);
  const season = positiveInteger(request.query.season);
  if (!teamId || !league || !season) {
    return response.status(400).json({
      error: {
        code: "INVALID_TEAM_STATISTICS_QUERY",
        message: "Укажите корректные team, league и season.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `team:statistics:${teamId}:${league}:${season}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/teams/statistics",
        { team: teamId, league, season },
        counter,
      );
      const statistics = payload.response?.team?.id
        ? normalizeTeamStatistics(payload.response)
        : null;
      result = { team: teamId, league, season, statistics };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 15 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football team statistics request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить статистику команды.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/players", async (request, response) => {
  const search = queryText(request.query.search);
  const team = positiveInteger(request.query.team);
  const league = positiveInteger(request.query.league);
  const season = positiveInteger(request.query.season);
  const page = positiveInteger(request.query.page) || 1;
  if (!search && !team && !league) {
    return response.status(400).json({
      error: {
        code: "MISSING_PLAYER_QUERY",
        message: "Введите имя игрока или укажите team/league.",
      },
    });
  }
  if (search && search.length < 3) {
    return response.status(400).json({
      error: {
        code: "INVALID_PLAYER_SEARCH",
        message: "Введите минимум 3 символа для поиска игрока.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const profileSearch = Boolean(search && !team && !league && !season);
  const cacheKey = `players:${profileSearch ? "profiles" : "statistics"}:${search}:${team || ""}:${league || ""}:${season || ""}:${page}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        profileSearch ? "/players/profiles" : "/players",
        profileSearch
          ? { search, page }
          : { search, team, league, season, page },
        counter,
      );
      const players = payload.response
        .map(normalizePlayer)
        .filter((player) => player.id !== null);
      result = { players, paging: payload.paging };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 30 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football players request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить список игроков.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/players/:playerId", async (request, response) => {
  const playerId = positiveInteger(request.params.playerId);
  if (!playerId) {
    return response.status(400).json({
      error: { code: "INVALID_PLAYER", message: "Укажите корректный ID игрока." },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `player:profile:${playerId}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/players/profiles",
        { player: playerId },
        counter,
      );
      const player = normalizePlayer(payload.response[0]);
      if (!player.id) {
        return response.status(404).json({
          error: { code: "PLAYER_NOT_FOUND", message: "Игрок не найден." },
        });
      }
      result = { player };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football player request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить данные игрока.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/players/:playerId/context", async (request, response) => {
  const playerId = positiveInteger(request.params.playerId);
  if (!playerId) {
    return response.status(400).json({
      error: { code: "INVALID_PLAYER", message: "Укажите корректный ID игрока." },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `player:context:${playerId}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/players/teams",
        { player: playerId },
        counter,
      );
      const teams = payload.response
        .map(normalizePlayerTeam)
        .filter((row) => row.team.id !== null && row.seasons.length > 0);
      const seasons = [...new Set(teams.flatMap((row) => row.seasons))].sort(
        (a, b) => b - a,
      );
      result = { player: playerId, teams, seasons };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 6 * 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football player context request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось определить доступные сезоны игрока.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/players/:playerId/statistics", async (request, response) => {
  const playerId = positiveInteger(request.params.playerId);
  const season = positiveInteger(request.query.season);
  if (!playerId || !season) {
    return response.status(400).json({
      error: {
        code: "INVALID_PLAYER_STATISTICS_QUERY",
        message: "Укажите корректные player и season.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `player:statistics:${playerId}:${season}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/players",
        { id: playerId, season },
        counter,
      );
      const player = payload.response[0]
        ? normalizePlayer(payload.response[0])
        : null;
      result = {
        player: playerId,
        season,
        statistics: player?.statistics || [],
        context: player
          ? {
              team: player.team,
              league: player.league,
              position: player.position,
            }
          : null,
      };
      rateLimit = payload.rateLimit;
      setCachedValue(cacheKey, result, 60 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football player statistics request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить статистику игрока.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/statistics", async (request, response) => {
  const league = positiveInteger(request.query.league);
  const season = positiveInteger(request.query.season);
  const category = queryText(request.query.category) || "scorers";
  if (!league || !season) {
    return response.status(400).json({
      error: {
        code: "MISSING_STATISTICS_QUERY",
        message: "Укажите league и season для загрузки статистики.",
      },
    });
  }
  if (!statisticsLeaderEndpoints[category] && category !== "cards") {
    return response.status(400).json({
      error: {
        code: "INVALID_STATISTICS_CATEGORY",
        message: "Укажите поддерживаемую категорию статистики.",
      },
    });
  }
  if (!requireApiKey(response)) return;

  const counter = { count: 0 };
  const cacheKey = `statistics:${category}:${league}:${season}`;
  try {
    let result = cachedValue(cacheKey);
    let rateLimit = null;
    if (result === undefined) {
      if (category === "cards") {
        const [yellowPayload, redPayload] = await Promise.all([
          fetchApiFootballPayload(
            statisticsLeaderEndpoints.yellow,
            { league, season },
            counter,
          ),
          fetchApiFootballPayload(
            statisticsLeaderEndpoints.red,
            { league, season },
            counter,
          ),
        ]);
        result = {
          competition: league,
          season,
          category,
          yellow: yellowPayload.response
            .map((row, index) => normalizeLeaderboardPlayer(row, index + 1))
            .filter((row) => row.player.id !== null),
          red: redPayload.response
            .map((row, index) => normalizeLeaderboardPlayer(row, index + 1))
            .filter((row) => row.player.id !== null),
        };
        rateLimit = redPayload.rateLimit || yellowPayload.rateLimit;
      } else {
        const payload = await fetchApiFootballPayload(
          statisticsLeaderEndpoints[category],
          { league, season },
          counter,
        );
        const leaders = payload.response
          .map((row, index) => normalizeLeaderboardPlayer(row, index + 1))
          .filter((row) => row.player.id !== null);
        result = {
          competition: league,
          season,
          category,
          leaders,
          ...(category === "scorers" ? { scorers: leaders } : {}),
        };
        rateLimit = payload.rateLimit;
      }
      setCachedValue(cacheKey, result, 15 * 60 * 1000);
    }
    return response.json({
      ...result,
      source: "API-Football",
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football statistics request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить статистику.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/news", async (request, response) => {
  const search = queryText(request.query.search, 80);
  const requestedCategory = queryText(request.query.category);
  const category = newsCategories.has(requestedCategory)
    ? requestedCategory
    : "latest";
  const cacheKey = `news:${category}:${search.toLocaleLowerCase("ru-RU")}`;
  try {
    let result = cachedValue(cacheKey);
    if (result === undefined) {
      const items = await newsDataAdapter.list({ search, category });
      result = {
        items: Array.isArray(items) ? items : [],
        total: Array.isArray(items) ? items.length : 0,
      };
      setCachedValue(cacheKey, result, newsCacheTtlMs);
    }
    return response.json({
      ...result,
      category,
      search,
      provider: newsProviderMetadata(),
      meta: {
        externalRequestCount: 0,
        cacheTtlMs: newsCacheTtlMs,
      },
    });
  } catch (error) {
    console.error("News provider request failed:", error);
    return response.status(502).json({
      error: {
        code: "NEWS_UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить новости.",
      },
      provider: newsProviderMetadata(),
      meta: { externalRequestCount: 0 },
    });
  }
});

app.get("/api/news/:articleId", async (request, response) => {
  const articleId = queryText(request.params.articleId, 160);
  if (!articleId) {
    return response.status(400).json({
      error: {
        code: "INVALID_NEWS_ID",
        message: "Укажите корректный ID новости.",
      },
    });
  }
  const cacheKey = `news:article:${articleId}`;
  try {
    let result = cachedValue(cacheKey);
    if (result === undefined) {
      const article = await newsDataAdapter.getById(articleId);
      result = { article: article || null };
      setCachedValue(cacheKey, result, newsCacheTtlMs);
    }
    return response.json({
      ...result,
      provider: newsProviderMetadata(),
      meta: {
        externalRequestCount: 0,
        cacheTtlMs: newsCacheTtlMs,
      },
    });
  } catch (error) {
    console.error("News article provider request failed:", error);
    return response.status(502).json({
      error: {
        code: "NEWS_UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить новость.",
      },
      provider: newsProviderMetadata(),
      meta: { externalRequestCount: 0 },
    });
  }
});

app.get("/api/matches", async (request, response) => {
  const date = String(request.query.date || serverDate()).trim();

  if (!isValidDate(date)) {
    return response.status(400).json({
      error: {
        code: "INVALID_DATE",
        message: "Дата должна быть в формате YYYY-MM-DD.",
      },
    });
  }

  if (!sportmonksToken && !apiFootballKey) {
    return response.status(503).json({
      error: {
        code: "FOOTBALL_PROVIDER_NOT_CONFIGURED",
        message: "Источник футбольных данных не настроен.",
      },
    });
  }

  const counter = { count: 0 };
  try {
    const cacheKey = `matches:${date}:provider-v2`;
    const cachedMatches = cachedValue(cacheKey);
    if (cachedMatches !== undefined) {
      return response.json({
        date,
        matches: cachedMatches.matches,
        provider: cachedMatches.provider,
        apiRequestCount: 0,
      });
    }

    if (sportmonksToken) {
      try {
        const result = await sportmonksProvider.fixturesByDate(date);
        const matches = Array.isArray(result.matches) ? result.matches : [];
        const hasLiveMatches = matches.some((match) =>
          ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(
            match.status?.short,
          ),
        );
        setCachedValue(
          cacheKey,
          { matches, provider: "sportmonks" },
          hasLiveMatches ? 60 * 1000 : 10 * 60 * 1000,
        );
        return response.json({
          date,
          matches,
          provider: "sportmonks",
          apiRequestCount: 1,
        });
      } catch (error) {
        console.error("Sportmonks matches request failed:", error?.message || error);
        if (!apiFootballKey) throw error;
      }
    }

    const payload = await fetchApiFootballPayload("/fixtures", { date }, counter);
    const matches = Array.isArray(payload.response)
      ? payload.response
          .map(normalizeMatch)
          .filter((match) => match.fixtureId !== null)
      : [];
    const hasLiveMatches = matches.some((match) =>
      ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(
        match.status.short,
      ),
    );
    setCachedValue(
      cacheKey,
      { matches, provider: "api-football" },
      hasLiveMatches ? 60 * 1000 : 10 * 60 * 1000,
    );

    return response.json({
      date,
      matches,
      provider: "api-football",
      apiRequestCount: counter.count,
    });
  } catch (error) {
    console.error("Football matches request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось загрузить матчи.",
      },
    });
  }
});

app.get("/api/match", async (request, response) => {
  const fixture = String(request.query.fixture || "").trim();

  if (!fixture) {
    return response.status(400).json({
      error: {
        code: "MISSING_FIXTURE",
        message: "Необходимо передать fixture ID в query parameter.",
      },
    });
  }

  if (!sportmonksToken && !apiFootballKey) {
    return response.status(503).json({
      error: {
        code: "FOOTBALL_PROVIDER_NOT_CONFIGURED",
        message: "Источник футбольных данных не настроен.",
      },
    });
  }

  if (sportmonksToken) {
    try {
      const result = await sportmonksProvider.fixtureById(fixture);
      if (result?.fixture) {
        const sources = {
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
        return response.json({
          ...result.fixture,
          prediction: null,
          sources,
          risk: riskFromSources(sources),
          provider: "sportmonks",
          meta: { apiRequestCount: 1 },
        });
      }
    } catch (error) {
      console.error("Sportmonks fixture request failed:", error?.message || error);
      if (!apiFootballKey) {
        return response.status(502).json({
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "Не удалось связаться со Sportmonks.",
          },
        });
      }
    }
  }

  if (!apiFootballKey) {
    return response.status(404).json({
      error: {
        code: "FIXTURE_NOT_FOUND",
        message: "Матч с указанным fixture ID не найден.",
      },
    });
  }

  try {
    const counter = { count: 0 };
    const fixtureData = await getFixtureDetails(fixture, counter);
    if (!fixtureData) {
      return response.status(404).json({
        error: {
          code: "FIXTURE_NOT_FOUND",
          message: "Матч с указанным fixture ID не найден.",
        },
      });
    }

    const predictionKey = `prediction:${fixture}`;
    let prediction = cachedValue(predictionKey);
    if (prediction === undefined) {
      let predictionLoaded = false;
      try {
        const predictionResponse = await fetchApiFootball(
          "/predictions",
          { fixture },
          counter,
        );
        prediction = normalizePrediction(predictionResponse[0]);
        predictionLoaded = true;
      } catch {
        prediction = null;
      }
      if (predictionLoaded) {
        setCachedValue(predictionKey, prediction, 30 * 60 * 1000);
      }
    }

    const sources = {
      fixture: true,
      prediction: Boolean(prediction),
      statistics: "unknown",
      events: "unknown",
      lineups: "unknown",
      form: "unknown",
      h2h: "unknown",
      standings: "unknown",
      odds: "unknown",
    };

    return response.json({
      ...fixtureData,
      prediction,
      sources,
      risk: riskFromSources(sources),
      provider: "api-football",
      meta: {
        apiRequestCount: counter.count,
      },
    });
  } catch (error) {
    console.error("API-Football request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось связаться с API-Football.",
      },
    });
  }
});

async function getSportmonksMatchCentre(fixtureId) {
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

app.get("/api/match/:fixture/form", async (request, response) => {
  const fixtureId = String(request.params.fixture || "").trim();

  if (!sportmonksToken) {
    return response.status(503).json({
      error: { code: "SPORTMONKS_NOT_CONFIGURED", message: "Sportmonks не настроен." },
    });
  }

  try {
    const key = `sportmonks:form:${fixtureId}`;
    let result = cachedValue(key);

    if (result === undefined) {
      const centre = await getSportmonksMatchCentre(fixtureId);
      if (!centre?.home?.id || !centre?.away?.id) {
        return response.status(404).json({
          error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
        });
      }

      const [homeRecent, awayRecent] = await Promise.all([
        sportmonksProvider.teamRecentForm(centre.home.id, { limit: 5 }),
        sportmonksProvider.teamRecentForm(centre.away.id, { limit: 5 }),
      ]);

      const form = {
        home: homeRecent?.matches || [],
        away: awayRecent?.matches || [],
      };
      result = {
        form,
        source: form.home.length > 0 && form.away.length > 0,
        provider: "sportmonks",
      };
      setCachedValue(key, result, 30 * 60 * 1000);
    }

    return response.json({ ...result, meta: { apiRequestCount: 3 } });
  } catch (error) {
    console.error("Sportmonks form request failed:", error?.message || error);
    return response.status(502).json({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось загрузить форму." },
      meta: { apiRequestCount: 0 },
    });
  }
});

app.get("/api/match/:fixture/h2h", async (request, response) => {
  const fixtureId = String(request.params.fixture || "").trim();

  if (!sportmonksToken) {
    return response.status(503).json({
      error: { code: "SPORTMONKS_NOT_CONFIGURED", message: "Sportmonks не настроен." },
    });
  }

  try {
    const key = `sportmonks:h2h:${fixtureId}`;
    let result = cachedValue(key);

    if (result === undefined) {
      const centre = await getSportmonksMatchCentre(fixtureId);
      if (!centre?.home?.id || !centre?.away?.id) {
        return response.status(404).json({
          error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
        });
      }

      const h2hResult = await sportmonksProvider.headToHead(
        centre.home.id,
        centre.away.id,
        { limit: 5 },
      );
      const h2h = h2hResult?.matches || [];
      result = {
        h2h,
        source: h2h.length > 0,
        provider: "sportmonks",
      };
      setCachedValue(key, result, 6 * 60 * 60 * 1000);
    }

    return response.json({
      ...result,
      meta: { apiRequestCount: 2 },
    });
  } catch (error) {
    console.error("Sportmonks H2H request failed:", error?.message || error);
    return response.status(502).json({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось загрузить очные встречи." },
      provider: "sportmonks",
      meta: { apiRequestCount: 0 },
    });
  }
});

app.get("/api/match/:fixture/standings", async (request, response) => {
  if (!requireApiKey(response)) return;
  const fixtureId = String(request.params.fixture || "").trim();
  const counter = { count: 0 };

  try {
    const fixtureData = await getFixtureDetails(fixtureId, counter);
    if (!fixtureData) {
      return response.status(404).json({
        error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
      });
    }

    const key = `standings:${fixtureData.league.id}:${fixtureData.league.season}`;
    let rows = cachedValue(key);
    if (rows === undefined) {
      const standingsResponse = await fetchApiFootball(
        "/standings",
        {
          league: fixtureData.league.id,
          season: fixtureData.league.season,
        },
        counter,
      );
      const groups = standingsResponse[0]?.league?.standings;
      rows = Array.isArray(groups)
        ? groups.flat().map(normalizeStanding)
        : [];
      setCachedValue(key, rows, 15 * 60 * 1000);
    }

    const home =
      rows.find((row) => row?.team?.id === fixtureData.home.id) || null;
    const away =
      rows.find((row) => row?.team?.id === fixtureData.away.id) || null;
    return response.json({
      standings: { home, away },
      season: fixtureData.league.season,
      source: Boolean(home && away),
      meta: { apiRequestCount: counter.count },
    });
  } catch (error) {
    console.error("API-Football standings request failed:", error);
    return response.status(502).json({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось загрузить таблицу." },
      meta: { apiRequestCount: counter.count },
    });
  }
});

app.get("/api/match/:fixture/odds", async (request, response) => {
  if (!requireApiKey(response)) return;
  const fixtureId = String(request.params.fixture || "").trim();
  const counter = { count: 0 };

  try {
    const fixtureData = await getFixtureDetails(fixtureId, counter);
    if (!fixtureData) {
      return response.status(404).json({
        error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
      });
    }

    const key = `odds:${fixtureId}`;
    let result = cachedValue(key);
    if (result === undefined) {
      const oddsResponse = await fetchApiFootball(
        "/odds",
        { fixture: fixtureId },
        counter,
      );
      const odds = normalizeOdds(oddsResponse);
      result = { odds, source: odds.length > 0 };
      const finished = ["FT", "AET", "PEN"].includes(
        fixtureData.fixture.status.short,
      );
      setCachedValue(
        key,
        result,
        finished ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000,
      );
    }

    return response.json({
      ...result,
      meta: { apiRequestCount: counter.count },
    });
  } catch (error) {
    console.error("API-Football odds request failed:", error);
    return response.status(502).json({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Не удалось загрузить коэффициенты." },
      meta: { apiRequestCount: counter.count },
    });
  }
});

app.get("/api/match/:fixture/statistics", async (request, response) => {
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

  if (!requireApiKey(response)) return;
  const counter = { count: 0 };

  try {
    const fixtureData = await getFixtureDetails(fixtureId, counter);
    if (!fixtureData) {
      return response.status(404).json({
        error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
        meta: apiMeta(counter),
      });
    }

    const key = `statistics:${fixtureId}`;
    let result = cachedValue(key);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/fixtures/statistics",
        { fixture: fixtureId },
        counter,
      );
      rateLimit = payload.rateLimit;
      const upstreamRows = Array.isArray(payload.response) ? payload.response : [];
      const statistics = normalizeFixtureStatistics(upstreamRows, fixtureData);
      const dataState = matchDataIntegrityState(
        upstreamRows.length,
        statistics.rows.length,
      );

      if (dataState === "normalization_failed") {
        console.error("Fixture statistics normalization failed", {
          fixtureId,
          upstreamCount: upstreamRows.length,
          normalizedCount: statistics.rows.length,
        });
        return response.status(502).json({
          error: {
            code: "NORMALIZATION_FAILED",
            message: "Не удалось обработать статистику матча.",
          },
          dataState,
          meta: {
            ...apiMeta(counter, rateLimit),
            upstreamCount: upstreamRows.length,
            normalizedCount: statistics.rows.length,
          },
        });
      }

      result = {
        statistics,
        source: dataState === "available",
        dataState,
      };
      setCachedValue(
        key,
        result,
        statisticsCacheTtl(fixtureData.fixture.status.short),
      );
    }

    return response.json({
      ...result,
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football statistics request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось получить статистику.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/match/:fixture/events", async (request, response) => {
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

  if (!requireApiKey(response)) return;
  const counter = { count: 0 };

  try {
    const fixtureData = await getFixtureDetails(fixtureId, counter);
    if (!fixtureData) {
      return response.status(404).json({
        error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
        meta: apiMeta(counter),
      });
    }

    const key = `events:${fixtureId}`;
    let result = cachedValue(key);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/fixtures/events",
        { fixture: fixtureId },
        counter,
      );
      rateLimit = payload.rateLimit;
      const upstreamRows = Array.isArray(payload.response) ? payload.response : [];
      const events = normalizeFixtureEvents(upstreamRows);
      const dataState = matchDataIntegrityState(upstreamRows.length, events.length);

      if (dataState === "normalization_failed") {
        console.error("Fixture events normalization failed", {
          fixtureId,
          upstreamCount: upstreamRows.length,
          normalizedCount: events.length,
        });
        return response.status(502).json({
          error: {
            code: "NORMALIZATION_FAILED",
            message: "Не удалось обработать события матча.",
          },
          dataState,
          meta: {
            ...apiMeta(counter, rateLimit),
            upstreamCount: upstreamRows.length,
            normalizedCount: events.length,
          },
        });
      }

      result = {
        events,
        status: fixtureData.fixture.status,
        source: dataState === "available",
        dataState,
      };
      setCachedValue(
        key,
        result,
        eventsCacheTtl(fixtureData.fixture.status.short),
      );
    }

    return response.json({
      ...result,
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football events request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось получить события матча.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get("/api/match/:fixture/lineups", async (request, response) => {
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

  if (!requireApiKey(response)) return;
  const counter = { count: 0 };

  try {
    const fixtureData = await getFixtureDetails(fixtureId, counter);
    if (!fixtureData) {
      return response.status(404).json({
        error: { code: "FIXTURE_NOT_FOUND", message: "Матч не найден." },
        meta: apiMeta(counter),
      });
    }

    const key = `lineups:${fixtureId}`;
    let result = cachedValue(key);
    let rateLimit = null;
    if (result === undefined) {
      const payload = await fetchApiFootballPayload(
        "/fixtures/lineups",
        { fixture: fixtureId },
        counter,
      );
      rateLimit = payload.rateLimit;
      const upstreamRows = Array.isArray(payload.response) ? payload.response : [];
      const lineups = normalizeFixtureLineups(upstreamRows, fixtureData);
      const normalizedCount = Number(Boolean(lineups.home)) + Number(Boolean(lineups.away));
      const dataState = matchDataIntegrityState(upstreamRows.length, normalizedCount);

      if (dataState === "normalization_failed") {
        console.error("Fixture lineups normalization failed", {
          fixtureId,
          upstreamCount: upstreamRows.length,
          normalizedCount,
        });
        return response.status(502).json({
          error: {
            code: "NORMALIZATION_FAILED",
            message: "Не удалось обработать составы матча.",
          },
          dataState,
          meta: {
            ...apiMeta(counter, rateLimit),
            upstreamCount: upstreamRows.length,
            normalizedCount,
          },
        });
      }

      result = {
        lineups,
        status: fixtureData.fixture.status,
        source: dataState === "available",
        dataState,
      };
      setCachedValue(
        key,
        result,
        lineupsCacheTtl(fixtureData.fixture.status.short),
      );
    }

    return response.json({
      ...result,
      meta: apiMeta(counter, rateLimit),
    });
  } catch (error) {
    console.error("API-Football lineups request failed:", error);
    return response.status(502).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Не удалось получить составы.",
      },
      meta: apiMeta(counter),
    });
  }
});

app.get(
  ["/", "/home", "/matches", "/leagues", "/league/:leagueId", "/teams", "/team/:teamId", "/players", "/player/:playerId", "/statistics", "/news", "/news/:articleId"],
  (_request, response) => {
    response.sendFile(path.join(currentDirectory, "index.html"));
  },
);

app.use(express.static(currentDirectory));

app.use((request, response, next) => {
  if (request.method === "GET" && !request.path.startsWith("/api/")) {
    return response.sendFile(path.join(currentDirectory, "index.html"));
  }
  return next();
});

app.listen(port, "0.0.0.0", () => {
  console.log(`AlmazStat server listening on port ${port}`);
});