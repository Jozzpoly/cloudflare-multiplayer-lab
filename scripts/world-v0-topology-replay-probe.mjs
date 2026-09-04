import Box3D from "box3d.js/inline";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const b3 = await Box3D();
const required = [
  "b3CreateRecording", "b3DestroyRecording", "b3World_StartRecording", "b3World_StopRecording",
  "b3RecPlayer_CreateFromRecording", "b3RecPlayer_Destroy", "b3RecPlayer_GetFrameCount",
  "b3RecPlayer_SeekFrame", "b3RecPlayer_GetFrame", "b3RecPlayer_GetWorldId",
  "b3RecPlayer_GetBodyCount", "b3RecPlayer_GetBodyId", "b3RecPlayer_HasDiverged",
  "b3RecPlayer_GetDivergeFrame", "b3Body_SetName", "b3Body_GetName", "b3Body_IsValid",
  "b3CreateBody", "b3DestroyBody", "b3CreateBoxShape",
];
const missing = required.filter((name) => typeof b3[name] !== "function");
assert(missing.length === 0, `topology probe missing Box3D APIs: ${missing.join(",")}`);

function addGround(world) {
  const def = b3.b3DefaultBodyDef();
  def.position = [0, -0.5, 0];
  const body = b3.b3CreateBody(world, def);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), 8, 0.5, 8);
}

function addNamedBox(world, name, position) {
  const def = b3.b3DefaultBodyDef();
  def.type = b3.b3BodyType.b3_dynamicBody;
  def.position = [...position];
  const body = b3.b3CreateBody(world, def);
  b3.b3Body_SetName(body, name);
  const shape = b3.b3DefaultShapeDef();
  shape.density = 12;
  shape.baseMaterial.friction = 0.65;
  b3.b3CreateBoxShape(body, shape, 0.35, 0.35, 0.35);
  return body;
}

function namedBodiesInPlayer(player) {
  const names = [];
  const count = b3.b3RecPlayer_GetBodyCount(player);
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const body = b3.b3RecPlayer_GetBodyId(player, ordinal);
    if (!b3.b3Body_IsValid(body)) continue;
    const name = b3.b3Body_GetName(body);
    if (name) names.push(name);
  }
  names.sort();
  return names;
}

function sameNames(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

const worldDef = b3.b3DefaultWorldDef();
worldDef.gravity = [0, -12, 0];
const world = b3.b3CreateWorld(worldDef);
addGround(world);
let base = addNamedBox(world, "topo-base", [-1.2, 0.4, 0]);
let spawnedA = null;
let spawnedB = null;
const recording = b3.b3CreateRecording(2 * 1024 * 1024);

const livePhases = [];
try {
  b3.b3World_StartRecording(world, recording);
  for (let tick = 0; tick < 12; tick += 1) {
    if (tick === 3) {
      spawnedA = addNamedBox(world, "topo-spawn-a", [0, 1.2, 0]);
      spawnedB = addNamedBox(world, "topo-spawn-b", [1.1, 1.6, 0]);
      livePhases.push({ tick, event: "spawn", names: ["topo-base", "topo-spawn-a", "topo-spawn-b"] });
    }
    if (tick === 7) {
      b3.b3DestroyBody(spawnedA);
      spawnedA = null;
      livePhases.push({ tick, event: "destroy-a", names: ["topo-base", "topo-spawn-b"] });
    }
    if (tick === 9) {
      const replacement = addNamedBox(world, "topo-replacement", [-0.2, 2.0, 0.6]);
      livePhases.push({ tick, event: "replacement", names: ["topo-base", "topo-spawn-b", "topo-replacement"] });
      void replacement;
    }
    b3.b3World_Step(world, 1 / 60, 4);
  }
  b3.b3World_StopRecording(world);

  const player = b3.b3RecPlayer_CreateFromRecording(recording, 0);
  assert(player, "topology probe could not create RecPlayer");
  try {
    const frameCount = b3.b3RecPlayer_GetFrameCount(player);
    assert(frameCount >= 12, `unexpected replay frame count ${frameCount}`);
    const frames = [];
    let firstBaseOnly = null;
    let firstSpawned = null;
    let firstDestroyed = null;
    let firstReplacement = null;

    for (let frame = 0; frame < frameCount; frame += 1) {
      b3.b3RecPlayer_SeekFrame(player, frame);
      assert(b3.b3RecPlayer_GetFrame(player) === frame, `topology replay seek mismatch at frame ${frame}`);
      assert(!b3.b3RecPlayer_HasDiverged(player), `topology replay diverged at frame ${b3.b3RecPlayer_GetDivergeFrame(player)}`);
      const names = namedBodiesInPlayer(player);
      frames.push({ frame, names });
      if (firstBaseOnly === null && sameNames(names, ["topo-base"])) firstBaseOnly = frame;
      if (firstSpawned === null && sameNames(names, ["topo-base", "topo-spawn-a", "topo-spawn-b"])) firstSpawned = frame;
      if (firstDestroyed === null && sameNames(names, ["topo-base", "topo-spawn-b"])) firstDestroyed = frame;
      if (firstReplacement === null && sameNames(names, ["topo-base", "topo-spawn-b", "topo-replacement"])) firstReplacement = frame;
    }

    assert(firstBaseOnly !== null, "replay never exposed initial topology");
    assert(firstSpawned !== null, "replay never exposed spawned topology");
    assert(firstDestroyed !== null, "replay never exposed destroy topology");
    assert(firstReplacement !== null, "replay never exposed replacement topology");
    assert(firstBaseOnly < firstSpawned, `spawn topology ordering invalid ${firstBaseOnly} !< ${firstSpawned}`);
    assert(firstSpawned < firstDestroyed, `destroy topology ordering invalid ${firstSpawned} !< ${firstDestroyed}`);
    assert(firstDestroyed < firstReplacement, `replacement topology ordering invalid ${firstDestroyed} !< ${firstReplacement}`);

    const evidence = {
      verdict: "WORLD_V0_TOPOLOGY_REPLAY_PROBE_PASS",
      box3d: "box3d.js@0.1.1",
      frameCount,
      livePhases,
      replayPhaseFrames: { firstBaseOnly, firstSpawned, firstDestroyed, firstReplacement },
      finalNames: frames.at(-1)?.names || [],
      frames,
    };
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    b3.b3RecPlayer_Destroy(player);
  }
} finally {
  try { b3.b3DestroyRecording(recording); } catch { /* teardown */ }
  try { b3.b3DestroyWorld(world); } catch { /* teardown */ }
}
