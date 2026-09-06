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

const finalNeedle = `  const finalA = await evidence(clients[0]);\n  const finalB = await evidence(clients[1]);\n  validateFinalEvidence(finalA, "clientA");\n  validateFinalEvidence(finalB, "clientB");`;
if (!source.includes(finalNeedle)) throw new Error("I3 Chromium final-evidence marker missing");
const assertions = `  const finalA = await evidence(clients[0]);\n  const finalB = await evidence(clients[1]);\n  validateFinalEvidence(finalA, "clientA");\n  validateFinalEvidence(finalB, "clientB");\n  assert(finalB.metrics.maxFrameMs >= ${Math.floor(rafMs * 0.65)}, \`stressed rAF cadence not observed: maxFrameMs=\${finalB.metrics.maxFrameMs}\`);\n  if (${JSON.stringify(mode)} === "baseline") {\n    assert(finalB.metrics.serverLate > 0, \`baseline rAF-coupled input unexpectedly had zero late records at ${rafMs}ms cadence\`);\n    assert(!finalB.inputScheduler, "baseline unexpectedly exposes I3 scheduler evidence");\n  } else {\n    assert(finalB.inputScheduler?.ownsCanonicalAuthorship === true, "candidate scheduler ownership evidence missing");\n    assert(finalB.inputScheduler?.active === true, "candidate scheduler not active");\n    assert(finalB.inputScheduler?.pumps > 20, \`candidate scheduler pump count too low \${finalB.inputScheduler?.pumps}\`);\n    assert(finalB.metrics.serverLate === 0, \`candidate still produced late canonical input under rAF-only starvation: \${finalB.metrics.serverLate}\`);\n    assert(finalB.metrics.leaseExpiredSeen === 0, \`candidate hit input lease under rAF-only starvation: \${finalB.metrics.leaseExpiredSeen}\`);\n  }\n  console.log("WORLD_V0_I3_RAF_RESULT " + JSON.stringify({\n    mode: ${JSON.stringify(mode)},\n    cadenceMs: ${rafMs},\n    stressed: {\n      serverLate: finalB.metrics.serverLate,\n      leaseExpiredSeen: finalB.metrics.leaseExpiredSeen,\n      maxFrameMs: finalB.metrics.maxFrameMs,\n      localBoundaryTick: finalB.localBoundaryTick,\n      scheduler: finalB.inputScheduler || null,\n    },\n    healthy: { serverLate: finalA.metrics.serverLate, leaseExpiredSeen: finalA.metrics.leaseExpiredSeen },\n  }));`;
source = source.replace(finalNeedle, assertions);

writeFileSync(generatedPath, source);
try {
  await import(`${pathToFileURL(generatedPath).href}?mode=${mode}&run=${Date.now()}`);
  console.log(`WORLD_V0_INTEGRATION_I3_CHROMIUM_${mode.toUpperCase()}_PASS`);
} finally {
  try { rmSync(generatedPath, { force: true }); } catch { /* cleanup only */ }
}
