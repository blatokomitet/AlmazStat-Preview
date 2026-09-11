---
name: League-wide statistics limits
description: Global league statistics must use direct aggregate endpoints and avoid per-team request fan-out.
---

Use API-Football's direct standings and player leader endpoints for global league statistics. Do not construct league-wide team statistics by requesting `/teams/statistics` separately for every club.

**Why:** Team statistics requires a specific team, league, and season. A league-wide view would consume one external request per team, causing unnecessary quota use and slow loading.

**How to apply:** Load standings, top scorers, top assists, yellow-card leaders, and red-card leaders lazily and cache each context. Keep league-wide Team Statistics explicitly unavailable until an efficient upstream endpoint exists.