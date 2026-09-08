import Box3D from 'box3d.js';

const b3 = await Box3D();
const HZ = 60;
const DT = 1 / HZ;
const SUBSTEPS = 4;
const SPEED = 5.2;
const ACCEL = 28;
const DECEL = 36;
const LINEAR_DAMPING = 0.3;
const HEARTBEAT_MS = 66;
const EPS = 1e-9;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

function clampVector(v, maxLength) {
  const length = Math.hypot(...v);
  if (length <= maxLength || length < EPS) return v;
  const s = maxLength / length;
  return [v[0] * s, v[1] * s, v[2] * s];
}

function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx;
  const dz = tz - cz;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < EPS) return [tx, tz];
  const s = maxDelta / d;
  return [cx + dx * s, cz + dz * s];
}

function normalizeInput([x, z]) {
  const d = Math.hypot(x, z);
  return d > 1 ? [x / d, z / d] : [x, z];
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function delayMs(base, jitter, rng) {
  return Math.max(0, base + (rng() * 2 - 1) * jitter);
}

function createPlayerWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);

  const groundDef = b3.b3DefaultBodyDef();
  groundDef.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, groundDef);
  b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 20, 0.5, 20);

  const bd = b3.b3DefaultBodyDef();
  bd.type = b3.b3BodyType.b3_dynamicBody;
  bd.position = [0, 0.82, 0];
  bd.linearDamping = LINEAR_DAMPING;
  bd.angularDamping = 8;
  const body = b3.b3CreateBody(world, bd);
  const sd = b3.b3DefaultShapeDef();
  sd.density = 80;
  sd.baseMaterial.friction = 0.8;
  sd.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(body, sd, {
    center1: [0, -0.45, 0],
    center2: [0, 0.45, 0],
    radius: 0.35,
  });
  b3.b3Body_SetMotionLocks(body, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: true,
    angularY: true,
    angularZ: true,
  });
  return { world, body };
}

function destroy(sim) { b3.b3DestroyWorld(sim.world); }

function state(sim) {
  const position = [0, 0, 0];
  const velocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, sim.body);
  b3.b3Body_GetLinearVelocity(velocity, sim.body);
  return { position: [...position], velocity: [...velocity] };
}

function applyInput(sim, rawInput) {
  const [x, z] = normalizeInput(rawInput);
  const velocity = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(velocity, sim.body);
  const active = Math.hypot(x, z) > 0.01;
  const [vx, vz] = moveToward2(
    velocity[0], velocity[2], x * SPEED, z * SPEED,
    (active ? ACCEL : DECEL) * DT,
  );
  b3.b3Body_SetLinearVelocity(sim.body, [vx, velocity[1], vz]);
}

function projectInputAware(snapshot, rawInput, ageSeconds) {
  const [x, z] = normalizeInput(rawInput);
  const active = Math.hypot(x, z) > 0.01;
  const position = [...snapshot.position];
  const velocity = [...snapshot.velocity];
  let remaining = Math.max(0, ageSeconds);
  while (remaining > EPS) {
    const h = Math.min(DT, remaining);
    const [vx, vz] = moveToward2(
      velocity[0], velocity[2], x * SPEED, z * SPEED,
      (active ? ACCEL : DECEL) * h,
    );
    const damping = 1 / (1 + LINEAR_DAMPING * h);
    velocity[0] = vx * damping;
    velocity[2] = vz * damping;
    position[0] += velocity[0] * h;
    position[2] += velocity[2] * h;
    remaining -= h;
  }
  return { position, velocity };
}

function projectConstant(snapshot, ageSeconds) {
  return {
    position: [
      snapshot.position[0] + snapshot.velocity[0] * ageSeconds,
      snapshot.position[1] + snapshot.velocity[1] * ageSeconds,
      snapshot.position[2] + snapshot.velocity[2] * ageSeconds,
    ],
    velocity: snapshot.velocity,
  };
}

function distanceXZ(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
function enqueue(queue, at, payload) { queue.push({ at, payload }); queue.sort((a, b) => a.at - b.at); }
function deliver(queue, now, fn) { while (queue.length && queue[0].at <= now + 1e-6) fn(queue.shift().payload); }
function inputChanged(a, b) { return !b || Math.abs(a[0] - b[0]) > EPS || Math.abs(a[1] - b[1]) > EPS; }

const SCENARIOS = {
  steady: { duration: 5, activeUntil: 2.4, input: (t) => t < 2.4 ? [1, 0] : [0, 0] },
  reversal: {
    duration: 6, activeUntil: 3.6,
    input(t) { if (t < 1.8) return [1, 0]; if (t < 3.6) return [-1, 0]; return [0, 0]; },
  },
  taps: {
    duration: 6, activeUntil: 3.8,
    input(t) { if (t >= 3.8) return [0, 0]; return Math.floor(t / 0.45) % 2 === 0 ? [1, 0] : [0, 0]; },
  },
};

function run({ scenario, network, policy, seed }) {
  const authority = createPlayerWorld();
  const client = createPlayerWorld();
  const ideal = createPlayerWorld();
  const inputQueue = [];
  const snapshotQueue = [];
  const rng = makeRng(seed);
  let authorityInput = [0, 0];
  let authorityAck = 0;
  let packetSeq = 0;
  let lastChangeSeq = 0;
  let lastSent = null;
  let nextHeartbeat = 0;
  let snapshot = null;
  let previousCorrection = [0, 0, 0];
  const intentError = [];
  const settledError = [];
  const correctionAccel = [];
  const correctionJerk = [];
  const authorityError = [];
  let blockedByAckTicks = 0;
  let correctionEligibleTicks = 0;
  const totalTicks = Math.round(scenario.duration * HZ);
  const snapshotEvery = Math.round(HZ / network.snapshotHz);

  try {
    for (let tick = 0; tick < totalTicks; tick += 1) {
      const t = tick * DT;
      const nowMs = t * 1000;
      const input = scenario.input(t);
      const changed = inputChanged(input, lastSent);

      if (changed || nowMs + 1e-6 >= nextHeartbeat) {
        packetSeq += 1;
        if (changed) lastChangeSeq = packetSeq;
        enqueue(inputQueue, nowMs + delayMs(network.oneWayMs, network.jitterMs, rng), { seq: packetSeq, input: [...input] });
        lastSent = [...input];
        nextHeartbeat = nowMs + HEARTBEAT_MS;
      }
      deliver(inputQueue, nowMs, (packet) => {
        if (packet.seq <= authorityAck) return;
        authorityAck = packet.seq;
        authorityInput = packet.input;
      });
      deliver(snapshotQueue, nowMs, (value) => { snapshot = value; });

      applyInput(authority, authorityInput);
      applyInput(client, input);
      applyInput(ideal, input);

      let correction = [0, 0, 0];
      if (snapshot && policy.maxAccel > 0) {
        const ackEligible = policy.mode === 'naive' || snapshot.ack >= lastChangeSeq;
        if (!ackEligible) {
          blockedByAckTicks += 1;
        } else {
          correctionEligibleTicks += 1;
          const local = state(client);
          const age = Math.max(0, tick - snapshot.tick) * DT;
          const target = policy.mode === 'ack-input'
            ? projectInputAware(snapshot, input, age)
            : projectConstant(snapshot, age);
          const posError = [
            target.position[0] - local.position[0],
            target.position[1] - local.position[1],
            target.position[2] - local.position[2],
          ];
          const velError = [
            target.velocity[0] - local.velocity[0],
            target.velocity[1] - local.velocity[1],
            target.velocity[2] - local.velocity[2],
          ];
          const kp = 4 / (policy.tau * policy.tau);
          const kd = 4 / policy.tau;
          correction = clampVector([
            posError[0] * kp + velError[0] * kd,
            posError[1] * kp + velError[1] * kd,
            posError[2] * kp + velError[2] * kd,
          ], policy.maxAccel);
          if (Math.hypot(...posError) < 0.015 && Math.hypot(...velError) < 0.05) correction = [0, 0, 0];
          if (Math.hypot(...correction) > EPS) {
            b3.b3Body_SetLinearVelocity(client.body, [
              local.velocity[0] + correction[0] * DT,
              local.velocity[1] + correction[1] * DT,
              local.velocity[2] + correction[2] * DT,
            ]);
          }
        }
      }

      correctionAccel.push(Math.hypot(...correction));
      correctionJerk.push(Math.hypot(
        correction[0] - previousCorrection[0],
        correction[1] - previousCorrection[1],
        correction[2] - previousCorrection[2],
      ) / DT);
      previousCorrection = correction;

      b3.b3World_Step(authority.world, DT, SUBSTEPS);
      b3.b3World_Step(client.world, DT, SUBSTEPS);
      b3.b3World_Step(ideal.world, DT, SUBSTEPS);

      if ((tick + 1) % snapshotEvery === 0) {
        const auth = state(authority);
        enqueue(snapshotQueue, nowMs + DT * 1000 + delayMs(network.oneWayMs, network.jitterMs, rng), {
          tick: tick + 1,
          position: auth.position,
          velocity: auth.velocity,
          ack: authorityAck,
        });
      }

      const auth = state(authority);
      const local = state(client);
      const zeroLatency = state(ideal);
      const aError = distanceXZ(auth.position, local.position);
      const iError = distanceXZ(zeroLatency.position, local.position);
      authorityError.push(aError);
      if (t < scenario.activeUntil) intentError.push(iError);
      if (t > scenario.activeUntil + 0.8) settledError.push(aError);
    }

    const finalAuthority = state(authority);
    const finalClient = state(client);
    return {
      authorityP95: percentile(authorityError, 0.95),
      intentP95: percentile(intentError, 0.95),
      settledP95: percentile(settledError, 0.95),
      finalError: distanceXZ(finalAuthority.position, finalClient.position),
      accelP95: percentile(correctionAccel, 0.95),
      jerkP95: percentile(correctionJerk, 0.95),
      blockedByAckTicks,
      correctionEligibleTicks,
    };
  } finally {
    destroy(authority); destroy(client); destroy(ideal);
  }
}

function aggregate(results) {
  const out = {};
  for (const key of Object.keys(results[0])) out[key] = Math.max(...results.map((r) => r[key]));
  return out;
}

function score(summary) {
  return summary.intentP95 * 3 + summary.settledP95 * 2 + summary.finalError * 2 + summary.accelP95 * 0.01 + summary.jerkP95 * 0.0005;
}
function fmt(v) { return Number(v).toFixed(3); }

const network = { oneWayMs: 63, jitterMs: 6, snapshotHz: 10 };
const policies = [{ mode: 'none', maxAccel: 0, tau: 0.28 }];
for (const mode of ['naive', 'ack', 'ack-input']) {
  for (const maxAccel of [4, 8, 12, 16]) {
    for (const tau of [0.18, 0.28, 0.4]) policies.push({ mode, maxAccel, tau });
  }
}

const ranked = policies.map((policy) => {
  const results = Object.values(SCENARIOS).map((scenario, index) => run({ scenario, network, policy, seed: 4200 + index }));
  const summary = aggregate(results);
  return { policy, summary, score: score(summary) };
}).sort((a, b) => a.score - b.score);

console.log('\nA2R owner prediction lab v2 — ACK/input-aware policies');
for (const candidate of ranked.slice(0, 12)) {
  const s = candidate.summary;
  console.log(
    `  score ${fmt(candidate.score)} | intent ${fmt(s.intentP95)} | settled ${fmt(s.settledP95)} | final ${fmt(s.finalError)} | ` +
    `authority ${fmt(s.authorityP95)} | accel ${fmt(s.accelP95)} | jerk ${fmt(s.jerkP95)} | ack-blocked ${s.blockedByAckTicks} | ` +
    JSON.stringify(candidate.policy),
  );
}

for (const mode of ['none', 'naive', 'ack', 'ack-input']) {
  const best = ranked.find((entry) => entry.policy.mode === mode);
  console.log(`Best ${mode}: ${JSON.stringify(best)}`);
}

if (!ranked.every((entry) => Object.values(entry.summary).every(Number.isFinite))) {
  throw new Error('non-finite owner lab result');
}
