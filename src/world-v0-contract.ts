export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v1";
export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v1";
export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v1";
export const WORLD_V0_SCENE_REVISION = "shared-yard-v0-seed-c-shared-consequence-v0";
export const WORLD_V0_STATE_GUARD_REVISION = "shared-yard-v0-f32-state-v1";
export const WORLD_V0_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v1";

export const WORLD_V0_BOX3D_RUNTIME = {
  package: "box3d.js@0.1.1",
  build: "inline-glue-precompiled-wasm-startup-init-single-threaded",
} as const;

export const WORLD_V0_TIMING = {
  simulationHz: 60,
  substeps: 4,
  snapshotHz: 10,
  protocolStartDelayTicks: 90,
  maxCatchupSteps: 4,
  predictionLeadTicks: 8,
  inputBatchSize: 2,
  maxFutureTicks: 32,
  inputLeaseMissingTicks: 36,
} as const;

export const WORLD_V0_CLIENT_HISTORY = {
  segmentTicks: 8,
  retainTicks: 24,
  recordingCapacityBytes: 2 * 1024 * 1024,
} as const;

export const WORLD_V0_MOVEMENT = {
  playerSpeed: 5.2,
  playerAcceleration: 28,
  playerDeceleration: 36,
} as const;

export const WORLD_V0_ARENA = {
  gravity: [0, -20, 0] as const,
  staticBoxes: [
    { id: "ground", position: [0, -0.5, 0] as const, halfExtents: [10, 0.5, 10] as const },
    { id: "wall-west", position: [-9.5, 1.5, 0] as const, halfExtents: [0.5, 2, 10] as const },
    { id: "wall-east", position: [9.5, 1.5, 0] as const, halfExtents: [0.5, 2, 10] as const },
    { id: "wall-north", position: [0, 1.5, -9.5] as const, halfExtents: [10, 2, 0.5] as const },
    { id: "wall-south", position: [0, 1.5, 9.5] as const, halfExtents: [10, 2, 0.5] as const },
  ],
} as const;

export const WORLD_V0_PROP_PHYSICS = {
  halfExtents: [0.46, 0.46, 0.46] as const,
  density: 22,
  linearDamping: 0.08,
  angularDamping: 0.12,
  friction: 0.72,
  restitution: 0.04,
} as const;

export const WORLD_V0_PLAYER_PHYSICS = {
  capsuleCenter1: [0, -0.45, 0] as const,
  capsuleCenter2: [0, 0.45, 0] as const,
  capsuleRadius: 0.35,
  density: 80,
  linearDamping: 0.3,
  angularDamping: 8,
  friction: 0.8,
  restitution: 0.02,
  angularLocks: [true, true, true] as const,
} as const;

export const WORLD_V0_PLAYER_STARTS = [
  [-6.5, 0.82, -1.4],
  [6.5, 0.82, 0],
] as const;

export const WORLD_V0_PROP_LAYOUT = [
  // Preserve the qualified central neutral landmark unchanged.
  { id: "prop-0", cluster: "barricade", position: [-0.96, 0.46, -0.48] as const },
  { id: "prop-1", cluster: "barricade", position: [0, 0.46, -0.48] as const },
  { id: "prop-2", cluster: "barricade", position: [0.96, 0.46, -0.48] as const },
  { id: "prop-3", cluster: "barricade", position: [-0.96, 0.46, 0.48] as const },
  { id: "prop-4", cluster: "barricade", position: [0, 0.46, 0.48] as const },
  { id: "prop-5", cluster: "barricade", position: [0.96, 0.46, 0.48] as const },

  // Preserve the qualified three-cube collapse tower unchanged.
  { id: "prop-6", cluster: "tower", position: [3.4, 0.46, -3.2] as const },
  { id: "prop-7", cluster: "tower", position: [3.4, 1.38, -3.2] as const },
  { id: "prop-8", cluster: "tower", position: [3.4, 2.3, -3.2] as const },

  // Shared Consequence V0: a six-cube near-touching impulse train. Existing
  // locomotion remains the only actuator; no action or protocol verb is added.
  { id: "prop-9", cluster: "impact-train", position: [-4.0, 0.46, 3.3] as const },
  { id: "prop-10", cluster: "impact-train", position: [-3.06, 0.46, 3.3] as const },
  { id: "prop-11", cluster: "impact-train", position: [-2.12, 0.46, 3.3] as const },
  { id: "prop-12", cluster: "impact-train", position: [-1.18, 0.46, 3.3] as const },
  { id: "prop-13", cluster: "impact-train", position: [-0.24, 0.46, 3.3] as const },
  { id: "prop-14", cluster: "impact-train", position: [0.7, 0.46, 3.3] as const },

  // A compact 2x4 breakwall sits 4 cm beyond the train's tail. The train axis
  // hits between the two middle wall columns, encouraging a visible split/cascade
  // rather than merely translating one more loose cube.
  { id: "prop-15", cluster: "breakwall", position: [1.66, 0.46, 1.89] as const },
  { id: "prop-16", cluster: "breakwall", position: [1.66, 0.46, 2.83] as const },
  { id: "prop-17", cluster: "breakwall", position: [1.66, 0.46, 3.77] as const },
  { id: "prop-18", cluster: "breakwall", position: [1.66, 0.46, 4.71] as const },
  { id: "prop-19", cluster: "breakwall", position: [1.66, 1.38, 1.89] as const },
  { id: "prop-20", cluster: "breakwall", position: [1.66, 1.38, 2.83] as const },
  { id: "prop-21", cluster: "breakwall", position: [1.66, 1.38, 3.77] as const },
  { id: "prop-22", cluster: "breakwall", position: [1.66, 1.38, 4.71] as const },
] as const;

export const WORLD_V0_NET_ENTITY_ORDER = [
  "actor:0",
  "actor:1",
  ...WORLD_V0_PROP_LAYOUT.map((prop) => prop.id),
] as const;

export const WORLD_V0_STATE_COMPONENTS = [
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z", "rotation.w",
  "linearVelocity.x", "linearVelocity.y", "linearVelocity.z",
  "angularVelocity.x", "angularVelocity.y", "angularVelocity.z",
] as const;

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export const WORLD_V0_SIM_BUILD_SPEC = {
  contractRevision: WORLD_V0_CONTRACT_REVISION,
  serverRevision: WORLD_V0_SERVER_REVISION,
  clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
  protocolRevision: WORLD_V0_PROTOCOL_REVISION,
  sceneRevision: WORLD_V0_SCENE_REVISION,
  stateGuardRevision: WORLD_V0_STATE_GUARD_REVISION,
  box3dRuntime: WORLD_V0_BOX3D_RUNTIME,
  timing: WORLD_V0_TIMING,
  clientHistory: WORLD_V0_CLIENT_HISTORY,
  movement: WORLD_V0_MOVEMENT,
  arena: WORLD_V0_ARENA,
  propPhysics: WORLD_V0_PROP_PHYSICS,
  playerPhysics: WORLD_V0_PLAYER_PHYSICS,
  playerStarts: WORLD_V0_PLAYER_STARTS,
  propLayout: WORLD_V0_PROP_LAYOUT,
  netEntityOrder: WORLD_V0_NET_ENTITY_ORDER,
  stateComponents: WORLD_V0_STATE_COMPONENTS,
} as const;

export const WORLD_V0_SIM_BUILD_ID = `shared-yard-v0-sim-${fnv1a64(JSON.stringify(WORLD_V0_SIM_BUILD_SPEC))}`;

export function worldV0SimulationContract() {
  return {
    contractRevision: WORLD_V0_CONTRACT_REVISION,
    clientSimRevision: WORLD_V0_CLIENT_SIM_REVISION,
    protocolRevision: WORLD_V0_PROTOCOL_REVISION,
    sceneRevision: WORLD_V0_SCENE_REVISION,
    stateGuardRevision: WORLD_V0_STATE_GUARD_REVISION,
    simBuildId: WORLD_V0_SIM_BUILD_ID,
    box3dRuntime: { ...WORLD_V0_BOX3D_RUNTIME },
    timing: { ...WORLD_V0_TIMING },
    clientHistory: { ...WORLD_V0_CLIENT_HISTORY },
    movement: { ...WORLD_V0_MOVEMENT },
    arena: {
      gravity: [...WORLD_V0_ARENA.gravity],
      staticBoxes: WORLD_V0_ARENA.staticBoxes.map((box) => ({
        id: box.id,
        position: [...box.position],
        halfExtents: [...box.halfExtents],
      })),
    },
    propPhysics: {
      ...WORLD_V0_PROP_PHYSICS,
      halfExtents: [...WORLD_V0_PROP_PHYSICS.halfExtents],
    },
    playerPhysics: {
      ...WORLD_V0_PLAYER_PHYSICS,
      capsuleCenter1: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter1],
      capsuleCenter2: [...WORLD_V0_PLAYER_PHYSICS.capsuleCenter2],
      angularLocks: [...WORLD_V0_PLAYER_PHYSICS.angularLocks],
    },
    netEntityOrder: [...WORLD_V0_NET_ENTITY_ORDER],
    stateComponents: [...WORLD_V0_STATE_COMPONENTS],
  };
}
