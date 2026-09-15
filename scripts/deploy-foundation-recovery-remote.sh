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
cmp -s wrangler.jsonc "$ROOT_RECOVERY_CONFIG_TEMPLATE"

npm ci

PROBE_SCRIPT="scripts/.foundation-recovery-box3d-st-lib-probe.sh"
cp scripts/build-foundation-recovery-box3d.sh "$PROBE_SCRIPT"
python - <<'PY'
from pathlib import Path
path = Path("scripts/.foundation-recovery-box3d-st-lib-probe.sh")
source = path.read_text()
needle = "pnpm build\n"
assert source.count(needle) == 1
replacement = r'''python - <<'PY2'
from pathlib import Path
import os
p = Path(os.environ["BOX3D_JS_DIR"]) / "scripts" / "build.mjs"
s = p.read_text()
needle = "const stLib = buildBox3dLib( 'build/box3d', null );\nconst mtLib ="
assert s.count(needle) == 1
s = s.replace(needle, "const stLib = buildBox3dLib( 'build/box3d', null );\nconsole.log('FOUNDATION_RECOVERY_WORKERS_BUILD_ST_LIB_PROBE_PASS');\nprocess.exit(0);\nconst mtLib =", 1)
p.write_text(s)
PY2
pnpm build
'''
source = source.replace(needle, replacement, 1)
path.write_text(source)
PY
bash "$PROBE_SCRIPT"
