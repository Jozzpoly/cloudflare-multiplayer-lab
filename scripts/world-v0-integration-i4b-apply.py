from pathlib import Path

contract_path = Path("src/world-v0-contract.ts")
server_path = Path("src/world-v0-shared-yard.ts")
browser_path = Path("public/world-v0/app.js")

contract = contract_path.read_text()
server = server_path.read_text()
browser = browser_path.read_text()

NEW_CONTRACT = "shared-yard-v0-contract-v6-i4-exact-full-state-rebase"
NEW_SERVER = "shared-yard-v0-authority-v5-i4-exact-full-state-rebase"
NEW_CLIENT = "shared-yard-v0-browser-sim-v6-i4-exact-full-state-rebase"
SEED_REVISION = "world-v0-authority-rebase-seed-v1"
RESUME_REVISION = "world-v0-browser-actor-resume-v1"

if all((NEW_CONTRACT in contract, NEW_SERVER in contract, NEW_CLIENT in contract, SEED_REVISION in server, RESUME_REVISION in browser)):
    print("WORLD_V0_I4B_APPLY already applied")
    raise SystemExit(0)


def replace_once(source: str, before: str, after: str, label: str) -> str:
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"I4b marker {label}: expected 1 occurrence, got {count}")
    return source.replace(before, after, 1)


contract = replace_once(
    contract,
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v5-i4-rebase-runtime-seam";',
    f'export const WORLD_V0_CONTRACT_REVISION = "{NEW_CONTRACT}";',
    "contract revision",
)
contract = replace_once(
    contract,
    'export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v4-i4-rebase-runtime-seam";',
    f'export const WORLD_V0_SERVER_REVISION = "{NEW_SERVER}";',
    "server revision",
)
contract = replace_once(
    contract,
    'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v5-i4-rebase-runtime-seam";',
    f'export const WORLD_V0_CLIENT_SIM_REVISION = "{NEW_CLIENT}";',
    "client revision",
)

server = replace_once(
    server,
    '''function flattenDynamicState(state: DynamicState): number[] {
  return [
    ...state.position,
    ...state.rotation,
    ...state.linearVelocity,
    ...state.angularVelocity,
  ];
}

export class SharedYardV0''',
    '''function flattenDynamicState(state: DynamicState): number[] {
  return [
    ...state.position,
    ...state.rotation,
    ...state.linearVelocity,
    ...state.angularVelocity,
  ];
}

function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x4000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return btoa(binary);
}

function encodeU32Hex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export class SharedYardV0''',
    "authority base64 helpers",
)

server = replace_once(
    server,
    '''    this.sessionBySocket.set(server, player.sessionId);

    this.send(server, {''',
    '''    this.sessionBySocket.set(server, player.sessionId);
    const rebaseSeed = resumed && this.protocolStartTick !== null
      ? this.createAuthorityRebaseSeed()
      : null;

    this.send(server, {''',
    "authority resumed seed creation",
)
server = replace_once(
    server,
    '''      resumeLastBatchSeq: player.input.stats().lastBatchSeq,
      slot: player.slot,''',
    '''      resumeLastBatchSeq: player.input.stats().lastBatchSeq,
      rebaseSeed,
      slot: player.slot,''',
    "welcome rebase seed payload",
)
server = replace_once(
    server,
    '''  private snapshotState() {''',
    f'''  private createAuthorityRebaseSeed() {{
    if (!this.world) throw new Error("world_not_ready");
    const boundaryTick = this.tick;
    const recording = b3.b3CreateRecording(0);
    try {{
      b3.b3World_StartRecording(this.world, recording);
      b3.b3World_StopRecording(this.world);
      const byteLength = b3.b3Recording_GetSize(recording);
      const bytes = b3.b3Recording_CopyData(recording);
      if (!(bytes instanceof Uint8Array)) throw new Error("authority_rebase_seed_copy_type");
      if (bytes.byteLength !== byteLength || byteLength < 1024) {{
        throw new Error("authority_rebase_seed_size:" + bytes.byteLength + "/" + byteLength);
      }}
      const state = this.snapshotState();
      if (state.boundaryTick !== boundaryTick || !state.stateGuard) {{
        throw new Error("authority_rebase_seed_state_guard");
      }}
      return {{
        revision: "{SEED_REVISION}",
        boundaryTick,
        byteLength,
        fnv1a32: encodeU32Hex(Number(b3.b3Bytes_Fnv1a32(bytes)) >>> 0),
        bytesBase64: encodeBytesBase64(bytes),
        stateGuard: state.stateGuard,
      }};
    }} finally {{
      b3.b3DestroyRecording(recording);
    }}
  }}

  private snapshotState() {{''',
    "authority exact rebase seed method",
)

browser = replace_once(
    browser,
    '''const ROOM_RECOVERY_MAX_DELAY_MS = 4000;
const EPS = 1e-9;''',
    f'''const ROOM_RECOVERY_MAX_DELAY_MS = 4000;
const ACTOR_RESUME_MAX_ATTEMPTS = 8;
const ACTOR_RESUME_BASE_DELAY_MS = 150;
const ACTOR_RESUME_MAX_DELAY_MS = 2000;
const ACTOR_RESUME_REVISION = "{RESUME_REVISION}";
const AUTHORITY_REBASE_SEED_REVISION = "{SEED_REVISION}";
const EPS = 1e-9;''',
    "browser resume constants",
)

browser = replace_once(
    browser,
    '''let selfSlot = null;
let protocolStartTick = null;''',
    '''let selfSlot = null;
let resumeToken = null;
let protocolStartTick = null;''',
    "browser resume token",
)

browser = replace_once(
    browser,
    '''let roomRecovery = {
  pending: false,
  reason: null,
  attempts: 0,
  timer: null,
  sourceEpoch: null,
  lastRecoveredEpoch: null,
};''',
    '''let roomRecovery = {
  pending: false,
  reason: null,
  attempts: 0,
  timer: null,
  sourceEpoch: null,
  lastRecoveredEpoch: null,
};
let actorResume = {
  revision: ACTOR_RESUME_REVISION,
  pending: false,
  attempts: 0,
  timer: null,
  sourceBoundary: null,
  lastRecoveredBoundary: null,
};''',
    "browser actor resume state",
)

browser = replace_once(
    browser,
    '''  serverRejected: 0,
  latestCorrection:''',
    '''  serverRejected: 0,
  rebases: 0,
  latestRebaseBoundary: null,
  latestRebaseGapTicks: 0,
  latestRebaseBytes: 0,
  latestRebaseHash: null,
  latestCorrection:''',
    "browser rebase metrics",
)

browser = replace_once(
    browser,
    '''function recoverableRoomEpochReason(reason) {''',
    '''function clearActorResumeTimer() {
  if (actorResume.timer) clearTimeout(actorResume.timer);
  actorResume.timer = null;
}

function actorResumeSnapshot() {
  return {
    revision: actorResume.revision,
    pending: actorResume.pending,
    attempts: actorResume.attempts,
    sourceBoundary: actorResume.sourceBoundary,
    lastRecoveredBoundary: actorResume.lastRecoveredBoundary,
  };
}

function reconnectActorSession() {
  if (!actorResume.pending || runtimeFailed) return false;
  if (socket && socket.readyState !== WebSocket.CLOSED) return false;
  if (actorResume.attempts >= ACTOR_RESUME_MAX_ATTEMPTS) {
    actorResume.pending = false;
    candidateError(new Error("actor_session_resume_exhausted"));
    return false;
  }
  actorResume.attempts += 1;
  networkState = "resuming actor · attempt " + actorResume.attempts;
  recordLifecycle("actor-resume-attempt", { attempt: actorResume.attempts, sourceBoundary: actorResume.sourceBoundary });
  updateProductStatus();
  try {
    connect();
  } catch (error) {
    recordLifecycle("actor-resume-connect-throw", { reason: error instanceof Error ? error.message : String(error) });
    scheduleActorResume();
  }
  return true;
}

function scheduleActorResume() {
  if (!actorResume.pending || runtimeFailed) return false;
  if (actorResume.timer || (socket && socket.readyState !== WebSocket.CLOSED)) return true;
  if (actorResume.attempts >= ACTOR_RESUME_MAX_ATTEMPTS) return reconnectActorSession();
  const delay = Math.min(ACTOR_RESUME_MAX_DELAY_MS, ACTOR_RESUME_BASE_DELAY_MS * (2 ** actorResume.attempts));
  networkState = "resuming actor · attempt " + (actorResume.attempts + 1);
  showNotice("Connection lost · restoring exact Shared Yard state…");
  updateProductStatus();
  actorResume.timer = setTimeout(() => {
    actorResume.timer = null;
    reconnectActorSession();
  }, delay);
  return true;
}

function recoverableRoomEpochReason(reason) {''',
    "browser actor resume helpers",
)

browser = replace_once(
    browser,
    '''function createHistory(sim) {
  const history = { segments: [], active: null, generation: 0, segmentRotations: 0 };
  localState = { sim, history, boundaryTick: 0 };
  startActiveRecording(0, "initial");
  storeDiagnostic(0);
}''',
    '''function createHistoryAtBoundary(sim, boundaryTick, reason) {
  if (!Number.isInteger(boundaryTick) || boundaryTick < 0) throw new Error("invalid history boundary " + boundaryTick);
  const history = { segments: [], active: null, generation: 0, segmentRotations: 0 };
  localState = { sim, history, boundaryTick };
  startActiveRecording(boundaryTick, reason);
  storeDiagnostic(boundaryTick);
}

function createHistory(sim) {
  createHistoryAtBoundary(sim, 0, "initial");
}''',
    "arbitrary-boundary history bootstrap",
)

browser = replace_once(
    browser,
    '''function destroySimulation(sim) {''',
    '''function decodeBase64Bytes(text) {
  if (typeof text !== "string" || !text.length) throw new Error("authority rebase seed bytes missing");
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function u32Hex(value) {
  return (Number(value) >>> 0).toString(16).padStart(8, "0");
}

function applyAuthorityRebase(seed) {
  if (!localState?.sim) throw new Error("authority rebase without local simulation");
  if (!seed || seed.revision !== AUTHORITY_REBASE_SEED_REVISION) throw new Error("authority rebase seed revision mismatch");
  if (!Number.isInteger(seed.boundaryTick) || seed.boundaryTick < 0) throw new Error("authority rebase boundary invalid");
  if (!seed.stateGuard || seed.stateGuard.revision !== WORLD_V0_EXPECTED_STATE_GUARD_REVISION) throw new Error("authority rebase state guard invalid");
  const bytes = decodeBase64Bytes(seed.bytesBase64);
  if (!Number.isInteger(seed.byteLength) || bytes.byteLength !== seed.byteLength) throw new Error("authority rebase byte length mismatch");
  const hash = u32Hex(b3.b3Bytes_Fnv1a32(bytes));
  if (hash !== seed.fnv1a32) throw new Error("authority rebase checksum mismatch " + hash + " != " + seed.fnv1a32);

  const oldEntityDefs = localState.sim.entityDefs;
  const oldNetEntityOrder = localState.sim.netEntityOrder;
  const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
  if (!player) throw new Error("authority rebase player create failed");
  let next = null;
  try {
    next = remapSimulation(player, oldEntityDefs, oldNetEntityOrder);
    const packed = capturePackedDiagnostic(next);
    const difference = firstWorldV0StateDifference(
      seed.stateGuard.packed,
      packed,
      simulation.netEntityOrder,
      simulation.stateComponents,
    );
    if (difference) throw new Error("authority rebase exact-state mismatch " + (difference.netEntityId || difference.field) + "." + (difference.component || ""));
  } catch (error) {
    if (next) destroySimulation(next);
    else b3.b3RecPlayer_Destroy(player);
    throw error;
  }

  const sourceBoundary = actorResume.sourceBoundary;
  destroyLocalState();
  intendedSelf.clear();
  peerRemote.clear();
  consumedByTick.clear();
  usedByTick.clear();
  diagnosticSamples.clear();
  pendingStateGuards.clear();
  pendingBatch = [];
  createHistoryAtBoundary(next, seed.boundaryTick, "authority-rebase");
  compareStateGuard(seed.boundaryTick, seed.stateGuard);
  phaseAnchor = { tick: seed.boundaryTick, at: performance.now() };
  metrics.rebases += 1;
  metrics.latestRebaseBoundary = seed.boundaryTick;
  metrics.latestRebaseGapTicks = Number.isInteger(sourceBoundary) ? Math.max(0, seed.boundaryTick - sourceBoundary) : 0;
  metrics.latestRebaseBytes = bytes.byteLength;
  metrics.latestRebaseHash = hash;
  recordLifecycle("authority-rebase", {
    boundaryTick: seed.boundaryTick,
    sourceBoundary,
    gapTicks: metrics.latestRebaseGapTicks,
    byteLength: bytes.byteLength,
    fnv1a32: hash,
  });
}

function destroySimulation(sim) {''',
    "browser authority raw rebase",
)

browser = replace_once(
    browser,
    '''  url.searchParams.set("run", runKey);
  return url.toString();''',
    '''  url.searchParams.set("run", runKey);
  if (actorResume.pending && resumeToken) url.searchParams.set("resume", resumeToken);
  return url.toString();''',
    "browser resume URL",
)

browser = replace_once(
    browser,
    '''    const recoveringRoom = roomRecovery.pending;
    const sourceEpoch = roomRecovery.sourceEpoch;
    adoptIdentity(message, "welcome");''',
    '''    const recoveringRoom = roomRecovery.pending;
    const sourceEpoch = roomRecovery.sourceEpoch;
    const resumingActor = actorResume.pending;
    const priorSessionId = selfSessionId;
    const priorResumeToken = resumeToken;
    adoptIdentity(message, "welcome");''',
    "welcome actor resume capture",
)

browser = replace_once(
    browser,
    '''    simulation = assertSimulationContract(message.simulation, "welcome");
    selfSessionId = message.selfSessionId;''',
    '''    simulation = assertSimulationContract(message.simulation, "welcome");
    if (message.resumed) {
      if (!resumingActor || !priorSessionId || !priorResumeToken || !localState) throw new Error("unexpected resumed welcome");
      if (message.selfSessionId !== priorSessionId) throw new Error("resumed ActorSession identity drift");
      if (message.resumeToken !== priorResumeToken) throw new Error("resumed private token drift");
      if (!Number.isInteger(message.resumeLastBatchSeq) || message.resumeLastBatchSeq < 0) throw new Error("resumed batch sequence invalid");
      batchSeq = Math.max(batchSeq, message.resumeLastBatchSeq);
      applyAuthorityRebase(message.rebaseSeed);
      selfSessionId = message.selfSessionId;
      selfNetEntityId = message.selfNetEntityId;
      selfSlot = message.slot;
      resumeToken = message.resumeToken;
      clearActorResumeTimer();
      actorResume.pending = false;
      actorResume.attempts = 0;
      actorResume.sourceBoundary = null;
      actorResume.lastRecoveredBoundary = localState.boundaryTick;
      playing = true;
      sessionEnd = null;
      networkState = "live · exact state resumed";
      jumpButton.classList.remove("hidden");
      joystick.classList.add("active");
      cameraGimbal.classList.add("active");
      startLogicalInputScheduler();
      recordLifecycle("actor-resume-complete", { boundaryTick: localState.boundaryTick, resumeCount: message.resumeCount });
      clearNotice();
      syncMeshes();
      return;
    }
    if (resumingActor) throw new Error("actor resume was not accepted by authority");
    if (typeof message.resumeToken !== "string" || !message.resumeToken) throw new Error("welcome missing resume token");
    resumeToken = message.resumeToken;
    selfSessionId = message.selfSessionId;''',
    "welcome exact rebase handling",
)

browser = replace_once(
    browser,
    '''    if (!roomRecovery.pending && recoverableRoomEpochReason(closeReason)) {''',
    '''    const actorTransportRecoverable = !runtimeFailed && !expectedAfterEpochEnd && !roomRecovery.pending &&
      Boolean(identity && resumeToken && localState && Number.isInteger(protocolStartTick)) && event.code === 1006;
    if (actorResume.pending || actorTransportRecoverable) {
      actorResume.pending = true;
      if (!Number.isInteger(actorResume.sourceBoundary)) actorResume.sourceBoundary = localState?.boundaryTick ?? null;
      neutralizeTransientInputs();
      networkState = "connection lost · actor resume pending";
      recordLifecycle("actor-resume-pending", { code: event.code, reason: event.reason || null, sourceBoundary: actorResume.sourceBoundary });
      scheduleActorResume();
      return;
    }
    if (!roomRecovery.pending && recoverableRoomEpochReason(closeReason)) {''',
    "transport close actor resume path",
)

browser = replace_once(
    browser,
    '''  selfSlot = null;
  protocolStartTick = null;''',
    '''  selfSlot = null;
  resumeToken = null;
  clearActorResumeTimer();
  actorResume = {
    revision: ACTOR_RESUME_REVISION,
    pending: false,
    attempts: 0,
    timer: null,
    sourceBoundary: null,
    lastRecoveredBoundary: actorResume.lastRecoveredBoundary,
  };
  protocolStartTick = null;''',
    "reset actor resume state",
)

browser = replace_once(
    browser,
    '''    serverRejected: 0,
    latestCorrection:''',
    '''    serverRejected: 0,
    rebases: 0,
    latestRebaseBoundary: null,
    latestRebaseGapTicks: 0,
    latestRebaseBytes: 0,
    latestRebaseHash: null,
    latestCorrection:''',
    "reset rebase metrics",
)

browser = replace_once(
    browser,
    '''      roomRecovery: roomRecoverySnapshot(),
    },''',
    '''      roomRecovery: roomRecoverySnapshot(),
      actorSessionId: selfSessionId,
      selfNetEntityId,
      actorResume: actorResumeSnapshot(),
    },''',
    "evidence actor resume snapshot",
)

browser = replace_once(
    browser,
    '''  if (networkState.startsWith("live")) return "Shared Yard live · move · jump · drag to look · interact";''',
    '''  if (networkState.startsWith("live")) return "Shared Yard live · move · jump · drag to look · interact";
  if (actorResume.pending) return "Restoring exact Shared Yard state…";''',
    "product status actor resume",
)

contract_path.write_text(contract)
server_path.write_text(server)
browser_path.write_text(browser)
print("WORLD_V0_I4B_APPLY PASS")
