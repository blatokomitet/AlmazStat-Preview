---
name: News provider boundary
description: News must come from a dedicated, explicitly configured provider rather than API-Football or generated content.
---

Keep news behind the internal provider adapter. Until a dedicated provider is explicitly connected, list and detail endpoints should return successful empty data with `not_configured` metadata.

**Why:** API-Football is not the project's news source, and generated, demo, or opportunistically selected external articles would violate data integrity.

**How to apply:** Connect a future provider only through the backend adapter, preserve the existing list/detail contracts, cache successful provider responses, and distinguish provider absence from real upstream errors.