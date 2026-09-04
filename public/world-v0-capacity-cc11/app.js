const BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const DT = 1 / 60;
const SUBSTEPS = 4;
const SEGMENT_TICKS = 8;
const RETAIN_TICKS = 24;
const RECORDING_CAPACITY_BYTES = 2 * 1024 * 1024;
const REALTIME_BUDGET_MS = 1000 / 60;
const LAB_REVISION = "world-v0-capacity-cc11-history-replay-v1";
const DEFAULT_COUNTS = [384, 512, 640, 768, 896];
const DEFAULT_TICKS = 144;
const DEFAULT_SCENARIOS = ["hetero-pile", "ram-chain", "wake-churn"];

const statusNode = document.querySelector("#status");
const runButton = document.querySelector("#run");

function setStatus(text) {
  if (statusNode) statusNode.textContent = text;
}

function xorshift32(seed) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
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

function addStaticBox(b3, world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function addDynamicBox(b3, world, spec, locator) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...spec.position];
  bodyDef.linearDamping = spec.linearDamping ?? 0.04;
  bodyDef.angularDamping = spec.angularDamping ?? 0.06;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, locator);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = spec.density ?? 20;
  shapeDef.baseMaterial.friction = spec.friction ?? 0.55;
  shapeDef.baseMaterial.restitution = spec.restitution ?? 0.08;
  b3.b3CreateBoxShape(body, shapeDef, spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2]);
  if (spec.velocity) b3.b3Body_SetLinearVelocity(body, [...spec.velocity]);
  return body;
}

function makeSpec(index, count, scenario, rand, extent) {
  const hx = 0.16 + 0.10 * (index % 5);
  const hy = 0.16 + 0.08 * ((index * 3) % 5);
  const hz = 0.16 + 0.09 * ((index * 7) % 5);
  const density = [1.5, 4, 12, 35, 95][index % 5];

  if (scenario === "quiet-width") {
    const side = Math.ceil(Math.sqrt(count));
    const gx = index % side;
    const gz = Math.floor(index / side);
    return {
      position: [(gx - (side - 1) / 2) * 1.25, hy + 0.02, (gz - (side - 1) / 2) * 1.25],
      halfExtents: [hx, hy, hz], density, friction: 0.82, restitution: 0.01,
    };
  }

  if (scenario === "hetero-pile" || scenario === "wake-churn") {
    const columns = Math.max(4, Math.ceil(Math.sqrt(Math.min(count, 100))));
    const layerSize = columns * columns;
    const layer = Math.floor(index / layerSize);
    const local = index % layerSize;
    const x = local % columns;
    const z = Math.floor(local / columns);
    return {
      position: [
        (x - (columns - 1) / 2) * 0.66 + (rand() - 0.5) * 0.04,
        0.62 + layer * 0.68 + rand() * 0.08,
        (z - (columns - 1) / 2) * 0.66 + (rand() - 0.5) * 0.04,
      ],
      halfExtents: [hx, hy, hz], density, friction: 0.64, restitution: 0.035,
    };
  }

  if (scenario === "kinetic-swarm") {
    const x = (rand() * 2 - 1) * extent * 0.70;
    const z = (rand() * 2 - 1) * extent * 0.70;
    const speed = 4 + rand() * 11;
    const angle = rand() * Math.PI * 2;
    return {
      position: [x, 0.55 + rand() * 3.4, z],
      halfExtents: [hx, hy, hz], density, friction: 0.18, restitution: 0.66,
      velocity: [Math.cos(angle) * speed, (rand() - 0.25) * 4, Math.sin(angle) * speed],
      linearDamping: 0.003, angularDamping: 0.008,
    };
  }

  // ram-chain: one deliberately extreme but bounded ram, then a dense heterogeneous target field.
  if (index === 0) {
    return {
      position: [-extent * 0.72, 1.0, 0],
      halfExtents: [1.7, 0.85, 1.15], density: 180,
      friction: 0.42, restitution: 0.015,
      velocity: [22, 0, 0], linearDamping: 0.0005, angularDamping: 0.01,
    };
  }
  const targetIndex = index - 1;
  const targetSide = Math.max(3, Math.ceil(Math.sqrt(count - 1)));
  const tx = targetIndex % targetSide;
  const tz = Math.floor(targetIndex / targetSide);
  return {
    position: [
      0.5 + tx * 0.54,
      0.40 + (targetIndex % 4) * 0.18,
      (tz - (targetSide - 1) / 2) * 0.54,
    ],
    halfExtents: [hx * 0.82, hy * 0.82, hz * 0.82],
    density: Math.max(1.0, density * 0.35), friction: 0.5, restitution: 0.07,
  };
}

function buildWorld(b3, scenario, count, seed) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  const extent = Math.max(14, Math.ceil(Math.sqrt(count)) * 1.05);
  addStaticBox(b3, world, [0, -0.5, 0], [extent, 0.5, extent]);
  addStaticBox(b3, world, [-extent + 0.25, 3.0, 0], [0.25, 3.5, extent]);
  addStaticBox(b3, world, [extent - 0.25, 3.0, 0], [0.25, 3.5, extent]);
  addStaticBox(b3, world, [0, 3.0, -extent + 0.25], [extent, 3.5, 0.25]);
  addStaticBox(b3, world, [0, 3.0, extent - 0.25], [extent, 3.5, 0.25]);

  const rand = xorshift32(seed);
  const bodies = [];
  const locators = [];
  for (let index = 0; index < count; index += 1) {
    const locator = `cc-body-${String(index).padStart(5, "0")}`;
    locators.push(locator);
    bodies.push(addDynamicBox(b3, world, makeSpec(index, count, scenario, rand, extent), locator));
  }
  return { world, bodies, locators, rand, extent };
}

function maybeWakeChurn(b3, scenario, tick, bodies, rand) {
  if (scenario !== "wake-churn" || tick === 0 || tick % 24 !== 0) return;
  const direction = (tick / 24) % 2 === 0 ? 1 : -1;
  const stride = Math.max(1, Math.floor(bodies.length / 48));
  for (let index = 0; index < bodies.length; index += stride) {
    const sx = (rand() * 2 - 1) * 6.5 * direction;
    const sz = (rand() * 2 - 1) * 6.5 * -direction;
    b3.b3Body_SetLinearVelocity(bodies[index], [sx, 1.8 + rand() * 3.2, sz]);
  }
}

function startRecording(b3, world, startTick) {
  const recording = b3.b3CreateRecording(RECORDING_CAPACITY_BYTES);
  b3.b3World_StartRecording(world, recording);
  return { recording, startTick, frames: 0 };
}

function replayBodyIds(b3, player, locators) {
  const byName = new Map();
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) byName.set(name, body);
  }
  return locators.map((locator) => {
    const body = byName.get(locator);
    if (!body) throw new Error(`replay_body_missing:${locator}`);
    return body;
  });
}

function retainedBytes(history) {
  return history.segments.reduce((sum, segment) => sum + segment.bytes, 0);
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

function verifyRecording(b3, segment, liveBodies, locators) {
  const verifyStart = performance.now();
  const liveHash = hashBodyIds(b3, liveBodies);
  let player = 0;
  try {
    player = b3.b3RecPlayer_CreateFromRecording(segment.recording, 0);
    if (!player) throw new Error(`replay_player_create_failed:B${segment.endTick}`);
    b3.b3RecPlayer_SeekFrame(player, segment.frames);
    const frame = b3.b3RecPlayer_GetFrame(player);
    if (frame !== segment.frames) {
      throw new Error(`replay_seek_mismatch:B${segment.endTick}:expected=${segment.frames}:actual=${frame}`);
    }
    if (b3.b3RecPlayer_HasDiverged(player)) {
      throw new Error(`replay_diverged:B${segment.endTick}:frame=${b3.b3RecPlayer_GetDivergeFrame(player)}`);
    }
    const replayHash = hashBodyIds(b3, replayBodyIds(b3, player, locators));
    if (replayHash !== liveHash) {
      throw new Error(`replay_state_hash_mismatch:B${segment.endTick}:live=${liveHash}:replay=${replayHash}`);
    }
    return { ms: performance.now() - verifyStart, liveHash, replayHash, frame };
  } finally {
    if (player) b3.b3RecPlayer_Destroy(player);
  }
}

function rotateHistory(b3, world, history, boundaryTick, liveBodies, locators, final = false) {
  const active = history.active;
  if (!active) return null;

  const productionStart = performance.now();
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
  trimHistory(b3, history, boundaryTick);
  const retained = retainedBytes(history);
  history.maxRetainedBytes = Math.max(history.maxRetainedBytes, retained);
  history.maxSegmentBytes = Math.max(history.maxSegmentBytes, bytes);
  if (!final) history.active = startRecording(b3, world, boundaryTick);
  const productionMs = performance.now() - productionStart;

  let verification;
  try {
    verification = verifyRecording(b3, segment, liveBodies, locators);
  } catch (error) {
    history.replayFailures += 1;
    throw error;
  }
  history.rotationMs.push(productionMs);
  history.replayVerifyMs.push(verification.ms);
  history.segmentsVerified += 1;
  return { productionMs, verificationMs: verification.ms, bytes, retained, liveHash: verification.liveHash };
}

function cleanupHistory(b3, world, history) {
  if (!history) return;
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

async function warmUp(b3) {
  const built = buildWorld(b3, "hetero-pile", 48, 0x0cc11001);
  let recording = null;
  try {
    recording = b3.b3CreateRecording(RECORDING_CAPACITY_BYTES);
    b3.b3World_StartRecording(built.world, recording);
    for (let tick = 0; tick < 24; tick += 1) b3.b3World_Step(built.world, DT, SUBSTEPS);
    b3.b3World_StopRecording(built.world);
    const player = b3.b3RecPlayer_CreateFromRecording(recording, 0);
    if (!player) throw new Error("warmup_replay_player_create_failed");
    b3.b3RecPlayer_SeekFrame(player, 24);
    b3.b3RecPlayer_HasDiverged(player);
    b3.b3RecPlayer_Destroy(player);
    b3.b3DestroyRecording(recording);
    recording = null;
  } finally {
    if (recording) {
      try { b3.b3DestroyRecording(recording); } catch { /* teardown */ }
    }
    b3.b3DestroyWorld(built.world);
  }
}

async function runOne(b3, { scenario, count, ticks, historyEnabled, seed }) {
  const buildStart = performance.now();
  let world = null;
  let bodies = [];
  let locators = [];
  let rand = null;
  let history = null;
  let failure = null;
  let finite = true;
  let ticksCompleted = 0;
  const physicsStepMs = [];
  const managedTickMs = [];
  let physicsOverBudget = 0;
  let managedOverBudget = 0;
  let maxUsedJsHeapSize = performance.memory?.usedJSHeapSize ?? null;

  try {
    const built = buildWorld(b3, scenario, count, seed);
    world = built.world;
    bodies = built.bodies;
    locators = built.locators;
    rand = built.rand;
    const buildMs = performance.now() - buildStart;

    if (historyEnabled) {
      history = {
        active: startRecording(b3, world, 0),
        segments: [],
        rotationMs: [],
        replayVerifyMs: [],
        maxSegmentBytes: 0,
        maxRetainedBytes: 0,
        segmentsVerified: 0,
        replayFailures: 0,
      };
    }

    for (let tick = 0; tick < ticks; tick += 1) {
      const managedStart = performance.now();
      maybeWakeChurn(b3, scenario, tick, bodies, rand);
      const physicsStart = performance.now();
      b3.b3World_Step(world, DT, SUBSTEPS);
      const physicsMs = performance.now() - physicsStart;
      physicsStepMs.push(physicsMs);
      if (physicsMs > REALTIME_BUDGET_MS) physicsOverBudget += 1;
      const boundaryTick = tick + 1;
      if (history) {
        history.active.frames += 1;
        if (history.active.frames >= SEGMENT_TICKS) {
          // Production-like rotation work is inside managedTickMs. Research-only replay verification
          // is measured separately and intentionally excluded from the real-time budget below.
          const beforeVerify = performance.now();
          const rotation = rotateHistory(b3, world, history, boundaryTick, bodies, locators, boundaryTick >= ticks);
          const afterVerify = performance.now();
          const researchOnlyMs = rotation?.verificationMs ?? 0;
          const managedMs = (afterVerify - managedStart) - researchOnlyMs;
          managedTickMs.push(Math.max(0, managedMs));
        } else {
          managedTickMs.push(performance.now() - managedStart);
        }
      } else {
        managedTickMs.push(performance.now() - managedStart);
      }
      if (managedTickMs[managedTickMs.length - 1] > REALTIME_BUDGET_MS) managedOverBudget += 1;
      ticksCompleted = boundaryTick;

      if (boundaryTick % 24 === 0 && !bodiesFinite(b3, bodies)) {
        finite = false;
        failure = "non_finite_world_state";
        break;
      }
      if (performance.memory?.usedJSHeapSize != null) {
        maxUsedJsHeapSize = Math.max(maxUsedJsHeapSize ?? 0, performance.memory.usedJSHeapSize);
      }
      if (boundaryTick % 72 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (history?.active && history.active.frames > 0) {
      const boundaryTick = ticksCompleted;
      rotateHistory(b3, world, history, boundaryTick, bodies, locators, true);
    }

    const finalHash = finite && !failure ? hashBodyIds(b3, bodies) : null;
    const result = {
      scenario,
      count,
      ticksRequested: ticks,
      ticksCompleted,
      history: historyEnabled,
      seed,
      buildMs,
      finite,
      failure,
      finalHash,
      physicsStepMs: summary(physicsStepMs),
      managedTickMs: summary(managedTickMs),
      realtime: {
        budgetMs: REALTIME_BUDGET_MS,
        physicsOverBudget,
        managedOverBudget,
      },
      historyMetrics: history ? {
        segmentTicks: SEGMENT_TICKS,
        retainTicks: RETAIN_TICKS,
        recordingCapacityBytes: RECORDING_CAPACITY_BYTES,
        segmentsVerified: history.segmentsVerified,
        replayFailures: history.replayFailures,
        maxSegmentBytes: history.maxSegmentBytes,
        maxSegmentCapacityRatio: history.maxSegmentBytes / RECORDING_CAPACITY_BYTES,
        maxRetainedBytes: history.maxRetainedBytes,
        rotationMs: summary(history.rotationMs),
        replayVerifyMs: summary(history.replayVerifyMs),
      } : null,
      memory: { maxUsedJsHeapSize },
    };
    return result;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    return {
      scenario,
      count,
      ticksRequested: ticks,
      ticksCompleted,
      history: historyEnabled,
      seed,
      buildMs: performance.now() - buildStart,
      finite,
      failure,
      finalHash: null,
      physicsStepMs: summary(physicsStepMs),
      managedTickMs: summary(managedTickMs),
      realtime: {
        budgetMs: REALTIME_BUDGET_MS,
        physicsOverBudget,
        managedOverBudget,
      },
      historyMetrics: history ? {
        segmentTicks: SEGMENT_TICKS,
        retainTicks: RETAIN_TICKS,
        recordingCapacityBytes: RECORDING_CAPACITY_BYTES,
        segmentsVerified: history.segmentsVerified,
        replayFailures: history.replayFailures,
        maxSegmentBytes: history.maxSegmentBytes,
        maxSegmentCapacityRatio: history.maxSegmentBytes / RECORDING_CAPACITY_BYTES,
        maxRetainedBytes: history.maxRetainedBytes,
        rotationMs: summary(history.rotationMs),
        replayVerifyMs: summary(history.replayVerifyMs),
      } : null,
      memory: { maxUsedJsHeapSize },
    };
  } finally {
    if (world) {
      try { cleanupHistory(b3, world, history); } catch { /* teardown */ }
      try { b3.b3DestroyWorld(world); } catch { /* teardown */ }
    }
  }
}

function classifyRun(run) {
  if (run.failure) {
    if (/replay_|replay:|diverged|seek_mismatch|state_hash_mismatch/.test(run.failure)) return "replay-exactness";
    return `runtime:${run.failure}`;
  }
  if (!run.finite) return "non-finite";
  if (run.historyMetrics?.maxSegmentCapacityRatio >= 0.95) return "history-capacity";
  if (run.physicsStepMs.p95 >= REALTIME_BUDGET_MS) return "physics-step-budget";
  if (run.managedTickMs.p95 >= REALTIME_BUDGET_MS) return "managed-tick-budget";
  return "within-lab-envelope";
}

function classifyCell(cell) {
  if (!cell.deterministic) return "determinism";
  const bad = cell.repeats.find((run) => run.classification !== "within-lab-envelope");
  return bad ? bad.classification : "within-lab-envelope";
}

async function runSuite(options = {}) {
  const counts = options.counts || DEFAULT_COUNTS;
  const ticks = options.ticks || DEFAULT_TICKS;
  const scenarios = options.scenarios || DEFAULT_SCENARIOS;
  const histories = options.histories || [true];
  const repeats = Math.max(2, options.repeats || 2);
  const stopAfterFirstBroken = options.stopAfterFirstBroken !== false;
  const cells = [];

  await warmUp(b3);

  for (const historyEnabled of histories) {
    for (const scenario of scenarios) {
      let boundarySeen = false;
      for (const count of counts) {
        if (boundarySeen && stopAfterFirstBroken) break;
        const runs = [];
        const seed = 0x51f15e + count * 131 + scenario.length * 17;
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          setStatus(`CC1.1 · ${scenario} · bodies=${count} · history=${historyEnabled} · repeat=${repeat + 1}/${repeats}`);
          const run = await runOne(b3, { scenario, count, ticks, historyEnabled, seed });
          run.classification = classifyRun(run);
          runs.push(run);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const hashes = runs.map((run) => run.finalHash);
        const deterministic = hashes.length >= 2 && hashes.every((hash) => hash !== null && hash === hashes[0]);
        const cell = { scenario, count, history: historyEnabled, deterministic, repeats: runs };
        cell.classification = classifyCell(cell);
        cells.push(cell);
        if (cell.classification !== "within-lab-envelope") boundarySeen = true;
      }
    }
  }

  const boundaries = {};
  for (const historyEnabled of histories) {
    for (const scenario of scenarios) {
      const key = `${scenario}:${historyEnabled ? "history" : "raw"}`;
      const ordered = cells.filter((cell) => cell.scenario === scenario && cell.history === historyEnabled).sort((a, c) => a.count - c.count);
      const firstBroken = ordered.find((cell) => cell.classification !== "within-lab-envelope") ?? null;
      const good = ordered.filter((cell) => cell.classification === "within-lab-envelope");
      const lastKnownGood = good.length ? good[good.length - 1] : null;
      boundaries[key] = {
        lastKnownGood: lastKnownGood ? { count: lastKnownGood.count, classification: lastKnownGood.classification } : null,
        firstBroken: firstBroken ? { count: firstBroken.count, classification: firstBroken.classification } : null,
      };
    }
  }

  const evidence = {
    verdict: "WORLD_V0_CAPACITY_CC11_COMPLETE",
    labRevision: LAB_REVISION,
    generatedAt: new Date().toISOString(),
    box3d: "box3d.js@0.1.1",
    timing: { hz: 60, dt: DT, substeps: SUBSTEPS, realtimeBudgetMs: REALTIME_BUDGET_MS },
    historyContract: { segmentTicks: SEGMENT_TICKS, retainTicks: RETAIN_TICKS, recordingCapacityBytes: RECORDING_CAPACITY_BYTES },
    options: { counts, ticks, scenarios, histories, repeats, stopAfterFirstBroken },
    boundaries,
    cells,
  };
  setStatus(JSON.stringify({ verdict: evidence.verdict, boundaries }, null, 2));
  return evidence;
}

let b3 = null;
let bootError = null;
try {
  const module = await import(BOX3D_URL);
  b3 = await module.default();
  const required = [
    "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording", "b3Recording_GetSize",
    "b3RecPlayer_CreateFromRecording", "b3RecPlayer_Destroy", "b3RecPlayer_GetWorldId", "b3RecPlayer_GetBodyCount",
    "b3RecPlayer_GetBodyId", "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_HasDiverged",
    "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid",
  ];
  const missing = required.filter((name) => typeof b3[name] !== "function");
  if (missing.length) throw new Error(`CC1.1 Box3D capability missing: ${missing.join(",")}`);
  setStatus("CC1.1 ready");
} catch (error) {
  bootError = error instanceof Error ? error.stack || error.message : String(error);
  setStatus(`CC1.1 boot failed\n${bootError}`);
}

window.__worldV0CapacityCC11 = {
  ready: !!b3 && !bootError,
  bootError,
  revision: LAB_REVISION,
  runSuite: async (options = {}) => {
    if (!b3) throw new Error(bootError || "CC1.1 Box3D unavailable");
    return await runSuite(options);
  },
};

runButton?.addEventListener("click", async () => {
  runButton.disabled = true;
  try {
    await window.__worldV0CapacityCC11.runSuite();
  } catch (error) {
    setStatus(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    runButton.disabled = false;
  }
});
