#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
ROOT_RECOVERY_CONFIG_TEMPLATE="workers/foundation-recovery-remote/wrangler.repository-root.jsonc"
ENTRY_PROBE_SENTINEL="foundation-recovery-workers-build-entry-probe.json"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "$ENTRY_PROBE_SENTINEL" ]]; then
  node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const probe = JSON.parse(readFileSync("foundation-recovery-workers-build-entry-probe.json", "utf8"));
if (probe.revision !== "multiplayer-foundation-workers-build-entry-probe-v1" || probe.enabled !== true) {
  throw new Error("invalid Workers Builds entry probe sentinel");
}
NODE
  if [[ "${WORKERS_CI:-}" != "1" ]]; then
    echo "Refusing Workers Builds entry probe: WORKERS_CI=1 is required." >&2
    exit 1
  fi
  if [[ "${WRANGLER_CI_OVERRIDE_NAME:-}" != "$EXPECTED_WORKER" ]]; then
    echo "Refusing Workers Builds entry probe: target '${WRANGLER_CI_OVERRIDE_NAME:-<missing>}' != '$EXPECTED_WORKER'." >&2
    exit 1
  fi
  if [[ "${WORKERS_CI_BRANCH:-}" != "$EXPECTED_BRANCH" ]]; then
    echo "Refusing Workers Builds entry probe: branch '${WORKERS_CI_BRANCH:-<missing>}' != '$EXPECTED_BRANCH'." >&2
    exit 1
  fi
  echo "FOUNDATION_RECOVERY_WORKERS_BUILDS_ENTRY_PROBE_PASS commit=${WORKERS_CI_COMMIT_SHA:-<missing>}"
  exit 0
fi

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

if [[ ! -f "$ROOT_RECOVERY_CONFIG_TEMPLATE" ]]; then
  echo "Refusing foundation recovery remote deploy: repository-root recovery config template is missing." >&2
  exit 1
fi

if [[ "${FOUNDATION_RECOVERY_REMOTE_DRY_RUN:-}" != "1" ]]; then
  if [[ ! -f wrangler.jsonc ]] || ! cmp -s wrangler.jsonc "$ROOT_RECOVERY_CONFIG_TEMPLATE"; then
    echo "Refusing foundation recovery remote deploy: repository-root wrangler.jsonc is not the qualified recovery config." >&2
    exit 1
  fi
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

if [[ "${FOUNDATION_RECOVERY_REMOTE_DRY_RUN:-}" == "1" ]]; then
  ROOT_CONFIG_BACKUP="$(mktemp)"
  cp wrangler.jsonc "$ROOT_CONFIG_BACKUP"
  restore_root_config() {
    cp "$ROOT_CONFIG_BACKUP" wrangler.jsonc
    rm -f "$ROOT_CONFIG_BACKUP"
  }
  trap restore_root_config EXIT

  cp "$ROOT_RECOVERY_CONFIG_TEMPLATE" wrangler.jsonc
  ROOT_DRY_RUN_OUTDIR="${FOUNDATION_RECOVERY_REMOTE_DRY_RUN_OUTDIR:-$REPO_ROOT/.wrangler/foundation-recovery-root-dry-run}-root-config"
  npx wrangler deploy --config wrangler.jsonc --dry-run --outdir "$ROOT_DRY_RUN_OUTDIR"
  test -d "$ROOT_DRY_RUN_OUTDIR"
  echo FOUNDATION_RECOVERY_REMOTE_ROOT_CONFIG_DRY_RUN_PASS

  restore_root_config
  trap - EXIT
fi
