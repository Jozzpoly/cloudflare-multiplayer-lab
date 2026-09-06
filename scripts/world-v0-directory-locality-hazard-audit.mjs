import { readFileSync } from "node:fs";
import { friendEntryMode } from "../public/world-v0/friend-entry.js";

const entry = readFileSync("src/world-slice-entry.ts", "utf8");
const friendReady = readFileSync("public/world-v0/friend-ready.js", "utf8");
const sharedYard = readFileSync("src/world-v0-shared-yard.ts", "utf8");
const remoteWorkflow = readFileSync(".github/workflows/world-v0-staging-r0-remote.yml", "utf8");

const representativeInviteRun = "yard-AbCdEfGhIjKlMn";

const fixedDirectoryFacts = {
  directoryUsesSharedYardStub: /sharedYardV0PublicRoomDirectoryResponse[\s\S]*sharedYardV0Stub\(env, `shared-yard-v0-\$\{room\.id\}`\)/.test(entry),
  stubUsesNamespaceGet: /function sharedYardV0Stub[\s\S]*SHARED_YARD_V0\.get\(env\.SHARED_YARD_V0\.idFromName\(name\)\)/.test(entry),
  directoryFetchesDurableObject: /sharedYardV0PublicRoomDirectoryResponse[\s\S]*stub\.fetch\(new Request\(`https:\/\/world-v0\.internal\/status/.test(entry),
  remoteQualificationFetchesDirectory: /fetch\(`\$\{base\}\/api\/world-v0\/rooms\?r0=\$\{cacheBust\}`/.test(remoteWorkflow),
};

const inviteIsolationFacts = {
  representativeRunClassifiesAsInvite: friendEntryMode(representativeInviteRun) === "invite",
  directoryRefreshGuardedToHostMode: /async function refreshPublicRooms\(\)[\s\S]*if \(entryMode !== "host" \|\| boot\.classList\.contains\("compact"\)\) return;/.test(friendReady),
  directoryPollingStartsOnlyInHostMode: /if \(entryMode === "host"\)[\s\S]*await refreshPublicRooms\(\);[\s\S]*setInterval\(refreshPublicRooms, 1200\)/.test(friendReady),
  inviteModeHidesPublicRoomEntry: /else \{\s*publicRoomEntry\.classList\.add\("hidden"\);\s*\}/.test(friendReady),
  gameplayWebSocketSelectsRunSpecificAuthority: /sharedYardV0WebSocketResponse[\s\S]*sharedYardV0Stub\(env, sharedYardV0Instance\(request\)\)[\s\S]*world\.fetch\(request\)/.test(entry),
};

const authorityGateFacts = {
  rejectsAlreadyActiveRun: /if \(this\.protocolStartTick !== null \|\| this\.loopTimer\) return json\(\{ ok: false, error: "world_v0_run_already_active" \}, 409\);/.test(sharedYard),
  rejectsOverCapacityRun: /if \(this\.players\.size >= MAX_PLAYERS\) return json\(\{ ok: false, error: "world_v0_full" \}, 503\);/.test(sharedYard),
};

const fixedDirectoryHazardConfirmed = Object.values(fixedDirectoryFacts).every(Boolean);
const inviteCodePathIsolated = Object.values(inviteIsolationFacts).every(Boolean);
const joinAuthorityIndependentOfDirectory = Object.values(authorityGateFacts).every(Boolean);
const causalScopeDiscriminated = fixedDirectoryHazardConfirmed && inviteCodePathIsolated && joinAuthorityIndependentOfDirectory;

const result = {
  revision: "world-v0-directory-locality-hazard-audit-v2",
  fixedDirectoryFacts,
  inviteIsolationFacts,
  authorityGateFacts,
  fixedDirectoryHazardConfirmed,
  inviteCodePathIsolated,
  joinAuthorityIndependentOfDirectory,
  causalScopeDiscriminated,
  earned: causalScopeDiscriminated ? [
    "The fixed public-room directory can still be the first caller that selects/materializes canonical gameplay room authorities.",
    "A valid unique ?run=... invite/deep-link browser path is source-isolated from public-room directory polling before its gameplay WebSocket join.",
    "Gameplay authority itself enforces active-room and capacity admission; directory occupancy is discovery/UX rather than the correctness gate.",
  ] : [],
  remainsOpen: [
    "Fixed yard-1/yard-2/yard-3 public-room discovery is NOT locality-qualified: metadata/status traffic can still choose their initial placement.",
    "The staging R0 remote qualification explicitly fetches the fixed-room directory, so those staging room IDs are not valid placement specimens for representative-player locality.",
    "No physical Cloudflare placement or RTT improvement is claimed by this source-path discriminator.",
    "An external caller that somehow targets the same unique run before the player could still pre-materialize it; uniqueness makes that a separate threat/coordination question, not a property proved here.",
  ],
  integrationBoundary: "Do not make fixed public-room discovery a prerequisite for locality-sensitive core multiplayer integration. Unique invite/deep-link runs can remain the bounded core shared-play lane while fixed-room metadata isolation stays an explicit feature debt. Do not build a directory control plane solely to close this audit.",
  verdict: causalScopeDiscriminated
    ? "WORLD_V0_LOCALITY_SCOPE_DISCRIMINATION_PASS"
    : "WORLD_V0_LOCALITY_SCOPE_DISCRIMINATION_INCOMPLETE",
  nonClaim: "This is a current-source causal path proof. It does not measure actual Durable Object location, qualify public fixed-room placement, alter Cloudflare placement policy, or make invite/deep-link browser UX an Owner-qualified product path.",
};

console.log("WORLD_V0_DIRECTORY_LOCALITY_AUDIT", JSON.stringify(result, null, 2));
if (!causalScopeDiscriminated) throw new Error(`locality scope discriminator drift: ${JSON.stringify(result)}`);
console.log(result.verdict);
