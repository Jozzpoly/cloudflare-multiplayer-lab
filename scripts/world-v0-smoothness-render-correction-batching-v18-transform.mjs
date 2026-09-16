import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-ordered-ceiling-v17-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-correction-batching-v18-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V18 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V18 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V17Node-${Date.now().toString(36)}`", "`V18Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v17-${Date.now().toString(36)}`", "`v18-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V17Browser'", "c.value='V18Browser'", "browser name");
replaceOnce("world-v0-smoothness-ordered-ceiling-v17", "world-v0-smoothness-correction-batching-v18", "result revision");
replaceOnce(
  "typeof window.__mwV17ReadOrderedInbound==='function')()",
  "typeof window.__mwV17ReadOrderedInbound==='function' && typeof window.__mwV18FlushCorrectionBatching==='function' && typeof window.__mwV18ResetCorrectionBatching==='function' && typeof window.__mwV18ReadCorrectionBatching==='function')()",
  "V18 bootstrap controls",
);

replaceOnce(
  `  await cdp.eval(sessionId, "(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV15ResetPredictionCeiling(); window.__mwV17ResetOrderedInbound(); window.__mwV17SetOrderedInboundDelay(" + LATENCY_MS + "); window.__mwRenderProbeV3StartSampler(); return true; })()");`,
  `  await cdp.eval(sessionId, "(() => { window.__mwV18FlushCorrectionBatching('measured-reset'); window.__mwV18ResetCorrectionBatching(); window.__mwRenderProbeV6ResetCorrections(); window.__mwV15ResetPredictionCeiling(); window.__mwV17ResetOrderedInbound(); window.__mwV17SetOrderedInboundDelay(" + LATENCY_MS + "); window.__mwRenderProbeV3StartSampler(); return true; })()");`,
  "V18 measured reset",
);

const v17SnapshotBlock = `  await cdp.eval(sessionId, "window.__mwV17SetOrderedInboundDelay(0)");\n  await sleep(Math.max(1000, LATENCY_MS + 450));\n  const v17Snapshot = await cdp.eval(sessionId, "(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), predictionCeilingV15: window.__mwV15ReadPredictionCeiling(), orderedInboundV17: window.__mwV17ReadOrderedInbound() }))()");\n  const correctionVectors = v17Snapshot.correctionVectors;\n  const predictionCeilingV15 = v17Snapshot.predictionCeilingV15;\n  const orderedInboundV17 = v17Snapshot.orderedInboundV17;`;
const v18SnapshotBlock = `  await cdp.eval(sessionId, "window.__mwV17SetOrderedInboundDelay(0)");\n  await sleep(Math.max(1000, LATENCY_MS + 450));\n  await cdp.eval(sessionId, "window.__mwV18FlushCorrectionBatching('final-snapshot')");\n  const v18Snapshot = await cdp.eval(sessionId, "(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), predictionCeilingV15: window.__mwV15ReadPredictionCeiling(), orderedInboundV17: window.__mwV17ReadOrderedInbound(), correctionBatchingV18: window.__mwV18ReadCorrectionBatching() }))()");\n  const correctionVectors = v18Snapshot.correctionVectors;\n  const predictionCeilingV15 = v18Snapshot.predictionCeilingV15;\n  const orderedInboundV17 = v18Snapshot.orderedInboundV17;\n  const correctionBatchingV18 = v18Snapshot.correctionBatchingV18;`;
replaceOnce(v17SnapshotBlock, v18SnapshotBlock, "V18 atomic final snapshot");
replaceOnce(
  "    orderedInboundDelayRequestedMsV17: LATENCY_MS,",
  "    orderedInboundDelayRequestedMsV17: LATENCY_MS,\n    correctionBatchingV18,",
  "attach V18 evidence",
);
replaceOnce("ordered_ceiling_v17_complete", "correction_batching_v18_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_CORRECTION_BATCHING_V18_TRANSFORMED ${output}`);
