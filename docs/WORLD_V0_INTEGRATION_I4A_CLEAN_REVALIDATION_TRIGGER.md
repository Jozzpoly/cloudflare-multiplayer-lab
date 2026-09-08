# World V0 Integration I4a — clean revalidation trigger

This file is provenance-only. It intentionally changes neither runtime semantics nor validation apparatus.

Its push exists solely to trigger an independent clean revalidation after the I4a runtime seam was committed by `github-actions[bot]`, whose push does not recursively trigger another Actions workflow.

Runtime under revalidation:

- branch: `world-v0-multiplayer-foundation-integration`
- I4a runtime commit: `01d4c12637112ab5c445ac919c9a8eafe7bb1080`
- expected SimBuildId: `shared-yard-v0-sim-ee3d26f5ccba0c11`
- pinned Box3D module SHA-256: `5f7f2aea85b4ad39bb87c5362e219db1773f1ca85e616f33760781e3ca03708a`
- pinned Box3D wasm SHA-256: `4ded44b9caff36ef1eaa5a40be542225b62225be48c21ff1478a61e7c6dfb95c`

Clean acceptance requires the committed artifacts to be reused rather than rebuilt, both I4a patchers to report `already applied`, the SimBuildId and artifact hashes to remain identical, the focused seam/full repository/I1-I3 gates to pass, and the final commit gate to report that there is nothing to push.

Passing this closes only the I4a dependency/replay seam. It does not close I4; authority-to-browser exact wire rebase and resumed browser recovery remain I4b.
