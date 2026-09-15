import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-ordered-ceiling-v17-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V17 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V17 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V17Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v17-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V17Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-ordered-ceiling-v17", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV15ResetPredictionCeiling==='function' && typeof window.__mwV15ReadPredictionCeiling==='function' && typeof window.__mwV17SetOrderedInboundDelay==='function' && typeof window.__mwV17ResetOrderedInbound==='function' && typeof window.__mwV17ReadOrderedInbound==='function')()",
  "V17 bootstrap controls",
);

// V17 uses no CDP network emulation. The browser receives a legal ordered WebSocket stream whose
// delivery to canonical handlers is uniformly delayed by one FIFO queue during the measured phase.
replaceOnce(
  "  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n  await sleep(900);",
  "  await sleep(900);",
  "remove whole-connection latency",
);
replaceOnce(
  "  await sleep(2500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "  await sleep(3200);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "lengthen clean control window without weakening cadence gate",
);
replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV15ResetPredictionCeiling(); window.__mwV17ResetOrderedInbound(); window.__mwV17SetOrderedInboundDelay(\" + LATENCY_MS + \"); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V17 measured reset and ordered delay",
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  await cdp.eval(sessionId, \"window.__mwV17SetOrderedInboundDelay(0)\");\n  await sleep(Math.max(1000, LATENCY_MS + 450));\n  const v17Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), predictionCeilingV15: window.__mwV15ReadPredictionCeiling(), orderedInboundV17: window.__mwV17ReadOrderedInbound() }))()\");\n  const correctionVectors = v17Snapshot.correctionVectors;\n  const predictionCeilingV15 = v17Snapshot.predictionCeilingV15;\n  const orderedInboundV17 = v17Snapshot.orderedInboundV17;\n\n  const result = {",
  "V17 ordered backlog drain and atomic snapshot",
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    predictionCeilingV15,\n    orderedInboundV17,\n    orderedInboundDelayRequestedMsV17: LATENCY_MS,",
  "attach V17 evidence",
);
replaceOnce(
  "  assert(result.authoritySilenceResumeDelta === 0, \"V6 stress entered recovery path\");",
  "  // V17 explicitly compares canonical resume against hard prediction ceiling under ordered\n  // receive lag. Recovery/exactness are classified by the analyzer instead of aborting capture.",
  "allow V17 semantic characterization",
);
replaceOnce("render_probe_v6_complete", "ordered_ceiling_v17_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_ORDERED_CEILING_V17_TRANSFORMED ${output}`);
