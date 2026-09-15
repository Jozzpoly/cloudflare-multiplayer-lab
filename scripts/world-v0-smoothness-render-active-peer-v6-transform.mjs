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
  "  const vectorMagnitude = (vector) => Math.hypot(...vector);\n  const summarizeVectors = (key) => {\n    const values = correctionVectors.map((event) => vectorMagnitude(event[key] || [0, 0, 0]));\n    return {\n      count: values.length,\n      nonzero: values.filter((value) => value > 1e-9).length,\n      p50: percentile(values, 0.5),\n      p95: percentile(values, 0.95),\n      p99: percentile(values, 0.99),\n      max: values.length ? Math.max(...values) : 0,\n    };\n  };\n  result.correctionVectorSummary = {\n    self: summarizeVectors(\"selfVector\"),\n    remote: summarizeVectors(\"remoteVector\"),\n    prop: summarizeVectors(\"propVector\"),\n    note: \"pre-to-post exact correction displacement; characterization only, not an Owner-ready SLO\",\n  };\n\n  assert(result.guardMismatchDelta === 0, \"exactness failed during V6 render probe\");",
  "vector summary"
);
replaceOnce("V4 stress accidentally entered recovery path", "V6 stress accidentally entered recovery path", "recovery assertion label");
replaceOnce("result.stressInfo.steps >= STRESS_MS / 20", "result.stressInfo.steps > 0", "timer-rate non-oracle");
replaceOnce("render_probe_v4_complete", "render_probe_v6_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_ACTIVE_PEER_V6_TRANSFORMED ${output}`);
