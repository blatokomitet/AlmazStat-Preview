---
name: Player match integrity
description: Player match history must not be inferred from team fixtures when participation data is unavailable.
---

Show player matches only when the upstream API provides participation data efficiently. Do not label team fixtures as a player's matches, and do not fan out to one player-statistics request per fixture.

**Why:** API-Football has no efficient dedicated player-fixtures endpoint. Team membership does not prove that a player appeared in a specific match, while per-fixture player requests waste quota.

**How to apply:** Reuse direct player season statistics for profile, statistics, and career views. Keep player matches explicitly unavailable unless a future upstream contract provides participation history without per-match requests.