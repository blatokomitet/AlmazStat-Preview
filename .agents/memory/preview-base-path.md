---
name: Preview base path
description: Artifact previews can mount the vanilla app below a /preview URL prefix.
---

The artifact preview proxy can pass `/preview/...` to the server and leave the prefix in `window.location.pathname`; client routing must strip that prefix while keeping API calls and root deployment routes unchanged.

**Why:** Without prefix normalization, direct preview navigation falls back to the home route even though the server correctly serves index.html.

**How to apply:** Keep base-path detection isolated in the client router and use it only when constructing browser history URLs; do not add the preview prefix to server API fetch URLs.