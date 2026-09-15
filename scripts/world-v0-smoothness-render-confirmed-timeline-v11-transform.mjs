import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-confirmed-timeline-v11-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V11 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V11 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V11Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v11-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V11Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-confirmed-timeline-v11", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV11ResetConfirmedTimeline==='function' && typeof window.__mwV11ReadConfirmedTimeline==='function')()",
  "V11 bootstrap controls"
);

replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV11ResetConfirmedTimeline(); window.__mwV11StartSampler(); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "atomic V11 measured-window reset"
);

replaceOnce(
  "  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");",
  "  await cdp.eval(sessionId, \"window.__mwV11StopSampler()\");\n  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const v11Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), confirmedTimelineV11: window.__mwV11ReadConfirmedTimeline() }))()\");\n  const correctionVectors = v11Snapshot.correctionVectors;\n  const confirmedTimelineV11 = v11Snapshot.confirmedTimelineV11;",
  "V11 measured-window snapshot"
);

replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    confirmedTimelineV11,",
  "attach V11 evidence"
);
replaceOnce("render_probe_v6_complete", "confirmed_timeline_v11_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_CONFIRMED_TIMELINE_V11_TRANSFORMED ${output}`);
