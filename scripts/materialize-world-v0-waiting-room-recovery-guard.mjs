import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: source marker missing`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source marker not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const appPath = "public/world-v0/app.js";
let app = readFileSync(appPath, "utf8");
app = replaceOnce(
  app,
  `    const admittedActor = Boolean(identity && selfSessionId);\n    const expectedAfterEpochEnd = sessionEnd?.kind === "epoch-ended";`,
  `    const networkStateBeforeClose = networkState;\n    const admittedActor = Boolean(identity && selfSessionId);\n    const expectedAfterEpochEnd = sessionEnd?.kind === "epoch-ended";`,
  "capture pre-close lifecycle state",
);
app = replaceOnce(
  app,
  `    const actorTransportRecoverable = !runtimeFailed && !expectedAfterEpochEnd && !roomRecovery.pending &&\n      Boolean(identity && resumeToken && selfSessionId) && event.code === 1006;`,
  `    const activeActorTransportRecoverable = Boolean(localState && Number.isInteger(protocolStartTick));\n    const committedStartWindowRecoverable = !localState && !Number.isInteger(protocolStartTick) &&\n      (networkStateBeforeClose === "both connected · ready" || networkStateBeforeClose === "ready · awaiting start");\n    const actorTransportRecoverable = !runtimeFailed && !expectedAfterEpochEnd && !roomRecovery.pending &&\n      Boolean(identity && resumeToken && selfSessionId) && event.code === 1006 &&\n      (activeActorTransportRecoverable || committedStartWindowRecoverable);`,
  "bound ActorSession transport recovery",
);
writeFileSync(appPath, app);

const auditPath = "scripts/world-v0-closure-waiting-room-drop-audit.mjs";
let audit = readFileSync(auditPath, "utf8");
audit = replaceOnce(
  audit,
  `  await waitFor(client,\n    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.session?.actorResume?.pending === true && e?.session?.actorResume?.attempts >= 1; })()',\n    "unexpected waiting-room actor resume", 8000);\n  const after = await evidence(client);\n  assert(after.protocolStartTick === null && after.localBoundaryTick === null, "waiting-room browser unexpectedly entered active simulation");\n  assert(after.runtimeFailed === false, "browser exhausted before falsifier captured erroneous recovery");`,
  `  await waitFor(client,\n    '(() => { const e=window.__sharedYardV0Evidence?.(); return String(e?.networkState || "").startsWith("closed") && e?.session?.actorResume?.pending === false; })()',\n    "waiting-room fail-closed transport state", 8000);\n  await sleep(500);\n  const after = await evidence(client);\n  assert(after.protocolStartTick === null && after.localBoundaryTick === null, "waiting-room browser unexpectedly entered active simulation");\n  assert(after.session.actorResume.pending === false, "waiting-room browser incorrectly armed ActorSession resume");\n  assert(after.session.actorResume.attempts === 0, \`waiting-room browser spent ActorSession retry budget: \${after.session.actorResume.attempts}\`);\n  assert(after.runtimeFailed === false, "waiting-room fail-closed path became runtime failure");`,
  "waiting-room regression expectation",
);
audit = replaceOnce(audit, 'revision: "world-v0-closure-waiting-room-drop-v1-falsifier"', 'revision: "world-v0-closure-waiting-room-drop-v2-fail-closed"', "waiting-room revision");
audit = replaceOnce(audit, 'verdict: "WORLD_V0_CLOSURE_WAITING_ROOM_RECOVERY_REGRESSION_REPRODUCED"', 'verdict: "WORLD_V0_CLOSURE_WAITING_ROOM_FAIL_CLOSED_PASS"', "waiting-room verdict");
audit = replaceOnce(
  audit,
  'interpretation: "The authority correctly retires a pre-start waiting-room epoch on transport loss, but the repaired browser incorrectly arms ActorSession resume and spends retry budget against an ActorSession that no longer exists."',
  'interpretation: "A pure pre-start waiting-room transport loss remains fail-closed: the browser does not arm ActorSession recovery, while authority retires the old WorldEpoch/ActorSession and a fresh actor receives a new epoch."',
  "waiting-room interpretation",
);
writeFileSync(auditPath, audit);
console.log("WORLD_V0_WAITING_ROOM_RECOVERY_GUARD_MATERIALIZED");
