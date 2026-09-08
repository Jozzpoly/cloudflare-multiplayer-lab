export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r0c-v1";
export const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r0";
export const WORLD_V0_PUBLIC_ROOM_IDS = Object.freeze(["yard-1", "yard-2", "yard-3"]);

export function normalizeWorldV0PublicRoomDirectory(payload) {
  if (!payload || payload.revision !== WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION || !Array.isArray(payload.rooms)) {
    throw new Error("public room directory contract mismatch");
  }
  const byId = new Map(payload.rooms.map((room) => [room?.id, room]));
  return WORLD_V0_PUBLIC_ROOM_IDS.map((id) => {
    const room = byId.get(id);
    if (!room || typeof room.name !== "string") throw new Error(`public room missing: ${id}`);
    const capacity = Number(room.capacity);
    const occupancy = room.occupancy === null ? null : Number(room.occupancy);
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error(`public room capacity invalid: ${id}`);
    if (occupancy !== null && (!Number.isInteger(occupancy) || occupancy < 0 || occupancy > capacity)) {
      throw new Error(`public room occupancy invalid: ${id}`);
    }
    return {
      id,
      name: room.name,
      occupancy,
      capacity,
      state: String(room.state || "unavailable"),
      joinable: room.joinable === true,
      joinPath: String(room.joinPath || `/world-v0/?run=${encodeURIComponent(id)}`),
      worldEpoch: room.worldEpoch ?? null,
      failure: room.failure ?? null,
    };
  });
}

export function worldV0PublicRoomPresentation(room) {
  if (!room || room.occupancy === null || room.state === "unavailable") {
    return { status: "Unavailable", action: "Unavailable", joinable: false, tone: "unavailable" };
  }
  const occupancy = `${room.occupancy}/${room.capacity}`;
  if (!room.joinable) {
    return {
      status: `${occupancy} · ${room.state === "live" ? "Live" : "Full"}`,
      action: room.state === "live" ? "In session" : "Full",
      joinable: false,
      tone: "full",
    };
  }
  if (room.occupancy === 0) {
    return { status: `${occupancy} · Empty`, action: "Enter", joinable: true, tone: "empty" };
  }
  return { status: `${occupancy} · Waiting`, action: "Join", joinable: true, tone: "waiting" };
}
