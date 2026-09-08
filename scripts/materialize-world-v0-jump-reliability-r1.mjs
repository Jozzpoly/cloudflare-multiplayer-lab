import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "src/world-v0-contract.ts";
const AUTHORITY = "src/world-v0-shared-yard.ts";
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
  'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v12-prestart-live-start-gate";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v9-prestart-live-start-gate";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v8-playability-split-lead";',
  'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v13-jump-intent-window";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v10-jump-intent-window";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v9-jump-intent-window";',
  "contract revisions",
);
contract = replaceOnce(
  contract,
  '  predictionLeadTicks: 8,\n  // Playability: simulation speculation is separated from canonical input authorship.',
  '  predictionLeadTicks: 8,\n  // A discrete jump press is authored as a short contiguous intent window. The\n  // authority/client simulation applies the physical impulse only on a rising edge,\n  // so losing one near-frontier tick does not erase the action and later true ticks\n  // cannot repeatedly boost the same jump. This is transport durability, not coyote time.\n  jumpIntentWindowTicks: 6,\n  // Playability: simulation speculation is separated from canonical input authorship.',
  "jump intent window contract",
);
write(CONTRACT, contract);

let authority = read(AUTHORITY);
authority = replaceOnce(
  authority,
  '  socket: WebSocket | null;\n  resumeCount: number;\n};',
  '  socket: WebSocket | null;\n  resumeCount: number;\n  // Raw canonical jump intent from the previous authority tick. Physical jump is\n  // edge-triggered so a multi-tick transport-durable intent window yields one impulse.\n  previousJumpIntent: boolean;\n};',
  "authority player jump edge state",
);
authority = replaceOnce(
  authority,
  '        socket: null,\n        resumeCount: 0,\n      };',
  '        socket: null,\n        resumeCount: 0,\n        previousJumpIntent: false,\n      };',
  "authority player jump edge init",
);
authority = replaceOnce(
  authority,
  '    } & WorldV0ConsumedInput> = [];\n\n    for (const player of this.sortedPlayers()) {\n      const input = active\n        ? player.input.consume(targetTick)\n        : { targetTick, x: 0, z: 0, fresh: false, source: "held" as const, missingStreak: 0 };\n      this.applyIntent(player.body, input.x, input.z, Boolean(input.jump));\n      consumed.push({\n        sessionId: player.sessionId,\n        playerId: player.playerId,\n        netEntityId: player.netEntityId,\n        slot: player.slot,\n        ...input,\n      });\n    }',
  '    } & WorldV0ConsumedInput & { jumpApplied: boolean }> = [];\n\n    for (const player of this.sortedPlayers()) {\n      const input = active\n        ? player.input.consume(targetTick)\n        : { targetTick, x: 0, z: 0, jump: false, fresh: false, source: "held" as const, missingStreak: 0 };\n      const jumpIntent = Boolean(input.jump);\n      const jumpTrigger = active && jumpIntent && !player.previousJumpIntent;\n      player.previousJumpIntent = active ? jumpIntent : false;\n      const jumpApplied = this.applyIntent(player.body, input.x, input.z, jumpTrigger);\n      consumed.push({\n        sessionId: player.sessionId,\n        playerId: player.playerId,\n        netEntityId: player.netEntityId,\n        slot: player.slot,\n        ...input,\n        jumpApplied,\n      });\n    }',
  "authority rising-edge consume",
);
authority = replaceOnce(
  authority,
  '  private applyIntent(body: BodyId, inputX: number, inputZ: number, jump: boolean): void {\n    const velocity = bodyLinearVelocity(body);\n    const hasInput = Math.hypot(inputX, inputZ) > 0.01;\n    const [nextX, nextZ] = moveToward2(\n      velocity[0],\n      velocity[2],\n      inputX * WORLD_V0_MOVEMENT.playerSpeed,\n      inputZ * WORLD_V0_MOVEMENT.playerSpeed,\n      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /\n        WORLD_V0_TIMING.simulationHz,\n    );\n    const nextY = jump && this.hasJumpSupport(body)\n      ? Math.max(velocity[1], WORLD_V0_MOVEMENT.jumpSpeed)\n      : velocity[1];\n    b3.b3Body_SetLinearVelocity(body, [nextX, nextY, nextZ]);\n  }',
  '  private applyIntent(body: BodyId, inputX: number, inputZ: number, jump: boolean): boolean {\n    const velocity = bodyLinearVelocity(body);\n    const hasInput = Math.hypot(inputX, inputZ) > 0.01;\n    const [nextX, nextZ] = moveToward2(\n      velocity[0],\n      velocity[2],\n      inputX * WORLD_V0_MOVEMENT.playerSpeed,\n      inputZ * WORLD_V0_MOVEMENT.playerSpeed,\n      (hasInput ? WORLD_V0_MOVEMENT.playerAcceleration : WORLD_V0_MOVEMENT.playerDeceleration) /\n        WORLD_V0_TIMING.simulationHz,\n    );\n    const jumpApplied = jump && this.hasJumpSupport(body);\n    const nextY = jumpApplied\n      ? Math.max(velocity[1], WORLD_V0_MOVEMENT.jumpSpeed)\n      : velocity[1];\n    b3.b3Body_SetLinearVelocity(body, [nextX, nextY, nextZ]);\n    return jumpApplied;\n  }',
  "authority jump applied telemetry",
);
write(AUTHORITY, authority);

let client = read(CLIENT);
client = replaceOnce(
  client,
  '  const previous = previousUsedInput(tick);\n  const resolved = resolveInputsForTick(tick, previous);\n  usedByTick.set(tick, { self: { ...resolved.self }, remote: { ...resolved.remote } });\n  const selfBody = sim.actorBodies.get(selfSessionId);\n  const remoteBody = sim.actorBodies.get(remoteSessionId);\n  if (!selfBody || !remoteBody) throw new Error("predicted actor mapping incomplete");\n  applyIntent(selfBody, resolved.self);\n  applyIntent(remoteBody, resolved.remote);',
  '  const previous = previousUsedInput(tick);\n  const resolved = resolveInputsForTick(tick, previous);\n  // Keep the raw multi-tick jump intent in usedByTick, but turn it into one physical\n  // impulse at simulation time. Replay/correction reconstructs the same rising edge.\n  const selfJumpTrigger = Boolean(resolved.self.jump) && !Boolean(previous.self.jump);\n  const remoteJumpTrigger = Boolean(resolved.remote.jump) && !Boolean(previous.remote.jump);\n  usedByTick.set(tick, { self: { ...resolved.self }, remote: { ...resolved.remote } });\n  const selfBody = sim.actorBodies.get(selfSessionId);\n  const remoteBody = sim.actorBodies.get(remoteSessionId);\n  if (!selfBody || !remoteBody) throw new Error("predicted actor mapping incomplete");\n  applyIntent(selfBody, { ...resolved.self, jump: selfJumpTrigger });\n  applyIntent(remoteBody, { ...resolved.remote, jump: remoteJumpTrigger });',
  "client rising-edge simulation",
);
client = replaceOnce(
  client,
  '  const movement = currentInput();\n  const jumpTarget = jumpQueued ? startTick : null;\n  if (jumpTarget !== null) jumpQueued = false;\n  const revisions = [];',
  '  const movement = currentInput();\n  const jumpWindowThrough = jumpQueued\n    ? Math.min(authoredThrough, startTick + simulation.timing.jumpIntentWindowTicks - 1)\n    : null;\n  if (jumpWindowThrough !== null) jumpQueued = false;\n  const revisions = [];',
  "client jump window header",
);
client = replaceOnce(
  client,
  '      const next = { x: movement.x, z: movement.z, jump: tick === jumpTarget };',
  '      const next = { x: movement.x, z: movement.z, jump: jumpWindowThrough !== null && tick <= jumpWindowThrough };',
  "client new jump window records",
);
client = replaceOnce(
  client,
  '      // Movement/camera revisions must not erase an already-authored one-shot jump.\n      jump: Boolean(existing.jump || tick === jumpTarget),',
  '      // Movement/camera revisions must not erase an already-authored jump-intent window.\n      jump: Boolean(existing.jump || (jumpWindowThrough !== null && tick <= jumpWindowThrough)),',
  "client revised jump window records",
);
if (client.includes("jumpTarget")) throw new Error("materializer left obsolete jumpTarget reference");
write(CLIENT, client);

const contractUrl = `${pathToFileURL(resolve(CONTRACT)).href}?materialize=${Date.now()}`;
const { WORLD_V0_SIM_BUILD_ID } = await import(contractUrl);
if (!/^shared-yard-v0-sim-[0-9a-f]{16}$/.test(WORLD_V0_SIM_BUILD_ID)) {
  throw new Error(`invalid materialized SimBuildId ${WORLD_V0_SIM_BUILD_ID}`);
}

let build = read(BUILD);
build = replaceOnce(
  build,
  'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v17-slot-bound-session-continuity";',
  'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v18-jump-intent-window";',
  "browser UI revision",
);
build = replaceOnce(
  build,
  'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v8-playability-split-lead";',
  'export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v9-jump-intent-window";',
  "browser client sim revision",
);
build = replaceOnce(
  build,
  'export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v9-prestart-live-start-gate";',
  'export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v10-jump-intent-window";',
  "browser expected server revision",
);
build = replaceOnce(
  build,
  'export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-69ad9c7d0430a929";',
  `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${WORLD_V0_SIM_BUILD_ID}";`,
  "browser expected SimBuild",
);
write(BUILD, build);

console.log("WORLD_V0_JUMP_RELIABILITY_R1_MATERIALIZED", JSON.stringify({
  simBuildId: WORLD_V0_SIM_BUILD_ID,
  jumpIntentWindowTicks: 6,
  files: [CONTRACT, AUTHORITY, CLIENT, BUILD],
}));
