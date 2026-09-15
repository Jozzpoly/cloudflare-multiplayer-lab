import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_LIGHT_RENDER_PROBE_V1";
const source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("light render probe already installed");
  process.exit(0);
}

const hook = `\n// ${marker} — test-only read hook appended in CI workspace and restored afterward.\nwindow.__mwLightRenderProbe = () => ({\n  self: selfMesh ? [selfMesh.position.x, selfMesh.position.y, selfMesh.position.z] : null,\n  remote: remoteMesh ? [remoteMesh.position.x, remoteMesh.position.y, remoteMesh.position.z] : null,\n  corrections: metrics.corrections,\n  correctionWindowActive: performance.now() < correctionFrameWindowUntil,\n  localBoundaryTick: localState?.boundaryTick ?? null,\n  authorityBoundary: metrics.latestAuthorityBoundary ?? null,\n});\n`;

writeFileSync(path, source + hook);
console.log("WORLD_V0_LIGHT_RENDER_PROBE_INSTALLED");
