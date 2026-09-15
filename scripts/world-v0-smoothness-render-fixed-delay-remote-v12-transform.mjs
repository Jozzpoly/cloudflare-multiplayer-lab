import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-fixed-delay-remote-v12-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V12 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V12 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V12Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v12-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V12Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-fixed-delay-remote-v12", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV11ResetConfirmedTimeline==='function' && typeof window.__mwV12Enable==='function')()",
  "V12 bootstrap controls"
);

replaceOnce(
  "  await sleep(900);\n\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  await sleep(900);\n  await cdp.eval(sessionId, \"(() => { window.__mwV11ResetConfirmedTimeline(); window.__mwV12ResetAll(); return true; })()\");\n  const presentationReady = await waitFor(cdp, page, `(() => window.__mwV12CommittedAnchorCount?.() >= 3 ? { anchors: window.__mwV12CommittedAnchorCount(), boundary: window.__sharedYardV0Evidence?.()?.localBoundaryTick } : false)()`, \"V12 confirmed anchor warmup\", 30_000);\n  const presentationEnabled = await cdp.eval(sessionId, \"window.__mwV12Enable()\");\n  assert(presentationEnabled === true, \"V12 failed to enable fixed-delay remote presentation\");\n  await sleep(650);\n\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "warm confirmed timeline before control sample"
);

replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV11StartSampler(); window.__mwV12ResetMetrics(); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V12 measured-window reset"
);

replaceOnce(
  "  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");",
  "  await cdp.eval(sessionId, \"window.__mwV11StopSampler()\");\n  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const v12Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), confirmedTimelineV11: window.__mwV11ReadConfirmedTimeline(), fixedDelayRemoteV12: window.__mwV12ReadPresentation() }))()\");\n  const correctionVectors = v12Snapshot.correctionVectors;\n  const confirmedTimelineV11 = v12Snapshot.confirmedTimelineV11;\n  const fixedDelayRemoteV12 = v12Snapshot.fixedDelayRemoteV12;",
  "V12 measured-window snapshot"
);

replaceOnce(
  "      topology2,",
  "      topology2,\n      presentationReady,",
  "attach V12 warmup evidence"
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    confirmedTimelineV11,\n    fixedDelayRemoteV12,",
  "attach V12 presentation evidence"
);
replaceOnce("render_probe_v6_complete", "fixed_delay_remote_v12_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_FIXED_DELAY_REMOTE_V12_TRANSFORMED ${output}`);
