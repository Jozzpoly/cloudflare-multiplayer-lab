#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
ROOT_RECOVERY_CONFIG_TEMPLATE="workers/foundation-recovery-remote/wrangler.repository-root.jsonc"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/foundation-recovery-cmake-probe"
CMAKE_VERSION="3.31.6"
CMAKE_PY_DIR="$BUILD_ROOT/python"
CMAKE_BIN_DIR="$BUILD_ROOT/bin"
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
mkdir -p "$CMAKE_PY_DIR" "$CMAKE_BIN_DIR"
python -m pip install --disable-pip-version-check --no-input --target "$CMAKE_PY_DIR" "cmake==$CMAKE_VERSION"
cat > "$CMAKE_BIN_DIR/cmake" <<EOF
#!/usr/bin/env bash
PYTHONPATH="$CMAKE_PY_DIR\${PYTHONPATH:+:\$PYTHONPATH}" exec python -m cmake "\$@"
EOF
chmod +x "$CMAKE_BIN_DIR/cmake"
export PATH="$CMAKE_BIN_DIR:$PATH"

[[ "$(cmake --version | head -n 1)" == "cmake version $CMAKE_VERSION" ]]

echo "FOUNDATION_RECOVERY_WORKERS_BUILD_PINNED_CMAKE_PROBE_PASS"
exit 0
