import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
let text = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`non-unique anchor: ${label}`);
  text = text.slice(0, first) + to + text.slice(first + from.length);
}

replaceOnce(
`} from "./playable-control.js";\n\nconst FIXED_DT`,
`} from "./playable-control.js";\nimport {\n  WORLD_V0_SESSION_CONTINUITY_REVISION,\n  clearWorldV0StoredSession,\n  takeWorldV0ResumeIntent,\n  writeWorldV0StoredSession,\n} from "./session-continuity.js";\n\nconst FIXED_DT`,
"session continuity import",
);

replaceOnce(
`let resumeToken = null;\nlet protocolStartTick = null;`,
`let resumeToken = null;\n\nfunction persistCurrentActorSession() {\n  if (!identity || !selfSessionId || !resumeToken || !selfNetEntityId || !Number.isInteger(selfSlot)) return false;\n  return writeWorldV0StoredSession({\n    runKey,\n    playerId: callsign,\n    worldEpoch: identity.worldEpoch,\n    sessionId: selfSessionId,\n    resumeToken,\n    netEntityId: selfNetEntityId,\n    slot: selfSlot,\n  });\n}\n\nfunction clearCurrentStoredActorSession(worldEpoch = identity?.worldEpoch ?? null) {\n  if (!runKey) return false;\n  return clearWorldV0StoredSession(runKey, worldEpoch);\n}\n\nlet protocolStartTick = null;`,
"persisted actor helpers",
);

replaceOnce(
`      selfSlot = message.slot;\n      resumeToken = message.resumeToken;\n      clearActorResumeTimer();`,
`      selfSlot = message.slot;\n      resumeToken = message.resumeToken;\n      persistCurrentActorSession();\n      clearActorResumeTimer();`,
"persist resumed actor",
);

replaceOnce(
`    selfNetEntityId = message.selfNetEntityId;\n    selfSlot = message.slot;\n    networkState = message.waitingForPeer ? "waiting for peer" : "peer joined";`,
`    selfNetEntityId = message.selfNetEntityId;\n    selfSlot = message.slot;\n    persistCurrentActorSession();\n    networkState = message.waitingForPeer ? "waiting for peer" : "peer joined";`,
"persist fresh actor",
);

replaceOnce(
`    sessionEnd = {\n      kind: "epoch-ended",`,
`    clearCurrentStoredActorSession(message.worldEpoch);\n    sessionEnd = {\n      kind: "epoch-ended",`,
"clear ended actor session",
);

replaceOnce(
`  if (localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME) networkState = "prediction backlog";\n}`,
`  const stillBacklogged = localState.boundaryTick < targetBoundary - MAX_PREDICTION_STEPS_PER_FRAME;\n  if (stillBacklogged) networkState = "prediction backlog";\n  else if (networkState === "prediction backlog") networkState = "live · Shared Yard V0";\n}`,
"clear stale prediction backlog",
);

replaceOnce(
`    session: {\n      inviteUrl: buildInviteUrl(),`,
`    session: {\n      sessionContinuityRevision: WORLD_V0_SESSION_CONTINUITY_REVISION,\n      inviteUrl: buildInviteUrl(),`,
"evidence continuity revision",
);

replaceOnce(
`  history.replaceState(null, "", shareUrl);\n  resetProtocolState();\n  clearNotice();`,
`  history.replaceState(null, "", shareUrl);\n  const resumeIntent = takeWorldV0ResumeIntent({ runKey, playerId: callsign });\n  resetProtocolState();\n  if (resumeIntent) {\n    resumeToken = resumeIntent.resumeToken;\n    selfSessionId = resumeIntent.sessionId;\n    selfNetEntityId = resumeIntent.netEntityId;\n    selfSlot = resumeIntent.slot;\n    actorResume.pending = true;\n    actorResume.attempts = 0;\n    actorResume.sourceBoundary = null;\n    recordLifecycle("cross-page-resume-intent", {\n      sessionId: resumeIntent.sessionId,\n      netEntityId: resumeIntent.netEntityId,\n      storedWorldEpoch: resumeIntent.worldEpoch,\n    });\n  }\n  clearNotice();`,
"consume cross-page resume intent",
);

writeFileSync(path, text);
console.log("WORLD_V0_SESSION_CONTINUITY_APP_MATERIALIZED");
