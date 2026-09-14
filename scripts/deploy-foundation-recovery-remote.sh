#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${WORKERS_CI:-}" != "1" ]]; then
  echo "Refusing foundation recovery remote deploy: WORKERS_CI=1 is required." >&2
  exit 1
fi

if [[ "${WRANGLER_CI_OVERRIDE_NAME:-}" != "$EXPECTED_WORKER" ]]; then
  echo "Refusing foundation recovery remote deploy: Workers Builds target '${WRANGLER_CI_OVERRIDE_NAME:-<missing>}' != '$EXPECTED_WORKER'." >&2
  exit 1
fi

if [[ "${WORKERS_CI_BRANCH:-}" != "$EXPECTED_BRANCH" ]]; then
  echo "Refusing foundation recovery remote deploy: Workers Builds branch '${WORKERS_CI_BRANCH:-<missing>}' != '$EXPECTED_BRANCH'." >&2
  exit 1
fi

if [[ ! "${WORKERS_CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing foundation recovery remote deploy: WORKERS_CI_COMMIT_SHA is missing or invalid." >&2
  exit 1
fi

HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$HEAD_SHA" != "$WORKERS_CI_COMMIT_SHA" ]]; then
  echo "Refusing foundation recovery remote deploy: checkout $HEAD_SHA != Workers Builds commit $WORKERS_CI_COMMIT_SHA." >&2
  exit 1
fi

if [[ ! -f "$RECOVERY_CONFIG" ]]; then
  echo "Refusing foundation recovery remote deploy: dedicated Wrangler config is missing." >&2
  exit 1
fi

npm ci
bash scripts/build-foundation-recovery-remote.sh

WRANGLER_ARGS=(
  deploy
  --config "$RECOVERY_CONFIG"
)
if [[ "${FOUNDATION_RECOVERY_REMOTE_DRY_RUN:-}" == "1" ]]; then
  WRANGLER_ARGS+=(--dry-run)
  if [[ -n "${FOUNDATION_RECOVERY_REMOTE_DRY_RUN_OUTDIR:-}" ]]; then
    WRANGLER_ARGS+=(--outdir "$FOUNDATION_RECOVERY_REMOTE_DRY_RUN_OUTDIR")
  fi
fi

npx wrangler "${WRANGLER_ARGS[@]}"
