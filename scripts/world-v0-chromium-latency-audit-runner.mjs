import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const latencyMs = Number(process.env.MW_WORLD_V0_AUDIT_LATENCY_MS || 0);
if (!Number.isFinite(latencyMs) || latencyMs < 0) throw new Error(`invalid latency ${latencyMs}`);
const sourcePath = resolve("scripts/world-v0-chromium-cloud-smoke.mjs");
const generatedPath = resolve("scripts/.world-v0-chromium-latency-generated.mjs");
const source = readFileSync(sourcePath, "utf8");
const needle = '    await cdp.call("Page.enable", {}, sessionId);\n';
if (!source.includes(needle)) throw new Error("Chromium smoke patch anchor missing");
const injection = `${needle}\n    if (index === 1 && Number(process.env.MW_WORLD_V0_AUDIT_LATENCY_MS || 0) > 0) {\n      await cdp.call("Network.enable", {}, sessionId);\n      await cdp.call("Network.emulateNetworkConditions", {\n        offline: false,\n        latency: Number(process.env.MW_WORLD_V0_AUDIT_LATENCY_MS),\n        downloadThroughput: -1,\n        uploadThroughput: -1,\n        connectionType: "cellular4g",\n      }, sessionId);\n    }\n`;
writeFileSync(generatedPath, source.replace(needle, injection));
console.log(`WORLD_V0_CHROMIUM_LATENCY_AUDIT configuredClient1LatencyMs=${latencyMs}`);
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  try { rmSync(generatedPath, { force: true }); } catch { /* runner cleanup */ }
}
