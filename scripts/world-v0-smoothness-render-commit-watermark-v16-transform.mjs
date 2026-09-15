import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-commit-watermark-v16-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V16 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V16 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V16Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v16-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V16Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-commit-watermark-v16", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV16ResetCommitCeiling==='function' && typeof window.__mwV16ReadCommitCeiling==='function' && typeof window.__mwV15SetAuthorityDelay==='function' && typeof window.__mwV15ResetAuthorityDelay==='function' && typeof window.__mwV15ReadAuthorityDelay==='function')()",
  "V16 bootstrap controls",
);

// Keep transport, topology, pong phase anchors and the control window canonical. During the measured
// phase only authority-bearing state deliveries are delayed by the test hook; pongs remain immediate.
replaceOnce(
  "  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n  await sleep(900);",
  "  await sleep(900);",
  "remove whole-connection latency",
);
replaceOnce(
  "  await sleep(2500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "  await sleep(3200);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "lengthen clean control sample without weakening cadence gate",
);
replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV16ResetCommitCeiling(); window.__mwV15ResetAuthorityDelay(); window.__mwV15SetAuthorityDelay(\" + LATENCY_MS + \"); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V16 measured reset and deterministic authority delay",
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  await cdp.eval(sessionId, \"window.__mwV15SetAuthorityDelay(0)\");\n  await sleep(Math.max(800, LATENCY_MS + 250));\n  const v16Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), commitWatermarkV16: window.__mwV16ReadCommitCeiling(), authorityDelayV16: window.__mwV15ReadAuthorityDelay() }))()\");\n  const correctionVectors = v16Snapshot.correctionVectors;\n  const commitWatermarkV16 = v16Snapshot.commitWatermarkV16;\n  const authorityDelayV16 = v16Snapshot.authorityDelayV16;\n\n  const result = {",
  "V16 recovery flush and atomic snapshot",
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    commitWatermarkV16,\n    authorityDelayV16,\n    authorityDelayRequestedMsV16: LATENCY_MS,",
  "attach V16 evidence",
);
replaceOnce(
  "  assert(result.authoritySilenceResumeDelta === 0, \"V6 stress entered recovery path\");",
  "  // V16 compares clock-derived and delivered-consumed rewind watermarks. Any resume or\n  // exactness failure is classified by the analyzer instead of aborting evidence capture.",
  "allow V16 semantic characterization",
);
replaceOnce("render_probe_v6_complete", "commit_watermark_v16_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_COMMIT_WATERMARK_V16_TRANSFORMED ${output}`);
