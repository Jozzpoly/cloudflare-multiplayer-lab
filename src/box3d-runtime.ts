// I4a: one pinned custom artifact is used by both Worker and browser.
// @ts-ignore generated pinned Emscripten module has no TypeScript declaration
import Box3D from "../public/world-v0/box3d-i4/box3d.inline.mjs";
import box3dWasm from "../public/world-v0/box3d-i4/box3d.wasm";

type InstantiateSuccess = (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void;
type Box3DFactoryOptions = {
  instantiateWasm: (imports: WebAssembly.Imports, success: InstantiateSuccess) => Record<string, never>;
};
type Box3DFactory = (options?: Box3DFactoryOptions) => ReturnType<typeof Box3D>;

const factory = Box3D as Box3DFactory;

// Cloudflare Workers disallow request-time Wasm compilation and Embind string
// code generation. The feasibility gate proved that both are compatible when
// the package Wasm is precompiled by Wrangler and the Embind factory runs once
// during Worker module startup.
export const b3 = await factory({
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

export const BOX3D_RUNTIME = {
  package: "box3d.js@0.1.1",
  build: "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2",
} as const;
