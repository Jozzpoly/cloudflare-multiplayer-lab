import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-history-pressure-v14-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V14 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V14 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V14Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v14-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V14Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-history-pressure-v14", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV14ResetHistoryPressure==='function' && typeof window.__mwV14ReadHistoryPressure==='function')()",
  "V14 bootstrap controls"
);

// V6 deliberately turns latency on immediately after topology-2 and before the control sampler.
// For V14 that makes the history-pressure mechanism eligible during setup, so baseline can resume
// before the measured reset. Keep topology/control at ordinary local latency and turn the exact same
// network pressure on only after the clean control window has passed its unchanged cadence gates.
replaceOnce(
  "  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n  await sleep(900);",
  "  await sleep(900);",
  "V14 defer artificial latency until after control window"
);
replaceOnce(
  "  await sleep(2500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "  await sleep(3200);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "V14 lengthen clean control window without weakening cadence gate"
);
replaceOnce(
  "  assert(controlCadence.validIntervals >= 50, `single-renderer sampler insufficient control intervals ${controlCadence.validIntervals}`);\n\n  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");",
  "  assert(controlCadence.validIntervals >= 50, `single-renderer sampler insufficient control intervals ${controlCadence.validIntervals}`);\n  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n\n  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");",
  "V14 apply artificial latency at measured-window boundary"
);
replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV14ResetHistoryPressure(); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V14 measured-window reset"
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  const v14Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), historyPressureV14: window.__mwV14ReadHistoryPressure() }))()\");\n  const correctionVectors = v14Snapshot.correctionVectors;\n  const historyPressureV14 = v14Snapshot.historyPressureV14;\n\n  const result = {",
  "V14 atomic pressure snapshot"
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    historyPressureV14,",
  "attach V14 pressure evidence"
);
replaceOnce(
  "  assert(result.authoritySilenceResumeDelta === 0, \"V6 stress entered recovery path\");",
  "  // V14 deliberately characterizes whether history pressure does or does not trigger\n  // ActorSession resume. Do not fail the source capture solely because baseline resumes.",
  "allow V14 baseline recovery characterization"
);
replaceOnce("render_probe_v6_complete", "history_pressure_v14_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_HISTORY_PRESSURE_V14_TRANSFORMED ${output}`);
