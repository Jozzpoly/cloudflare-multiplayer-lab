import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_REMOTE_PREDICTION_V9_DECAY_FALLBACK";
const factor = Number(process.argv[2] ?? process.env.MW_WORLD_V0_REMOTE_FALLBACK_FACTOR ?? 1);
if (!Number.isFinite(factor) || factor < 0 || factor > 1) throw new Error(`invalid V9 remote fallback factor ${factor}`);

let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("remote prediction v9 already installed");
  process.exit(0);
}

const resolveNeedle = `function resolveInputsForTick(tick, previous) {`;
if (!source.includes(resolveNeedle)) throw new Error("V9 could not find resolveInputsForTick seam");
const helper = `// ${marker} — test-only speculative remote-input policy. Exact authority data still overrides.\nconst __mwV9RemoteFallbackFactor = ${JSON.stringify(factor)};\nfunction __mwV9RemoteFallback(previousRemote) {\n  return {\n    x: previousRemote.x * __mwV9RemoteFallbackFactor,\n    z: previousRemote.z * __mwV9RemoteFallbackFactor,\n    jump: false,\n  };\n}\nwindow.__mwV9RemotePredictionCorrections = [];\nwindow.__mwV9ResetRemotePredictionEvidence = () => { window.__mwV9RemotePredictionCorrections = []; return true; };\nwindow.__mwV9ReadRemotePredictionEvidence = () => ({\n  revision: \"world-v0-remote-prediction-v9-decay-fallback\",\n  fallbackFactor: __mwV9RemoteFallbackFactor,\n  corrections: window.__mwV9RemotePredictionCorrections.map((event) => ({\n    ...event,\n    usedBefore: event.usedBefore ? JSON.parse(JSON.stringify(event.usedBefore)) : null,\n    resolvedAfter: event.resolvedAfter ? JSON.parse(JSON.stringify(event.resolvedAfter)) : null,\n  })),\n});\n\n`;
source = source.replace(resolveNeedle, helper + resolveNeedle);

const fallbackNeedle = `  const remote = remoteRecord || previous.remote;`;
if (!source.includes(fallbackNeedle)) throw new Error("V9 could not find remote carry-forward seam");
source = source.replace(fallbackNeedle, `  const remote = remoteRecord || __mwV9RemoteFallback(previous.remote);`);

const correctionNeedle = `  const after = captureDynamic(localState.sim);\n  const delta = correctionDelta(before, after);`;
if (!source.includes(correctionNeedle)) throw new Error("V9 could not find correction evidence seam");
source = source.replace(
  correctionNeedle,
  `${correctionNeedle}\n  window.__mwV9RemotePredictionCorrections.push({\n    t: performance.now(),\n    reason,\n    targetTick,\n    boundaryBefore: currentBoundary,\n    rewind: currentBoundary - targetTick,\n    usedBefore: usedBefore ? JSON.parse(JSON.stringify(usedBefore)) : null,\n    resolvedAfter: resolvedAfter ? JSON.parse(JSON.stringify(resolvedAfter)) : null,\n  });\n  if (window.__mwV9RemotePredictionCorrections.length > 2048) {\n    window.__mwV9RemotePredictionCorrections.splice(0, window.__mwV9RemotePredictionCorrections.length - 2048);\n  }`,
);

writeFileSync(path, source);
console.log(`WORLD_V0_REMOTE_PREDICTION_V9_INSTALLED factor=${factor}`);
