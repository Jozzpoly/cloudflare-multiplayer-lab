import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-history-f2-replay-branchability-v1";
const OUTPUT = process.env.WS0_HISTORY_F2_BRANCH_OUTPUT || "ws0-history-f2-replay-branchability.json";
const DT = 1 / 60;
const SUBSTEPS = 4;
const RECORD_FRAMES = 240;
const WARM_FRAME = 160;
const BRANCH_FRAME = 80;
const CONTINUE_FRAMES = 40;
const EPS = 1e-6;

function createStaticBox(world, position, half) {
  const def = b3.b3DefaultBodyDef();
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), half[0], half[1], half[2]);
  return body;
}

function createRecordedContactRun() {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -10, 0];
  const world = b3.b3CreateWorld(worldDef);
  createStaticBox(world, [0, -0.5, 0], [8, 0.5, 8]);

  const dynamicBodies = [];
  for (let i = 0; i < 10; i++) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [0, 0.5 + i * 1.01, 0];
    const body = b3.b3CreateBody(world, def);
    const shape = b3.b3DefaultShapeDef();
    shape.density = 18;
    shape.baseMaterial.friction = 0.72;
    shape.baseMaterial.restitution = 0.01;
    b3.b3CreateBoxShape(body, shape, 0.5, 0.5, 0.5);
    if (i >= 7) b3.b3Body_SetLinearVelocity(body, [3.8, 0, 0]);
    dynamicBodies.push(body);
  }

  const recording = b3.b3CreateRecording(8 * 1024 * 1024);
  b3.b3World_StartRecording(world, recording);
  for (let frame = 0; frame < RECORD_FRAMES; frame++) {
    b3.b3World_Step(world, DT, SUBSTEPS);
  }
  b3.b3World_StopRecording(world);
  const recordingBytes = b3.b3Recording_GetSize(recording);
  b3.b3DestroyWorld(world);
  return { recording, recordingBytes };
}

function createPlayerAtBackwardSeek(recording) {
  const player = b3.b3RecPlayer_CreateFromRecording(recording, 0);
  if (!player) throw new Error("b3RecPlayer_CreateFromRecording returned null/0");
  const frameCount = b3.b3RecPlayer_GetFrameCount(player);
  if (frameCount < RECORD_FRAMES) throw new Error(`unexpected frameCount ${frameCount}`);
  b3.b3RecPlayer_SeekFrame(player, WARM_FRAME);
  if (b3.b3RecPlayer_GetFrame(player) !== WARM_FRAME) throw new Error("warm seek failed");
  b3.b3RecPlayer_SeekFrame(player, BRANCH_FRAME);
  if (b3.b3RecPlayer_GetFrame(player) !== BRANCH_FRAME) throw new Error("backward seek failed");
  if (b3.b3RecPlayer_HasDiverged(player)) throw new Error(`replay diverged during seek at ${b3.b3RecPlayer_GetDivergeFrame(player)}`);
  return player;
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
  for (let i = 0; i < count; i++) {
    const body = b3.b3RecPlayer_GetBodyId(player, i);
    if (!body || body.index1 === 0) {
      states.push(null);
      continue;
    }
    states.push(bodyState(body));
  }
  return states;
}

function maxStateDelta(a, b) {
  if (a.length !== b.length) return Infinity;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === null || b[i] === null) {
      if (a[i] !== b[i]) return Infinity;
      continue;
    }
    for (const key of ["p", "v", "w"]) {
      for (let axis = 0; axis < 3; axis++) {
        max = Math.max(max, Math.abs(a[i][key][axis] - b[i][key][axis]));
      }
    }
  }
  return max;
}

const { recording, recordingBytes } = createRecordedContactRun();
let replayPlayer = 0;
let manualPlayer = 0;
let branchPlayer = 0;

try {
  // Control A: continue from the backward-seek checkpoint through the recording player.
  replayPlayer = createPlayerAtBackwardSeek(recording);
  for (let i = 0; i < CONTINUE_FRAMES; i++) {
    if (!b3.b3RecPlayer_StepFrame(replayPlayer)) throw new Error(`replay ended at continuation ${i}`);
  }
  const replayState = capturePlayerBodies(replayPlayer);
  const replayDiverged = b3.b3RecPlayer_HasDiverged(replayPlayer);
  const replayDivergeFrame = b3.b3RecPlayer_GetDivergeFrame(replayPlayer);

  // Control B: take the player's restored world and advance it with ordinary Box3D stepping only.
  manualPlayer = createPlayerAtBackwardSeek(recording);
  const manualWorld = b3.b3RecPlayer_GetWorldId(manualPlayer);
  for (let i = 0; i < CONTINUE_FRAMES; i++) b3.b3World_Step(manualWorld, DT, SUBSTEPS);
  const manualState = capturePlayerBodies(manualPlayer);
  const continuationDelta = maxStateDelta(replayState, manualState);

  // Branch C: start from the same restored checkpoint, change one dynamic body, then continue manually.
  branchPlayer = createPlayerAtBackwardSeek(recording);
  const branchWorld = b3.b3RecPlayer_GetWorldId(branchPlayer);
  const bodyCount = b3.b3RecPlayer_GetBodyCount(branchPlayer);
  if (bodyCount < 2) throw new Error(`not enough replay bodies: ${bodyCount}`);
  const branchBody = b3.b3RecPlayer_GetBodyId(branchPlayer, bodyCount - 1);
  const preBranch = bodyState(branchBody);
  b3.b3Body_SetLinearVelocity(branchBody, [8, 2.5, -1.5]);
  for (let i = 0; i < CONTINUE_FRAMES; i++) b3.b3World_Step(branchWorld, DT, SUBSTEPS);
  const branchedState = capturePlayerBodies(branchPlayer);
  const branchDeltaFromControl = maxStateDelta(manualState, branchedState);
  const postBranch = bodyState(branchBody);

  if (replayDiverged) throw new Error(`control replay diverged at ${replayDivergeFrame}`);
  if (!(continuationDelta <= EPS)) {
    throw new Error(`manual continuation from replay checkpoint diverged from replay: ${continuationDelta}`);
  }
  if (!(branchDeltaFromControl > 0.05)) {
    throw new Error(`manual branch failed to produce a distinct trajectory: ${branchDeltaFromControl}`);
  }

  const evidence = {
    revision: REVISION,
    generatedAt: new Date().toISOString(),
    packageContract: "box3d.js@0.1.1 imported through box3d.js/inline",
    box3dVersion: b3.b3GetVersion(),
    design: {
      recordFrames: RECORD_FRAMES,
      warmFrame: WARM_FRAME,
      branchFrame: BRANCH_FRAME,
      continueFrames: CONTINUE_FRAMES,
      simulationHz: 60,
      substeps: SUBSTEPS,
      reasonForWarmThenBackwardSeek:
        "Exercise the replay player's backward-seek restoration path after keyframes have had an opportunity to populate.",
      boundary:
        "This proves branchability only for the player-owned restored world while the player remains alive. It does not expose snapshot bytes, quantify keyframe memory, or prove a production checkpoint lifecycle.",
    },
    recordingBytes,
    replay: {
      frame: b3.b3RecPlayer_GetFrame(replayPlayer),
      diverged: replayDiverged,
      divergeFrame: replayDivergeFrame,
    },
    manualContinuation: {
      maxStateDeltaVsReplay: continuationDelta,
      epsilon: EPS,
      exactWithinEpsilon: continuationDelta <= EPS,
    },
    manualBranch: {
      maxStateDeltaVsUnmodifiedControl: branchDeltaFromControl,
      branchBodyBefore: preBranch,
      branchBodyAfter: postBranch,
    },
  };

  console.log(`${REVISION} · Box3D ${JSON.stringify(evidence.box3dVersion)}`);
  console.log(`recording=${recordingBytes} bytes · backward seek ${WARM_FRAME} -> ${BRANCH_FRAME}`);
  console.log(`replay vs manual continuation max state delta=${continuationDelta}`);
  console.log(`branched vs unmodified control max state delta=${branchDeltaFromControl}`);
  console.log(`control replay diverged=${replayDiverged} frame=${replayDivergeFrame}`);
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(`F2 REPLAY BRANCHABILITY PROBE COMPLETE · evidence written to ${OUTPUT}`);
} finally {
  if (replayPlayer) b3.b3RecPlayer_Destroy(replayPlayer);
  if (manualPlayer) b3.b3RecPlayer_Destroy(manualPlayer);
  if (branchPlayer) b3.b3RecPlayer_Destroy(branchPlayer);
  b3.b3DestroyRecording(recording);
}
