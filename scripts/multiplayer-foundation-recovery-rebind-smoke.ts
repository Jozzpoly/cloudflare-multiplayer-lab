import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();

type WorldId = ReturnType<typeof b3.b3CreateWorld>;
type BodyId = ReturnType<typeof b3.b3CreateBody>;

type ManifestEntry = {
  semanticId: string;
  sourceCreationOrdinal: number;
  expectedActive: boolean;
};

function createWorld(): WorldId {
  const def = b3.b3DefaultWorldDef();
  def.gravity = [0, -10, 0];
  return b3.b3CreateWorld(def);
}

function createBox(world: WorldId, name: string, position: [number, number, number], dynamic: boolean): BodyId {
  const bodyDef = b3.b3DefaultBodyDef();
  if (dynamic) bodyDef.type = b3.b3BodyType.b3_dynamicBody;
  bodyDef.position = [...position];
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3Body_SetName(body, name);
  const shapeDef = b3.b3DefaultShapeDef();
  shapeDef.density = dynamic ? 1 : 0;
  b3.b3CreateBoxShape(body, shapeDef, 0.5, 0.5, 0.5);
  return body;
}

const sourceWorld = createWorld();
let nextSourceOrdinal = 0;
const manifest: ManifestEntry[] = [];

const createManifestBody = (
  semanticId: string,
  position: [number, number, number],
  dynamic: boolean,
): BodyId => {
  const sourceCreationOrdinal = nextSourceOrdinal;
  nextSourceOrdinal += 1;
  manifest.push({ semanticId, sourceCreationOrdinal, expectedActive: true });
  return createBox(sourceWorld, semanticId, position, dynamic);
};

const ground = createManifestBody("world:ground", [0, -0.5, 0], false);
const actor0 = createManifestBody("actor:0", [-1.5, 2.5, 0], true);
const prop0 = createManifestBody("prop:0", [0, 3.5, 0], true);
const actor1 = createManifestBody("actor:1", [1.5, 2.5, 0], true);

assert.equal(b3.b3Body_GetName(ground), "world:ground");
assert.equal(b3.b3Body_GetName(actor0), "actor:0");
assert.equal(b3.b3Body_GetName(prop0), "prop:0");
assert.equal(b3.b3Body_GetName(actor1), "actor:1");

for (let tick = 0; tick < 60; tick += 1) {
  b3.b3World_Step(sourceWorld, 1 / 60, 4);
}

b3.b3DestroyBody(actor1);
manifest.find((entry) => entry.semanticId === "actor:1")!.expectedActive = false;
assert.equal(b3.b3Body_IsValid(actor1), false, "retired source body must be invalid before checkpoint");

const actor2 = createManifestBody("actor:2", [1.5, 2.5, 1.5], true);
b3.b3Body_SetLinearVelocity(actor0, [1.25, 0, 0.35]);
b3.b3Body_SetLinearVelocity(actor2, [-0.75, 0, -0.2]);
for (let tick = 0; tick < 30; tick += 1) {
  b3.b3World_Step(sourceWorld, 1 / 60, 4);
}

const recording = b3.b3CreateRecording(0);
assert(recording, "recording allocation failed");
b3.b3World_StartRecording(sourceWorld, recording);
b3.b3World_StopRecording(sourceWorld);

b3.b3DestroyWorld(sourceWorld);

// Occupy a normal Box3D world slot before constructing the replay world. The
// recovery contract must not depend on stale source handles or lucky world-slot reuse.
const spoilerWorld = createWorld();
createBox(spoilerWorld, "spoiler", [20, 20, 20], true);

const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
assert(player, "seed-only recording must create a replay player");
assert.equal(b3.b3RecPlayer_GetFrameCount(player), 0, "identity checkpoint must remain seed-only");

const activeManifest = manifest.filter((entry) => entry.expectedActive);
const restoredBodyCount = b3.b3RecPlayer_GetBodyCount(player);
assert.equal(restoredBodyCount, activeManifest.length, "seed snapshot must expose exactly the bodies active at checkpoint time");
assert.equal(nextSourceOrdinal, 5, "fixture must create five source bodies across churn");
assert.equal(restoredBodyCount, 4, "destroyed pre-checkpoint body must not occupy a recovered body ordinal");

// Important recovery boundary: RecPlayer ordinals are valid creation ordinals
// inside the reconstructed seed/replay world, but a seed snapshot compacts away
// bodies destroyed before recording starts. Historical source ordinals therefore
// cannot be used as durable semantic identity. Rebind once by persisted body name.
const rebound = new Map<string, BodyId>();
for (let restoredOrdinal = 0; restoredOrdinal < restoredBodyCount; restoredOrdinal += 1) {
  const restored = b3.b3RecPlayer_GetBodyId(player, restoredOrdinal);
  assert.equal(b3.b3Body_IsValid(restored), true, `restored body ordinal ${restoredOrdinal} must be valid`);
  const semanticId = b3.b3Body_GetName(restored);
  assert(semanticId.length > 0, `restored body ordinal ${restoredOrdinal} must carry a semantic body name`);
  assert.equal(rebound.has(semanticId), false, `duplicate restored semantic body name ${semanticId}`);
  rebound.set(semanticId, restored);
}

assert.equal(rebound.has("actor:1"), false, "retired pre-checkpoint actor must not reappear after restore");
assert.deepEqual(
  [...rebound.keys()].sort(),
  activeManifest.map((entry) => entry.semanticId).sort(),
  "recovered semantic body-name domain must match the checkpoint's active manifest exactly",
);
for (const entry of activeManifest) {
  const restored = rebound.get(entry.semanticId);
  assert(restored, `active semantic body ${entry.semanticId} failed to rebind by persisted name`);
  assert.equal(b3.b3Body_GetName(restored), entry.semanticId);
}

const restoredWorld = b3.b3RecPlayer_GetWorldId(player);
const restoredActor0 = rebound.get("actor:0")!;
const restoredActor2 = rebound.get("actor:2")!;
b3.b3Body_SetLinearVelocity(restoredActor0, [-1.5, 0.25, 0]);
b3.b3Body_SetAngularVelocity(restoredActor2, [0.1, 0.6, -0.2]);
for (let tick = 0; tick < 30; tick += 1) {
  b3.b3World_Step(restoredWorld, 1 / 60, 4);
}
assert.equal(b3.b3Body_IsValid(restoredActor0), true);
assert.equal(b3.b3Body_IsValid(restoredActor2), true);
assert.equal(b3.b3Body_GetName(restoredActor0), "actor:0");
assert.equal(b3.b3Body_GetName(restoredActor2), "actor:2");

b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);
b3.b3DestroyWorld(spoilerWorld);

console.log(
  "MULTIPLAYER FOUNDATION RECOVERY REBIND SMOKE PASS · pre-checkpoint churn compacted replay ordinals as expected · active semantic identity rebound by persisted unique Box3D body names · retired identity stayed absent · post-restore mutation remained live",
);
