import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const base = "/tmp/v23-motion-base.mjs";
const out = process.env.MW_WORLD_V0_V23_PROBE ?? "/tmp/v23-confirmed-probe.mjs";
const run = spawnSync(process.execPath, ["scripts/world-v0-smoothness-hidden-catchup-motion-v22-transform.mjs"], {
  encoding: "utf8",
  env: { ...process.env, MW_WORLD_V0_V22_MOTION_PROBE: base },
});
if (run.status !== 0) throw new Error(run.stderr || run.stdout || "V23 base probe generation failed");
let source = readFileSync(base, "utf8");
function once(from, to, label) {
  const i = source.indexOf(from);
  if (i < 0 || source.indexOf(from, i + from.length) >= 0) throw new Error(`V23 seam ${label}`);
  source = source.slice(0, i) + to + source.slice(i + from.length);
}

once(
  `  const joinedB = await evidence(cdp, b);\n  await cdp.call("Target.activateTarget", { targetId: a.targetId });`,
  `  const joinedB = await evidence(cdp, b);\n  await waitFor(cdp, b, \`window.__mwV13CommittedAnchorCount?.() >= 3\`, "confirmed anchors ready");\n  assert(await cdp.eval(b.sessionId, \`window.__mwV13Enable?.() === true\`), "confirmed presentation enable failed");\n  await cdp.call("Target.activateTarget", { targetId: a.targetId });`,
  "enable",
);
once(
  `  assert(await cdp.eval(b.sessionId, "document.visibilityState") === "hidden", "B not hidden");\n\n  const hiddenBefore = await evidence(cdp, b);`,
  `  assert(await cdp.eval(b.sessionId, "document.visibilityState") === "hidden", "B not hidden");\n  await cdp.eval(b.sessionId, \`window.__mwV13ResetMetrics?.(); true\`);\n\n  const hiddenBefore = await evidence(cdp, b);`,
  "reset",
);
once(
  `  const finalB = await evidence(cdp, b);\n  const rafSamples = await cdp.eval(b.sessionId, "window.__mwV21RafSamples ?? []");`,
  `  const finalB = await evidence(cdp, b);\n  const presentationV23 = {\n    v13: await cdp.eval(b.sessionId, \`window.__mwV13ReadPresentation?.() ?? null\`),\n    v11: await cdp.eval(b.sessionId, \`window.__mwV11ReadConfirmedTimeline?.() ?? null\`),\n  };\n  assert(presentationV23.v13?.samples?.length > 0, "confirmed presentation samples missing");\n  assert((presentationV23.v11?.revisionViolations?.length ?? -1) === 0, "confirmed timeline revision violation");\n  const rafSamples = await cdp.eval(b.sessionId, "window.__mwV21RafSamples ?? []");`,
  "read",
);
once(
  `    verdict: "WORLD_V0_V22_HIDDEN_CATCHUP_MOTION_CHARACTERIZED",`,
  `    presentationV23,\n    verdict: "WORLD_V0_V23_HIDDEN_CATCHUP_CONFIRMED_PRESENTATION_CHARACTERIZED",`,
  "result",
);
once(
  `verdict: "WORLD_V0_V22_HIDDEN_CATCHUP_MOTION_NOT_CHARACTERIZED"`,
  `verdict: "WORLD_V0_V23_HIDDEN_CATCHUP_CONFIRMED_PRESENTATION_NOT_CHARACTERIZED"`,
  "failure",
);
writeFileSync(out, source);
console.log(`WORLD_V0_V23_CONFIRMED_PROBE_WRITTEN ${out}`);
