import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/friend-ready.js";
let source = readFileSync(path, "utf8");

function replaceExact(oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text missing`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: old text not unique`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

replaceExact(
  `  bootStatus.textContent = "Checking your previous Yard session…";\n  enterButton.textContent = "Checking session…";\n  for (let attempt = 0; attempt < 9; attempt += 1) {`,
  `  bootStatus.textContent = "Checking your previous Yard session…";\n  enterButton.textContent = "Checking session…";\n  let authorityDisprovedStoredSession = false;\n  for (let attempt = 0; attempt < 9; attempt += 1) {`,
  "direct resume authority verdict"
);

replaceExact(
  `      if (room.worldEpoch !== stored.worldEpoch) {\n        if (room.state !== "unavailable") clearWorldV0StoredSession(run, stored.worldEpoch);\n        break;\n      }`,
  `      if (room.worldEpoch !== stored.worldEpoch) {\n        if (room.state === "unavailable") {\n          await new Promise((resolve) => setTimeout(resolve, 200));\n          continue;\n        }\n        clearWorldV0StoredSession(run, stored.worldEpoch);\n        authorityDisprovedStoredSession = true;\n        break;\n      }`,
  "direct resume unavailable directory state"
);

replaceExact(
  `  deepLinkResumeSession = null;\n  enterButton.textContent = entryCopy.enterLabel;\n  bootStatus.textContent = entryCopy.status;\n  return null;`,
  `  if (!authorityDisprovedStoredSession) {\n    // A room-directory outage or unavailable status is not evidence that the private\n    // ActorSession token is stale. Keep the operation fail-closed: send the stored\n    // Resume authority and let the Durable Object validate it. A stale token can be\n    // rejected, but uncertainty must never silently downgrade into a fresh admission\n    // that could retire the user's still-recoverable zero-online epoch.\n    deepLinkResumeSession = stored;\n    callsignInput.value = stored.playerId;\n    renderHumanNameHelp();\n    enterButton.textContent = "Resume world";\n    bootStatus.textContent = "Previous Yard session found locally · Resume will verify it with the world";\n    return stored;\n  }\n  deepLinkResumeSession = null;\n  enterButton.textContent = entryCopy.enterLabel;\n  bootStatus.textContent = entryCopy.status;\n  return null;`,
  "direct resume fail-closed fallback"
);

writeFileSync(path, source);

// The direct-link audit predates R3 live ActorSession rebound. Its old assertions
// required a same-profile private token to wait for the old socket to become
// reserved/offline. R3 intentionally changed that contract: the token may be offered
// Resume immediately, while the Durable Object atomically retires only that exact
// prior ActorSession transport when the user commits the rebound. Keep the older
// close/reopen checks, but align the pre-click probes with the qualified R3 contract.
const auditPath = "scripts/world-v0-direct-link-resume-browser-audit.mjs";
let audit = readFileSync(auditPath, "utf8");
function replaceAuditExact(oldText, newText, label) {
  const first = audit.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text missing`);
  if (audit.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: old text not unique`);
  audit = audit.slice(0, first) + newText + audit.slice(first + oldText.length);
}

replaceAuditExact(
  `  assert(activeProbe.entry?.directLinkResumable === false, \`live ActorSession incorrectly resumable \${JSON.stringify(activeProbe)}\`);\n  assert(activeProbe.entry?.enterLabel === "Enter world", \`live ActorSession direct-link label \${activeProbe.entry?.enterLabel}\`);`,
  `  assert(activeProbe.entry?.directLinkResumable === true, \`same-owner live ActorSession not offered R3 Resume \${JSON.stringify(activeProbe)}\`);\n  assert(activeProbe.entry?.enterLabel === "Resume world", \`same-owner live ActorSession direct-link label \${activeProbe.entry?.enterLabel}\`);`,
  "R3 live direct-link probe"
);

replaceAuditExact(
  `  assert(mixedReservedProbe.entry?.directLinkResumable === false, \`connected own slot incorrectly matched other reserved slot \${JSON.stringify(mixedReservedProbe)}\`);\n  assert(mixedReservedProbe.entry?.enterLabel === "Enter world", \`mixed reserved direct-link label \${mixedReservedProbe.entry?.enterLabel}\`);`,
  `  assert(mixedReservedProbe.entry?.directLinkResumable === true, \`same-owner connected slot not offered R3 Resume during mixed reservation \${JSON.stringify(mixedReservedProbe)}\`);\n  assert(mixedReservedProbe.entry?.enterLabel === "Resume world", \`mixed reserved same-owner direct-link label \${mixedReservedProbe.entry?.enterLabel}\`);`,
  "R3 mixed-reservation direct-link probe"
);

writeFileSync(auditPath, audit);

// The outage falsifier originally inspected __sharedYardV0Session().actorSessionId,
// but that convenience wrapper does not expose ActorSession identity at top level in
// the pre-start shell. Authority evidence does. Require the actual accepted Resume
// identity plus the explicit pre-start-complete lifecycle marker and directory state.
const outagePath = "scripts/world-v0-direct-resume-directory-outage-browser-audit.mjs";
let outage = readFileSync(outagePath, "utf8");
function replaceOutageExact(oldText, newText, label) {
  const first = outage.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text missing`);
  if (outage.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: old text not unique`);
  outage = outage.slice(0, first) + newText + outage.slice(first + oldText.length);
}

replaceOutageExact(
  `      const session = await cdp.evaluate(page, \`window.__sharedYardV0Session?.()\`);\n      return session?.actorSessionId ? session : false;`,
  `      const evidence = await cdp.evaluate(page, \`window.__sharedYardV0Evidence?.()\`);\n      return evidence?.session?.actorSessionId ? evidence : false;`,
  "outage authority evidence source"
);

replaceOutageExact(
  `  assert(resumed.actorSessionId === aw.selfSessionId, \`ActorSession changed after outage resume: \${JSON.stringify(resumed)}\`);\n  assert(resumed.identity?.worldEpoch === oldEpoch || resumed.worldEpoch === oldEpoch, \`WorldEpoch changed after outage resume: \${JSON.stringify(resumed)}\`);`,
  `  assert(resumed.session?.actorSessionId === aw.selfSessionId, \`ActorSession changed after outage resume: \${JSON.stringify(resumed)}\`);\n  assert(resumed.identity?.worldEpoch === oldEpoch, \`WorldEpoch changed after outage resume: \${JSON.stringify(resumed)}\`);\n  assert(resumed.lifecycleEvents?.some((event) => event.type === "actor-resume-prestart-complete"), \`pre-start authority Resume completion missing: \${JSON.stringify(resumed.lifecycleEvents)}\`);\n  const resumedRoom = await room();\n  assert(resumedRoom?.worldEpoch === oldEpoch, \`directory epoch changed after outage Resume: \${JSON.stringify(resumedRoom)}\`);\n  assert(resumedRoom?.connected === 1 && resumedRoom?.reserved === 1, \`directory presence mismatch after outage Resume: \${JSON.stringify(resumedRoom)}\`);`,
  "outage accepted Resume assertions"
);

writeFileSync(outagePath, outage);
console.log("WORLD_V0_DIRECT_RESUME_FAIL_CLOSED_REPAIR_APPLIED");
