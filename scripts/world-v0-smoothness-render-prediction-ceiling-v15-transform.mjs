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
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV15ResetPredictionCeiling==='function' && typeof window.__mwV15ReadPredictionCeiling==='function' && typeof window.__mwV15SetAuthorityDelay==='function' && typeof window.__mwV15ResetAuthorityDelay==='function' && typeof window.__mwV15ReadAuthorityDelay==='function')()",
  "V15 bootstrap controls",
);

// V15 does not use whole-connection CDP latency. Bootstrap/topology/control stay canonical, then
// only authority-bearing state delivery is delayed in-browser while pong phase anchors remain live.
replaceOnce(
  "  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n  await sleep(900);",
  "  await sleep(900);",
  "remove whole-connection latency",
);
replaceOnce(
  "  await sleep(2500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "  await sleep(3200);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "lengthen clean control sample",
);
replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV15ResetPredictionCeiling(); window.__mwV15ResetAuthorityDelay(); window.__mwV15SetAuthorityDelay(\" + LATENCY_MS + \"); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V15 measured reset and deterministic authority delay",
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  await cdp.eval(sessionId, \"window.__mwV15SetAuthorityDelay(0)\");\n  await sleep(Math.max(800, LATENCY_MS + 250));\n  const v15Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), predictionCeilingV15: window.__mwV15ReadPredictionCeiling(), authorityDelayV15: window.__mwV15ReadAuthorityDelay() }))()\");\n  const correctionVectors = v15Snapshot.correctionVectors;\n  const predictionCeilingV15 = v15Snapshot.predictionCeilingV15;\n  const authorityDelayV15 = v15Snapshot.authorityDelayV15;\n\n  const result = {",
  "V15 recovery flush and atomic snapshot",
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    predictionCeilingV15,\n    authorityDelayV15,\n    authorityDelayRequestedMsV15: LATENCY_MS,",
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
