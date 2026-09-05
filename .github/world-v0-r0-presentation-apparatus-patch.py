from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one seam, got {count}")
    return text.replace(old, new, 1)


# 1) Session friction: R0b replaced manual Restart-round ceremony with
# automatic same-Room / fresh-Epoch recovery. Keep this smoke broad, but make
# it assert the new lifecycle instead of the retired UI action.
session_path = Path("scripts/world-v0-session-friction-smoke.mjs")
session = session_path.read_text()
start = session.index('  rawPeer.close(1000, "session-smoke-peer-leave");')
end = session.index('  Object.assign(result, {', start)
new_lifecycle = '''  rawPeer.close(1000, "session-smoke-peer-leave");
  rawPeer = null;
  await waitFor(cdp, sessionId, `(() => {
    const s = window.__sharedYardV0Session?.();
    const e = window.__sharedYardV0Evidence?.();
    return s?.networkState === "waiting for peer" &&
      e?.identity?.worldEpoch && e.identity.worldEpoch !== ${JSON.stringify(firstEpoch)} &&
      e?.session?.roomRecovery?.pending === false &&
      e?.lifecycleEvents?.some((event) => event.type === "room-recovered" && event.sourceEpoch === ${JSON.stringify(firstEpoch)});
  })()`, "automatic same-room recovery after peer leaves");

  const recovered = await cdp.evaluate(sessionId, `({ session: window.__sharedYardV0Session(), evidence: window.__sharedYardV0Evidence(), inviteHidden: document.querySelector("#copy-invite").classList.contains("hidden"), restartHidden: document.querySelector("#restart-round").classList.contains("hidden") })`);
  assert(recovered.evidence.runtimeFailed === false, `recovery runtime failed ${recovered.evidence.runtimeFailureReason}`);
  assert(recovered.evidence.identity.worldEpoch !== firstEpoch, "room recovery reused old world epoch");
  assert(recovered.evidence.protocolStartTick === null, `recovered waiting epoch unexpectedly active ${recovered.evidence.protocolStartTick}`);
  assert(recovered.session.runKey === run, `room recovery changed Run key ${recovered.session.runKey}`);
  assert(recovered.session.restartAvailable === false, "manual restart remained primary after automatic recovery");
  assert(recovered.inviteHidden === false, "invite action missing after room recovery");
  assert(recovered.restartHidden === true, "restart action should stay hidden after automatic room recovery");
  assert(recovered.evidence.session?.roomRecovery?.lastRecoveredEpoch === recovered.evidence.identity.worldEpoch, `recovery provenance drift ${JSON.stringify(recovered.evidence.session?.roomRecovery)}`);
  assert(recovered.evidence.lifecycleEvents?.some((event) => event.type === "epoch-ended"), "epoch-ended lifecycle evidence missing");
  assert(recovered.evidence.lifecycleEvents?.some((event) => event.type === "room-recovered" && event.sourceEpoch === firstEpoch && event.recoveredEpoch === recovered.evidence.identity.worldEpoch), "room-recovered lifecycle evidence missing");

'''
session = session[:start] + new_lifecycle + session[end:]
result_start = session.index('  Object.assign(result, {', start)
result_end = session.index('  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));', result_start)
new_result = '''  Object.assign(result, {
    verdict: "WORLD_V0_SESSION_FRICTION_PASS",
    run,
    firstEpoch,
    secondEpoch: recovered.evidence.identity.worldEpoch,
    inviteUrl: waiting.session.inviteUrl,
    waiting: {
      networkState: waiting.session.networkState,
      protocolStartTick: waiting.evidence.protocolStartTick,
    },
    recovery: {
      networkState: recovered.session.networkState,
      protocolStartTick: recovered.evidence.protocolStartTick,
      restartAvailable: recovered.session.restartAvailable,
      runtimeFailed: recovered.evidence.runtimeFailed,
      roomRecovery: recovered.evidence.session?.roomRecovery,
    },
  });
'''
session = session[:result_start] + new_result + session[result_end:]
session = replace_once(
    session,
    '  console.log("WORLD_V0_SESSION_FRICTION_PASS", JSON.stringify({ run, firstEpoch, secondEpoch: restarted.evidence.identity.worldEpoch }));',
    '  console.log("WORLD_V0_SESSION_FRICTION_PASS", JSON.stringify({ run, firstEpoch, secondEpoch: recovered.evidence.identity.worldEpoch, automaticRoomRecovery: true }));',
    "session console",
)
session_path.write_text(session)


# 2) Runtime shell: the base URL now exposes the shared Yard directory as the
# primary entry surface. Generated-room controls remain an Advanced fallback.
shell_path = Path("scripts/world-v0-runtime-shell-smoke.mjs")
shell = shell_path.read_text()
shell = replace_once(
    shell,
    'import { WORLD_V0_FRIEND_ENTRY_REVISION } from "../public/world-v0/friend-entry.js";\n',
    'import { WORLD_V0_FRIEND_ENTRY_REVISION } from "../public/world-v0/friend-entry.js";\nimport { WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION } from "../public/world-v0/public-room-entry.js";\n',
    "shell import",
)
shell = replace_once(
    shell,
    '  claimBoundary: "Friend-Ready entry/session shell only; two-client shared-world correctness is covered by the dedicated friend-entry and exact-state falsifiers",',
    '  claimBoundary: "Public-Room R0c entry/session shell only; shared-world correctness is covered by dedicated public-room, lifecycle and exact-state falsifiers",\n  publicRoomEntryRevision: WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,',
    "shell claim",
)
shell = replace_once(
    shell,
    '  await waitFor(cdp, sessionId, `document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function"`, "Friend-Ready desktop boot");',
    '  await waitFor(cdp, sessionId, `(() => { const p=window.__sharedYardV0PublicRoomEntry?.(); return document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0FriendEntry === "function" && p?.revision === "world-v0-public-room-entry-r0c-v1" && p?.rooms?.length === 3 && p.loading === false; })()`, "Public Room desktop boot");',
    "shell boot wait",
)
shell = replace_once(
    shell,
    '''      diagnosticsOpen: document.querySelector("#hud")?.open,
      boot: rect("#boot"),
      name: rect("#callsign"),
      enterRect: rect("#enter"),''',
    '''      diagnosticsOpen: document.querySelector("#hud")?.open,
      publicRoom: window.__sharedYardV0PublicRoomEntry?.(),
      legacyEntryDisplay: getComputedStyle(document.querySelector("#boot .entry-actions")).display,
      boot: rect("#boot"),
      name: rect("#callsign"),
      firstYard: rect('[data-room-id="yard-1"]'),''',
    "shell boot fields",
)
shell = replace_once(
    shell,
    '''  assert(desktopBoot.status.includes("Enter your name"), `desktop friend-facing status drift ${desktopBoot.status}`);
  assert(desktopBoot.enter === "Enter world", `desktop primary action drift ${desktopBoot.enter}`);
  assert(desktopBoot.advancedOpen === false, "advanced/inspection should be closed by default");
  assert(desktopBoot.inspectInsideAdvanced === true, "Inspect solo escaped advanced entry surface");
  assert(/^yard-[A-Za-z0-9_-]{14}$/.test(desktopBoot.roomKey), `strong room key missing ${desktopBoot.roomKey}`);
  assert(desktopBoot.diagnosticsOpen === false, "diagnostics should be collapsed by default");
  assertRect(desktopBoot.boot, 1440, 900, "desktop boot");
  assertRect(desktopBoot.name, 1440, 900, "desktop name input");
  assertRect(desktopBoot.enterRect, 1440, 900, "desktop enter action");''',
    '''  assert(desktopBoot.status.includes("Choose a shared Yard"), `desktop public-room status drift ${desktopBoot.status}`);
  assert(desktopBoot.enter === "Enter world", `advanced compatibility action drift ${desktopBoot.enter}`);
  assert(desktopBoot.advancedOpen === false, "advanced/inspection should be closed by default");
  assert(desktopBoot.inspectInsideAdvanced === true, "Inspect solo escaped advanced entry surface");
  assert(/^yard-[A-Za-z0-9_-]{14}$/.test(desktopBoot.roomKey), `strong generated-room fallback missing ${desktopBoot.roomKey}`);
  assert(desktopBoot.publicRoom?.revision === WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION, `public room revision drift ${JSON.stringify(desktopBoot.publicRoom)}`);
  assert(desktopBoot.publicRoom?.mode === "directory" && desktopBoot.publicRoom?.visible === true && desktopBoot.publicRoom?.rooms?.length === 3, `public room directory shell drift ${JSON.stringify(desktopBoot.publicRoom)}`);
  assert(desktopBoot.legacyEntryDisplay === "none", `legacy generated-room action remained primary ${desktopBoot.legacyEntryDisplay}`);
  assert(desktopBoot.diagnosticsOpen === false, "diagnostics should be collapsed by default");
  assertRect(desktopBoot.boot, 1440, 900, "desktop boot");
  assertRect(desktopBoot.name, 1440, 900, "desktop name input");
  assertRect(desktopBoot.firstYard, 1440, 900, "desktop first Yard action");''',
    "shell boot assertions",
)
click_start = shell.index('  const suffix = Date.now().toString(36).slice(-7);')
click_end = shell.index('  await waitFor(cdp, sessionId, `window.__sharedYardV0Session?.().networkState === "waiting for peer"', click_start)
new_click = '''  const suffix = Date.now().toString(36).slice(-7);
  const selectedRoom = await cdp.evaluate(sessionId, `(() => {
    const callsign = document.querySelector("#callsign");
    callsign.value = ${JSON.stringify(`shell-${suffix}`)};
    callsign.dispatchEvent(new Event("input", { bubbles: true }));
    const snapshot = window.__sharedYardV0PublicRoomEntry?.();
    const room = snapshot?.rooms?.find((item) => item.occupancy === 0 && item.joinable === true);
    if (!room) return null;
    document.querySelector('[data-room-id="' + room.id + '"]')?.click();
    return room.id;
  })()`);
  assert(selectedRoom, "no empty shared Yard available for shell entry");
'''
shell = shell[:click_start] + new_click + shell[click_end:]
shell = replace_once(
    shell,
    '''    uiRevision: window.__sharedYardV0Evidence?.().uiRevision,
    friendEntry: window.__sharedYardV0FriendEntry?.(),''',
    '''    uiRevision: window.__sharedYardV0Evidence?.().uiRevision,
    friendEntry: window.__sharedYardV0FriendEntry?.(),
    publicRoomEntry: window.__sharedYardV0PublicRoomEntry?.(),''',
    "shell waiting fields",
)
shell = replace_once(
    shell,
    '''  assert(desktopWaiting.status.includes("Waiting for friend"), `compact friend status drift ${desktopWaiting.status}`);
  assert(desktopWaiting.compact === true && desktopWaiting.inputsDisplay === "none", `compact entry shell failed ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.inviteVisible === true && desktopWaiting.inviteText === "Invite friend", `invite action unavailable ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision drift ${desktopWaiting.uiRevision}`);
  assert(desktopWaiting.friendEntry?.mode === "host" && desktopWaiting.friendEntry?.roomKeyValid === true, `friend entry evidence drift ${JSON.stringify(desktopWaiting.friendEntry)}`);
  assert(new URL(desktopWaiting.inviteUrl).searchParams.get("run") === desktopWaiting.friendEntry.roomKey, `invite URL room drift ${desktopWaiting.inviteUrl}`);''',
    '''  assert(desktopWaiting.status.includes("Waiting in this Yard"), `compact public-room status drift ${desktopWaiting.status}`);
  assert(desktopWaiting.compact === true && desktopWaiting.inputsDisplay === "none", `compact entry shell failed ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.inviteVisible === true && desktopWaiting.inviteText === "Invite friend", `invite action unavailable ${JSON.stringify(desktopWaiting)}`);
  assert(desktopWaiting.uiRevision === WORLD_V0_BROWSER_UI_REVISION, `UI revision drift ${desktopWaiting.uiRevision}`);
  assert(desktopWaiting.friendEntry?.mode === "host" && desktopWaiting.friendEntry?.roomKey === selectedRoom, `friend entry room drift ${JSON.stringify(desktopWaiting.friendEntry)}`);
  assert(desktopWaiting.publicRoomEntry?.selectedRoom === selectedRoom, `public-room selection drift ${JSON.stringify(desktopWaiting.publicRoomEntry)}`);
  assert(new URL(desktopWaiting.inviteUrl).searchParams.get("run") === selectedRoom, `invite URL room drift ${desktopWaiting.inviteUrl}`);''',
    "shell waiting assertions",
)
shell_path.write_text(shell)

print("R0 presentation apparatus patch materialized")
