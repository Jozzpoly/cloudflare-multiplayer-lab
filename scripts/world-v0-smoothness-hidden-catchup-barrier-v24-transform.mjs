import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const base = "/tmp/v24-v23-base.mjs";
const out = process.env.MW_WORLD_V0_V24_PROBE ?? "/tmp/v24-reentry-barrier-probe.mjs";
const run = spawnSync(process.execPath, ["scripts/world-v0-smoothness-hidden-catchup-confirmed-v23-transform.mjs"], {
  encoding: "utf8",
  env: { ...process.env, MW_WORLD_V0_V23_PROBE: base },
});
if (run.status !== 0) throw new Error(run.stderr || run.stdout || "V24 base V23 probe generation failed");
let source = readFileSync(base, "utf8");
function once(from, to, label) {
  const i = source.indexOf(from);
  if (i < 0 || source.indexOf(from, i + from.length) >= 0) throw new Error(`V24 seam ${label}`);
  source = source.slice(0, i) + to + source.slice(i + from.length);
}

once(
  `  const presentationV23 = {\n    v13: await cdp.eval(b.sessionId, \`window.__mwV13ReadPresentation?.() ?? null\`),\n    v11: await cdp.eval(b.sessionId, \`window.__mwV11ReadConfirmedTimeline?.() ?? null\`),\n  };`,
  `  const presentationV23 = {\n    v13: await cdp.eval(b.sessionId, \`window.__mwV13ReadPresentation?.() ?? null\`),\n    v11: await cdp.eval(b.sessionId, \`window.__mwV11ReadConfirmedTimeline?.() ?? null\`),\n  };\n  const presentationBarrierV24 = await cdp.eval(b.sessionId, \`window.__mwV24ReadBarrier?.() ?? null\`);\n  assert(presentationBarrierV24 && presentationBarrierV24.hold === false, "V24 presentation barrier did not release");\n  assert(Number.isFinite(presentationBarrierV24.holdDurationMs), "V24 hold duration missing");\n  assert((presentationBarrierV24.renders?.length ?? 0) > 0, "V24 post-release renders missing");`,
  "barrier read",
);
once(
  `    presentationV23,\n    verdict: "WORLD_V0_V23_HIDDEN_CATCHUP_CONFIRMED_PRESENTATION_CHARACTERIZED",`,
  `    presentationV23,\n    presentationBarrierV24,\n    verdict: "WORLD_V0_V24_REENTRY_PRESENTATION_BARRIER_CHARACTERIZED",`,
  "result",
);
once(
  `verdict: "WORLD_V0_V23_HIDDEN_CATCHUP_CONFIRMED_PRESENTATION_NOT_CHARACTERIZED"`,
  `verdict: "WORLD_V0_V24_REENTRY_PRESENTATION_BARRIER_NOT_CHARACTERIZED"`,
  "failure",
);
writeFileSync(out, source);
console.log(`WORLD_V0_V24_BARRIER_PROBE_WRITTEN ${out}`);
