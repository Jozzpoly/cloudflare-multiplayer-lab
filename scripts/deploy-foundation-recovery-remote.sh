#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
ROOT_RECOVERY_CONFIG_TEMPLATE="workers/foundation-recovery-remote/wrangler.repository-root.jsonc"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/foundation-recovery-box3d"
EMSDK_DIR="$BUILD_ROOT/emsdk"
BOX3D_JS_DIR="$BUILD_ROOT/box3d-js"
BOX3D_JS_COMMIT="5d5a3af049cccd9948b2b55bac4342414af0ef64"
BOX3D_COMMIT="8441b4a06d6d09dcfb0b0f704df4d847d1437b92"
cd "$REPO_ROOT"

[[ "${WORKERS_CI:-}" == "1" ]]
[[ "${WRANGLER_CI_OVERRIDE_NAME:-}" == "$EXPECTED_WORKER" ]]
[[ "${WORKERS_CI_BRANCH:-}" == "$EXPECTED_BRANCH" ]]
[[ "${WORKERS_CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ "$(git rev-parse HEAD)" == "$WORKERS_CI_COMMIT_SHA" ]]
[[ -f "$RECOVERY_CONFIG" ]]
[[ -f "$ROOT_RECOVERY_CONFIG_TEMPLATE" ]]
cmp -s wrangler.jsonc "$ROOT_RECOVERY_CONFIG_TEMPLATE"

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT"
git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
"$EMSDK_DIR/emsdk" install 6.0.2
"$EMSDK_DIR/emsdk" activate 6.0.2

git clone https://github.com/isaac-mason/box3d.js.git "$BOX3D_JS_DIR"
cd "$BOX3D_JS_DIR"
git checkout "$BOX3D_JS_COMMIT"
git submodule update --init --recursive

test "$(git rev-parse HEAD)" = "$BOX3D_JS_COMMIT"
test "$(git -C vendor/box3d rev-parse HEAD)" = "$BOX3D_COMMIT"

echo "FOUNDATION_RECOVERY_WORKERS_BUILD_BOX3D_SOURCES_PROBE_PASS"
exit 0
