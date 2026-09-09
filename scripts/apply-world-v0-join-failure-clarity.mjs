import { readFileSync, writeFileSync } from "node:fs";

const helperPath = "public/world-v0/join-failure-clarity.js";
const helper = `export const WORLD_V0_JOIN_FAILURE_CLARITY_REVISION = "world-v0-join-failure-clarity-v1";

export function classifyWorldV0JoinFailure({ directoryReachable, room }) {
  if (!directoryReachable) {
    return {
      kind: "service-unreachable",
      message: "Couldn’t reach the Yard service to confirm room state. Check the connection and retry.",
    };
  }
  if (!room) {
    return {
      kind: "room-unknown",
      message: "Couldn’t confirm this Yard after the join failed. Return to the room list and try again.",
    };
  }

  const connected = Number.isFinite(Number(room.connected)) ? Number(room.connected) : 0;
  const reserved = Number.isFinite(Number(room.reserved)) ? Number(room.reserved) : 0;
  const capacity = Number.isFinite(Number(room.capacity)) ? Number(room.capacity) : 2;
  const state = String(room.state || "unknown");

  if (state === "unavailable" || room.failure) {
    return {
      kind: "yard-unavailable",
      message: "This Yard is temporarily unavailable. Try another Yard or retry shortly.",
    };
  }
  if (room.joinable === false) {
    if (connected >= capacity) {
      return {
        kind: "capacity-full",
        message: "This Yard is full right now. Choose another Yard.",
      };
    }
    if (reserved > 0) {
      return {
        kind: "lifecycle-protected",
        message: "This Yard isn’t accepting a fresh player right now; a place is still protected for reconnect. Return to the room list or use Resume if it is your session.",
      };
    }
    return {
      kind: "lifecycle-busy",
      message: "This Yard isn’t accepting a fresh player right now. Return to the room list and choose an available Yard.",
    };
  }
  if (room.joinable === true) {
    return {
      kind: "connection-handshake",
      message: "This Yard still has an open place, but the game connection didn’t open. Retry; this looks like a temporary connection or handshake problem.",
    };
  }
  return {
    kind: "room-unknown",
    message: "Couldn’t determine why this Yard rejected the join. Return to the room list and try again.",
  };
}
`;
writeFileSync(helperPath, helper);

const appPath = "public/world-v0/app.js";
let app = readFileSync(appPath, "utf8");
function replaceExact(oldText, newText, label) {
  const first = app.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text missing`);
  if (app.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: old text not unique`);
  app = app.slice(0, first) + newText + app.slice(first + oldText.length);
}

replaceExact(
  `import {\n  WORLD_V0_SESSION_CONTINUITY_REVISION,\n  clearWorldV0StoredSession,\n  takeWorldV0ResumeIntent,\n  writeWorldV0StoredSession,\n} from "./session-continuity.js";`,
  `import {\n  WORLD_V0_SESSION_CONTINUITY_REVISION,\n  clearWorldV0StoredSession,\n  takeWorldV0ResumeIntent,\n  writeWorldV0StoredSession,\n} from "./session-continuity.js";\nimport {\n  WORLD_V0_JOIN_FAILURE_CLARITY_REVISION,\n  classifyWorldV0JoinFailure,\n} from "./join-failure-clarity.js";`,
  "join failure clarity import"
);

replaceExact(
  `function clearNotice() {\n  notice.classList.add("hidden");\n  notice.textContent = "";\n}\n\nfunction formatBytes(value) {`,
  `function clearNotice() {\n  notice.classList.add("hidden");\n  notice.textContent = "";\n}\n\nasync function classifyUnadmittedJoinFailure(connection, attemptedRunKey) {\n  let directoryReachable = false;\n  let room = null;\n  try {\n    const response = await fetch("/api/world-v0/rooms", { cache: "no-store" });\n    if (response.ok) {\n      directoryReachable = true;\n      const payload = await response.json();\n      room = Array.isArray(payload?.rooms)\n        ? payload.rooms.find((candidate) => candidate?.id === attemptedRunKey) || null\n        : null;\n    }\n  } catch {\n    directoryReachable = false;\n  }\n\n  // Do not let a slow diagnostic fetch paint stale failure UI over a new connection.\n  if (socket !== connection || identity) return null;\n  const classification = classifyWorldV0JoinFailure({ directoryReachable, room });\n  networkState = \`join failed · \${classification.kind}\`;\n  if (sessionEnd?.kind === "join-failed") {\n    sessionEnd.classification = classification.kind;\n    sessionEnd.clarityRevision = WORLD_V0_JOIN_FAILURE_CLARITY_REVISION;\n    sessionEnd.directoryReachable = directoryReachable;\n    sessionEnd.roomState = room?.state || null;\n    sessionEnd.roomConnected = Number.isFinite(Number(room?.connected)) ? Number(room.connected) : null;\n    sessionEnd.roomReserved = Number.isFinite(Number(room?.reserved)) ? Number(room.reserved) : null;\n    sessionEnd.roomJoinable = typeof room?.joinable === "boolean" ? room.joinable : null;\n  }\n  recordLifecycle("join-failure-classified", {\n    classification: classification.kind,\n    clarityRevision: WORLD_V0_JOIN_FAILURE_CLARITY_REVISION,\n    directoryReachable,\n    roomState: room?.state || null,\n    roomJoinable: typeof room?.joinable === "boolean" ? room.joinable : null,\n  });\n  showNotice(classification.message);\n  persistLastSessionEvidence("join-failure-classified");\n  updateProductStatus();\n  return classification;\n}\n\nfunction formatBytes(value) {`,
  "join failure classifier runtime"
);

replaceExact(
  `  if (networkState.startsWith("epoch ended")) return "Round ending · preparing fresh epoch";\n  if (networkState === "prediction backlog") return "Catching up…";`,
  `  if (networkState.startsWith("epoch ended")) return "Round ending · preparing fresh epoch";\n  if (networkState.startsWith("join failed")) return "Could not enter this Yard · see the reason below";\n  if (networkState === "prediction backlog") return "Catching up…";`,
  "join failure product status"
);

replaceExact(
  `    if (!runtimeFailed) {\n      if (admittedActor) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");\n      else showNotice("Couldn’t join this Yard. It may already be active, full, or temporarily unreachable.");\n    }`,
  `    if (!runtimeFailed) {\n      if (admittedActor) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");\n      else void classifyUnadmittedJoinFailure(connection, runKey);\n    }`,
  "replace generic join failure notice"
);

writeFileSync(appPath, app);
console.log("WORLD_V0_JOIN_FAILURE_CLARITY_REPAIR_APPLIED");
