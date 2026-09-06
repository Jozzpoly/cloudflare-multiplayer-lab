import { readFileSync } from "node:fs";

const entry = readFileSync("src/world-slice-entry.ts", "utf8");
const remoteWorkflow = readFileSync(".github/workflows/world-v0-staging-r0-remote.yml", "utf8");

const facts = {
  directoryUsesSharedYardStub: /sharedYardV0PublicRoomDirectoryResponse[\s\S]*sharedYardV0Stub\(env, `shared-yard-v0-\$\{room\.id\}`\)/.test(entry),
  stubUsesNamespaceGet: /function sharedYardV0Stub[\s\S]*SHARED_YARD_V0\.get\(env\.SHARED_YARD_V0\.idFromName\(name\)\)/.test(entry),
  directoryFetchesDurableObject: /sharedYardV0PublicRoomDirectoryResponse[\s\S]*stub\.fetch\(new Request\(`https:\/\/world-v0\.internal\/status/.test(entry),
  remoteQualificationFetchesDirectory: /fetch\(`\$\{base\}\/api\/world-v0\/rooms\?r0=\$\{cacheBust\}`/.test(remoteWorkflow),
};

const confirmed = Object.values(facts).every(Boolean);
const result = {
  revision: "world-v0-directory-locality-hazard-audit-v1",
  facts,
  confirmed,
  interpretation: confirmed
    ? "The public room directory and its remote qualification path call DurableObjectNamespace.get()+stub.fetch() for canonical gameplay room IDs before any player connection is required. Therefore observational/readiness traffic is capable of being the first materializing request for those gameplay Durable Objects."
    : "The expected directory->gameplay-DO materialization path was not found; re-audit manually.",
  nonClaim: "This code-path proof does not establish the physical location of already-created yard-1/2/3 objects. Placement must be measured separately.",
};
console.log("WORLD_V0_DIRECTORY_LOCALITY_HAZARD_AUDIT", JSON.stringify(result, null, 2));
if (!confirmed) throw new Error("expected directory locality hazard path not confirmed");
console.log("WORLD_V0_DIRECTORY_CAN_MATERIALIZE_GAMEPLAY_AUTHORITY_CONFIRMED");
