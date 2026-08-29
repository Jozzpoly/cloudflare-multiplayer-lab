const canvas = document.querySelector("#game");
const ctx = canvas?.getContext("2d");
const boot = document.querySelector("#boot");
const callsignInput = document.querySelector("#callsign");
const playButton = document.querySelector("#play");
const netDot = document.querySelector("#net-dot");
const netState = document.querySelector("#net-state");
const rttEl = document.querySelector("#rtt");
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");
const scoreboardEl = document.querySelector("#scoreboard");
const feedEl = document.querySelector("#feed");
const joystickEl = document.querySelector("#joystick");
const stickEl = document.querySelector("#stick");
const dashButton = document.querySelector("#dash");
const dashCooldownEl = document.querySelector("#dash-cooldown");
const labToggle = document.querySelector("#lab-toggle");
const labPanel = document.querySelector("#lab-panel");
const labClose = document.querySelector("#lab-close");
const seedInput = document.querySelector("#run-seed");
const resetButton = document.querySelector("#reset-run");

const metricIds = [
  "m-run", "m-sim", "m-snapshot", "m-tick-p95", "m-drift-p95", "m-dropped",
  "m-rtt", "m-snapshot-age", "m-correction", "m-fps", "m-input-rate", "m-bytes",
];
const metrics = Object.fromEntries(metricIds.map((id) => [id, document.querySelector(`#${id}`)]));

const required = [
  canvas, ctx, boot, callsignInput, playButton, netDot, netState, rttEl, scoreEl, comboEl,
  scoreboardEl, feedEl, joystickEl, stickEl, dashButton, dashCooldownEl, labToggle, labPanel,
  labClose, seedInput, resetButton, ...Object.values(metrics),
];
if (required.some((item) => !item)) throw new Error("Gate 4A UI is incomplete.");

const WORLD_FALLBACK = { width: 1600, height: 1000 };
const ACCELERATION = 920;
const DRAG = 5.2;
const MAX_SPEED = 330;
const DASH_IMPULSE = 310;
const DASH_COOLDOWN_MS = 1250;
const INPUT_INTERVAL_MS = 66;
const PLAYER_RADIUS = 18;
const SAMPLE_LIMIT = 160;

const keys = new Set();
const players = new Map();
const pickups = new Map();
const particles = [];
const pendingPings = new Map();
const rttSamples = [];
const correctionSamples = [];
const snapshotGapSamples = [];
const fpsSamples = [];

let world = { ...WORLD_FALLBACK };
let simulation = { simulationHz: 20, snapshotHz: 10, inputLeaseMs: 600 };
let run = { id: "—", seed: 0, tick: 0 };
let serverTelemetry = null;
let socket = null;
let playing = false;
let reconnectTimer = null;
let inputTimer = null;
let pingTimer = null;
let telemetryTimer = null;
let selfSessionId = null;
let localPlayer = null;
let inputSeq = 0;
let dashQueued = false;
let dashPredictionUntil = 0;
let localDashReadyAt = 0;
let lastFrameAt = performance.now();
let lastSnapshotAt = null;
let lastSnapshotAgeMs = null;
let serverClockOffsetMs = null;
let joystickPointer = null;
let joystickInput = { x: 0, y: 0 };
let dpr = 1;
let viewportWidth = innerWidth;
let viewportHeight = innerHeight;

let rateWindowStartedAt = performance.now();
let rateInputs = 0;
let rateSnapshots = 0;
let rateInboundBytes = 0;
let rateOutboundBytes = 0;
let clientRates = { inputsPerSec: 0, snapshotsPerSec: 0, inboundBytesPerSec: 0, outboundBytesPerSec: 0 };

const storedCallsign = localStorage.getItem("neon-salvage-callsign");
callsignInput.value = storedCallsign || `P-${crypto.randomUUID().slice(0, 6)}`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function pushSample(target, value) {
  if (!Number.isFinite(value)) return;
  target.push(value);
  if (target.length > SAMPLE_LIMIT) target.splice(0, target.length - SAMPLE_LIMIT);
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

function setNetwork(state, tone = "idle") {
  netState.textContent = state;
  netDot.classList.toggle("live", tone === "live");
  netDot.classList.toggle("bad", tone === "bad");
}

function addFeed(text, hue = 195) {
  const line = document.createElement("div");
  line.textContent = text;
  line.style.color = `hsl(${hue} 90% 72%)`;
  feedEl.prepend(line);
  window.setTimeout(() => line.remove(), 2600);
}

function resizeCanvas() {
  viewportWidth = innerWidth;
  viewportHeight = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(viewportWidth * dpr));
  canvas.height = Math.max(1, Math.floor(viewportHeight * dpr));
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;
}

function socketUrl() {
  const url = new URL("/game/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("player", callsignInput.value.trim());
  return url.toString();
}

function scheduleReconnect() {
  if (!playing || reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 1100);
}

function stopNetworkLoops() {
  if (inputTimer) clearInterval(inputTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (telemetryTimer) clearInterval(telemetryTimer);
  inputTimer = null;
  pingTimer = null;
  telemetryTimer = null;
}

function startNetworkLoops() {
  stopNetworkLoops();
  inputTimer = window.setInterval(sendInput, INPUT_INTERVAL_MS);
  pingTimer = window.setInterval(sendPing, 2000);
  telemetryTimer = window.setInterval(renderTelemetry, 250);
  sendInput();
  sendPing();
}

function connect() {
  if (!playing || (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))) return;

  setNetwork("connecting", "idle");
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    setNetwork("syncing", "idle");
    startNetworkLoops();
  });

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    rateInboundBytes += event.data.length;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    handleMessage(message);
  });

  socket.addEventListener("close", () => {
    stopNetworkLoops();
    setNetwork("reconnecting", "bad");
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => setNetwork("network error", "bad"));
}

function handleMessage(message) {
  if (message.type === "welcome") {
    world = message.world || WORLD_FALLBACK;
    simulation = message.simulation || simulation;
    run = message.run || run;
    serverTelemetry = message.telemetry || null;
    seedInput.value = String(run.seed >>> 0);
    applyFullState(message.players || [], message.pickups || [], message.self);
    setNetwork("live", "live");
    addFeed(`SIM LOCK · ${simulation.simulationHz} Hz server / ${simulation.snapshotHz} Hz snapshots`, 150);
    return;
  }

  if (message.type === "run_reset") {
    run = message.run || run;
    simulation = message.simulation || simulation;
    seedInput.value = String(run.seed >>> 0);
    applyFullState(message.players || [], message.pickups || [], null);
    correctionSamples.length = 0;
    snapshotGapSamples.length = 0;
    addFeed(`RUN RESET · seed ${run.seed} · by ${message.requestedBy}`, 48);
    return;
  }

  if (message.type === "snapshot") {
    const receivedAt = performance.now();
    if (lastSnapshotAt !== null) pushSample(snapshotGapSamples, receivedAt - lastSnapshotAt);
    lastSnapshotAt = receivedAt;
    rateSnapshots += 1;
    run = message.run || run;
    serverTelemetry = message.telemetry || serverTelemetry;

    if (serverClockOffsetMs !== null && Number.isFinite(message.serverTime)) {
      lastSnapshotAgeMs = Date.now() - message.serverTime + serverClockOffsetMs;
    }

    for (const player of message.players || []) {
      upsertAuthoritativePlayer(player);
    }

    const liveSessions = new Set((message.players || []).map((player) => player.sessionId));
    for (const sessionId of players.keys()) {
      if (!liveSessions.has(sessionId)) players.delete(sessionId);
    }
    return;
  }

  if (message.type === "player_joined" && message.player) {
    upsertPlayer(message.player, true);
    if (message.player.sessionId !== selfSessionId) addFeed(`${message.player.playerId} entered the grid`, message.player.hue);
    return;
  }

  if (message.type === "player_left") {
    players.delete(message.sessionId);
    addFeed(`${message.playerId} left the grid`, 340);
    return;
  }

  if (message.type === "collect") {
    if (message.replacement) pickups.set(message.pickupId, message.replacement);
    const own = message.playerId === callsignInput.value.trim();
    addFeed(`${message.playerId} +${message.points} ${message.pickupKind === "core" ? "CORE" : "SHARD"} · x${message.combo}`, own ? 52 : 195);
    burstAtPickup(message.replacement, message.pickupKind === "core" ? 45 : 190);
    return;
  }

  if (message.type === "scoreboard") {
    renderScoreboard(message.scores || []);
    return;
  }

  if (message.type === "pong") {
    const pending = pendingPings.get(message.id);
    if (pending) {
      pendingPings.delete(message.id);
      const rtt = performance.now() - pending.perf;
      pushSample(rttSamples, rtt);
      const offset = message.serverReceivedAt - (pending.wall + rtt / 2);
      serverClockOffsetMs = serverClockOffsetMs === null ? offset : serverClockOffsetMs * 0.82 + offset * 0.18;
      rttEl.textContent = `${Math.round(rtt)} ms`;
    }
  }
}

function applyFullState(nextPlayers, nextPickups, explicitSelf) {
  players.clear();
  pickups.clear();
  for (const pickup of nextPickups) pickups.set(pickup.id, pickup);

  let self = explicitSelf;
  if (!self && selfSessionId) self = nextPlayers.find((player) => player.sessionId === selfSessionId) || null;
  if (!self) self = nextPlayers.find((player) => player.playerId === callsignInput.value.trim()) || null;

  for (const player of nextPlayers) upsertPlayer(player, true);

  if (self) {
    selfSessionId = self.sessionId;
    localPlayer = { ...self, drawX: self.x, drawY: self.y };
    localDashReadyAt = self.dashReadyAt || 0;
    updateSelfHud(self);
  }
}

function upsertAuthoritativePlayer(player) {
  upsertPlayer(player, false);
  if (player.sessionId === selfSessionId && localPlayer) {
    reconcileSelf(player);
    updateSelfHud(player);
  }
}

function upsertPlayer(player, immediate) {
  const existing = players.get(player.sessionId);
  if (!existing || immediate) {
    players.set(player.sessionId, {
      ...player,
      drawX: player.x,
      drawY: player.y,
      targetX: player.x,
      targetY: player.y,
    });
    return;
  }

  existing.targetX = player.x;
  existing.targetY = player.y;
  existing.vx = player.vx;
  existing.vy = player.vy;
  existing.score = player.score;
  existing.combo = player.combo;
  existing.comboExpiresAt = player.comboExpiresAt;
  existing.dashReadyAt = player.dashReadyAt;
  existing.ack = player.ack;
}

function reconcileSelf(authoritative) {
  const dx = authoritative.x - localPlayer.x;
  const dy = authoritative.y - localPlayer.y;
  const error = Math.hypot(dx, dy);
  pushSample(correctionSamples, error);

  if (error > 150) {
    localPlayer.x = authoritative.x;
    localPlayer.y = authoritative.y;
  } else {
    localPlayer.x += dx * 0.2;
    localPlayer.y += dy * 0.2;
  }

  localPlayer.vx += (authoritative.vx - localPlayer.vx) * 0.28;
  localPlayer.vy += (authoritative.vy - localPlayer.vy) * 0.28;
  localPlayer.score = authoritative.score;
  localPlayer.combo = authoritative.combo;
  localPlayer.comboExpiresAt = authoritative.comboExpiresAt;
  localPlayer.dashReadyAt = authoritative.dashReadyAt;
  localDashReadyAt = authoritative.dashReadyAt;
}

function updateSelfHud(player) {
  scoreEl.textContent = String(player.score ?? 0);
  const comboActive = (player.comboExpiresAt || 0) > Date.now();
  comboEl.textContent = `x${comboActive ? Math.max(1, player.combo || 1) : 1}`;
}

function renderScoreboard(scores) {
  scoreboardEl.replaceChildren();
  for (const entry of scores.slice(0, 5)) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    const name = document.createElement("span");
    const pts = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `hsl(${entry.hue} 90% 62%)`;
    name.className = "name";
    name.textContent = entry.playerId;
    pts.className = "pts";
    pts.textContent = String(entry.score);
    li.append(swatch, name, pts);
    scoreboardEl.append(li);
  }
}

function sendEncoded(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  const encoded = JSON.stringify(payload);
  socket.send(encoded);
  rateOutboundBytes += encoded.length;
  return true;
}

function sendInput() {
  const input = currentInput();
  const sent = sendEncoded({
    type: "input",
    seq: ++inputSeq,
    x: input.x,
    y: input.y,
    dash: dashQueued,
  });
  if (sent) rateInputs += 1;
  dashQueued = false;
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id, { perf: performance.now(), wall: Date.now() });
  sendEncoded({ type: "ping", id });
  for (const [key, started] of pendingPings) {
    if (performance.now() - started.perf > 10000) pendingPings.delete(key);
  }
}

function keyboardInput() {
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  return normalizeVector(x, y);
}

function currentInput() {
  if (Math.hypot(joystickInput.x, joystickInput.y) > 0.08) return joystickInput;
  return keyboardInput();
}

function triggerDash() {
  if (!playing || !localPlayer || Date.now() < localDashReadyAt) return;
  const input = currentInput();
  let dx = input.x;
  let dy = input.y;
  if (Math.hypot(dx, dy) < 0.1) {
    const speed = Math.hypot(localPlayer.vx, localPlayer.vy);
    if (speed > 1) {
      dx = localPlayer.vx / speed;
      dy = localPlayer.vy / speed;
    }
  }
  if (Math.hypot(dx, dy) < 0.1) return;

  localPlayer.vx += dx * DASH_IMPULSE;
  localPlayer.vy += dy * DASH_IMPULSE;
  localDashReadyAt = Date.now() + DASH_COOLDOWN_MS;
  dashPredictionUntil = performance.now() + 70;
  dashQueued = true;
  sendInput();
  spawnTrail(localPlayer.x, localPlayer.y, localPlayer.hue, 18);
  navigator.vibrate?.(18);
}

function simulateLocal(dt) {
  if (!localPlayer) return;
  const input = currentInput();
  localPlayer.vx += input.x * ACCELERATION * dt;
  localPlayer.vy += input.y * ACCELERATION * dt;
  const damping = Math.exp(-DRAG * dt);
  localPlayer.vx *= damping;
  localPlayer.vy *= damping;

  const speed = Math.hypot(localPlayer.vx, localPlayer.vy);
  if (speed > MAX_SPEED && performance.now() >= dashPredictionUntil) {
    const scale = MAX_SPEED / speed;
    localPlayer.vx *= scale;
    localPlayer.vy *= scale;
  }

  localPlayer.x += localPlayer.vx * dt;
  localPlayer.y += localPlayer.vy * dt;
  resolveLocalBounds(localPlayer);

  if (speed > 90 && Math.random() < dt * 16) spawnTrail(localPlayer.x, localPlayer.y, localPlayer.hue, 1);
}

function resolveLocalBounds(player) {
  if (player.x < PLAYER_RADIUS) {
    player.x = PLAYER_RADIUS;
    player.vx = Math.abs(player.vx) * 0.35;
  } else if (player.x > world.width - PLAYER_RADIUS) {
    player.x = world.width - PLAYER_RADIUS;
    player.vx = -Math.abs(player.vx) * 0.35;
  }
  if (player.y < PLAYER_RADIUS) {
    player.y = PLAYER_RADIUS;
    player.vy = Math.abs(player.vy) * 0.35;
  } else if (player.y > world.height - PLAYER_RADIUS) {
    player.y = world.height - PLAYER_RADIUS;
    player.vy = -Math.abs(player.vy) * 0.35;
  }
}

function updateRemotePlayers(dt) {
  const blend = 1 - Math.exp(-10 * dt);
  for (const player of players.values()) {
    if (player.sessionId === selfSessionId) continue;
    player.drawX += (player.targetX - player.drawX) * blend;
    player.drawY += (player.targetY - player.drawY) * blend;
  }
}

function spawnTrail(x, y, hue, count) {
  for (let index = 0; index < count; index += 1) {
    particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 18,
      vx: (Math.random() - 0.5) * 110,
      vy: (Math.random() - 0.5) * 110,
      life: 0.35 + Math.random() * 0.4,
      hue,
      size: 2 + Math.random() * 4,
    });
  }
}

function burstAtPickup(pickup, hue) {
  if (!pickup) return;
  spawnTrail(pickup.x, pickup.y, hue, 14);
}

function updateParticles(dt) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const p = particles[index];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(index, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-3 * dt);
    p.vy *= Math.exp(-3 * dt);
  }
}

function camera() {
  const focusX = localPlayer?.x ?? world.width / 2;
  const focusY = localPlayer?.y ?? world.height / 2;
  const zoom = clamp(Math.min(viewportWidth / 780, viewportHeight / 520), 0.55, 1.1);
  return { focusX, focusY, zoom };
}

function toScreen(x, y, view) {
  return {
    x: (x - view.focusX) * view.zoom + viewportWidth / 2,
    y: (y - view.focusY) * view.zoom + viewportHeight / 2,
  };
}

function drawGrid(view) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const spacing = 100 * view.zoom;
  const origin = toScreen(0, 0, view);
  ctx.strokeStyle = "rgba(80, 132, 188, 0.11)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ((origin.x % spacing) + spacing) % spacing; x < viewportWidth; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, viewportHeight);
  }
  for (let y = ((origin.y % spacing) + spacing) % spacing; y < viewportHeight; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(viewportWidth, y);
  }
  ctx.stroke();

  const topLeft = toScreen(0, 0, view);
  const bottomRight = toScreen(world.width, world.height, view);
  ctx.strokeStyle = "rgba(91, 211, 255, 0.36)";
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.restore();
}

function drawPickup(pickup, view) {
  const p = toScreen(pickup.x, pickup.y, view);
  if (p.x < -50 || p.y < -50 || p.x > viewportWidth + 50 || p.y > viewportHeight + 50) return;
  const size = (pickup.kind === "core" ? 10 : 7) * view.zoom;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(p.x, p.y);
  ctx.rotate(performance.now() / (pickup.kind === "core" ? 720 : 1200));
  ctx.shadowBlur = pickup.kind === "core" ? 24 : 14;
  ctx.shadowColor = pickup.kind === "core" ? "#ffcf5b" : "#5ce8ff";
  ctx.fillStyle = pickup.kind === "core" ? "#ffd36b" : "#77edff";
  if (pickup.kind === "core") {
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.5);
    ctx.lineTo(size * 1.25, 0);
    ctx.lineTo(0, size * 1.5);
    ctx.lineTo(-size * 1.25, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(-size, -size, size * 2, size * 2);
  }
  ctx.restore();
}

function drawPlayer(player, x, y, view, self = false) {
  const p = toScreen(x, y, view);
  const radius = PLAYER_RADIUS * view.zoom;
  const angle = Math.atan2(player.vy || 0, player.vx || 0);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(p.x, p.y);
  ctx.rotate(Number.isFinite(angle) ? angle : 0);
  ctx.shadowBlur = self ? 24 : 15;
  ctx.shadowColor = `hsl(${player.hue} 95% 62%)`;
  ctx.fillStyle = `hsl(${player.hue} 82% ${self ? 66 : 57}%)`;
  ctx.beginPath();
  ctx.moveTo(radius * 1.35, 0);
  ctx.lineTo(-radius * 0.85, radius * 0.82);
  ctx.lineTo(-radius * 0.55, 0);
  ctx.lineTo(-radius * 0.85, -radius * 0.82);
  ctx.closePath();
  ctx.fill();
  if (self) {
    ctx.strokeStyle = "#ffffffcc";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.rotate(-(Number.isFinite(angle) ? angle : 0));
  ctx.fillStyle = "#dbe9ff";
  ctx.font = `${Math.max(10, 11 * view.zoom)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText(player.playerId, 0, -radius - 10);
  ctx.restore();
}

function drawParticles(view) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const particle of particles) {
    const p = toScreen(particle.x, particle.y, view);
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = `hsl(${particle.hue} 90% 65%)`;
    ctx.fillRect(p.x, p.y, particle.size, particle.size);
  }
  ctx.restore();
}

function render() {
  const view = camera();
  drawGrid(view);
  for (const pickup of pickups.values()) drawPickup(pickup, view);
  drawParticles(view);
  for (const player of players.values()) {
    if (player.sessionId === selfSessionId) continue;
    drawPlayer(player, player.drawX, player.drawY, view, false);
  }
  if (localPlayer) drawPlayer(localPlayer, localPlayer.x, localPlayer.y, view, true);
}

function updateDashHud() {
  const remaining = Math.max(0, localDashReadyAt - Date.now());
  dashButton.classList.toggle("cooling", remaining > 0);
  dashCooldownEl.textContent = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : "READY";
}

function rollClientRates() {
  const now = performance.now();
  const elapsed = now - rateWindowStartedAt;
  if (elapsed < 1000) return;
  const scale = 1000 / Math.max(1, elapsed);
  clientRates = {
    inputsPerSec: rateInputs * scale,
    snapshotsPerSec: rateSnapshots * scale,
    inboundBytesPerSec: rateInboundBytes * scale,
    outboundBytesPerSec: rateOutboundBytes * scale,
  };
  rateWindowStartedAt = now;
  rateInputs = 0;
  rateSnapshots = 0;
  rateInboundBytes = 0;
  rateOutboundBytes = 0;
}

function renderTelemetry() {
  rollClientRates();
  const rttP50 = percentile(rttSamples, 0.5);
  const rttP95 = percentile(rttSamples, 0.95);
  const correctionP50 = percentile(correctionSamples, 0.5);
  const correctionP95 = percentile(correctionSamples, 0.95);
  const fps = percentile(fpsSamples, 0.5);

  metrics["m-run"].textContent = `${run.id} · seed ${run.seed >>> 0}`;
  metrics["m-sim"].textContent = serverTelemetry
    ? `${serverTelemetry.targetSimulationHz} Hz target · tick ${serverTelemetry.tick}`
    : `${simulation.simulationHz} Hz target`;
  metrics["m-snapshot"].textContent = serverTelemetry
    ? `${serverTelemetry.snapshotsPerSec.toFixed(1)} /s server · ${clientRates.snapshotsPerSec.toFixed(1)} /s rx`
    : `${clientRates.snapshotsPerSec.toFixed(1)} /s rx`;
  metrics["m-tick-p95"].textContent = serverTelemetry ? `${serverTelemetry.tickDurationMsP95.toFixed(2)} ms` : "—";
  metrics["m-drift-p95"].textContent = serverTelemetry ? `${serverTelemetry.tickDriftMsP95.toFixed(2)} ms` : "—";
  metrics["m-dropped"].textContent = serverTelemetry ? `${serverTelemetry.droppedTicks} dropped · ${serverTelemetry.catchupSteps} catch-up` : "—";
  metrics["m-rtt"].textContent = rttSamples.length ? `${rttP50.toFixed(0)} / ${rttP95.toFixed(0)} ms p50/p95` : "—";
  metrics["m-snapshot-age"].textContent = lastSnapshotAgeMs === null
    ? "—"
    : `${Math.max(0, lastSnapshotAgeMs).toFixed(0)} ms · gap p95 ${percentile(snapshotGapSamples, 0.95).toFixed(0)} ms`;
  metrics["m-correction"].textContent = correctionSamples.length
    ? `${correctionP50.toFixed(1)} / ${correctionP95.toFixed(1)} px p50/p95`
    : "—";
  metrics["m-fps"].textContent = fpsSamples.length ? `${fps.toFixed(0)} fps` : "—";
  metrics["m-input-rate"].textContent = `${clientRates.inputsPerSec.toFixed(1)} /s tx · ${serverTelemetry?.inputsPerSec?.toFixed?.(1) ?? "—"} /s server`;
  metrics["m-bytes"].textContent = `${formatRate(clientRates.outboundBytesPerSec)} up · ${formatRate(clientRates.inboundBytesPerSec)} down`;
}

function formatRate(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec)) return "—";
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  return `${(bytesPerSec / 1024).toFixed(1)} KiB/s`;
}

function frame(now) {
  const dt = clamp((now - lastFrameAt) / 1000, 0, 0.05);
  lastFrameAt = now;
  if (dt > 0) pushSample(fpsSamples, 1 / dt);
  simulateLocal(dt);
  updateRemotePlayers(dt);
  updateParticles(dt);
  updateDashHud();
  updateSelfHud(localPlayer || { score: 0, combo: 1, comboExpiresAt: 0 });
  render();
  requestAnimationFrame(frame);
}

function updateJoystick(event) {
  const rect = joystickEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxRadius = rect.width * 0.33;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const length = Math.hypot(dx, dy);
  if (length > maxRadius) {
    dx = dx / length * maxRadius;
    dy = dy / length * maxRadius;
  }
  joystickInput = { x: dx / maxRadius, y: dy / maxRadius };
  stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

function releaseJoystick() {
  joystickPointer = null;
  joystickInput = { x: 0, y: 0 };
  stickEl.style.transform = "translate(0, 0)";
  sendInput();
}

joystickEl.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystickEl.setPointerCapture?.(event.pointerId);
  updateJoystick(event);
});
joystickEl.addEventListener("pointermove", (event) => {
  if (event.pointerId === joystickPointer) updateJoystick(event);
});
joystickEl.addEventListener("pointerup", (event) => {
  if (event.pointerId === joystickPointer) releaseJoystick();
});
joystickEl.addEventListener("pointercancel", (event) => {
  if (event.pointerId === joystickPointer) releaseJoystick();
});

dashButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  triggerDash();
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === "Space" && !event.repeat) triggerDash();
});
window.addEventListener("keyup", (event) => keys.delete(event.code));

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => window.setTimeout(resizeCanvas, 80));

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  keys.clear();
  releaseJoystick();
  dashQueued = false;
  sendInput();
});

labToggle.addEventListener("click", () => labPanel.classList.toggle("open"));
labClose.addEventListener("click", () => labPanel.classList.remove("open"));
resetButton.addEventListener("click", () => {
  const seed = Number(seedInput.value);
  if (!Number.isFinite(seed)) return;
  sendEncoded({ type: "reset", seed });
});

playButton.addEventListener("click", () => {
  const callsign = callsignInput.value.trim();
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(callsign)) {
    callsignInput.focus();
    return;
  }
  localStorage.setItem("neon-salvage-callsign", callsign);
  playing = true;
  boot.classList.add("hidden");
  connect();
});

callsignInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") playButton.click();
});

resizeCanvas();
renderTelemetry();
requestAnimationFrame(frame);
