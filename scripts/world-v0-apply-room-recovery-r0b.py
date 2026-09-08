from pathlib import Path

APP = Path("public/world-v0/app.js")
BUILD = Path("public/world-v0/build-contract.js")

text = APP.read_text()
build = BUILD.read_text()


def replace_once(haystack: str, old: str, new: str, label: str) -> str:
    count = haystack.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return haystack.replace(old, new, 1)


text = replace_once(
    text,
    'const LIFECYCLE_RETAIN = 32;\nconst EPS = 1e-9;',
    'const LIFECYCLE_RETAIN = 32;\nconst ROOM_RECOVERY_MAX_ATTEMPTS = 6;\nconst ROOM_RECOVERY_BASE_DELAY_MS = 250;\nconst ROOM_RECOVERY_MAX_DELAY_MS = 4000;\nconst EPS = 1e-9;',
    "room recovery constants",
)

text = replace_once(
    text,
    'let lastFrameAt = null;\nlet correctionFrameWindowUntil = 0;\n\nconst pendingPings = new Map();',
    '''let lastFrameAt = null;\nlet correctionFrameWindowUntil = 0;\nlet roomRecovery = {\n  pending: false,\n  reason: null,\n  attempts: 0,\n  timer: null,\n  sourceEpoch: null,\n  lastRecoveredEpoch: null,\n};\n\nconst pendingPings = new Map();''',
    "room recovery state",
)

old_actions = '''function canRestartRound() {\n  return !runtimeFailed && networkState.startsWith("closed") && (!socket || socket.readyState === WebSocket.CLOSED);\n}\n\nfunction updateSessionActions() {\n  const compact = boot.classList.contains("compact");\n  const inviteVisible = compact && (networkState === "waiting for peer" || networkState.startsWith("closed") || networkState.startsWith("epoch ended"));\n  const restartVisible = compact && canRestartRound();\n  copyInviteButton.classList.toggle("hidden", !inviteVisible);\n  restartRoundButton.classList.toggle("hidden", !restartVisible);\n  sessionActions.classList.toggle("hidden", !inviteVisible && !restartVisible);\n}\n\nfunction expectedWorldId() {'''

new_actions = '''function canRestartRound() {\n  return !runtimeFailed && !roomRecovery.pending && networkState.startsWith("closed") && (!socket || socket.readyState === WebSocket.CLOSED);\n}\n\nfunction updateSessionActions() {\n  const compact = boot.classList.contains("compact");\n  const inviteVisible = compact && !roomRecovery.pending && (networkState === "waiting for peer" || networkState.startsWith("closed") || networkState.startsWith("epoch ended"));\n  const restartVisible = compact && canRestartRound();\n  copyInviteButton.classList.toggle("hidden", !inviteVisible);\n  restartRoundButton.classList.toggle("hidden", !restartVisible);\n  sessionActions.classList.toggle("hidden", !inviteVisible && !restartVisible);\n}\n\nfunction recoverableRoomEpochReason(reason) {\n  const value = String(reason || "");\n  return value === "peer_left_restart_required"\n    || value === "peer_error_restart_required"\n    || value.startsWith("input_lease_expired:");\n}\n\nfunction clearRoomRecoveryTimer() {\n  if (roomRecovery.timer) clearTimeout(roomRecovery.timer);\n  roomRecovery.timer = null;\n}\n\nfunction roomRecoverySnapshot() {\n  return {\n    pending: roomRecovery.pending,\n    reason: roomRecovery.reason,\n    attempts: roomRecovery.attempts,\n    sourceEpoch: roomRecovery.sourceEpoch,\n    lastRecoveredEpoch: roomRecovery.lastRecoveredEpoch,\n    waitingForVisibility: roomRecovery.pending && document.visibilityState !== "visible",\n  };\n}\n\nfunction reconnectSameRoom() {\n  if (!roomRecovery.pending || runtimeFailed) return false;\n  if (document.visibilityState !== "visible") return false;\n  if (socket && socket.readyState !== WebSocket.CLOSED) return false;\n  if (roomRecovery.attempts >= ROOM_RECOVERY_MAX_ATTEMPTS) {\n    roomRecovery.pending = false;\n    networkState = "room reconnect exhausted";\n    showNotice("Could not rejoin this Yard automatically. Try joining it again.");\n    updateProductStatus();\n    return false;\n  }\n\n  roomRecovery.attempts += 1;\n  const attempt = roomRecovery.attempts;\n  const reason = roomRecovery.reason;\n  resetProtocolState({ preserveRoomRecovery: true });\n  playing = true;\n  networkState = `rejoining room · attempt ${attempt}`;\n  recordLifecycle("room-reconnect-attempt", { attempt, reason, roomId: runKey, sourceEpoch: roomRecovery.sourceEpoch });\n  updateProductStatus();\n  connect();\n  return true;\n}\n\nfunction scheduleRoomRecovery(reason = roomRecovery.reason) {\n  if (runtimeFailed || !recoverableRoomEpochReason(reason)) return false;\n  roomRecovery.pending = true;\n  roomRecovery.reason = String(reason);\n  if (!roomRecovery.sourceEpoch) roomRecovery.sourceEpoch = identity?.worldEpoch || null;\n\n  if (document.visibilityState !== "visible") {\n    clearRoomRecoveryTimer();\n    networkState = "room paused · return to rejoin";\n    showNotice("Yard is still here. Return to the game to rejoin it.");\n    updateProductStatus();\n    return true;\n  }\n\n  if (roomRecovery.timer) return true;\n  if (socket && socket.readyState !== WebSocket.CLOSED) return true;\n  if (roomRecovery.attempts >= ROOM_RECOVERY_MAX_ATTEMPTS) return reconnectSameRoom();\n\n  const delay = Math.min(\n    ROOM_RECOVERY_MAX_DELAY_MS,\n    ROOM_RECOVERY_BASE_DELAY_MS * (2 ** roomRecovery.attempts),\n  );\n  networkState = `rejoining room · attempt ${roomRecovery.attempts + 1}`;\n  showNotice("Rejoining the same Yard…");\n  updateProductStatus();\n  roomRecovery.timer = setTimeout(() => {\n    roomRecovery.timer = null;\n    reconnectSameRoom();\n  }, delay);\n  return true;\n}\n\nfunction expectedWorldId() {'''

text = replace_once(text, old_actions, new_actions, "room recovery helpers")

old_welcome = '''  if (message.type === "world_v0_welcome") {\n    adoptIdentity(message, "welcome");\n    simulation = assertSimulationContract(message.simulation, "welcome");\n    selfSessionId = message.selfSessionId;\n    selfNetEntityId = message.selfNetEntityId;\n    selfSlot = message.slot;\n    networkState = message.waitingForPeer ? "waiting for peer" : "peer joined";\n    return;\n  }'''

new_welcome = '''  if (message.type === "world_v0_welcome") {\n    const recoveringRoom = roomRecovery.pending;\n    const sourceEpoch = roomRecovery.sourceEpoch;\n    adoptIdentity(message, "welcome");\n    if (recoveringRoom && sourceEpoch && message.worldEpoch === sourceEpoch) {\n      throw new Error(`room recovery reused ended epoch ${sourceEpoch}`);\n    }\n    simulation = assertSimulationContract(message.simulation, "welcome");\n    selfSessionId = message.selfSessionId;\n    selfNetEntityId = message.selfNetEntityId;\n    selfSlot = message.slot;\n    networkState = message.waitingForPeer ? "waiting for peer" : "peer joined";\n    if (recoveringRoom) {\n      clearRoomRecoveryTimer();\n      roomRecovery.pending = false;\n      roomRecovery.reason = null;\n      roomRecovery.attempts = 0;\n      roomRecovery.lastRecoveredEpoch = message.worldEpoch;\n      roomRecovery.sourceEpoch = null;\n      recordLifecycle("room-recovered", { roomId: runKey, sourceEpoch, recoveredEpoch: message.worldEpoch });\n      showNotice(message.waitingForPeer ? "Back in the same Yard · waiting for friend" : "Back in the same Yard");\n    }\n    return;\n  }'''

text = replace_once(text, old_welcome, new_welcome, "welcome recovery")

old_epoch = '''  if (message.type === "world_v0_epoch_ended") {\n    assertMessageIdentity(message, "epoch-ended");\n    playing = false;\n    sessionEnd = {\n      kind: "epoch-ended",\n      reason: message.reason,\n      boundaryTick: message.boundaryTick ?? localState?.boundaryTick ?? null,\n      at: new Date().toISOString(),\n    };\n    networkState = `epoch ended · ${message.reason}`;\n    jumpButton.classList.add("hidden");\n    joystick.classList.remove("active");\n    cameraGimbal.classList.remove("active");\n    recordLifecycle("epoch-ended", { reason: message.reason, boundaryTick: message.boundaryTick ?? null });\n    showNotice(`Shared Yard round ended: ${message.reason}. Restart when ready.`);\n    persistLastSessionEvidence("epoch-ended");\n    updateProductStatus();\n    return;\n  }'''

new_epoch = '''  if (message.type === "world_v0_epoch_ended") {\n    assertMessageIdentity(message, "epoch-ended");\n    const recoverable = recoverableRoomEpochReason(message.reason);\n    if (recoverable) {\n      clearRoomRecoveryTimer();\n      roomRecovery.pending = true;\n      roomRecovery.reason = message.reason;\n      roomRecovery.attempts = 0;\n      roomRecovery.sourceEpoch = message.worldEpoch;\n    }\n    playing = false;\n    sessionEnd = {\n      kind: "epoch-ended",\n      reason: message.reason,\n      boundaryTick: message.boundaryTick ?? localState?.boundaryTick ?? null,\n      at: new Date().toISOString(),\n    };\n    networkState = recoverable ? "room epoch ended · recovery pending" : `epoch ended · ${message.reason}`;\n    jumpButton.classList.add("hidden");\n    joystick.classList.remove("active");\n    cameraGimbal.classList.remove("active");\n    recordLifecycle("epoch-ended", { reason: message.reason, boundaryTick: message.boundaryTick ?? null, recoverable });\n    showNotice(recoverable ? "Yard is restarting this round…" : `Shared Yard round ended: ${message.reason}. Restart when ready.`);\n    persistLastSessionEvidence("epoch-ended");\n    updateProductStatus();\n    return;\n  }'''

text = replace_once(text, old_epoch, new_epoch, "epoch recovery classification")

old_close_tail = '''    recordLifecycle("socket-close", { code: event.code, reason: event.reason || null, wasClean: event.wasClean, expectedAfterEpochEnd });\n    persistLastSessionEvidence("socket-close");\n    updateProductStatus();\n    if (!runtimeFailed) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");\n  });'''

new_close_tail = '''    const closeReason = event.reason || sessionEnd?.reason || "";\n    if (!roomRecovery.pending && recoverableRoomEpochReason(closeReason)) {\n      roomRecovery.pending = true;\n      roomRecovery.reason = closeReason;\n      roomRecovery.attempts = 0;\n      roomRecovery.sourceEpoch = identity?.worldEpoch || null;\n    }\n    recordLifecycle("socket-close", { code: event.code, reason: event.reason || null, wasClean: event.wasClean, expectedAfterEpochEnd, roomRecoveryPending: roomRecovery.pending });\n    persistLastSessionEvidence("socket-close");\n    updateProductStatus();\n    if (!runtimeFailed && roomRecovery.pending) {\n      scheduleRoomRecovery(roomRecovery.reason);\n      return;\n    }\n    if (!runtimeFailed) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");\n  });'''

text = replace_once(text, old_close_tail, new_close_tail, "socket recovery scheduling")

old_evidence = '''    session: {\n      inviteUrl: buildInviteUrl(),\n      restartAvailable: canRestartRound(),\n      end: sessionEnd ? { ...sessionEnd } : null,\n    },\n    metrics:'''
new_evidence = '''    session: {\n      inviteUrl: buildInviteUrl(),\n      restartAvailable: canRestartRound(),\n      end: sessionEnd ? { ...sessionEnd } : null,\n      roomRecovery: roomRecoverySnapshot(),\n    },\n    metrics:'''
text = replace_once(text, old_evidence, new_evidence, "evidence recovery snapshot")

old_visibility = '''document.addEventListener("visibilitychange", () => {\n  const now = performance.now();\n  recordLifecycle("visibility", { state: document.visibilityState, elapsedSincePreviousMs: Math.max(0, now - visibilityTransitionAt) });\n  visibilityTransitionAt = now;\n  lastFrameAt = null;\n  if (document.visibilityState !== "visible") neutralizeTransientInputs();\n});\nwindow.__sharedYardV0Session = () => ({\n  inviteUrl: buildInviteUrl(),\n  restartAvailable: canRestartRound(),\n  runKey: sessionRunKey(),\n  networkState,\n});'''

new_visibility = '''document.addEventListener("visibilitychange", () => {\n  const now = performance.now();\n  recordLifecycle("visibility", { state: document.visibilityState, elapsedSincePreviousMs: Math.max(0, now - visibilityTransitionAt) });\n  visibilityTransitionAt = now;\n  lastFrameAt = null;\n  if (document.visibilityState !== "visible") {\n    neutralizeTransientInputs();\n    if (roomRecovery.pending) scheduleRoomRecovery(roomRecovery.reason);\n  } else if (roomRecovery.pending && (!socket || socket.readyState === WebSocket.CLOSED)) {\n    scheduleRoomRecovery(roomRecovery.reason);\n  }\n});\nwindow.__sharedYardV0Session = () => ({\n  inviteUrl: buildInviteUrl(),\n  restartAvailable: canRestartRound(),\n  runKey: sessionRunKey(),\n  networkState,\n  roomRecovery: roomRecoverySnapshot(),\n});'''
text = replace_once(text, old_visibility, new_visibility, "visibility-gated recovery")

old_status = '''function productStatusText() {\n  if (runtimeFailed) return "Runtime problem · open Diagnostics";\n  if (networkState === "waiting for peer") return "Waiting for peer · use the same Run key";'''
new_status = '''function productStatusText() {\n  if (runtimeFailed) return "Runtime problem · open Diagnostics";\n  if (roomRecovery.pending && document.visibilityState !== "visible") return "Yard paused · return to rejoin";\n  if (roomRecovery.pending) return "Rejoining the same Yard…";\n  if (networkState === "waiting for peer") return "Waiting for peer · use the same Run key";'''
text = replace_once(text, old_status, new_status, "product recovery status")

old_reset = '''function resetProtocolState() {\n  destroyLocalState();'''
new_reset = '''function resetProtocolState({ preserveRoomRecovery = false } = {}) {\n  destroyLocalState();'''
text = replace_once(text, old_reset, new_reset, "reset options")

old_reset_tail = '''  runtimeFailureAt = null;\n  sessionEnd = null;\n  visibilityTransitionAt = performance.now();\n  Object.assign(metrics, {'''
new_reset_tail = '''  runtimeFailureAt = null;\n  sessionEnd = null;\n  visibilityTransitionAt = performance.now();\n  if (!preserveRoomRecovery) {\n    clearRoomRecoveryTimer();\n    roomRecovery = {\n      pending: false,\n      reason: null,\n      attempts: 0,\n      timer: null,\n      sourceEpoch: null,\n      lastRecoveredEpoch: roomRecovery.lastRecoveredEpoch,\n    };\n  }\n  Object.assign(metrics, {'''
text = replace_once(text, old_reset_tail, new_reset_tail, "reset recovery preservation")

build = replace_once(
    build,
    'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v9-jump";',
    'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v10-room-recovery";',
    "UI revision",
)

APP.write_text(text)
BUILD.write_text(build)
print("WORLD_V0_PUBLIC_ROOM_R0B_PATCH_APPLIED")
