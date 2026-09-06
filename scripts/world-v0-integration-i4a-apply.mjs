import { existsSync, readFileSync, writeFileSync } from "node:fs";

const contractPath = "src/world-v0-contract.ts";
const runtimePath = "src/box3d-runtime.ts";
const serverPath = "src/world-v0-shared-yard.ts";
const browserPath = "public/world-v0/app.js";
const customModulePath = "public/world-v0/box3d-i4/box3d.inline.mjs";
const customWasmPath = "public/world-v0/box3d-i4/box3d.wasm";

const NEW_CONTRACT = "shared-yard-v0-contract-v5-i4-rebase-runtime-seam";
const NEW_SERVER = "shared-yard-v0-authority-v4-i4-rebase-runtime-seam";
const NEW_CLIENT = "shared-yard-v0-browser-sim-v5-i4-rebase-runtime-seam";
const NEW_BOX3D_BUILD = "i4-raw-seed-bindings-box3djs-5d5a3af-emsdk-6.0.2";

if (!existsSync(customModulePath) || !existsSync(customWasmPath)) {
  throw new Error("I4a custom Box3D artifacts missing before runtime application");
}

let contract = readFileSync(contractPath, "utf8");
let runtime = readFileSync(runtimePath, "utf8");
let server = readFileSync(serverPath, "utf8");
let browser = readFileSync(browserPath, "utf8");

if (contract.includes(NEW_CONTRACT) && runtime.includes(NEW_BOX3D_BUILD) &&
    server.includes("I4 authority recording locator") && browser.includes("b3RecPlayer_CreateFromBytes")) {
  console.log("WORLD_V0_I4A_APPLY already applied");
  process.exit(0);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I4a patch marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I4a patch marker ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

contract = replaceOnce(contract,
  `export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v4-logical-input-scheduler";`,
  `export const WORLD_V0_CONTRACT_REVISION = "${NEW_CONTRACT}";`, "contract revision");
contract = replaceOnce(contract,
  `export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v3-supersession";`,
  `export const WORLD_V0_SERVER_REVISION = "${NEW_SERVER}";`, "server revision");
contract = replaceOnce(contract,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v4-logical-input-scheduler";`,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`, "client revision");
contract = replaceOnce(contract,
  `  build: "inline-glue-precompiled-wasm-startup-init-single-threaded",`,
  `  build: "${NEW_BOX3D_BUILD}",`, "Box3D build identity");

runtime = replaceOnce(runtime,
  `import Box3D from "box3d.js/inline";\nimport box3dWasm from "../node_modules/box3d.js/dist/box3d.wasm";`,
  `// I4a: one pinned custom artifact is used by both Worker and browser.\n// @ts-ignore generated pinned Emscripten module has no TypeScript declaration\nimport Box3D from "../public/world-v0/box3d-i4/box3d.inline.mjs";\nimport box3dWasm from "../public/world-v0/box3d-i4/box3d.wasm";`,
  "Worker custom Box3D imports");
runtime = replaceOnce(runtime,
  `  build: "inline-glue-precompiled-wasm-startup-init-single-threaded",`,
  `  build: "${NEW_BOX3D_BUILD}",`, "Worker Box3D build identity");

server = replaceOnce(server,
  `        body: this.createPlayerBody(start),`,
  `        body: this.createPlayerBody(start, \`actor:\${slot}\`),`, "actor locator call");
server = replaceOnce(server,
  `      b3.b3Body_SetName(body, authored.id);`,
  `      // I4 authority recording locator: must match the browser replay locator exactly.\n      b3.b3Body_SetName(body, \`prop:\${authored.id}\`);`, "prop recording locator");
server = replaceOnce(server,
  `  private createPlayerBody(start: readonly [number, number, number]): BodyId {\n    if (!this.world) throw new Error("world_not_ready");\n    const bodyDef = b3.b3DefaultBodyDef();\n    bodyDef.type = b3.b3BodyType.b3_dynamicBody;\n    bodyDef.position = [...start];\n    bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;\n    bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;\n    const body = b3.b3CreateBody(this.world, bodyDef);\n    const shapeDef = b3.b3DefaultShapeDef();`,
  `  private createPlayerBody(start: readonly [number, number, number], locator: string): BodyId {\n    if (!this.world) throw new Error("world_not_ready");\n    const bodyDef = b3.b3DefaultBodyDef();\n    bodyDef.type = b3.b3BodyType.b3_dynamicBody;\n    bodyDef.position = [...start];\n    bodyDef.linearDamping = WORLD_V0_PLAYER_PHYSICS.linearDamping;\n    bodyDef.angularDamping = WORLD_V0_PLAYER_PHYSICS.angularDamping;\n    const body = b3.b3CreateBody(this.world, bodyDef);\n    // I4 authority recording locator: ActorSession slot maps to the browser actor locator.\n    b3.b3Body_SetName(body, locator);\n    const shapeDef = b3.b3DefaultShapeDef();`,
  "actor recording locator");

browser = replaceOnce(browser,
  `  WORLD_V0_BOX3D_PACKAGE,\n  WORLD_V0_BOX3D_URL,`,
  `  WORLD_V0_BOX3D_PACKAGE,\n  WORLD_V0_BOX3D_BUILD,\n  WORLD_V0_BOX3D_URL,`, "browser Box3D build import");
browser = replaceOnce(browser,
  `    "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording", "b3Recording_GetSize",\n    "b3RecPlayer_CreateFromRecording",`,
  `    "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording", "b3Recording_GetSize",\n    "b3Recording_CopyData", "b3RecPlayer_CreateFromBytes", "b3Bytes_Fnv1a32",\n    "b3RecPlayer_CreateFromRecording",`, "browser raw-seed capabilities");
browser = replaceOnce(browser,
  `  if (contract.box3dRuntime?.package !== WORLD_V0_BOX3D_PACKAGE) throw new Error(\`\${phase} Box3D package mismatch \${contract.box3dRuntime?.package}\`);`,
  `  if (contract.box3dRuntime?.package !== WORLD_V0_BOX3D_PACKAGE) throw new Error(\`\${phase} Box3D package mismatch \${contract.box3dRuntime?.package}\`);\n  if (contract.box3dRuntime?.build !== WORLD_V0_BOX3D_BUILD) throw new Error(\`\${phase} Box3D build mismatch \${contract.box3dRuntime?.build}\`);`,
  "browser Box3D build guard");

if (!contract.includes(NEW_CONTRACT) || !contract.includes(NEW_SERVER) || !contract.includes(NEW_CLIENT) ||
    !contract.includes(NEW_BOX3D_BUILD) || !runtime.includes("../public/world-v0/box3d-i4/box3d.inline.mjs") ||
    !server.includes("`prop:${authored.id}`") || !server.includes("createPlayerBody(start, `actor:${slot}`)") ||
    !browser.includes("b3Recording_CopyData") || !browser.includes("WORLD_V0_BOX3D_BUILD")) {
  throw new Error("I4a patch postcondition failed");
}

writeFileSync(contractPath, contract);
writeFileSync(runtimePath, runtime);
writeFileSync(serverPath, server);
writeFileSync(browserPath, browser);
console.log("WORLD_V0_I4A_APPLY PASS");
