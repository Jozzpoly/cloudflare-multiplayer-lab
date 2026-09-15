import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-phase-delay-remote-v13-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V13 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V13 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V6Node-${Date.now().toString(36)}`", "`V13Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v6-${Date.now().toString(36)}`", "`v13-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V6Browser'", "c.value='V13Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-active-peer-v6", "world-v0-smoothness-phase-delay-remote-v13", "result revision");
replaceOnce(
  "typeof window.__mwRenderProbeV3StartSampler==='function')()",
  "typeof window.__mwRenderProbeV3StartSampler==='function' && typeof window.__mwV11ResetConfirmedTimeline==='function' && typeof window.__mwV13Enable==='function')()",
  "V13 bootstrap controls"
);

replaceOnce(
  "  await sleep(900);\n\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  await sleep(900);\n  await cdp.eval(sessionId, \"(() => { window.__mwV11ResetConfirmedTimeline(); window.__mwV13ResetAll(); return true; })()\");\n  const presentationReady = await waitFor(cdp, page, `(() => window.__mwV13CommittedAnchorCount?.() >= 3 ? { anchors: window.__mwV13CommittedAnchorCount(), boundary: window.__sharedYardV0Evidence?.()?.localBoundaryTick } : false)()`, \"V13 confirmed anchor warmup\", 30_000);\n  const presentationEnabled = await cdp.eval(sessionId, \"window.__mwV13Enable()\");\n  assert(presentationEnabled === true, \"V13 failed to enable phase-delay remote presentation\");\n  await sleep(650);\n\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "warm confirmed timeline before control sample"
);

replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"(() => { window.__mwRenderProbeV6ResetCorrections(); window.__mwV11StartSampler(); window.__mwV13ResetMetrics(); window.__mwRenderProbeV3StartSampler(); return true; })()\");",
  "V13 measured-window reset"
);

replaceOnce(
  "  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");",
  "  await cdp.eval(sessionId, \"window.__mwV11StopSampler()\");\n  const samples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");\n  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const v13Snapshot = await cdp.eval(sessionId, \"(() => ({ correctionVectors: window.__mwRenderProbeV6ReadCorrections(), confirmedTimelineV11: window.__mwV11ReadConfirmedTimeline(), phaseDelayRemoteV13: window.__mwV13ReadPresentation() }))()\");\n  const correctionVectors = v13Snapshot.correctionVectors;\n  const confirmedTimelineV11 = v13Snapshot.confirmedTimelineV11;\n  const phaseDelayRemoteV13 = v13Snapshot.phaseDelayRemoteV13;",
  "V13 measured-window snapshot"
);

replaceOnce(
  "      topology2,",
  "      topology2,\n      presentationReady,",
  "attach V13 warmup evidence"
);
replaceOnce(
  "    correctionVectors,",
  "    correctionVectors,\n    confirmedTimelineV11,\n    phaseDelayRemoteV13,",
  "attach V13 presentation evidence"
);
replaceOnce("render_probe_v6_complete", "phase_delay_remote_v13_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_PHASE_DELAY_REMOTE_V13_TRANSFORMED ${output}`);
