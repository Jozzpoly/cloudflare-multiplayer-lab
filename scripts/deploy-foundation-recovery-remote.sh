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
export REPO_ROOT BUILD_ROOT EMSDK_DIR BOX3D_JS_DIR
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

python - <<'PY'
from pathlib import Path
import os
root = Path(os.environ["BOX3D_JS_DIR"])
path = root / "src" / "bindings.cpp"
source = path.read_text()
needle = '\tfunction( "b3RecPlayer_CreateFromRecording(recording, workerCount)", +[]( uintptr_t rec, int workerCount ) -> uintptr_t\n\t{\n\t\tb3Recording* r = reinterpret_cast<b3Recording*>( rec );\n\t\treturn reinterpret_cast<uintptr_t>( b3RecPlayer_Create( b3Recording_GetData( r ), b3Recording_GetSize( r ), workerCount ) );\n\t} );'
assert source.count(needle) == 1
bridge_lines = [
    "",
    '\tret_function( "b3Recording_CopyBytes(recording): Uint8Array", +[]( uintptr_t rec ) -> val',
    "\t{",
    "\t\tb3Recording* r = reinterpret_cast<b3Recording*>( rec );",
    "\t\tconst uint8_t* data = b3Recording_GetData( r );",
    "\t\tint size = b3Recording_GetSize( r );",
    '\t\tif ( data == nullptr || size <= 0 ) return val::global( "Uint8Array" ).new_( 0 );',
    "\t\tval view = val( typed_memory_view( (size_t)size, data ) );",
    '\t\treturn val::global( "Uint8Array" ).new_( view );',
    "\t} );",
    "",
    '\tfunction( "b3RecPlayer_CreateFromBytes(bytes, workerCount)", +[]( val bytes, int workerCount ) -> uintptr_t',
    "\t{",
    '\t\tint size = bytes["byteLength"].as<int>();',
    "\t\tif ( size <= 0 ) return 0;",
    "\t\tstd::vector<uint8_t> copy( (size_t)size );",
    "\t\tval view = val( typed_memory_view( (size_t)size, copy.data() ) );",
    '\t\tview.call<void>( "set", bytes );',
    "\t\treturn reinterpret_cast<uintptr_t>( b3RecPlayer_Create( copy.data(), size, workerCount ) );",
    "\t} );",
]
path.write_text(source.replace(needle, needle + "\n" + "\n".join(bridge_lines), 1))
PY

python - <<'PY'
from pathlib import Path
import os
root = Path(os.environ["BOX3D_JS_DIR"])
build_path = root / "scripts" / "build.mjs"
build_source = build_path.read_text()
flag_anchor = "\t'-sFILESYSTEM=0',\n"
assert build_source.count(flag_anchor) == 1
build_path.write_text(build_source.replace(flag_anchor, flag_anchor + "\t'-sDYNAMIC_EXECUTION=0',\n", 1))
facade_path = root / "src" / "facade.js"
facade_source = facade_path.read_text()
start_marker = "\tconst makeOutParamReader = ( rawInto, sizes, trailing ) =>\n\t{\n"
end_marker = "\n\n\t// Install a public reader per binding-site entry; capture + strip the raw `*Into`."
start = facade_source.index(start_marker)
end = facade_source.index(end_marker, start)
original = facade_source[start:end]
assert "return new Function(" in original
replacement = "\n".join([
    "\tconst makeOutParamReader = ( rawInto, sizes, trailing ) =>",
    "\t{",
    "\t\tlet byteOff = 0;",
    "\t\tconst slotPtrs = sizes.map( ( n ) => { const p = SCRATCH + byteOff; byteOff += n * 4; return p; } );",
    "\t\tlet elemOff = 0;",
    "\t\tconst elemBases = sizes.map( ( n ) => { const base = SCRATCH_F32 + elemOff; elemOff += n; return base; } );",
    "",
    "\t\treturn ( ...args ) =>",
    "\t\t{",
    "\t\t\tconst outs = args.slice( 0, sizes.length );",
    "\t\t\tconst trail = args.slice( sizes.length, sizes.length + trailing );",
    "\t\t\trawInto( ...slotPtrs, ...trail );",
    "\t\t\tconst h = getF32();",
    "\t\t\tfor ( let i = 0; i < sizes.length; i++ )",
    "\t\t\t{",
    "\t\t\t\tconst out = outs[ i ];",
    "\t\t\t\tconst base = elemBases[ i ];",
    "\t\t\t\tfor ( let k = 0; k < sizes[ i ]; k++ ) out[ k ] = h[ base + k ];",
    "\t\t\t}",
    "\t\t\treturn outs.length === 1 ? outs[ 0 ] : outs;",
    "\t\t};",
    "\t};",
])
facade_source = facade_source[:start] + replacement + facade_source[end:]
assert "return new Function(" not in facade_source
facade_path.write_text(facade_source)
PY

echo "FOUNDATION_RECOVERY_WORKERS_BUILD_PATCH_PROBE_PASS"
exit 0
