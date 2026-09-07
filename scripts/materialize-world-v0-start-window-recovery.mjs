import { readFileSync, writeFileSync, rmSync } from "node:fs";

function read(path) { return readFileSync(path, "utf8"); }
function write(path, text) { writeFileSync(path, text); }
function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: source marker missing`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source marker not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}
function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker missing`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${label}: end marker missing`);
  return text.slice(0, start) + replacement + text.slice(end);
}

const appPath = "public/world-v0/app.js";
let app = read(appPath);

const entityDefsHelper = `function authorityEntityDefsFromState(state) {
  const players = [...(state?.players || [])].sort((a, c) => (a.slot ?? 0) - (c.slot ?? 0));
  const props = [...(state?.props || [])];
  if (players.length !== 2) throw new Error(\`authority resume requires exactly two players, got \${players.length}\`);
  const self = players.find((player) => player.sessionId === selfSessionId);
  const remote = players.find((player) => player.sessionId !== selfSessionId);
  if (!self || !remote) throw new Error("authority resume state missing actor");
  remoteSessionId = remote.sessionId;
  remoteNetEntityId = remote.netEntityId;

  const entityDefs = [];
  for (const prop of props) {
    const netEntityId = prop.netEntityId || prop.id;
    entityDefs.push({ netEntityId, locator: \`prop:\${netEntityId}\`, kind: "prop", propId: prop.id });
  }
  for (const player of players) {
    const netEntityId = player.netEntityId || \`actor:\${player.slot}\`;
    entityDefs.push({ netEntityId, locator: netEntityId, kind: "actor", slot: player.slot, sessionId: player.sessionId });
  }
  return entityDefs;
}

`;
app = replaceOnce(app, "function createSimulationFromState(state) {", entityDefsHelper + "function createSimulationFromState(state) {", "insert authority entity defs helper");

app = replaceOnce(
  app,
  `function applyAuthorityRebase(seed) {\n  if (!localState?.sim) throw new Error("authority rebase without local simulation");`,
  `function applyAuthorityRebase(seed, bootstrapState = null) {\n  if (!localState?.sim && !bootstrapState) throw new Error("authority rebase without local simulation or bootstrap state");`,
  "generalize authority rebase entry",
);
app = replaceOnce(
  app,
  `  const oldEntityDefs = localState.sim.entityDefs;\n  const oldNetEntityOrder = localState.sim.netEntityOrder;`,
  `  const entityDefs = localState?.sim?.entityDefs ?? authorityEntityDefsFromState(bootstrapState);\n  const netEntityOrder = localState?.sim?.netEntityOrder ?? simulation.netEntityOrder;`,
  "authority rebase mapping source",
);
app = replaceOnce(app, "    next = remapSimulation(player, oldEntityDefs, oldNetEntityOrder);", "    next = remapSimulation(player, entityDefs, netEntityOrder);", "authority rebase remap args");

const resumedStart = `    if (message.resumed) {\n`;
const resumedEnd = `    if (resumingActor) throw new Error("actor resume was not accepted by authority");`;
const resumedReplacement = `    if (message.resumed) {
      if (!resumingActor || !priorSessionId || !priorResumeToken) throw new Error("unexpected resumed welcome");
      if (message.selfSessionId !== priorSessionId) throw new Error("resumed ActorSession identity drift");
      if (message.resumeToken !== priorResumeToken) throw new Error("resumed private token drift");
      if (!Number.isInteger(message.resumeLastBatchSeq) || message.resumeLastBatchSeq < 0) throw new Error("resumed batch sequence invalid");

      const hadLocalState = Boolean(localState?.sim);
      const resumedIntoActiveRun = Number.isInteger(message.protocolStartTick);
      if (hadLocalState && !resumedIntoActiveRun) throw new Error("active ActorSession resumed into unscheduled protocol");
      batchSeq = Math.max(batchSeq, message.resumeLastBatchSeq);

      if (resumedIntoActiveRun) {
        if (!message.rebaseSeed || !Number.isInteger(message.rebaseSeed.boundaryTick)) throw new Error("active ActorSession resume missing authority rebase seed");
        if (message.state?.boundaryTick !== message.rebaseSeed.boundaryTick) throw new Error("active ActorSession resume state/rebase boundary mismatch");
        if (Number.isInteger(protocolStartTick) && protocolStartTick !== message.protocolStartTick) throw new Error("resumed protocolStartTick drift");
        protocolStartTick = message.protocolStartTick;
        if (!hadLocalState) {
          buildArenaVisual(simulation);
          buildSpatialCues(message.state);
        }
        applyAuthorityRebase(message.rebaseSeed, hadLocalState ? null : message.state);
      } else {
        if (message.rebaseSeed) throw new Error("pre-start ActorSession resume unexpectedly carried rebase seed");
        protocolStartTick = null;
      }

      selfSessionId = message.selfSessionId;
      selfNetEntityId = message.selfNetEntityId;
      selfSlot = message.slot;
      resumeToken = message.resumeToken;
      clearActorResumeTimer();
      actorResume.pending = false;
      actorResume.attempts = 0;
      actorResume.sourceBoundary = null;
      actorResume.lastRecoveredBoundary = localState?.boundaryTick ?? null;
      playing = true;
      sessionEnd = null;

      if (resumedIntoActiveRun) {
        networkState = "live · exact state resumed";
        jumpButton.classList.remove("hidden");
        joystick.classList.add("active");
        cameraGimbal.classList.add("active");
        startLogicalInputScheduler();
        recordLifecycle("actor-resume-complete", {
          boundaryTick: localState.boundaryTick,
          resumeCount: message.resumeCount,
          bootstrapFromAuthority: !hadLocalState,
        });
        clearNotice();
        syncMeshes();
      } else {
        networkState = message.waitingForPeer ? "waiting for peer" : "peer joined";
        jumpButton.classList.add("hidden");
        joystick.classList.remove("active");
        cameraGimbal.classList.remove("active");
        recordLifecycle("actor-resume-prestart-complete", { resumeCount: message.resumeCount });
        clearNotice();
      }
      return;
    }
`;
app = replaceBetween(app, resumedStart, resumedEnd, resumedReplacement, "resumed welcome lifecycle");

app = replaceOnce(
  app,
  `    if (players.length === 2 && socket?.readyState === WebSocket.OPEN) {`,
  `    if (players.length === 2 && socket?.readyState === WebSocket.OPEN && !Number.isInteger(protocolStartTick)) {`,
  "roster must not restart active handshake",
);
app = replaceOnce(
  app,
  `      Boolean(identity && resumeToken && localState && Number.isInteger(protocolStartTick)) && event.code === 1006;`,
  `      Boolean(identity && resumeToken && selfSessionId) && event.code === 1006;`,
  "abnormal admitted-actor transport recovery",
);
write(appPath, app);

const buildPath = "public/world-v0/build-contract.js";
let build = read(buildPath);
build = replaceOnce(build, "shared-yard-v0-browser-ui-v11-resume-window", "shared-yard-v0-browser-ui-v12-start-window-resume", "browser UI provenance");
write(buildPath, build);

const auditPath = "scripts/world-v0-closure-start-window-audit.mjs";
let audit = read(auditPath);
const directResumeStart = "async function directResume(runKey, playerId, welcome) {";
const directResumeEnd = "const chrome = findChrome();";
audit = replaceBetween(audit, directResumeStart, directResumeEnd, directResumeEnd, "remove direct-resume control helper");

const oldPostDropStart = `  await waitFor(b,\n    '(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && String(e.networkState || "").startsWith("closed"); })()',`;
const oldPostDropEnd = `  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));`;
const repairedPostDrop = `  await waitFor(b, \`(() => {
    const e=window.__sharedYardV0Evidence?.();
    if (!e || e.runtimeFailed || e.session?.actorResume?.pending) return false;
    const pending=(e.lifecycleEvents || []).find((event) => event.type === "actor-resume-pending" && event.sourceBoundary === null);
    const attempt=(e.lifecycleEvents || []).find((event) => event.type === "actor-resume-attempt");
    const complete=(e.lifecycleEvents || []).find((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true);
    return Boolean(pending && attempt && complete && Number.isInteger(e.protocolStartTick) && Number.isInteger(e.localBoundaryTick) && e.metrics?.guardMismatches === 0 && e.metrics?.rebases >= 1);
  })()\`, "B automatic exact recovery from committed-start window", 25_000);

  const recoveredB = await evidence(b);
  const liveA = await evidence(a);
  const pendingEvent = (recoveredB.lifecycleEvents || []).find((event) => event.type === "actor-resume-pending" && event.sourceBoundary === null);
  const attemptEvent = (recoveredB.lifecycleEvents || []).find((event) => event.type === "actor-resume-attempt");
  const completeEvent = (recoveredB.lifecycleEvents || []).find((event) => event.type === "actor-resume-complete" && event.bootstrapFromAuthority === true);
  assert(pendingEvent && attemptEvent && completeEvent, "B recovery lifecycle evidence incomplete");
  assert(recoveredB.identity.worldEpoch === startedA.identity.worldEpoch, "B recovery rotated WorldEpoch");
  assert(recoveredB.session.actorSessionId === capturedWelcome.selfSessionId, "B recovery changed ActorSession identity");
  assert(recoveredB.session.selfNetEntityId === capturedWelcome.selfNetEntityId, "B recovery changed NetEntity identity");
  assert(recoveredB.protocolStartTick === startedA.protocolStartTick, "B recovered a different protocolStartTick");
  assert(recoveredB.metrics.guardMismatches === 0 && recoveredB.metrics.firstStateMismatch === null, "B exact-state guard failed after bootstrap resume");
  assert(recoveredB.metrics.rebases >= 1, "B did not apply authority rebase during bootstrap resume");
  assert(liveA.runtimeFailed === false, "healthy A failed during targeted B pre-start loss");
  assert(liveA.identity.worldEpoch === startedA.identity.worldEpoch, "healthy A WorldEpoch rotated after B drop");
  assert(Number.isInteger(liveA.protocolStartTick), "healthy A lost committed protocol start");

  result = {
    revision: "world-v0-closure-start-window-v2-recovered",
    runKey,
    chromeVersion: version,
    worldEpoch: startedA.identity.worldEpoch,
    browserB: {
      actorSessionId: capturedWelcome.selfSessionId,
      netEntityId: capturedWelcome.selfNetEntityId,
      beforeRelease: { networkState: beforeB.networkState, protocolStartTick: beforeB.protocolStartTick, localBoundaryTick: beforeB.localBoundaryTick },
      afterAuthorityStartWhileDownstreamBlocked: { networkState: isolatedB.networkState, protocolStartTick: isolatedB.protocolStartTick, localBoundaryTick: isolatedB.localBoundaryTick },
      recovered: {
        networkState: recoveredB.networkState,
        protocolStartTick: recoveredB.protocolStartTick,
        localBoundaryTick: recoveredB.localBoundaryTick,
        sameActorSession: recoveredB.session.actorSessionId === capturedWelcome.selfSessionId,
        sameNetEntity: recoveredB.session.selfNetEntityId === capturedWelcome.selfNetEntityId,
        sameWorldEpoch: recoveredB.identity.worldEpoch === startedA.identity.worldEpoch,
        rebaseBoundary: completeEvent.boundaryTick,
        guardMismatches: recoveredB.metrics.guardMismatches,
        rebases: recoveredB.metrics.rebases,
      },
    },
    healthyA: { protocolStartTick: liveA.protocolStartTick, localBoundaryTick: liveA.localBoundaryTick, runtimeFailed: liveA.runtimeFailed },
    proxy: { blocked: blockedProxy, drop },
    recoveryLifecycle: {
      pendingSourceBoundary: pendingEvent.sourceBoundary,
      firstAttempt: attemptEvent.attempt,
      bootstrapFromAuthority: completeEvent.bootstrapFromAuthority,
      recoveredBoundary: completeEvent.boundaryTick,
    },
    verdict: "WORLD_V0_CLOSURE_START_WINDOW_BROWSER_RECOVERY_PASS",
    interpretation: "Authority committed the run while world_v0_start was suppressed from one admitted browser; after an abnormal transport loss, that browser automatically rebound the same ActorSession and bootstrapped exact active-world state from the authority recording seed without ever having received the original start state.",
    nonClaim: "This is a deliberately isolated local Chromium/Workerd handshake-window proof using directional proxy suppression. It does not estimate real-world incidence, mobile radio behavior, process loss, persistence, or tab-destruction continuity.",
  };
`;
audit = replaceBetween(audit, oldPostDropStart, oldPostDropEnd, repairedPostDrop, "convert start-window falsifier to recovery regression");
audit = audit.replace('"revision": "world-v0-closure-start-window-v1",', '"revision": "world-v0-closure-start-window-v2-recovered",');
write(auditPath, audit);

const validatorPath = ".github/workflows/world-v0-closure-current-validation.yml";
let validator = read(validatorPath);
validator = replaceOnce(validator, "shared-yard-v0-browser-ui-v11-resume-window", "shared-yard-v0-browser-ui-v12-start-window-resume", "validator UI revision");
validator = replaceOnce(
  validator,
  "      - scripts/world-v0-closure-dual-browser-grace-audit.mjs\n",
  "      - scripts/world-v0-closure-dual-browser-grace-audit.mjs\n      - scripts/world-v0-closure-start-window-audit.mjs\n",
  "validator start-window path trigger",
);
const allDropStep = `      - name: Requalify bounded all-transport-loss window\n`;
const startWindowStep = `      - name: Requalify committed-start ActorSession recovery window
        env:
          MW_WORLD_V0_START_WINDOW_BASE: http://127.0.0.1:8787
          MW_WORLD_V0_START_WINDOW_OUTPUT: world-v0-closure-current-start-window.json
        shell: bash
        run: |
          set -euo pipefail
          timeout 90s node scripts/world-v0-closure-start-window-audit.mjs | tee world-v0-closure-current-start-window.log
          grep -q 'WORLD_V0_CLOSURE_START_WINDOW_BROWSER_RECOVERY_PASS' world-v0-closure-current-start-window.log

`;
validator = replaceOnce(validator, allDropStep, startWindowStep + allDropStep, "validator start-window regression step");
validator = replaceOnce(
  validator,
  "            world-v0-closure-current-all-drop.log\n",
  "            world-v0-closure-current-start-window.log\n            world-v0-closure-current-start-window.json\n            world-v0-closure-current-all-drop.log\n",
  "validator start-window artifact",
);
write(validatorPath, validator);

rmSync(".github/workflows/world-v0-closure-start-window-falsifier.yml");

console.log("WORLD_V0_START_WINDOW_RECOVERY_MATERIALIZED");
