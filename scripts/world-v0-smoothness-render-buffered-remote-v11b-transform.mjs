import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-buffered-remote-v11b-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V11b transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V11b transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V11bNode-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v11b-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V11bBrowser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-buffered-remote-v11b", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV11ResetConfirmedTimeline==='function' && typeof window.__mwV11bEnable==='function')()",
  "V11b bootstrap controls"
);

replaceOnce(
  "  await sleep(900);\n\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  await sleep(900);\n  await cdp.eval(sessionId, \"(() => { window.__mwV11ResetConfirmedTimeline(); window.__mwV11bResetAll(); return true; })()\");\n  const presentationReady = await waitFor(cdp, page, `(() => window.__mwV11bCommittedAnchorCount?.() >= 3 ? { anchors: window.__mwV11bCommittedAnchorCount(), boundary: window.__sharedYardV0Evidence?.()?.localBoundaryTick } : false)()`, \"V11b confirmed anchor warmup\", 30_000);\n  const presentationEnabled = await cdp.eval(sessionId, \"window.__mwV11bEnable()\");\n  assert(presentationEnabled === true, \"V11b failed to enable buffered remote presentation\");\n  await sleep(650);\n\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "warm confirmed timeline before control sample"
);

replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV11StartSampler(); window.__mwV11bResetMetrics(); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V11b measured-window reset"
);

replaceOnce(
  "  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");",
  "  await cdp.eval(sessionId, \"window.__mwV11StopSampler()\");\n  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const v11bSnapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), confirmedTimelineV11: window.__mwV11ReadConfirmedTimeline(), bufferedRemoteV11b: window.__mwV11bReadPresentation() }))()\");\n  const correctionVectors = v11bSnapshot.correctionVectors;\n  const confirmedTimelineV11 = v11bSnapshot.confirmedTimelineV11;\n  const bufferedRemoteV11b = v11bSnapshot.bufferedRemoteV11b;",
  "V11b measured-window snapshot"
);

replaceOnce(
  "      topology2,",
  "      topology2,\n      presentationReady,",
  "attach V11b warmup evidence"
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    confirmedTimelineV11,\n    bufferedRemoteV11b,",
  "attach V11b presentation evidence"
);
replaceOnce("render_probe_v6_complete", "buffered_remote_v11b_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_BUFFERED_REMOTE_V11B_TRANSFORMED ${output}`);
