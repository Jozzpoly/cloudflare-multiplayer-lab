import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_PRESENTATION_V7_REMOTE_CORRECTION_OFFSET";
const halfLifeMs = Number(process.argv[2] || process.env.MW_WORLD_V0_PRESENTATION_HALF_LIFE_MS || 100);
if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) throw new Error(`invalid V7 half-life ${halfLifeMs}`);

let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("presentation v7 already installed");
  process.exit(0);
}

const syncNeedle = `function syncMeshes() {`;
if (!source.includes(syncNeedle)) throw new Error("V7 could not find syncMeshes seam");

const helpers = `// ${marker} — test-only presentation experiment. Canonical source is restored after CI.\nconst __mwV7HalfLifeMs = ${JSON.stringify(halfLifeMs)};\nconst __mwV7Presentation = {\n  sessionId: null,\n  offset: [0, 0, 0],\n  pendingRecovery: [0, 0, 0],\n  lastAt: performance.now(),\n  injections: [],\n  syncs: [],\n};\nfunction __mwV7VecAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }\nfunction __mwV7VecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }\nfunction __mwV7VecScale(a, scalar) { return [a[0] * scalar, a[1] * scalar, a[2] * scalar]; }\nfunction __mwV7VecMagnitude(a) { return Math.hypot(a[0], a[1], a[2]); }\nfunction __mwV7ResetForSession(sessionId = remoteSessionId) {\n  __mwV7Presentation.sessionId = sessionId || null;\n  __mwV7Presentation.offset = [0, 0, 0];\n  __mwV7Presentation.pendingRecovery = [0, 0, 0];\n  __mwV7Presentation.lastAt = performance.now();\n}\nfunction __mwV7EnsureSession() {\n  if (__mwV7Presentation.sessionId !== (remoteSessionId || null)) __mwV7ResetForSession(remoteSessionId);\n}\nfunction __mwV7DecayTo(now) {\n  const dtMs = Math.max(0, now - __mwV7Presentation.lastAt);\n  if (dtMs <= 0) return;\n  const before = __mwV7Presentation.offset;\n  const factor = Math.pow(0.5, dtMs / __mwV7HalfLifeMs);\n  const after = __mwV7VecScale(before, factor);\n  const recovery = __mwV7VecSub(after, before);\n  __mwV7Presentation.offset = after;\n  __mwV7Presentation.pendingRecovery = __mwV7VecAdd(__mwV7Presentation.pendingRecovery, recovery);\n  __mwV7Presentation.lastAt = now;\n}\nfunction __mwV7ApplyRemoteCorrection(before, after, reason, targetTick, boundaryBefore) {\n  __mwV7EnsureSession();\n  const beforePosition = before.actors.get(remoteSessionId)?.position;\n  const afterPosition = after.actors.get(remoteSessionId)?.position;\n  if (!beforePosition || !afterPosition) return;\n  const now = performance.now();\n  __mwV7DecayTo(now);\n  const exactCorrection = __mwV7VecSub(afterPosition, beforePosition);\n  if (__mwV7VecMagnitude(exactCorrection) <= 1e-12) return;\n  const offsetBeforeInjection = [...__mwV7Presentation.offset];\n  const presentedBefore = __mwV7VecAdd(beforePosition, offsetBeforeInjection);\n  __mwV7Presentation.offset = __mwV7VecSub(__mwV7Presentation.offset, exactCorrection);\n  const presentedAfter = __mwV7VecAdd(afterPosition, __mwV7Presentation.offset);\n  const continuityResidual = __mwV7VecSub(presentedAfter, presentedBefore);\n  __mwV7Presentation.injections.push({\n    t: now, reason, targetTick, boundaryBefore,\n    exactCorrection: [...exactCorrection],\n    offsetBeforeInjection,\n    offsetAfterInjection: [...__mwV7Presentation.offset],\n    continuityResidual,\n    continuityResidualMagnitude: __mwV7VecMagnitude(continuityResidual),\n  });\n  if (__mwV7Presentation.injections.length > 2048) __mwV7Presentation.injections.splice(0, __mwV7Presentation.injections.length - 2048);\n}\nfunction __mwV7PresentedRemotePosition(exactPosition) {\n  __mwV7EnsureSession();\n  const now = performance.now();\n  __mwV7DecayTo(now);\n  const recoveryVector = [...__mwV7Presentation.pendingRecovery];\n  __mwV7Presentation.pendingRecovery = [0, 0, 0];\n  const presented = __mwV7VecAdd(exactPosition, __mwV7Presentation.offset);\n  __mwV7Presentation.syncs.push({\n    t: now, boundaryTick: localState?.boundaryTick ?? null,\n    exactPosition: [...exactPosition],\n    presentedPosition: [...presented],\n    offset: [...__mwV7Presentation.offset],\n    offsetMagnitude: __mwV7VecMagnitude(__mwV7Presentation.offset),\n    recoveryVector,\n    recoveryMagnitude: __mwV7VecMagnitude(recoveryVector),\n  });\n  if (__mwV7Presentation.syncs.length > 4096) __mwV7Presentation.syncs.splice(0, __mwV7Presentation.syncs.length - 4096);\n  return presented;\n}\nwindow.__mwV7ResetPresentation = () => {\n  __mwV7Presentation.injections = [];\n  __mwV7Presentation.syncs = [];\n  __mwV7ResetForSession(remoteSessionId);\n  return true;\n};\nwindow.__mwV7ReadPresentation = () => ({\n  revision: \"world-v0-presentation-v7-remote-correction-offset-experiment\",\n  halfLifeMs: __mwV7HalfLifeMs,\n  sessionId: __mwV7Presentation.sessionId,\n  offset: [...__mwV7Presentation.offset],\n  injections: __mwV7Presentation.injections.map((event) => ({ ...event, exactCorrection: [...event.exactCorrection], offsetBeforeInjection: [...event.offsetBeforeInjection], offsetAfterInjection: [...event.offsetAfterInjection], continuityResidual: [...event.continuityResidual] })),\n  syncs: __mwV7Presentation.syncs.map((event) => ({ ...event, exactPosition: [...event.exactPosition], presentedPosition: [...event.presentedPosition], offset: [...event.offset], recoveryVector: [...event.recoveryVector] })),\n});\n\n`;
source = source.replace(syncNeedle, helpers + syncNeedle);

const correctionNeedle = `  const after = captureDynamic(localState.sim);\n  const delta = correctionDelta(before, after);`;
if (!source.includes(correctionNeedle)) throw new Error("V7 could not find correction seam");
source = source.replace(
  correctionNeedle,
  `${correctionNeedle}\n  __mwV7ApplyRemoteCorrection(before, after, reason, targetTick, currentBoundary);`,
);

const remoteNeedle = `  if (remoteBody && remoteMesh) {\n    const position = bodyPosition(remoteBody);\n    remoteMesh.position.fromArray(position);\n    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();\n    syncPresence(remoteMesh, position);\n  }`;
if (!source.includes(remoteNeedle)) throw new Error("V7 could not find remote presentation seam");
source = source.replace(
  remoteNeedle,
  `  if (remoteBody && remoteMesh) {\n    const position = bodyPosition(remoteBody);\n    const presentedPosition = __mwV7PresentedRemotePosition(position);\n    remoteMesh.position.fromArray(presentedPosition);\n    remoteMesh.quaternion.fromArray(bodyRotation(remoteBody)).normalize();\n    syncPresence(remoteMesh, presentedPosition);\n  }`,
);

writeFileSync(path, source);
console.log(`WORLD_V0_PRESENTATION_V7_INSTALLED halfLifeMs=${halfLifeMs}`);
