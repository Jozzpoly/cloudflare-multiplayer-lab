import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-history-f2-rolling-seed-v2";
const OUTPUT = process.env.WS0_HISTORY_F2_ROLLING_OUTPUT || "ws0-history-f2-rolling-seed.json";
const DT = 1 / 60;
const SUBSTEPS = 4;
const PRE_FRAMES = 70;
const SEGMENT_FRAMES = [64, 32];
const EPS = 1e-6;

function createWorld() {
  const wd = b3.b3DefaultWorldDef();
  wd.gravity = [0, -10, 0];
  const world = b3.b3CreateWorld(wd);
  const bodies = [];

  const groundDef = b3.b3DefaultBodyDef();
  groundDef.position = [0, -0.5, 0];
  const ground = b3.b3CreateBody(world, groundDef);
  b3.b3CreateBoxShape(ground, b3.b3DefaultShapeDef(), 8, 0.5, 8);
  bodies.push(ground);

  for (let i = 0; i < 10; i++) {
    const def = b3.b3DefaultBodyDef();
    def.type = b3.b3BodyType.b3_dynamicBody;
    def.position = [0, 0.5 + i * 1.005, 0];
    const body = b3.b3CreateBody(world, def);
    const shape = b3.b3DefaultShapeDef();
    shape.density = 18;
    shape.baseMaterial.friction = 0.8;
    shape.baseMaterial.restitution = 0;
    b3.b3CreateBoxShape(body, shape, 0.5, 0.5, 0.5);
    if (i >= 8) b3.b3Body_SetLinearVelocity(body, [2.2, 0, 0]);
    bodies.push(body);
  }

  return { world, bodies };
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

function captureBodies(bodies) {
  return bodies.map((body) => bodyState(body));
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

function totalBodyContactRecords(bodies) {
  if (
    typeof b3.createContactsBuffer !== "function" ||
    typeof b3.getBodyContactData !== "function" ||
    typeof b3.getNumContacts !== "function"
  ) {
    throw new Error("box3d.js contact facade is unavailable");
  }
  const buffer = b3.createContactsBuffer();
  try {
    let total = 0;
    for (const body of bodies) {
      b3.getBodyContactData(buffer, body);
      total += b3.getNumContacts(buffer);
    }
    return total;
  } finally {
    b3.destroyContactsBuffer(buffer);
  }
}

function recordSegment(world, bodies, frameCount, index) {
  const seedState = captureBodies(bodies);
  const contactsAtSeed = totalBodyContactRecords(bodies);
  const recording = b3.b3CreateRecording(2 * 1024 * 1024);
  b3.b3World_StartRecording(world, recording);
  const seedBytes = b3.b3Recording_GetSize(recording);
  const byteSamples = [{ frame: 0, bytes: seedBytes }];

  for (let frame = 1; frame <= frameCount; frame++) {
    b3.b3World_Step(world, DT, SUBSTEPS);
    if ([1, 8, 16, 32, 64].includes(frame) || frame === frameCount) {
      byteSamples.push({ frame, bytes: b3.b3Recording_GetSize(recording) });
    }
  }

  const liveEndState = captureBodies(bodies);
  const contactsAtEnd = totalBodyContactRecords(bodies);
  b3.b3World_StopRecording(world);
  const finalBytes = b3.b3Recording_GetSize(recording);

  const player = b3.b3RecPlayer_CreateFromRecording(recording, 0);
  if (!player) throw new Error(`segment ${index}: replay player creation failed`);
  try {
    const replaySeedState = capturePlayerBodies(player);
    const seedDelta = maxStateDelta(seedState, replaySeedState);
    if (!(seedDelta <= EPS)) throw new Error(`segment ${index}: seed restore delta ${seedDelta}`);

    const replayFrames = b3.b3RecPlayer_GetFrameCount(player);
    if (replayFrames < frameCount) throw new Error(`segment ${index}: frame count ${replayFrames} < ${frameCount}`);
    for (let frame = 0; frame < frameCount; frame++) {
      if (!b3.b3RecPlayer_StepFrame(player)) throw new Error(`segment ${index}: replay ended at ${frame}`);
    }
    if (b3.b3RecPlayer_HasDiverged(player)) {
      throw new Error(`segment ${index}: replay diverged at ${b3.b3RecPlayer_GetDivergeFrame(player)}`);
    }
    const replayEndState = capturePlayerBodies(player);
    const endDelta = maxStateDelta(liveEndState, replayEndState);
    if (!(endDelta <= EPS)) throw new Error(`segment ${index}: end replay delta ${endDelta}`);

    return {
      index,
      frames: frameCount,
      contactsAtSeed,
      contactsAtEnd,
      seedBytes,
      finalBytes,
      streamBytesAfterSeed: finalBytes - seedBytes,
      bytesPerRecordedFrame: (finalBytes - seedBytes) / frameCount,
      byteSamples,
      replayFrameCount: replayFrames,
      seedStateDelta: seedDelta,
      endStateDelta: endDelta,
      diverged: false,
    };
  } finally {
    b3.b3RecPlayer_Destroy(player);
    b3.b3DestroyRecording(recording);
  }
}

const { world, bodies } = createWorld();
try {
  for (let i = 0; i < PRE_FRAMES; i++) b3.b3World_Step(world, DT, SUBSTEPS);
  const preContacts = totalBodyContactRecords(bodies);
  if (preContacts <= 0) throw new Error("precondition failed: no active body-contact records at first rolling seed");

  const segments = SEGMENT_FRAMES.map((frames, index) => recordSegment(world, bodies, frames, index));
  if (segments[0].contactsAtSeed <= 0) throw new Error("first segment was not seeded during active contacts");

  const evidence = {
    revision: REVISION,
    generatedAt: new Date().toISOString(),
    packageContract: "box3d.js@0.1.1 imported through box3d.js/inline",
    box3dVersion: b3.b3GetVersion(),
    design: {
      preFrames: PRE_FRAMES,
      segmentFrames: SEGMENT_FRAMES,
      simulationHz: 60,
      substeps: SUBSTEPS,
      bodyCount: bodies.length,
      contactMetric:
        "Sum of getBodyContactData/getNumContacts records across bodies. A pair may be counted twice; only >0 is used as the active-contact precondition.",
      boundary:
        "Tests repeated recording rotation on one live world, with the first seed explicitly captured while body contact records are present. It does not yet integrate late-input event replay or production ownership transfer.",
    },
    preContacts,
    segments,
  };

  console.log(`${REVISION} · Box3D ${JSON.stringify(evidence.box3dVersion)}`);
  console.log(`pre-seed body-contact records=${preContacts}`);
  for (const segment of segments) {
    console.log(
      `segment ${segment.index}: frames=${segment.frames} contacts=${segment.contactsAtSeed}->${segment.contactsAtEnd} ` +
      `seed=${segment.seedBytes}B final=${segment.finalBytes}B stream/frame=${segment.bytesPerRecordedFrame.toFixed(2)}B ` +
      `seedDelta=${segment.seedStateDelta} endDelta=${segment.endStateDelta}`,
    );
  }
  writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
  console.log(`F2 ROLLING-SEED PROBE COMPLETE · evidence written to ${OUTPUT}`);
} finally {
  b3.b3DestroyWorld(world);
}
