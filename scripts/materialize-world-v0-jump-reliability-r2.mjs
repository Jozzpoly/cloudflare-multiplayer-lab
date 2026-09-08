import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "src/world-v0-contract.ts";
const CLIENT = "public/world-v0/app.js";
const BUILD = "public/world-v0/build-contract.js";

function read(path) { return readFileSync(path, "utf8"); }
function write(path, value) { writeFileSync(path, value); }

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`materializer source mismatch: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`materializer source ambiguous: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let contract = read(CONTRACT);
contract = replaceOnce(
  contract,
  'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v13-jump-intent-window";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v10-jump-intent-window";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v9-jump-intent-window";',
  'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v14-jump-delivery-persistence";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v11-jump-delivery-persistence";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v10-jump-delivery-persistence";',
  "contract revisions",
);
contract = replaceOnce(
  contract,
  '  // A discrete jump press is authored as a short contiguous intent window. The\n  // authority/client simulation applies the physical impulse only on a rising edge,\n  // so losing one near-frontier tick does not erase the action and later true ticks\n  // cannot repeatedly boost the same jump. This is transport durability, not coyote time.\n  jumpIntentWindowTicks: 6,\n',
  '  // Discrete jump delivery is acknowledgement-driven on the browser: a press stays\n  // pending across the moving future-input horizon until world_v0_consumed proves that\n  // the authority canonically consumed jump=true. Physics remains authority rising-edge\n  // triggered, and pending clears on canonical true even when support rejects the impulse.\n',
  "remove fixed jump window contract",
);
write(CONTRACT, contract);

let client = read(CLIENT);
client = replaceOnce(
  client,
  'let joystickPointer = null;\nlet jumpQueued = false;\nlet jumpKeyHeld = false;',
  'let joystickPointer = null;\nlet jumpKeyHeld = false;\nlet jumpDelivery = {\n  revision: "world-v0-jump-delivery-persistence-v1",\n  pending: false,\n  edgeArmed: true,\n  pressSequence: 0,\n  pendingSequence: null,\n  firstAuthoredTick: null,\n  lastAuthoredTick: null,\n  deliveredSequence: 0,\n  deliveredTick: null,\n  lastDeliveredApplied: null,\n  rearmedTick: null,\n  appliedCount: 0,\n  lastAppliedTick: null,\n};',
  "jump delivery state",
);
client = replaceOnce(
  client,
  'function queueJump() {\n  if (playing && !runtimeFailed) jumpQueued = true;\n}\n\nfunction consumeIntendedInput() {\n  const movement = currentInput();\n  const jump = jumpQueued;\n  jumpQueued = false;\n  return { x: movement.x, z: movement.z, jump };\n}',
  'function resetJumpDeliveryForFreshRun() {\n  jumpDelivery = {\n    revision: "world-v0-jump-delivery-persistence-v1",\n    pending: false,\n    edgeArmed: true,\n    pressSequence: 0,\n    pendingSequence: null,\n    firstAuthoredTick: null,\n    lastAuthoredTick: null,\n    deliveredSequence: 0,\n    deliveredTick: null,\n    lastDeliveredApplied: null,\n    rearmedTick: null,\n    appliedCount: 0,\n    lastAppliedTick: null,\n  };\n}\n\nfunction disarmJumpDelivery() {\n  jumpDelivery.pending = false;\n  jumpDelivery.pendingSequence = null;\n  jumpDelivery.edgeArmed = false;\n  jumpDelivery.firstAuthoredTick = null;\n  jumpDelivery.lastAuthoredTick = null;\n}\n\nfunction queueJump() {\n  if (!playing || runtimeFailed || jumpDelivery.pending || !jumpDelivery.edgeArmed) return false;\n  jumpDelivery.pressSequence += 1;\n  jumpDelivery.pending = true;\n  jumpDelivery.edgeArmed = false;\n  jumpDelivery.pendingSequence = jumpDelivery.pressSequence;\n  jumpDelivery.firstAuthoredTick = null;\n  jumpDelivery.lastAuthoredTick = null;\n  jumpDelivery.deliveredTick = null;\n  jumpDelivery.lastDeliveredApplied = null;\n  jumpDelivery.rearmedTick = null;\n  recordLifecycle("jump-delivery-pending", { sequence: jumpDelivery.pendingSequence });\n  return true;\n}\n\nfunction noteJumpAuthoredTick(targetTick) {\n  if (!jumpDelivery.pending || !Number.isInteger(targetTick)) return;\n  if (!Number.isInteger(jumpDelivery.firstAuthoredTick)) jumpDelivery.firstAuthoredTick = targetTick;\n  jumpDelivery.lastAuthoredTick = Number.isInteger(jumpDelivery.lastAuthoredTick)\n    ? Math.max(jumpDelivery.lastAuthoredTick, targetTick)\n    : targetTick;\n}\n\nfunction noteCanonicalJumpDelivery(targetTick, jump, jumpApplied) {\n  if (jumpApplied && jumpDelivery.lastAppliedTick !== targetTick) {\n    jumpDelivery.appliedCount += 1;\n    jumpDelivery.lastAppliedTick = targetTick;\n  }\n  if (jumpDelivery.pending && jump) {\n    jumpDelivery.pending = false;\n    jumpDelivery.deliveredSequence = jumpDelivery.pendingSequence;\n    jumpDelivery.pendingSequence = null;\n    jumpDelivery.deliveredTick = targetTick;\n    jumpDelivery.lastDeliveredApplied = Boolean(jumpApplied);\n    recordLifecycle("jump-delivery-canonical", {\n      sequence: jumpDelivery.deliveredSequence,\n      targetTick,\n      jumpApplied: Boolean(jumpApplied),\n    });\n  }\n  if (!jumpDelivery.pending && !jump && !jumpDelivery.edgeArmed) {\n    jumpDelivery.edgeArmed = true;\n    jumpDelivery.rearmedTick = targetTick;\n    recordLifecycle("jump-delivery-rearmed", { targetTick });\n  }\n}',
  "jump delivery state machine",
);
client = replaceOnce(
  client,
  '  logicalInputPumps += 1;\n  const movement = currentInput();\n  const jumpWindowThrough = jumpQueued\n    ? Math.min(authoredThrough, startTick + simulation.timing.jumpIntentWindowTicks - 1)\n    : null;\n  if (jumpWindowThrough !== null) jumpQueued = false;\n  const revisions = [];\n\n  for (let tick = startTick; tick <= authoredThrough; tick += 1) {\n    const existing = intendedSelf.get(tick);',
  '  logicalInputPumps += 1;\n  const movement = currentInput();\n  const jumpIntent = jumpDelivery.pending;\n  const revisions = [];\n\n  for (let tick = startTick; tick <= authoredThrough; tick += 1) {\n    if (jumpIntent) noteJumpAuthoredTick(tick);\n    const existing = intendedSelf.get(tick);',
  "scheduler pending jump header",
);
client = replaceOnce(
  client,
  '      const next = { x: movement.x, z: movement.z, jump: jumpWindowThrough !== null && tick <= jumpWindowThrough };',
  '      const next = { x: movement.x, z: movement.z, jump: jumpIntent };',
  "scheduler new pending jump records",
);
client = replaceOnce(
  client,
  '      // Movement/camera revisions must not erase an already-authored jump-intent window.\n      jump: Boolean(existing.jump || (jumpWindowThrough !== null && tick <= jumpWindowThrough)),',
  '      // Pending delivery owns the future jump bit. Once canonical jump=true is\n      // observed, pending clears and this same revision path retracts unconsumed\n      // future true records back to false so the next press requires a new edge.\n      jump: jumpIntent,',
  "scheduler revision pending jump records",
);
client = replaceOnce(
  client,
  'function handleConsumed(message) {\n  assertMessageIdentity(message, "consumed");\n  if (!Number.isInteger(message.targetTick)) return;\n  const map = new Map();\n  for (const player of message.players || []) {\n    if (!player.sessionId || !Number.isFinite(player.x) || !Number.isFinite(player.z)) continue;\n    map.set(player.sessionId, {\n      x: player.x,\n      z: player.z,\n      jump: Boolean(player.jump),\n      fresh: Boolean(player.fresh),\n      source: player.source,\n      missingStreak: player.missingStreak,\n    });\n    if (player.source === "lease_expired") metrics.leaseExpiredSeen += 1;\n  }\n  consumedByTick.set(message.targetTick, map);\n  maybeCorrect([message.targetTick], "authority-consumed");\n}',
  'function handleConsumed(message) {\n  assertMessageIdentity(message, "consumed");\n  if (!Number.isInteger(message.targetTick)) return;\n  const map = new Map();\n  let selfCanonical = null;\n  for (const player of message.players || []) {\n    if (!player.sessionId || !Number.isFinite(player.x) || !Number.isFinite(player.z)) continue;\n    const next = {\n      x: player.x,\n      z: player.z,\n      jump: Boolean(player.jump),\n      jumpApplied: Boolean(player.jumpApplied),\n      fresh: Boolean(player.fresh),\n      source: player.source,\n      missingStreak: player.missingStreak,\n    };\n    map.set(player.sessionId, next);\n    if (player.sessionId === selfSessionId) selfCanonical = next;\n    if (player.source === "lease_expired") metrics.leaseExpiredSeen += 1;\n  }\n  consumedByTick.set(message.targetTick, map);\n  if (selfCanonical) {\n    noteCanonicalJumpDelivery(message.targetTick, selfCanonical.jump, selfCanonical.jumpApplied);\n  }\n  maybeCorrect([message.targetTick], "authority-consumed");\n}',
  "canonical jump delivery acknowledgement",
);
client = replaceOnce(
  client,
  '  protocolStartTick = message.protocolStartTick;\n  buildArenaVisual(contract);',
  '  protocolStartTick = message.protocolStartTick;\n  // Fresh epochs start with authority previousJumpIntent=false, so a new physical\n  // edge is immediately legal. Resumes deliberately do not use this fresh arm.\n  resetJumpDeliveryForFreshRun();\n  buildArenaVisual(contract);',
  "fresh run jump arm",
);
client = replaceOnce(
  client,
  '    inputScheduler: {\n      revision: "shared-yard-v0-logical-input-scheduler-v2-authority-floor",\n      active: logicalInputTimer !== null,\n      pumps: logicalInputPumps,\n      authored: logicalInputAuthored,\n      superseded: logicalInputSuperseded,\n      cadenceMs: STEP_MS,\n      inputLeadTicks: simulation?.timing?.predictionLeadTicks ?? null,\n      simulationLeadTicks: simulation?.timing?.clientSimulationLeadTicks ?? null,\n      ownsCanonicalAuthorship: true,\n    },',
  '    inputScheduler: {\n      revision: "shared-yard-v0-logical-input-scheduler-v3-jump-delivery-persistence",\n      active: logicalInputTimer !== null,\n      pumps: logicalInputPumps,\n      authored: logicalInputAuthored,\n      superseded: logicalInputSuperseded,\n      cadenceMs: STEP_MS,\n      inputLeadTicks: simulation?.timing?.predictionLeadTicks ?? null,\n      simulationLeadTicks: simulation?.timing?.clientSimulationLeadTicks ?? null,\n      ownsCanonicalAuthorship: true,\n      jumpDelivery: { ...jumpDelivery },\n    },',
  "jump delivery evidence",
);
client = replaceOnce(
  client,
  'function neutralizeTransientInputs() {\n  keys.clear();\n  jumpQueued = false;\n  jumpKeyHeld = false;',
  'function neutralizeTransientInputs() {\n  keys.clear();\n  // A transport/focus boundary must not guess the authority raw jump edge. Cancel\n  // local pending delivery and stay disarmed until canonical jump=false is observed.\n  disarmJumpDelivery();\n  jumpKeyHeld = false;',
  "transient jump disarm",
);
if (client.includes("jumpQueued")) throw new Error("materializer left obsolete jumpQueued state");
if (client.includes("jumpWindowThrough")) throw new Error("materializer left obsolete fixed jump window scheduler");
if (client.includes("jumpIntentWindowTicks")) throw new Error("materializer left fixed jump window contract use in client");
write(CLIENT, client);

const contractUrl = `${pathToFileURL(resolve(CONTRACT)).href}?materialize=${Date.now()}`;
const { WORLD_V0_SIM_BUILD_ID } = await import(contractUrl);
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(WORLD_V0_SIM_BUILD_ID)) {
  throw new Error(`invalid materialized SimBuildId ${WORLD_V0_SIM_BUILD_ID}`);
}

let build = read(BUILD);
build = replaceOnce(
  build,
  'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v18-jump-intent-window";',
  'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v19-jump-delivery-persistence";',
  "browser UI revision",
);
build = replaceOnce(
  build,
  'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v9-jump-intent-window";',
  'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v10-jump-delivery-persistence";',
  "browser client sim revision",
);
build = replaceOnce(
  build,
  'export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v10-jump-intent-window";',
  'export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v11-jump-delivery-persistence";',
  "browser expected server revision",
);
build = replaceOnce(
  build,
  'export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-333a516c910eb659";',
  `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${WORLD_V0_SIM_BUILD_ID}";`,
  "browser expected SimBuild",
);
write(BUILD, build);

console.log("WORLD_V0_JUMP_RELIABILITY_R2_MATERIALIZED", JSON.stringify({
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  revisions: {
    contract: "shared-yard-v0-contract-v14-jump-delivery-persistence",
    authority: "shared-yard-v0-authority-v11-jump-delivery-persistence",
    client: "shared-yard-v0-browser-sim-v10-jump-delivery-persistence",
    ui: "shared-yard-v0-browser-ui-v19-jump-delivery-persistence",
  },
  files: [CONTRACT, CLIENT, BUILD],
}));
