const BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const DT = 1 / 60;
const SUBSTEPS = 4;
const SEGMENT_TICKS = 8;
const RECORDING_CAPACITY_BYTES = 2 * 1024 * 1024;
const REALTIME_STEP_BUDGET_MS = 1000 / 60;
const DEFAULT_COUNTS = [16, 32, 64, 128, 256];
const DEFAULT_TICKS = 240;
const SCENARIOS = ["quiet-width", "hetero-pile", "kinetic-swarm", "ram-chain", "wake-churn"];

const statusNode = document.querySelector("#status");
const runButton = document.querySelector("#run");

function xorshift32(seed) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function floatBits(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

function hashBodies(b3, bodies) {
  let hash = 0x811c9dc5 >>> 0;
  const mix = (word) => {
    hash ^= word >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const body of bodies) {
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

function bodiesFinite(b3, bodies) {
  for (const body of bodies) {
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
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
  return body;
}

function addDynamicBox(b3, world, spec) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...spec.position];
  def.linearDamping = spec.linearDamping ?? 0.04;
  def.angularDamping = spec.angularDamping ?? 0.06;
  const body = b3.b3CreateBody(world, def);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = spec.density ?? 20;
  shapeDef.baseMaterial.friction = spec.friction ?? 0.55;
  shapeDef.baseMaterial.restitution = spec.restitution ?? 0.08;
  b3.b3CreateBoxShape(body, shapeDef, spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2]);
  if (spec.velocity) b3.b3Body_SetLinearVelocity(body, [...spec.velocity]);
  return body;
}

function makeSpec(index, count, scenario, rand, extent) {
  const hx = 0.18 + 0.09 * (index % 5);
  const hy = 0.18 + 0.07 * ((index * 3) % 5);
  const hz = 0.18 + 0.08 * ((index * 7) % 5);
  const density = [2, 5, 12, 28, 70][index % 5];
  const side = Math.ceil(Math.sqrt(count));
  const gx = index % side;
  const gz = Math.floor(index / side) % side;

  if (scenario === "quiet-width") {
    const spacing = 1.35;
    return {
      position: [(gx - (side - 1) / 2) * spacing, hy + 0.02, (gz - (side - 1) / 2) * spacing],
      halfExtents: [hx, hy, hz], density, friction: 0.8, restitution: 0.01,
    };
  }

  if (scenario === "hetero-pile" || scenario === "wake-churn") {
    const columns = Math.max(3, Math.ceil(Math.sqrt(Math.min(count, 64))));
    const layerSize = columns * columns;
    const layer = Math.floor(index / layerSize);
    const local = index % layerSize;
    const x = local % columns;
    const z = Math.floor(local / columns);
    return {
      position: [(x - (columns - 1) / 2) * 0.72, 0.8 + layer * 0.78 + rand() * 0.08, (z - (columns - 1) / 2) * 0.72],
      halfExtents: [hx, hy, hz], density, friction: 0.62, restitution: 0.03,
    };
  }

  if (scenario === "kinetic-swarm") {
    const x = (rand() * 2 - 1) * extent * 0.72;
    const z = (rand() * 2 - 1) * extent * 0.72;
    const speed = 3 + rand() * 9;
    const angle = rand() * Math.PI * 2;
    return {
      position: [x, 0.55 + rand() * 2.5, z],
      halfExtents: [hx, hy, hz], density, friction: 0.2, restitution: 0.62,
      velocity: [Math.cos(angle) * speed, (rand() - 0.35) * 3, Math.sin(angle) * speed],
      linearDamping: 0.005, angularDamping: 0.01,
    };
  }

  if (index === 0) {
    return {
      position: [-extent * 0.68, 0.85, 0], halfExtents: [1.35, 0.7, 1.0], density: 140,
      friction: 0.45, restitution: 0.02, velocity: [18, 0, 0], linearDamping: 0.001,
    };
  }
  const targetIndex = index - 1;
  const targetSide = Math.max(2, Math.ceil(Math.sqrt(count - 1)));
  const tx = targetIndex % targetSide;
  const tz = Math.floor(targetIndex / targetSide);
  return {
    position: [0.8 + tx * 0.58, 0.45 + (targetIndex % 3) * 0.22, (tz - (targetSide - 1) / 2) * 0.58],
    halfExtents: [hx * 0.85, hy * 0.85, hz * 0.85], density: Math.max(1.5, density * 0.4),
    friction: 0.5, restitution: 0.08,
  };
}

function buildWorld(b3, scenario, count, seed) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  const extent = Math.max(10, Math.ceil(Math.sqrt(count)) * 0.9);
  addStaticBox(b3, world, [0, -0.5, 0], [extent, 0.5, extent]);
  addStaticBox(b3, world, [-extent + 0.25, 2.5, 0], [0.25, 3, extent]);
  addStaticBox(b3, world, [extent - 0.25, 2.5, 0], [0.25, 3, extent]);
  addStaticBox(b3, world, [0, 2.5, -extent + 0.25], [extent, 3, 0.25]);
  addStaticBox(b3, world, [0, 2.5, extent - 0.25], [extent, 3, 0.25]);

  const rand = xorshift32(seed);
  const bodies = [];
  for (let i = 0; i < count; i += 1) bodies.push(addDynamicBox(b3, world, makeSpec(i, count, scenario, rand, extent)));
  return { world, bodies, extent, rand };
}

function maybeWakeChurn(b3, scenario, tick, bodies, rand) {
  if (scenario !== "wake-churn" || tick === 0 || tick % 24 !== 0) return;
  const direction = (tick / 24) % 2 === 0 ? 1 : -1;
  const stride = Math.max(1, Math.floor(bodies.length / 32));
  for (let i = 0; i < bodies.length; i += stride) {
    const sx = (rand() * 2 - 1) * 5 * direction;
    const sz = (rand() * 2 - 1) * 5 * -direction;
    b3.b3Body_SetLinearVelocity(bodies[i], [sx, 1.5 + rand() * 2.5, sz]);
  }
}

function startRecording(b3, world) {
  const recording = b3.b3CreateRecording(RECORDING_CAPACITY_BYTES);
  b3.b3World_StartRecording(world, recording);
  return recording;
}

function stopRecording(b3, world, recording) {
  b3.b3World_StopRecording(world);
  const bytes = b3.b3Recording_GetSize(recording);
  b3.b3DestroyRecording(recording);
  return bytes;
}

async function runOne(b3, { scenario, count, ticks, history, seed }) {
  const builtAt = performance.now();
  let world = null;
  let bodies = [];
  let rand = null;
  let buildMs = 0;
  const stepMs = [];
  const segmentBytes = [];
  let recording = null;
  let finite = true;
  let failure = null;
  let overBudgetSteps = 0;
  let maxUsedJsHeapSize = performance.memory?.usedJSHeapSize ?? null;

  try {
    const built = buildWorld(b3, scenario, count, seed);
    world = built.world;
    bodies = built.bodies;
    rand = built.rand;
    buildMs = performance.now() - builtAt;
    recording = history ? startRecording(b3, world) : null;

    for (let tick = 0; tick < ticks; tick += 1) {
      maybeWakeChurn(b3, scenario, tick, bodies, rand);
      const t0 = performance.now();
      b3.b3World_Step(world, DT, SUBSTEPS);
      const elapsed = performance.now() - t0;
      stepMs.push(elapsed);
      if (elapsed > REALTIME_STEP_BUDGET_MS) overBudgetSteps += 1;

      if (history && (tick + 1) % SEGMENT_TICKS === 0) {
        segmentBytes.push(stopRecording(b3, world, recording));
        recording = tick + 1 < ticks ? startRecording(b3, world) : null;
      }
      if ((tick + 1) % 30 === 0 && !bodiesFinite(b3, bodies)) {
        finite = false;
        failure = "non_finite_world_state";
        break;
      }
      if (performance.memory?.usedJSHeapSize != null) {
        maxUsedJsHeapSize = Math.max(maxUsedJsHeapSize ?? 0, performance.memory.usedJSHeapSize);
      }
      if ((tick + 1) % 120 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (history && recording) {
      segmentBytes.push(stopRecording(b3, world, recording));
      recording = null;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    if (history && recording && world) {
      try { segmentBytes.push(stopRecording(b3, world, recording)); } catch (error) {
        if (!failure) failure = error instanceof Error ? error.message : String(error);
      }
      recording = null;
    }
  }

  const maxSegmentBytes = segmentBytes.length ? Math.max(...segmentBytes) : 0;
  const p50 = percentile(stepMs, 0.50);
  const p95 = percentile(stepMs, 0.95);
  const p99 = percentile(stepMs, 0.99);
  const max = stepMs.length ? Math.max(...stepMs) : 0;
  let finalHash = null;
  if (world && bodies.length && finite && !failure) {
    try { finalHash = hashBodies(b3, bodies); } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }

  const result = {
    scenario, count, ticksRequested: ticks, ticksCompleted: stepMs.length, history, seed,
    buildMs, finite, failure, finalHash,
    stepMs: { p50, p95, p99, max },
    realtime: {
      budgetMs: REALTIME_STEP_BUDGET_MS,
      p95Headroom: p95 > 0 ? REALTIME_STEP_BUDGET_MS / p95 : null,
      overBudgetSteps,
    },
    historyMetrics: history ? {
      segmentTicks: SEGMENT_TICKS,
      recordingCapacityBytes: RECORDING_CAPACITY_BYTES,
      segments: segmentBytes.length,
      maxSegmentBytes,
      maxCapacityRatio: maxSegmentBytes / RECORDING_CAPACITY_BYTES,
    } : null,
    memory: { maxUsedJsHeapSize },
  };

  if (world) {
    try { b3.b3DestroyWorld(world); } catch { /* teardown only */ }
  }
  return result;
}

function classify(result) {
  if (result.failure) return `runtime:${result.failure}`;
  if (!result.finite) return "non-finite";
  if (result.historyMetrics?.maxCapacityRatio >= 0.95) return "history-capacity";
  if (result.stepMs.p95 >= REALTIME_STEP_BUDGET_MS) return "step-budget";
  return "within-local-realtime-budget";
}

async function runSuite(options = {}) {
  const counts = options.counts || DEFAULT_COUNTS;
  const ticks = options.ticks || DEFAULT_TICKS;
  const scenarios = options.scenarios || SCENARIOS;
  const histories = options.histories || [false, true];
  const repeats = Math.max(1, options.repeats || 2);
  const results = [];

  for (const history of histories) {
    for (const scenario of scenarios) {
      for (const count of counts) {
        const repeatsForCell = [];
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          statusNode.textContent = `Running ${scenario} · bodies=${count} · history=${history} · repeat=${repeat + 1}/${repeats}`;
          const result = await runOne(b3, { scenario, count, ticks, history, seed: 0x51f15e + count * 131 + scenario.length * 17 });
          result.classification = classify(result);
          repeatsForCell.push(result);
        }
        const hashes = repeatsForCell.map((item) => item.finalHash);
        const deterministic = hashes.every((hash) => hash !== null && hash === hashes[0]);
        results.push({ scenario, count, history, deterministic, repeats: repeatsForCell });
      }
    }
  }

  const firstBroken = {};
  for (const history of histories) {
    for (const scenario of scenarios) {
      const key = `${scenario}:${history ? "history" : "raw"}`;
      const cells = results.filter((item) => item.history === history && item.scenario === scenario).sort((a, b) => a.count - b.count);
      const broken = cells.find((cell) => !cell.deterministic || cell.repeats.some((item) => item.classification !== "within-local-realtime-budget"));
      firstBroken[key] = broken ? {
        count: broken.count,
        deterministic: broken.deterministic,
        classifications: broken.repeats.map((item) => item.classification),
      } : null;
    }
  }

  const output = {
    verdict: "WORLD_V0_CAPACITY_CARTOGRAPHY_COMPLETE",
    generatedAt: new Date().toISOString(),
    apparatus: {
      box3d: "box3d.js@0.1.1",
      simulationHz: 60,
      substeps: SUBSTEPS,
      segmentTicks: SEGMENT_TICKS,
      recordingCapacityBytes: RECORDING_CAPACITY_BYTES,
      counts, ticks, scenarios, histories, repeats,
    },
    firstBroken,
    results,
  };
  statusNode.textContent = JSON.stringify({ verdict: output.verdict, firstBroken }, null, 2);
  window.__mwCapacity.lastResult = output;
  return output;
}

const module = await import(BOX3D_URL);
const b3 = await module.default();
window.__mwCapacity = { ready: true, runSuite, lastResult: null };
runButton.disabled = false;
statusNode.textContent = "Ready. Default suite is intentionally heavy; headless runner can override counts/ticks.";
runButton.addEventListener("click", () => runSuite().catch((error) => {
  statusNode.textContent = error instanceof Error ? error.stack || error.message : String(error);
}));
