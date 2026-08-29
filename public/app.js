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

if (!(canvas instanceof HTMLCanvasElement) || !ctx || !(boot instanceof HTMLElement) || !(callsignInput instanceof HTMLInputElement) || !(playButton instanceof HTMLButtonElement) || !(netDot instanceof HTMLElement) || !(netState instanceof HTMLElement) || !(rttEl instanceof HTMLElement) || !(scoreEl instanceof HTMLElement) || !(comboEl instanceof HTMLElement) || !(scoreboardEl instanceof HTMLOListElement) || !(feedEl instanceof HTMLElement) || !(joystickEl instanceof HTMLElement) || !(stickEl instanceof HTMLElement) || !(dashButton instanceof HTMLButtonElement) || !(dashCooldownEl instanceof HTMLElement)) {
  throw new Error("Neon Salvage UI is incomplete.");
}

const WORLD_FALLBACK = { width: 1600, height: 1000 };
const ACCELERATION = 920;
const DRAG = 5.2;
const MAX_SPEED = 330;
const DASH_IMPULSE = 310;
const DASH_COOLDOWN_MS = 1250;
const INPUT_INTERVAL_MS = 66;
const keys = new Set();
const players = new Map();
const pickups = new Map();
const particles = [];
const pendingPings = new Map();

let world = { ...WORLD_FALLBACK };
let socket = null;
let playing = false;
let reconnectTimer = null;
let inputTimer = null;
let pingTimer = null;
let selfSessionId = null;
let localPlayer = null;
let inputSeq = 0;
let dashQueued = false;
let localDashReadyAt = 0;
let lastFrameAt = performance.now();
let lastRtt = null;
let joystickPointer = null;
let joystickInput = { x: 0, y: 0 };
let dpr = 1;
let viewportWidth = innerWidth;
let viewportHeight = innerHeight;

const storedCallsign = localStorage.getItem("neon-salvage-callsign");
callsignInput.value = storedCallsign || `P-${crypto.randomUUID().slice(0, 6)}`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  window.setTimeout(() => line.remove(), 2500);
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
  inputTimer = null;
  pingTimer = null;
}

function startNetworkLoops() {
  stopNetworkLoops();
  inputTimer = window.setInterval(sendInput, INPUT_INTERVAL_MS);
  pingTimer = window.setInterval(sendPing, 2000);
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
    selfSessionId = message.self?.sessionId || null;
    players.clear();
    for (const player of message.players || []) upsertPlayer(player, true);
    for (const pickup of message.pickups || []) pickups.set(pickup.id, pickup);

    const self = message.self;
    if (self) {
      localPlayer = { ...self, drawX: self.x, drawY: self.y };
      upsertPlayer(self, true);
      localDashReadyAt = self.dashReadyAt || 0;
      updateSelfHud(self);
    }

    setNetwork("live", "live");
    addFeed("LINK ESTABLISHED · shared world live", 150);
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

  if (message.type === "player" && message.player) {
    const player = message.player;
    upsertPlayer(player, false);
    if (player.sessionId === selfSessionId && localPlayer) {
      reconcileSelf(player);
      updateSelfHud(player);
    }
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
    const started = pendingPings.get(message.id);
    if (started !== undefined) {
      pendingPings.delete(message.id);
      lastRtt = performance.now() - started;
      rttEl.textContent = `${Math.round(lastRtt)} ms`;
    }
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
}

function reconcileSelf(authoritative) {
  const dx = authoritative.x - localPlayer.x;
  const dy = authoritative.y - localPlayer.y;
  const error = Math.hypot(dx, dy);

  if (error > 160) {
    localPlayer.x = authoritative.x;
    localPlayer.y = authoritative.y;
  } else {
    localPlayer.x += dx * 0.24;
    localPlayer.y += dy * 0.24;
  }

  localPlayer.vx += (authoritative.vx - localPlayer.vx) * 0.3;
  localPlayer.vy += (authoritative.vy - localPlayer.vy) * 0.3;
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

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const input = currentInput();
  socket.send(JSON.stringify({
    type: "input",
    seq: ++inputSeq,
    x: input.x,
    y: input.y,
    dash: dashQueued,
  }));
  dashQueued = false;
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const id = crypto.randomUUID();
  pendingPings.set(id, performance.now());
  socket.send(JSON.stringify({ type: "ping", id }));
  for (const [key, started] of pendingPings) {
    if (performance.now() - started > 10000) pendingPings.delete(key);
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
  dashQueued = true;
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
  if (speed > MAX_SPEED && Date.now() >= localDashReadyAt - DASH_COOLDOWN_MS + 220) {
    const scale = MAX_SPEED / speed;
    localPlayer.vx *= scale;
    localPlayer.vy *= scale;
  }
  localPlayer.x = clamp(localPlayer.x + localPlayer.vx * dt, 18, world.width - 18);
  localPlayer.y = clamp(localPlayer.y + localPlayer.vy * dt, 18, world.height - 18);
  if (speed > 90 && Math.random() < dt * 16) spawnTrail(localPlayer.x, localPlayer.y, localPlayer.hue, 1);
}

function updateRemotePlayers(dt) {
  const blend = 1 - Math.exp(-11 * dt);
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

function cameraTransform() {
  const focusX = localPlayer?.x ?? world.width / 2;
  const focusY = localPlayer?.y ?? world.height / 2;
  const zoom = clamp(Math.min(viewportWidth / 720, viewportHeight / 540), 0.55, 1.05);
  return { focusX, focusY, zoom };
}

function worldToScreen(x, y, camera) {
  return {
    x: (x - camera.focusX) * camera.zoom + viewportWidth / 2,
    y: (y - camera.focusY) * camera.zoom + viewportHeight / 2,
  };
}

function drawArena(camera, time) {
  ctx.fillStyle = "#080b14";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const topLeft = worldToScreen(0, 0, camera);
  const bottomRight = worldToScreen(world.width, world.height, camera);
  ctx.fillStyle = "#0b1120";
  ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  ctx.save();
  ctx.strokeStyle = "rgba(105, 151, 210, 0.09)";
  ctx.lineWidth = 1;
  const spacing = 100;
  for (let x = 0; x <= world.width; x += spacing) {
    const a = worldToScreen(x, 0, camera);
    const b = worldToScreen(x, world.height, camera);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += spacing) {
    const a = worldToScreen(0, y, camera);
    const b = worldToScreen(world.width, y, camera);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(98, 216, 255, 0.42)";
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.restore();

  for (const pickup of pickups.values()) drawPickup(pickup, camera, time);
}

function drawPickup(pickup, camera, time) {
  const p = worldToScreen(pickup.x, pickup.y, camera);
  const core = pickup.kind === "core";
  const pulse = 1 + Math.sin(time * 0.004 + pickup.id) * 0.12;
  const radius = (core ? 13 : 8) * camera.zoom * pulse;
  if (p.x < -40 || p.x > viewportWidth + 40 || p.y < -40 || p.y > viewportHeight + 40) return;

  ctx.save();
  ctx.shadowBlur = core ? 28 : 18;
  ctx.shadowColor = core ? "#ffb84f" : "#56d9ff";
  ctx.fillStyle = core ? "#ffd27a" : "#8eeaff";
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = core ? "#fff2bd" : "#dffaff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(player, camera, self = false) {
  const x = self ? localPlayer.x : player.drawX;
  const y = self ? localPlayer.y : player.drawY;
  const p = worldToScreen(x, y, camera);
  const vx = self ? localPlayer.vx : player.vx;
  const vy = self ? localPlayer.vy : player.vy;
  const angle = Math.hypot(vx, vy) > 8 ? Math.atan2(vy, vx) : -Math.PI / 2;
  const radius = 18 * camera.zoom;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.shadowBlur = self ? 24 : 16;
  ctx.shadowColor = `hsl(${player.hue} 95% 60%)`;
  ctx.fillStyle = `hsl(${player.hue} 82% ${self ? 67 : 58}%)`;
  ctx.beginPath();
  ctx.moveTo(radius * 1.25, 0);
  ctx.lineTo(-radius * 0.8, radius * 0.72);
  ctx.lineTo(-radius * 0.5, 0);
  ctx.lineTo(-radius * 0.8, -radius * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = `${Math.max(10, 12 * camera.zoom)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillStyle = self ? "#ffffff" : "#c6d2e4";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 6;
  ctx.fillText(`${player.playerId} · ${player.score}`, p.x, p.y - radius - 10);
  ctx.restore();
}

function drawParticles(camera) {
  for (const p of particles) {
    const screen = worldToScreen(p.x, p.y, camera);
    ctx.globalAlpha = clamp(p.life * 2.2, 0, 1);
    ctx.fillStyle = `hsl(${p.hue} 90% 64%)`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, p.size * camera.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateDashHud(now) {
  const remaining = Math.max(0, localDashReadyAt - Date.now());
  dashButton.classList.toggle("cooling", remaining > 0);
  dashCooldownEl.textContent = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : "READY";
  if (localPlayer) updateSelfHud(localPlayer);
}

function frame(now) {
  const dt = clamp((now - lastFrameAt) / 1000, 0, 0.033);
  lastFrameAt = now;
  if (playing) simulateLocal(dt);
  updateRemotePlayers(dt);
  updateParticles(dt);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const camera = cameraTransform();
  drawArena(camera, now);
  drawParticles(camera);
  for (const player of players.values()) {
    if (player.sessionId === selfSessionId) continue;
    drawPlayer(player, camera, false);
  }
  if (localPlayer) drawPlayer(localPlayer, camera, true);
  updateDashHud(now);
  requestAnimationFrame(frame);
}

function updateJoystick(event) {
  const rect = joystickEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const max = rect.width * 0.34;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const distance = Math.hypot(dx, dy);
  if (distance > max) {
    dx = dx / distance * max;
    dy = dy / distance * max;
  }
  joystickInput = normalizeVector(dx / max, dy / max);
  stickEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

function resetJoystick() {
  joystickPointer = null;
  joystickInput = { x: 0, y: 0 };
  stickEl.style.transform = "translate(0, 0)";
}

joystickEl.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystickEl.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystickEl.addEventListener("pointermove", (event) => {
  if (event.pointerId === joystickPointer) updateJoystick(event);
});
joystickEl.addEventListener("pointerup", (event) => {
  if (event.pointerId === joystickPointer) resetJoystick();
});
joystickEl.addEventListener("pointercancel", resetJoystick);

dashButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  triggerDash();
});

addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === "Space" && !event.repeat) triggerDash();
});
addEventListener("keyup", (event) => keys.delete(event.code));
addEventListener("blur", () => {
  keys.clear();
  resetJoystick();
});
addEventListener("resize", resizeCanvas);
document.addEventListener("contextmenu", (event) => event.preventDefault());

playButton.addEventListener("click", () => {
  const callsign = callsignInput.value.trim().replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 20) || `P-${crypto.randomUUID().slice(0, 6)}`;
  callsignInput.value = callsign;
  localStorage.setItem("neon-salvage-callsign", callsign);
  playing = true;
  boot.classList.add("hidden");
  connect();
});

callsignInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") playButton.click();
});

resizeCanvas();
requestAnimationFrame(frame);
