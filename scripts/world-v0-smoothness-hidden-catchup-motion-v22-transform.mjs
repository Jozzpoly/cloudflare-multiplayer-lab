import { readFileSync, writeFileSync } from "node:fs";

const sourcePath = "scripts/world-v0-smoothness-hidden-catchup-v21.mjs";
const outputPath = process.env.MW_WORLD_V0_V22_MOTION_PROBE ?? "/tmp/world-v0-smoothness-hidden-catchup-motion-v22.mjs";
let source = readFileSync(sourcePath, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V22 motion transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V22 motion transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  `const assert = (value, message) => { if (!value) throw new Error(message); };`,
  `const assert = (value, message) => { if (!value) throw new Error(message); };\nconst distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);`,
  "distance helper",
);

replaceOnce(
  `  const hiddenBefore = await evidence(cdp, b);\n  await sleep(HIDDEN_MS);\n  const hiddenAfter = await evidence(cdp, b);`,
  `  const hiddenBefore = await evidence(cdp, b);\n  const moverStart = await evidence(cdp, a);\n  const moverSamples = [{ atMs: 0, position: moverStart.livePhysics.selfPosition }];\n  const motionCodes = [\"KeyW\", \"KeyS\", \"KeyD\", \"KeyA\", \"KeyW\", \"KeyS\", \"KeyD\", \"KeyA\", \"KeyW\", \"KeyS\"];\n  const motionStarted = performance.now();\n  for (const code of motionCodes) {\n    await cdp.eval(a.sessionId, \`window.dispatchEvent(new KeyboardEvent('keydown',{code:\${JSON.stringify(code)},bubbles:true})); true\`);\n    await sleep(400);\n    await cdp.eval(a.sessionId, \`window.dispatchEvent(new KeyboardEvent('keyup',{code:\${JSON.stringify(code)},bubbles:true})); true\`);\n    const sample = await evidence(cdp, a);\n    moverSamples.push({ atMs: performance.now() - motionStarted, position: sample.livePhysics.selfPosition });\n    await sleep(40);\n  }\n  const motionElapsed = performance.now() - motionStarted;\n  if (motionElapsed < HIDDEN_MS) await sleep(HIDDEN_MS - motionElapsed);\n  const hiddenAfter = await evidence(cdp, b);\n  let moverPathMeters = 0;\n  for (let i = 1; i < moverSamples.length; i += 1) moverPathMeters += distance3(moverSamples[i - 1].position, moverSamples[i].position);\n  assert(moverPathMeters > 0.5, \`visible peer did not move materially while B hidden: \${moverPathMeters}\`);`,
  "hidden moving-peer interval",
);

replaceOnce(
  `        guardMismatches:e?.metrics?.guardMismatches ?? null,\n      });`,
  `        guardMismatches:e?.metrics?.guardMismatches ?? null,\n        remotePosition:e?.livePhysics?.remotePosition ? [...e.livePhysics.remotePosition] : null,\n      });`,
  "rAF remote position capture",
);

replaceOnce(
  `  const positiveDeltas = boundaryDeltas.filter((x) => x > 0);\n  const catchupIntervals = rafIntervals.filter((x) => x.boundaryDelta > 2 || x.networkState === "prediction backlog");`,
  `  const positiveDeltas = boundaryDeltas.filter((x) => x > 0);\n  const catchupIntervals = rafIntervals.filter((x) => x.boundaryDelta > 2 || x.networkState === "prediction backlog");\n  const remoteStepMeters = [];\n  for (let i = 1; i < rafSamples.length; i += 1) {\n    const from = rafSamples[i - 1]?.remotePosition;\n    const to = rafSamples[i]?.remotePosition;\n    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 3 || to.length !== 3) continue;\n    const step = distance3(from, to);\n    if (step > 1e-6) remoteStepMeters.push(step);\n  }`,
  "remote step metrics",
);

replaceOnce(
  `      hiddenGap,\n    },`,
  `      hiddenGap,\n      moverPathMeters,\n      moverSamples,\n    },`,
  "hidden motion evidence",
);

replaceOnce(
  `      maxBoundaryDeltaPerRaf: positiveDeltas.length ? Math.max(...positiveDeltas) : 0,\n      framesAtOrAbove20Ticks:`,
  `      maxBoundaryDeltaPerRaf: positiveDeltas.length ? Math.max(...positiveDeltas) : 0,\n      remoteStepSampleCount: remoteStepMeters.length,\n      p50RemoteStepMeters: percentile(remoteStepMeters, 0.5),\n      p95RemoteStepMeters: percentile(remoteStepMeters, 0.95),\n      maxRemoteStepMeters: remoteStepMeters.length ? Math.max(...remoteStepMeters) : 0,\n      framesAtOrAbove20Ticks:`,
  "remote step output",
);

replaceOnce(
  `revision: "world-v0-smoothness-hidden-catchup-v21-v1"`,
  `revision: "world-v0-smoothness-hidden-catchup-motion-v22-v1"`,
  "revision",
);
replaceOnce(
  `verdict: "WORLD_V0_V21_HIDDEN_CATCHUP_CHARACTERIZED"`,
  `verdict: "WORLD_V0_V22_HIDDEN_CATCHUP_MOTION_CHARACTERIZED"`,
  "pass verdict object",
);
replaceOnce(
  `console.log(result.verdict);`,
  `console.log(result.verdict);`,
  "verdict log stability",
);
replaceOnce(
  `verdict: "WORLD_V0_V21_HIDDEN_CATCHUP_NOT_CHARACTERIZED"`,
  `verdict: "WORLD_V0_V22_HIDDEN_CATCHUP_MOTION_NOT_CHARACTERIZED"`,
  "failure verdict",
);

writeFileSync(outputPath, source);
console.log(`WORLD_V0_V22_MOTION_PROBE_WRITTEN ${outputPath}`);
