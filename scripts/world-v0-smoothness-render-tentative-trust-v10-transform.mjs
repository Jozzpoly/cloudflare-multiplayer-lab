import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-tentative-trust-v10-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V10 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V10 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V10Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v10-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V10Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-render-tentative-trust-v10", "result revision");
replaceOnce("V6 stress entered recovery path", "V10 stress entered recovery path", "recovery assertion label");
replaceOnce("exactness failed during V6 render probe", "exactness failed during V10 tentative trust probe", "exactness assertion label");

replaceOnce(
  "  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV10ResetTentativeTrustEvidence(); return true; })()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "atomic tentative trust reset"
);
replaceOnce(
  "  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "  const v10EvidenceBundle = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), tentativeTrustV10: window.__mwV10ReadTentativeTrustEvidence() }))()\");\n  const correctionVectors = v10EvidenceBundle.correctionVectors;\n  const tentativeTrustV10 = v10EvidenceBundle.tentativeTrustV10;\n\n  const result = {",
  "atomic tentative trust evidence read"
);
replaceOnce("    correctionVectors,", "    correctionVectors,\n    tentativeTrustV10,", "tentative trust evidence attach");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_TENTATIVE_TRUST_V10_TRANSFORMED ${output}`);
