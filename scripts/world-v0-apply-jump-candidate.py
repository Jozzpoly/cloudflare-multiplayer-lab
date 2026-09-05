from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    actual = s.count(old)
    assert actual == count, f"{path}: expected {count} occurrences, got {actual}: {old[:100]!r}"
    p.write_text(s.replace(old, new))

# --- Simulation contract: jump is part of deterministic SimBuild identity. ---
replace(
    "src/world-v0-contract.ts",
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v1";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v1";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v1";\n',
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v2-jump";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v2-jump";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v2-jump";\n',
)
replace(
    "src/world-v0-contract.ts",
    'export const WORLD_V0_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v1";',
    'export const WORLD_V0_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v2-jump";',
)
replace(
    "src/world-v0-contract.ts",
    'export const WORLD_V0_MOVEMENT = {\n  playerSpeed: 5.2,\n  playerAcceleration: 28,\n  playerDeceleration: 36,\n} as const;',
    'export const WORLD_V0_MOVEMENT = {\n  playerSpeed: 5.2,\n  playerAcceleration: 28,\n  playerDeceleration: 36,\n  jumpSpeed: 7.0,\n  supportMinNormalY: 0.55,\n  supportMinTotalNormalImpulse: 1e-6,\n} as const;',
)

# --- Protocol: optional wire jump for backwards-compatible apparatus; canonical one-shot semantics. ---
replace(
    "src/world-v0-protocol.ts",
    'export type WorldV0InputValue = { x: number; z: number };\nexport type WorldV0InputRecord = WorldV0InputValue & { targetTick: number };',
    'export type WorldV0InputValue = { x: number; z: number; jump?: boolean };\nexport type WorldV0InputRecord = WorldV0InputValue & { targetTick: number };',
)
replace(
    "src/world-v0-protocol.ts",
    'export type WorldV0RecordAcceptance = {\n  targetTick: number;\n  x: number;\n  z: number;\n  status: WorldV0RecordStatus;\n};',
    'export type WorldV0RecordAcceptance = {\n  targetTick: number;\n  x: number;\n  z: number;\n  jump: boolean;\n  status: WorldV0RecordStatus;\n};',
)
replace(
    "src/world-v0-protocol.ts",
    'export function normalizeWorldV0Input(x: number, z: number): WorldV0InputValue {\n  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };\n  const length = Math.hypot(x, z);\n  if (length <= 1) return { x, z };\n  return { x: x / length, z: z / length };\n}\n\nexport function sameWorldV0Input(a: WorldV0InputValue, b: WorldV0InputValue): boolean {\n  return Math.abs(a.x - b.x) <= INPUT_EPS && Math.abs(a.z - b.z) <= INPUT_EPS;\n}',
    'export function normalizeWorldV0Input(x: number, z: number, jump = false): WorldV0InputValue {\n  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0, jump: Boolean(jump) };\n  const length = Math.hypot(x, z);\n  if (length <= 1) return { x, z, jump: Boolean(jump) };\n  return { x: x / length, z: z / length, jump: Boolean(jump) };\n}\n\nexport function sameWorldV0Input(a: WorldV0InputValue, b: WorldV0InputValue): boolean {\n  return Math.abs(a.x - b.x) <= INPUT_EPS &&\n    Math.abs(a.z - b.z) <= INPUT_EPS &&\n    Boolean(a.jump) === Boolean(b.jump);\n}',
)
replace(
    "src/world-v0-protocol.ts",
    '    if (typeof inputRecord.x !== "number" || typeof inputRecord.z !== "number") return null;\n    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z);\n    records.push({ targetTick: inputRecord.targetTick, x: input.x, z: input.z });',
    '    if (typeof inputRecord.x !== "number" || typeof inputRecord.z !== "number") return null;\n    if ("jump" in inputRecord && typeof inputRecord.jump !== "boolean") return null;\n    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z, inputRecord.jump === true);\n    records.push({ targetTick: inputRecord.targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });',
)
replace(
    "src/world-v0-protocol.ts",
    '  private consumed: WorldV0InputValue = { x: 0, z: 0 };',
    '  private consumed: WorldV0InputValue = { x: 0, z: 0, jump: false };',
)
replace(
    "src/world-v0-protocol.ts",
    '          if (sameWorldV0Input(existing, record)) {',
    '          if (sameWorldV0Input(existing, { x: record.x, z: record.z, jump: Boolean(record.jump) })) {',
)
replace(
    "src/world-v0-protocol.ts",
    '          this.pending.set(record.targetTick, { x: record.x, z: record.z });\n          status = "accepted";',
    '          this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });\n          status = "accepted";',
)
replace(
    "src/world-v0-protocol.ts",
    '      result.push({ ...record, status });',
    '      result.push({ ...record, jump: Boolean(record.jump), status });',
)
replace(
    "src/world-v0-protocol.ts",
    '      this.consumed = pending;\n      this.missingStreak = 0;\n      this.consumedFresh += 1;\n      return { targetTick, x: pending.x, z: pending.z, fresh: true, source: "fresh", missingStreak: 0 };',
    '      this.consumed = { x: pending.x, z: pending.z, jump: false };\n      this.missingStreak = 0;\n      this.consumedFresh += 1;\n      return { targetTick, x: pending.x, z: pending.z, jump: Boolean(pending.jump), fresh: true, source: "fresh", missingStreak: 0 };',
)
replace(
    "src/world-v0-protocol.ts",
    '      this.consumed = { x: 0, z: 0 };\n      return {\n        targetTick,\n        x: 0,\n        z: 0,\n        fresh: false,',
    '      this.consumed = { x: 0, z: 0, jump: false };\n      return {\n        targetTick,\n        x: 0,\n        z: 0,\n        jump: false,\n        fresh: false,',
)
replace(
    "src/world-v0-protocol.ts",
    '      x: this.consumed.x,\n      z: this.consumed.z,\n      fresh: false,',
    '      x: this.consumed.x,\n      z: this.consumed.z,\n      jump: false,\n      fresh: false,',
)

# --- Authority: identical support predicate + one-shot vertical velocity edge. ---
replace(
    "src/world-v0-shared-yard.ts",
    'function bodyAngularVelocity(body: BodyId): Vec3 {\n  const out: Vec3 = [0, 0, 0];\n  b3.b3Body_GetAngularVelocity(out, body);\n  return [out[0], out[1], out[2]];\n}\n',
    'function bodyAngularVelocity(body: BodyId): Vec3 {\n  const out: Vec3 = [0, 0, 0];\n  b3.b3Body_GetAngularVelocity(out, body);\n  return [out[0], out[1], out[2]];\n}\n\nfunction sameBodyId(a: BodyId, c: BodyId): boolean {\n  return a.index1 === c.index1 && a.world0 === c.world0 && a.generation === c.generation;\n}\n',
)
replace(
    "src/world-v0-shared-yard.ts",
    '  private failure: string | null = null;\n  private resetting = false;',
    '  private failure: string | null = null;\n  private resetting = false;\n  private supportContacts: ReturnType<typeof b3.createContactsBuffer> | null = null;\n  private readonly supportContact = b3.createContact();\n  private readonly supportManifold = b3.createManifold();',
)
replace(
    "src/world-v0-shared-yard.ts",
    '    this.failure = null;\n\n    for (const box of WORLD_V0_ARENA.staticBoxes) {',
    '    this.failure = null;\n    this.supportContacts = b3.createContactsBuffer();\n\n    for (const box of WORLD_V0_ARENA.staticBoxes) {',
)
replace(
    "src/world-v0-shared-yard.ts",
    '      this.applyIntent(player.body, input.x, input.z);',
    '      this.applyIntent(player.body, input.x, input.z, Boolean(input.jump));',
)
replace(
    "src/world-v0-shared-yard.ts",
    '  private applyIntent(body: BodyId, inputX: number, inputZ: number): void {\n    const velocity = bodyLinearVelocity(body);\n    const hasInput = Math.hypot(inputX, inputZ) > 0.01;\n    const [nextX, nextZ] = moveToward2(\n      velocity[0],\n      velocity[2],\n      inputX * WORLD_V0_MOVEMENT.playerSpeed,\n      inputZ * WORLD_V0_MOVEMENT.playerSpeed,\n      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /\n        WORLD_V0_TIMING.simulationHz,\n    );\n    b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);\n  }',
    '  private hasJumpSupport(body: BodyId): boolean {\n    const buffer = this.supportContacts;\n    if (!buffer) return false;\n    b3.getBodyContactData(buffer, body);\n    for (let i = 0, n = b3.getNumContacts(buffer); i < n; i += 1) {\n      b3.getContactAt(this.supportContact, buffer, i);\n      const bodyA = b3.b3Shape_GetBody(this.supportContact.shapeIdA);\n      const bodyB = b3.b3Shape_GetBody(this.supportContact.shapeIdB);\n      const playerIsA = sameBodyId(bodyA, body);\n      const playerIsB = sameBodyId(bodyB, body);\n      if (!playerIsA && !playerIsB) continue;\n      for (let m = 0; m < this.supportContact.manifoldCount; m += 1) {\n        b3.getManifoldAt(this.supportManifold, this.supportContact, m);\n        const supportNormalY = playerIsA ? -this.supportManifold.normal[1] : this.supportManifold.normal[1];\n        if (supportNormalY < WORLD_V0_MOVEMENT.supportMinNormalY) continue;\n        for (let p = 0; p < this.supportManifold.pointCount; p += 1) {\n          if (this.supportManifold.points[p].totalNormalImpulse > WORLD_V0_MOVEMENT.supportMinTotalNormalImpulse) return true;\n        }\n      }\n    }\n    return false;\n  }\n\n  private applyIntent(body: BodyId, inputX: number, inputZ: number, jump: boolean): void {\n    const velocity = bodyLinearVelocity(body);\n    const hasInput = Math.hypot(inputX, inputZ) > 0.01;\n    const [nextX, nextZ] = moveToward2(\n      velocity[0],\n      velocity[2],\n      inputX * WORLD_V0_MOVEMENT.playerSpeed,\n      inputZ * WORLD_V0_MOVEMENT.playerSpeed,\n      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /\n        WORLD_V0_TIMING.simulationHz,\n    );\n    const nextY = jump && this.hasJumpSupport(body)\n      ? Math.max(velocity[1], WORLD_V0_MOVEMENT.jumpSpeed)\n      : velocity[1];\n    b3.b3Body_SetLinearVelocity(body, [nextX, nextY, nextZ]);\n  }',
)
replace(
    "src/world-v0-shared-yard.ts",
    '    this.world = null;\n    this.worldId = null;',
    '    if (this.supportContacts) {\n      try { b3.destroyContactsBuffer(this.supportContacts); } catch { /* teardown only */ }\n    }\n    this.supportContacts = null;\n    this.world = null;\n    this.worldId = null;',
)
replace(
    "src/world-v0-shared-yard.ts",
    '        records: accepted.map(({ targetTick, x, z }) => ({ targetTick, x, z })),',
    '        records: accepted.map(({ targetTick, x, z, jump }) => ({ targetTick, x, z, jump: Boolean(jump) })),',
)

# --- Browser simulation/input: consume jump once, predict and replay it identically. ---
replace(
    "public/world-v0/app.js",
    'const cameraGimbalKnob = document.querySelector("#camera-gimbal-knob");\nconst copyEvidenceButton = document.querySelector("#copy-evidence");',
    'const cameraGimbalKnob = document.querySelector("#camera-gimbal-knob");\nconst jumpButton = document.querySelector("#jump-button");\nconst copyEvidenceButton = document.querySelector("#copy-evidence");',
)
replace(
    "public/world-v0/app.js",
    'const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, sessionActions, copyInviteButton, restartRoundButton, notice, joystick, joystickKnob, cameraGimbal, cameraGimbalKnob, copyEvidenceButton, ...Object.values(metric)];',
    'const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, sessionActions, copyInviteButton, restartRoundButton, notice, joystick, joystickKnob, cameraGimbal, cameraGimbalKnob, jumpButton, copyEvidenceButton, ...Object.values(metric)];',
)
replace(
    "public/world-v0/app.js",
    'const scene = new THREE.Scene();',
    'const supportContacts = b3.createContactsBuffer();\nconst supportContact = b3.createContact();\nconst supportManifold = b3.createManifold();\n\nconst scene = new THREE.Scene();',
)
replace(
    "public/world-v0/app.js",
    'let touchInput = { x: 0, z: 0 };\nlet joystickPointer = null;',
    'let touchInput = { x: 0, z: 0 };\nlet joystickPointer = null;\nlet jumpQueued = false;\nlet jumpKeyHeld = false;',
)
replace(
    "public/world-v0/app.js",
    'function currentInput() {\n  return cameraRelativeInput(rawCurrentInput(), cameraOrbit.yaw);\n}\n\nfunction sameInput(a, c) {\n  return Math.abs(a.x - c.x) <= EPS && Math.abs(a.z - c.z) <= EPS;\n}\n\nfunction zeroInput() {\n  return { x: 0, z: 0 };\n}',
    'function currentInput() {\n  const movement = cameraRelativeInput(rawCurrentInput(), cameraOrbit.yaw);\n  return { x: movement.x, z: movement.z, jump: false };\n}\n\nfunction queueJump() {\n  if (playing && !runtimeFailed) jumpQueued = true;\n}\n\nfunction consumeIntendedInput() {\n  const movement = currentInput();\n  const jump = jumpQueued;\n  jumpQueued = false;\n  return { x: movement.x, z: movement.z, jump };\n}\n\nfunction sameInput(a, c) {\n  return Math.abs(a.x - c.x) <= EPS &&\n    Math.abs(a.z - c.z) <= EPS &&\n    Boolean(a.jump) === Boolean(c.jump);\n}\n\nfunction zeroInput() {\n  return { x: 0, z: 0, jump: false };\n}',
)
replace(
    "public/world-v0/app.js",
    'function bodyAngularVelocity(body) {\n  const out = [0, 0, 0];\n  b3.b3Body_GetAngularVelocity(out, body);\n  return [...out];\n}\n',
    'function bodyAngularVelocity(body) {\n  const out = [0, 0, 0];\n  b3.b3Body_GetAngularVelocity(out, body);\n  return [...out];\n}\n\nfunction sameBodyId(a, c) {\n  return a.index1 === c.index1 && a.world0 === c.world0 && a.generation === c.generation;\n}\n\nfunction hasJumpSupport(body) {\n  b3.getBodyContactData(supportContacts, body);\n  for (let i = 0, n = b3.getNumContacts(supportContacts); i < n; i += 1) {\n    b3.getContactAt(supportContact, supportContacts, i);\n    const bodyA = b3.b3Shape_GetBody(supportContact.shapeIdA);\n    const bodyB = b3.b3Shape_GetBody(supportContact.shapeIdB);\n    const playerIsA = sameBodyId(bodyA, body);\n    const playerIsB = sameBodyId(bodyB, body);\n    if (!playerIsA && !playerIsB) continue;\n    for (let m = 0; m < supportContact.manifoldCount; m += 1) {\n      b3.getManifoldAt(supportManifold, supportContact, m);\n      const supportNormalY = playerIsA ? -supportManifold.normal[1] : supportManifold.normal[1];\n      if (supportNormalY < simulation.movement.supportMinNormalY) continue;\n      for (let p = 0; p < supportManifold.pointCount; p += 1) {\n        if (supportManifold.points[p].totalNormalImpulse > simulation.movement.supportMinTotalNormalImpulse) return true;\n      }\n    }\n  }\n  return false;\n}\n',
)
replace(
    "public/world-v0/app.js",
    'function applyIntent(body, input) {\n  const velocity = bodyLinearVelocity(body);\n  const hasInput = Math.hypot(input.x, input.z) > 0.01;\n  const accel = hasInput ? simulation.movement.playerAcceleration : simulation.movement.playerDeceleration;\n  const [nextX, nextZ] = moveToward2(\n    velocity[0],\n    velocity[2],\n    input.x * simulation.movement.playerSpeed,\n    input.z * simulation.movement.playerSpeed,\n    accel * FIXED_DT,\n  );\n  b3.b3Body_SetLinearVelocity(body, [nextX, velocity[1], nextZ]);\n}',
    'function applyIntent(body, input) {\n  const velocity = bodyLinearVelocity(body);\n  const hasInput = Math.hypot(input.x, input.z) > 0.01;\n  const accel = hasInput ? simulation.movement.playerAcceleration : simulation.movement.playerDeceleration;\n  const [nextX, nextZ] = moveToward2(\n    velocity[0],\n    velocity[2],\n    input.x * simulation.movement.playerSpeed,\n    input.z * simulation.movement.playerSpeed,\n    accel * FIXED_DT,\n  );\n  const nextY = Boolean(input.jump) && hasJumpSupport(body)\n    ? Math.max(velocity[1], simulation.movement.jumpSpeed)\n    : velocity[1];\n  b3.b3Body_SetLinearVelocity(body, [nextX, nextY, nextZ]);\n}',
)
replace(
    "public/world-v0/app.js",
    '  const selfAuth = authoritativeInput(tick, selfSessionId);\n  const remoteAuth = authoritativeInput(tick, remoteSessionId);\n  const self = selfAuth || intendedSelf.get(tick) || previous.self;\n  const remote = remoteAuth || peerRemote.get(tick) || previous.remote;\n  return { self: { x: self.x, z: self.z }, remote: { x: remote.x, z: remote.z } };',
    '  const selfAuth = authoritativeInput(tick, selfSessionId);\n  const remoteAuth = authoritativeInput(tick, remoteSessionId);\n  const selfRecord = selfAuth || intendedSelf.get(tick) || null;\n  const remoteRecord = remoteAuth || peerRemote.get(tick) || null;\n  const self = selfRecord || previous.self;\n  const remote = remoteRecord || previous.remote;\n  return {\n    self: { x: self.x, z: self.z, jump: Boolean(selfRecord?.jump) },\n    remote: { x: remote.x, z: remote.z, jump: Boolean(remoteRecord?.jump) },\n  };',
)
replace(
    "public/world-v0/app.js",
    '    const intended = currentInput();',
    '    const intended = consumeIntendedInput();',
)
replace(
    "public/world-v0/app.js",
    '  pendingBatch.push({ targetTick, x: input.x, z: input.z });',
    '  pendingBatch.push({ targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });',
)
replace(
    "public/world-v0/app.js",
    '      peerRemote.set(record.targetTick, { x: record.x, z: record.z });',
    '      peerRemote.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });',
)
replace(
    "public/world-v0/app.js",
    '      x: player.x,\n      z: player.z,\n      fresh: Boolean(player.fresh),',
    '      x: player.x,\n      z: player.z,\n      jump: Boolean(player.jump),\n      fresh: Boolean(player.fresh),',
)
replace(
    "public/world-v0/app.js",
    '  networkState = "live · Shared Yard V0";\n  joystick.classList.add("active");',
    '  networkState = "live · Shared Yard V0";\n  jumpButton.classList.remove("hidden");\n  joystick.classList.add("active");',
)
replace(
    "public/world-v0/app.js",
    '    networkState = `closed ${event.code}`;\n    joystick.classList.remove("active");',
    '    networkState = `closed ${event.code}`;\n    jumpButton.classList.add("hidden");\n    joystick.classList.remove("active");',
)
replace(
    "public/world-v0/app.js",
    '    networkState = `epoch ended · ${message.reason}`;\n    joystick.classList.remove("active");',
    '    networkState = `epoch ended · ${message.reason}`;\n    jumpButton.classList.add("hidden");\n    joystick.classList.remove("active");',
)
replace(
    "public/world-v0/app.js",
    '  if (networkState.startsWith("live")) return "Shared Yard live · move · drag to look · interact";',
    '  if (networkState.startsWith("live")) return "Shared Yard live · move · jump · drag to look · interact";',
)
replace(
    "public/world-v0/app.js",
    '  neutralizeTransientInputs();\n  runtimeFailed = false;',
    '  neutralizeTransientInputs();\n  jumpButton.classList.add("hidden");\n  runtimeFailed = false;',
)
replace(
    "public/world-v0/app.js",
    'addEventListener("keydown", (event) => {\n  if (!movementCodes.has(event.code)) return;\n  keys.add(event.code);\n  event.preventDefault();\n});\naddEventListener("keyup", (event) => {\n  if (!movementCodes.has(event.code)) return;\n  keys.delete(event.code);\n  event.preventDefault();\n});',
    'addEventListener("keydown", (event) => {\n  if (event.code === "Space") {\n    if (!event.repeat && !jumpKeyHeld) queueJump();\n    jumpKeyHeld = true;\n    event.preventDefault();\n    return;\n  }\n  if (!movementCodes.has(event.code)) return;\n  keys.add(event.code);\n  event.preventDefault();\n});\naddEventListener("keyup", (event) => {\n  if (event.code === "Space") {\n    jumpKeyHeld = false;\n    event.preventDefault();\n    return;\n  }\n  if (!movementCodes.has(event.code)) return;\n  keys.delete(event.code);\n  event.preventDefault();\n});\njumpButton.addEventListener("pointerdown", (event) => {\n  queueJump();\n  event.preventDefault();\n});',
)
replace(
    "public/world-v0/app.js",
    '  keys.clear();\n  touchInput = zeroInput();',
    '  keys.clear();\n  jumpQueued = false;\n  jumpKeyHeld = false;\n  touchInput = zeroInput();',
)

# --- Playable UI. ---
replace(
    "public/world-v0/index.html",
    '  <div id="camera-gimbal" aria-label="camera orbit gimbal">\n    <div id="camera-gimbal-knob"></div>\n  </div>\n',
    '  <div id="camera-gimbal" aria-label="camera orbit gimbal">\n    <div id="camera-gimbal-knob"></div>\n  </div>\n\n  <button id="jump-button" class="hidden" type="button" aria-label="jump">JUMP</button>\n',
)

p = Path("public/world-v0/styles.css")
s = p.read_text()
assert "#jump-button" not in s, "jump button CSS already present"
s += '\n#jump-button{position:fixed;z-index:8;right:max(24px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));width:76px;height:76px;border-radius:50%;border:1px solid rgba(255,216,125,.5);background:rgba(87,64,26,.76);color:#fff2c9;font-size:12px;font-weight:820;letter-spacing:.08em;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;box-shadow:0 8px 26px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}#jump-button:active{transform:scale(.94);background:rgba(121,87,31,.9)}@media(pointer:coarse){#jump-button{right:max(136px,calc(env(safe-area-inset-right) + 126px));bottom:max(28px,env(safe-area-inset-bottom))}}@media(max-width:720px){#jump-button{right:max(116px,calc(env(safe-area-inset-right) + 106px));bottom:max(24px,env(safe-area-inset-bottom));width:68px;height:68px;font-size:10px}}\n'
p.write_text(s)

# --- Browser build pin; workflow resolves the new SimBuild hash from the modified TS contract. ---
replace(
    "public/world-v0/build-contract.js",
    'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v8-friend-entry";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v1";\nexport const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v1";\nexport const WORLD_V0_EXPECTED_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v1";\nexport const WORLD_V0_EXPECTED_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";\nexport const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-579c7aa172198390";',
    'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v9-jump";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v2-jump";\nexport const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v2-jump";\nexport const WORLD_V0_EXPECTED_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v2-jump";\nexport const WORLD_V0_EXPECTED_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";\nexport const WORLD_V0_EXPECTED_SIM_BUILD_ID = "__JUMP_SIM_BUILD_ID__";',
)

# --- Protocol smoke proves one-shot jump is fresh-only and never lease-held. ---
replace(
    "scripts/world-v0-protocol-smoke.ts",
    '    { targetTick: 20, x: 2, z: 0 },\n    { targetTick: 21, x: 0, z: 1 },',
    '    { targetTick: 20, x: 2, z: 0, jump: true },\n    { targetTick: 21, x: 0, z: 1, jump: false },',
)
replace(
    "scripts/world-v0-protocol-smoke.ts",
    '  targetTick: 20, x: 1, z: 0, fresh: true, source: "fresh", missingStreak: 0,',
    '  targetTick: 20, x: 1, z: 0, jump: true, fresh: true, source: "fresh", missingStreak: 0,',
)
replace(
    "scripts/world-v0-protocol-smoke.ts",
    '  targetTick: 21, x: 0, z: 1, fresh: true, source: "fresh", missingStreak: 0,',
    '  targetTick: 21, x: 0, z: 1, jump: false, fresh: true, source: "fresh", missingStreak: 0,',
)
replace(
    "scripts/world-v0-protocol-smoke.ts",
    '  assert.deepEqual([lastHeld.x, lastHeld.z], [0, 1], "lease must hold the last consumed input before expiry");',
    '  assert.deepEqual([lastHeld.x, lastHeld.z], [0, 1], "lease must hold the last consumed movement before expiry");\n  assert.equal(Boolean(lastHeld.jump), false, "one-shot jump must never be lease-held");',
)
replace(
    "scripts/world-v0-protocol-smoke.ts",
    '  x: 0,\n  z: 0,\n  fresh: false,',
    '  x: 0,\n  z: 0,\n  jump: false,\n  fresh: false,',
)
replace(
    "scripts/world-v0-protocol-smoke.ts",
    'assert.equal(parsed.records[0].x, 1, "input must be normalized at protocol boundary");',
    'assert.equal(parsed.records[0].x, 1, "input must be normalized at protocol boundary");\nassert.equal(parsed.records[0].jump, true, "jump edge must survive protocol normalization");\nassert.equal(parseWorldV0ClientMessage(JSON.stringify({\n  type: "world_v0_input_batch",\n  ...identity,\n  batchSeq: 99,\n  records: [{ targetTick: 20, x: 0, z: 0, jump: 1 }],\n})), null, "jump must be a boolean when present");',
)

print("WORLD_V0_JUMP_CANDIDATE_PATCH_READY")
