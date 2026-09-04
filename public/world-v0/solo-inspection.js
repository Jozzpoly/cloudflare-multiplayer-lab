import "./app.js";
import {
  WORLD_V0_BROWSER_UI_REVISION,
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_EXPECTED_PROTOCOL_REVISION,
  WORLD_V0_EXPECTED_SERVER_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
} from "./build-contract.js";
import {
  WORLD_V0_SOLO_INSPECTION_REVISION,
  planWorldV0InspectionZeroInput,
  sameWorldV0InspectionIdentity,
  worldV0InspectionCompanionPlayerId,
} from "./solo-inspection-core.js";

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;
const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const INPUT_EPS = 1e-9;
const ARM_TIMEOUT_MS = 8_000;
const LOW_WATER_TICKS = 12;

const callsignInput = document.querySelector("#callsign");
const runInput = document.querySelector("#run");
const enterButton = document.querySelector("#enter");
const inspectButton = document.querySelector("#inspect-solo");
const restartRoundButton = document.querySelector("#restart-round");
const bootStatus = document.querySelector("#boot-status");
if (!callsignInput || !runInput || !enterButton || !inspectButton || !restartRoundButton || !bootStatus) {
  throw new Error("Shared Yard V0 solo inspection UI incomplete");
}

const primaryEvidence = window.__sharedYardV0Evidence;
const primarySession = window.__sharedYardV0Session;
if (typeof primaryEvidence !== "function" || typeof primarySession !== "function") {
  throw new Error("Shared Yard V0 solo inspection requires initialized playable runtime");
}

const badge = document.createElement("div");
badge.id = "inspection-badge";
badge.className = "inspection-badge hidden";
document.body.append(badge);

let inspectionRequested = false;
let armTimer = null;
let armDeadline = 0;
let companionSocket = null;
let companionIdentity = null;
let companionTiming = null;
let companionReadySent = false;
let expectedCompanionClose = false;
let inspectionRunKey = "";

const companion = {
  state: "idle",
  playerId: null,
  sessionId: null,
  netEntityId: null,
  slot: null,
  ready: false,
  protocolStartTick: null,
  nextTargetTick: null,
  lastBoundaryTick: null,
  batchSeq: 0,
  batchesSent: 0,
  recordsSent: 0,
  acceptedRecords: 0,
  duplicateSameRecords: 0,
  rejectedRecords: 0,
  consumedFresh: 0,
  consumedHeld: 0,
  leaseExpiredSeen: 0,
  skippedBehindTicks: 0,
  failureReason: null,
  closeCode: null,
  closeReason: null,
};

function cloneCompanion() {
  return { ...companion };
}

function inspectionSnapshot() {
  return {
    revision: WORLD_V0_SOLO_INSPECTION_REVISION,
    mode: inspectionRequested ? "inspection" : "multiplayer",
    qualificationEligible: !inspectionRequested,
    uiRevision: WORLD_V0_BROWSER_UI_REVISION,
    companion: cloneCompanion(),
  };
}

function enrichEvidence(base) {
  if (!inspectionRequested) return base;
  return { ...base, inspection: inspectionSnapshot() };
}

window.__sharedYardV0Inspection = inspectionSnapshot;
window.__sharedYardV0Evidence = () => enrichEvidence(primaryEvidence());
window.__sharedYardV0Session = () => {
  const base = primarySession();
  return inspectionRequested ? { ...base, inspection: inspectionSnapshot() } : base;
};

addEventListener("pagehide", () => {
  if (!inspectionRequested) return;
  try {
    const payload = { ...window.__sharedYardV0Evidence(), persistedReason: "pagehide" };
    localStorage.setItem("shared-yard-v0-last-evidence", JSON.stringify(payload));
  } catch { /* evidence persistence must not affect runtime */ }
});

function updateBadge() {
  badge.classList.toggle("hidden", !inspectionRequested);
  badge.classList.toggle("failed", companion.state === "failed");
  if (!inspectionRequested) return;
  if (companion.state === "failed") {
    badge.textContent = `INSPECT SOLO · AUTO FAILED · ${companion.failureReason || "unknown"}`;
  } else if (companion.state === "live") {
    badge.textContent = "INSPECT SOLO · REAL AUTHORITY · AUTO PEER";
  } else if (companion.state === "ended") {
    badge.textContent = "INSPECT SOLO · ROUND ENDED";
  } else {
    badge.textContent = `INSPECT SOLO · ${companion.state.toUpperCase()}`;
  }
}

function resetCompanionState(state = "arming") {
  Object.assign(companion, {
    state,
    playerId: null,
    sessionId: null,
    netEntityId: null,
    slot: null,
    ready: false,
    protocolStartTick: null,
    nextTargetTick: null,
    lastBoundaryTick: null,
    batchSeq: 0,
    batchesSent: 0,
    recordsSent: 0,
    acceptedRecords: 0,
    duplicateSameRecords: 0,
    rejectedRecords: 0,
    consumedFresh: 0,
    consumedHeld: 0,
    leaseExpiredSeen: 0,
    skippedBehindTicks: 0,
    failureReason: null,
    closeCode: null,
    closeReason: null,
  });
  companionIdentity = null;
  companionTiming = null;
  companionReadySent = false;
  expectedCompanionClose = false;
  updateBadge();
}

function companionSocketUrl(playerId, runKey) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${location.host}/world-v0/ws`);
  url.searchParams.set("player", playerId);
  url.searchParams.set("run", runKey);
  return url.toString();
}

function identityFromMessage(message) {
  return {
    worldId: message.worldId,
    worldEpoch: message.worldEpoch,
    simBuildId: message.simBuildId,
    clientSimRevision: message.clientSimRevision,
  };
}

function assertExpectedIdentity(message, phase) {
  const next = identityFromMessage(message);
  if (next.worldId !== `shared-yard-v0-${inspectionRunKey}`) throw new Error(`${phase} WorldId mismatch ${next.worldId}`);
  if (next.simBuildId !== WORLD_V0_EXPECTED_SIM_BUILD_ID) throw new Error(`${phase} SimBuildId mismatch ${next.simBuildId}`);
  if (next.clientSimRevision !== WORLD_V0_CLIENT_SIM_REVISION) throw new Error(`${phase} client sim revision mismatch ${next.clientSimRevision}`);
  if (typeof next.worldEpoch !== "string" || !next.worldEpoch) throw new Error(`${phase} world epoch missing`);
  if (companionIdentity && !sameWorldV0InspectionIdentity(companionIdentity, next)) throw new Error(`${phase} world identity drift`);
  companionIdentity = next;
  return next;
}

function assertCompanionIdentity(message, phase) {
  if (!companionIdentity) throw new Error(`${phase} before companion welcome`);
  const next = identityFromMessage(message);
  if (!sameWorldV0InspectionIdentity(companionIdentity, next)) throw new Error(`${phase} world identity drift`);
}

function failCompanion(error) {
  if (companion.state === "failed") return;
  const reason = error instanceof Error ? error.message : String(error);
  companion.failureReason = reason;
  companion.state = "failed";
  updateBadge();
  console.error("WORLD_V0_SOLO_INSPECTION_FAILED", error);
  if (companionSocket && companionSocket.readyState <= WebSocket.OPEN) {
    try { companionSocket.close(1011, "solo_inspection_companion_failed"); } catch { /* close race */ }
  }
}

function sendCompanion(payload) {
  if (!companionSocket || companionSocket.readyState !== WebSocket.OPEN) throw new Error("inspection companion transport closed");
  companionSocket.send(JSON.stringify(payload));
}

function topUpCompanion(boundaryTick) {
  if (!companionIdentity || !companionTiming || companion.protocolStartTick === null || companion.nextTargetTick === null) return;
  if (!Number.isInteger(boundaryTick) || boundaryTick < 0) return;
  companion.lastBoundaryTick = boundaryTick;
  const plan = planWorldV0InspectionZeroInput({
    boundaryTick,
    protocolStartTick: companion.protocolStartTick,
    nextTargetTick: companion.nextTargetTick,
    maxFutureTicks: companionTiming.maxFutureTicks,
    inputBatchSize: companionTiming.inputBatchSize,
  });
  companion.skippedBehindTicks += plan.skippedBehindTicks;
  for (const records of plan.batches) {
    companion.batchSeq += 1;
    sendCompanion({
      type: "world_v0_input_batch",
      ...companionIdentity,
      batchSeq: companion.batchSeq,
      records,
    });
    companion.batchesSent += 1;
    companion.recordsSent += records.length;
  }
  companion.nextTargetTick = plan.nextTargetTick;
}

function adoptCompanionTiming(simulation, phase) {
  if (!simulation || simulation.simBuildId !== WORLD_V0_EXPECTED_SIM_BUILD_ID) throw new Error(`${phase} simulation contract mismatch`);
  if (simulation.protocolRevision !== WORLD_V0_EXPECTED_PROTOCOL_REVISION) throw new Error(`${phase} protocol revision mismatch ${simulation.protocolRevision}`);
  const timing = simulation.timing;
  if (!timing || !Number.isInteger(timing.maxFutureTicks) || !Number.isInteger(timing.inputBatchSize)) throw new Error(`${phase} timing contract missing`);
  companionTiming = {
    maxFutureTicks: timing.maxFutureTicks,
    inputBatchSize: timing.inputBatchSize,
  };
}

function handleCompanionMessage(message) {
  if (message.type === "world_v0_welcome") {
    if (message.revision !== WORLD_V0_EXPECTED_SERVER_REVISION) throw new Error(`companion server revision mismatch ${message.revision}`);
    assertExpectedIdentity(message, "companion-welcome");
    adoptCompanionTiming(message.simulation, "companion-welcome");
    if (message.slot !== 1) throw new Error(`inspection companion must occupy slot 1, got ${message.slot}`);
    if (message.waitingForPeer !== false) throw new Error("inspection companion joined without human peer occupying slot 0");
    companion.sessionId = message.selfSessionId;
    companion.netEntityId = message.selfNetEntityId;
    companion.slot = message.slot;
    companion.state = "joined";
    updateBadge();
    return;
  }

  if (message.type === "world_v0_roster") {
    assertCompanionIdentity(message, "companion-roster");
    if ((message.players || []).length === 2 && !companionReadySent) {
      sendCompanion({ type: "world_v0_ready", ...companionIdentity });
      companionReadySent = true;
      companion.state = "ready-sent";
      updateBadge();
    }
    return;
  }

  if (message.type === "world_v0_ready_ack") {
    assertCompanionIdentity(message, "companion-ready-ack");
    companion.ready = true;
    companion.state = "ready";
    updateBadge();
    return;
  }

  if (message.type === "world_v0_start") {
    assertCompanionIdentity(message, "companion-start");
    if (message.revision !== WORLD_V0_EXPECTED_SERVER_REVISION) throw new Error(`companion start revision mismatch ${message.revision}`);
    adoptCompanionTiming(message.simulation, "companion-start");
    if (!Number.isInteger(message.protocolStartTick) || !Number.isInteger(message.boundaryTick)) throw new Error("companion start tick contract invalid");
    companion.protocolStartTick = message.protocolStartTick;
    companion.nextTargetTick = message.protocolStartTick;
    companion.state = "live";
    updateBadge();
    topUpCompanion(message.boundaryTick);
    return;
  }

  if (message.type === "world_v0_snapshot") {
    assertCompanionIdentity(message, "companion-snapshot");
    topUpCompanion(message.boundaryTick);
    return;
  }

  if (message.type === "world_v0_consumed") {
    assertCompanionIdentity(message, "companion-consumed");
    if (Number.isInteger(message.boundaryTick)) {
      companion.lastBoundaryTick = message.boundaryTick;
      const remaining = (companion.nextTargetTick ?? message.boundaryTick) - message.boundaryTick;
      if (remaining < LOW_WATER_TICKS) topUpCompanion(message.boundaryTick);
    }
    const own = (message.players || []).find((player) => player.sessionId === companion.sessionId);
    if (own) {
      if (Math.abs(own.x || 0) > INPUT_EPS || Math.abs(own.z || 0) > INPUT_EPS) throw new Error(`inspection companion consumed non-zero input ${own.x},${own.z}`);
      if (own.source === "fresh") companion.consumedFresh += 1;
      else if (own.source === "held") companion.consumedHeld += 1;
      else if (own.source === "lease_expired") {
        companion.leaseExpiredSeen += 1;
        throw new Error("inspection companion input lease expired");
      }
    }
    return;
  }

  if (message.type === "world_v0_batch_ack") {
    assertCompanionIdentity(message, "companion-batch-ack");
    if (message.batchStatus === "stale_batch") throw new Error(`inspection companion stale batch ${message.batchSeq}`);
    for (const record of message.records || []) {
      if (record.status === "accepted") companion.acceptedRecords += 1;
      else if (record.status === "duplicate_same") companion.duplicateSameRecords += 1;
      else {
        companion.rejectedRecords += 1;
        throw new Error(`inspection companion input rejected T(${record.targetTick}) ${record.status}`);
      }
    }
    return;
  }

  if (message.type === "world_v0_epoch_ended") {
    if (companionIdentity) assertCompanionIdentity(message, "companion-epoch-ended");
    expectedCompanionClose = true;
    companion.state = "ended";
    updateBadge();
    return;
  }

  if (message.type === "world_v0_error") {
    throw new Error(`inspection companion server error: ${message.error}`);
  }
}

function startCompanion(humanCallsign, runKey) {
  if (companionSocket && companionSocket.readyState <= WebSocket.OPEN) return;
  inspectionRunKey = runKey;
  const playerId = worldV0InspectionCompanionPlayerId(humanCallsign);
  companion.playerId = playerId;
  companion.state = "connecting";
  updateBadge();

  const ws = new WebSocket(companionSocketUrl(playerId, runKey));
  companionSocket = ws;
  ws.addEventListener("open", () => {
    if (companionSocket !== ws) return;
    companion.state = "syncing";
    updateBadge();
  });
  ws.addEventListener("message", (event) => {
    if (companionSocket !== ws || typeof event.data !== "string") return;
    try {
      handleCompanionMessage(JSON.parse(event.data));
    } catch (error) {
      failCompanion(error);
    }
  });
  ws.addEventListener("close", (event) => {
    if (companionSocket !== ws) return;
    companionSocket = null;
    companion.closeCode = event.code;
    companion.closeReason = event.reason || null;
    if (!expectedCompanionClose && companion.state !== "failed" && companion.state !== "ended") {
      failCompanion(new Error(`inspection companion closed unexpectedly ${event.code} ${event.reason || ""}`.trim()));
    }
  });
  ws.addEventListener("error", () => {
    if (companionSocket === ws && companion.state !== "failed") companion.state = "network-error";
    updateBadge();
  });
}

function stopArmTimer() {
  if (armTimer) clearInterval(armTimer);
  armTimer = null;
}

function armCompanion(humanCallsign, runKey) {
  stopArmTimer();
  armDeadline = performance.now() + ARM_TIMEOUT_MS;
  armTimer = setInterval(() => {
    try {
      const evidence = primaryEvidence();
      if (evidence.runtimeFailed) throw new Error(`primary runtime failed before companion: ${evidence.runtimeFailureReason}`);
      if (evidence.runKey === runKey && evidence.identity && evidence.networkState === "waiting for peer") {
        stopArmTimer();
        startCompanion(humanCallsign, runKey);
        return;
      }
      if (evidence.runKey === runKey && String(evidence.networkState || "").startsWith("live")) {
        throw new Error("real peer joined before inspection companion could claim slot 1");
      }
      if (performance.now() >= armDeadline) throw new Error(`inspection companion arm timeout at ${evidence.networkState}`);
    } catch (error) {
      stopArmTimer();
      failCompanion(error);
    }
  }, 50);
}

function requestInspection() {
  const humanCallsign = callsignInput.value.trim();
  const runKey = runInput.value.trim();
  if (!PLAYER_ID_PATTERN.test(humanCallsign) || !RUN_KEY_PATTERN.test(runKey)) {
    // Reuse the canonical entry validation / user-facing notice.
    enterButton.click();
    return;
  }

  inspectionRequested = true;
  inspectionRunKey = runKey;
  resetCompanionState("arming");
  inspectButton.disabled = true;
  enterButton.click();
  armCompanion(humanCallsign, runKey);
}

inspectButton.disabled = enterButton.disabled;
inspectButton.addEventListener("click", requestInspection);
restartRoundButton.addEventListener("click", () => {
  if (!inspectionRequested) return;
  const humanCallsign = callsignInput.value.trim();
  const runKey = runInput.value.trim();
  resetCompanionState("arming");
  armCompanion(humanCallsign, runKey);
});

updateBadge();
