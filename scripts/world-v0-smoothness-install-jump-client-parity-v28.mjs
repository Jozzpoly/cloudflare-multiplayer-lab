import { readFileSync, writeFileSync } from "node:fs";

const serverPath = "src/world-v0-shared-yard.ts";
const appPath = "public/world-v0/app.js";
let server = readFileSync(serverPath, "utf8");
let app = readFileSync(appPath, "utf8");

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`V28 client parity seam missing: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`V28 client parity seam non-unique: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

// Authority must expose causal metadata to every predicting client, not only the
// originating browser's ACK path.
server = replaceOnce(
  server,
  '        records: accepted.map(({ targetTick, x, z, jump }) => ({ targetTick, x, z, jump: Boolean(jump) })),',
  `        records: accepted.map(({ targetTick, x, z, jump, jumpSequence }) => ({
          targetTick, x, z, jump: Boolean(jump),
          ...(Number.isInteger(jumpSequence) ? { jumpSequence } : {}),
        })),`,
  "peer relay causal provenance",
);

server = replaceOnce(
  server,
  `        stateGuard: state.stateGuard,
        ...(this.lifecycleR0 ? { topology: this.topologyPayload() } : {}),`,
  `        stateGuard: state.stateGuard,
        // Box3D bytes contain physical state but not the discrete causal event
        // watermark. Rebase must seed both or later replay can manufacture a jump.
        jumpCausalHighWater: this.sortedPlayers().map((player) => ({
          sessionId: player.sessionId,
          lastConsumedJumpSequence: player.lastConsumedJumpSequence,
        })),
        ...(this.lifecycleR0 ? { topology: this.topologyPayload() } : {}),`,
  "authority rebase causal watermark",
);

// Browser keeps causal metadata alongside its replay timeline. It is not part of
// packed Box3D state, but it is deterministic simulation state and therefore has
// an explicit authority seed at every rebase boundary.
app = replaceOnce(
  app,
  'const usedByTick = new Map();\nconst diagnosticSamples = new Map();',
  `const usedByTick = new Map();
const jumpCausalSeed = new Map(); // V28 discrete replay state at current history seed boundary
const diagnosticSamples = new Map();

function normalizedJumpSequence(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function adoptJumpCausalSeed(entries, phase) {
  if (!Array.isArray(entries)) throw new Error(phase + " missing jump causal high-water");
  const next = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.sessionId !== "string" || !entry.sessionId) throw new Error(phase + " invalid jump causal session");
    if (!Number.isInteger(entry.lastConsumedJumpSequence) || entry.lastConsumedJumpSequence < 0) {
      throw new Error(phase + " invalid jump causal high-water");
    }
    if (next.has(entry.sessionId)) throw new Error(phase + " duplicate jump causal session");
    next.set(entry.sessionId, entry.lastConsumedJumpSequence);
  }
  jumpCausalSeed.clear();
  for (const [sessionId, highWater] of next) jumpCausalSeed.set(sessionId, highWater);
}

function resetJumpCausalSeedFromStart(players) {
  if (!Array.isArray(players)) throw new Error("world-start missing players for jump causal seed");
  adoptJumpCausalSeed(players.map((player) => ({
    sessionId: player.sessionId,
    lastConsumedJumpSequence: 0,
  })), "world-start");
}

function causalHighWaterBefore(previous, role, sessionId) {
  const retained = previous?.jumpCausalHighWater?.[role];
  if (Number.isInteger(retained) && retained >= 0) return retained;
  return Number.isInteger(jumpCausalSeed.get(sessionId)) ? jumpCausalSeed.get(sessionId) : 0;
}

function causalJumpStep(input, previousInput, priorHighWater) {
  const sequence = normalizedJumpSequence(input?.jumpSequence);
  if (Boolean(input?.jump) && sequence !== null) {
    return {
      trigger: sequence > priorHighWater,
      highWater: Math.max(priorHighWater, sequence),
    };
  }
  // Compatibility fallback for unsequenced traffic only. V28-authored input is
  // expected to carry explicit provenance on jump=true records.
  return {
    trigger: Boolean(input?.jump) && !Boolean(previousInput?.jump),
    highWater: priorHighWater,
  };
}

function sameResolvedInput(a, c) {
  return sameInput(a, c) && normalizedJumpSequence(a?.jumpSequence) === normalizedJumpSequence(c?.jumpSequence);
}`,
  "browser causal replay state helpers",
);

app = replaceOnce(
  app,
  `function resolveInputsForTick(tick, previous) {
  if (protocolStartTick === null || tick < protocolStartTick) return { self: zeroInput(), remote: zeroInput() };
  const selfAuth = authoritativeInput(tick, selfSessionId);
  const remoteAuth = authoritativeInput(tick, remoteSessionId);
  const selfRecord = selfAuth || intendedSelf.get(tick) || null;
  const remoteRecord = remoteAuth || peerRemote.get(tick) || null;
  const self = selfRecord || previous.self;
  const remote = remoteRecord || previous.remote;
  return {
    self: { x: self.x, z: self.z, jump: Boolean(selfRecord?.jump) },
    remote: { x: remote.x, z: remote.z, jump: Boolean(remoteRecord?.jump) },
  };
}`,
  `function resolveInputsForTick(tick, previous) {
  if (protocolStartTick === null || tick < protocolStartTick) return { self: zeroInput(), remote: zeroInput() };
  const selfAuth = authoritativeInput(tick, selfSessionId);
  const remoteAuth = authoritativeInput(tick, remoteSessionId);
  const selfRecord = selfAuth || intendedSelf.get(tick) || null;
  const remoteRecord = remoteAuth || peerRemote.get(tick) || null;
  const self = selfRecord || previous.self;
  const remote = remoteRecord || previous.remote;
  const selfSequence = selfAuth
    ? normalizedJumpSequence(selfAuth.jumpSequence)
    : normalizedJumpSequence(intendedJumpSequence.get(tick));
  const remoteSequence = normalizedJumpSequence(remoteRecord?.jumpSequence);
  return {
    self: {
      x: self.x, z: self.z, jump: Boolean(selfRecord?.jump),
      ...(selfSequence !== null ? { jumpSequence: selfSequence } : {}),
    },
    remote: {
      x: remote.x, z: remote.z, jump: Boolean(remoteRecord?.jump),
      ...(remoteSequence !== null ? { jumpSequence: remoteSequence } : {}),
    },
  };
}`,
  "resolved causal provenance",
);

app = replaceOnce(
  app,
  '  return !sameInput(used.self, resolved.self) || !sameInput(used.remote, resolved.remote);',
  '  return !sameResolvedInput(used.self, resolved.self) || !sameResolvedInput(used.remote, resolved.remote);',
  "correction detects causal metadata changes",
);

app = replaceOnce(
  app,
  `  // Keep the raw multi-tick jump intent in usedByTick, but turn it into one physical
  // impulse at simulation time. Replay/correction reconstructs the same rising edge.
  const selfJumpTrigger = Boolean(resolved.self.jump) && !Boolean(previous.self.jump);
  const remoteJumpTrigger = Boolean(resolved.remote.jump) && !Boolean(previous.remote.jump);
  usedByTick.set(tick, { self: { ...resolved.self }, remote: { ...resolved.remote } });
  const selfBody = sim.actorBodies.get(selfSessionId);`,
  `  // V28: physical jump edges are causal-event edges, not boolean edges. Keep the
  // consumed event high-water in the replay timeline so a rewind reconstructs the
  // same discrete state the authority used for true(seqN) -> false -> true(seqN).
  const selfPriorHighWater = causalHighWaterBefore(previous, "self", selfSessionId);
  const remotePriorHighWater = causalHighWaterBefore(previous, "remote", remoteSessionId);
  const selfJump = causalJumpStep(resolved.self, previous.self, selfPriorHighWater);
  const remoteJump = causalJumpStep(resolved.remote, previous.remote, remotePriorHighWater);
  const selfJumpTrigger = selfJump.trigger;
  const remoteJumpTrigger = remoteJump.trigger;
  usedByTick.set(tick, {
    self: { ...resolved.self },
    remote: { ...resolved.remote },
    jumpCausalHighWater: { self: selfJump.highWater, remote: remoteJump.highWater },
  });
  const selfBody = sim.actorBodies.get(selfSessionId);`,
  "prediction and replay causal jump edge",
);

app = replaceOnce(
  app,
  '    const next = { x: record.x, z: record.z, jump: Boolean(record.jump) };',
  `    const jumpSequence = normalizedJumpSequence(record.jumpSequence);
    const next = {
      x: record.x, z: record.z, jump: Boolean(record.jump),
      ...(jumpSequence !== null ? { jumpSequence } : {}),
    };`,
  "remote peer record causal provenance",
);

app = replaceOnce(
  app,
  '    if (!existing || !sameInput(existing, next)) {',
  '    if (!existing || !sameResolvedInput(existing, next)) {',
  "remote provenance supersession comparison",
);

app = replaceOnce(
  app,
  `      jump: Boolean(player.jump),
      jumpApplied: Boolean(player.jumpApplied),`,
  `      jump: Boolean(player.jump),
      ...(normalizedJumpSequence(player.jumpSequence) !== null ? { jumpSequence: player.jumpSequence } : {}),
      jumpApplied: Boolean(player.jumpApplied),`,
  "consumed causal provenance timeline",
);

app = replaceOnce(
  app,
  '  usedByTick.clear();\n  diagnosticSamples.clear();\n  pendingStateGuards.clear();\n  pendingBatch = [];\n  if (rebaseTopology) {',
  `  usedByTick.clear();
  adoptJumpCausalSeed(seed.jumpCausalHighWater, "authority-rebase");
  diagnosticSamples.clear();
  pendingStateGuards.clear();
  pendingBatch = [];
  if (rebaseTopology) {`,
  "rebase causal seed adoption",
);

app = replaceOnce(
  app,
  `  protocolStartTick = message.protocolStartTick;
  resetJumpDeliveryForFreshRun();
  buildArenaVisual(contract);`,
  `  protocolStartTick = message.protocolStartTick;
  resetJumpDeliveryForFreshRun();
  resetJumpCausalSeedFromStart(message.state?.players || []);
  buildArenaVisual(contract);`,
  "fresh start causal seed",
);

// Full protocol reset invalidates any old replay seed. Active authority rebase will
// install a new seed before simulation resumes.
app = replaceOnce(
  app,
  '  usedByTick.clear();\n  diagnosticSamples.clear();\n  pendingStateGuards.clear();\n  correctionEvents.splice(0);',
  '  usedByTick.clear();\n  jumpCausalSeed.clear();\n  diagnosticSamples.clear();\n  pendingStateGuards.clear();\n  correctionEvents.splice(0);',
  "protocol reset causal seed clear",
);

if (!server.includes('jumpCausalHighWater: this.sortedPlayers()')) throw new Error('V28 authority rebase causal seed marker missing');
if (!server.includes('...(Number.isInteger(jumpSequence) ? { jumpSequence } : {})')) throw new Error('V28 peer causal relay marker missing');
if (!app.includes('function causalJumpStep(') || !app.includes('jumpCausalHighWater: { self: selfJump.highWater')) {
  throw new Error('V28 browser causal replay marker missing');
}

writeFileSync(serverPath, server);
writeFileSync(appPath, app);
console.log("WORLD_V0_JUMP_CLIENT_CAUSAL_PARITY_V28_INSTALLED");
