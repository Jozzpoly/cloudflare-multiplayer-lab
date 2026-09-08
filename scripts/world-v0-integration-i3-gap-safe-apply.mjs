import { readFileSync, writeFileSync } from "node:fs";

const browserPath = "public/world-v0/app.js";
const marker = "I3 gap-safe pending-batch flush";
let browser = readFileSync(browserPath, "utf8");

if (browser.includes(marker)) {
  console.log("WORLD_V0_I3_GAP_SAFE_APPLY already applied");
  process.exit(0);
}

const before = `function queueInputRecord(targetTick, input) {
  pendingBatch.push({ targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });
  if (pendingBatch.length < simulation.timing.inputBatchSize) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("input transport closed while generating canonical records");
  batchSeq += 1;
  const records = pendingBatch.splice(0, simulation.timing.inputBatchSize);
  socket.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...identityFields(),
    batchSeq,
    records,
  }));
}`;

const after = `// I3 gap-safe pending-batch flush. If scheduler cadence skips past one or more
// ticks, never combine an old half-batch with a non-consecutive new record. Flush
// the old record legally as a one-record batch; missing ticks remain missing so the
// authority's existing hold-last/lease semantics preserve temporal truth.
function flushPendingInputBatch() {
  if (!pendingBatch.length) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("input transport closed while generating canonical records");
  batchSeq += 1;
  const records = pendingBatch.splice(0, simulation.timing.inputBatchSize);
  socket.send(JSON.stringify({
    type: "world_v0_input_batch",
    ...identityFields(),
    batchSeq,
    records,
  }));
}

function queueInputRecord(targetTick, input) {
  const previousPending = pendingBatch[pendingBatch.length - 1];
  if (previousPending && targetTick !== previousPending.targetTick + 1) flushPendingInputBatch();
  pendingBatch.push({ targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });
  if (pendingBatch.length >= simulation.timing.inputBatchSize) flushPendingInputBatch();
}`;

const index = browser.indexOf(before);
if (index < 0) throw new Error("I3 gap-safe queueInputRecord marker missing");
if (browser.indexOf(before, index + before.length) >= 0) throw new Error("I3 gap-safe queueInputRecord marker ambiguous");
browser = browser.slice(0, index) + after + browser.slice(index + before.length);

if (!browser.includes(marker) ||
    !browser.includes("targetTick !== previousPending.targetTick + 1") ||
    !browser.includes("if (pendingBatch.length >= simulation.timing.inputBatchSize) flushPendingInputBatch();")) {
  throw new Error("I3 gap-safe patch postcondition failed");
}

writeFileSync(browserPath, browser);
console.log("WORLD_V0_I3_GAP_SAFE_APPLY PASS");
