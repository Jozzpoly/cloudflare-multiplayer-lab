import { readFileSync, writeFileSync } from "node:fs";

// Build on the already-qualified exact/recovery substrate, then add only production
// presentation semantics: confirmed remote position and a bounded lifecycle render barrier.
await import("./world-v0-smoothness-materialize-substrate-v20.mjs");

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_INTEGRATED_SMOOTHNESS_V25";
const REMOTE_DELAY_TICKS = 12;
let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("World V0 integrated smoothness V25 already materialized");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V25 materializer missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V25 materializer ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  "  diagnosticSamples.set(boundaryTick, capturePackedDiagnostic(localState.sim));",
  `  diagnosticSamples.set(boundaryTick, capturePackedDiagnostic(localState.sim));\n  recordRemotePresentationBoundary(boundaryTick);`,
  "remote boundary sample",
);
replaceOnce(
  "  metrics.guardMatches += 1;\n}",
  `  metrics.guardMatches += 1;\n  commitRemotePresentationBoundary(boundaryTick);\n}`,
  "confirmed boundary commit",
);

const remoteSync = `  if (remoteBody && remoteMesh) {\n    const position = bodyPosition(remoteBody);\n    remoteMesh.position.fromArray(position);\n    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();\n    syncPresence(remoteMesh, position);\n  }`;
replaceOnce(
  remoteSync,
  `  if (remoteBody && remoteMesh) {\n    const exactPosition = bodyPosition(remoteBody);\n    const position = remotePresentationPosition(performance.now(), exactPosition) || exactPosition;\n    remoteMesh.position.fromArray(position);\n    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();\n    syncPresence(remoteMesh, position);\n  }`,
  "remote presentation",
);

replaceOnce(
  `function destroyLocalState() {\n  pendingCorrectionTicks.clear();\n  if (!localState) return;`,
  `function destroyLocalState() {\n  pendingCorrectionTicks.clear();\n  resetRemotePresentationState();\n  if (!localState) return;`,
  "presentation teardown",
);

replaceOnce(
  `  updateCamera();\n  renderer.render(scene, camera);`,
  `  updateCamera();\n  if (shouldRenderWorldFrame()) renderer.render(scene, camera);`,
  "lifecycle render barrier",
);

replaceOnce(
  `      remotePresence: remoteMesh?.userData?.presenceLabel?.userData?.presenceText || null,`,
  `      remotePresence: remoteMesh?.userData?.presenceLabel?.userData?.presenceText || null,\n      remoteDisplayedPosition: remoteMesh ? [remoteMesh.position.x, remoteMesh.position.y, remoteMesh.position.z] : null,\n      remotePresentation: remotePresentationEvidence(),`,
  "presentation evidence",
);

source += `\n// ${marker}: production candidate remote presentation state.\nconst WORLD_V0_REMOTE_PRESENTATION_REVISION = "world-v0-remote-confirmed-presentation-v1";\nconst WORLD_V0_REMOTE_PRESENTATION_DELAY_TICKS = ${REMOTE_DELAY_TICKS};\nconst WORLD_V0_REENTRY_RENDER_HOLD_MIN_HIDDEN_MS = 250;\nconst WORLD_V0_REENTRY_RENDER_HOLD_MAX_MS = 1500;\nconst remotePresentationState = {\n  remoteSessionId: null, samples: new Map(), anchors: [], mode: "exact-bootstrap",\n  targetBoundary: null, newestConfirmedBoundary: null,\n  hiddenAt: null, reentryHold: false, reentryStartedAt: null, lastReentryHoldMs: 0, lastReleaseReason: null,\n};\nfunction resetRemotePresentationState() {\n  remotePresentationState.remoteSessionId = null;\n  remotePresentationState.samples.clear();\n  remotePresentationState.anchors = [];\n  remotePresentationState.mode = "exact-bootstrap";\n  remotePresentationState.targetBoundary = null;\n  remotePresentationState.newestConfirmedBoundary = null;\n  remotePresentationState.reentryHold = false;\n  remotePresentationState.reentryStartedAt = null;\n  remotePresentationState.lastReentryHoldMs = 0;\n  remotePresentationState.lastReleaseReason = null;\n}\nfunction ensureRemotePresentationSession() {\n  const sessionId = remoteSessionId || null;\n  if (remotePresentationState.remoteSessionId !== sessionId) {\n    remotePresentationState.remoteSessionId = sessionId;\n    remotePresentationState.samples.clear();\n    remotePresentationState.anchors = [];\n    remotePresentationState.mode = "exact-bootstrap";\n    remotePresentationState.targetBoundary = null;\n    remotePresentationState.newestConfirmedBoundary = null;\n  }\n  return sessionId;\n}\nfunction recordRemotePresentationBoundary(boundary) {\n  if (!Number.isInteger(boundary)) return;\n  const sessionId = ensureRemotePresentationSession();\n  if (!sessionId || !localState?.sim) return;\n  const body = localState.sim.actorBodies.get(sessionId);\n  if (!body) return;\n  remotePresentationState.samples.set(boundary, { boundary, position: bodyPosition(body) });\n  const cutoff = boundary - 512;\n  for (const tick of remotePresentationState.samples.keys()) if (tick < cutoff) remotePresentationState.samples.delete(tick);\n}\nfunction commitRemotePresentationBoundary(boundary) {\n  if (!Number.isInteger(boundary)) return;\n  const sessionId = ensureRemotePresentationSession();\n  if (!sessionId) return;\n  const sample = remotePresentationState.samples.get(boundary);\n  if (!sample || remotePresentationState.anchors.some((anchor) => anchor.boundary === boundary)) return;\n  remotePresentationState.anchors.push({ boundary, position: [...sample.position] });\n  remotePresentationState.anchors.sort((a, b) => a.boundary - b.boundary);\n  if (remotePresentationState.anchors.length > 128) remotePresentationState.anchors.splice(0, remotePresentationState.anchors.length - 128);\n  remotePresentationState.newestConfirmedBoundary = remotePresentationState.anchors[remotePresentationState.anchors.length - 1]?.boundary ?? null;\n}\nfunction remotePresentationPosition(now, exactPosition) {\n  const sessionId = ensureRemotePresentationSession();\n  const anchors = remotePresentationState.anchors;\n  if (!sessionId || anchors.length < 2) {\n    remotePresentationState.mode = "exact-bootstrap";\n    return null;\n  }\n  const phaseEstimate = authorityTickEstimate(now);\n  const leadTicks = Number(simulation?.timing?.clientSimulationLeadTicks ?? 0);\n  if (!Number.isFinite(phaseEstimate) || !Number.isFinite(leadTicks)) {\n    remotePresentationState.mode = "exact-bootstrap";\n    return null;\n  }\n  const target = phaseEstimate + leadTicks - WORLD_V0_REMOTE_PRESENTATION_DELAY_TICKS;\n  remotePresentationState.targetBoundary = target;\n  const earliest = anchors[0];\n  const latest = anchors[anchors.length - 1];\n  remotePresentationState.newestConfirmedBoundary = latest.boundary;\n  if (target <= earliest.boundary) {\n    remotePresentationState.mode = "exact-bootstrap";\n    return null;\n  }\n  if (target >= latest.boundary) {\n    remotePresentationState.mode = Math.abs(target - latest.boundary) < 1e-9 ? "latest-exact" : "underrun-hold";\n    return [...latest.position];\n  }\n  for (let index = anchors.length - 1; index >= 1; index -= 1) {\n    const to = anchors[index];\n    const from = anchors[index - 1];\n    if (from.boundary <= target && target <= to.boundary) {\n      const alpha = (target - from.boundary) / Math.max(1, to.boundary - from.boundary);\n      remotePresentationState.mode = "interpolate";\n      return [\n        from.position[0] + (to.position[0] - from.position[0]) * alpha,\n        from.position[1] + (to.position[1] - from.position[1]) * alpha,\n        from.position[2] + (to.position[2] - from.position[2]) * alpha,\n      ];\n    }\n  }\n  remotePresentationState.mode = "underrun-hold";\n  return exactPosition ? [...exactPosition] : null;\n}\nfunction releaseReentryRenderHold(reason) {\n  if (!remotePresentationState.reentryHold) return;\n  const now = performance.now();\n  remotePresentationState.lastReentryHoldMs = remotePresentationState.reentryStartedAt === null ? 0 : Math.max(0, now - remotePresentationState.reentryStartedAt);\n  remotePresentationState.lastReleaseReason = reason;\n  remotePresentationState.reentryHold = false;\n  remotePresentationState.reentryStartedAt = null;\n}\nfunction shouldRenderWorldFrame() {\n  if (!remotePresentationState.reentryHold) return true;\n  if (runtimeFailed) { releaseReentryRenderHold("runtime-failed"); return true; }\n  const elapsed = remotePresentationState.reentryStartedAt === null ? 0 : performance.now() - remotePresentationState.reentryStartedAt;\n  if (elapsed >= WORLD_V0_REENTRY_RENDER_HOLD_MAX_MS) { releaseReentryRenderHold("timeout"); return true; }\n  const local = Number.isInteger(localState?.boundaryTick) ? localState.boundaryTick : null;\n  const authority = Number.isInteger(metrics.latestAuthorityBoundary) ? metrics.latestAuthorityBoundary : null;\n  const exactReady = Number.isInteger(local) && Number.isInteger(authority) && local >= authority - 4;\n  const presentationReady = !remoteSessionId || remotePresentationState.mode === "interpolate" || remotePresentationState.mode === "latest-exact";\n  if (exactReady && presentationReady) { releaseReentryRenderHold("ready"); return true; }\n  return false;\n}\ndocument.addEventListener("visibilitychange", () => {\n  const now = performance.now();\n  if (document.visibilityState !== "visible") {\n    remotePresentationState.hiddenAt = now;\n    return;\n  }\n  const hiddenMs = remotePresentationState.hiddenAt === null ? 0 : Math.max(0, now - remotePresentationState.hiddenAt);\n  remotePresentationState.hiddenAt = null;\n  if (hiddenMs >= WORLD_V0_REENTRY_RENDER_HOLD_MIN_HIDDEN_MS && localState) {\n    remotePresentationState.reentryHold = true;\n    remotePresentationState.reentryStartedAt = now;\n    remotePresentationState.lastReleaseReason = null;\n  }\n});\nfunction remotePresentationEvidence() {\n  return {\n    revision: WORLD_V0_REMOTE_PRESENTATION_REVISION,\n    delayTicks: WORLD_V0_REMOTE_PRESENTATION_DELAY_TICKS,\n    mode: remotePresentationState.mode,\n    confirmedAnchorCount: remotePresentationState.anchors.length,\n    newestConfirmedBoundary: remotePresentationState.newestConfirmedBoundary,\n    targetBoundary: remotePresentationState.targetBoundary,\n    reentryHold: remotePresentationState.reentryHold,\n    lastReentryHoldMs: remotePresentationState.lastReentryHoldMs,\n    lastReleaseReason: remotePresentationState.lastReleaseReason,\n  };\n}\n`;

for (const forbidden of ["__mwV", "WORLD_V0_CONFIRMED_TIMELINE_V11", "WORLD_V0_PHASE_DELAY_REMOTE_V13", "WORLD_V0_REENTRY_PRESENTATION_BARRIER_V24"]) {
  if (source.includes(forbidden)) throw new Error(`V25 candidate leaked experimental hook ${forbidden}`);
}

writeFileSync(path, source);
console.log("WORLD_V0_INTEGRATED_SMOOTHNESS_V25_MATERIALIZED");
