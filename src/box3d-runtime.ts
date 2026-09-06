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

export const BOX3D_RUNTIME = {
  package: "box3d.js@0.1.1",
  build: "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2",
} as const;
