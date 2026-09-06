import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const stallMs = Number(process.env.MW_WORLD_V0_AUDIT_STALL_MS || 0);
if (!Number.isFinite(stallMs) || stallMs <= 0) throw new Error(`invalid stall ${stallMs}`);
const sourcePath = resolve("scripts/world-v0-chromium-cloud-smoke.mjs");
const generatedPath = resolve("scripts/.world-v0-chromium-stall-generated.mjs");
const source = readFileSync(sourcePath, "utf8");
const needle = '  await dispatchMovement(clients[1], "KeyA", true);\n';
if (!source.includes(needle)) throw new Error("Chromium smoke stall patch anchor missing");
const injection = `${needle}\n  await waitFor(\n    clients[1],\n    \`(() => { const e = window.__sharedYardV0Evidence?.(); return Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 60; })()\`,\n    "stressed client active pre-stall",\n  );\n  console.log("WORLD_V0_CHROMIUM_STALL_AUDIT_BEGIN stallMs=${stallMs}");\n  await clients[1].cdp.evaluate(clients[1].page.sessionId, \`(() => { const until = performance.now() + ${stallMs}; while (performance.now() < until) {} return true; })()\`);\n  console.log("WORLD_V0_CHROMIUM_STALL_AUDIT_END stallMs=${stallMs}");\n`;
writeFileSync(generatedPath, source.replace(needle, injection));
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  try { rmSync(generatedPath, { force: true }); } catch { /* runner cleanup */ }
}
