import { readFileSync, writeFileSync } from "node:fs";

function replaceExactlyOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source fragment occurs more than once`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const appPath = "public/world-v0/app.js";
let app = readFileSync(appPath, "utf8");

app = replaceExactlyOnce(
  app,
  `function canRestartRound() {\n  return !runtimeFailed && !roomRecovery.pending && networkState.startsWith("closed") && (!socket || socket.readyState === WebSocket.CLOSED);\n}`,
  `function canRestartRound() {\n  const admittedActor = Boolean(identity && selfSessionId);\n  return admittedActor && !runtimeFailed && !roomRecovery.pending && networkState.startsWith("closed") && (!socket || socket.readyState === WebSocket.CLOSED);\n}`,
  "restart requires admitted ActorSession",
);

app = replaceExactlyOnce(
  app,
  `    const expectedAfterEpochEnd = sessionEnd?.kind === "epoch-ended";\n    if (!sessionEnd) {\n      sessionEnd = {\n        kind: "transport-close",\n        reason: event.reason || \`close-\${event.code}\`,\n        code: event.code,\n        at: new Date().toISOString(),\n        boundaryTick: localState?.boundaryTick ?? null,\n      };\n    }\n    networkState = \`closed \${event.code}\`;`,
  `    const admittedActor = Boolean(identity && selfSessionId);\n    const expectedAfterEpochEnd = sessionEnd?.kind === "epoch-ended";\n    if (!sessionEnd) {\n      sessionEnd = {\n        kind: admittedActor ? "transport-close" : "join-failed",\n        reason: event.reason || \`close-\${event.code}\`,\n        code: event.code,\n        at: new Date().toISOString(),\n        boundaryTick: localState?.boundaryTick ?? null,\n      };\n    }\n    networkState = admittedActor ? \`closed \${event.code}\` : \`join failed \${event.code}\`;`,
  "classify pre-welcome close as join failure",
);

app = replaceExactlyOnce(
  app,
  `    if (!runtimeFailed) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");`,
  `    if (!runtimeFailed) {\n      if (admittedActor) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");\n      else showNotice("Couldn’t join this Yard. It may already be active, full, or temporarily unreachable.");\n    }`,
  "truthful pre-welcome close notice",
);

writeFileSync(appPath, app);

const smokePath = "scripts/world-v0-human-entry-browser-smoke.mjs";
let smoke = readFileSync(smokePath, "utf8");

smoke = replaceExactlyOnce(
  smoke,
  `const DEBUG_PORTS = [9572, 9573];`,
  `const DEBUG_PORTS = [9572, 9573, 9574];`,
  "reserve fresh-reopen browser port",
);

smoke = replaceExactlyOnce(
  smoke,
  `let owner = null;\nlet peer = null;`,
  `let owner = null;\nlet peer = null;\nlet reopenedPeer = null;`,
  "track fresh-reopen browser",
);

smoke = replaceExactlyOnce(
  smoke,
  `  assert(ownerLive.identity.worldId === peerLive.identity.worldId, "owner/peer worldId mismatch");\n  assert(ownerLive.identity.worldEpoch === peerLive.identity.worldEpoch, "owner/peer WorldEpoch mismatch");\n\n  Object.assign(result, {`,
  `  assert(ownerLive.identity.worldId === peerLive.identity.worldId, "owner/peer worldId mismatch");\n  assert(ownerLive.identity.worldEpoch === peerLive.identity.worldEpoch, "owner/peer WorldEpoch mismatch");\n\n  const ownerEpochBeforePeerClose = ownerLive.identity.worldEpoch;\n  const ownerBoundaryBeforePeerClose = ownerLive.localBoundaryTick;\n  await stopBrowser(peer);\n  peer = null;\n\n  await waitFor(owner, \`(() => {\n    const e = window.__sharedYardV0Evidence?.();\n    return e && !e.runtimeFailed &&\n      e.identity?.worldEpoch === \${JSON.stringify(ownerEpochBeforePeerClose)} &&\n      Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick >= \${ownerBoundaryBeforePeerClose + 12} &&\n      !String(e.networkState || "").startsWith("closed");\n  })()\`, "owner remains live after peer tab close");\n\n  reopenedPeer = await startBrowser(chrome, 2, directUrl);\n  await waitFor(reopenedPeer, \`document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"\`, "fresh reopen boot");\n  await evaluate(reopenedPeer, \`(() => {\n    const input = document.querySelector("#callsign");\n    input.value = "Ktoś wraca";\n    input.dispatchEvent(new Event("input", { bubbles: true }));\n    document.querySelector("#enter").click();\n    return true;\n  })()\`);\n  await waitFor(reopenedPeer, \`String(window.__sharedYardV0Session?.().networkState || "").startsWith("join failed")\`, "fresh reopen rejected truthfully");\n\n  const reopen = await evaluate(reopenedPeer, \`({\n    session: window.__sharedYardV0Session?.(),\n    evidence: window.__sharedYardV0Evidence?.(),\n    notice: document.querySelector("#notice")?.textContent || "",\n  })\`);\n  assert(reopen.session?.restartAvailable === false, "fresh reopen incorrectly offers Restart");\n  assert(reopen.evidence?.identity == null, "fresh reopen unexpectedly acquired world identity");\n  assert(reopen.evidence?.session?.end?.kind === "join-failed", \`fresh reopen end kind \${reopen.evidence?.session?.end?.kind}\`);\n  assert(reopen.notice.includes("Couldn’t join this Yard"), \`fresh reopen notice \${reopen.notice}\`);\n\n  const ownerAfterReopen = await evaluate(owner, \`window.__sharedYardV0Evidence()\`);\n  assert(ownerAfterReopen.runtimeFailed === false, \`owner failed after peer reopen \${ownerAfterReopen.runtimeFailureReason}\`);\n  assert(ownerAfterReopen.identity?.worldEpoch === ownerEpochBeforePeerClose, "healthy owner WorldEpoch rotated during peer close/reopen");\n  assert(ownerAfterReopen.localBoundaryTick > ownerBoundaryBeforePeerClose, "healthy owner stopped progressing during peer close/reopen");\n  assert(!String(ownerAfterReopen.networkState || "").startsWith("closed"), \`healthy owner closed during peer reopen \${ownerAfterReopen.networkState}\`);\n\n  Object.assign(result, {`,
  "exercise exact close-tab then fresh-reopen boundary",
);

smoke = replaceExactlyOnce(
  smoke,
  `    peerGuardMatches: peerLive.metrics.guardMatches,\n  });`,
  `    peerGuardMatches: peerLive.metrics.guardMatches,\n    peerTabCloseFreshReopenRejectedTruthfully: true,\n    healthyOwnerWorldEpochPreservedAcrossPeerReopen: true,\n    ownerBoundaryBeforePeerClose,\n    ownerBoundaryAfterPeerReopen: ownerAfterReopen.localBoundaryTick,\n  });`,
  "record close/reopen evidence",
);

smoke = replaceExactlyOnce(
  smoke,
  `  result.ownerDiagnostic = await diagnostic(owner);\n  result.peerDiagnostic = await diagnostic(peer);\n  result.ownerChromeStderr = owner ? Buffer.concat(owner.stderr).toString("utf8").slice(-5000) : null;\n  result.peerChromeStderr = peer ? Buffer.concat(peer.stderr).toString("utf8").slice(-5000) : null;`,
  `  result.ownerDiagnostic = await diagnostic(owner);\n  result.peerDiagnostic = await diagnostic(peer);\n  result.reopenedPeerDiagnostic = await diagnostic(reopenedPeer);\n  result.ownerChromeStderr = owner ? Buffer.concat(owner.stderr).toString("utf8").slice(-5000) : null;\n  result.peerChromeStderr = peer ? Buffer.concat(peer.stderr).toString("utf8").slice(-5000) : null;\n  result.reopenedPeerChromeStderr = reopenedPeer ? Buffer.concat(reopenedPeer.stderr).toString("utf8").slice(-5000) : null;`,
  "preserve reopen diagnostics",
);

smoke = replaceExactlyOnce(
  smoke,
  `} finally {\n  await stopBrowser(peer);\n  await stopBrowser(owner);\n}`,
  `} finally {\n  await stopBrowser(reopenedPeer);\n  await stopBrowser(peer);\n  await stopBrowser(owner);\n}`,
  "clean fresh-reopen browser",
);

writeFileSync(smokePath, smoke);
console.log("WORLD_V0_CLOSURE_STABILIZATION_MATERIALIZED", JSON.stringify({ appPath, smokePath }));
