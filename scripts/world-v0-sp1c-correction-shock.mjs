import Box3D from "box3d.js/inline";
import {
  generateStressManifest,
  stressChaosDNA,
} from "../public/world-v0-stress/phenomenon-manifest.js";

const DT = 1 / 60;
const SUBSTEPS = 4;
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const RECORDING_INITIAL_CAPACITY_BYTES = 2 * 1024 * 1024;
const SCENARIO = "ram-chain";
const COUNT = 128;
const SEED = 0x51f15e;
const INTERVENTION_BOUNDARY = 24;
const CORRECTION_BOUNDARY = 48;
const FINAL_BOUNDARY = 72;
const RAM_ID = "stress-body-00000";
const LATERAL_NUDGE_Z = 0.8;
const REPEATS = 2;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const FLOAT_VIEW = new DataView(new ArrayBuffer(4));
function floatBits(value) {
  FLOAT_VIEW.setFloat32(0, value, true);
  return FLOAT_VIEW.getUint32(0, true);
}

function hashSnapshot(snapshot, ids) {
  let hash = 0x811c9dc5 >>> 0;
  const mix = (word) => {
    hash ^= word >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const id of ids) {
    const state = snapshot.get(id);
    assert(state, `hash state missing ${id}`);
    for (const value of state) mix(floatBits(value));
  }
  return hash.toString(16).padStart(8, "0");
}

function bodyState(b3, body) {
  const p = [0, 0, 0];
  const q = [0, 0, 0, 1];
  const lv = [0, 0, 0];
  const av = [0, 0, 0];
  b3.b3Body_GetPosition(p, body);
  b3.b3Body_GetRotation(q, body);
  b3.b3Body_GetLinearVelocity(lv, body);
  b3.b3Body_GetAngularVelocity(av, body);
  return [...p, ...q, ...lv, ...av];
}

function snapshotBodies(b3, byId, ids) {
  const snapshot = new Map();
  for (const id of ids) {
    const body = byId.get(id);
    assert(body && b3.b3Body_IsValid(body), `snapshot body missing ${id}`);
    const state = bodyState(b3, body);
    assert(state.every(Number.isFinite), `non-finite state ${id}`);
    snapshot.set(id, state);
  }
  return snapshot;
}

function exactDiff(a, b, ids) {
  let affectedBodies = 0;
  let differingComponents = 0;
  let maxPositionDelta = 0;
  let maxLinearVelocityDelta = 0;
  let firstDifference = null;
  for (const id of ids) {
    const left = a.get(id);
    const right = b.get(id);
    assert(left && right, `diff body missing ${id}`);
    let affected = false;
    for (let index = 0; index < left.length; index += 1) {
      if (floatBits(left[index]) !== floatBits(right[index])) {
        affected = true;
        differingComponents += 1;
        if (!firstDifference) firstDifference = { id, componentIndex: index, left: left[index], right: right[index] };
      }
    }
    if (affected) affectedBodies += 1;
    maxPositionDelta = Math.max(
      maxPositionDelta,
      Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]),
    );
    maxLinearVelocityDelta = Math.max(
      maxLinearVelocityDelta,
      Math.hypot(left[7] - right[7], left[8] - right[8], left[9] - right[9]),
    );
  }
  return { affectedBodies, differingComponents, maxPositionDelta, maxLinearVelocityDelta, firstDifference };
}

function addStaticBox(b3, world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function addManifestBody(b3, world, spec) {
  assert(spec.shape === "box", `unsupported manifest shape ${spec.shape}`);
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...spec.position];
  bodyDef.linearDamping = spec.linearDamping;
  bodyDef.angularDamping = spec.angularDamping;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, spec.id);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = spec.density;
  shapeDef.baseMaterial.friction = spec.friction;
  shapeDef.baseMaterial.restitution = spec.restitution;
  b3.b3CreateBoxShape(body, shapeDef, spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2]);
  b3.b3Body_SetLinearVelocity(body, [...spec.initialVelocity]);
  return body;
}

function buildWorld(b3, manifest) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  const extent = manifest.extent;
  addStaticBox(b3, world, [0, -0.5, 0], [extent, 0.5, extent]);
  addStaticBox(b3, world, [-extent + 0.25, 3.0, 0], [0.25, 3.5, extent]);
  addStaticBox(b3, world, [extent - 0.25, 3.0, 0], [0.25, 3.5, extent]);
  addStaticBox(b3, world, [0, 3.0, -extent + 0.25], [extent, 3.5, 0.25]);
  addStaticBox(b3, world, [0, 3.0, extent - 0.25], [extent, 3.5, 0.25]);
  const byId = new Map();
  for (const spec of manifest.bodies) byId.set(spec.id, addManifestBody(b3, world, spec));
  const eventsByTick = new Map();
  for (const event of manifest.events) {
    const list = eventsByTick.get(event.tick) || [];
    list.push(event);
    eventsByTick.set(event.tick, list);
  }
  return { world, byId, eventsByTick, ownerPlayer: 0 };
}

function destroyBuilt(b3, built) {
  if (!built) return;
  if (built.ownerPlayer) {
    try { b3.b3RecPlayer_Destroy(built.ownerPlayer); } catch { /* teardown */ }
  } else if (built.world) {
    try { b3.b3DestroyWorld(built.world); } catch { /* teardown */ }
  }
}

function applyManifestEvents(b3, built, boundaryTick) {
  for (const event of built.eventsByTick.get(boundaryTick) || []) {
    const body = built.byId.get(event.bodyId);
    assert(body, `manifest event body missing ${event.bodyId}`);
    if (event.type !== "set-linear-velocity") throw new Error(`unsupported manifest event ${event.type}`);
    b3.b3Body_SetLinearVelocity(body, [...event.velocity]);
  }
}

function applyIntervention(b3, built) {
  const ram = built.byId.get(RAM_ID);
  assert(ram, `ram missing ${RAM_ID}`);
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, ram);
  const before = [...velocity];
  velocity[2] += LATERAL_NUDGE_Z;
  b3.b3Body_SetLinearVelocity(ram, velocity);
  return { before, after: [...velocity] };
}

function stepBoundary(b3, built, boundaryTick, intervention = false) {
  applyManifestEvents(b3, built, boundaryTick);
  let interventionState = null;
  if (intervention && boundaryTick === INTERVENTION_BOUNDARY) interventionState = applyIntervention(b3, built);
  b3.b3World_Step(built.world, DT, SUBSTEPS);
  return interventionState;
}

function startRecording(b3, world, startTick) {
  const recording = b3.b3CreateRecording(RECORDING_INITIAL_CAPACITY_BYTES);
  assert(recording, `recording create failed at B(${startTick})`);
  b3.b3World_StartRecording(world, recording);
  return { recording, startTick, frames: 0 };
}

function trimHistory(b3, history, boundaryTick) {
  const cutoff = boundaryTick - RETAIN_TICKS;
  const kept = [];
  for (const segment of history.segments) {
    if (segment.endTick >= cutoff) kept.push(segment);
    else b3.b3DestroyRecording(segment.recording);
  }
  history.segments = kept;
}

function rotateHistory(b3, built, history, boundaryTick) {
  const active = history.active;
  assert(active, `active recording missing at B(${boundaryTick})`);
  b3.b3World_StopRecording(built.world);
  history.active = null;
  history.segments.push({
    recording: active.recording,
    startTick: active.startTick,
    endTick: active.startTick + active.frames,
    frames: active.frames,
    bytes: b3.b3Recording_GetSize(active.recording),
  });
  trimHistory(b3, history, boundaryTick);
  history.active = startRecording(b3, built.world, boundaryTick);
}

function stopEmptyActiveRecording(b3, built, history) {
  if (!history.active) return;
  b3.b3World_StopRecording(built.world);
  b3.b3DestroyRecording(history.active.recording);
  history.active = null;
}

function cleanupHistory(b3, built, history) {
  if (!history) return;
  if (history.active) {
    try { b3.b3World_StopRecording(built.world); } catch { /* teardown */ }
    try { b3.b3DestroyRecording(history.active.recording); } catch { /* teardown */ }
    history.active = null;
  }
  for (const segment of history.segments) {
    try { b3.b3DestroyRecording(segment.recording); } catch { /* teardown */ }
  }
  history.segments = [];
}

function remapReplay(b3, player, ids, eventsByTick) {
  const world = b3.b3RecPlayer_GetWorldId(player);
  const byId = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) byId.set(name, body);
  }
  for (const id of ids) assert(byId.has(id), `replay remap missing ${id}`);
  return { world, byId, eventsByTick, ownerPlayer: player };
}

function runUniverse(b3, manifest, ids, { intervention, finalBoundary, captureBoundaries = [] }) {
  const built = buildWorld(b3, manifest);
  const captures = new Map();
  let interventionState = null;
  try {
    if (captureBoundaries.includes(0)) captures.set(0, snapshotBodies(b3, built.byId, ids));
    for (let boundary = 0; boundary < finalBoundary; boundary += 1) {
      const applied = stepBoundary(b3, built, boundary, intervention);
      if (applied) interventionState = applied;
      const nextBoundary = boundary + 1;
      if (captureBoundaries.includes(nextBoundary)) captures.set(nextBoundary, snapshotBodies(b3, built.byId, ids));
    }
    return { built, captures, interventionState };
  } catch (error) {
    destroyBuilt(b3, built);
    throw error;
  }
}

function runPredictedWithHistory(b3, manifest, ids) {
  const built = buildWorld(b3, manifest);
  const history = { active: startRecording(b3, built.world, 0), segments: [] };
  try {
    for (let boundary = 0; boundary < CORRECTION_BOUNDARY; boundary += 1) {
      stepBoundary(b3, built, boundary, false);
      history.active.frames += 1;
      const nextBoundary = boundary + 1;
      if (history.active.frames >= SEGMENT_TICKS) rotateHistory(b3, built, history, nextBoundary);
    }
    stopEmptyActiveRecording(b3, built, history);
    const beforeCorrection = snapshotBodies(b3, built.byId, ids);
    return { built, history, beforeCorrection };
  } catch (error) {
    cleanupHistory(b3, built, history);
    destroyBuilt(b3, built);
    throw error;
  }
}

function selectCheckpoint(history, targetTick) {
  const candidates = history.segments
    .filter((segment) => segment.startTick <= targetTick && segment.endTick >= targetTick)
    .sort((a, b) => b.startTick - a.startTick);
  const selected = candidates[0];
  assert(selected, `no retained checkpoint covers B(${targetTick})`);
  return selected;
}

function correctPredicted(b3, predicted, ids) {
  const timings = {};
  const totalStart = performance.now();

  let phase = performance.now();
  const selected = selectCheckpoint(predicted.history, INTERVENTION_BOUNDARY);
  timings.selectMs = performance.now() - phase;

  phase = performance.now();
  const seekFrame = INTERVENTION_BOUNDARY - selected.startTick;
  const player = b3.b3RecPlayer_CreateFromRecording(selected.recording, 0);
  assert(player, `RecPlayer create failed for B(${INTERVENTION_BOUNDARY})`);
  timings.createPlayerMs = performance.now() - phase;

  let corrected = null;
  try {
    phase = performance.now();
    b3.b3RecPlayer_SeekFrame(player, seekFrame);
    assert(b3.b3RecPlayer_GetFrame(player) === seekFrame, `seek mismatch expected=${seekFrame} actual=${b3.b3RecPlayer_GetFrame(player)}`);
    assert(!b3.b3RecPlayer_HasDiverged(player), `checkpoint replay diverged frame=${b3.b3RecPlayer_GetDivergeFrame(player)}`);
    timings.seekMs = performance.now() - phase;

    phase = performance.now();
    corrected = remapReplay(b3, player, ids, predicted.built.eventsByTick);
    timings.remapMs = performance.now() - phase;

    phase = performance.now();
    const interventionState = applyIntervention(b3, corrected);
    timings.interventionMs = performance.now() - phase;

    phase = performance.now();
    for (let boundary = INTERVENTION_BOUNDARY; boundary < CORRECTION_BOUNDARY; boundary += 1) {
      applyManifestEvents(b3, corrected, boundary);
      b3.b3World_Step(corrected.world, DT, SUBSTEPS);
    }
    timings.replayForwardMs = performance.now() - phase;
    timings.totalCorrectionMs = performance.now() - totalStart;

    return { corrected, selected: { startTick: selected.startTick, endTick: selected.endTick, frames: selected.frames, bytes: selected.bytes }, seekFrame, interventionState, timings };
  } catch (error) {
    if (corrected) destroyBuilt(b3, corrected);
    else try { b3.b3RecPlayer_Destroy(player); } catch { /* teardown */ }
    throw error;
  }
}

async function runRepeat(repeat) {
  const b3 = await Box3D();
  const required = [
    "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording", "b3Recording_GetSize",
    "b3RecPlayer_CreateFromRecording", "b3RecPlayer_Destroy", "b3RecPlayer_GetWorldId", "b3RecPlayer_GetBodyCount",
    "b3RecPlayer_GetBodyId", "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_HasDiverged",
    "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid", "b3DestroyWorld",
  ];
  const missing = required.filter((name) => typeof b3[name] !== "function");
  assert(missing.length === 0, `Box3D correction capability missing: ${missing.join(",")}`);

  const manifest = generateStressManifest({ scenario: SCENARIO, count: COUNT, seed: SEED, durationTicks: FINAL_BOUNDARY });
  const ids = manifest.bodies.map((body) => body.id);
  const groundTruth = runUniverse(b3, manifest, ids, {
    intervention: true,
    finalBoundary: FINAL_BOUNDARY,
    captureBoundaries: [CORRECTION_BOUNDARY, FINAL_BOUNDARY],
  });
  const untouched = runUniverse(b3, manifest, ids, {
    intervention: false,
    finalBoundary: FINAL_BOUNDARY,
    captureBoundaries: [CORRECTION_BOUNDARY, FINAL_BOUNDARY],
  });
  const predicted = runPredictedWithHistory(b3, manifest, ids);
  let correction = null;

  try {
    const truthAtCorrection = groundTruth.captures.get(CORRECTION_BOUNDARY);
    const truthAtFinal = groundTruth.captures.get(FINAL_BOUNDARY);
    const untouchedAtCorrection = untouched.captures.get(CORRECTION_BOUNDARY);
    const untouchedAtFinal = untouched.captures.get(FINAL_BOUNDARY);
    assert(truthAtCorrection && truthAtFinal && untouchedAtCorrection && untouchedAtFinal, "capture missing");

    const preCorrectionVsUntouched = exactDiff(predicted.beforeCorrection, untouchedAtCorrection, ids);
    assert(preCorrectionVsUntouched.affectedBodies === 0, `predicted baseline drifted before correction ${JSON.stringify(preCorrectionVsUntouched.firstDifference)}`);

    correction = correctPredicted(b3, predicted, ids);
    const correctedAtCorrection = snapshotBodies(b3, correction.corrected.byId, ids);
    const exactAtCorrection = exactDiff(correctedAtCorrection, truthAtCorrection, ids);
    const causalAtCorrection = exactDiff(untouchedAtCorrection, truthAtCorrection, ids);

    assert(exactAtCorrection.affectedBodies === 0, `corrected state mismatch at B(${CORRECTION_BOUNDARY}) ${JSON.stringify(exactAtCorrection.firstDifference)}`);
    assert(causalAtCorrection.affectedBodies > 1, `intervention failed to amplify beyond ram at B(${CORRECTION_BOUNDARY}); affected=${causalAtCorrection.affectedBodies}`);

    for (let boundary = CORRECTION_BOUNDARY; boundary < FINAL_BOUNDARY; boundary += 1) stepBoundary(b3, correction.corrected, boundary, false);
    const correctedAtFinal = snapshotBodies(b3, correction.corrected.byId, ids);
    const exactAtFinal = exactDiff(correctedAtFinal, truthAtFinal, ids);
    const causalAtFinal = exactDiff(untouchedAtFinal, truthAtFinal, ids);
    assert(exactAtFinal.affectedBodies === 0, `corrected future mismatch at B(${FINAL_BOUNDARY}) ${JSON.stringify(exactAtFinal.firstDifference)}`);
    assert(causalAtFinal.affectedBodies > 1, `causal footprint collapsed to ram-only at B(${FINAL_BOUNDARY}); affected=${causalAtFinal.affectedBodies}`);

    return {
      repeat,
      phenomenonId: manifest.phenomenonId,
      chaosDNA: stressChaosDNA(manifest),
      intervention: {
        boundaryTick: INTERVENTION_BOUNDARY,
        bodyId: RAM_ID,
        lateralVelocityDeltaZ: LATERAL_NUDGE_Z,
        ...correction.interventionState,
      },
      retainedCheckpoint: correction.selected,
      seekFrame: correction.seekFrame,
      correctionTimingMs: correction.timings,
      hashes: {
        predictedBeforeCorrection: hashSnapshot(predicted.beforeCorrection, ids),
        untouchedAtCorrection: hashSnapshot(untouchedAtCorrection, ids),
        truthAtCorrection: hashSnapshot(truthAtCorrection, ids),
        correctedAtCorrection: hashSnapshot(correctedAtCorrection, ids),
        untouchedAtFinal: hashSnapshot(untouchedAtFinal, ids),
        truthAtFinal: hashSnapshot(truthAtFinal, ids),
        correctedAtFinal: hashSnapshot(correctedAtFinal, ids),
      },
      exactRecovery: { atCorrection: exactAtCorrection, atFinal: exactAtFinal },
      causalFootprint: { atCorrection: causalAtCorrection, atFinal: causalAtFinal },
    };
  } finally {
    if (correction?.corrected) destroyBuilt(b3, correction.corrected);
    cleanupHistory(b3, predicted.built, predicted.history);
    destroyBuilt(b3, predicted.built);
    destroyBuilt(b3, untouched.built);
    destroyBuilt(b3, groundTruth.built);
  }
}

const repeats = [];
for (let repeat = 1; repeat <= REPEATS; repeat += 1) repeats.push(await runRepeat(repeat));

const reference = repeats[0];
for (const run of repeats.slice(1)) {
  assert(run.phenomenonId === reference.phenomenonId, "phenomenon id drift across repeats");
  assert(run.hashes.truthAtCorrection === reference.hashes.truthAtCorrection, "ground-truth correction hash nondeterministic");
  assert(run.hashes.truthAtFinal === reference.hashes.truthAtFinal, "ground-truth final hash nondeterministic");
  assert(run.hashes.correctedAtCorrection === reference.hashes.correctedAtCorrection, "corrected correction hash nondeterministic");
  assert(run.hashes.correctedAtFinal === reference.hashes.correctedAtFinal, "corrected final hash nondeterministic");
  assert(run.causalFootprint.atCorrection.affectedBodies === reference.causalFootprint.atCorrection.affectedBodies, "correction footprint count nondeterministic");
  assert(run.causalFootprint.atFinal.affectedBodies === reference.causalFootprint.atFinal.affectedBodies, "final footprint count nondeterministic");
}

console.log(JSON.stringify({
  verdict: "WORLD_V0_SP1C_RAM_CORRECTION_SHOCK_PASS",
  box3d: "box3d.js@0.1.1",
  contract: {
    dt: DT,
    substeps: SUBSTEPS,
    segmentTicks: SEGMENT_TICKS,
    retainTicks: RETAIN_TICKS,
    recordingInitialCapacityBytes: RECORDING_INITIAL_CAPACITY_BYTES,
    scenario: SCENARIO,
    count: COUNT,
    seed: SEED,
    interventionBoundary: INTERVENTION_BOUNDARY,
    correctionBoundary: CORRECTION_BOUNDARY,
    finalBoundary: FINAL_BOUNDARY,
    repeats: REPEATS,
  },
  repeats,
  claimBoundary: "isolated hosted Node rollback/correction-shock evidence only; no authority, network, browser-frame, device-performance or qualified-product claim",
}, null, 2));
