import { writeFileSync } from "node:fs";
import Box3D from "box3d.js/inline";

const b3 = await Box3D();

const REVISION = "ws0-history-f2-recording-capability-v1";
const OUTPUT = process.env.WS0_HISTORY_F2_OUTPUT || "ws0-history-f2-recording-capability.json";

const upstreamCandidates = [
  "b3CreateRecording",
  "b3DestroyRecording",
  "b3World_StartRecording",
  "b3World_StopRecording",
  "b3Recording_GetData",
  "b3Recording_GetSize",
  "b3ValidateReplay",
  "b3RecPlayer_Create",
  "b3RecPlayer_Destroy",
  "b3RecPlayer_StepFrame",
  "b3RecPlayer_Restart",
  "b3RecPlayer_SeekFrame",
  "b3RecPlayer_GetWorldId",
  "b3RecPlayer_GetFrame",
  "b3RecPlayer_GetFrameCount",
  "b3RecPlayer_HasDiverged",
  "b3RecPlayer_GetDivergeFrame",
  "b3RecPlayer_SetKeyframePolicy",
  "b3RecPlayer_GetKeyframeBudget",
  "b3RecPlayer_GetKeyframeMinInterval",
  "b3RecPlayer_GetKeyframeInterval",
  "b3RecPlayer_GetKeyframeBytes",
];

const ownNames = Object.getOwnPropertyNames(b3).sort();
const recordingNames = ownNames.filter((name) =>
  /Recording|RecPlayer|Replay/.test(name) || /^b3World_.*Recording/.test(name),
);

const capabilities = Object.fromEntries(
  upstreamCandidates.map((name) => [name, typeof b3[name]]),
);

const missing = upstreamCandidates.filter((name) => typeof b3[name] !== "function");
const present = upstreamCandidates.filter((name) => typeof b3[name] === "function");

const evidence = {
  revision: REVISION,
  generatedAt: new Date().toISOString(),
  packageContract: "box3d.js@0.1.1 imported through box3d.js/inline",
  box3dVersion: b3.b3GetVersion(),
  upstreamCandidates,
  capabilities,
  recordingNames,
  present,
  missing,
  boundary:
    "Binding-surface probe only. Presence does not prove that replay keyframes are branchable checkpoints or that mutation of a replay world is supported.",
};

console.log(`${REVISION} · Box3D ${JSON.stringify(evidence.box3dVersion)}`);
console.log(`record/replay-related exports (${recordingNames.length}): ${recordingNames.join(", ") || "<none>"}`);
for (const name of upstreamCandidates) {
  console.log(`${name.padEnd(38)} ${capabilities[name]}`);
}
console.log(`present=${present.length}/${upstreamCandidates.length} missing=${missing.length}`);

writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2));
console.log(`F2 CAPABILITY PROBE COMPLETE · evidence written to ${OUTPUT}`);
