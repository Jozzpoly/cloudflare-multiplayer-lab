import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_RENDER_PROBE_V6_CORRECTION_VECTORS";
let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("render probe v6 correction-vector hook already installed");
  process.exit(0);
}

const needle = `  const after = captureDynamic(localState.sim);\n  const delta = correctionDelta(before, after);`;
if (!source.includes(needle)) throw new Error("render probe v6 could not find correction capture seam");

const replacement = `${needle}\n  // ${marker} — test-only CI evidence. Canonical source is restored after the run.\n  if (Array.isArray(window.__mwRenderProbeV6Corrections)) {\n    const probeVector = (a, z) => a && z ? [z[0] - a[0], z[1] - a[1], z[2] - a[2]] : [0, 0, 0];\n    const selfBeforeProbe = before.actors.get(selfSessionId)?.position;\n    const selfAfterProbe = after.actors.get(selfSessionId)?.position;\n    const remoteBeforeProbe = before.actors.get(remoteSessionId)?.position;\n    const remoteAfterProbe = after.actors.get(remoteSessionId)?.position;\n    let maxPropIdProbe = null;\n    let maxPropVectorProbe = [0, 0, 0];\n    let maxPropMagnitudeProbe = 0;\n    for (const [propIdProbe, propBeforeProbe] of before.props) {\n      const propAfterProbe = after.props.get(propIdProbe);\n      if (!propAfterProbe) continue;\n      const vectorProbe = probeVector(propBeforeProbe.position, propAfterProbe.position);\n      const magnitudeProbe = Math.hypot(vectorProbe[0], vectorProbe[1], vectorProbe[2]);\n      if (magnitudeProbe > maxPropMagnitudeProbe) {\n        maxPropMagnitudeProbe = magnitudeProbe;\n        maxPropIdProbe = propIdProbe;\n        maxPropVectorProbe = vectorProbe;\n      }\n    }\n    window.__mwRenderProbeV6Corrections.push({\n      t: performance.now(),\n      reason,\n      targetTick,\n      boundaryBefore: currentBoundary,\n      selfVector: probeVector(selfBeforeProbe, selfAfterProbe),\n      remoteVector: probeVector(remoteBeforeProbe, remoteAfterProbe),\n      propId: maxPropIdProbe,\n      propVector: maxPropVectorProbe,\n      delta: { ...delta },\n    });\n    if (window.__mwRenderProbeV6Corrections.length > 2048) {\n      window.__mwRenderProbeV6Corrections.splice(0, window.__mwRenderProbeV6Corrections.length - 2048);\n    }\n  }`;
source = source.replace(needle, replacement);
source += `\n// ${marker} public test controls.\nwindow.__mwRenderProbeV6Corrections = [];\nwindow.__mwRenderProbeV6ResetCorrections = () => { window.__mwRenderProbeV6Corrections = []; return true; };\nwindow.__mwRenderProbeV6ReadCorrections = () => window.__mwRenderProbeV6Corrections.map((event) => ({ ...event, selfVector: [...event.selfVector], remoteVector: [...event.remoteVector], propVector: [...event.propVector], delta: { ...event.delta } }));\n`;

writeFileSync(path, source);
console.log("WORLD_V0_RENDER_PROBE_V6_CORRECTION_VECTORS_INSTALLED");
