import { readFileSync, writeFileSync } from "node:fs";

const path = "src/box3d-runtime.ts";
let source = readFileSync(path, "utf8");
const MARKER = "WORLD_V0_I4B_WORKER_RAW_SEED_PREWARM_V1";
if (source.includes(MARKER)) {
  console.log("WORLD_V0_I4B_WORKER_PREWARM_APPLY already applied");
  process.exit(0);
}

const before = `export const b3 = await factory({
  instantiateWasm(imports, success) {
    void WebAssembly.instantiate(box3dWasm, imports).then((instance) => {
      success(instance, box3dWasm);
    });
    return {};
  },
});

export const BOX3D_RUNTIME = {`;

const after = `export const b3 = await factory({
  instantiateWasm(imports, success) {
    void WebAssembly.instantiate(box3dWasm, imports).then((instance) => {
      success(instance, box3dWasm);
    });
    return {};
  },
});

// WORLD_V0_I4B_WORKER_RAW_SEED_PREWARM_V1
// The custom raw-seed CopyData binding uses emscripten::val::new_, whose lazy
// emval constructor invoker is generated on first use. Cloudflare allows the
// existing Embind code generation during module initialization but forbids it
// request-time. Prewarm that lazy path here, before any request can arrive.
// Empty recording/byte input keeps this strictly a marshalling capability warmup.
const i4bPrewarmRecording = b3.b3CreateRecording(0);
try {
  const i4bPrewarmBytes = b3.b3Recording_CopyData(i4bPrewarmRecording);
  if (!(i4bPrewarmBytes instanceof Uint8Array) || i4bPrewarmBytes.byteLength !== 0) {
    throw new Error("World V0 I4b raw-seed prewarm copy contract failed");
  }
  b3.b3Bytes_Fnv1a32(i4bPrewarmBytes);
  const i4bPrewarmPlayer = b3.b3RecPlayer_CreateFromBytes(i4bPrewarmBytes, 1);
  if (i4bPrewarmPlayer) {
    b3.b3RecPlayer_Destroy(i4bPrewarmPlayer);
    throw new Error("World V0 I4b empty raw-seed prewarm unexpectedly created a player");
  }
} finally {
  b3.b3DestroyRecording(i4bPrewarmRecording);
}

export const BOX3D_RUNTIME = {`;

const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`I4b worker prewarm marker expected once, got ${count}`);
source = source.replace(before, after);
writeFileSync(path, source);
console.log("WORLD_V0_I4B_WORKER_PREWARM_APPLY PASS");
