export const WORLD_V0_AUTHORITY_EPOCH_LOSS_REVISION = "world-v0-authority-epoch-loss-v1";

export function classifyWorldV0AuthorityEpoch({ sourceEpoch, directoryReachable, room }) {
  const source = typeof sourceEpoch === "string" ? sourceEpoch : "";
  if (!source) return { kind: "unknown", reason: "missing-source-epoch", observedEpoch: null };
  if (!directoryReachable) return { kind: "unknown", reason: "directory-unreachable", observedEpoch: null };
  if (!room || typeof room !== "object") return { kind: "unknown", reason: "room-missing", observedEpoch: null };
  if (room.state === "unavailable" || room.failure) {
    return { kind: "unknown", reason: "room-unavailable", observedEpoch: null };
  }
  const observedEpoch = typeof room.worldEpoch === "string" && room.worldEpoch.length > 0
    ? room.worldEpoch
    : null;
  if (observedEpoch === source) return { kind: "same-epoch", reason: "authority-still-reports-source", observedEpoch };
  return { kind: "epoch-gone", reason: observedEpoch ? "authority-reports-replacement" : "authority-reports-no-epoch", observedEpoch };
}
