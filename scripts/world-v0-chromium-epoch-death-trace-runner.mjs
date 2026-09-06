import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const stallMs = Number(process.env.MW_WORLD_V0_AUDIT_STALL_MS || 750);
if (!Number.isFinite(stallMs) || stallMs <= 0) throw new Error(`invalid stall ${stallMs}`);
const traceOutput = process.env.MW_WORLD_V0_EPOCH_TRACE_OUTPUT || `world-v0-epoch-death-trace-${stallMs}.json`;
const sourcePath = resolve("scripts/world-v0-chromium-cloud-smoke.mjs");
const generatedPath = resolve("scripts/.world-v0-chromium-epoch-death-trace-generated.mjs");
const source = readFileSync(sourcePath, "utf8");
const needle = '  await dispatchMovement(clients[1], "KeyA", true);\n';
if (!source.includes(needle)) throw new Error("Chromium smoke epoch-death trace patch anchor missing");

const injection = `${needle}
  await waitFor(
    clients[1],
    \`(() => { const e = window.__sharedYardV0Evidence?.(); return Number.isInteger(e?.protocolStartTick) && e.localBoundaryTick >= e.protocolStartTick + 60; })()\`,
    "stressed client active pre-stall",
  );

  const compactEpochTraceEvidence = (value) => value ? ({
    identity: value.identity || null,
    networkState: value.networkState ?? null,
    runtimeFailed: value.runtimeFailed ?? null,
    runtimeFailureReason: value.runtimeFailureReason ?? null,
    boundary: value.localBoundaryTick ?? null,
    protocolStartTick: value.protocolStartTick ?? null,
    sessionEnd: value.session?.end || null,
    roomRecovery: value.session?.roomRecovery || null,
    metrics: {
      serverLate: value.metrics?.serverLate ?? null,
      leaseExpiredSeen: value.metrics?.leaseExpiredSeen ?? null,
      guardMatches: value.metrics?.guardMatches ?? null,
      guardMismatches: value.metrics?.guardMismatches ?? null,
      firstStateMismatch: value.metrics?.firstStateMismatch ?? null,
      corrections: value.metrics?.corrections ?? null,
      maxRewind: value.metrics?.maxRewind ?? null,
      maxReplaySteps: value.metrics?.maxReplaySteps ?? null,
    },
    frame: {
      p95Ms: value.frame?.p95Ms ?? null,
      maxMs: value.frame?.maxMs ?? null,
      longFrames: value.frame?.longFrames ?? null,
    },
    lifecycleTail: Array.isArray(value.lifecycleEvents) ? value.lifecycleEvents.slice(-12) : [],
    persistedReason: value.persistedReason ?? null,
  }) : null;

  const preStall = await Promise.all(clients.map(evidence));
  const sourceEpoch = preStall[0]?.identity?.worldEpoch || null;
  console.log("WORLD_V0_EPOCH_DEATH_TRACE_BEGIN stallMs=${stallMs} sourceEpoch=" + sourceEpoch);
  const stallStartedAt = Date.now();
  await clients[1].cdp.evaluate(clients[1].page.sessionId, \`(() => { const until = performance.now() + ${stallMs}; while (performance.now() < until) {} return true; })()\`);
  const stallEndedAt = Date.now();

  const samples = [];
  const traceDeadline = Date.now() + 5000;
  let bothRecovered = false;
  while (Date.now() < traceDeadline) {
    const current = await Promise.all(clients.map(async (client) => {
      try { return await evidence(client); } catch (error) { return { evidenceReadError: error instanceof Error ? error.message : String(error) }; }
    }));
    const last = await Promise.all(clients.map(async (client) => {
      try {
        return await client.cdp.evaluate(client.page.sessionId, `window.__sharedYardV0LastEvidence ? window.__sharedYardV0LastEvidence() : null`);
      } catch (error) {
        return { evidenceReadError: error instanceof Error ? error.message : String(error) };
      }
    }));
    samples.push({
      offsetMs: Date.now() - stallEndedAt,
      current: current.map(compactEpochTraceEvidence),
      last: last.map(compactEpochTraceEvidence),
    });
    bothRecovered = current.every((value) => value?.identity?.worldEpoch && value.identity.worldEpoch !== sourceEpoch && value?.session?.roomRecovery?.lastRecoveredEpoch === value.identity.worldEpoch);
    if (bothRecovered) break;
    await sleep(80);
  }

  const finalCurrent = await Promise.all(clients.map(evidence));
  const finalLast = await Promise.all(clients.map((client) => client.cdp.evaluate(
    client.page.sessionId,
    `window.__sharedYardV0LastEvidence ? window.__sharedYardV0LastEvidence() : null`,
  )));
  const trace = {
    revision: "world-v0-epoch-death-trace-v1",
    stallMs: ${stallMs},
    stallWallMs: stallEndedAt - stallStartedAt,
    sourceEpoch,
    bothRecovered,
    preStall: preStall.map(compactEpochTraceEvidence),
    finalCurrent: finalCurrent.map(compactEpochTraceEvidence),
    finalLast: finalLast.map(compactEpochTraceEvidence),
    samples,
  };
  writeFileSync(${JSON.stringify(traceOutput)}, JSON.stringify(trace, null, 2));
  console.log("WORLD_V0_EPOCH_DEATH_TRACE", JSON.stringify({
    stallMs: trace.stallMs,
    stallWallMs: trace.stallWallMs,
    sourceEpoch: trace.sourceEpoch,
    bothRecovered: trace.bothRecovered,
    pre: trace.preStall.map((e) => ({ boundary: e?.boundary, late: e?.metrics?.serverLate, guards: [e?.metrics?.guardMatches, e?.metrics?.guardMismatches] })),
    last: trace.finalLast.map((e) => ({ end: e?.sessionEnd, persistedReason: e?.persistedReason, late: e?.metrics?.serverLate, lease: e?.metrics?.leaseExpiredSeen, guards: [e?.metrics?.guardMatches, e?.metrics?.guardMismatches] })),
    current: trace.finalCurrent.map((e) => ({ epoch: e?.identity?.worldEpoch, boundary: e?.boundary, recovered: e?.roomRecovery?.lastRecoveredEpoch })),
  }, null, 2));
`;

writeFileSync(generatedPath, source.replace(needle, injection));
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  try { rmSync(generatedPath, { force: true }); } catch { /* runner cleanup */ }
}
