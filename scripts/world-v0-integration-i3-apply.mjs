import { readFileSync, writeFileSync } from "node:fs";

const contractPath = "src/world-v0-contract.ts";
const browserPath = "public/world-v0/app.js";
let contract = readFileSync(contractPath, "utf8");
let browser = readFileSync(browserPath, "utf8");

const NEW_CONTRACT = "shared-yard-v0-contract-v4-logical-input-scheduler";
const NEW_CLIENT = "shared-yard-v0-browser-sim-v4-logical-input-scheduler";
const MARKER = "I3 logical input authorship scheduler";

if (contract.includes(NEW_CONTRACT) && contract.includes(NEW_CLIENT) && browser.includes(MARKER)) {
  console.log("WORLD_V0_I3_APPLY already applied");
  process.exit(0);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`I3 patch marker missing: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`I3 patch marker ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

contract = replaceOnce(
  contract,
  `export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v3-supersession";`,
  `export const WORLD_V0_CONTRACT_REVISION = "${NEW_CONTRACT}";`,
  "contract generation",
);
contract = replaceOnce(
  contract,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v3-supersession";`,
  `export const WORLD_V0_CLIENT_SIM_REVISION = "${NEW_CLIENT}";`,
  "client simulation generation",
);

browser = replaceOnce(
  browser,
  `let pendingBatch = [];\nlet pingTimer = null;`,
  `let pendingBatch = [];\nlet logicalInputTimer = null;\nlet logicalInputPumps = 0;\nlet logicalInputAuthored = 0;\nlet logicalInputSuperseded = 0;\nlet pingTimer = null;`,
  "scheduler lifecycle state",
);

browser = replaceOnce(
  browser,
  `function queueInputRecord(targetTick, input) {`,
  `function sendInputRevisionRecords(records) {\n  if (!records.length) return;\n  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("input transport closed while revising canonical records");\n  let cursor = 0;\n  while (cursor < records.length) {\n    const chunk = [records[cursor]];\n    cursor += 1;\n    while (cursor < records.length &&\n        chunk.length < simulation.timing.inputBatchSize &&\n        records[cursor].targetTick === chunk[chunk.length - 1].targetTick + 1) {\n      chunk.push(records[cursor]);\n      cursor += 1;\n    }\n    batchSeq += 1;\n    socket.send(JSON.stringify({\n      type: "world_v0_input_batch",\n      ...identityFields(),\n      batchSeq,\n      records: chunk,\n    }));\n  }\n}\n\nfunction queueInputRecord(targetTick, input) {`,
  "revision sender",
);

browser = replaceOnce(
  browser,
  `function consumeIntendedInput() {\n  const movement = currentInput();\n  const jump = jumpQueued;\n  jumpQueued = false;\n  return { x: movement.x, z: movement.z, jump };\n}\n\nfunction sameInput(a, c) {`,
  `function consumeIntendedInput() {\n  const movement = currentInput();\n  const jump = jumpQueued;\n  jumpQueued = false;\n  return { x: movement.x, z: movement.z, jump };\n}\n\n// I3 logical input authorship scheduler. This is deliberately a same-main-thread\n// fixed logical clock: it decouples canonical intent production from rAF while the\n// event loop is runnable, without claiming survival of a fully blocked main thread.\nfunction stopLogicalInputScheduler() {\n  if (logicalInputTimer) clearInterval(logicalInputTimer);\n  logicalInputTimer = null;\n}\n\nfunction pumpLogicalInputScheduler() {\n  if (!playing || runtimeFailed || !simulation || protocolStartTick === null || !phaseAnchor) return;\n  if (!socket || socket.readyState !== WebSocket.OPEN) return;\n  const estimate = authorityTickEstimate();\n  if (!Number.isFinite(estimate)) return;\n\n  const startTick = Math.max(protocolStartTick, Math.floor(estimate));\n  const authoredThrough = Math.floor(estimate + simulation.timing.predictionLeadTicks) - 1;\n  if (authoredThrough < startTick) return;\n\n  logicalInputPumps += 1;\n  const movement = currentInput();\n  const jumpTarget = jumpQueued ? startTick : null;\n  if (jumpTarget !== null) jumpQueued = false;\n  const revisions = [];\n\n  for (let tick = startTick; tick <= authoredThrough; tick += 1) {\n    const existing = intendedSelf.get(tick);\n    if (!existing) {\n      const next = { x: movement.x, z: movement.z, jump: tick === jumpTarget };\n      intendedSelf.set(tick, next);\n      queueInputRecord(tick, next);\n      logicalInputAuthored += 1;\n      continue;\n    }\n\n    const next = {\n      x: movement.x,\n      z: movement.z,\n      // Movement/camera revisions must not erase an already-authored one-shot jump.\n      jump: Boolean(existing.jump || tick === jumpTarget),\n    };\n    if (sameInput(existing, next)) continue;\n    intendedSelf.set(tick, next);\n\n    const unsent = pendingBatch.find((record) => record.targetTick === tick);\n    if (unsent) {\n      unsent.x = next.x;\n      unsent.z = next.z;\n      unsent.jump = Boolean(next.jump);\n    } else {\n      revisions.push({ targetTick: tick, x: next.x, z: next.z, jump: Boolean(next.jump) });\n      logicalInputSuperseded += 1;\n    }\n  }\n\n  sendInputRevisionRecords(revisions);\n}\n\nfunction startLogicalInputScheduler() {\n  stopLogicalInputScheduler();\n  pumpLogicalInputScheduler();\n  logicalInputTimer = setInterval(() => {\n    if (!playing || runtimeFailed) return;\n    try { pumpLogicalInputScheduler(); }\n    catch (error) {\n      stopLogicalInputScheduler();\n      candidateError(error);\n    }\n  }, STEP_MS);\n}\n\nfunction sameInput(a, c) {`,
  "logical scheduler",
);

browser = replaceOnce(
  browser,
  `function applyResolvedTick(sim, tick, allowGenerateSelf) {\n  if (allowGenerateSelf && protocolStartTick !== null && tick >= protocolStartTick && !intendedSelf.has(tick)) {\n    const intended = consumeIntendedInput();\n    intendedSelf.set(tick, { ...intended });\n    queueInputRecord(tick, intended);\n  }\n  const previous = previousUsedInput(tick);`,
  `function applyResolvedTick(sim, tick, allowGenerateSelf) {\n  // I3: prediction/replay only consume the canonical intended-input timeline.\n  // Authorship belongs exclusively to pumpLogicalInputScheduler().\n  void allowGenerateSelf;\n  const previous = previousUsedInput(tick);`,
  "remove prediction authorship",
);

browser = replaceOnce(
  browser,
  `  updatePhaseFromStart(message, performance.now());\n  if (!selfMesh) selfMesh = createPlayerMesh(true);`,
  `  updatePhaseFromStart(message, performance.now());\n  startLogicalInputScheduler();\n  if (!selfMesh) selfMesh = createPlayerMesh(true);`,
  "start scheduler with protocol",
);

browser = replaceOnce(
  browser,
  `function resetProtocolState({ preserveRoomRecovery = false } = {}) {\n  destroyLocalState();`,
  `function resetProtocolState({ preserveRoomRecovery = false } = {}) {\n  stopLogicalInputScheduler();\n  logicalInputPumps = 0;\n  logicalInputAuthored = 0;\n  logicalInputSuperseded = 0;\n  destroyLocalState();`,
  "reset scheduler",
);

browser = replaceOnce(
  browser,
  `  socket.addEventListener("close", (event) => {\n    playing = false;`,
  `  socket.addEventListener("close", (event) => {\n    playing = false;\n    stopLogicalInputScheduler();`,
  "stop scheduler on transport close",
);

browser = replaceOnce(
  browser,
  `  if (playing && !runtimeFailed) {\n    try {\n      advancePrediction();`,
  `  if (playing && !runtimeFailed) {\n    try {\n      // Keep scheduler ownership even when rAF is healthy; the interval remains the\n      // independent progress source when rAF cadence degrades.\n      pumpLogicalInputScheduler();\n      advancePrediction();`,
  "rAF safety pump",
);

browser = replaceOnce(
  browser,
  `    runtimeFailed,\n    metrics: { ...metrics },`,
  `    runtimeFailed,\n    inputScheduler: {\n      revision: "shared-yard-v0-logical-input-scheduler-v1",\n      active: logicalInputTimer !== null,\n      pumps: logicalInputPumps,\n      authored: logicalInputAuthored,\n      superseded: logicalInputSuperseded,\n      cadenceMs: STEP_MS,\n      ownsCanonicalAuthorship: true,\n    },\n    metrics: { ...metrics },`,
  "scheduler evidence",
);

if (!contract.includes(NEW_CONTRACT) || !contract.includes(NEW_CLIENT) ||
    !browser.includes(MARKER) ||
    !browser.includes("ownsCanonicalAuthorship: true") ||
    browser.includes("intendedSelf.set(tick, { ...intended });\n    queueInputRecord(tick, intended);")) {
  throw new Error("I3 patch postcondition failed");
}

writeFileSync(contractPath, contract);
writeFileSync(browserPath, browser);
console.log("WORLD_V0_I3_APPLY PASS");
