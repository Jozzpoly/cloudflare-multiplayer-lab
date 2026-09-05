import {
  WORLD_V0_FRIEND_ENTRY_REVISION,
  friendEntryCopy,
  friendEntryMode,
  generateWorldV0RoomKey,
  shouldReplaceLegacyStoredRoom,
  validWorldV0RoomKey,
} from "./friend-entry.js";
import {
  WORLD_V0_ROOM_CONTINUITY_REVISION,
  planWorldV0RoomContinuity,
  roomContinuityRequested,
} from "./room-continuity.js";

const bootstrapUrl = new URL(location.href);
const rawInviteRun = bootstrapUrl.searchParams.get("run");
const entryMode = friendEntryMode(rawInviteRun);
const continuityRequested = roomContinuityRequested(bootstrapUrl);
const storedRoom = localStorage.getItem("shared-yard-v0-run") || "";

// The qualified v7 app still contains its historical Math.random fallback.
// Friend-Ready prevents that fallback from becoming room identity by seeding a
// Web-Crypto key before importing the unchanged qualified runtime. Explicit
// invite URLs always win and remain backward-compatible.
if (entryMode === "host" && shouldReplaceLegacyStoredRoom(storedRoom)) {
  localStorage.setItem("shared-yard-v0-run", generateWorldV0RoomKey());
}

await import("./solo-inspection.js");

const boot = document.querySelector("#boot");
const bootTitle = boot?.querySelector("h1");
const bootStatus = document.querySelector("#boot-status");
const callsignInput = document.querySelector("#callsign");
const runInput = document.querySelector("#run");
const enterButton = document.querySelector("#enter");
const entryAdvanced = document.querySelector("#entry-advanced");
const copyInviteButton = document.querySelector("#copy-invite");
const restartRoundButton = document.querySelector("#restart-round");
const inspectButton = document.querySelector("#inspect-solo");

if (!boot || !bootTitle || !bootStatus || !callsignInput || !runInput || !enterButton || !entryAdvanced || !copyInviteButton || !restartRoundButton || !inspectButton) {
  throw new Error("Friend-Ready V1 entry shell incomplete");
}

if (entryMode === "invite" && rawInviteRun) runInput.value = rawInviteRun.trim();

const entryCopy = friendEntryCopy(entryMode);
bootTitle.textContent = entryCopy.title;
bootStatus.textContent = entryCopy.status;
enterButton.textContent = entryCopy.enterLabel;
copyInviteButton.textContent = "Invite friend";

if (entryMode === "invalid-invite") {
  enterButton.disabled = true;
  entryAdvanced.open = true;
}

function friendlyStatus(text) {
  const value = String(text || "");
  if (value.includes("same Run key")) return "Waiting for friend · send Invite friend";
  if (value.startsWith("Ready · share the same Run key")) return entryCopy.status;
  if (value === "waiting for peer") return "Waiting for friend";
  return value;
}

copyInviteButton.addEventListener("click", () => {
  setTimeout(() => {
    if (copyInviteButton.textContent === "Copy invite") copyInviteButton.textContent = "Invite friend";
  }, 1300);
});

const baseEvidence = window.__sharedYardV0Evidence;
const baseSession = window.__sharedYardV0Session;
const inspectionSnapshot = window.__sharedYardV0Inspection;
if (typeof baseEvidence !== "function" || typeof baseSession !== "function") {
  throw new Error("Friend-Ready V1 requires initialized Shared Yard evidence/session helpers");
}

const attemptedEpochs = [];
const continuity = {
  revision: WORLD_V0_ROOM_CONTINUITY_REVISION,
  requested: continuityRequested,
  entryMode,
  state: continuityRequested ? "armed" : "disabled",
  attempts: 0,
  pendingEpoch: null,
  fromEpoch: null,
  toEpoch: null,
  triggeredAt: null,
  settledAt: null,
  lastPlan: null,
  triggerPlan: null,
};

function currentInspectionMode() {
  if (typeof inspectionSnapshot !== "function") return "multiplayer";
  try {
    return inspectionSnapshot()?.mode || "multiplayer";
  } catch {
    return "unknown";
  }
}

function alreadyAttempted(worldEpoch) {
  return typeof worldEpoch === "string" && attemptedEpochs.includes(worldEpoch);
}

function rememberAttempt(worldEpoch) {
  attemptedEpochs.push(worldEpoch);
  if (attemptedEpochs.length > 12) attemptedEpochs.splice(0, attemptedEpochs.length - 12);
}

function continuityPlan(evidence, session) {
  return planWorldV0RoomContinuity({
    requested: continuityRequested,
    entryMode,
    inspectionMode: currentInspectionMode(),
    runtimeFailed: evidence?.runtimeFailed === true,
    endKind: evidence?.session?.end?.kind ?? null,
    endReason: evidence?.session?.end?.reason ?? null,
    restartAvailable: session?.restartAvailable === true,
    networkState: session?.networkState ?? evidence?.networkState ?? "",
    pageVisible: document.visibilityState === "visible",
    online: navigator.onLine !== false,
    worldEpoch: evidence?.identity?.worldEpoch ?? null,
    alreadyAttempted: alreadyAttempted(evidence?.identity?.worldEpoch),
  });
}

function refreshContinuityDerived(evidence) {
  const epoch = evidence?.identity?.worldEpoch ?? null;
  if (continuity.fromEpoch && epoch && epoch !== continuity.fromEpoch) {
    continuity.toEpoch = epoch;
    if (evidence?.networkState === "waiting for peer") {
      continuity.state = "waiting-new-epoch";
      continuity.settledAt ||= new Date().toISOString();
    }
  }
}

function continuitySnapshotValue(evidence = baseEvidence()) {
  refreshContinuityDerived(evidence);
  return {
    revision: continuity.revision,
    requested: continuity.requested,
    entryMode: continuity.entryMode,
    state: continuity.state,
    attempts: continuity.attempts,
    attemptedEpochs: [...attemptedEpochs],
    pendingEpoch: continuity.pendingEpoch,
    fromEpoch: continuity.fromEpoch,
    toEpoch: continuity.toEpoch,
    triggeredAt: continuity.triggeredAt,
    settledAt: continuity.settledAt,
    lastPlan: continuity.lastPlan ? { ...continuity.lastPlan } : null,
    triggerPlan: continuity.triggerPlan ? { ...continuity.triggerPlan } : null,
    authorityCloseSemantic: "generic-websocket-close-not-proven-voluntary-leave",
  };
}

function maybeAutoRearm() {
  if (!continuityRequested || continuity.pendingEpoch) return;
  const evidence = baseEvidence();
  const session = baseSession();
  refreshContinuityDerived(evidence);
  const plan = continuityPlan(evidence, session);
  continuity.lastPlan = plan;
  if (plan.action !== "auto-rearm") return;

  const worldEpoch = evidence?.identity?.worldEpoch;
  continuity.pendingEpoch = worldEpoch;
  continuity.state = "scheduled";

  setTimeout(() => {
    if (continuity.pendingEpoch !== worldEpoch) return;
    const currentEvidence = baseEvidence();
    const currentSession = baseSession();
    const finalPlan = continuityPlan(currentEvidence, currentSession);
    continuity.lastPlan = finalPlan;
    if (finalPlan.action !== "auto-rearm" || currentEvidence?.identity?.worldEpoch !== worldEpoch) {
      continuity.pendingEpoch = null;
      continuity.state = "held";
      return;
    }

    rememberAttempt(worldEpoch);
    continuity.pendingEpoch = null;
    continuity.attempts += 1;
    continuity.fromEpoch = worldEpoch;
    continuity.toEpoch = null;
    continuity.triggeredAt = new Date().toISOString();
    continuity.settledAt = null;
    continuity.triggerPlan = { ...finalPlan };
    continuity.state = "rearming";
    restartRoundButton.click();
  }, 250);
}

const statusObserver = new MutationObserver(() => {
  const next = friendlyStatus(bootStatus.textContent);
  if (next !== bootStatus.textContent) bootStatus.textContent = next;
  maybeAutoRearm();
});
statusObserver.observe(bootStatus, { childList: true, characterData: true, subtree: true });

const restartObserver = new MutationObserver(() => maybeAutoRearm());
restartObserver.observe(restartRoundButton, { attributes: true, attributeFilter: ["class", "disabled"] });

function entrySnapshot() {
  const roomKey = runInput.value.trim();
  return {
    revision: WORLD_V0_FRIEND_ENTRY_REVISION,
    mode: entryMode,
    invited: entryMode === "invite",
    roomKeyValid: validWorldV0RoomKey(roomKey),
    roomKey,
    advancedOpen: Boolean(entryAdvanced.open),
    enterLabel: enterButton.textContent,
    inviteLabel: copyInviteButton.textContent,
    inspectInAdvanced: entryAdvanced.contains(inspectButton),
  };
}

window.__sharedYardV0FriendEntry = entrySnapshot;
window.__sharedYardV0RoomContinuity = () => continuitySnapshotValue();
window.__sharedYardV0Evidence = () => {
  const evidence = baseEvidence();
  return { ...evidence, friendEntry: entrySnapshot(), roomContinuity: continuitySnapshotValue(evidence) };
};
window.__sharedYardV0Session = () => {
  const session = baseSession();
  const evidence = baseEvidence();
  return { ...session, friendEntry: entrySnapshot(), roomContinuity: continuitySnapshotValue(evidence) };
};
