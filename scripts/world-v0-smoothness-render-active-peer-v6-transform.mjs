import { readFileSync, writeFileSync } from "node:fs";

const input = "scripts/world-v0-smoothness-render-discontinuity-v4-probe.mjs";
const output = process.argv[2] || "/tmp/world-v0-smoothness-render-active-peer-v6-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V6 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V6 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("this.sentThrough = null;\n    this.accepted = 0;", "this.sentThrough = null;\n    this.activePhase = null;\n    this.accepted = 0;", "raw peer active phase state");

replaceOnce(
  "  fillZeroFuture() {\n    if (!this.identity || !this.topology || !Number.isInteger(this.protocolStartTick) || this.ws.readyState !== WebSocket.OPEN) return;\n    const horizon = Math.max(this.protocolStartTick, this.latestBoundaryTick + this.predictionLeadTicks - 1);",
  "  fillZeroFuture() {\n    if (!this.identity || !this.topology || !Number.isInteger(this.protocolStartTick) || this.ws.readyState !== WebSocket.OPEN) return;\n    // V6: emulate a real mutable future window. Every ~8 authority ticks the peer changes\n    // current intent and supersedes still-future records instead of knowing future input upfront.\n    const activePhase = Math.floor(Math.max(0, this.latestBoundaryTick - this.protocolStartTick) / 8) % 2;\n    if (this.activePhase !== activePhase) {\n      this.activePhase = activePhase;\n      this.sentThrough = this.latestBoundaryTick;\n    }\n    const horizon = Math.max(this.protocolStartTick, this.latestBoundaryTick + this.predictionLeadTicks - 1);",
  "mutable future window"
);

replaceOnce(
  "        records.push({ targetTick: next, x: 0, z: 0, jump: false });",
  "        records.push({ targetTick: next, x: this.activePhase === 0 ? -1 : 1, z: 0, jump: false });",
  "active raw input"
);

replaceOnce("      sentThrough: this.sentThrough,\n      accepted: this.accepted,", "      sentThrough: this.sentThrough,\n      activePhase: this.activePhase,\n      accepted: this.accepted,", "active phase evidence");
replaceOnce("`V4Node-${Date.now().toString(36)}`", "`V6Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v4-${Date.now().toString(36)}`", "`v6-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V4Browser'", "c.value='V6Browser'", "browser name");
replaceOnce("world-v0-smoothness-render-discontinuity-v4-single-renderer-raw-peer", "world-v0-smoothness-render-active-peer-v6", "result revision");
replaceOnce("Node WebSocket protocol peer with zero canonical input", "Node WebSocket protocol peer with alternating mutable future input and legal supersession", "apparatus description");
replaceOnce(
  "e.metrics.guardMismatches===0 && e.networkState.includes('solo') ? {epoch:e.identity.worldEpoch,boundary:e.localBoundaryTick}",
  "e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && !e.runtimeFailed ? {epoch:e.identity.worldEpoch,boundary:e.localBoundaryTick,authoritySilenceResumes:e.metrics.authoritySilenceResumes,networkState:e.networkState}",
  "accept exact-resumed live solo baseline"
);

// Keep timeout failures evidential: the old helper only retained the boolean predicate result,
// which made a bootstrap regression indistinguishable from a stale assertion.
replaceOnce(
  "  throw new Error(`${label} timeout last=${JSON.stringify(last)}`);",
  "  let debug = null;\n  try {\n    debug = await cdp.eval(page.sessionId, \"(() => ({ href: location.href, readyState: document.readyState, bodyText: document.body?.innerText?.slice(0, 2500) ?? '', evidence: window.__sharedYardV0Evidence?.() ?? null, renderProbeV3: typeof window.__mwRenderProbeV3StartSampler, renderProbeV6: typeof window.__mwRenderProbeV6ReadCorrections }))()\");\n  } catch (debugError) {\n    debug = { diagnosticReadFailed: debugError instanceof Error ? debugError.message : String(debugError) };\n  }\n  throw new Error(`${label} timeout last=${JSON.stringify(last)} debug=${JSON.stringify(debug)}`);",
  "timeout evidence dump"
);

// V4 applies artificial latency before the browser even enters the world. That mixes the
// already-proven authority-silence/recovery pathology into a reconciliation experiment.
// V6 bootstraps the solo + topology-2 state at ordinary local latency, then applies the exact
// same Network.emulateNetworkConditions block only for the control/stress measurement phase.
const latencyBlock = `  await cdp.call("Network.emulateNetworkConditions", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: "wifi",\n  }, sessionId);\n`;
replaceOnce(latencyBlock, "", "defer artificial latency until measured phase");
replaceOnce(
  "  const topology2 = await waitFor(cdp, page, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && !e.runtimeFailed ? {boundary:e.localBoundaryTick, corrections:e.metrics.corrections} : false; })()`, \"browser topology2 after raw late join\", 45_000);\n  await sleep(900);",
  "  const topology2 = await waitFor(cdp, page, `(() => { const e=window.__sharedYardV0Evidence?.(); return e?.lifecycle?.topology?.revision===2 && e.presentation?.remotePresence==='PEER' && e.metrics.guardMismatches===0 && e.networkState.startsWith('live') && !e.runtimeFailed ? {boundary:e.localBoundaryTick, corrections:e.metrics.corrections, authoritySilenceResumes:e.metrics.authoritySilenceResumes} : false; })()`, \"browser topology2 after raw late join\", 45_000);\n  await cdp.call(\"Network.emulateNetworkConditions\", {\n    offline: false,\n    latency: LATENCY_MS,\n    downloadThroughput: 12_500_000,\n    uploadThroughput: 12_500_000,\n    connectionType: \"wifi\",\n  }, sessionId);\n  await sleep(900);",
  "apply artificial latency after stable topology"
);

replaceOnce(
  "  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");\n  await sleep(1500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");\n  await sleep(2500);\n  const controlSamples = await cdp.eval(sessionId, \"window.__mwRenderProbeV3StopSampler()\");",
  "lengthen control sample without weakening interval threshold"
);

replaceOnce(
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "  const before = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV6ResetCorrections()\");\n  await cdp.eval(sessionId, \"window.__mwRenderProbeV3StartSampler()\");",
  "correction vector reset"
);
replaceOnce(
  "  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n\n  const result = {",
  "  const after = await cdp.eval(sessionId, \"window.__sharedYardV0Evidence()\");\n  const correctionVectors = await cdp.eval(sessionId, \"window.__mwRenderProbeV6ReadCorrections()\");\n\n  const result = {",
  "correction vector capture"
);
replaceOnce("    sampleCount: samples.length,", "    sampleCount: samples.length,\n    samples,\n    correctionVectors,", "raw samples and correction vectors");
replaceOnce(
  "  assert(result.guardMismatchDelta === 0, \"exactness failed during V4 render probe\");",
  "  const vectorMagnitude = (vector) => Math.hypot(...vector);\n  const summarizeVectors = (key) => {\n    const values = correctionVectors.map((event) => vectorMagnitude(event[key] || [0, 0, 0]));\n    return {\n      count: values.length,\n      nonzero: values.filter((value) => value > 1e-9).length,\n      p50: percentile(values, 0.5),\n      p95: percentile(values, 0.95),\n      p99: percentile(values, 0.99),\n      max: values.length ? Math.max(...values) : 0,\n    };\n  };\n  result.correctionVectorSummary = {\n    self: summarizeVectors(\"selfVector\"),\n    remote: summarizeVectors(\"remoteVector\"),\n    prop: summarizeVectors(\"propVector\"),\n    note: \"pre-to-post exact correction displacement; characterization only, not an Owner-ready SLO\",\n  };\n  // Preserve characterization even when a downstream invariant fails; the final verdict still\n  // remains fail-closed and this provisional snapshot is overwritten on a clean completion.\n  writeFileSync(OUTPUT, JSON.stringify({ ...result, provisional: true }, null, 2));\n\n  assert(result.guardMismatchDelta === 0, \"exactness failed during V6 render probe\");",
  "vector summary and fail-closed evidence preservation"
);
replaceOnce("V4 stress accidentally entered recovery path", "V6 stress entered recovery path", "recovery assertion label");
replaceOnce("result.stressInfo.steps >= STRESS_MS / 20", "result.stressInfo.steps > 0", "timer-rate non-oracle");
replaceOnce("render_probe_v4_complete", "render_probe_v6_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_ACTIVE_PEER_V6_TRANSFORMED ${output}`);
