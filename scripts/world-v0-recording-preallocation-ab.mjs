import Box3D from "box3d.js/inline";
import {
  generateStressManifest,
  stressChaosDNA,
} from "../public/world-v0-stress/phenomenon-manifest.js";

const DT = 1 / 60;
const SUBSTEPS = 4;
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const TICKS = 144;
const SEED = 0x51f15e;
const DEFAULT_64K = 64 * 1024;
const CURRENT_2M = 2 * 1024 * 1024;
const VERIFY_BOUNDARIES = new Set([8, 72, 144]);

const POLICIES = [
  { label: "default-64k", initialCapacityBytes: 0, effectiveInitialCapacityBytes: DEFAULT_64K },
  { label: "current-2m", initialCapacityBytes: CURRENT_2M, effectiveInitialCapacityBytes: CURRENT_2M },
];

const CELLS = [
  { label: "small-width", scenario: "quiet-width", count: 32, expectedRegime: "below-64k" },
  { label: "medium-contact", scenario: "hetero-pile", count: 128, expectedRegime: "between-64k-and-2m" },
  { label: "high-sustained", scenario: "wake-churn", count: 640, expectedRegime: "above-2m" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function summary(values) {
  return {
    samples: values.length,
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Math.max(...values) : 0,
  };
}

const FLOAT_VIEW = new DataView(new ArrayBuffer(4));
function floatBits(value) {
  FLOAT_VIEW.setFloat32(0, value, true);
  return FLOAT_VIEW.getUint32(0, true);
}

function hashBodyIds(b3, bodyIds) {
  let hash = 0x811c9dc5 >>> 0;
  const mix = (word) => {
    hash ^= word >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const body of bodyIds) {
    const p = [0, 0, 0];
    const q = [0, 0, 0, 1];
    const lv = [0, 0, 0];
    const av = [0, 0, 0];
    b3.b3Body_GetPosition(p, body);
    b3.b3Body_GetRotation(q, body);
    b3.b3Body_GetLinearVelocity(lv, body);
    b3.b3Body_GetAngularVelocity(av, body);
    for (const value of [...p, ...q, ...lv, ...av]) mix(floatBits(value));
  }
  return hash.toString(16).padStart(8, "0");
}

function bodiesFinite(b3, bodyIds) {
  for (const body of bodyIds) {
    const p = [0, 0, 0];
    const q = [0, 0, 0, 1];
    const lv = [0, 0, 0];
    const av = [0, 0, 0];
    b3.b3Body_GetPosition(p, body);
    b3.b3Body_GetRotation(q, body);
    b3.b3Body_GetLinearVelocity(lv, body);
    b3.b3Body_GetAngularVelocity(av, body);
    if (![...p, ...q, ...lv, ...av].every(Number.isFinite)) return false;
  }
  return true;
}

function allocatorBytes(b3) {
  const fn = b3?.b3GetByteCount ?? b3?._b3GetByteCount;
  if (typeof fn !== "function") return null;
  const value = Number(fn());
  return Number.isFinite(value) ? value : null;
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

  const bodies = [];
  const byId = new Map();
  for (const spec of manifest.bodies) {
    const body = addManifestBody(b3, world, spec);
    bodies.push(body);
    byId.set(spec.id, body);
  }
  const eventsByTick = new Map();
  for (const event of manifest.events) {
    const list = eventsByTick.get(event.tick) || [];
    list.push(event);
    eventsByTick.set(event.tick, list);
  }
  return { world, bodies, byId, eventsByTick };
}

function applyEvents(b3, built, tick) {
  for (const event of built.eventsByTick.get(tick) || []) {
    const body = built.byId.get(event.bodyId);
    assert(body, `event body missing ${event.bodyId}`);
    if (event.type === "set-linear-velocity") {
      b3.b3Body_SetLinearVelocity(body, [...event.velocity]);
      continue;
    }
    throw new Error(`unsupported event ${event.type}`);
  }
}

function startRecording(b3, world, policy, startTick) {
  const recording = b3.b3CreateRecording(policy.initialCapacityBytes);
  assert(recording, `recording create failed ${policy.label}`);
  b3.b3World_StartRecording(world, recording);
  return { recording, startTick, frames: 0 };
}

function retainedLogicalBytes(history) {
  return history.segments.reduce((sum, segment) => sum + segment.bytes, 0);
}

function trimInclusiveHistory(b3, history, boundaryTick) {
  const cutoff = boundaryTick - RETAIN_TICKS;
  const kept = [];
  for (const segment of history.segments) {
    if (segment.endTick >= cutoff) kept.push(segment);
    else b3.b3DestroyRecording(segment.recording);
  }
  history.segments = kept;
}

function rotateHistory(b3, world, history, policy, boundaryTick, final = false) {
  const active = history.active;
  assert(active, `missing active recording at B(${boundaryTick})`);
  const started = performance.now();
  b3.b3World_StopRecording(world);
  history.active = null;
  const bytes = b3.b3Recording_GetSize(active.recording);
  const segment = {
    recording: active.recording,
    startTick: active.startTick,
    endTick: active.startTick + active.frames,
    frames: active.frames,
    bytes,
  };
  history.segments.push(segment);
  trimInclusiveHistory(b3, history, boundaryTick);
  const retainedBytes = retainedLogicalBytes(history);
  if (!final) history.active = startRecording(b3, world, policy, boundaryTick);
  const ms = performance.now() - started;
  history.rotationSamples.push({ boundaryTick, ms, bytes, retainedBytes, retainedSegments: history.segments.length });
  history.maxSegmentBytes = Math.max(history.maxSegmentBytes, bytes);
  history.maxRetainedLogicalBytes = Math.max(history.maxRetainedLogicalBytes, retainedBytes);
  history.maxRetainedSegments = Math.max(history.maxRetainedSegments, history.segments.length);
  return segment;
}

function cleanupHistory(b3, world, history) {
  if (history.active) {
    try { b3.b3World_StopRecording(world); } catch { /* teardown */ }
    try { b3.b3DestroyRecording(history.active.recording); } catch { /* teardown */ }
    history.active = null;
  }
  for (const segment of history.segments) {
    try { b3.b3DestroyRecording(segment.recording); } catch { /* teardown */ }
  }
  history.segments = [];
}

function replayBodyIds(b3, player, ids) {
  const byName = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) byName.set(name, body);
  }
  return ids.map((id) => {
    const body = byName.get(id);
    if (!body) throw new Error(`replay body missing ${id}`);
    return body;
  });
}

function verifySegment(b3, segment, liveBodies, ids) {
  const liveHash = hashBodyIds(b3, liveBodies);
  let player = 0;
  try {
    player = b3.b3RecPlayer_CreateFromRecording(segment.recording, 0);
    assert(player, `RecPlayer create failed B(${segment.endTick})`);
    b3.b3RecPlayer_SeekFrame(player, segment.frames);
    const frame = b3.b3RecPlayer_GetFrame(player);
    assert(frame === segment.frames, `seek mismatch B(${segment.endTick}) expected=${segment.frames} actual=${frame}`);
    assert(!b3.b3RecPlayer_HasDiverged(player), `replay diverged B(${segment.endTick}) frame=${b3.b3RecPlayer_GetDivergeFrame(player)}`);
    const replayHash = hashBodyIds(b3, replayBodyIds(b3, player, ids));
    assert(replayHash === liveHash, `replay state mismatch B(${segment.endTick}) live=${liveHash} replay=${replayHash}`);
    return { boundaryTick: segment.endTick, frame, liveHash, replayHash };
  } finally {
    if (player) b3.b3RecPlayer_Destroy(player);
  }
}

function sampleWorldActivity(b3, world) {
  let awakeBodies = null;
  let awakeContacts = null;
  try {
    if (typeof b3.b3World_GetAwakeBodyCount === "function") awakeBodies = Number(b3.b3World_GetAwakeBodyCount(world));
  } catch { /* capability context only */ }
  try {
    if (typeof b3.b3World_GetCounters === "function") {
      const counters = b3.b3World_GetCounters(world);
      const value = Number(counters?.awakeContactCount);
      if (Number.isFinite(value)) awakeContacts = value;
    }
  } catch { /* capability context only */ }
  return { awakeBodies, awakeContacts };
}

function classifySegmentRegime(bytes) {
  if (bytes < DEFAULT_64K) return "below-64k";
  if (bytes <= CURRENT_2M) return "between-64k-and-2m";
  return "above-2m";
}

async function runPerformanceProfile(cell, policy, repeat) {
  const b3 = await Box3D();
  assert(typeof b3.b3GetByteCount === "function", "b3GetByteCount missing after SP1B0 proved exposure");
  assert(typeof b3.b3DestroyWorld === "function", "b3DestroyWorld missing");
  const manifest = generateStressManifest({ scenario: cell.scenario, count: cell.count, seed: SEED, durationTicks: TICKS });
  const moduleBaselineBytes = allocatorBytes(b3);
  let built = null;
  let history = null;
  const physicsStepMs = [];
  const managedTickMs = [];
  const allocatorSamples = [];
  const activitySamples = [];
  let preRecordingAllocatorBytes = null;
  let maxAllocatorBytes = moduleBaselineBytes ?? 0;

  try {
    built = buildWorld(b3, manifest);
    preRecordingAllocatorBytes = allocatorBytes(b3);
    history = {
      active: startRecording(b3, built.world, policy, 0),
      segments: [],
      rotationSamples: [],
      maxSegmentBytes: 0,
      maxRetainedLogicalBytes: 0,
      maxRetainedSegments: 0,
    };
    const afterInitialRecordingBytes = allocatorBytes(b3);
    maxAllocatorBytes = Math.max(maxAllocatorBytes, afterInitialRecordingBytes ?? 0);
    allocatorSamples.push({
      boundaryTick: 0,
      totalBytes: afterInitialRecordingBytes,
      deltaFromPreRecordingBaseline: afterInitialRecordingBytes !== null && preRecordingAllocatorBytes !== null ? afterInitialRecordingBytes - preRecordingAllocatorBytes : null,
      retainedSegments: 0,
      retainedLogicalBytes: 0,
      activeRecording: true,
    });

    for (let tick = 0; tick < TICKS; tick += 1) {
      const managedStart = performance.now();
      applyEvents(b3, built, tick);
      const physicsStart = performance.now();
      b3.b3World_Step(built.world, DT, SUBSTEPS);
      const physicsMs = performance.now() - physicsStart;
      physicsStepMs.push({ tick: tick + 1, ms: physicsMs });
      history.active.frames += 1;
      const boundaryTick = tick + 1;
      if (history.active.frames >= SEGMENT_TICKS) {
        rotateHistory(b3, built.world, history, policy, boundaryTick, boundaryTick >= TICKS);
      }
      managedTickMs.push({ tick: boundaryTick, ms: performance.now() - managedStart });

      // Telemetry is deliberately outside the managed-tick timer.
      if (boundaryTick % SEGMENT_TICKS === 0) {
        const totalBytes = allocatorBytes(b3);
        maxAllocatorBytes = Math.max(maxAllocatorBytes, totalBytes ?? 0);
        allocatorSamples.push({
          boundaryTick,
          totalBytes,
          deltaFromPreRecordingBaseline: totalBytes !== null && preRecordingAllocatorBytes !== null ? totalBytes - preRecordingAllocatorBytes : null,
          retainedSegments: history.segments.length,
          retainedLogicalBytes: retainedLogicalBytes(history),
          activeRecording: Boolean(history.active),
        });
      }
      if (boundaryTick % 24 === 0) {
        activitySamples.push({ boundaryTick, ...sampleWorldActivity(b3, built.world) });
        assert(bodiesFinite(b3, built.bodies), `non-finite world state ${cell.label}/${policy.label}/r${repeat} B(${boundaryTick})`);
      }
    }

    const finalHash = hashBodyIds(b3, built.bodies);
    const segmentRegime = classifySegmentRegime(history.maxSegmentBytes);
    const steadyPhysics = physicsStepMs.filter((sample) => sample.tick > 24).map((sample) => sample.ms);
    const steadyManaged = managedTickMs.filter((sample) => sample.tick > 24).map((sample) => sample.ms);
    const allRotation = history.rotationSamples.map((sample) => sample.ms);
    const steadyRotation = history.rotationSamples.filter((sample) => sample.boundaryTick > 24).map((sample) => sample.ms);
    const maxAllocatorDelta = allocatorSamples.reduce((max, sample) => {
      return Math.max(max, sample.deltaFromPreRecordingBaseline ?? 0);
    }, 0);

    cleanupHistory(b3, built.world, history);
    const allocatorAfterHistoryCleanup = allocatorBytes(b3);
    b3.b3DestroyWorld(built.world);
    built = null;
    const allocatorAfterWorldDestroy = allocatorBytes(b3);

    return {
      profile: "performance",
      cell: cell.label,
      scenario: cell.scenario,
      count: cell.count,
      expectedRegime: cell.expectedRegime,
      observedRegime: segmentRegime,
      repeat,
      policy: policy.label,
      initialCapacityBytes: policy.initialCapacityBytes,
      effectiveInitialCapacityBytes: policy.effectiveInitialCapacityBytes,
      phenomenonId: manifest.phenomenonId,
      chaosDNA: stressChaosDNA(manifest),
      finalHash,
      finite: true,
      physicsStepMs: { all: summary(physicsStepMs.map((sample) => sample.ms)), steadyAfterB24: summary(steadyPhysics) },
      managedTickMs: { all: summary(managedTickMs.map((sample) => sample.ms)), steadyAfterB24: summary(steadyManaged) },
      rotationMs: { all: summary(allRotation), steadyAfterB24: summary(steadyRotation) },
      history: {
        maxSegmentBytes: history.maxSegmentBytes,
        maxRetainedLogicalBytes: history.maxRetainedLogicalBytes,
        maxRetainedSegments: history.maxRetainedSegments,
        segmentCount: history.rotationSamples.length,
        rotations: history.rotationSamples,
      },
      allocator: {
        moduleBaselineBytes,
        preRecordingBaselineBytes: preRecordingAllocatorBytes,
        afterInitialRecordingBytes,
        initialRecordingDeltaBytes: afterInitialRecordingBytes !== null && preRecordingAllocatorBytes !== null ? afterInitialRecordingBytes - preRecordingAllocatorBytes : null,
        maxTotalBytes: maxAllocatorBytes,
        maxDeltaFromPreRecordingBaselineBytes: maxAllocatorDelta,
        afterHistoryCleanupBytes: allocatorAfterHistoryCleanup,
        afterWorldDestroyBytes: allocatorAfterWorldDestroy,
        samples: allocatorSamples,
      },
      activitySamples,
      claimBoundary: "hosted Node comparative lab only; no device or product performance claim",
    };
  } finally {
    if (built) {
      try { if (history) cleanupHistory(b3, built.world, history); } catch { /* teardown */ }
      try { b3.b3DestroyWorld(built.world); } catch { /* teardown */ }
    }
  }
}

async function runVerificationProfile(cell, policy) {
  const b3 = await Box3D();
  const manifest = generateStressManifest({ scenario: cell.scenario, count: cell.count, seed: SEED, durationTicks: TICKS });
  let built = null;
  let history = null;
  const checks = [];
  try {
    built = buildWorld(b3, manifest);
    history = {
      active: startRecording(b3, built.world, policy, 0),
      segments: [],
      rotationSamples: [],
      maxSegmentBytes: 0,
      maxRetainedLogicalBytes: 0,
      maxRetainedSegments: 0,
    };
    for (let tick = 0; tick < TICKS; tick += 1) {
      applyEvents(b3, built, tick);
      b3.b3World_Step(built.world, DT, SUBSTEPS);
      history.active.frames += 1;
      const boundaryTick = tick + 1;
      if (history.active.frames >= SEGMENT_TICKS) {
        const segment = rotateHistory(b3, built.world, history, policy, boundaryTick, boundaryTick >= TICKS);
        if (VERIFY_BOUNDARIES.has(boundaryTick)) {
          checks.push(verifySegment(b3, segment, built.bodies, manifest.bodies.map((body) => body.id)));
        }
      }
      if (boundaryTick % 24 === 0) assert(bodiesFinite(b3, built.bodies), `verification non-finite ${cell.label}/${policy.label} B(${boundaryTick})`);
    }
    const finalHash = hashBodyIds(b3, built.bodies);
    cleanupHistory(b3, built.world, history);
    b3.b3DestroyWorld(built.world);
    built = null;
    return {
      profile: "verification",
      cell: cell.label,
      scenario: cell.scenario,
      count: cell.count,
      policy: policy.label,
      phenomenonId: manifest.phenomenonId,
      chaosDNA: stressChaosDNA(manifest),
      finalHash,
      checks,
      verdict: checks.length === VERIFY_BOUNDARIES.size ? "exact-sampled-pass" : "exact-sampled-incomplete",
    };
  } finally {
    if (built) {
      try { if (history) cleanupHistory(b3, built.world, history); } catch { /* teardown */ }
      try { b3.b3DestroyWorld(built.world); } catch { /* teardown */ }
    }
  }
}

function compareCell(cell, performanceRuns, verificationRuns) {
  const runs = performanceRuns.filter((run) => run.cell === cell.label);
  const verify = verificationRuns.filter((run) => run.cell === cell.label);
  const hashes = new Set(runs.map((run) => run.finalHash));
  const verifyHashes = new Set(verify.map((run) => run.finalHash));
  const policies = {};
  for (const policy of POLICIES) {
    const policyRuns = runs.filter((run) => run.policy === policy.label);
    policies[policy.label] = {
      repeats: policyRuns.length,
      finalHashes: [...new Set(policyRuns.map((run) => run.finalHash))],
      observedRegimes: [...new Set(policyRuns.map((run) => run.observedRegime))],
      maxSegmentBytes: Math.max(...policyRuns.map((run) => run.history.maxSegmentBytes)),
      maxAllocatorDeltaBytes: Math.max(...policyRuns.map((run) => run.allocator.maxDeltaFromPreRecordingBaselineBytes)),
      rotationP95Ms: policyRuns.map((run) => run.rotationMs.steadyAfterB24.p95),
      rotationMaxMs: policyRuns.map((run) => run.rotationMs.steadyAfterB24.max),
      managedP95Ms: policyRuns.map((run) => run.managedTickMs.steadyAfterB24.p95),
      physicsP95Ms: policyRuns.map((run) => run.physicsStepMs.steadyAfterB24.p95),
    };
  }
  return {
    cell: cell.label,
    expectedRegime: cell.expectedRegime,
    deterministicAcrossPoliciesAndRepeats: hashes.size === 1,
    verificationFinalHashAgreement: verifyHashes.size === 1 && verifyHashes.size > 0,
    exactSampledChecksPass: verify.every((run) => run.verdict === "exact-sampled-pass"),
    policies,
  };
}

async function main() {
  const performanceRuns = [];
  for (const cell of CELLS) {
    for (const policy of POLICIES) {
      for (let repeat = 1; repeat <= 2; repeat += 1) {
        performanceRuns.push(await runPerformanceProfile(cell, policy, repeat));
      }
    }
  }

  const verificationRuns = [];
  for (const cell of CELLS) {
    for (const policy of POLICIES) verificationRuns.push(await runVerificationProfile(cell, policy));
  }

  const comparisons = CELLS.map((cell) => compareCell(cell, performanceRuns, verificationRuns));
  const regimeMatch = comparisons.every((comparison) => {
    return Object.values(comparison.policies).every((policy) => policy.observedRegimes.length === 1 && policy.observedRegimes[0] === comparison.expectedRegime);
  });
  const exact = comparisons.every((comparison) =>
    comparison.deterministicAcrossPoliciesAndRepeats &&
    comparison.verificationFinalHashAgreement &&
    comparison.exactSampledChecksPass
  );

  const evidence = {
    verdict: regimeMatch && exact
      ? "WORLD_V0_SP1B1_PREALLOCATION_AB_COMPLETE"
      : "WORLD_V0_SP1B1_PREALLOCATION_AB_INCOMPLETE",
    box3d: "box3d.js@0.1.1",
    contract: {
      dt: DT,
      substeps: SUBSTEPS,
      segmentTicks: SEGMENT_TICKS,
      retainTicks: RETAIN_TICKS,
      retention: "inclusive validEnd/endTick >= cutoff",
      ticks: TICKS,
      repeatsPerPerformanceCell: 2,
      verificationBoundaries: [...VERIFY_BOUNDARIES],
      seed: SEED,
      performanceAndVerificationUseFreshBox3DInstances: true,
      recPlayerInsideMeasuredPerformancePath: false,
    },
    policies: POLICIES,
    cells: CELLS,
    comparisons,
    performanceRuns,
    verificationRuns,
    claimBoundary: "comparative hosted Node evidence; no product-policy change, device performance claim or adaptive-allocation authorization",
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (!regimeMatch) throw new Error("SP1B1 load regimes did not match the intended below-64k / medium / above-2m experiment");
  if (!exact) throw new Error("SP1B1 exactness or deterministic final-state agreement failed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
