#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
ROOT_RECOVERY_CONFIG_TEMPLATE="workers/foundation-recovery-remote/wrangler.repository-root.jsonc"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${WORKERS_CI:-}" != "1" ]]; then
  exit 11
fi
if [[ "${WRANGLER_CI_OVERRIDE_NAME:-}" != "$EXPECTED_WORKER" ]]; then
  exit 12
fi
if [[ "${WORKERS_CI_BRANCH:-}" != "$EXPECTED_BRANCH" ]]; then
  exit 13
fi
if [[ ! "${WORKERS_CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  exit 14
fi
HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$HEAD_SHA" != "$WORKERS_CI_COMMIT_SHA" ]]; then
  exit 15
fi
if [[ ! -f "$RECOVERY_CONFIG" ]]; then
  exit 16
fi
if [[ ! -f "$ROOT_RECOVERY_CONFIG_TEMPLATE" ]]; then
  exit 17
fi
if [[ ! -f wrangler.jsonc ]] || ! cmp -s wrangler.jsonc "$ROOT_RECOVERY_CONFIG_TEMPLATE"; then
  exit 18
fi

echo "FOUNDATION_RECOVERY_WORKERS_BUILD_GUARDS_PROBE_PASS"
exit 0
