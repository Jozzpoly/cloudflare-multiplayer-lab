import Box3D from "box3d.js";

const b3 = await Box3D();
const HZ = 60;
const DT = 1 / HZ;
const STEP_MS = 1000 / HZ;
const SUBSTEPS = 4;
const SPEED = 5.2;
const ACCEL = 28;
const DECEL = 36;
const HEARTBEAT_MS = 66;
const PROP_COUNT = 12;
const PLAYER = "player";
const EPS = 1e-9;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function distanceXZ(a, b) { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
function distance3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function moveToward2(cx, cz, tx, tz, maxDelta) {
  const dx = tx - cx, dz = tz - cz, d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < EPS) return [tx, tz];
  const s = maxDelta / d;
  return [cx + dx * s, cz + dz * s];
}
function normalizeInput([x, z]) {
  const d = Math.hypot(x, z);
  return d > 1 ? [x / d, z / d] : [x, z];
}
function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}
function delayTicks(baseMs, jitterMs, rng) {
  const ms = Math.max(0, baseMs + (rng() * 2 - 1) * jitterMs);
  return Math.max(0, Math.round(ms / STEP_MS));
}
function enqueue(queue, tick, payload) {
  queue.push({ tick, payload });
  queue.sort((a, b) => a.tick - b.tick);
}
function deliver(queue, tick, fn) {
  while (queue.length && queue[0].tick <= tick) fn(queue.shift().payload);
}
function staticBox(world, position, half) {
  const def = b3.b3DefaultBodyDef();
  def.position = position;
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), half[0], half[1], half[2]);
}
function createWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(wd);
  staticBox(world, [0, -0.5, 0], [10, 0.5, 10]);
  staticBox(world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  staticBox(world, [9.5, 1.5, 0], [0.5, 2, 10]);
  staticBox(world, [0, 1.5, -9.5], [10, 2, 0.5]);
  staticBox(world, [0, 1.5, 9.5], [10, 2, 0.5]);

  const bodies = new Map();
  for (let i = 0; i < PROP_COUNT; i += 1) {
    const col = i % 4, row = Math.floor(i / 4);
    const bd = b3.b3DefaultBodyDef();
    bd.type = b3.b3BodyType.b3_dynamicBody;
    bd.position = [(col - 1.5) * 1.05, 0.46, (row - 1) * 1.05];
    bd.linearDamping = 0.08;
    bd.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, bd);
    const sd = b3.b3DefaultShapeDef();
    sd.density = 22;
    sd.baseMaterial.friction = 0.72;
    sd.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, sd, 0.46, 0.46, 0.46);
    bodies.set(`prop-${i}`, body);
  }

  const pd = b3.b3DefaultBodyDef();
  pd.type = b3.b3BodyType.b3_dynamicBody;
  pd.position = [-6.5, 0.82, -1.4];
  pd.linearDamping = 0.3;
  pd.angularDamping = 8;
  const player = b3.b3CreateBody(world, pd);
  const ps = b3.b3DefaultShapeDef();
  ps.density = 80;
  ps.baseMaterial.friction = 0.8;
  ps.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(player, ps, { center1: [0, -0.45, 0], center2: [0, 0.45, 0], radius: 0.35 });
  b3.b3Body_SetMotionLocks(player, { linearX: false, linearY: false, linearZ: false, angularX: true, angularY: true, angularZ: true });
  bodies.set(PLAYER, player);
  return { world, bodies };
}
function destroy(sim) { b3.b3DestroyWorld(sim.world); }
function bodyState(body) {
  const position = [0, 0, 0], linearVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  return { position: [...position], linearVelocity: [...linearVelocity] };
}
function snapshot(sim) {
  const states = {};
  for (const [id, body] of sim.bodies) states[id] = bodyState(body);
  return states;
}
function applyInput(sim, raw) {
  const [x, z] = normalizeInput(raw);
  const player = sim.bodies.get(PLAYER);
  const v = [0, 0, 0];
  b3.b3Body_GetLinearVelocity(v, player);
  const active = Math.hypot(x, z) > 0.01;
  const [vx, vz] = moveToward2(v[0], v[2], x * SPEED, z * SPEED, (active ? ACCEL : DECEL) * DT);
  b3.b3Body_SetLinearVelocity(player, [vx, v[1], vz]);
}
function maxPropDistance(a, b) {
  let max = 0;
  for (let i = 0; i < PROP_COUNT; i += 1) {
    max = Math.max(max, distance3(a[`prop-${i}`].position, b[`prop-${i}`].position));
  }
  return max;
}
function playerNearAnyProp(states) {
  const p = states[PLAYER].position;
  for (let i = 0; i < PROP_COUNT; i += 1) {
    if (distanceXZ(p, states[`prop-${i}`].position) < 0.9) return true;
  }
  return false;
}
function finiteStates(states) {
  return Object.values(states).every((s) => [...s.position, ...s.linearVelocity].every(Number.isFinite));
}

const SCENARIOS = {
  free: {
    durationSeconds: 5,
    activeUntilSeconds: 1.0,
    input(localSeconds) { return localSeconds < 1.0 ? [0, -1] : [0, 0]; },
  },
  push: {
    durationSeconds: 7,
    activeUntilSeconds: 2.2,
    input(localSeconds) { return localSeconds < 2.2 ? [1, 0] : [0, 0]; },
  },
  reversal: {
    durationSeconds: 8,
    activeUntilSeconds: 3.6,
    input(localSeconds) {
      if (localSeconds < 1.9) return [1, 0];
      if (localSeconds < 3.6) return [-1, 0];
      return [0, 0];
    },
  },
};

const NETWORKS = [
  { name: "a2-observed", oneWayMs: 63, jitterMs: 6 },
  { name: "jittery", oneWayMs: 63, jitterMs: 25 },
  { name: "hostile", oneWayMs: 100, jitterMs: 20 },
];

function run(scenario, network, seed) {
  const authority = createWorld();
  const client = createWorld();
  const rng = makeRng(seed);
  const inputQueue = [];
  const authorityHistory = [snapshot(authority)];
  const clientHistory = [snapshot(client)];
  const clientMeta = [{ active: false, contact: false, acked: true }];
  let authorityInput = [0, 0];
  let authorityAck = 0;
  let seq = 0;
  let lastSent = null;
  let nextHeartbeatMs = 0;

  const welcomeDelay = delayTicks(network.oneWayMs, network.jitterMs, rng);
  const maxWallTicks = Math.round(scenario.durationSeconds * HZ) + welcomeDelay;
  const activeUntilLocalTick = Math.round(scenario.activeUntilSeconds * HZ);

  try {
    for (let wallTick = 0; wallTick < maxWallTicks; wallTick += 1) {
      deliver(inputQueue, wallTick, (packet) => {
        if (packet.seq <= authorityAck) return;
        authorityAck = packet.seq;
        authorityInput = packet.input;
      });

      applyInput(authority, authorityInput);
      b3.b3World_Step(authority.world, DT, SUBSTEPS);
      const authorityState = snapshot(authority);
      if (!finiteStates(authorityState)) throw new Error(`non-finite authority at wall tick ${wallTick}`);
      authorityHistory.push(authorityState);

      if (wallTick < welcomeDelay) continue;
      const localTick = wallTick - welcomeDelay;
      const localSeconds = localTick * DT;
      const input = scenario.input(localSeconds);
      const changed = !lastSent || Math.abs(input[0] - lastSent[0]) > EPS || Math.abs(input[1] - lastSent[1]) > EPS;
      const wallMs = wallTick * STEP_MS;
      if (changed || wallMs + EPS >= nextHeartbeatMs) {
        seq += 1;
        enqueue(inputQueue, wallTick + delayTicks(network.oneWayMs, network.jitterMs, rng), { seq, input: [...input] });
        lastSent = [...input];
        nextHeartbeatMs = wallMs + HEARTBEAT_MS;
      }

      applyInput(client, input);
      b3.b3World_Step(client.world, DT, SUBSTEPS);
      const clientState = snapshot(client);
      if (!finiteStates(clientState)) throw new Error(`non-finite client at local tick ${localTick}`);
      clientHistory.push(clientState);
      clientMeta.push({
        active: localTick < activeUntilLocalTick,
        contact: playerNearAnyProp(clientState),
        acked: authorityAck >= seq,
      });
    }

    const maxShift = Math.min(20, authorityHistory.length - clientHistory.length + welcomeDelay + 12);
    const candidates = [];
    for (let shift = 0; shift <= maxShift; shift += 1) {
      const activePlayer = [], activeProp = [], contactPlayer = [], contactProp = [];
      for (let localTick = 1; localTick < clientHistory.length; localTick += 1) {
        const authorityTick = localTick + shift;
        if (authorityTick >= authorityHistory.length) break;
        if (!clientMeta[localTick]?.active) continue;
        const c = clientHistory[localTick], a = authorityHistory[authorityTick];
        const pd = distanceXZ(c[PLAYER].position, a[PLAYER].position);
        const props = maxPropDistance(c, a);
        activePlayer.push(pd);
        activeProp.push(props);
        if (clientMeta[localTick]?.contact) {
          contactPlayer.push(pd);
          contactProp.push(props);
        }
      }
      const summary = {
        shift,
        activePlayerP95: percentile(activePlayer, 0.95),
        activePropP95: percentile(activeProp, 0.95),
        contactPlayerP95: percentile(contactPlayer, 0.95),
        contactPropP95: percentile(contactProp, 0.95),
      };
      summary.score = summary.activePlayerP95 + summary.activePropP95 * 1.5 + summary.contactPlayerP95 + summary.contactPropP95 * 1.5;
      candidates.push(summary);
    }
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    const sameEpoch = candidates.find((entry) => entry.shift === 0);

    const wallPlayer = [], wallProp = [], settledPlayer = [], settledProp = [];
    for (let localTick = 1; localTick < clientHistory.length; localTick += 1) {
      const wallAuthorityTick = localTick + welcomeDelay;
      if (wallAuthorityTick >= authorityHistory.length) break;
      const c = clientHistory[localTick], a = authorityHistory[wallAuthorityTick];
      wallPlayer.push(distanceXZ(c[PLAYER].position, a[PLAYER].position));
      wallProp.push(maxPropDistance(c, a));
      if (!clientMeta[localTick]?.active && localTick > activeUntilLocalTick + Math.round(0.8 * HZ)) {
        settledPlayer.push(distanceXZ(c[PLAYER].position, a[PLAYER].position));
        settledProp.push(maxPropDistance(c, a));
      }
    }

    const finalClient = clientHistory.at(-1);
    const finalAuthority = authorityHistory.at(-1);
    return {
      welcomeDelayTicks: welcomeDelay,
      sameEpochPlayerP95: sameEpoch.activePlayerP95,
      sameEpochPropP95: sameEpoch.activePropP95,
      sameEpochContactPlayerP95: sameEpoch.contactPlayerP95,
      sameEpochContactPropP95: sameEpoch.contactPropP95,
      bestShiftTicks: best.shift,
      bestShiftPlayerP95: best.activePlayerP95,
      bestShiftPropP95: best.activePropP95,
      bestShiftContactPlayerP95: best.contactPlayerP95,
      bestShiftContactPropP95: best.contactPropP95,
      wallPlayerP95: percentile(wallPlayer, 0.95),
      wallPropP95: percentile(wallProp, 0.95),
      settledWallPlayerP95: percentile(settledPlayer, 0.95),
      settledWallPropP95: percentile(settledProp, 0.95),
      finalWallPlayer: distanceXZ(finalClient[PLAYER].position, finalAuthority[PLAYER].position),
      finalWallProp: maxPropDistance(finalClient, finalAuthority),
      phaseLagTicks: welcomeDelay,
      contactSamples: clientMeta.filter((m) => m.contact).length,
    };
  } finally {
    destroy(authority);
    destroy(client);
  }
}

function f(value) { return Number(value).toFixed(3); }
const results = [];
for (let n = 0; n < NETWORKS.length; n += 1) {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const result = run(scenario, NETWORKS[n], 9100 + n * 101 + Object.keys(SCENARIOS).indexOf(name));
    results.push({ network: NETWORKS[n].name, scenario: name, result });
  }
}

console.log("\nA2R temporal truth gate — current local-only runtime model");
for (const entry of results) {
  const r = entry.result;
  console.log(
    `  ${entry.network}/${entry.scenario} | welcome lag ${r.welcomeDelayTicks}t | same-epoch player/prop ${f(r.sameEpochPlayerP95)}/${f(r.sameEpochPropP95)} | best shift ${r.bestShiftTicks}t → ${f(r.bestShiftPlayerP95)}/${f(r.bestShiftPropP95)} | contact best ${f(r.bestShiftContactPlayerP95)}/${f(r.bestShiftContactPropP95)} | wall settled ${f(r.settledWallPlayerP95)}/${f(r.settledWallPropP95)} | final ${f(r.finalWallPlayer)}/${f(r.finalWallProp)} | contacts ${r.contactSamples}`,
  );
}

if (!results.every((entry) => Object.values(entry.result).every(Number.isFinite))) {
  throw new Error("non-finite temporal truth result");
}
if (!results.some((entry) => entry.result.contactSamples > 0)) {
  throw new Error("temporal truth gate did not exercise any player-prop contact");
}
