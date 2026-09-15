from pathlib import Path

PROTOCOL = Path("src/world-v0-protocol.ts")
AUTHORITY = Path("src/world-v0-shared-yard.ts")
MARKER = "WORLD_V0_LIFECYCLE_R0_TOPOLOGY_PROTOCOL_V1"
AUTH_MARKER = "WORLD_V0_LIFECYCLE_R0_AUTHORITY_V1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, found {count}")
    return text.replace(old, new, 1)


def patch_protocol(text: str) -> str:
    if MARKER in text:
        return text

    text = replace_once(
        text,
        "export type WorldV0Identity = {\n  worldId: string;\n  worldEpoch: string;\n  simBuildId: string;\n  clientSimRevision: string;\n};\n",
        "export type WorldV0Identity = {\n  worldId: string;\n  worldEpoch: string;\n  simBuildId: string;\n  clientSimRevision: string;\n};\n\n// WORLD_V0_LIFECYCLE_R0_TOPOLOGY_PROTOCOL_V1\nexport type WorldV0TopologyIdentity = {\n  topologyRevision: number;\n  topologyDigest: string;\n};\n",
        "protocol topology type",
    )
    text = replace_once(
        text,
        "export type WorldV0InputBatch = WorldV0Identity & {\n  type: \"world_v0_input_batch\";\n  batchSeq: number;\n  records: WorldV0InputRecord[];\n};\nexport type WorldV0Ping = { type: \"world_v0_ping\"; id: string };\nexport type WorldV0Ready = WorldV0Identity & { type: \"world_v0_ready\" };\n",
        "export type WorldV0InputBatch = WorldV0Identity & Partial<WorldV0TopologyIdentity> & {\n  type: \"world_v0_input_batch\";\n  batchSeq: number;\n  records: WorldV0InputRecord[];\n};\nexport type WorldV0Ping = { type: \"world_v0_ping\"; id: string };\nexport type WorldV0Ready = WorldV0Identity & Partial<WorldV0TopologyIdentity> & { type: \"world_v0_ready\" };\n",
        "protocol topology-bound messages",
    )
    text = replace_once(
        text,
        "function parseIdentity(value: Record<string, unknown>): WorldV0Identity | null {\n  if (!isIdentityString(value.worldId)) return null;\n  if (!isIdentityString(value.worldEpoch)) return null;\n  if (!isIdentityString(value.simBuildId)) return null;\n  if (!isIdentityString(value.clientSimRevision)) return null;\n  return {\n    worldId: value.worldId,\n    worldEpoch: value.worldEpoch,\n    simBuildId: value.simBuildId,\n    clientSimRevision: value.clientSimRevision,\n  };\n}\n",
        "function parseIdentity(value: Record<string, unknown>): WorldV0Identity | null {\n  if (!isIdentityString(value.worldId)) return null;\n  if (!isIdentityString(value.worldEpoch)) return null;\n  if (!isIdentityString(value.simBuildId)) return null;\n  if (!isIdentityString(value.clientSimRevision)) return null;\n  return {\n    worldId: value.worldId,\n    worldEpoch: value.worldEpoch,\n    simBuildId: value.simBuildId,\n    clientSimRevision: value.clientSimRevision,\n  };\n}\n\nfunction parseOptionalTopologyIdentity(\n  value: Record<string, unknown>,\n): WorldV0TopologyIdentity | undefined | null {\n  const hasRevision = \"topologyRevision\" in value;\n  const hasDigest = \"topologyDigest\" in value;\n  if (!hasRevision && !hasDigest) return undefined;\n  if (!hasRevision || !hasDigest) return null;\n  if (!isFiniteInteger(value.topologyRevision) || value.topologyRevision <= 0) return null;\n  if (!isIdentityString(value.topologyDigest)) return null;\n  return { topologyRevision: value.topologyRevision, topologyDigest: value.topologyDigest };\n}\n",
        "protocol topology parser",
    )
    text = replace_once(
        text,
        "  if (record.type === \"world_v0_ready\") {\n    const identity = parseIdentity(record);\n    return identity ? { type: \"world_v0_ready\", ...identity } : null;\n  }\n\n  if (record.type !== \"world_v0_input_batch\") return null;\n  const identity = parseIdentity(record);\n  if (!identity) return null;\n",
        "  if (record.type === \"world_v0_ready\") {\n    const identity = parseIdentity(record);\n    if (!identity) return null;\n    const topology = parseOptionalTopologyIdentity(record);\n    if (topology === null) return null;\n    return { type: \"world_v0_ready\", ...identity, ...(topology ?? {}) };\n  }\n\n  if (record.type !== \"world_v0_input_batch\") return null;\n  const identity = parseIdentity(record);\n  if (!identity) return null;\n  const topology = parseOptionalTopologyIdentity(record);\n  if (topology === null) return null;\n",
        "protocol ready/input topology parse",
    )
    text = replace_once(
        text,
        "  return { type: \"world_v0_input_batch\", ...identity, batchSeq: record.batchSeq, records };\n",
        "  return { type: \"world_v0_input_batch\", ...identity, ...(topology ?? {}), batchSeq: record.batchSeq, records };\n",
        "protocol input topology return",
    )
    text = replace_once(
        text,
        "  stats(): WorldV0InputBufferStats {\n",
        "  resetForTopology(): void {\n    this.pending.clear();\n    this.consumed = { x: 0, z: 0, jump: false };\n    this.missingStreak = 0;\n  }\n\n  stats(): WorldV0InputBufferStats {\n",
        "protocol topology reset",
    )
    return text


def patch_authority(text: str) -> str:
    if AUTH_MARKER in text:
        return text

    text = replace_once(
        text,
        "const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;\n",
        "const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;\nconst R0_LIFECYCLE_MODE = \"r0\";\nconst R0_AUTHORITY_REVISION = \"world-v0-lifecycle-r0-authority-v1\"; // WORLD_V0_LIFECYCLE_R0_AUTHORITY_V1\n",
        "authority r0 constants",
    )
    text = replace_once(
        text,
        "function encodeU32Hex(value: number): string {\n  return (value >>> 0).toString(16).padStart(8, \"0\");\n}\n",
        "function encodeU32Hex(value: number): string {\n  return (value >>> 0).toString(16).padStart(8, \"0\");\n}\n\nfunction topologyDigest(text: string): string {\n  let hash = 0x811c9dc5;\n  for (let index = 0; index < text.length; index += 1) {\n    hash ^= text.charCodeAt(index);\n    hash = Math.imul(hash, 0x01000193) >>> 0;\n  }\n  return encodeU32Hex(hash);\n}\n",
        "authority topology digest",
    )
    text = replace_once(
        text,
        "  private worldEpoch: string | null = null;\n  private props: SharedYardProp[] = [];\n",
        "  private worldEpoch: string | null = null;\n  private lifecycleR0 = false;\n  private topologyRevision = 0;\n  private props: SharedYardProp[] = [];\n",
        "authority topology fields",
    )
    text = replace_once(
        text,
        "        simBuildId: WORLD_V0_SIM_BUILD_ID,\n        boundaryTick: this.tick,\n",
        "        simBuildId: WORLD_V0_SIM_BUILD_ID,\n        lifecycleMode: this.lifecycleR0 ? R0_LIFECYCLE_MODE : \"fixed-2p\",\n        topology: this.lifecycleR0 && this.world ? this.topologyPayload() : null,\n        boundaryTick: this.tick,\n",
        "authority health topology",
    )
    text = replace_once(
        text,
        "      return;\n    }\n\n    if (message.type === \"world_v0_ready\") {\n      player.ready = true;\n      this.send(ws, { type: \"world_v0_ready_ack\", boundaryTick: this.tick, ...this.identityPayload() });\n",
        "      return;\n    }\n\n    if (this.lifecycleR0 && message.type !== \"world_v0_ping\") {\n      const topology = this.topologyPayload();\n      if (message.topologyRevision !== topology.revision || message.topologyDigest !== topology.digest) {\n        this.send(ws, {\n          type: \"world_v0_error\",\n          error: \"topology_identity_mismatch\",\n          expectedTopology: topology,\n          receivedTopology: {\n            revision: message.topologyRevision ?? null,\n            digest: message.topologyDigest ?? null,\n          },\n          boundaryTick: this.tick,\n          ...this.identityPayload(),\n        });\n        return;\n      }\n    }\n\n    if (message.type === \"world_v0_ready\") {\n      player.ready = true;\n      this.send(ws, {\n        type: \"world_v0_ready_ack\",\n        boundaryTick: this.tick,\n        ...this.topologyEnvelope(),\n        ...this.identityPayload(),\n      });\n",
        "authority topology input gate",
    )
    text = replace_once(
        text,
        "        records: [],\n        ...this.identityPayload(),\n",
        "        records: [],\n        ...this.topologyEnvelope(),\n        ...this.identityPayload(),\n",
        "authority prestart topology ack",
    )
    text = replace_once(
        text,
        "        relayBoundaryTick: this.tick,\n        serverTime: Date.now(),\n        ...this.identityPayload(),\n",
        "        relayBoundaryTick: this.tick,\n        serverTime: Date.now(),\n        ...this.topologyEnvelope(),\n        ...this.identityPayload(),\n",
        "authority peer relay topology",
    )
    text = replace_once(
        text,
        "      stats: player.input.stats(),\n      ...this.identityPayload(),\n",
        "      stats: player.input.stats(),\n      ...this.topologyEnvelope(),\n      ...this.identityPayload(),\n",
        "authority batch ack topology",
    )
    text = replace_once(
        text,
        "    const requestedResumeToken = (url.searchParams.get(\"resume\") ?? \"\").trim();\n    const runKey = normalizeRunKey(url.searchParams.get(\"run\"));\n    const requestedWorldId = `shared-yard-v0-${runKey}`;\n    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ ok: false, error: \"invalid_player\" }, 400);\n\n    let player: SharedYardPlayer | undefined;\n    let resumed = false;\n",
        "    const requestedResumeToken = (url.searchParams.get(\"resume\") ?? \"\").trim();\n    const runKey = normalizeRunKey(url.searchParams.get(\"run\"));\n    const requestedWorldId = `shared-yard-v0-${runKey}`;\n    const requestedLifecycleR0 = url.searchParams.get(\"lifecycle\") === R0_LIFECYCLE_MODE;\n    if (!PLAYER_ID_PATTERN.test(playerId)) return json({ ok: false, error: \"invalid_player\" }, 400);\n    if (this.world && requestedLifecycleR0 !== this.lifecycleR0) {\n      return json({ ok: false, error: \"world_mode_mismatch\" }, 409);\n    }\n\n    let player: SharedYardPlayer | undefined;\n    let resumed = false;\n    let topologyChanged = false;\n",
        "authority r0 request mode",
    )
    text = replace_once(
        text,
        "      // Fresh actors otherwise may only join before the run starts. Reconnects use the private token above.\n      if (this.protocolStartTick !== null || this.loopTimer) return json({ ok: false, error: \"world_v0_run_already_active\" }, 409);\n      if (this.players.size >= MAX_PLAYERS) return json({ ok: false, error: \"world_v0_full\" }, 503);\n      if (!this.world) this.createWorld(requestedWorldId);\n      if (!this.world || !this.worldId || !this.worldEpoch) return json({ ok: false, error: \"world_not_ready\" }, 500);\n      if (this.worldId !== requestedWorldId) return json({ ok: false, error: \"world_id_mismatch\" }, 409);\n\n      const slot = this.players.size;\n",
        "      // The research-only R0 lifecycle mode admits one new authored slot into an\n      // already-running epoch. Default World V0 remains fixed-2P and unchanged.\n      const allowR0LateJoin = this.lifecycleR0 && activeEpoch && this.players.size < MAX_PLAYERS;\n      if (!allowR0LateJoin && (this.protocolStartTick !== null || this.loopTimer)) {\n        return json({ ok: false, error: \"world_v0_run_already_active\" }, 409);\n      }\n      if (this.players.size >= MAX_PLAYERS) return json({ ok: false, error: \"world_v0_full\" }, 503);\n      if (!this.world) this.createWorld(requestedWorldId, requestedLifecycleR0);\n      if (!this.world || !this.worldId || !this.worldEpoch) return json({ ok: false, error: \"world_not_ready\" }, 500);\n      if (this.worldId !== requestedWorldId) return json({ ok: false, error: \"world_id_mismatch\" }, 409);\n\n      const usedSlots = new Set(this.sortedPlayers().map((candidate) => candidate.slot));\n      const slot = [0, 1].find((candidate) => !usedSlots.has(candidate)) ?? -1;\n",
        "authority r0 late admission",
    )
    text = replace_once(
        text,
        "      this.players.set(player.sessionId, player);\n    }\n",
        "      this.players.set(player.sessionId, player);\n      if (this.lifecycleR0) {\n        this.advanceR0Topology();\n        topologyChanged = true;\n      }\n    }\n",
        "authority topology advance on actor add",
    )
    text = replace_once(
        text,
        "    const rebaseSeed = resumed && this.protocolStartTick !== null\n      ? this.createAuthorityRebaseSeed()\n      : null;\n\n    this.send(server, {\n",
        "    const topologyRebaseSeed = topologyChanged && this.lifecycleR0 && this.protocolStartTick !== null\n      ? this.createAuthorityRebaseSeed()\n      : null;\n    const rebaseSeed = topologyRebaseSeed ?? (resumed && this.protocolStartTick !== null\n      ? this.createAuthorityRebaseSeed()\n      : null);\n\n    this.send(server, {\n",
        "authority topology rebase seed",
    )
    text = replace_once(
        text,
        "      waitingForPeer: this.connectedPlayerCount() < MAX_PLAYERS,\n      protocolStartTick: this.protocolStartTick,\n",
        "      waitingForPeer: !this.lifecycleR0 && this.connectedPlayerCount() < MAX_PLAYERS,\n      acceptingLateJoin: this.lifecycleR0 && this.players.size < MAX_PLAYERS,\n      protocolStartTick: this.protocolStartTick,\n",
        "authority welcome lifecycle mode",
    )
    text = replace_once(
        text,
        "      state: this.snapshotState(),\n      serverTime: Date.now(),\n      ...this.identityPayload(),\n    });\n    this.broadcast({\n",
        "      state: this.snapshotState(),\n      serverTime: Date.now(),\n      ...this.topologyEnvelope(),\n      ...this.identityPayload(),\n    });\n    this.broadcast({\n",
        "authority welcome topology",
    )
    text = replace_once(
        text,
        "      players: this.snapshotState().players.map(({ id, sessionId, slot: playerSlot, netEntityId: entityId }) => ({\n        id,\n        sessionId,\n        slot: playerSlot,\n        netEntityId: entityId,\n      })),\n      ...this.identityPayload(),\n    });\n    return new Response(null, { status: 101, webSocket: client });\n",
        "      players: this.snapshotState().players.map(({ id, sessionId, slot: playerSlot, netEntityId: entityId }) => ({\n        id,\n        sessionId,\n        slot: playerSlot,\n        netEntityId: entityId,\n      })),\n      ...this.topologyEnvelope(),\n      ...this.identityPayload(),\n    });\n    if (topologyRebaseSeed) {\n      this.broadcast({\n        type: \"world_v0_topology_changed\",\n        boundaryTick: this.tick,\n        topology: this.topologyPayload(),\n        rebaseSeed: topologyRebaseSeed,\n        serverTime: Date.now(),\n        ...this.identityPayload(),\n      });\n    }\n    return new Response(null, { status: 101, webSocket: client });\n",
        "authority topology changed broadcast",
    )
    text = replace_once(
        text,
        "  private maybeStartProtocol(): void {\n    if (this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;\n    if (this.connectedPlayerCount() !== MAX_PLAYERS) return;\n    if ([...this.players.values()].some((player) => !player.ready)) return;\n\n    this.clearPreStartAmbiguityTimer();\n",
        "  private maybeStartProtocol(): void {\n    if (this.protocolStartTick !== null) return;\n    const requiredPlayers = this.lifecycleR0 ? 1 : MAX_PLAYERS;\n    if (this.players.size < requiredPlayers) return;\n    if (this.connectedPlayerCount() !== this.players.size) return;\n    if ([...this.players.values()].some((player) => !player.ready)) return;\n\n    this.clearPreStartAmbiguityTimer();\n",
        "authority solo protocol start",
    )
    text = replace_once(
        text,
        "      state: this.snapshotState(),\n      serverTime: Date.now(),\n      ...this.identityPayload(),\n    });\n    this.startLoop();\n  }\n\n  private createWorld(worldId: string): void {\n",
        "      state: this.snapshotState(),\n      serverTime: Date.now(),\n      ...this.topologyEnvelope(),\n      ...this.identityPayload(),\n    });\n    this.startLoop();\n  }\n\n  private createWorld(worldId: string, lifecycleR0 = false): void {\n",
        "authority start topology + create signature",
    )
    text = replace_once(
        text,
        "    this.worldId = worldId;\n    this.worldEpoch = crypto.randomUUID();\n    this.tick = 0;\n",
        "    this.worldId = worldId;\n    this.worldEpoch = crypto.randomUUID();\n    this.lifecycleR0 = lifecycleR0;\n    this.topologyRevision = 0;\n    this.tick = 0;\n",
        "authority world mode init",
    )
    text = replace_once(
        text,
        "        players: consumed,\n        serverTime: Date.now(),\n        ...this.identityPayload(),\n",
        "        players: consumed,\n        serverTime: Date.now(),\n        ...this.topologyEnvelope(),\n        ...this.identityPayload(),\n",
        "authority consumed topology",
    )
    old_guard = """  private packStateGuard(sample: SharedYardSceneSample): { revision: string; packed: string } | null {\n    const byId = new Map<string, DynamicState>();\n    for (const player of sample.players) byId.set(player.netEntityId, player);\n    for (const prop of sample.props) byId.set(prop.netEntityId, prop);\n    if (byId.size !== WORLD_V0_NET_ENTITY_ORDER.length) return null;\n\n    let packed = \"\";\n    for (const netEntityId of WORLD_V0_NET_ENTITY_ORDER) {\n      const state = byId.get(netEntityId);\n      if (!state) return null;\n      for (const value of flattenDynamicState(state)) packed += encodeFloat32Bits(value);\n    }\n    return { revision: WORLD_V0_STATE_GUARD_REVISION, packed };\n  }\n"""
    new_guard = """  private packStateGuard(sample: SharedYardSceneSample) {\n    const byId = new Map<string, DynamicState>();\n    for (const player of sample.players) byId.set(player.netEntityId, player);\n    for (const prop of sample.props) byId.set(prop.netEntityId, prop);\n    const topology = this.lifecycleR0 ? this.topologyPayload() : null;\n    const entityOrder = topology?.entityOrder ?? [...WORLD_V0_NET_ENTITY_ORDER];\n    if (byId.size !== entityOrder.length) return null;\n\n    let packed = \"\";\n    for (const netEntityId of entityOrder) {\n      const state = byId.get(netEntityId);\n      if (!state) return null;\n      for (const value of flattenDynamicState(state)) packed += encodeFloat32Bits(value);\n    }\n    return topology\n      ? {\n          revision: WORLD_V0_STATE_GUARD_REVISION,\n          packed,\n          topologyRevision: topology.revision,\n          topologyDigest: topology.digest,\n        }\n      : { revision: WORLD_V0_STATE_GUARD_REVISION, packed };\n  }\n"""
    text = replace_once(text, old_guard, new_guard, "authority dynamic state guard")
    text = replace_once(
        text,
        "        stateGuard: state.stateGuard,\n      };\n",
        "        stateGuard: state.stateGuard,\n        ...(this.lifecycleR0 ? { topology: this.topologyPayload() } : {}),\n      };\n",
        "authority rebase topology",
    )
    text = replace_once(
        text,
        "      finite: sample.finite,\n      stateGuard: this.packStateGuard(sample),\n    };\n",
        "      finite: sample.finite,\n      stateGuard: this.packStateGuard(sample),\n      ...(this.lifecycleR0 ? { topology: this.topologyPayload() } : {}),\n    };\n",
        "authority snapshot topology",
    )
    text = replace_once(
        text,
        "      ...this.snapshotState(),\n      serverTime: Date.now(),\n      ...this.identityPayload(),\n",
        "      ...this.snapshotState(),\n      serverTime: Date.now(),\n      ...this.topologyEnvelope(),\n      ...this.identityPayload(),\n",
        "authority snapshot envelope",
    )
    text = replace_once(
        text,
        "  private sortedPlayers(): SharedYardPlayer[] {\n",
        "  private topologyPayload() {\n    if (!this.lifecycleR0 || !this.worldEpoch) throw new Error(\"r0_topology_not_ready\");\n    const actors = this.sortedPlayers().map((player) => ({\n      sessionId: player.sessionId,\n      netEntityId: player.netEntityId,\n      slot: player.slot,\n    }));\n    const entityOrder = [\n      ...actors.map((actor) => actor.netEntityId),\n      ...WORLD_V0_PROP_LAYOUT.map((prop) => prop.id),\n    ];\n    const digest = topologyDigest(JSON.stringify({\n      modeRevision: R0_AUTHORITY_REVISION,\n      worldEpoch: this.worldEpoch,\n      revision: this.topologyRevision,\n      actors,\n      entityOrder,\n    }));\n    return {\n      modeRevision: R0_AUTHORITY_REVISION,\n      revision: this.topologyRevision,\n      digest,\n      actors,\n      entityOrder,\n    };\n  }\n\n  private topologyEnvelope() {\n    return this.lifecycleR0 ? { topology: this.topologyPayload() } : {};\n  }\n\n  private advanceR0Topology(): void {\n    if (!this.lifecycleR0) return;\n    this.topologyRevision += 1;\n    for (const player of this.players.values()) {\n      player.input.resetForTopology();\n      player.previousJumpIntent = false;\n    }\n  }\n\n  private sortedPlayers(): SharedYardPlayer[] {\n",
        "authority topology methods",
    )
    text = replace_once(
        text,
        "    this.world = null;\n    this.worldId = null;\n    this.worldEpoch = null;\n    this.props = [];\n",
        "    this.world = null;\n    this.worldId = null;\n    this.worldEpoch = null;\n    this.lifecycleR0 = false;\n    this.topologyRevision = 0;\n    this.props = [];\n",
        "authority topology teardown",
    )
    return text


protocol_before = PROTOCOL.read_text()
authority_before = AUTHORITY.read_text()
protocol_after = patch_protocol(protocol_before)
authority_after = patch_authority(authority_before)

if protocol_after == protocol_before and authority_after == authority_before:
    print("WORLD_V0_R0B1_MATERIALIZER_ALREADY_APPLIED")
else:
    PROTOCOL.write_text(protocol_after)
    AUTHORITY.write_text(authority_after)
    print("WORLD_V0_R0B1_MATERIALIZER_APPLIED")
