# Shared Yard V0 — remote staging qualification trigger

This file exists only to create an explicit, auditable push for the isolated Cloudflare staging qualification.

Owner reported on 2026-09-03 that the `cloudflare-multiplayer-lab-staging` Workers Builds production branch was changed to `world-v0-shared-yard`.

The commit containing this file intentionally carries the `[remote-staging]` marker so the World V0 runtime qualification workflow will:

1. wait for and verify the expected Shared Yard V0 browser build on the isolated staging Worker;
2. run the real remote authority / identity / canonical dead-man smoke while checking production isolation;
3. only after that passes, run two independent real Chromium clients against the remote staging Worker with the exact same-boundary state guard.

This trigger changes no runtime, protocol, simulation, scene or timing semantics. A successful Cloudflare build alone is not a qualification PASS; the remote authority and Chromium jobs must pass on this exact SHA.
