import { createSportmonksProvider } from "../lib/sportmonks-provider.js";

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const provider = createSportmonksProvider();

try {
  const result = await provider.fixturesByDate(date);
  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: result.meta.provider,
        date,
        matches: result.matches.length,
        sample: result.matches.slice(0, 3).map((match) => ({
          fixtureId: match.fixtureId,
          status: match.status.short,
          league: match.league.name,
          home: match.home.name,
          away: match.away.name,
          score: match.goals,
        })),
        pagination: result.meta.pagination,
        rateLimit: result.meta.rateLimit,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: error?.code || "SPORTMONKS_CHECK_FAILED",
        status: error?.status || null,
        message: error?.message || "Unknown Sportmonks error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
