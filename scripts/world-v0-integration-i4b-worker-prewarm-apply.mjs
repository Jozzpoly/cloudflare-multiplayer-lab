import { readFileSync, writeFileSync } from "node:fs";

const path = "src/box3d-runtime.ts";
let source = readFileSync(path, "utf8");
const MARKER = "WORLD_V0_I4B_WORKER_RAW_SEED_PREWARM_V2";
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

// WORLD_V0_I4B_WORKER_RAW_SEED_PREWARM_V2
// b3Recording_CopyData has two lazy emval constructor signatures: the empty
// recording path constructs Uint8Array(number), while a real recording constructs
// Uint8Array(typed_memory_view). Cloudflare permits the existing Embind codegen
// during module initialization but rejects a new invoker during request handling.
// Exercise the exact non-empty recording path here on a disposable empty world so
// every raw-seed marshalling caller exists before any Durable Object request runs.
const i4bPrewarmWorldDef = b3.b3DefaultWorldDef();
const i4bPrewarmWorld = b3.b3CreateWorld(i4bPrewarmWorldDef);
const i4bPrewarmRecording = b3.b3CreateRecording(0);
try {
  b3.b3World_StartRecording(i4bPrewarmWorld, i4bPrewarmRecording);
  b3.b3World_StopRecording(i4bPrewarmWorld);
  const i4bPrewarmSize = b3.b3Recording_GetSize(i4bPrewarmRecording);
  if (!Number.isInteger(i4bPrewarmSize) || i4bPrewarmSize <= 0) {
    throw new Error("World V0 I4b nonempty raw-seed prewarm recording failed");
  }
  const i4bPrewarmBytes = b3.b3Recording_CopyData(i4bPrewarmRecording);
  if (!(i4bPrewarmBytes instanceof Uint8Array) || i4bPrewarmBytes.byteLength !== i4bPrewarmSize) {
    throw new Error("World V0 I4b raw-seed prewarm copy contract failed");
  }
  b3.b3Bytes_Fnv1a32(i4bPrewarmBytes);
  const i4bPrewarmPlayer = b3.b3RecPlayer_CreateFromBytes(i4bPrewarmBytes, 1);
  if (!i4bPrewarmPlayer) {
    throw new Error("World V0 I4b raw-seed prewarm player create failed");
  }
  b3.b3RecPlayer_Destroy(i4bPrewarmPlayer);
} finally {
  b3.b3DestroyRecording(i4bPrewarmRecording);
  b3.b3DestroyWorld(i4bPrewarmWorld);
}

export const BOX3D_RUNTIME = {`;

const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`I4b worker prewarm marker expected once, got ${count}`);
source = source.replace(before, after);
writeFileSync(path, source);
console.log("WORLD_V0_I4B_WORKER_PREWARM_APPLY PASS");
