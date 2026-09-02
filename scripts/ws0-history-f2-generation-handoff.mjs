import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-history-f2-generation-handoff-v1";
const OUTPUT = process.env.WS0_HISTORY_F2_HANDOFF_OUTPUT || "ws0-history-f2-generation-handoff.json";
const DT = 1 / 60;
const SUBSTEPS = 4;
const INITIAL_RECORD_FRAMES = 96;
const BRANCH_FRAME = 48;
const BRANCH_LIVE_FRAMES = 24;
const NEXT_SEGMENT_FRAMES = 32;
const POST_DESTROY_FRAMES = 12;
const EPS = 1e-6;

function createWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -10, 0];
  const world = b3.b3CreateWorld(wd);

  const groundDef = b3.b3DefaultBodyDef();
  groundDef.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, groundDef);
  b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 8, 0.5, 8);

  for (let i = 0; i < 8; i++) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [0, 0.5 + i * 1.01, 0];
    const body = b3.b3CreateBody(world, def);
    const shape = b3.b3DefaultShapeDef();
    shape.density = 16;
    shape.baseMaterial.friction = 0.75;
    shape.baseMaterial.restitution = 0.01;
    b3.b3CreateBoxShape(body, shape, 0.5, 0.5, 0.5);
    if (i >= 6) b3.b3Body_SetLinearVelocity(body, [2.8, 0, 0]);
  }

  return world;
}

function vec3(body, getter) {
  const out = [0, 0, 0];
  getter(out, body);
  return out;
}

function bodyState(body) {
  return {
    p: vec3(body, b3.b3Body_GetPosition),
    v: vec3(body, b3.b3Body_GetLinearVelocity),
    w: vec3(body, b3.b3Body_GetAngularVelocity),
  };
}

function capturePlayerBodies(player) {
  const count = b3.b3RecPlayer_GetBodyCount(player);
  const states = [];
  for (let i = 0; i < count; i++) states.push(bodyState(b3.b3RecPlayer_GetBodyId(player, i)));
  return states;
}

function maxStateDelta(a, b) {
  if (a.length !== b.length) return Infinity;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    for (const key of ["p", "v", "w"]) {
      for (let axis = 0; axis < 3; axis++) {
        max = Math.max(max, Math.abs(a[i][key][axis] - b[i][key][axis]));
      }
    }
  }
  return max;
}

let originalWorld = 0;
let firstRecording = 0;
let firstPlayer = 0;
let secondRecording = 0;
let secondPlayer = 0;

try {
  originalWorld = createWorld();
  firstRecording = b3.b3CreateRecording(2 * 1024 * 1024);
  b3.b3World_StartRecording(originalWorld, firstRecording);
  for (let i = 0; i < INITIAL_RECORD_FRAMES; i++) b3.b3World_Step(originalWorld, DT, SUBSTEPS);
  b3.b3World_StopRecording(originalWorld);
  const firstRecordingBytes = b3.b3Recording_GetSize(firstRecording);

  firstPlayer = b3.b3RecPlayer_CreateFromRecording(firstRecording, 0);
  if (!firstPlayer) throw new Error("first replay player creation failed");
  b3.b3DestroyRecording(firstRecording);
  firstRecording = 0;
  b3.b3DestroyWorld(originalWorld);
  originalWorld = 0;

  b3.b3RecPlayer_SeekFrame(firstPlayer, BRANCH_FRAME);
  if (b3.b3RecPlayer_GetFrame(firstPlayer) !== BRANCH_FRAME) throw new Error("first branch seek failed");
  if (b3.b3RecPlayer_HasDiverged(firstPlayer)) throw new Error("first player diverged before branching");

  const firstWorld = b3.b3RecPlayer_GetWorldId(firstPlayer);
  const firstBodyCount = b3.b3RecPlayer_GetBodyCount(firstPlayer);
  const branchBody = b3.b3RecPlayer_GetBodyId(firstPlayer, firstBodyCount - 1);
  b3.b3Body_SetLinearVelocity(branchBody, [7.5, 2.0, -1.25]);
  for (let i = 0; i < BRANCH_LIVE_FRAMES; i++) b3.b3World_Step(firstWorld, DT, SUBSTEPS);

  const handoffSeedState = capturePlayerBodies(firstPlayer);
  secondRecording = b3.b3CreateRecording(2 * 1024 * 1024);
  b3.b3World_StartRecording(firstWorld, secondRecording);
  const secondSeedBytes = b3.b3Recording_GetSize(secondRecording);
  for (let i = 0; i < NEXT_SEGMENT_FRAMES; i++) b3.b3World_Step(firstWorld, DT, SUBSTEPS);
  const firstGenerationEndState = capturePlayerBodies(firstPlayer);
  b3.b3World_StopRecording(firstWorld);
  const secondRecordingBytes = b3.b3Recording_GetSize(secondRecording);

  secondPlayer = b3.b3RecPlayer_CreateFromRecording(secondRecording, 0);
  if (!secondPlayer) throw new Error("second replay player creation failed");
  const secondSeedState = capturePlayerBodies(secondPlayer);
  const seedTransferDelta = maxStateDelta(handoffSeedState, secondSeedState);
  if (!(seedTransferDelta <= EPS)) throw new Error(`generation seed transfer delta ${seedTransferDelta}`);

  for (let i = 0; i < NEXT_SEGMENT_FRAMES; i++) {
    if (!b3.b3RecPlayer_StepFrame(secondPlayer)) throw new Error(`second replay ended at ${i}`);
  }
  if (b3.b3RecPlayer_HasDiverged(secondPlayer)) {
    throw new Error(`second replay diverged at ${b3.b3RecPlayer_GetDivergeFrame(secondPlayer)}`);
  }
  const secondGenerationEndState = capturePlayerBodies(secondPlayer);
  const segmentTransferDelta = maxStateDelta(firstGenerationEndState, secondGenerationEndState);
  if (!(segmentTransferDelta <= EPS)) throw new Error(`generation segment transfer delta ${segmentTransferDelta}`);

  // The new player owns an independent copied world/recording image. Destroy the old generation
  // and the recording object that produced the new generation, then prove the new world stays live.
  b3.b3RecPlayer_Destroy(firstPlayer);
  firstPlayer = 0;
  b3.b3DestroyRecording(secondRecording);
  secondRecording = 0;

  const secondWorld = b3.b3RecPlayer_GetWorldId(secondPlayer);
  const beforePostDestroy = capturePlayerBodies(secondPlayer);
  for (let i = 0; i < POST_DESTROY_FRAMES; i++) b3.b3World_Step(secondWorld, DT, SUBSTEPS);
  const afterPostDestroy = capturePlayerBodies(secondPlayer);
  const postDestroyMotionDelta = maxStateDelta(beforePostDestroy, afterPostDestroy);
  if (!(postDestroyMotionDelta > 0)) throw new Error("second generation did not remain step-able after old-owner destruction");

  const evidence = {
    revision: REVISION,
    generatedAt: new Date().toISOString(),
    packageContract: "box3d.js@0.1.1 imported through box3d.js/inline",
    box3dVersion: b3.b3GetVersion(),
    design: {
      initialRecordFrames: INITIAL_RECORD_FRAMES,
      branchFrame: BRANCH_FRAME,
      branchLiveFrames: BRANCH_LIVE_FRAMES,
      nextSegmentFrames: NEXT_SEGMENT_FRAMES,
      postDestroyFrames: POST_DESTROY_FRAMES,
      simulationHz: 60,
      substeps: SUBSTEPS,
      ownershipModel:
        "A replay player owns its restored world. A corrected player-owned world starts a fresh recording; a new player is created from that recording before the old player is destroyed.",
      boundary:
        "This proves generational ownership handoff for a small deterministic scene. It does not yet implement application entity-id remapping, late-input history replay, or measure runtime CPU cost.",
    },
    firstRecordingBytes,
    secondSeedBytes,
    secondRecordingBytes,
    firstBodyCount,
    seedTransferDelta,
    segmentTransferDelta,
    postDestroyMotionDelta,
  };

  console.log(`${REVISION} · Box3D ${JSON.stringify(evidence.box3dVersion)}`);
  console.log(`first recording=${firstRecordingBytes}B · second seed=${secondSeedBytes}B · second recording=${secondRecordingBytes}B`);
  console.log(`generation seed transfer delta=${seedTransferDelta}`);
  console.log(`generation segment transfer delta=${segmentTransferDelta}`);
  console.log(`post-old-owner manual-step state delta=${postDestroyMotionDelta}`);
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(`F2 GENERATION-HANDOFF PROBE COMPLETE · evidence written to ${OUTPUT}`);
} finally {
  if (secondPlayer) b3.b3RecPlayer_Destroy(secondPlayer);
  if (secondRecording) b3.b3DestroyRecording(secondRecording);
  if (firstPlayer) b3.b3RecPlayer_Destroy(firstPlayer);
  if (firstRecording) b3.b3DestroyRecording(firstRecording);
  if (originalWorld) b3.b3DestroyWorld(originalWorld);
}
