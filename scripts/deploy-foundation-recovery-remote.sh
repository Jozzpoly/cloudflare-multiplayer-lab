#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKER="cloudflare-multiplayer-lab-foundation-recovery"
EXPECTED_BRANCH="research/multiplayer-foundation-recovery-remote"
RECOVERY_CONFIG="workers/foundation-recovery-remote/wrangler.jsonc"
ROOT_RECOVERY_CONFIG_TEMPLATE="workers/foundation-recovery-remote/wrangler.repository-root.jsonc"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMAKE_VERSION="3.31.6"
CMAKE_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/foundation-recovery-cmake"
CMAKE_PY_DIR="$CMAKE_ROOT/python"
CMAKE_BIN_DIR="$CMAKE_ROOT/bin"
cd "$REPO_ROOT"

if [[ "${WORKERS_CI:-}" != "1" ]]; then
  echo "Refusing foundation recovery remote build: WORKERS_CI=1 is required." >&2
  exit 1
fi

if [[ "${WRANGLER_CI_OVERRIDE_NAME:-}" != "$EXPECTED_WORKER" ]]; then
  echo "Refusing foundation recovery remote build: Workers Builds target '${WRANGLER_CI_OVERRIDE_NAME:-<missing>}' != '$EXPECTED_WORKER'." >&2
  exit 1
fi

if [[ "${WORKERS_CI_BRANCH:-}" != "$EXPECTED_BRANCH" ]]; then
  echo "Refusing foundation recovery remote build: Workers Builds branch '${WORKERS_CI_BRANCH:-<missing>}' != '$EXPECTED_BRANCH'." >&2
  exit 1
fi

if [[ ! "${WORKERS_CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing foundation recovery remote build: WORKERS_CI_COMMIT_SHA is missing or invalid." >&2
  exit 1
fi

HEAD_SHA="$(git rev-parse HEAD)"
if [[ "$HEAD_SHA" != "$WORKERS_CI_COMMIT_SHA" ]]; then
  echo "Refusing foundation recovery remote build: checkout $HEAD_SHA != Workers Builds commit $WORKERS_CI_COMMIT_SHA." >&2
  exit 1
fi

if [[ ! -f "$RECOVERY_CONFIG" ]]; then
  echo "Refusing foundation recovery remote build: dedicated Wrangler config is missing." >&2
  exit 1
fi

if [[ ! -f "$ROOT_RECOVERY_CONFIG_TEMPLATE" ]]; then
  echo "Refusing foundation recovery remote build: repository-root recovery config template is missing." >&2
  exit 1
fi

if [[ ! -f wrangler.jsonc ]] || ! cmp -s wrangler.jsonc "$ROOT_RECOVERY_CONFIG_TEMPLATE"; then
  echo "Refusing foundation recovery remote build: repository-root wrangler.jsonc is not the qualified recovery config." >&2
  exit 1
fi

rm -rf "$CMAKE_ROOT"
mkdir -p "$CMAKE_PY_DIR" "$CMAKE_BIN_DIR"
python -m pip install --disable-pip-version-check --no-input --target "$CMAKE_PY_DIR" "cmake==$CMAKE_VERSION"
cat > "$CMAKE_BIN_DIR/cmake" <<EOF
#!/usr/bin/env bash
PYTHONPATH="$CMAKE_PY_DIR\${PYTHONPATH:+:\$PYTHONPATH}" exec python -m cmake "\$@"
EOF
chmod +x "$CMAKE_BIN_DIR/cmake"
export PATH="$CMAKE_BIN_DIR:$PATH"
[[ "$(cmake --version | head -n 1)" == "cmake version $CMAKE_VERSION" ]]

npm ci
bash scripts/build-foundation-recovery-remote.sh

echo FOUNDATION_RECOVERY_WORKERS_BUILD_FULL_BUNDLE_PROBE_PASS
exit 0
