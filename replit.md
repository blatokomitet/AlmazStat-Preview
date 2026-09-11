# AlmazStat

Minimal Telegram Mini App foundation for football match analytics.

## Run & Operate

- `pnpm start` — run the AlmazStat server using `process.env.PORT`
- Required env: `API_FOOTBALL_KEY` for live `/api/match` requests

## Stack

- Node.js 24, Express 5, and browser-native HTML/CSS/JavaScript

## Where things live

- `index.html` — Telegram Mini App entry page
- `style.css` — mobile-first dark theme
- `app.js` — Telegram WebApp initialization and match rendering
- `server.js` — static server and API-Football proxy

## Architecture decisions

- API-Football credentials are read only on the server from `API_FOOTBALL_KEY`.
- The frontend accepts a fixture ID from `?fixture=` first, then Telegram `start_param`.
- Leagues, teams, players, and top-scorer statistics use normalized API-Football
  proxy routes. News uses the public BBC Sport football RSS feed and is labeled
  separately in the response.
- Analytics routes pass upstream failures and empty responses to the UI as
  explicit states; they never substitute demo records.

## Product

The app provides a stable match shell plus live-data analytics sections. Match
Center and Match Details keep their existing API contracts.

## User preferences

- Keep the foundation free of React, TypeScript, databases, authentication, fake match data, and unrelated services until explicitly requested.

## Gotchas

- Missing `API_FOOTBALL_KEY` is an expected configuration state: the server must stay up and report a clear `/api/match` error.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
