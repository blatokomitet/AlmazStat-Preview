---
name: API-Football contract handling
description: API-Football access and plan limits must be treated as explicit upstream state.
---

API-Football integrations should expose loading, empty, configuration, and upstream-error states instead of converting plan or account-access errors into empty or demo data. Request quota headers are available on successful upstream responses and should be preserved when adding new proxy routes.

Do not assume the upstream `response` field is always an array. Collection endpoints return arrays, while endpoints such as team season statistics return an object.

**Why:** Endpoint availability depends on the connected API plan and account status; a valid endpoint can still return a plan or access error. Coercing every response to an array silently discards valid object payloads.

**How to apply:** Keep API keys server-side, validate endpoint inputs before calling upstream, preserve the raw response container type, normalize each endpoint's documented shape, cache read-heavy queries, and never hide upstream failures.