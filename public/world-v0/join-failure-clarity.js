export const WORLD_V0_JOIN_FAILURE_CLARITY_REVISION = "world-v0-join-failure-clarity-v1";

export function classifyWorldV0JoinFailure({ directoryReachable, room }) {
  if (!directoryReachable) {
    return {
      kind: "service-unreachable",
      message: "Couldn’t reach the Yard service to confirm room state. Check the connection and retry.",
    };
  }
  if (!room) {
    return {
      kind: "room-unknown",
      message: "Couldn’t confirm this Yard after the join failed. Return to the room list and try again.",
    };
  }

  const connected = Number.isFinite(Number(room.connected)) ? Number(room.connected) : 0;
  const reserved = Number.isFinite(Number(room.reserved)) ? Number(room.reserved) : 0;
  const capacity = Number.isFinite(Number(room.capacity)) ? Number(room.capacity) : 2;
  const state = String(room.state || "unknown");

  if (state === "unavailable" || room.failure) {
    return {
      kind: "yard-unavailable",
      message: "This Yard is temporarily unavailable. Try another Yard or retry shortly.",
    };
  }
  if (room.joinable === false) {
    if (connected >= capacity) {
      return {
        kind: "capacity-full",
        message: "This Yard is full right now. Choose another Yard.",
      };
    }
    if (reserved > 0) {
      return {
        kind: "lifecycle-protected",
        message: "This Yard isn’t accepting a fresh player right now; a place is still protected for reconnect. Return to the room list or use Resume if it is your session.",
      };
    }
    return {
      kind: "lifecycle-busy",
      message: "This Yard isn’t accepting a fresh player right now. Return to the room list and choose an available Yard.",
    };
  }
  if (room.joinable === true) {
    return {
      kind: "connection-handshake",
      message: "This Yard still has an open place, but the game connection didn’t open. Retry; this looks like a temporary connection or handshake problem.",
    };
  }
  return {
    kind: "room-unknown",
    message: "Couldn’t determine why this Yard rejected the join. Return to the room list and try again.",
  };
}
