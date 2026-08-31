import Box3D from "box3d.js/inline";
import box3dWasm from "../node_modules/box3d.js/dist/box3d.wasm";

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
  build: "inline-glue-precompiled-wasm-startup-init-single-threaded",
} as const;
