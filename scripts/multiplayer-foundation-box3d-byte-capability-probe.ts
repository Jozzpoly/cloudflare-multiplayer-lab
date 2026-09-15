import assert from "node:assert/strict";
import Box3D from "box3d.js";

const b3 = await Box3D();
const module = b3 as Record<string, unknown>;

const capabilities = {
  publicRecordingGetData: typeof module.b3Recording_GetData === "function",
  publicRecordingGetSize: typeof module.b3Recording_GetSize === "function",
  publicCreatePlayerFromBytes: typeof module.b3RecPlayer_Create === "function",
  publicCreatePlayerFromRecording: typeof module.b3RecPlayer_CreateFromRecording === "function",
  rawRecordingGetData: typeof module._b3Recording_GetData === "function",
  rawRecordingGetSize: typeof module._b3Recording_GetSize === "function",
  rawRecPlayerCreate: typeof module._b3RecPlayer_Create === "function",
  heapU8: module.HEAPU8 instanceof Uint8Array,
  ccall: typeof module.ccall === "function",
  cwrap: typeof module.cwrap === "function",
};

assert.equal(capabilities.publicCreatePlayerFromRecording, true, "current binding must keep its in-process Recording→RecPlayer helper");

const worldDef = b3.b3DefaultWorldDef();
const world = b3.b3CreateWorld(worldDef);
const bodyDef = b3.b3DefaultBodyDef();
bodyDef.type = b3.b3BodyType.b3_dynamicBody;
const body = b3.b3CreateBody(world, bodyDef);
b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), 0.5, 0.5, 0.5);
const recording = b3.b3CreateRecording(0);
b3.b3World_StartRecording(world, recording);
b3.b3World_StopRecording(world);
b3.b3DestroyWorld(world);
const player = b3.b3RecPlayer_CreateFromRecording(recording, 1);
assert(player, "baseline in-process Recording→RecPlayer path must remain functional");
b3.b3RecPlayer_Destroy(player);
b3.b3DestroyRecording(recording);

const bytePathAvailable = (
  capabilities.publicRecordingGetData
  && capabilities.publicRecordingGetSize
  && capabilities.publicCreatePlayerFromBytes
) || (
  capabilities.rawRecordingGetData
  && capabilities.rawRecordingGetSize
  && capabilities.rawRecPlayerCreate
  && capabilities.heapU8
);

console.log(
  `MULTIPLAYER FOUNDATION BOX3D BYTE CAPABILITY PROBE · ${bytePathAvailable ? "DIRECT_BYTE_PATH_PRESENT" : "NO_DIRECT_BYTE_PATH"} · ${JSON.stringify(capabilities)}`,
);
