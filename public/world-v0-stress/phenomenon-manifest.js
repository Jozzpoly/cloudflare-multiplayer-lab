export const WORLD_V0_STRESS_MANIFEST_REVISION = "world-v0-stress-manifest-v1";
export const WORLD_V0_STRESS_SCENARIOS = [
  "quiet-width",
  "hetero-pile",
  "kinetic-swarm",
  "ram-chain",
  "wake-churn",
];

function xorshift32(seed) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}

function bodyId(index) {
  return `stress-body-${String(index).padStart(5, "0")}`;
}

function finiteArray(values) {
  return values.every(Number.isFinite);
}

function makeBody(index, count, scenario, rand, extent) {
  const hx = 0.16 + 0.10 * (index % 5);
  const hy = 0.16 + 0.08 * ((index * 3) % 5);
  const hz = 0.16 + 0.09 * ((index * 7) % 5);
  const density = [1.5, 4, 12, 35, 95][index % 5];
  const base = {
    id: bodyId(index),
    shape: "box",
    halfExtents: [hx, hy, hz],
    density,
    friction: 0.55,
    restitution: 0.08,
    linearDamping: 0.04,
    angularDamping: 0.06,
    initialVelocity: [0, 0, 0],
  };

  if (scenario === "quiet-width") {
    const side = Math.ceil(Math.sqrt(count));
    const gx = index % side;
    const gz = Math.floor(index / side);
    return {
      ...base,
      position: [(gx - (side - 1) / 2) * 1.25, hy + 0.02, (gz - (side - 1) / 2) * 1.25],
      friction: 0.82,
      restitution: 0.01,
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
      ...base,
      position: [
        (x - (columns - 1) / 2) * 0.66 + (rand() - 0.5) * 0.04,
        0.62 + layer * 0.68 + rand() * 0.08,
        (z - (columns - 1) / 2) * 0.66 + (rand() - 0.5) * 0.04,
      ],
      friction: 0.64,
      restitution: 0.035,
    };
  }

  if (scenario === "kinetic-swarm") {
    const speed = 4 + rand() * 11;
    const angle = rand() * Math.PI * 2;
    return {
      ...base,
      position: [(rand() * 2 - 1) * extent * 0.70, 0.55 + rand() * 3.4, (rand() * 2 - 1) * extent * 0.70],
      friction: 0.18,
      restitution: 0.66,
      linearDamping: 0.003,
      angularDamping: 0.008,
      initialVelocity: [Math.cos(angle) * speed, (rand() - 0.25) * 4, Math.sin(angle) * speed],
    };
  }

  if (scenario === "ram-chain" && index === 0) {
    return {
      ...base,
      position: [-extent * 0.72, 1.0, 0],
      halfExtents: [1.7, 0.85, 1.15],
      density: 180,
      friction: 0.42,
      restitution: 0.015,
      linearDamping: 0.0005,
      angularDamping: 0.01,
      initialVelocity: [22, 0, 0],
    };
  }

  const targetIndex = Math.max(0, index - 1);
  const targetSide = Math.max(3, Math.ceil(Math.sqrt(Math.max(1, count - 1))));
  const tx = targetIndex % targetSide;
  const tz = Math.floor(targetIndex / targetSide);
  const jitterX = (rand() - 0.5) * 0.06;
  const jitterZ = (rand() - 0.5) * 0.06;
  return {
    ...base,
    position: [0.5 + tx * 0.54 + jitterX, 0.40 + (targetIndex % 4) * 0.18, (tz - (targetSide - 1) / 2) * 0.54 + jitterZ],
    halfExtents: [hx * 0.82, hy * 0.82, hz * 0.82],
    density: Math.max(1.0, density * 0.35),
    friction: 0.5,
    restitution: 0.07,
  };
}

function makeScheduledEvents(scenario, bodies, durationTicks, rand) {
  if (scenario !== "wake-churn") return [];
  const events = [];
  const stride = Math.max(1, Math.floor(bodies.length / 48));
  for (let tick = 24; tick < durationTicks; tick += 24) {
    const direction = (tick / 24) % 2 === 0 ? 1 : -1;
    for (let index = 0; index < bodies.length; index += stride) {
      events.push({
        tick,
        type: "set-linear-velocity",
        bodyId: bodies[index].id,
        velocity: [
          (rand() * 2 - 1) * 6.5 * direction,
          1.8 + rand() * 3.2,
          (rand() * 2 - 1) * 6.5 * -direction,
        ],
      });
    }
  }
  return events;
}

function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function validateStressManifest(manifest) {
  if (!manifest || manifest.revision !== WORLD_V0_STRESS_MANIFEST_REVISION) throw new Error("stress_manifest_revision");
  if (!WORLD_V0_STRESS_SCENARIOS.includes(manifest.scenario)) throw new Error("stress_manifest_scenario");
  if (!Number.isInteger(manifest.count) || manifest.count < 1) throw new Error("stress_manifest_count");
  if (manifest.bodies.length !== manifest.count) throw new Error("stress_manifest_body_count");
  const ids = new Set();
  for (const body of manifest.bodies) {
    if (ids.has(body.id)) throw new Error(`stress_manifest_duplicate_body:${body.id}`);
    ids.add(body.id);
    if (body.shape !== "box") throw new Error(`stress_manifest_shape:${body.id}`);
    if (!finiteArray(body.position) || !finiteArray(body.halfExtents) || !finiteArray(body.initialVelocity)) throw new Error(`stress_manifest_nonfinite:${body.id}`);
    if (![body.density, body.friction, body.restitution, body.linearDamping, body.angularDamping].every(Number.isFinite)) throw new Error(`stress_manifest_nonfinite_material:${body.id}`);
  }
  for (const event of manifest.events) {
    if (!Number.isInteger(event.tick) || event.tick < 0) throw new Error("stress_manifest_event_tick");
    if (!ids.has(event.bodyId)) throw new Error(`stress_manifest_event_body:${event.bodyId}`);
    if (event.type !== "set-linear-velocity" || !finiteArray(event.velocity)) throw new Error("stress_manifest_event_payload");
  }
  return true;
}

export function generateStressManifest({ scenario, count, seed = 0x51f15e, durationTicks = 144 }) {
  if (!WORLD_V0_STRESS_SCENARIOS.includes(scenario)) throw new Error(`unknown_stress_scenario:${scenario}`);
  if (!Number.isInteger(count) || count < 1) throw new Error(`invalid_stress_count:${count}`);
  if (!Number.isInteger(durationTicks) || durationTicks < 1) throw new Error(`invalid_stress_duration:${durationTicks}`);
  const normalizedSeed = Number(seed) >>> 0;
  const extent = Math.max(14, Math.ceil(Math.sqrt(count)) * 1.05);
  const rand = xorshift32(normalizedSeed);
  const bodies = [];
  for (let index = 0; index < count; index += 1) bodies.push(makeBody(index, count, scenario, rand, extent));
  const events = makeScheduledEvents(scenario, bodies, durationTicks, rand);
  const core = {
    revision: WORLD_V0_STRESS_MANIFEST_REVISION,
    scenario,
    count,
    seed: normalizedSeed,
    durationTicks,
    extent,
    bodies,
    events,
  };
  const phenomenonId = `stress-${fnv1a64(JSON.stringify(core))}`;
  const manifest = { ...core, phenomenonId };
  validateStressManifest(manifest);
  return manifest;
}

export function stressChaosDNA(manifest) {
  validateStressManifest(manifest);
  return `${manifest.scenario}/n${manifest.count}/s${manifest.seed.toString(16).padStart(8, "0")}/${manifest.revision}/${manifest.phenomenonId.slice(-8)}`;
}
