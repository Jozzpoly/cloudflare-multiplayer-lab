from pathlib import Path
import subprocess


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one marker, got {count}")
    return text.replace(before, after)


contract_path = Path("src/world-v0-contract.ts")
contract = contract_path.read_text()
contract = replace_once(
    contract,
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v10-retry-aligned-grace";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v7-retry-aligned-grace";',
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v11-prestart-ambiguity-grace";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v8-prestart-ambiguity-grace";',
    "revision",
)
contract = replace_once(
    contract,
    """// Actor input still fails neutral after the 36-tick lease. WorldEpoch lifetime is
// separate and must outlive the browser's current 12-attempt (~18.25 s nominal)
// ActorSession resume schedule with bounded handshake/detection margin.
export const WORLD_V0_LIFECYCLE = {
  allDisconnectedGraceTicks: 20 * 60,
} as const;""",
    """// Actor input still fails neutral after the 36-tick lease. WorldEpoch lifetime is
// separate and must outlive the browser's current 12-attempt (~18.25 s nominal)
// ActorSession resume schedule with bounded handshake/detection margin. A fully
// assembled two-player pre-start room gets the same bounded window because the
// authority cannot distinguish a lost final ready frame from a browser that never
// sent it. A one-player waiting room remains fail-closed on disconnect.
export const WORLD_V0_LIFECYCLE = {
  allDisconnectedGraceTicks: 20 * 60,
  preStartAmbiguityGraceTicks: 20 * 60,
} as const;""",
    "lifecycle",
)
contract_path.write_text(contract)

server_path = Path("src/world-v0-shared-yard.ts")
server = server_path.read_text()
server = replace_once(
    server,
    "  private allDisconnectedSinceTick: number | null = null;\n  private supportContacts:",
    "  private allDisconnectedSinceTick: number | null = null;\n  private preStartAmbiguityTimer: ReturnType<typeof setTimeout> | null = null;\n  private supportContacts:",
    "timer-field",
)
server = replace_once(
    server,
    """    player.socket = server;
    if (resumed) player.resumeCount += 1;
    this.sessionBySocket.set(server, player.sessionId);
    const rebaseSeed = resumed && this.protocolStartTick !== null""",
    """    player.socket = server;
    if (resumed) player.resumeCount += 1;
    this.sessionBySocket.set(server, player.sessionId);
    if (this.protocolStartTick === null && this.connectedPlayerCount() === MAX_PLAYERS) {
      this.clearPreStartAmbiguityTimer();
    }
    const rebaseSeed = resumed && this.protocolStartTick !== null""",
    "resume-clears-grace",
)
server = replace_once(
    server,
    """    if ([...this.players.values()].some((player) => !player.ready)) return;

    this.protocolStartTick = this.tick + WORLD_V0_TIMING.protocolStartDelayTicks;""",
    """    if ([...this.players.values()].some((player) => !player.ready)) return;

    this.clearPreStartAmbiguityTimer();
    this.protocolStartTick = this.tick + WORLD_V0_TIMING.protocolStartDelayTicks;""",
    "start-clears-grace",
)
old_detach = """  private detachSocket(ws: WebSocket): void {
    const sessionId = this.sessionBySocket.get(ws);
    this.sessionBySocket.delete(ws);
    if (!sessionId) return;
    const player = this.players.get(sessionId);
    if (!player || player.socket !== ws) return;
    player.socket = null;

    // Before canonical play starts there is no ticking input lease and no earned
    // same-epoch run continuity yet. Preserve the old fail-closed waiting-room
    // behavior so a vanished peer cannot strand an occupied ActorSession slot.
    if (this.protocolStartTick === null) {
      this.endEpoch("peer_disconnected_before_start");
    }
  }
"""
new_detach = """  private clearPreStartAmbiguityTimer(): void {
    if (this.preStartAmbiguityTimer) clearTimeout(this.preStartAmbiguityTimer);
    this.preStartAmbiguityTimer = null;
  }

  private schedulePreStartAmbiguityRetirement(): void {
    if (this.preStartAmbiguityTimer || this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;
    const graceMs = WORLD_V0_LIFECYCLE.preStartAmbiguityGraceTicks * STEP_MS;
    this.preStartAmbiguityTimer = setTimeout(() => {
      this.preStartAmbiguityTimer = null;
      if (this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;
      if (this.connectedPlayerCount() === MAX_PLAYERS) return;
      this.endEpoch("peer_disconnected_before_start_grace_expired");
    }, graceMs);
  }

  private detachSocket(ws: WebSocket): void {
    const sessionId = this.sessionBySocket.get(ws);
    this.sessionBySocket.delete(ws);
    if (!sessionId) return;
    const player = this.players.get(sessionId);
    if (!player || player.socket !== ws) return;
    player.socket = null;

    // A one-player waiting room has no ambiguous start commitment and remains
    // fail-closed. Once two actors have been assembled, however, a browser may
    // have sent its final ready frame without the authority receiving it. Preserve
    // that exact pre-start ambiguity for one bounded ActorSession retry horizon.
    if (this.protocolStartTick === null) {
      if (this.players.size === MAX_PLAYERS) this.schedulePreStartAmbiguityRetirement();
      else this.endEpoch("peer_disconnected_before_start");
    }
  }
"""
server = replace_once(server, old_detach, new_detach, "detach-policy")
server = replace_once(
    server,
    """  private endEpoch(reason: string): void {
    if (this.resetting) return;
    this.resetting = true;
    const identity = this.identityPayloadSafe();""",
    """  private endEpoch(reason: string): void {
    if (this.resetting) return;
    this.resetting = true;
    this.clearPreStartAmbiguityTimer();
    const identity = this.identityPayloadSafe();""",
    "end-clears-grace",
)
server = replace_once(
    server,
    """  private destroyWorld(): void {
    if (this.world) {""",
    """  private destroyWorld(): void {
    this.clearPreStartAmbiguityTimer();
    if (this.world) {""",
    "destroy-clears-grace",
)
server_path.write_text(server)

audit_path = Path("scripts/world-v0-closure-uncommitted-ready-audit.mjs")
audit = audit_path.read_text()
audit = replace_once(
    audit,
    """      if (message?.type === "world_v0_ready") {
        window.__mwHeldReadyCount = (window.__mwHeldReadyCount || 0) + 1;
        window.__mwHeldReady = String(data);
        return;
      }""",
    """      if (message?.type === "world_v0_ready" && (window.__mwHeldReadyCount || 0) === 0) {
        window.__mwHeldReadyCount = 1;
        window.__mwHeldReady = String(data);
        return;
      }""",
    "hold-first-ready-only",
)
audit = replace_once(
    audit,
    '  rawA.ws.send(JSON.stringify({ type: "world_v0_ping", id: 771 }));\n  const pong = await waitRaw(rawA, (m) => m?.type === "world_v0_pong" && m.id === 771, "A pre-drop pong");',
    '  rawA.ws.send(JSON.stringify({ type: "world_v0_ping", id: "pre-drop-771" }));\n  const pong = await waitRaw(rawA, (m) => m?.type === "world_v0_pong" && m.id === "pre-drop-771", "A pre-drop pong");',
    "valid-ping",
)
start_marker = """  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return e?.session?.actorResume?.pending === true && e?.session?.actorResume?.attempts >= 1; })()',
    "B ambiguous ActorSession recovery", 8000);"""
start = audit.find(start_marker)
if start < 0:
    raise RuntimeError("audit result start marker missing")
end_marker = "  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));"
end = audit.find(end_marker, start)
if end < 0:
    raise RuntimeError("audit result end marker missing")
replacement = """  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return (e?.lifecycleEvents || []).some((event) => event.type === "actor-resume-attempt"); })()',
    "B automatic ambiguity recovery attempt", 8000);
  const afterDrop = await evidence(browser);

  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return !e?.runtimeFailed && (e?.lifecycleEvents || []).some((event) => event.type === "actor-resume-prestart-complete"); })()',
    "B prestart ActorSession resume complete", 8000);
  const resumedPreStart = await evidence(browser);
  assert(resumedPreStart.identity?.worldEpoch === aw.worldEpoch, "B prestart resume rotated WorldEpoch");
  assert(resumedPreStart.session?.actorSessionId === captured.selfSessionId, "B prestart resume changed ActorSession");
  assert(!rawA.messages.some((m) => m?.type === "world_v0_epoch_ended"), "authority ended ambiguity epoch during successful resume");

  const startA = await waitRaw(rawA, (m) => m?.type === "world_v0_start", "A start after B resumed ready", 8000);
  await waitBrowser(browser,
    '(() => { const e=window.__sharedYardV0Evidence?.(); return !e?.runtimeFailed && Number.isInteger(e?.protocolStartTick) && Number.isInteger(e?.localBoundaryTick); })()',
    "B active after ambiguity recovery", 8000);
  const activeB = await evidence(browser);
  assert(startA.worldEpoch === aw.worldEpoch, "authority rotated epoch before recovered start");
  assert(activeB.identity?.worldEpoch === aw.worldEpoch, "B active world rotated after ambiguity recovery");
  assert(activeB.session?.actorSessionId === captured.selfSessionId, "B active ActorSession changed after ambiguity recovery");
  assert(activeB.metrics?.guardMismatches === 0, "B exact-state guard mismatch after ambiguity recovery");
  assert(!rawA.messages.some((m) => m?.type === "world_v0_epoch_ended"), "authority ended recovered ambiguity epoch");

  result = {
    revision: "world-v0-closure-uncommitted-ready-v2-recovered",
    chromeVersion: version,
    run,
    authorityBeforeDrop: {
      worldEpoch: aw.worldEpoch,
      rosterPlayers: rosterA.players.length,
      protocolStartTick: pong.protocolStartTick,
      startObserved: false,
    },
    browserBeforeDrop: {
      networkState: before.networkState,
      protocolStartTick: before.protocolStartTick,
      localBoundaryTick: before.localBoundaryTick,
      heldReadyCount: await browser.cdp.evaluate(browser.sessionId, "window.__mwHeldReadyCount || 0"),
      actorSessionId: captured.selfSessionId,
    },
    recovery: {
      attemptObserved: (afterDrop.lifecycleEvents || []).some((event) => event.type === "actor-resume-attempt"),
      prestartResumeObserved: (resumedPreStart.lifecycleEvents || []).some((event) => event.type === "actor-resume-prestart-complete"),
      sameWorldEpoch: activeB.identity?.worldEpoch === aw.worldEpoch,
      sameActorSession: activeB.session?.actorSessionId === captured.selfSessionId,
      protocolStartTick: activeB.protocolStartTick,
      localBoundaryTick: activeB.localBoundaryTick,
      guardMismatches: activeB.metrics?.guardMismatches,
    },
    proxy: { drop, current: proxy.snapshot() },
    verdict: "WORLD_V0_CLOSURE_UNCOMMITTED_READY_RECOVERY_PASS",
    interpretation: "A two-player pre-start room remains resumable across the unavoidable ready-delivery ambiguity: the browser's first ready never reached authority, authority remained unscheduled, transport dropped, the same ActorSession resumed inside bounded grace, the browser re-sent ready, and the original WorldEpoch then started normally.",
    nonClaim: "This is a bounded local Chromium/Workerd causal proof. It does not provide persistence, process-loss recovery, cross-tab token persistence, or a guarantee beyond the configured pre-start ambiguity grace.",
  };
"""
audit = audit[:start] + replacement + audit[end:]
audit_path.write_text(audit)

sim_build_id = subprocess.check_output(
    [
        "node",
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        'import("./src/world-v0-contract.ts").then((m) => console.log(m.WORLD_V0_SIM_BUILD_ID))',
    ],
    text=True,
).strip().splitlines()[-1]

build_path = Path("public/world-v0/build-contract.js")
build = build_path.read_text()
for before, after, label in [
    ("shared-yard-v0-browser-ui-v13-bounded-start-window-resume", "shared-yard-v0-browser-ui-v14-prestart-ambiguity-grace", "ui-revision"),
    ("shared-yard-v0-authority-v7-retry-aligned-grace", "shared-yard-v0-authority-v8-prestart-ambiguity-grace", "server-revision"),
    ("shared-yard-v0-sim-9c308539ccf305cc", sim_build_id, "sim-build"),
]:
    build = replace_once(build, before, after, label)
build_path.write_text(build)

print("WORLD_V0_PRESTART_AMBIGUITY_CANDIDATE", sim_build_id)
