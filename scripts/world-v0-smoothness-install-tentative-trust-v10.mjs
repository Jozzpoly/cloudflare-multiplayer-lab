import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_TENTATIVE_TRUST_V10";
const alpha = Number(process.argv[2] ?? process.env.MW_WORLD_V0_TENTATIVE_TRUST_ALPHA ?? 1);
if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error(`invalid V10 tentative trust alpha ${alpha}`);

let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("tentative trust v10 already installed");
  process.exit(0);
}

const resolveNeedle = `function resolveInputsForTick(tick, previous) {`;
if (!source.includes(resolveNeedle)) throw new Error("V10 could not find resolveInputsForTick seam");
const helper = `// ${marker} — test-only confidence applied only to mutable peer future records.\n// Authority-consumed input remains canonical and unblended.\nconst __mwV10TentativeTrustAlpha = ${JSON.stringify(alpha)};\nfunction __mwV10BlendTentativeRemote(previousRemote, peerRecord) {\n  return {\n    x: previousRemote.x + (peerRecord.x - previousRemote.x) * __mwV10TentativeTrustAlpha,\n    z: previousRemote.z + (peerRecord.z - previousRemote.z) * __mwV10TentativeTrustAlpha,\n    jump: Boolean(peerRecord.jump),\n  };\n}\nwindow.__mwV10TentativeTrustCorrections = [];\nwindow.__mwV10ResetTentativeTrustEvidence = () => { window.__mwV10TentativeTrustCorrections = []; return true; };\nwindow.__mwV10ReadTentativeTrustEvidence = () => ({\n  revision: \"world-v0-tentative-trust-v10\",\n  alpha: __mwV10TentativeTrustAlpha,\n  corrections: window.__mwV10TentativeTrustCorrections.map((event) => ({\n    ...event,\n    usedBefore: event.usedBefore ? JSON.parse(JSON.stringify(event.usedBefore)) : null,\n    resolvedAfter: event.resolvedAfter ? JSON.parse(JSON.stringify(event.resolvedAfter)) : null,\n  })),\n});\n\n`;
source = source.replace(resolveNeedle, helper + resolveNeedle);

const recordNeedle = `  const remoteRecord = remoteAuth || peerRemote.get(tick) || null;`;
if (!source.includes(recordNeedle)) throw new Error("V10 could not find remote record seam");
source = source.replace(
  recordNeedle,
  `  const remotePeerRecord = remoteAuth ? null : (peerRemote.get(tick) || null);\n  const remoteRecord = remoteAuth || remotePeerRecord || null;`,
);

const remoteNeedle = `  const remote = remoteRecord || previous.remote;`;
if (!source.includes(remoteNeedle)) throw new Error("V10 could not find remote resolution seam");
source = source.replace(
  remoteNeedle,
  `  const remote = remoteAuth\n    ? remoteAuth\n    : (remotePeerRecord ? __mwV10BlendTentativeRemote(previous.remote, remotePeerRecord) : previous.remote);`,
);

const correctionNeedle = `  const after = captureDynamic(localState.sim);\n  const delta = correctionDelta(before, after);`;
if (!source.includes(correctionNeedle)) throw new Error("V10 could not find correction evidence seam");
source = source.replace(
  correctionNeedle,
  `${correctionNeedle}\n  window.__mwV10TentativeTrustCorrections.push({\n    t: performance.now(),\n    reason,\n    targetTick,\n    boundaryBefore: currentBoundary,\n    rewind: currentBoundary - targetTick,\n    usedBefore: usedBefore ? JSON.parse(JSON.stringify(usedBefore)) : null,\n    resolvedAfter: resolvedAfter ? JSON.parse(JSON.stringify(resolvedAfter)) : null,\n  });\n  if (window.__mwV10TentativeTrustCorrections.length > 2048) {\n    window.__mwV10TentativeTrustCorrections.splice(0, window.__mwV10TentativeTrustCorrections.length - 2048);\n  }`,
);

writeFileSync(path, source);
console.log(`WORLD_V0_TENTATIVE_TRUST_V10_INSTALLED alpha=${alpha}`);
