export const WORLD_V0_ROOM_CONTINUITY_REVISION = "shared-yard-v0-room-continuity-probe-v1";
export const WORLD_V0_ROOM_CONTINUITY_QUERY_KEY = "continuity";
export const WORLD_V0_ROOM_CONTINUITY_QUERY_VALUE = "1";
export const WORLD_V0_ROOM_CONTINUITY_ELIGIBLE_END_REASON = "peer_left_restart_required";

export function roomContinuityRequested(urlLike) {
  const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike), "https://multi.world.invalid/");
  return url.searchParams.get(WORLD_V0_ROOM_CONTINUITY_QUERY_KEY) === WORLD_V0_ROOM_CONTINUITY_QUERY_VALUE;
}

export function planWorldV0RoomContinuity({
  requested,
  entryMode,
  inspectionMode,
  runtimeFailed,
  endKind,
  endReason,
  restartAvailable,
  networkState,
  pageVisible,
  online,
  worldEpoch,
  alreadyAttempted,
}) {
  if (!requested) return { action: "hold", reason: "probe-not-requested" };
  if (entryMode !== "host") return { action: "hold", reason: "host-only-probe" };
  if (inspectionMode === "inspection") return { action: "hold", reason: "inspection-excluded" };
  if (runtimeFailed) return { action: "hold", reason: "runtime-failure" };
  if (pageVisible !== true) return { action: "hold", reason: "page-not-visible" };
  if (online === false) return { action: "hold", reason: "browser-offline" };
  if (endKind !== "epoch-ended") return { action: "hold", reason: "not-clean-epoch-end" };
  if (endReason !== WORLD_V0_ROOM_CONTINUITY_ELIGIBLE_END_REASON) {
    return { action: "hold", reason: "end-reason-not-eligible" };
  }
  if (!restartAvailable || !String(networkState || "").startsWith("closed")) {
    return { action: "hold", reason: "restart-not-ready" };
  }
  if (typeof worldEpoch !== "string" || !worldEpoch) return { action: "hold", reason: "world-epoch-missing" };
  if (alreadyAttempted) return { action: "hold", reason: "epoch-already-attempted" };

  return {
    action: "auto-rearm",
    reason: "eligible-connection-close",
    worldEpoch,
    ambiguity: "authority-does-not-distinguish-voluntary-leave-from-generic-websocket-close",
  };
}
