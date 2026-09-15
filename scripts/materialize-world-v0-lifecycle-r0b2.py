from pathlib import Path

path = Path("public/world-v0/app.js")
text = path.read_text()

if "WORLD_V0_LIFECYCLE_R0_BROWSER_V1" in text:
    raise SystemExit("R0-B2 browser source is already materialized")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


def replace_block(start: str, end: str, replacement: str, label: str) -> None:
    global text
    first = text.find(start)
    if first < 0:
        raise SystemExit(f"{label}: start marker missing")
    second = text.find(end, first)
    if second < 0:
        raise SystemExit(f"{label}: end marker missing")
    if text.find(start, first + 1) >= 0:
        raise SystemExit(f"{label}: start marker not unique")
    text = text[:first] + replacement.rstrip() + "\n\n" + text[second:]


replace_once(
    'const urlParams = new URL(location.href).searchParams;\n',
    'const urlParams = new URL(location.href).searchParams;\n'
    'const lifecycleR0 = urlParams.get("lifecycle") === "r0"; // WORLD_V0_LIFECYCLE_R0_BROWSER_V1\n',
    "lifecycle flag",
)

replace_once(
    'let resumeToken = null;\n',
    'let resumeToken = null;\n'
    'let currentTopology = null;\n'
    'let topologyTransitionPending = false;\n',
    "topology state",
)

replace_once(
    '  if (RUN_KEY_PATTERN.test(key)) url.searchParams.set("run", key);\n  return url.toString();\n',
    '  if (RUN_KEY_PATTERN.test(key)) url.searchParams.set("run", key);\n'
    '  if (lifecycleR0) url.searchParams.set("lifecycle", "r0");\n'
    '  return url.toString();\n',
    "invite lifecycle preservation",
)

identity_anchor = '''function identityFields() {
  if (!identity) throw new Error("world identity unavailable");
  return { ...identity };
}
'''
identity_helpers = identity_anchor + '''
function normalizeR0Topology(value, phase) {
  if (!lifecycleR0) return null;
  if (!value || typeof value !== "object") throw new Error(`${phase} missing R0 topology`);
  if (!Number.isInteger(value.revision) || value.revision <= 0) throw new Error(`${phase} invalid topology revision`);
  if (typeof value.digest !== "string" || !/^[0-9a-f]{8}$/.test(value.digest)) throw new Error(`${phase} invalid topology digest`);
  if (!Array.isArray(value.actors) || value.actors.length < 1 || value.actors.length > 2) throw new Error(`${phase} invalid topology actors`);
  const actors = value.actors.map((actor) => ({
    sessionId: actor?.sessionId,
    netEntityId: actor?.netEntityId,
    slot: actor?.slot,
  }));
  if (actors.some((actor) => typeof actor.sessionId !== "string" || !actor.sessionId || typeof actor.netEntityId !== "string" || !actor.netEntityId || !Number.isInteger(actor.slot))) {
    throw new Error(`${phase} malformed topology actor`);
  }
  if (new Set(actors.map((actor) => actor.sessionId)).size !== actors.length || new Set(actors.map((actor) => actor.netEntityId)).size !== actors.length) {
    throw new Error(`${phase} duplicate topology actor`);
  }
  if (!Array.isArray(value.entityOrder) || value.entityOrder.length !== actors.length + 12) throw new Error(`${phase} invalid topology entity order`);
  const entityOrder = value.entityOrder.map((entry) => String(entry));
  if (new Set(entityOrder).size !== entityOrder.length) throw new Error(`${phase} duplicate topology entity`);
  for (let index = 0; index < actors.length; index += 1) {
    if (entityOrder[index] !== actors[index].netEntityId) throw new Error(`${phase} topology actor order mismatch`);
  }
  return {
    modeRevision: value.modeRevision || null,
    revision: value.revision,
    digest: value.digest,
    actors,
    entityOrder,
  };
}

function sameR0Topology(a, c) {
  return Boolean(a && c && a.revision === c.revision && a.digest === c.digest);
}

function updateRemoteFromR0Topology() {
  if (!lifecycleR0 || !currentTopology || !selfSessionId) return;
  const remote = currentTopology.actors.find((actor) => actor.sessionId !== selfSessionId) || null;
  remoteSessionId = remote?.sessionId || null;
  remoteNetEntityId = remote?.netEntityId || null;
}

function adoptR0Topology(value, phase, { allowChange = false } = {}) {
  if (!lifecycleR0) return null;
  const next = normalizeR0Topology(value, phase);
  if (currentTopology && !sameR0Topology(currentTopology, next) && !allowChange) {
    throw new Error(`${phase} unexpected topology drift ${currentTopology.revision}/${currentTopology.digest} -> ${next.revision}/${next.digest}`);
  }
  currentTopology = next;
  updateRemoteFromR0Topology();
  return next;
}

function assertR0MessageTopology(message, phase) {
  if (!lifecycleR0) return null;
  const observed = normalizeR0Topology(message?.topology, phase);
  if (!currentTopology || !sameR0Topology(currentTopology, observed)) {
    throw new Error(`${phase} topology drift ${currentTopology?.revision ?? "none"}/${currentTopology?.digest ?? "none"} -> ${observed.revision}/${observed.digest}`);
  }
  return observed;
}

function r0TopologyIdentityFields() {
  if (!lifecycleR0) return {};
  if (!currentTopology) throw new Error("R0 topology identity unavailable");
  return {
    topologyRevision: currentTopology.revision,
    topologyDigest: currentTopology.digest,
  };
}

function r0EntityDefs(topology) {
  const actorByNet = new Map(topology.actors.map((actor) => [actor.netEntityId, actor]));
  return topology.entityOrder.map((netEntityId) => {
    const actor = actorByNet.get(netEntityId);
    if (actor) return { netEntityId, locator: netEntityId, kind: "actor", slot: actor.slot, sessionId: actor.sessionId };
    return { netEntityId, locator: `prop:${netEntityId}`, kind: "prop", propId: netEntityId };
  });
}
'''
replace_once(identity_anchor, identity_helpers, "topology helpers")

replace_block(
    'function createSimulationFromState(state) {',
    'function remapSimulation(player, entityDefs, netEntityOrder) {',
    '''function createSimulationFromState(state) {
  const players = [...(state?.players || [])].sort((a, c) => (a.slot ?? 0) - (c.slot ?? 0));
  const props = [...(state?.props || [])];
  if (players.length < 1 || players.length > 2) throw new Error(`Shared Yard start requires one or two players, got ${players.length}`);
  const self = players.find((player) => player.sessionId === selfSessionId);
  const remote = players.find((player) => player.sessionId !== selfSessionId) || null;
  if (!self) throw new Error("Shared Yard start state missing self actor");
  if (!lifecycleR0 && !remote) throw new Error("Shared Yard fixed-2P start state missing remote actor");
  if (lifecycleR0) {
    if (!currentTopology) throw new Error("R0 start missing topology");
    const sessions = new Set(players.map((player) => player.sessionId));
    if (currentTopology.actors.length !== players.length || currentTopology.actors.some((actor) => !sessions.has(actor.sessionId))) {
      throw new Error("R0 state/topology actor mismatch");
    }
  }
  remoteSessionId = remote?.sessionId || null;
  remoteNetEntityId = remote?.netEntityId || null;

  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [...simulation.arena.gravity];
  const world = b3.b3CreateWorld(wd);
  for (const box of simulation.arena.staticBoxes || []) createStaticBox(world, box);

  const entityDefs = [];
  const actorBodies = new Map();
  const propBodies = new Map();
  const netBodies = new Map();

  for (const prop of props) {
    const locator = `prop:${prop.netEntityId || prop.id}`;
    const body = createDynamicBox(world, locator, prop);
    propBodies.set(prop.id, body);
    netBodies.set(prop.netEntityId || prop.id, body);
    entityDefs.push({ netEntityId: prop.netEntityId || prop.id, locator, kind: "prop", propId: prop.id });
    getPropMesh(prop.id);
  }

  for (const player of players) {
    const netEntityId = player.netEntityId || `actor:${player.slot}`;
    const locator = netEntityId;
    const body = createActorBody(world, locator, player);
    actorBodies.set(player.sessionId, body);
    netBodies.set(netEntityId, body);
    entityDefs.push({ netEntityId, locator, kind: "actor", slot: player.slot, sessionId: player.sessionId });
  }

  return {
    world,
    actorBodies,
    propBodies,
    netBodies,
    entityDefs,
    netEntityOrder: lifecycleR0 ? [...currentTopology.entityOrder] : [...simulation.netEntityOrder],
    ownerPlayer: 0,
  };
}''',
    "dynamic simulation bootstrap",
)

replace_block(
    'function applyAuthorityRebase(seed, bootstrapState = null) {',
    'function destroySimulation(sim) {',
    '''function applyAuthorityRebase(seed, bootstrapState = null) {
  if (!localState?.sim && !bootstrapState) throw new Error("authority rebase without local simulation or bootstrap state");
  if (!seed || seed.revision !== AUTHORITY_REBASE_SEED_REVISION) throw new Error("authority rebase seed revision mismatch");
  if (!Number.isInteger(seed.boundaryTick) || seed.boundaryTick < 0) throw new Error("authority rebase boundary invalid");
  if (!seed.stateGuard || seed.stateGuard.revision !== WORLD_V0_EXPECTED_STATE_GUARD_REVISION) throw new Error("authority rebase state guard invalid");
  const rebaseTopology = lifecycleR0 ? normalizeR0Topology(seed.topology, "authority-rebase") : null;
  if (rebaseTopology && (seed.stateGuard.topologyRevision !== rebaseTopology.revision || seed.stateGuard.topologyDigest !== rebaseTopology.digest)) {
    throw new Error("authority rebase topology/state-guard mismatch");
  }
  const bytes = decodeBase64Bytes(seed.bytesBase64);
  if (!Number.isInteger(seed.byteLength) || bytes.byteLength !== seed.byteLength) throw new Error("authority rebase byte length mismatch");
  const hash = u32Hex(b3.b3Bytes_Fnv1a32(bytes));
  if (hash !== seed.fnv1a32) throw new Error("authority rebase checksum mismatch " + hash + " != " + seed.fnv1a32);

  const entityDefs = rebaseTopology
    ? r0EntityDefs(rebaseTopology)
    : (localState?.sim?.entityDefs ?? authorityEntityDefsFromState(bootstrapState));
  const netEntityOrder = rebaseTopology
    ? [...rebaseTopology.entityOrder]
    : (localState?.sim?.netEntityOrder ?? simulation.netEntityOrder);
  const player = b3.b3RecPlayer_CreateFromBytes(bytes, 1);
  if (!player) throw new Error("authority rebase player create failed");
  let next = null;
  try {
    next = remapSimulation(player, entityDefs, netEntityOrder);
    const packed = capturePackedDiagnostic(next);
    const difference = firstWorldV0StateDifference(
      seed.stateGuard.packed,
      packed,
      next.netEntityOrder,
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
  if (rebaseTopology) {
    currentTopology = rebaseTopology;
    topologyTransitionPending = false;
    updateRemoteFromR0Topology();
  }
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
    topologyRevision: currentTopology?.revision ?? null,
    topologyDigest: currentTopology?.digest ?? null,
  });
}''',
    "topology-aware authority rebase",
)

replace_once(
    '''  const selfBody = sim.actorBodies.get(selfSessionId);
  const remoteBody = sim.actorBodies.get(remoteSessionId);
  if (!selfBody || !remoteBody) throw new Error("predicted actor mapping incomplete");
  applyIntent(selfBody, { ...resolved.self, jump: selfJumpTrigger });
  applyIntent(remoteBody, { ...resolved.remote, jump: remoteJumpTrigger });
''',
    '''  const selfBody = sim.actorBodies.get(selfSessionId);
  if (!selfBody) throw new Error("predicted self actor mapping incomplete");
  applyIntent(selfBody, { ...resolved.self, jump: selfJumpTrigger });
  if (remoteSessionId) {
    const remoteBody = sim.actorBodies.get(remoteSessionId);
    if (!remoteBody) throw new Error("predicted remote actor mapping incomplete");
    applyIntent(remoteBody, { ...resolved.remote, jump: remoteJumpTrigger });
  }
''',
    "optional remote prediction",
)

replace_block(
    'function compareStateGuard(boundaryTick, guard) {',
    'function storeDiagnostic(boundaryTick) {',
    '''function compareStateGuard(boundaryTick, guard) {
  if (!guard) throw new Error(`missing authority state guard at B(${boundaryTick})`);
  if (guard.revision !== WORLD_V0_EXPECTED_STATE_GUARD_REVISION) throw new Error(`state guard revision mismatch ${guard.revision}`);
  if (lifecycleR0) {
    if (!currentTopology) throw new Error("state guard before R0 topology");
    if (guard.topologyRevision !== currentTopology.revision || guard.topologyDigest !== currentTopology.digest) {
      throw new Error(`state guard topology mismatch ${guard.topologyRevision}/${guard.topologyDigest}`);
    }
  }
  const predicted = diagnosticSamples.get(boundaryTick);
  if (!predicted) {
    pendingStateGuards.set(boundaryTick, guard);
    metrics.guardPending = pendingStateGuards.size;
    return;
  }
  const netEntityOrder = localState?.sim?.netEntityOrder ?? simulation.netEntityOrder;
  const difference = firstWorldV0StateDifference(
    guard.packed,
    predicted,
    netEntityOrder,
    simulation.stateComponents,
  );
  pendingStateGuards.delete(boundaryTick);
  metrics.guardPending = pendingStateGuards.size;
  if (difference) {
    metrics.guardMismatches += 1;
    metrics.firstStateMismatch ||= { boundaryTick, ...difference };
    throw new Error(`FOUNDATION_STATE_DIVERGENCE B(${boundaryTick}) ${difference.netEntityId || difference.field}.${difference.component || ""}`);
  }
  metrics.guardMatches += 1;
}''',
    "dynamic state guard",
)

replace_block(
    'function socketUrl() {',
    'function sendInputRevisionRecords(records) {',
    '''function socketUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${location.host}/world-v0/ws`);
  url.searchParams.set("player", callsign);
  url.searchParams.set("run", runKey);
  if (lifecycleR0) url.searchParams.set("lifecycle", "r0");
  if (actorResume.pending && resumeToken) url.searchParams.set("resume", resumeToken);
  return url.toString();
}''',
    "R0 websocket mode",
)

replace_once(
    '      ...identityFields(),\n      batchSeq,\n      records: chunk,\n',
    '      ...identityFields(),\n      ...r0TopologyIdentityFields(),\n      batchSeq,\n      records: chunk,\n',
    "revision batch topology identity",
)
replace_once(
    '    ...identityFields(),\n    batchSeq,\n    records,\n',
    '    ...identityFields(),\n    ...r0TopologyIdentityFields(),\n    batchSeq,\n    records,\n',
    "pending batch topology identity",
)

replace_once(
    'function classifyBatchAck(message) {\n  assertMessageIdentity(message, "batch-ack");\n',
    'function classifyBatchAck(message) {\n  assertMessageIdentity(message, "batch-ack");\n  assertR0MessageTopology(message, "batch-ack");\n',
    "batch ack topology",
)
replace_once(
    'function handlePeerRecords(message) {\n  assertMessageIdentity(message, "peer-records");\n',
    'function handlePeerRecords(message) {\n  assertMessageIdentity(message, "peer-records");\n  assertR0MessageTopology(message, "peer-records");\n',
    "peer records topology",
)
replace_once(
    'function handleConsumed(message) {\n  assertMessageIdentity(message, "consumed");\n',
    'function handleConsumed(message) {\n  assertMessageIdentity(message, "consumed");\n  assertR0MessageTopology(message, "consumed");\n',
    "consumed topology",
)
replace_once(
    'function handleSnapshot(message) {\n  assertMessageIdentity(message, "snapshot");\n',
    'function handleSnapshot(message) {\n  assertMessageIdentity(message, "snapshot");\n  assertR0MessageTopology(message, "snapshot");\n',
    "snapshot topology",
)

replace_block(
    'function handleStart(message) {',
    'function handleMessage(message) {',
    '''function handleStart(message) {
  assertMessageIdentity(message, "start");
  if (message.revision !== WORLD_V0_EXPECTED_SERVER_REVISION) throw new Error(`start server revision mismatch ${message.revision}`);
  const contract = assertSimulationContract(message.simulation, "start");
  if (!Number.isInteger(message.protocolStartTick) || !Number.isInteger(message.boundaryTick)) throw new Error("invalid start tick contract");
  if (message.boundaryTick !== 0 || message.state?.boundaryTick !== 0) throw new Error(`World V0 requires clean B(0), got ${message.boundaryTick}`);

  simulation = contract;
  if (lifecycleR0) adoptR0Topology(message.topology, "start");
  destroyLocalState();
  intendedSelf.clear();
  peerRemote.clear();
  consumedByTick.clear();
  usedByTick.clear();
  diagnosticSamples.clear();
  pendingStateGuards.clear();
  protocolStartTick = message.protocolStartTick;
  resetJumpDeliveryForFreshRun();
  buildArenaVisual(contract);
  const sim = createSimulationFromState(message.state);
  buildSpatialCues(message.state);
  createHistory(sim);
  compareStateGuard(0, message.state.stateGuard);
  updatePhaseFromStart(message, performance.now());
  startLogicalInputScheduler();
  if (!selfMesh) selfMesh = createPlayerMesh(true);
  if (remoteSessionId && !remoteMesh) remoteMesh = createPlayerMesh(false);
  sessionEnd = null;
  networkState = lifecycleR0 && !remoteSessionId ? "live · solo Shared Yard" : "live · Shared Yard V0";
  jumpButton.classList.remove("hidden");
  joystick.classList.add("active");
  cameraGimbal.classList.add("active");
  recordLifecycle("world-start", {
    protocolStartTick,
    topologyRevision: currentTopology?.revision ?? null,
    topologyDigest: currentTopology?.digest ?? null,
  });
  clearNotice();
  syncMeshes();
}''',
    "solo-capable browser start",
)

replace_block(
    'function handleMessage(message) {',
    'function candidateError(error) {',
    '''function handleMessage(message) {
  if (message.type === "world_v0_welcome") {
    const recoveringRoom = roomRecovery.pending;
    const sourceEpoch = roomRecovery.sourceEpoch;
    const resumingActor = actorResume.pending;
    const priorSessionId = selfSessionId;
    const priorResumeToken = resumeToken;
    adoptIdentity(message, "welcome");
    if (recoveringRoom && sourceEpoch && message.worldEpoch === sourceEpoch) {
      throw new Error(`room recovery reused ended epoch ${sourceEpoch}`);
    }
    simulation = assertSimulationContract(message.simulation, "welcome");
    if (lifecycleR0) adoptR0Topology(message.topology, "welcome");
    if (message.resumed) {
      if (!resumingActor || !priorSessionId || !priorResumeToken) throw new Error("unexpected resumed welcome");
      if (message.selfSessionId !== priorSessionId) throw new Error("resumed ActorSession identity drift");
      if (message.resumeToken !== priorResumeToken) throw new Error("resumed private token drift");
      if (!Number.isInteger(message.resumeLastBatchSeq) || message.resumeLastBatchSeq < 0) throw new Error("resumed batch sequence invalid");

      const hadLocalState = Boolean(localState?.sim);
      const resumedIntoActiveRun = Number.isInteger(message.protocolStartTick);
      if (hadLocalState && !resumedIntoActiveRun) throw new Error("active ActorSession resumed into unscheduled protocol");
      batchSeq = Math.max(batchSeq, message.resumeLastBatchSeq);

      if (resumedIntoActiveRun) {
        if (!message.rebaseSeed || !Number.isInteger(message.rebaseSeed.boundaryTick)) throw new Error("active ActorSession resume missing authority rebase seed");
        if (message.state?.boundaryTick !== message.rebaseSeed.boundaryTick) throw new Error("active ActorSession resume state/rebase boundary mismatch");
        if (Number.isInteger(protocolStartTick) && protocolStartTick !== message.protocolStartTick) throw new Error("resumed protocolStartTick drift");
        protocolStartTick = message.protocolStartTick;
        if (!hadLocalState) {
          buildArenaVisual(simulation);
          buildSpatialCues(message.state);
        }
        applyAuthorityRebase(message.rebaseSeed, hadLocalState ? null : message.state);
      } else {
        if (message.rebaseSeed) throw new Error("pre-start ActorSession resume unexpectedly carried rebase seed");
        protocolStartTick = null;
      }

      selfSessionId = message.selfSessionId;
      selfNetEntityId = message.selfNetEntityId;
      selfSlot = message.slot;
      resumeToken = message.resumeToken;
      updateRemoteFromR0Topology();
      persistCurrentActorSession();
      clearActorResumeTimer();
      actorResume.pending = false;
      actorResume.attempts = 0;
      actorResume.sourceBoundary = null;
      actorResume.lastRecoveredBoundary = localState?.boundaryTick ?? null;
      playing = true;
      sessionEnd = null;

      if (resumedIntoActiveRun) {
        networkState = "live · exact state resumed";
        jumpButton.classList.remove("hidden");
        joystick.classList.add("active");
        cameraGimbal.classList.add("active");
        startLogicalInputScheduler();
        recordLifecycle("actor-resume-complete", {
          boundaryTick: localState.boundaryTick,
          resumeCount: message.resumeCount,
          bootstrapFromAuthority: !hadLocalState,
        });
        clearNotice();
        syncMeshes();
      } else {
        networkState = message.waitingForPeer ? "waiting for peer" : (lifecycleR0 ? "solo · ready" : "peer joined");
        jumpButton.classList.add("hidden");
        joystick.classList.remove("active");
        cameraGimbal.classList.remove("active");
        recordLifecycle("actor-resume-prestart-complete", { resumeCount: message.resumeCount });
        clearNotice();
      }
      return;
    }
    if (resumingActor) throw new Error("actor resume was not accepted by authority");
    if (typeof message.resumeToken !== "string" || !message.resumeToken) throw new Error("welcome missing resume token");
    resumeToken = message.resumeToken;
    selfSessionId = message.selfSessionId;
    selfNetEntityId = message.selfNetEntityId;
    selfSlot = message.slot;
    updateRemoteFromR0Topology();
    persistCurrentActorSession();

    const lateJoinIntoR0 = lifecycleR0 && Number.isInteger(message.protocolStartTick);
    if (lateJoinIntoR0) {
      if (!message.rebaseSeed || !Number.isInteger(message.rebaseSeed.boundaryTick)) throw new Error("R0 late join missing authority rebase seed");
      if (message.state?.boundaryTick !== message.rebaseSeed.boundaryTick) throw new Error("R0 late join state/rebase boundary mismatch");
      protocolStartTick = message.protocolStartTick;
      buildArenaVisual(simulation);
      buildSpatialCues(message.state);
      resetJumpDeliveryForFreshRun();
      applyAuthorityRebase(message.rebaseSeed, message.state);
      playing = true;
      sessionEnd = null;
      networkState = "live · joined running Shared Yard";
      jumpButton.classList.remove("hidden");
      joystick.classList.add("active");
      cameraGimbal.classList.add("active");
      socket.send(JSON.stringify({ type: "world_v0_ready", ...identityFields(), ...r0TopologyIdentityFields() }));
      startLogicalInputScheduler();
      recordLifecycle("r0-late-join-bootstrap", {
        boundaryTick: localState.boundaryTick,
        topologyRevision: currentTopology.revision,
        topologyDigest: currentTopology.digest,
      });
      clearNotice();
      syncMeshes();
      return;
    }

    networkState = message.waitingForPeer ? "waiting for peer" : (lifecycleR0 ? "solo · synchronizing" : "peer joined");
    if (recoveringRoom) {
      clearRoomRecoveryTimer();
      roomRecovery.pending = false;
      roomRecovery.reason = null;
      roomRecovery.attempts = 0;
      roomRecovery.lastRecoveredEpoch = message.worldEpoch;
      roomRecovery.sourceEpoch = null;
      recordLifecycle("room-recovered", { roomId: runKey, sourceEpoch, recoveredEpoch: message.worldEpoch });
      showNotice(message.waitingForPeer ? "Back in the same Yard · waiting for friend" : "Back in the same Yard");
    }
    return;
  }
  if (message.type === "world_v0_roster") {
    assertMessageIdentity(message, "roster");
    const players = message.players || [];
    const remote = players.find((player) => player.sessionId !== selfSessionId) || null;
    remoteSessionId = remote?.sessionId || null;
    remoteNetEntityId = remote?.netEntityId || null;
    if (lifecycleR0) {
      const observed = normalizeR0Topology(message.topology, "roster");
      if (currentTopology && !sameR0Topology(currentTopology, observed) && Number.isInteger(protocolStartTick)) {
        topologyTransitionPending = true;
        stopLogicalInputScheduler();
        pendingBatch = [];
        networkState = "topology rebase pending";
        recordLifecycle("r0-topology-transition-observed", {
          fromRevision: currentTopology.revision,
          toRevision: observed.revision,
          toDigest: observed.digest,
        });
        return;
      }
      if (!currentTopology) adoptR0Topology(observed, "roster-initial", { allowChange: true });
      if (socket?.readyState === WebSocket.OPEN && !Number.isInteger(protocolStartTick)) {
        networkState = "solo · ready";
        socket.send(JSON.stringify({ type: "world_v0_ready", ...identityFields(), ...r0TopologyIdentityFields() }));
      }
      return;
    }
    if (players.length === 2 && socket?.readyState === WebSocket.OPEN && !Number.isInteger(protocolStartTick)) {
      networkState = "both connected · ready";
      socket.send(JSON.stringify({ type: "world_v0_ready", ...identityFields() }));
    }
    return;
  }
  if (message.type === "world_v0_ready_ack") {
    assertMessageIdentity(message, "ready-ack");
    assertR0MessageTopology(message, "ready-ack");
    networkState = lifecycleR0 && Number.isInteger(protocolStartTick) ? "live · Shared Yard V0" : "ready · awaiting start";
    return;
  }
  if (message.type === "world_v0_topology_changed") {
    if (!lifecycleR0) throw new Error("unexpected topology change outside R0");
    assertMessageIdentity(message, "topology-changed");
    const observed = normalizeR0Topology(message.topology, "topology-changed");
    if (!message.rebaseSeed) throw new Error("topology change missing authority rebase seed");
    if (currentTopology && sameR0Topology(currentTopology, observed) && localState && localState.boundaryTick >= message.rebaseSeed.boundaryTick) {
      recordLifecycle("r0-topology-change-already-applied", { topologyRevision: observed.revision, boundaryTick: message.rebaseSeed.boundaryTick });
      return;
    }
    stopLogicalInputScheduler();
    pendingBatch = [];
    topologyTransitionPending = true;
    applyAuthorityRebase(message.rebaseSeed);
    playing = true;
    networkState = "live · topology rebased";
    startLogicalInputScheduler();
    recordLifecycle("r0-topology-rebase-complete", {
      boundaryTick: localState.boundaryTick,
      topologyRevision: currentTopology.revision,
      topologyDigest: currentTopology.digest,
    });
    clearNotice();
    syncMeshes();
    return;
  }
  if (message.type === "world_v0_start") return handleStart(message);
  if (message.type === "world_v0_peer_records") return handlePeerRecords(message);
  if (message.type === "world_v0_consumed") return handleConsumed(message);
  if (message.type === "world_v0_batch_ack") return classifyBatchAck(message);
  if (message.type === "world_v0_snapshot") return handleSnapshot(message);
  if (message.type === "world_v0_pong") {
    assertMessageIdentity(message, "pong");
    updatePhaseFromPong(message, performance.now());
    return;
  }
  if (message.type === "world_v0_epoch_ended") {
    assertMessageIdentity(message, "epoch-ended");
    const recoverable = recoverableRoomEpochReason(message.reason);
    if (recoverable) {
      clearRoomRecoveryTimer();
      roomRecovery.pending = true;
      roomRecovery.reason = message.reason;
      roomRecovery.attempts = 0;
      roomRecovery.sourceEpoch = message.worldEpoch;
    }
    playing = false;
    clearCurrentStoredActorSession(message.worldEpoch);
    sessionEnd = {
      kind: "epoch-ended",
      reason: message.reason,
      boundaryTick: message.boundaryTick ?? localState?.boundaryTick ?? null,
      at: new Date().toISOString(),
    };
    networkState = recoverable ? "room epoch ended · recovery pending" : `epoch ended · ${message.reason}`;
    jumpButton.classList.add("hidden");
    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    recordLifecycle("epoch-ended", { reason: message.reason, boundaryTick: message.boundaryTick ?? null, recoverable });
    showNotice(recoverable ? "Yard is restarting this round…" : `Shared Yard round ended: ${message.reason}. Restart when ready.`);
    persistLastSessionEvidence("epoch-ended");
    updateProductStatus();
    return;
  }
  if (message.type === "world_v0_error") {
    if (identity && message.worldEpoch) assertMessageIdentity(message, "server-error");
    if (lifecycleR0 && message.error === "topology_identity_mismatch") {
      const receivedRevision = message.receivedTopology?.revision;
      if (currentTopology && Number.isInteger(receivedRevision) && receivedRevision < currentTopology.revision) {
        recordLifecycle("r0-stale-topology-rejection-observed", { receivedRevision, currentRevision: currentTopology.revision });
        return;
      }
      topologyTransitionPending = true;
      stopLogicalInputScheduler();
      pendingBatch = [];
      networkState = "topology rebase pending";
      recordLifecycle("r0-topology-mismatch-waiting-rebase", {
        receivedRevision: receivedRevision ?? null,
        expectedRevision: message.expectedTopology?.revision ?? null,
      });
      return;
    }
    throw new Error(`World V0 server: ${message.error}`);
  }
}''',
    "R0 topology message handling",
)

replace_once(
    'function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending) return;\n',
    'function advancePrediction() {\n  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending || topologyTransitionPending) return;\n',
    "pause prediction across topology boundary",
)

replace_block(
    'function syncMeshes() {',
    'function cameraPresetName() {',
    '''function syncMeshes() {
  if (!localState?.sim || !selfSessionId) return;
  if (!selfMesh) selfMesh = createPlayerMesh(true);
  if (remoteSessionId && !remoteMesh) remoteMesh = createPlayerMesh(false);
  const selfBody = localState.sim.actorBodies.get(selfSessionId);
  const remoteBody = remoteSessionId ? localState.sim.actorBodies.get(remoteSessionId) : null;
  if (selfBody) {
    const position = bodyPosition(selfBody);
    selfMesh.position.fromArray(position);
    selfMesh.quaternion.fromArray(bodyRotation(selfBody)).normalize();
    syncPresence(selfMesh, position);
  }
  if (remoteBody && remoteMesh) {
    const position = bodyPosition(remoteBody);
    remoteMesh.position.fromArray(position);
    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();
    syncPresence(remoteMesh, position);
  }
  for (const [id, body] of localState.sim.propBodies) {
    const mesh = getPropMesh(id);
    mesh.position.fromArray(bodyPosition(body));
    mesh.quaternion.fromArray(bodyRotation(body)).normalize();
  }
}''',
    "solo mesh sync",
)

replace_once(
    '    identity: identity ? { ...identity } : null,\n    runKey,\n',
    '    identity: identity ? { ...identity } : null,\n'
    '    lifecycle: {\n'
    '      r0: lifecycleR0,\n'
    '      topologyTransitionPending,\n'
    '      topology: currentTopology ? { ...currentTopology, actors: currentTopology.actors.map((actor) => ({ ...actor })), entityOrder: [...currentTopology.entityOrder] } : null,\n'
    '    },\n'
    '    runKey,\n',
    "evidence topology",
)

replace_once(
    '    localBoundaryTick: localState?.boundaryTick ?? null,\n    protocolStartTick,\n',
    '    localBoundaryTick: localState?.boundaryTick ?? null,\n'
    '    protocolStartTick,\n'
    '    livePhysics: {\n'
    '      netEntityOrder: localState?.sim?.netEntityOrder ? [...localState.sim.netEntityOrder] : null,\n'
    '      selfPosition: selfSessionId && localState?.sim?.actorBodies.get(selfSessionId) ? bodyPosition(localState.sim.actorBodies.get(selfSessionId)) : null,\n'
    '      remotePosition: remoteSessionId && localState?.sim?.actorBodies.get(remoteSessionId) ? bodyPosition(localState.sim.actorBodies.get(remoteSessionId)) : null,\n'
    '    },\n',
    "evidence live physics",
)

replace_once(
    '  identity = null;\n  selfSessionId = null;\n',
    '  identity = null;\n  currentTopology = null;\n  topologyTransitionPending = false;\n  selfSessionId = null;\n',
    "reset topology",
)

replace_once(
    '  shareUrl.searchParams.set("run", runKey);\n  history.replaceState(null, "", shareUrl);\n',
    '  shareUrl.searchParams.set("run", runKey);\n  if (lifecycleR0) shareUrl.searchParams.set("lifecycle", "r0");\n  history.replaceState(null, "", shareUrl);\n',
    "history lifecycle preservation",
)

path.write_text(text)
print("WORLD_V0_R0B2_BROWSER_MATERIALIZER_APPLIED")
