import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
let source = readFileSync(path, "utf8");
const MARKER = "WORLD_V0_I4B_HALF_OPEN_LIVENESS_V1";
if (source.includes(MARKER)) {
  console.log("WORLD_V0_I4B_LIVENESS_APPLY already applied");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`I4b liveness marker ${label}: expected 1 occurrence, got ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
`const ACTOR_RESUME_REVISION = "world-v0-browser-actor-resume-v1";
const AUTHORITY_REBASE_SEED_REVISION = "world-v0-authority-rebase-seed-v1";
const EPS = 1e-9;`,
`const ACTOR_RESUME_REVISION = "world-v0-browser-actor-resume-v1";
const AUTHORITY_REBASE_SEED_REVISION = "world-v0-authority-rebase-seed-v1";
// WORLD_V0_I4B_HALF_OPEN_LIVENESS_V1
// Freeze before the client can outrun the retained rewind horizon. A tick-distance
// guard is deliberately used instead of a wall-clock timeout so renderer stalls
// cannot manufacture a false transport failure.
const AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS = 4;
const EPS = 1e-9;`,
"constants",
);

replaceOnce(
`let phaseAnchor = null;
let localState = null;
let batchSeq = 0;`,
`let phaseAnchor = null;
let localState = null;
let lastAuthorityBoundaryTick = null;
let batchSeq = 0;`,
"authority boundary state",
);

replaceOnce(
`  serverRejected: 0,
  rebases: 0,`,
`  serverRejected: 0,
  authoritySilenceResumes: 0,
  latestAuthorityBoundary: null,
  maxAuthoritySilenceTicks: 0,
  rebases: 0,`,
"liveness metrics",
);

replaceOnce(
`function reconnectActorSession() {
  if (!actorResume.pending || runtimeFailed) return false;
  if (socket && socket.readyState !== WebSocket.CLOSED) return false;`,
`function reconnectActorSession() {
  if (!actorResume.pending || runtimeFailed) return false;
  if (socket && socket.readyState === WebSocket.CONNECTING) return false;`,
"resume connecting guard",
);

replaceOnce(
`function scheduleActorResume() {
  if (!actorResume.pending || runtimeFailed) return false;
  if (actorResume.timer || (socket && socket.readyState !== WebSocket.CLOSED)) return true;`,
`function scheduleActorResume() {
  if (!actorResume.pending || runtimeFailed) return false;
  if (actorResume.timer || (socket && socket.readyState === WebSocket.CONNECTING)) return true;`,
"resume scheduler guard",
);

replaceOnce(
`function recoverableRoomEpochReason(reason) {`,
`function beginActorResume(reason, details = {}) {
  if (actorResume.pending || runtimeFailed || roomRecovery.pending || !localState || !identity || !resumeToken) return false;
  actorResume.pending = true;
  actorResume.attempts = 0;
  actorResume.sourceBoundary = localState.boundaryTick;
  metrics.authoritySilenceResumes += 1;
  neutralizeTransientInputs();
  playing = false;
  stopLogicalInputScheduler();
  if (pingTimer) clearInterval(pingTimer);
  if (hudTimer) clearInterval(hudTimer);
  pingTimer = null;
  hudTimer = null;
  pendingPings.clear();
  networkState = "authority silence · actor resume pending";
  recordLifecycle("actor-resume-pending", {
    reason,
    sourceBoundary: actorResume.sourceBoundary,
    lastAuthorityBoundaryTick,
    ...details,
  });
  showNotice("Connection stalled · restoring exact Shared Yard state…");
  updateProductStatus();

  // Do not wait for a half-open WebSocket to report CLOSED. The authority resume
  // contract atomically supersedes the prior socket for the same ActorSession.
  // Retire this browser connection immediately; its later events are ignored by
  // per-connection identity guards installed in connect().
  const staleSocket = socket;
  socket = null;
  try { staleSocket?.close(4000, "actor_resume_superseded"); } catch { /* half-open transport */ }
  scheduleActorResume();
  return true;
}

function recoverableRoomEpochReason(reason) {`,
"half-open resume entry",
);

replaceOnce(
`function connect() {
  networkState = "connecting";
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    networkState = "syncing";`,
`function connect() {
  networkState = "connecting";
  const connection = new WebSocket(socketUrl());
  socket = connection;
  connection.addEventListener("open", () => {
    if (socket !== connection) return;
    networkState = "syncing";`,
"connection identity open",
);

replaceOnce(
`  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      handleMessage(JSON.parse(event.data));`,
`  connection.addEventListener("message", (event) => {
    if (socket !== connection || typeof event.data !== "string") return;
    try {
      const message = JSON.parse(event.data);
      const observedBoundary = Number.isInteger(message?.boundaryTick)
        ? message.boundaryTick
        : (Number.isInteger(message?.state?.boundaryTick) ? message.state.boundaryTick : null);
      if (Number.isInteger(observedBoundary)) {
        lastAuthorityBoundaryTick = lastAuthorityBoundaryTick === null
          ? observedBoundary
          : Math.max(lastAuthorityBoundaryTick, observedBoundary);
        metrics.latestAuthorityBoundary = lastAuthorityBoundaryTick;
      }
      handleMessage(message);`,
"connection identity message",
);

replaceOnce(
`  socket.addEventListener("close", (event) => {
    playing = false;`,
`  connection.addEventListener("close", (event) => {
    if (socket !== connection) return;
    playing = false;`,
"connection identity close",
);

replaceOnce(
`  socket.addEventListener("error", () => {
    networkState = "network error";`,
`  connection.addEventListener("error", () => {
    if (socket !== connection) return;
    networkState = "network error";`,
"connection identity error",
);

replaceOnce(
`function advancePrediction() {
  if (!localState || !phaseAnchor || runtimeFailed) return;
  const estimate = authorityTickEstimate();`,
`function advancePrediction() {
  if (!localState || !phaseAnchor || runtimeFailed || actorResume.pending) return;
  if (Number.isInteger(lastAuthorityBoundaryTick) && Number.isInteger(simulation?.clientHistory?.retainTicks)) {
    const silenceTicks = Math.max(0, localState.boundaryTick - lastAuthorityBoundaryTick);
    metrics.maxAuthoritySilenceTicks = Math.max(metrics.maxAuthoritySilenceTicks, silenceTicks);
    const safeBlindTicks = Math.max(1, simulation.clientHistory.retainTicks - AUTHORITY_SILENCE_RETAIN_MARGIN_TICKS);
    if (silenceTicks >= safeBlindTicks) {
      beginActorResume("authority_silence_history_guard", { silenceTicks, safeBlindTicks });
      return;
    }
  }
  const estimate = authorityTickEstimate();`,
"prediction half-open guard",
);

replaceOnce(
`  selfSlot = null;
  resumeToken = null;
  clearActorResumeTimer();`,
`  selfSlot = null;
  resumeToken = null;
  lastAuthorityBoundaryTick = null;
  clearActorResumeTimer();`,
"reset authority boundary",
);

replaceOnce(
`    serverRejected: 0,
    rebases: 0,`,
`    serverRejected: 0,
    authoritySilenceResumes: 0,
    latestAuthorityBoundary: null,
    maxAuthoritySilenceTicks: 0,
    rebases: 0,`,
"reset liveness metrics",
);

writeFileSync(path, source);
console.log("WORLD_V0_I4B_LIVENESS_APPLY PASS");
