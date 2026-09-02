import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const RUNNER = "public/world0-rc1/runner.js";
const CONTACT_SCRIPT = "scripts/ws0-player-contact-isolation.mjs";
const OUTPUT = "ws0-actor-state-sync-upper-bound.json";
const MODES = ["none", "transform", "state"];
const DELAYS = process.env.WS0_STATE_SYNC_DELAYS || "65,85";

function replaceOnce(source, oldText, newText, label) {
  const index = source.indexOf(oldText);
  if (index < 0) throw new Error(`runner seam changed: ${label}`);
  if (source.indexOf(oldText, index + oldText.length) >= 0) throw new Error(`runner seam ambiguous: ${label}`);
  return source.slice(0, index) + newText + source.slice(index + oldText.length);
}

function patchRunner(original) {
  let source = original;

  source = replaceOnce(
    source,
    'const callsign = params.get("player") || `rc1-${crypto.randomUUID().slice(0, 6)}`;\n',
    'const callsign = params.get("player") || `rc1-${crypto.randomUUID().slice(0, 6)}`;\n' +
      'const actorSyncMode = params.get("actorSync") || "none";\n' +
      'if (!["none", "transform", "state"].includes(actorSyncMode)) throw new Error(`invalid actorSync: ${actorSyncMode}`);\n',
    "actorSync params",
  );

  source = replaceOnce(
    source,
    'const appliedTraceEvents = [];\n',
    'const appliedTraceEvents = [];\n' +
      'const actorCorrections = {\n' +
      '  self: { count: 0, positionSum: 0, positionMax: 0, velocitySum: 0, velocityMax: 0 },\n' +
      '  remote: { count: 0, positionSum: 0, positionMax: 0, velocitySum: 0, velocityMax: 0 },\n' +
      '};\n',
    "correction stats",
  );

  const bodyPositionBlock = `function bodyPosition(body) {\n  if (!body) return null;\n  const out = [0, 0, 0];\n  b3.b3Body_GetPosition(out, body);\n  return [out[0], out[1], out[2]];\n}\n`;
  const syncHelpers = bodyPositionBlock + `\nfunction bodyLinearVelocity(body) {\n  if (!body) return null;\n  const out = [0, 0, 0];\n  b3.b3Body_GetLinearVelocity(out, body);\n  return [out[0], out[1], out[2]];\n}\n\nfunction vecDistance3(a, b) {\n  if (!Array.isArray(a) || !Array.isArray(b)) return NaN;\n  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);\n}\n\nfunction recordActorCorrection(role, positionDelta, velocityDelta) {\n  const stats = actorCorrections[role];\n  if (!stats || !Number.isFinite(positionDelta) || !Number.isFinite(velocityDelta)) return;\n  stats.count += 1;\n  stats.positionSum += positionDelta;\n  stats.positionMax = Math.max(stats.positionMax, positionDelta);\n  stats.velocitySum += velocityDelta;\n  stats.velocityMax = Math.max(stats.velocityMax, velocityDelta);\n}\n\nfunction applyAuthorityActorSync(body, player, role) {\n  if (actorSyncMode === "none" || !body || !player) return;\n  if (!Array.isArray(player.position) || player.position.length !== 3) throw new Error("actor sync missing authority position");\n  const rotation = Array.isArray(player.rotation) && player.rotation.length === 4 ? player.rotation : [0, 0, 0, 1];\n  const localPosition = bodyPosition(body);\n  const localVelocity = bodyLinearVelocity(body);\n  const positionDelta = vecDistance3(localPosition, player.position);\n\n  b3.b3Body_SetTransform(body, player.position, rotation);\n\n  let velocityDelta = 0;\n  if (actorSyncMode === "state") {\n    if (!Array.isArray(player.velocity) || player.velocity.length !== 3) throw new Error("state sync missing authority velocity");\n    velocityDelta = vecDistance3(localVelocity, player.velocity);\n    b3.b3Body_SetLinearVelocity(body, player.velocity);\n  } else {\n    b3.b3Body_SetLinearVelocity(body, localVelocity);\n  }\n  b3.b3Body_SetAwake(body, true);\n  recordActorCorrection(role, positionDelta, velocityDelta);\n}\n`;
  source = replaceOnce(source, bodyPositionBlock, syncHelpers, "actor sync helpers");

  const authoritySeam = `  if (self && Number.isFinite(self.ack)) latestAck = self.ack;\n  for (const player of players) if (player.sessionId !== selfSessionId) ensureRemote(player);\n  if (local.remote && !players.some((player) => player.sessionId === local.remote.sessionId)) removeRemote(local.remote.sessionId);\n\n  latestTelemetry = message.telemetry || latestTelemetry;\n`;
  const authorityTreatment = `  if (self && Number.isFinite(self.ack)) latestAck = self.ack;\n  for (const player of players) if (player.sessionId !== selfSessionId) ensureRemote(player);\n  if (local.remote && !players.some((player) => player.sessionId === local.remote.sessionId)) removeRemote(local.remote.sessionId);\n\n  if (self) applyAuthorityActorSync(local.selfBody, self, "self");\n  if (remote && local.remote) applyAuthorityActorSync(local.remote.body, remote, "remote");\n\n  latestTelemetry = message.telemetry || latestTelemetry;\n`;
  source = replaceOnce(source, authoritySeam, authorityTreatment, "authority snapshot treatment");

  const snapshotSeam = `    callsign,\n    networkState,\n    remoteDelayMs,\n`;
  const snapshotTreatment = `    callsign,\n    networkState,\n    actorSyncMode,\n    actorCorrections: Object.fromEntries(Object.entries(actorCorrections).map(([role, stats]) => [role, {\n      ...stats,\n      positionMean: stats.count ? stats.positionSum / stats.count : 0,\n      velocityMean: stats.count ? stats.velocitySum / stats.count : 0,\n    }])),\n    remoteDelayMs,\n`;
  source = replaceOnce(source, snapshotSeam, snapshotTreatment, "snapshot correction evidence");

  return source;
}

function runMode(mode) {
  const filename = `ws0-actor-state-${mode}.json`;
  const result = spawnSync(process.execPath, [CONTACT_SCRIPT], {
    stdio: "inherit",
    env: {
      ...process.env,
      WS0_CONTACT_DELAYS: DELAYS,
      WS0_ACTOR_SYNC: mode,
      WS0_CONTACT_OUTPUT: filename,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`actor state-sync mode ${mode} failed with exit ${result.status}`);
  return { mode, filename, evidence: JSON.parse(readFileSync(filename, "utf8")) };
}

function distance3(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return NaN;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function finalActorSplits(run) {
  const aSelf = run.finalState?.a?.selfPosition;
  const aRemoteOnB = run.finalState?.b?.remotePosition;
  const bSelf = run.finalState?.b?.selfPosition;
  const bRemoteOnA = run.finalState?.a?.remotePosition;
  return {
    actorA: distance3(aSelf, aRemoteOnB),
    actorB: distance3(bSelf, bRemoteOnA),
  };
}

function compactMode(result) {
  return result.evidence.results.map((run) => ({
    mode: result.mode,
    scenario: run.scenario,
    delayMs: run.delayMs,
    directFinalSplit: finalActorSplits(run),
    aAuthorityFinal: run.a?.self?.sameTime?.final,
    bAuthorityFinal: run.b?.self?.sameTime?.final,
    finalSeparation: {
      a: distance3(run.finalState?.a?.selfPosition, run.finalState?.a?.remotePosition),
      b: distance3(run.finalState?.b?.selfPosition, run.finalState?.b?.remotePosition),
    },
    corrections: {
      a: run.finalState?.a?.actorCorrections ?? null,
      b: run.finalState?.b?.actorCorrections ?? null,
    },
    authority: run.finalState?.a?.telemetry ?? null,
    localDroppedSteps: {
      a: run.finalState?.a?.localDroppedSteps,
      b: run.finalState?.b?.localDroppedSteps,
    },
  }));
}

const originalRunner = readFileSync(RUNNER, "utf8");
const results = [];
try {
  const patched = patchRunner(originalRunner);
  if (patched === originalRunner) throw new Error("actor state-sync runner patch made no change");
  writeFileSync(RUNNER, patched);

  for (const mode of MODES) results.push(runMode(mode));

  const cells = results.flatMap(compactMode);
  const aggregate = {
    revision: "ws0-actor-state-sync-upper-bound-v1",
    generatedAt: new Date().toISOString(),
    design: {
      donorContactHead: "2797a23f81cae23e541a668a516e7b7765cf1dc4",
      modes: MODES,
      delaysMs: DELAYS.split(",").map(Number),
      note: "Upper-bound mechanism probe: authority snapshots are not artificially WAN-delayed. Physical correction is applied directly to both local actor bodies; props remain uncorrected and must stay out of contact.",
    },
    cells,
  };
  writeFileSync(OUTPUT, JSON.stringify(aggregate, null, 2));

  console.log("\nWS0 actor state-sync upper-bound summary");
  for (const cell of cells.filter((cell) => cell.scenario === "player-contact-only")) {
    const a = Number.isFinite(cell.directFinalSplit.actorA) ? cell.directFinalSplit.actorA.toFixed(3) : "—";
    const b = Number.isFinite(cell.directFinalSplit.actorB) ? cell.directFinalSplit.actorB.toFixed(3) : "—";
    const corrA = cell.corrections.a?.self?.positionMax;
    const corrB = cell.corrections.b?.self?.positionMax;
    console.log(`${cell.mode.padEnd(9)} ${String(cell.delayMs).padStart(3)}ms  direct A/B=${a}/${b}m  self correction max A/B=${Number(corrA ?? NaN).toFixed(3)}/${Number(corrB ?? NaN).toFixed(3)}m`);
  }
  console.log(`WS0 ACTOR STATE-SYNC UPPER-BOUND STRUCTURAL PASS — evidence written to ${OUTPUT}`);
} finally {
  writeFileSync(RUNNER, originalRunner);
  const restored = readFileSync(RUNNER, "utf8");
  if (restored !== originalRunner) throw new Error("failed to restore preserved RC1 runner");
}
