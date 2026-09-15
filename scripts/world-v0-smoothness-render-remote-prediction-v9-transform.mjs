import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-remote-prediction-v9-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V9 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V9 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V9Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v9-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V9Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-render-remote-prediction-v9", "result revision");
replaceOnce("V6 stress entered recovery path", "V9 stress entered recovery path", "recovery assertion label");
replaceOnce("exactness failed during V6 render probe", "exactness failed during V9 remote prediction probe", "exactness assertion label");

replaceOnce(
  "  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV9ResetRemotePredictionEvidence(); return true; })()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "atomic remote prediction reset"
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  const v9EvidenceBundle = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), remotePredictionV9: window.__mwV9ReadRemotePredictionEvidence() }))()\");\n  const correctionVectors = v9EvidenceBundle.correctionVectors;\n  const remotePredictionV9 = v9EvidenceBundle.remotePredictionV9;\n\n  const result = {",
  "atomic remote prediction evidence read"
);
replaceOnce("    correctionVectors,", "    correctionVectors,\n    remotePredictionV9,", "remote prediction evidence attach");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_REMOTE_PREDICTION_V9_TRANSFORMED ${output}`);
