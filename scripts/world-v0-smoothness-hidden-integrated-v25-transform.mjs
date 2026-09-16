import { readFileSync, writeFileSync } from "node:fs";

const input = "scripts/world-v0-smoothness-hidden-catchup-v21.mjs";
const output = process.env.MW_WORLD_V0_V25_HIDDEN_PROBE ?? "/tmp/world-v0-v25-hidden-probe.mjs";
let source = readFileSync(input, "utf8");
function once(from, to, label) {
  const i = source.indexOf(from);
  if (i < 0 || source.indexOf(from, i + from.length) >= 0) throw new Error(`V25 hidden transform seam ${label}`);
  source = source.slice(0, i) + to + source.slice(i + from.length);
}
once(
  `  const finalB = await evidence(cdp, b);\n  const rafSamples = await cdp.eval(b.sessionId, "window.__mwV21RafSamples ?? []");`,
  `  const finalB = await evidence(cdp, b);\n  const presentationV25 = finalB?.presentation?.remotePresentation ?? null;\n  assert(presentationV25?.revision === "world-v0-remote-confirmed-presentation-v1", "V25 production presentation evidence missing");\n  assert(presentationV25.delayTicks === 12, "V25 remote presentation delay drift");\n  assert(presentationV25.reentryHold === false, "V25 reentry hold did not release");\n  assert(presentationV25.lastReleaseReason === "ready", \`V25 reentry released for unexpected reason: \${presentationV25.lastReleaseReason}\`);\n  assert(Number.isFinite(presentationV25.lastReentryHoldMs) && presentationV25.lastReentryHoldMs > 0 && presentationV25.lastReentryHoldMs < 1500, \`V25 reentry hold duration invalid: \${presentationV25.lastReentryHoldMs}\`);\n  const rafSamples = await cdp.eval(b.sessionId, "window.__mwV21RafSamples ?? []");`,
  "production presentation evidence",
);
once(
  `    revision: "world-v0-smoothness-hidden-catchup-v21-v1",`,
  `    revision: "world-v0-smoothness-hidden-integrated-v25-v1",`,
  "revision",
);
once(
  `    verdict: "WORLD_V0_V21_HIDDEN_CATCHUP_CHARACTERIZED",`,
  `    presentationV25,\n    verdict: "WORLD_V0_V25_HIDDEN_LIFECYCLE_PASS",`,
  "pass verdict",
);
once(
  `verdict: "WORLD_V0_V21_HIDDEN_CATCHUP_NOT_CHARACTERIZED"`,
  `verdict: "WORLD_V0_V25_HIDDEN_LIFECYCLE_FAIL"`,
  "failure verdict",
);
writeFileSync(output, source);
console.log(`WORLD_V0_V25_HIDDEN_PROBE_WRITTEN ${output}`);
