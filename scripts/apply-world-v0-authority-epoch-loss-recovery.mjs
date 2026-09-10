import { readFileSync, writeFileSync } from "node:fs";

const helperPath = "public/world-v0/authority-epoch-loss.js";
writeFileSync(helperPath, `export const WORLD_V0_AUTHORITY_EPOCH_LOSS_REVISION = "world-v0-authority-epoch-loss-v1";

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
`);

const appPath = "public/world-v0/app.js";
let app = readFileSync(appPath, "utf8");
function replaceExact(oldText, newText, label) {
  const first = app.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text missing`);
  if (app.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: old text not unique`);
  app = app.slice(0, first) + newText + app.slice(first + oldText.length);
}

replaceExact(
`import {
  WORLD_V0_JOIN_FAILURE_CLARITY_REVISION,
  classifyWorldV0JoinFailure,
} from "./join-failure-clarity.js";`,
`import {
  WORLD_V0_JOIN_FAILURE_CLARITY_REVISION,
  classifyWorldV0JoinFailure,
} from "./join-failure-clarity.js";
import {
  WORLD_V0_AUTHORITY_EPOCH_LOSS_REVISION,
  classifyWorldV0AuthorityEpoch,
} from "./authority-epoch-loss.js";`,
"authority epoch loss import"
);

replaceExact(
`const ACTOR_RESUME_REVISION = "world-v0-browser-actor-resume-v1";
const AUTHORITY_REBASE_SEED_REVISION = "world-v0-authority-rebase-seed-v1";`,
`const ACTOR_RESUME_REVISION = "world-v0-browser-actor-resume-v1";
const AUTHORITY_REBASE_SEED_REVISION = "world-v0-authority-rebase-seed-v1";
const AUTHORITY_EPOCH_VERDICT_TIMEOUT_MS = 1500;
const WORLD_V0_CANONICAL_PUBLIC_YARDS = new Set(["yard-1", "yard-2", "yard-3"]);`,
"authority epoch loss constants"
);

replaceExact(
`function clearActorResumeTimer() {
  if (actorResume.timer) clearTimeout(actorResume.timer);
  actorResume.timer = null;
}

function actorResumeSnapshot() {`,
`function clearActorResumeTimer() {
  if (actorResume.timer) clearTimeout(actorResume.timer);
  actorResume.timer = null;
}

async function authorityEpochVerdict(sourceEpoch) {
  if (!WORLD_V0_CANONICAL_PUBLIC_YARDS.has(runKey)) {
    return { kind: "unknown", reason: "non-public-run", observedEpoch: null };
  }
  let directoryReachable = false;
  let room = null;
  try {
    const response = await fetch("/api/world-v0/rooms", {
      cache: "no-store",
      signal: AbortSignal.timeout(AUTHORITY_EPOCH_VERDICT_TIMEOUT_MS),
    });
    if (response.ok) {
      directoryReachable = true;
      const payload = await response.json();
      room = Array.isArray(payload?.rooms)
        ? payload.rooms.find((candidate) => candidate?.id === runKey) || null
        : null;
    }
  } catch {
    directoryReachable = false;
  }
  return classifyWorldV0AuthorityEpoch({ sourceEpoch, directoryReachable, room });
}

function transitionLostAuthorityEpochToRoomRecovery(sourceEpoch, verdict) {
  const failedResumeAttempts = actorResume.attempts;
  const sourceBoundary = actorResume.sourceBoundary;
  clearActorResumeTimer();
  actorResume.pending = false;
  actorResume.attempts = 0;
  actorResume.sourceBoundary = null;
  clearCurrentStoredActorSession(sourceEpoch);
  clearRoomRecoveryTimer();
  roomRecovery.pending = true;
  roomRecovery.reason = "authority_epoch_lost_recovery";
  roomRecovery.attempts = 0;
  roomRecovery.sourceEpoch = sourceEpoch;
  networkState = "authority epoch lost · room recovery pending";
  recordLifecycle("authority-epoch-lost-confirmed", {
    sourceEpoch,
    observedEpoch: verdict.observedEpoch,
    verdictReason: verdict.reason,
    failedResumeAttempts,
    sourceBoundary,
    revision: WORLD_V0_AUTHORITY_EPOCH_LOSS_REVISION,
  });
  showNotice("Shared Yard authority restarted · rejoining a fresh round…");
  persistLastSessionEvidence("authority-epoch-lost-confirmed");
  updateProductStatus();
  scheduleRoomRecovery(roomRecovery.reason);
}

async function resolveFailedActorResume(connection, sourceEpoch) {
  const verdict = await authorityEpochVerdict(sourceEpoch);
  if (socket !== connection || !actorResume.pending || identity?.worldEpoch !== sourceEpoch) return;
  recordLifecycle("authority-epoch-verdict", {
    sourceEpoch,
    kind: verdict.kind,
    reason: verdict.reason,
    observedEpoch: verdict.observedEpoch,
    attempt: actorResume.attempts,
    revision: WORLD_V0_AUTHORITY_EPOCH_LOSS_REVISION,
  });
  if (verdict.kind === "epoch-gone") {
    transitionLostAuthorityEpochToRoomRecovery(sourceEpoch, verdict);
    return;
  }
  scheduleActorResume();
}

function actorResumeSnapshot() {`,
"authority epoch loss runtime helpers"
);

replaceExact(
`  return value === "peer_left_restart_required"
    || value === "peer_error_restart_required"
    || value.startsWith("input_lease_expired:");`,
`  return value === "peer_left_restart_required"
    || value === "peer_error_restart_required"
    || value === "authority_epoch_lost_recovery"
    || value.startsWith("input_lease_expired:");`,
"authority epoch loss room recovery reason"
);

replaceExact(
`    if (actorResume.pending || actorTransportRecoverable) {
      actorResume.pending = true;
      if (!Number.isInteger(actorResume.sourceBoundary)) actorResume.sourceBoundary = localState?.boundaryTick ?? null;
      neutralizeTransientInputs();
      networkState = "connection lost · actor resume pending";
      recordLifecycle("actor-resume-pending", { code: event.code, reason: event.reason || null, sourceBoundary: actorResume.sourceBoundary });
      scheduleActorResume();
      return;
    }`,
`    if (actorResume.pending || actorTransportRecoverable) {
      const alreadyResuming = actorResume.pending;
      actorResume.pending = true;
      if (!Number.isInteger(actorResume.sourceBoundary)) actorResume.sourceBoundary = localState?.boundaryTick ?? null;
      neutralizeTransientInputs();
      networkState = "connection lost · actor resume pending";
      recordLifecycle("actor-resume-pending", { code: event.code, reason: event.reason || null, sourceBoundary: actorResume.sourceBoundary });
      const sourceEpoch = identity?.worldEpoch || null;
      // The first abnormal close always gets one exact private-token resume attempt.
      // Only a subsequent failed resume may consult public authority evidence. Uncertain
      // or same-epoch evidence remains fail-closed and continues exact resume.
      if (alreadyResuming && actorResume.attempts > 0 && event.code === 1006 && sourceEpoch) {
        void resolveFailedActorResume(connection, sourceEpoch);
      } else {
        scheduleActorResume();
      }
      return;
    }`,
"authority epoch loss failed resume verdict hook"
);

writeFileSync(appPath, app);
console.log("WORLD_V0_AUTHORITY_EPOCH_LOSS_CANDIDATE_APPLIED");
