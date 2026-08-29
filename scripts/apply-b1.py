from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Server: import the already validated pure B0 kernel.
replace_once(
    "src/index.ts",
    'import { DurableObject } from "cloudflare:workers";\n',
    'import { DurableObject } from "cloudflare:workers";\nimport {\n  advanceReactor,\n  resolveReactorBounds,\n  type ReactorPhysicsConfig,\n  type ReactorState,\n} from "./reactor-physics";\n',
)

replace_once(
    "src/index.ts",
    'const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;\n',
    '''const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;\n\nconst REACTOR_RADIUS = 46;\nconst REACTOR_INITIAL_VX = 170;\nconst REACTOR_INITIAL_VY = -95;\nconst REACTOR_PHYSICS_CONFIG: ReactorPhysicsConfig = {\n  reactorMass: 4,\n  restitution: 0.2,\n  wallRestitution: 0.72,\n  drag: 0.85,\n  maxSpeed: 520,\n  positionSlop: 0.5,\n  positionCorrection: 0.8,\n  correctionPasses: 2,\n};\nconst REACTOR_WORLD_BOUNDS = { width: WORLD_WIDTH, height: WORLD_HEIGHT };\n''',
)

replace_once(
    "src/index.ts",
    '''function normalizeSeed(value: number): number {\n  if (!Number.isFinite(value)) return DEFAULT_SEED;\n  const normalized = Math.trunc(value) >>> 0;\n  return normalized === 0 ? DEFAULT_SEED : normalized;\n}\n''',
    '''function normalizeSeed(value: number): number {\n  if (!Number.isFinite(value)) return DEFAULT_SEED;\n  const normalized = Math.trunc(value) >>> 0;\n  return normalized === 0 ? DEFAULT_SEED : normalized;\n}\n\nfunction createInitialReactor(): ReactorState {\n  return {\n    x: WORLD_WIDTH / 2,\n    y: WORLD_HEIGHT / 2,\n    vx: REACTOR_INITIAL_VX,\n    vy: REACTOR_INITIAL_VY,\n    radius: REACTOR_RADIUS,\n  };\n}\n''',
)

replace_once(
    "src/index.ts",
    '''  private players = new Map<WebSocket, PlayerState>();\n  private pickups: Pickup[] = [];\n''',
    '''  private players = new Map<WebSocket, PlayerState>();\n  private pickups: Pickup[] = [];\n  private reactor: ReactorState = createInitialReactor();\n''',
)

replace_once(
    "src/index.ts",
    '''  private tickDurationSamples: number[] = [];\n  private tickDriftSamples: number[] = [];\n''',
    '''  private tickDurationSamples: number[] = [];\n  private tickDriftSamples: number[] = [];\n  private reactorSpeedSamples: number[] = [];\n''',
)

replace_once(
    "src/index.ts",
    '''      pickups: this.pickups,\n      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },\n''',
    '''      pickups: this.pickups,\n      reactor: this.reactor,\n      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },\n''',
)

replace_once(
    "src/index.ts",
    '''  private simulateStep(dt: number, now: number): void {\n    let scoreboardDirty = false;\n\n    for (const [socket, player] of this.players) {\n''',
    '''  private simulateStep(dt: number, now: number): void {\n    let scoreboardDirty = false;\n\n    this.reactor = resolveReactorBounds(\n      advanceReactor(this.reactor, dt, REACTOR_PHYSICS_CONFIG),\n      REACTOR_WORLD_BOUNDS,\n      REACTOR_PHYSICS_CONFIG,\n    );\n    this.pushSample(this.reactorSpeedSamples, Math.hypot(this.reactor.vx, this.reactor.vy));\n\n    for (const [socket, player] of this.players) {\n''',
)

replace_once(
    "src/index.ts",
    '''      run: this.runContract(),\n      players: this.publicPlayers(),\n      telemetry: this.telemetryPayload(now),\n''',
    '''      run: this.runContract(),\n      players: this.publicPlayers(),\n      reactor: this.reactor,\n      telemetry: this.telemetryPayload(now),\n''',
)

replace_once(
    "src/index.ts",
    '''    this.tickDurationSamples = [];\n    this.tickDriftSamples = [];\n    this.rateWindowStartedAt = Date.now();\n''',
    '''    this.tickDurationSamples = [];\n    this.tickDriftSamples = [];\n    this.reactorSpeedSamples = [];\n    this.rateWindowStartedAt = Date.now();\n''',
)

replace_once(
    "src/index.ts",
    '''      players: this.publicPlayers(),\n      pickups: this.pickups,\n      simulation: this.simulationContract(),\n''',
    '''      players: this.publicPlayers(),\n      pickups: this.pickups,\n      reactor: this.reactor,\n      simulation: this.simulationContract(),\n''',
)

replace_once(
    "src/index.ts",
    '''    this.rngState = this.runSeed;\n    this.pickups = Array.from({ length: PICKUP_COUNT }, (_, index) => this.createPickup(index));\n  }\n''',
    '''    this.rngState = this.runSeed;\n    this.pickups = Array.from({ length: PICKUP_COUNT }, (_, index) => this.createPickup(index));\n    this.reactor = createInitialReactor();\n  }\n''',
)

replace_once(
    "src/index.ts",
    '''        this.rngState = this.runSeed;\n        this.pickups = Array.from({ length: PICKUP_COUNT }, (_, index) => this.createPickup(index));\n      }\n''',
    '''        this.rngState = this.runSeed;\n        this.pickups = Array.from({ length: PICKUP_COUNT }, (_, index) => this.createPickup(index));\n        this.reactor = createInitialReactor();\n      }\n''',
)

replace_once(
    "src/index.ts",
    '''      catchupSteps: this.catchupSteps,\n      activeDurationMs: this.activeRunStartedAt ? Math.max(0, now - this.activeRunStartedAt) : 0,\n''',
    '''      catchupSteps: this.catchupSteps,\n      reactorSpeedP50: percentile(this.reactorSpeedSamples, 0.5),\n      reactorSpeedP95: percentile(this.reactorSpeedSamples, 0.95),\n      activeDurationMs: this.activeRunStartedAt ? Math.max(0, now - this.activeRunStartedAt) : 0,\n''',
)

replace_once(
    "src/index.ts",
    '        stage: "gate-4a-fixed-simulation-substrate",\n',
    '        stage: "gate-4b-passive-reactor",\n',
)

# Client: keep Reactor presentation separate from local-player prediction.
replace_once(
    "public/app.js",
    '''  "m-run", "m-sim", "m-snapshot", "m-tick-p95", "m-drift-p95", "m-dropped",\n  "m-rtt", "m-snapshot-age", "m-correction", "m-fps", "m-input-rate", "m-bytes",\n''',
    '''  "m-run", "m-sim", "m-snapshot", "m-tick-p95", "m-drift-p95", "m-dropped",\n  "m-rtt", "m-snapshot-age", "m-correction", "m-reactor-speed", "m-reactor-correction",\n  "m-fps", "m-input-rate", "m-bytes",\n''',
)

replace_once(
    "public/app.js",
    'if (required.some((item) => !item)) throw new Error("Gate 4A UI is incomplete.");\n',
    'if (required.some((item) => !item)) throw new Error("Gate 4B UI is incomplete.");\n',
)

replace_once(
    "public/app.js",
    '''const PLAYER_RADIUS = 18;\nconst SAMPLE_LIMIT = 160;\n''',
    '''const PLAYER_RADIUS = 18;\nconst REACTOR_PROJECTION_MAX_MS = 150;\nconst SAMPLE_LIMIT = 160;\n''',
)

replace_once(
    "public/app.js",
    '''const correctionSamples = [];\nconst snapshotGapSamples = [];\n''',
    '''const correctionSamples = [];\nconst reactorCorrectionSamples = [];\nconst snapshotGapSamples = [];\n''',
)

replace_once(
    "public/app.js",
    '''let selfSessionId = null;\nlet localPlayer = null;\nlet inputSeq = 0;\n''',
    '''let selfSessionId = null;\nlet localPlayer = null;\nlet reactor = null;\nlet inputSeq = 0;\n''',
)

replace_once(
    "public/app.js",
    '''    applyFullState(message.players || [], message.pickups || [], message.self);\n    setNetwork("live", "live");\n''',
    '''    applyFullState(message.players || [], message.pickups || [], message.self);\n    applyReactorState(message.reactor, true, 0);\n    setNetwork("live", "live");\n''',
)

replace_once(
    "public/app.js",
    '''    applyFullState(message.players || [], message.pickups || [], null);\n    correctionSamples.length = 0;\n    snapshotGapSamples.length = 0;\n''',
    '''    applyFullState(message.players || [], message.pickups || [], null);\n    applyReactorState(message.reactor, true, 0);\n    correctionSamples.length = 0;\n    reactorCorrectionSamples.length = 0;\n    snapshotGapSamples.length = 0;\n''',
)

replace_once(
    "public/app.js",
    '''    for (const player of message.players || []) {\n      upsertAuthoritativePlayer(player, projectionAgeMs);\n    }\n\n    const liveSessions = new Set((message.players || []).map((player) => player.sessionId));\n''',
    '''    for (const player of message.players || []) {\n      upsertAuthoritativePlayer(player, projectionAgeMs);\n    }\n    applyReactorState(message.reactor, false, Math.min(projectionAgeMs, REACTOR_PROJECTION_MAX_MS));\n\n    const liveSessions = new Set((message.players || []).map((player) => player.sessionId));\n''',
)

replace_once(
    "public/app.js",
    '''function upsertAuthoritativePlayer(player, ageMs) {\n  const projected = projectAuthoritativePlayer(player, ageMs);\n  upsertPlayer(projected, false);\n  if (player.sessionId === selfSessionId && localPlayer) {\n    reconcileSelf(projected);\n    updateSelfHud(player);\n  }\n}\n\nfunction upsertPlayer(player, immediate) {\n''',
    '''function upsertAuthoritativePlayer(player, ageMs) {\n  const projected = projectAuthoritativePlayer(player, ageMs);\n  upsertPlayer(projected, false);\n  if (player.sessionId === selfSessionId && localPlayer) {\n    reconcileSelf(projected);\n    updateSelfHud(player);\n  }\n}\n\nfunction projectAuthoritativeReactor(state, ageMs) {\n  if (!state) return null;\n  const dt = clamp(ageMs / 1000, 0, REACTOR_PROJECTION_MAX_MS / 1000);\n  const radius = Number.isFinite(state.radius) ? state.radius : 46;\n  return {\n    ...state,\n    radius,\n    x: clamp(state.x + (state.vx || 0) * dt, radius, world.width - radius),\n    y: clamp(state.y + (state.vy || 0) * dt, radius, world.height - radius),\n  };\n}\n\nfunction applyReactorState(state, immediate, ageMs) {\n  const projected = projectAuthoritativeReactor(state, ageMs);\n  if (!projected) return;\n\n  if (!reactor || immediate) {\n    reactor = {\n      ...projected,\n      drawX: projected.x,\n      drawY: projected.y,\n      targetX: projected.x,\n      targetY: projected.y,\n    };\n    return;\n  }\n\n  pushSample(reactorCorrectionSamples, Math.hypot(projected.x - reactor.drawX, projected.y - reactor.drawY));\n  reactor.targetX = projected.x;\n  reactor.targetY = projected.y;\n  reactor.vx = projected.vx;\n  reactor.vy = projected.vy;\n  reactor.radius = projected.radius;\n}\n\nfunction upsertPlayer(player, immediate) {\n''',
)

replace_once(
    "public/app.js",
    '''function updateRemotePlayers(dt) {\n  const blend = 1 - Math.exp(-10 * dt);\n  for (const player of players.values()) {\n    if (player.sessionId === selfSessionId) continue;\n    player.drawX += (player.targetX - player.drawX) * blend;\n    player.drawY += (player.targetY - player.drawY) * blend;\n  }\n}\n''',
    '''function updateRemotePlayers(dt) {\n  const blend = 1 - Math.exp(-10 * dt);\n  for (const player of players.values()) {\n    if (player.sessionId === selfSessionId) continue;\n    player.drawX += (player.targetX - player.drawX) * blend;\n    player.drawY += (player.targetY - player.drawY) * blend;\n  }\n}\n\nfunction updateReactorPresentation(dt) {\n  if (!reactor) return;\n  const blend = 1 - Math.exp(-10 * dt);\n  reactor.drawX += (reactor.targetX - reactor.drawX) * blend;\n  reactor.drawY += (reactor.targetY - reactor.drawY) * blend;\n}\n''',
)

replace_once(
    "public/app.js",
    '''function drawPlayer(player, x, y, view, self = false) {\n''',
    '''function drawReactor(view) {\n  if (!reactor) return;\n  const p = toScreen(reactor.drawX, reactor.drawY, view);\n  const radius = reactor.radius * view.zoom;\n  if (p.x < -radius * 2 || p.y < -radius * 2 || p.x > viewportWidth + radius * 2 || p.y > viewportHeight + radius * 2) return;\n\n  ctx.save();\n  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n  ctx.translate(p.x, p.y);\n  ctx.shadowBlur = 30;\n  ctx.shadowColor = "#ff5ccf";\n  ctx.fillStyle = "rgba(44, 16, 60, 0.92)";\n  ctx.strokeStyle = "#ff76dc";\n  ctx.lineWidth = Math.max(2, 3 * view.zoom);\n  ctx.beginPath();\n  ctx.arc(0, 0, radius, 0, Math.PI * 2);\n  ctx.fill();\n  ctx.stroke();\n  ctx.shadowBlur = 18;\n  ctx.strokeStyle = "#6df7ff";\n  ctx.lineWidth = Math.max(1.5, 2 * view.zoom);\n  ctx.beginPath();\n  ctx.arc(0, 0, radius * 0.58, 0, Math.PI * 2);\n  ctx.stroke();\n  ctx.fillStyle = "#f2fbff";\n  ctx.font = `${Math.max(10, 11 * view.zoom)}px system-ui`;\n  ctx.textAlign = "center";\n  ctx.fillText("REACTOR", 0, -radius - 10);\n  ctx.restore();\n}\n\nfunction drawPlayer(player, x, y, view, self = false) {\n''',
)

replace_once(
    "public/app.js",
    '''  for (const pickup of pickups.values()) drawPickup(pickup, view);\n  drawParticles(view);\n''',
    '''  for (const pickup of pickups.values()) drawPickup(pickup, view);\n  drawReactor(view);\n  drawParticles(view);\n''',
)

replace_once(
    "public/app.js",
    '''  const correctionP50 = percentile(correctionSamples, 0.5);\n  const correctionP95 = percentile(correctionSamples, 0.95);\n  const fps = percentile(fpsSamples, 0.5);\n''',
    '''  const correctionP50 = percentile(correctionSamples, 0.5);\n  const correctionP95 = percentile(correctionSamples, 0.95);\n  const reactorCorrectionP50 = percentile(reactorCorrectionSamples, 0.5);\n  const reactorCorrectionP95 = percentile(reactorCorrectionSamples, 0.95);\n  const fps = percentile(fpsSamples, 0.5);\n''',
)

replace_once(
    "public/app.js",
    '''  metrics["m-correction"].textContent = correctionSamples.length\n    ? `${correctionP50.toFixed(1)} / ${correctionP95.toFixed(1)} px p50/p95`\n    : "—";\n  metrics["m-fps"].textContent = fpsSamples.length ? `${fps.toFixed(0)} fps` : "—";\n''',
    '''  metrics["m-correction"].textContent = correctionSamples.length\n    ? `${correctionP50.toFixed(1)} / ${correctionP95.toFixed(1)} px p50/p95`\n    : "—";\n  metrics["m-reactor-speed"].textContent = serverTelemetry\n    ? `${serverTelemetry.reactorSpeedP50.toFixed(1)} / ${serverTelemetry.reactorSpeedP95.toFixed(1)} u/s p50/p95`\n    : "—";\n  metrics["m-reactor-correction"].textContent = reactorCorrectionSamples.length\n    ? `${reactorCorrectionP50.toFixed(1)} / ${reactorCorrectionP95.toFixed(1)} px p50/p95`\n    : "—";\n  metrics["m-fps"].textContent = fpsSamples.length ? `${fps.toFixed(0)} fps` : "—";\n''',
)

replace_once(
    "public/app.js",
    '''  simulateLocal(dt);\n  updateRemotePlayers(dt);\n  updateParticles(dt);\n''',
    '''  simulateLocal(dt);\n  updateRemotePlayers(dt);\n  updateReactorPresentation(dt);\n  updateParticles(dt);\n''',
)

# HTML: expose only the two B1 measurements and label the boundary clearly.
replace_once(
    "public/index.html",
    '<title>Neon Salvage · Gate 4A Simulation Lab</title>',
    '<title>Neon Salvage · Gate 4B Shared Dynamics Lab</title>',
)
replace_once(
    "public/index.html",
    '<span>Gate 4A · authoritative simulation substrate</span>',
    '<span>Gate 4B · passive authoritative Reactor</span>',
)
replace_once(
    "public/index.html",
    '''        <div><span>CORRECTION</span><strong id="m-correction">—</strong></div>\n        <div><span>CLIENT FPS</span><strong id="m-fps">—</strong></div>''',
    '''        <div><span>CORRECTION</span><strong id="m-correction">—</strong></div>\n        <div><span>REACTOR SPEED</span><strong id="m-reactor-speed">—</strong></div>\n        <div><span>REACTOR CORRECTION</span><strong id="m-reactor-correction">—</strong></div>\n        <div><span>CLIENT FPS</span><strong id="m-fps">—</strong></div>''',
)
replace_once(
    "public/index.html",
    '<p class="eyebrow">Gate 4A · Fixed Simulation Substrate</p>',
    '<p class="eyebrow">Gate 4B · Passive Shared Dynamics</p>',
)
replace_once(
    "public/index.html",
    '<p>The game is intentionally familiar. What changed is underneath: input no longer advances the world directly. A fixed server simulation owns movement, snapshots and timing.</p>',
    '<p>The frozen 4A substrate now carries one passive server-owned Reactor. It moves independently, snapshots at the existing cadence, and is presented without local Reactor physics.</p>',
)

print("B1 patch assertions passed")
