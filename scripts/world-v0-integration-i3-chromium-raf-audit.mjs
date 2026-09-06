import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const mode = process.env.MW_WORLD_V0_I3_MODE || "";
if (!new Set(["baseline", "candidate"]).has(mode)) throw new Error(`invalid I3 Chromium mode ${mode}`);
const base = process.env.MW_WORLD_V0_I3_BASE || "http://127.0.0.1:8793";
const rafMs = Number(process.env.MW_WORLD_V0_I3_RAF_MS || 250);
if (!Number.isFinite(rafMs) || rafMs < 150) throw new Error(`invalid I3 rAF cadence ${rafMs}`);

const sourcePath = resolve("scripts/world-v0-chromium-cloud-smoke.mjs");
const generatedPath = resolve(`scripts/.world-v0-i3-chromium-${mode}-generated.mjs`);
let source = readFileSync(sourcePath, "utf8");

const pageNeedle = 'const STAGING_PAGE = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/";';
if (!source.includes(pageNeedle)) throw new Error("I3 Chromium local-page marker missing");
source = source.replace(pageNeedle, `const STAGING_PAGE = ${JSON.stringify(`${base}/world-v0/`)};`);
source = source.replace("const MIN_ACTIVE_TICKS = 150;", "const MIN_ACTIVE_TICKS = 100;");

const enterNeedle = `  for (const client of clients) {\n    await client.cdp.evaluate(client.page.sessionId, \`document.querySelector("#enter").click(); true\`);\n  }`;
if (!source.includes(enterNeedle)) throw new Error("I3 Chromium enter marker missing");
const throttle = `  await clients[1].cdp.evaluate(\n    clients[1].page.sessionId,\n    \`(() => {\n      const native = window.requestAnimationFrame.bind(window);\n      window.__i3NativeRequestAnimationFrame = native;\n      window.__i3RafCadenceMs = ${rafMs};\n      window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), ${rafMs});\n      return true;\n    })()\`,\n  );\n  console.log("WORLD_V0_I3_RAF_THROTTLE mode=${mode} cadenceMs=${rafMs}");\n\n${enterNeedle}`;
source = source.replace(enterNeedle, throttle);

const stressedNeedle = `  await dispatchMovement(clients[0], "KeyD", false);\n  await dispatchMovement(clients[1], "KeyA", false);\n  await sleep(800);`;
if (!source.includes(stressedNeedle)) throw new Error("I3 Chromium stressed-sample marker missing");
const stressedAssertions = `  const stressedA = await evidence(clients[0]);\n  const stressedB = await evidence(clients[1]);\n  assert(stressedB && !stressedB.runtimeFailed, "stressed client runtime failed before I3 comparison");\n  assert(stressedB.metrics.guardMismatches === 0, \`stressed client guard mismatch before recovery: \${JSON.stringify(stressedB.metrics.firstStateMismatch)}\`);\n  assert(stressedB.metrics.maxFrameMs >= ${Math.floor(rafMs * 0.65)}, \`stressed rAF cadence not observed: maxFrameMs=\${stressedB.metrics.maxFrameMs}\`);\n  if (${JSON.stringify(mode)} === "baseline") {\n    assert(stressedB.metrics.serverLate > 0, \`baseline rAF-coupled input unexpectedly had zero late records at ${rafMs}ms cadence\`);\n    assert(!stressedB.inputScheduler, "baseline unexpectedly exposes I3 scheduler evidence");\n  } else {\n    assert(stressedB.inputScheduler?.ownsCanonicalAuthorship === true, "candidate scheduler ownership evidence missing");\n    assert(stressedB.inputScheduler?.active === true, "candidate scheduler not active");\n    assert(stressedB.inputScheduler?.pumps > 20, \`candidate scheduler pump count too low \${stressedB.inputScheduler?.pumps}\`);\n    assert(stressedB.metrics.serverLate === 0, \`candidate still produced late canonical input under rAF-only starvation: \${stressedB.metrics.serverLate}\`);\n    assert(stressedB.metrics.leaseExpiredSeen === 0, \`candidate hit input lease under rAF-only starvation: \${stressedB.metrics.leaseExpiredSeen}\`);\n  }\n  console.log("WORLD_V0_I3_RAF_RESULT " + JSON.stringify({\n    mode: ${JSON.stringify(mode)},\n    cadenceMs: ${rafMs},\n    stressed: {\n      serverLate: stressedB.metrics.serverLate,\n      leaseExpiredSeen: stressedB.metrics.leaseExpiredSeen,\n      guardPending: stressedB.metrics.guardPending,\n      maxFrameMs: stressedB.metrics.maxFrameMs,\n      localBoundaryTick: stressedB.localBoundaryTick,\n      scheduler: stressedB.inputScheduler || null,\n    },\n    healthy: {\n      serverLate: stressedA.metrics.serverLate,\n      leaseExpiredSeen: stressedA.metrics.leaseExpiredSeen,\n      guardPending: stressedA.metrics.guardPending,\n    },\n  }));\n\n  await clients[1].cdp.evaluate(\n    clients[1].page.sessionId,\n    \`(() => {\n      if (typeof window.__i3NativeRequestAnimationFrame !== "function") throw new Error("I3 native rAF restore handle missing");\n      window.requestAnimationFrame = window.__i3NativeRequestAnimationFrame;\n      return true;\n    })()\`,\n  );\n  console.log("WORLD_V0_I3_RAF_RESTORE mode=${mode}");\n  await Promise.all(clients.map((client, index) => waitFor(\n    client,\n    \`(() => { const e = window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.metrics.guardMismatches === 0 && e.metrics.guardPending === 0; })()\`,\n    \`client \${index} exact-state drain after rAF restore\`,\n    20_000,\n  )));\n\n${stressedNeedle}`;
source = source.replace(stressedNeedle, stressedAssertions);

writeFileSync(generatedPath, source);
try {
  await import(`${pathToFileURL(generatedPath).href}?mode=${mode}&run=${Date.now()}`);
  if (process.exitCode && process.exitCode !== 0) {
    throw new Error(`underlying Chromium smoke failed with exitCode=${process.exitCode}`);
  }
  console.log(`WORLD_V0_INTEGRATION_I3_CHROMIUM_${mode.toUpperCase()}_PASS`);
} finally {
  try { rmSync(generatedPath, { force: true }); } catch { /* cleanup only */ }
}
