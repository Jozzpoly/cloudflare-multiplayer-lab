import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const latencyMs = Number(process.env.MW_WORLD_V0_MOBILE_PRESSURE_LATENCY_MS || 100);
const cpuRate = Number(process.env.MW_WORLD_V0_MOBILE_PRESSURE_CPU_RATE || 4);
const stallMs = Number(process.env.MW_WORLD_V0_MOBILE_PRESSURE_STALL_MS || 120);
const stallCount = Number(process.env.MW_WORLD_V0_MOBILE_PRESSURE_STALL_COUNT || 10);
const gapMs = Number(process.env.MW_WORLD_V0_MOBILE_PRESSURE_GAP_MS || 220);
for (const [name, value] of Object.entries({ latencyMs, cpuRate, stallMs, stallCount, gapMs })) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid ${name}=${value}`);
}

const sourcePath = resolve("scripts/world-v0-chromium-cloud-smoke.mjs");
const generatedPath = resolve("scripts/.world-v0-chromium-mobile-pressure-generated.mjs");
const source = readFileSync(sourcePath, "utf8");
const setupNeedle = '    await cdp.call("Page.enable", {}, sessionId);\n';
const movementNeedle = '  await dispatchMovement(clients[1], "KeyA", true);\n';
if (!source.includes(setupNeedle) || !source.includes(movementNeedle)) throw new Error("mobile-pressure patch anchor missing");

const setupInjection = `${setupNeedle}
    if (index === 1) {
      await cdp.call("Network.enable", {}, sessionId);
      await cdp.call("Network.emulateNetworkConditions", {
        offline: false,
        latency: ${latencyMs},
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: "cellular4g",
      }, sessionId);
      await cdp.call("Emulation.setCPUThrottlingRate", { rate: ${cpuRate} }, sessionId);
      await cdp.call("Emulation.setDeviceMetricsOverride", {
        width: 412,
        height: 915,
        deviceScaleFactor: 3,
        mobile: true,
        screenWidth: 412,
        screenHeight: 915,
      }, sessionId);
    }
`;

const movementInjection = `${movementNeedle}
  await waitFor(
    clients[1],
    \`(() => { const e = window.__sharedYardV0Evidence?.(); return Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 40; })()\`,
    "mobile-pressure client active",
  );
  console.log("WORLD_V0_MOBILE_PRESSURE_BEGIN " + JSON.stringify({
    latencyMs: ${latencyMs}, cpuRate: ${cpuRate}, stallMs: ${stallMs}, stallCount: ${stallCount}, gapMs: ${gapMs}
  }));
  for (let i = 0; i < ${stallCount}; i += 1) {
    await clients[1].cdp.evaluate(
      clients[1].page.sessionId,
      \`(() => { const until = performance.now() + ${stallMs}; while (performance.now() < until) {} return true; })()\`,
    );
    if (i + 1 < ${stallCount}) await sleep(${gapMs});
    const e = await evidence(clients[1]);
    console.log("WORLD_V0_MOBILE_PRESSURE_SAMPLE " + JSON.stringify({
      i,
      boundary: e?.localBoundaryTick,
      networkState: e?.networkState,
      runtimeFailed: e?.runtimeFailed,
      late: e?.metrics?.serverLate,
      lease: e?.metrics?.leaseExpiredSeen,
      guards: [e?.metrics?.guardMatches, e?.metrics?.guardMismatches],
      firstStateMismatch: e?.metrics?.firstStateMismatch,
      corrections: e?.metrics?.corrections,
      maxRewind: e?.metrics?.maxRewind,
      maxReplay: e?.metrics?.maxReplaySteps,
      rtt: e?.rtt,
      frame: { p95Ms: e?.frame?.p95Ms, maxMs: e?.frame?.maxMs, longFrames: e?.frame?.longFrames },
      sessionEnd: e?.session?.end,
    }));
    if (e?.runtimeFailed || e?.session?.end) break;
  }
`;

const generated = source.replace(setupNeedle, setupInjection).replace(movementNeedle, movementInjection);
writeFileSync(generatedPath, generated);
console.log("WORLD_V0_CHROMIUM_MOBILE_PRESSURE configured=" + JSON.stringify({ latencyMs, cpuRate, stallMs, stallCount, gapMs }));
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  try { rmSync(generatedPath, { force: true }); } catch { /* cleanup */ }
}
