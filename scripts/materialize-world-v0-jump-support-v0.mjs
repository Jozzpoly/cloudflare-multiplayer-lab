import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASE_BLOBS = {
  "src/world-v0-contract.ts": "5f662eafc7046c4f5a76be50cfc485b65e7d1e98",
  "src/world-v0-protocol.ts": "0716a4b4a66a7d17569280259121c34baaec498f",
  "src/world-v0-shared-yard.ts": "d791c754a8ece130ab70ede5b037e1aa926999dc",
  "public/world-v0/build-contract.js": "85c570adfb7e20e8c4c6feec2733f28c1dd7bf76",
  "public/world-v0/app.js": "4ab49ad4551c4e2718b1eaa827c7c6c344019c56",
  "public/world-v0/index.html": "7a3d1a387340a1e286d332e24d5d9179b4353d24",
  "public/world-v0/styles.css": "7e9796de64409b5ec84db4cdadbfdb5ea80601b1",
};

function blobSha(path) {
  return execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim();
}

function assertBase() {
  for (const [path, expected] of Object.entries(BASE_BLOBS)) {
    const actual = blobSha(path);
    if (actual !== expected) throw new Error(`jump materializer base drift: ${path} ${actual} != ${expected}`);
  }
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`jump materializer missing anchor: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`jump materializer ambiguous anchor: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function patch(path, edits) {
  let text = readFileSync(path, "utf8");
  for (const [label, before, after] of edits) text = replaceOnce(text, before, after, `${path}:${label}`);
  writeFileSync(path, text);
}

assertBase();

patch("src/world-v0-contract.ts", [
  ["revisions",
`export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v1";
export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v1";
export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v1";
export const WORLD_V0_SCENE_REVISION = "shared-yard-v0-seed-a";
export const WORLD_V0_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";
export const WORLD_V0_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v1";`,
`export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v2-jump-support";
export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v2-jump";
export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v2-jump";
export const WORLD_V0_SCENE_REVISION = "shared-yard-v0-seed-a";
export const WORLD_V0_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";
export const WORLD_V0_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v2-jump";`],
  ["movement",
`export const WORLD_V0_MOVEMENT = {
  playerSpeed: 5.2,
  playerAcceleration: 28,
  playerDeceleration: 36,
} as const;`,
`export const WORLD_V0_MOVEMENT = {
  playerSpeed: 5.2,
  playerAcceleration: 28,
  playerDeceleration: 36,
  jumpSpeed: 7.2,
  jumpSupportNormalMinY: 0.55,
  jumpSupportImpulseEpsilon: 0.0001,
  jumpMaxUpwardSpeed: 0.75,
} as const;`],
]);

patch("src/world-v0-protocol.ts", [
  ["input-types",
`export type WorldV0InputValue = { x: number; z: number };
export type WorldV0InputRecord = WorldV0InputValue & { targetTick: number };`,
`export type WorldV0InputValue = { x: number; z: number; jump: boolean };
export type WorldV0InputRecord = WorldV0InputValue & { targetTick: number };`],
  ["acceptance-type",
`export type WorldV0RecordAcceptance = {
  targetTick: number;
  x: number;
  z: number;
  status: WorldV0RecordStatus;
};`,
`export type WorldV0RecordAcceptance = {
  targetTick: number;
  x: number;
  z: number;
  jump: boolean;
  status: WorldV0RecordStatus;
};`],
  ["normalize",
`export function normalizeWorldV0Input(x: number, z: number): WorldV0InputValue {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

export function sameWorldV0Input(a: WorldV0InputValue, b: WorldV0InputValue): boolean {
  return Math.abs(a.x - b.x) <= INPUT_EPS && Math.abs(a.z - b.z) <= INPUT_EPS;
}`,
`export function normalizeWorldV0Input(x: number, z: number, jump = false): WorldV0InputValue {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0, jump: false };
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z, jump: Boolean(jump) };
  return { x: x / length, z: z / length, jump: Boolean(jump) };
}

export function sameWorldV0Input(a: WorldV0InputValue, b: WorldV0InputValue): boolean {
  return Math.abs(a.x - b.x) <= INPUT_EPS &&
    Math.abs(a.z - b.z) <= INPUT_EPS &&
    Boolean(a.jump) === Boolean(b.jump);
}`],
  ["parse-record",
`    if (!isFiniteInteger(inputRecord.targetTick) || inputRecord.targetTick < 0) return null;
    if (typeof inputRecord.x !== "number" || typeof inputRecord.z !== "number") return null;
    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z);
    records.push({ targetTick: inputRecord.targetTick, x: input.x, z: input.z });`,
`    if (!isFiniteInteger(inputRecord.targetTick) || inputRecord.targetTick < 0) return null;
    if (typeof inputRecord.x !== "number" || typeof inputRecord.z !== "number") return null;
    if ("jump" in inputRecord && typeof inputRecord.jump !== "boolean") return null;
    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z, inputRecord.jump === true);
    records.push({ targetTick: inputRecord.targetTick, x: input.x, z: input.z, jump: input.jump });`],
  ["consumed-init",
`  private consumed: WorldV0InputValue = { x: 0, z: 0 };`,
`  private consumed: WorldV0InputValue = { x: 0, z: 0, jump: false };`],
  ["pending-set",
`          this.pending.set(record.targetTick, { x: record.x, z: record.z });`,
`          this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: record.jump });`],
  ["fresh-consume",
`      return { targetTick, x: pending.x, z: pending.z, fresh: true, source: "fresh", missingStreak: 0 };`,
`      return { targetTick, x: pending.x, z: pending.z, jump: pending.jump, fresh: true, source: "fresh", missingStreak: 0 };`],
  ["lease-reset",
`      this.consumed = { x: 0, z: 0 };
      return {
        targetTick,
        x: 0,
        z: 0,
        fresh: false,`,
`      this.consumed = { x: 0, z: 0, jump: false };
      return {
        targetTick,
        x: 0,
        z: 0,
        jump: false,
        fresh: false,`],
  ["held-consume",
`    return {
      targetTick,
      x: this.consumed.x,
      z: this.consumed.z,
      fresh: false,
      source: "held",`,
`    return {
      targetTick,
      x: this.consumed.x,
      z: this.consumed.z,
      jump: false,
      fresh: false,
      source: "held",`],
]);

patch("src/world-v0-shared-yard.ts", [
  ["protocol-import-type",
`  sameWorldV0Identity,
  type WorldV0ConsumedInput,
} from "./world-v0-protocol";`,
`  sameWorldV0Identity,
  type WorldV0ConsumedInput,
  type WorldV0InputValue,
} from "./world-v0-protocol";`],
  ["support-fields",
`  private failure: string | null = null;
  private resetting = false;`,
`  private failure: string | null = null;
  private resetting = false;
  private readonly supportContacts = b3.createContactsBuffer();
  private readonly supportContact = b3.createContact();
  private readonly supportManifold = b3.createManifold();`],
  ["relay-jump",
`        records: accepted.map(({ targetTick, x, z }) => ({ targetTick, x, z })),`,
`        records: accepted.map(({ targetTick, x, z, jump }) => ({ targetTick, x, z, jump })),`],
  ["preactive-jump",
`        : { targetTick, x: 0, z: 0, fresh: false, source: "held" as const, missingStreak: 0 };
      this.applyIntent(player.body, input.x, input.z);
      consumed.push({`,
`        : { targetTick, x: 0, z: 0, jump: false, fresh: false, source: "held" as const, missingStreak: 0 };
      const jumpApplied = this.applyIntent(player.body, input);
      consumed.push({`],
  ["consumed-jump-applied",
`        slot: player.slot,
        ...input,
      });`,
`        slot: player.slot,
        ...input,
        jumpApplied,
      });`],
  ["consumed-type",
`    } & WorldV0ConsumedInput> = [];`,
`    } & WorldV0ConsumedInput & { jumpApplied: boolean }> = [];`],
  ["apply-intent",
`  private applyIntent(body: BodyId, inputX: number, inputZ: number): void {
    const velocity = bodyLinearVelocity(body);
    const hasInput = Math.hypot(inputX, inputZ) > 0.01;
    const [nextX, nextZ] = moveToward2(
      velocity[0],
      velocity[2],
      inputX * WORLD_V0_MOVEMENT.playerSpeed,
      inputZ * WORLD_V0_MOVEMENT.playerSpeed,
      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /
        WORLD_V0_TIMING.simulationHz,
    );
    b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
  }`,
`  private sameBodyId(a: BodyId, b: BodyId): boolean {
    return a.index1 === b.index1 && a.world0 === b.world0 && a.generation === b.generation;
  }

  private hasJumpSupport(body: BodyId): boolean {
    b3.getBodyContactData(this.supportContacts, body);
    for (let index = 0, count = b3.getNumContacts(this.supportContacts); index < count; index += 1) {
      b3.getContactAt(this.supportContact, this.supportContacts, index);
      const bodyA = b3.b3Shape_GetBody(this.supportContact.shapeIdA);
      const bodyB = b3.b3Shape_GetBody(this.supportContact.shapeIdB);
      const playerIsA = this.sameBodyId(bodyA, body);
      const playerIsB = this.sameBodyId(bodyB, body);
      if (!playerIsA && !playerIsB) continue;
      for (let manifoldIndex = 0; manifoldIndex < this.supportContact.manifoldCount; manifoldIndex += 1) {
        b3.getManifoldAt(this.supportManifold, this.supportContact, manifoldIndex);
        const supportY = playerIsA ? -this.supportManifold.normal[1] : this.supportManifold.normal[1];
        if (supportY < WORLD_V0_MOVEMENT.jumpSupportNormalMinY) continue;
        for (let pointIndex = 0; pointIndex < this.supportManifold.pointCount; pointIndex += 1) {
          if (this.supportManifold.points[pointIndex].totalNormalImpulse > WORLD_V0_MOVEMENT.jumpSupportImpulseEpsilon) return true;
        }
      }
    }
    return false;
  }

  private applyIntent(body: BodyId, input: WorldV0InputValue): boolean {
    const velocity = bodyLinearVelocity(body);
    const hasInput = Math.hypot(input.x, input.z) > 0.01;
    const [nextX, nextZ] = moveToward2(
      velocity[0],
      velocity[2],
      input.x * WORLD_V0_MOVEMENT.playerSpeed,
      input.z * WORLD_V0_MOVEMENT.playerSpeed,
      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /
        WORLD_V0_TIMING.simulationHz,
    );
    const jumpApplied = Boolean(input.jump) &&
      velocity[1] <= WORLD_V0_MOVEMENT.jumpMaxUpwardSpeed &&
      this.hasJumpSupport(body);
    b3.b3Body_SetLinearVelocity(body, [nextX, jumpApplied ? WORLD_V0_MOVEMENT.jumpSpeed : velocity[1], nextZ]);
    return jumpApplied;
  }`],
]);

patch("public/world-v0/build-contract.js", [
  ["whole-contract",
`export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v8-friend-entry";
export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v1";
export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v1";
export const WORLD_V0_EXPECTED_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v1";
export const WORLD_V0_EXPECTED_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";
export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-579c7aa172198390";
export const WORLD_V0_BOX3D_PACKAGE = "box3d.js@0.1.1";
export const WORLD_V0_BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
`,
`export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v9-jump-support";
export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v2-jump";
export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v2-jump";
export const WORLD_V0_EXPECTED_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v2-jump";
export const WORLD_V0_EXPECTED_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";
export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-d57fdf09a2c3c250";
export const WORLD_V0_BOX3D_PACKAGE = "box3d.js@0.1.1";
export const WORLD_V0_BOX3D_URL = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
`],
]);

patch("public/world-v0/app.js", [
  ["jump-element",
`const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const cameraGimbal = document.querySelector("#camera-gimbal");`,
`const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const jumpButton = document.querySelector("#jump-button");
const cameraGimbal = document.querySelector("#camera-gimbal");`],
  ["required-jump",
`const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, sessionActions, copyInviteButton, restartRoundButton, notice, joystick, joystickKnob, cameraGimbal, cameraGimbalKnob, copyEvidenceButton, ...Object.values(metric)];`,
`const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, sessionActions, copyInviteButton, restartRoundButton, notice, joystick, joystickKnob, jumpButton, cameraGimbal, cameraGimbalKnob, copyEvidenceButton, ...Object.values(metric)];`],
  ["physics-capabilities",
`    "b3RecPlayer_GetBodyId", "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_HasDiverged",
    "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid",
  ];`,
`    "b3RecPlayer_GetBodyId", "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_HasDiverged",
    "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid",
    "createContactsBuffer", "getBodyContactData", "getNumContacts", "createContact", "getContactAt", "createManifold", "getManifoldAt", "b3Shape_GetBody",
  ];`],
  ["input-latch",
`let touchInput = { x: 0, z: 0 };
let joystickPointer = null;`,
`let touchInput = { x: 0, z: 0 };
let joystickPointer = null;
let jumpQueued = false;`],
  ["input-shape",
`function currentInput() {
  return cameraRelativeInput(rawCurrentInput(), cameraOrbit.yaw);
}

function sameInput(a, c) {
  return Math.abs(a.x - c.x) <= EPS && Math.abs(a.z - c.z) <= EPS;
}

function zeroInput() {
  return { x: 0, z: 0 };
}`,
`function currentInput() {
  return { ...cameraRelativeInput(rawCurrentInput(), cameraOrbit.yaw), jump: jumpQueued };
}

function consumeCurrentInput() {
  const input = currentInput();
  jumpQueued = false;
  return input;
}

function sameInput(a, c) {
  return Math.abs(a.x - c.x) <= EPS &&
    Math.abs(a.z - c.z) <= EPS &&
    Boolean(a.jump) === Boolean(c.jump);
}

function zeroInput() {
  return { x: 0, z: 0, jump: false };
}`],
  ["jump-metrics",
`  serverRejected: 0,
  latestCorrection: { self: 0, remote: 0, prop: 0 },`,
`  serverRejected: 0,
  jumpPulsesGenerated: 0,
  authorityJumpApplied: 0,
  authorityJumpRejected: 0,
  latestCorrection: { self: 0, remote: 0, prop: 0 },`],
  ["assert-movement-contract",
`  if (contract.timing?.simulationHz !== 60 || contract.timing?.substeps !== 4) throw new Error(`${phase} fixed-step contract mismatch`);
  if (!Array.isArray(contract.netEntityOrder) || contract.netEntityOrder.length !== 14) throw new Error(`${phase} invalid NetEntityId order`);`,
`  if (contract.timing?.simulationHz !== 60 || contract.timing?.substeps !== 4) throw new Error(`${phase} fixed-step contract mismatch`);
  if (!Number.isFinite(contract.movement?.jumpSpeed) || !Number.isFinite(contract.movement?.jumpSupportNormalMinY) ||
      !Number.isFinite(contract.movement?.jumpSupportImpulseEpsilon) || !Number.isFinite(contract.movement?.jumpMaxUpwardSpeed)) {
    throw new Error(`${phase} jump-support movement contract missing`);
  }
  if (!Array.isArray(contract.netEntityOrder) || contract.netEntityOrder.length !== 14) throw new Error(`${phase} invalid NetEntityId order`);`],
  ["apply-intent",
`function applyIntent(body, input) {
  const velocity = bodyLinearVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const accel = hasInput ? simulation.movement.playerAcceleration : simulation.movement.playerDeceleration;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    input.x * simulation.movement.playerSpeed,
    input.z * simulation.movement.playerSpeed,
    accel * FIXED_DT,
  );
  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);
}`,
`const supportContacts = b3.createContactsBuffer();
const supportContact = b3.createContact();
const supportManifold = b3.createManifold();

function sameBodyId(a, c) {
  return a.index1 === c.index1 && a.world0 === c.world0 && a.generation === c.generation;
}

function hasJumpSupport(body) {
  b3.getBodyContactData(supportContacts, body);
  for (let index = 0, count = b3.getNumContacts(supportContacts); index < count; index += 1) {
    b3.getContactAt(supportContact, supportContacts, index);
    const bodyA = b3.b3Shape_GetBody(supportContact.shapeIdA);
    const bodyB = b3.b3Shape_GetBody(supportContact.shapeIdB);
    const playerIsA = sameBodyId(bodyA, body);
    const playerIsB = sameBodyId(bodyB, body);
    if (!playerIsA && !playerIsB) continue;
    for (let manifoldIndex = 0; manifoldIndex < supportContact.manifoldCount; manifoldIndex += 1) {
      b3.getManifoldAt(supportManifold, supportContact, manifoldIndex);
      const supportY = playerIsA ? -supportManifold.normal[1] : supportManifold.normal[1];
      if (supportY < simulation.movement.jumpSupportNormalMinY) continue;
      for (let pointIndex = 0; pointIndex < supportManifold.pointCount; pointIndex += 1) {
        if (supportManifold.points[pointIndex].totalNormalImpulse > simulation.movement.jumpSupportImpulseEpsilon) return true;
      }
    }
  }
  return false;
}

function applyIntent(body, input) {
  const velocity = bodyLinearVelocity(body);
  const hasInput = Math.hypot(input.x, input.z) > 0.01;
  const accel = hasInput ? simulation.movement.playerAcceleration : simulation.movement.playerDeceleration;
  const [nextX, nextZ] = moveToward2(
    velocity[0],
    velocity[2],
    input.x * simulation.movement.playerSpeed,
    input.z * simulation.movement.playerSpeed,
    accel * FIXED_DT,
  );
  const jumpApplied = Boolean(input.jump) &&
    velocity[1] <= simulation.movement.jumpMaxUpwardSpeed &&
    hasJumpSupport(body);
  b3.b3Body_SetLinearVelocity(body, [nextX, jumpApplied ? simulation.movement.jumpSpeed : velocity[1], nextZ]);
  return jumpApplied;
}`],
  ["resolve-jump",
`  return { self: { x: self.x, z: self.z }, remote: { x: remote.x, z: remote.z } };`,
`  return {
    self: { x: self.x, z: self.z, jump: Boolean(self.jump) },
    remote: { x: remote.x, z: remote.z, jump: Boolean(remote.jump) },
  };`],
  ["generate-jump",
`    const intended = currentInput();
    intendedSelf.set(tick, { ...intended });
    queueInputRecord(tick, intended);`,
`    const intended = consumeCurrentInput();
    intendedSelf.set(tick, { ...intended });
    if (intended.jump) metrics.jumpPulsesGenerated += 1;
    queueInputRecord(tick, intended);`],
  ["queue-jump",
`  pendingBatch.push({ targetTick, x: input.x, z: input.z });`,
`  pendingBatch.push({ targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });`],
  ["peer-jump",
`      peerRemote.set(record.targetTick, { x: record.x, z: record.z });`,
`      peerRemote.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });`],
  ["consumed-jump",
`    map.set(player.sessionId, {
      x: player.x,
      z: player.z,
      fresh: Boolean(player.fresh),
      source: player.source,
      missingStreak: player.missingStreak,
    });
    if (player.source === "lease_expired") metrics.leaseExpiredSeen += 1;`,
`    map.set(player.sessionId, {
      x: player.x,
      z: player.z,
      jump: Boolean(player.jump),
      fresh: Boolean(player.fresh),
      source: player.source,
      missingStreak: player.missingStreak,
    });
    if (player.sessionId === selfSessionId && player.jump) {
      if (player.jumpApplied) metrics.authorityJumpApplied += 1;
      else metrics.authorityJumpRejected += 1;
    }
    if (player.source === "lease_expired") metrics.leaseExpiredSeen += 1;`],
  ["start-jump-control",
`  joystick.classList.add("active");
  cameraGimbal.classList.add("active");`,
`  joystick.classList.add("active");
  cameraGimbal.classList.add("active");
  updateJumpControlState();`],
  ["epoch-disable-jump",
`    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    recordLifecycle("epoch-ended",`,
`    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    jumpQueued = false;
    updateJumpControlState();
    recordLifecycle("epoch-ended",`],
  ["close-disable-jump",
`    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    cameraGimbalInput = { x: 0, y: 0 };`,
`    joystick.classList.remove("active");
    cameraGimbal.classList.remove("active");
    jumpQueued = false;
    updateJumpControlState();
    cameraGimbalInput = { x: 0, y: 0 };`],
  ["jump-evidence",
`    session: {
      inviteUrl: buildInviteUrl(),`,
`    jump: (() => {
      const selfBody = localState?.sim?.actorBodies?.get(selfSessionId);
      const position = selfBody ? bodyPosition(selfBody) : null;
      const velocity = selfBody ? bodyLinearVelocity(selfBody) : null;
      return {
        queued: jumpQueued,
        buttonEnabled: !jumpButton.disabled,
        selfY: position?.[1] ?? null,
        selfVy: velocity?.[1] ?? null,
        pulsesGenerated: metrics.jumpPulsesGenerated,
        authorityApplied: metrics.authorityJumpApplied,
        authorityRejected: metrics.authorityJumpRejected,
      };
    })(),
    session: {
      inviteUrl: buildInviteUrl(),`],
  ["playable-jump-evidence",
`  rawInput: rawCurrentInput(),
  worldInput: currentInput(),
});`,
`  rawInput: rawCurrentInput(),
  worldInput: currentInput(),
  jumpQueued,
});`],
  ["reset-jump",
`  keys.clear();
  touchInput = zeroInput();
  joystickPointer = null;`,
`  keys.clear();
  touchInput = { x: 0, z: 0 };
  joystickPointer = null;
  jumpQueued = false;
  jumpButton.disabled = true;`],
  ["reset-jump-metrics",
`    serverRejected: 0,
    latestCorrection: { self: 0, remote: 0, prop: 0 },`,
`    serverRejected: 0,
    jumpPulsesGenerated: 0,
    authorityJumpApplied: 0,
    authorityJumpRejected: 0,
    latestCorrection: { self: 0, remote: 0, prop: 0 },`],
  ["jump-input-listeners",
`addEventListener("keydown", (event) => {
  if (!movementCodes.has(event.code)) return;
  keys.add(event.code);
  event.preventDefault();
});
addEventListener("keyup", (event) => {
  if (!movementCodes.has(event.code)) return;
  keys.delete(event.code);
  event.preventDefault();
});
addEventListener("blur", () => keys.clear());`,
`function jumpControlReady() {
  return Boolean(playing && !runtimeFailed && localState && protocolStartTick !== null && localState.boundaryTick >= protocolStartTick);
}

function updateJumpControlState() {
  jumpButton.disabled = !jumpControlReady();
  jumpButton.classList.toggle("active", !jumpButton.disabled);
}

function queueJumpPulse() {
  if (!jumpControlReady()) return false;
  jumpQueued = true;
  return true;
}

addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    if (!event.repeat) queueJumpPulse();
    event.preventDefault();
    return;
  }
  if (!movementCodes.has(event.code)) return;
  keys.add(event.code);
  event.preventDefault();
});
addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    return;
  }
  if (!movementCodes.has(event.code)) return;
  keys.delete(event.code);
  event.preventDefault();
});
addEventListener("blur", () => {
  keys.clear();
  jumpQueued = false;
});
jumpButton.addEventListener("pointerdown", (event) => {
  queueJumpPulse();
  event.preventDefault();
});`],
  ["product-status-jump",
`  if (networkState.startsWith("live")) return "Shared Yard live · move · drag to look · interact";`,
`  if (networkState.startsWith("live")) return "Shared Yard live · move · Space/JUMP · drag to look · interact";`],
  ["frame-update-jump",
`      advancePrediction();
      syncMeshes();`,
`      advancePrediction();
      updateJumpControlState();
      syncMeshes();`],
]);

patch("public/world-v0/index.html", [
  ["jump-button",
`  <div id="camera-gimbal" aria-label="camera orbit gimbal">
    <div id="camera-gimbal-knob"></div>
  </div>`,
`  <button id="jump-button" type="button" aria-label="jump" disabled>JUMP</button>

  <div id="camera-gimbal" aria-label="camera orbit gimbal">
    <div id="camera-gimbal-knob"></div>
  </div>`],
]);

patch("public/world-v0/styles.css", [
  ["jump-css",
`@media(max-width:720px){.session-actions{top:max(60px,calc(env(safe-area-inset-top) + 52px));left:max(9px,env(safe-area-inset-left));gap:5px}.session-actions button{padding:6px 8px;font-size:9px}.inspection-badge{left:50%;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%);font-size:8px;max-width:calc(100vw - 230px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}`,
`@media(max-width:720px){.session-actions{top:max(60px,calc(env(safe-area-inset-top) + 52px));left:max(9px,env(safe-area-inset-left));gap:5px}.session-actions button{padding:6px 8px;font-size:9px}.inspection-badge{left:50%;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%);font-size:8px;max-width:calc(100vw - 230px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
#jump-button{display:none;position:fixed;z-index:8;right:max(126px,calc(env(safe-area-inset-right) + 116px));bottom:max(26px,calc(env(safe-area-inset-bottom) + 18px));width:70px;height:70px;border-radius:50%;border:1px solid rgba(240,190,112,.52);background:rgba(67,49,24,.78);color:#fff1d3;font-size:12px;font-weight:800;letter-spacing:.08em;box-shadow:0 8px 24px rgba(0,0,0,.28);touch-action:none;opacity:.3}#jump-button.active{opacity:.86}#jump-button:disabled{cursor:default}@media(pointer:coarse){#jump-button{display:block}}@media(max-width:720px){#jump-button{right:max(116px,calc(env(safe-area-inset-right) + 106px));bottom:max(24px,calc(env(safe-area-inset-bottom) + 16px));width:68px;height:68px}}`],
]);

console.log("WORLD_V0_JUMP_SUPPORT_MATERIALIZED", JSON.stringify({
  base: "5dd28a899c4f60c9227f1eb93026f571ced733e3",
  expectedSimBuildId: "shared-yard-v0-sim-d57fdf09a2c3c250",
  files: Object.keys(BASE_BLOBS),
}));
