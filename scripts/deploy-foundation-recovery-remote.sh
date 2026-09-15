#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
ROOT_RECOVERY_CONFIG_TEMPLATE="workers/foundation-recovery-remote/wrangler.repository-root.jsonc"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

[[ "${WORKERS_CI:-}" == "1" ]]
[[ "${WRANGLER_CI_OVERRIDE_NAME:-}" == "$EXPECTED_WORKER" ]]
[[ "${WORKERS_CI_BRANCH:-}" == "$EXPECTED_BRANCH" ]]
[[ "${WORKERS_CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ "$(git rev-parse HEAD)" == "$WORKERS_CI_COMMIT_SHA" ]]
[[ -f "$RECOVERY_CONFIG" ]]
[[ -f "$ROOT_RECOVERY_CONFIG_TEMPLATE" ]]
[[ -f wrangler.jsonc ]]
cmp -s wrangler.jsonc "$ROOT_RECOVERY_CONFIG_TEMPLATE"

npm ci
bash scripts/build-foundation-recovery-remote.sh

echo "FOUNDATION_RECOVERY_WORKERS_BUILD_ARTIFACT_PROBE_PASS"
exit 0
