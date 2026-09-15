import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-prediction-ceiling-v15-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V15 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V15 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V15Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v15-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V15Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-prediction-ceiling-v15", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV15ResetPredictionCeiling==='function' && typeof window.__mwV15ReadPredictionCeiling==='function')()",
  "V15 bootstrap controls",
);

// Keep bootstrap/topology/control at ordinary local latency. The pressure phase begins only at the
// measured boundary, so baseline recovery and ceiling behavior are compared under the same stimulus.
replaceOnce(
  "  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n  await sleep(900);",
  "  await sleep(900);",
  "defer artificial latency until measured phase",
);
replaceOnce(
  "  await sleep(2500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "  await sleep(3200);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "lengthen clean control sample",
);
replaceOnce(
  "  assert(controlCadence.validIntervals >= 50, `single-renderer sampler insufficient control intervals ${controlCadence.validIntervals}`);\n\n  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");",
  "  assert(controlCadence.validIntervals >= 50, `single-renderer sampler insufficient control intervals ${controlCadence.validIntervals}`);\n  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n\n  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");",
  "apply artificial latency at measured boundary",
);
replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV15ResetPredictionCeiling(); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V15 measured reset",
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  const v15Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), predictionCeilingV15: window.__mwV15ReadPredictionCeiling() }))()\");\n  const correctionVectors = v15Snapshot.correctionVectors;\n  const predictionCeilingV15 = v15Snapshot.predictionCeilingV15;\n\n  const result = {",
  "V15 atomic snapshot",
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    predictionCeilingV15,",
  "attach V15 evidence",
);
replaceOnce(
  "  assert(result.authoritySilenceResumeDelta === 0, \"V6 stress entered recovery path\");",
  "  // V15 deliberately compares canonical baseline resume against prediction-ceiling semantics.\n  // Do not fail source capture solely because the baseline uses ActorSession recovery.",
  "allow baseline recovery characterization",
);
replaceOnce("render_probe_v6_complete", "prediction_ceiling_v15_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_PREDICTION_CEILING_V15_TRANSFORMED ${output}`);
