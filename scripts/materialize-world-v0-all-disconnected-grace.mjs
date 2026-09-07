import { readFileSync, writeFileSync } from "node:fs";

function replaceExactlyOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source fragment occurs more than once`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const contractPath = "src/world-v0-contract.ts";
let contract = readFileSync(contractPath, "utf8");
contract = replaceExactlyOnce(
  contract,
  `export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v8-playability-split-lead";`,
  `export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v9-all-disconnected-grace";`,
  "contract revision",
);
contract = replaceExactlyOnce(
  contract,
  `export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v5-i4-exact-full-state-rebase";`,
  `export const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v6-all-disconnected-grace";`,
  "server revision",
);
contract = replaceExactlyOnce(
  contract,
  `export const WORLD_V0_CLIENT_HISTORY = {\n  segmentTicks: 8,\n  retainTicks: 24,\n  recordingCapacityBytes: 2 * 1024 * 1024,\n} as const;`,
  `export const WORLD_V0_CLIENT_HISTORY = {\n  segmentTicks: 8,\n  retainTicks: 24,\n  recordingCapacityBytes: 2 * 1024 * 1024,\n} as const;\n\n// Actor input still fails neutral after the 36-tick lease. The WorldEpoch itself\n// gets a separate bounded grace when every transport is gone so the browser's\n// existing actor-resume backoff has a meaningful recovery window.\nexport const WORLD_V0_LIFECYCLE = {\n  allDisconnectedGraceTicks: 15 * 60,\n} as const;`,
  "lifecycle contract",
);
contract = replaceExactlyOnce(
  contract,
  `  clientHistory: WORLD_V0_CLIENT_HISTORY,\n  movement: WORLD_V0_MOVEMENT,`,
  `  clientHistory: WORLD_V0_CLIENT_HISTORY,\n  lifecycle: WORLD_V0_LIFECYCLE,\n  movement: WORLD_V0_MOVEMENT,`,
  "SimBuild lifecycle binding",
);
contract = replaceExactlyOnce(
  contract,
  `    clientHistory: { ...WORLD_V0_CLIENT_HISTORY },\n    movement: { ...WORLD_V0_MOVEMENT },`,
  `    clientHistory: { ...WORLD_V0_CLIENT_HISTORY },\n    lifecycle: { ...WORLD_V0_LIFECYCLE },\n    movement: { ...WORLD_V0_MOVEMENT },`,
  "wire lifecycle contract",
);
writeFileSync(contractPath, contract);

const serverPath = "src/world-v0-shared-yard.ts";
let server = readFileSync(serverPath, "utf8");
server = replaceExactlyOnce(
  server,
  `  WORLD_V0_CLIENT_SIM_REVISION,\n  WORLD_V0_MOVEMENT,`,
  `  WORLD_V0_CLIENT_SIM_REVISION,\n  WORLD_V0_LIFECYCLE,\n  WORLD_V0_MOVEMENT,`,
  "server lifecycle import",
);
server = replaceExactlyOnce(
  server,
  `  private failure: string | null = null;\n  private resetting = false;`,
  `  private failure: string | null = null;\n  private resetting = false;\n  private allDisconnectedSinceTick: number | null = null;`,
  "all-disconnected state",
);
server = replaceExactlyOnce(
  server,
  `    // Lease expiry is actor-local containment, not WorldEpoch death. Once no\n    // transport survives, however, allow the run to die after every session has\n    // crossed the same bounded lease rather than creating an always-on zombie DO.\n    if (active && this.players.size > 0 && this.connectedPlayerCount() === 0 &&\n        [...this.players.values()].every((player) =>\n          player.input.stats().currentMissingStreak >= WORLD_V0_TIMING.inputLeaseMissingTicks\n        )) {\n      this.endEpoch("all_players_disconnected_lease_expired");\n      return;\n    }`,
  `    // Lease expiry remains actor-local containment. WorldEpoch lifetime is a\n    // separate concern: when every transport disappears, keep the neutralized\n    // world alive for a bounded grace long enough for the client's existing\n    // ActorSession resume backoff to operate. This is not persistence; an\n    // unclaimed world still retires automatically after the grace.\n    if (active && this.players.size > 0) {\n      if (this.connectedPlayerCount() === 0) {\n        if (this.allDisconnectedSinceTick === null) this.allDisconnectedSinceTick = this.tick;\n        const disconnectedTicks = this.tick - this.allDisconnectedSinceTick;\n        const allLeasesExpired = [...this.players.values()].every((player) =>\n          player.input.stats().currentMissingStreak >= WORLD_V0_TIMING.inputLeaseMissingTicks\n        );\n        if (allLeasesExpired && disconnectedTicks >= WORLD_V0_LIFECYCLE.allDisconnectedGraceTicks) {\n          this.endEpoch("all_players_disconnected_grace_expired");\n          return;\n        }\n      } else {\n        this.allDisconnectedSinceTick = null;\n      }\n    }`,
  "bounded all-disconnected grace",
);
server = replaceExactlyOnce(
  server,
  `      this.protocolStartTick = null;\n      this.tick = 0;`,
  `      this.protocolStartTick = null;\n      this.tick = 0;\n      this.allDisconnectedSinceTick = null;`,
  "epoch reset clears grace",
);
writeFileSync(serverPath, server);

const i1Path = "scripts/world-v0-integration-i1-lifecycle-probe.mjs";
let i1 = readFileSync(i1Path, "utf8");
i1 = replaceExactlyOnce(
  i1,
  `feedA.stop();\nfeedB3.stop();\ntry { a.ws.close(1000, "i1_drop_all_a"); } catch {}\ntry { b3.ws.close(1000, "i1_drop_all_b"); } catch {}\nawait sleep(1_800);\n\nconst c = makeClient("owner-c");\nconst cw = await welcome(c);\nif (cw.resumed) throw new Error("fresh C unexpectedly resumed dead session");\nif (cw.worldEpoch === oldEpoch) throw new Error("all-disconnected cleanup failed to retire old WorldEpoch");\nif (cw.selfSessionId === aw.selfSessionId || cw.selfSessionId === bw.selfSessionId) throw new Error("fresh epoch reused old ActorSession identity");`,
  `feedA.stop();\nfeedB3.stop();\ntry { a.ws.close(1000, "i1_drop_all_a"); } catch {}\ntry { b3.ws.close(1000, "i1_drop_all_b"); } catch {}\nawait sleep(1_800);\n\n// Old I1 cleanup retired the epoch by ~0.75 s. The closure contract now keeps\n// a fully disconnected but neutralized epoch boundedly alive so the already-\n// implemented browser ActorSession retry envelope can actually operate.\nconst aAfterAllDrop = makeClient("owner-a", aw.resumeToken);\nconst aAfterAllDropWelcome = await welcome(aAfterAllDrop);\nif (!aAfterAllDropWelcome.resumed) throw new Error("A did not resume after bounded all-transport loss");\nif (aAfterAllDropWelcome.worldEpoch !== oldEpoch) throw new Error("bounded all-transport loss rotated WorldEpoch before grace");\nif (aAfterAllDropWelcome.selfSessionId !== aw.selfSessionId) throw new Error("A ActorSession identity changed after all-transport loss");\ntry { aAfterAllDrop.ws.close(1000, "i1_all_drop_grace_cleanup"); } catch {}\n\nawait sleep(16_000);\nconst c = makeClient("owner-c");\nconst cw = await welcome(c);\nif (cw.resumed) throw new Error("fresh C unexpectedly resumed dead session");\nif (cw.worldEpoch === oldEpoch) throw new Error("all-disconnected bounded grace failed to retire old WorldEpoch");\nif (cw.selfSessionId === aw.selfSessionId || cw.selfSessionId === bw.selfSessionId) throw new Error("fresh epoch reused old ActorSession identity");`,
  "I1 all-disconnected semantics",
);
i1 = replaceExactlyOnce(
  i1,
  `  revision: "world-v0-integration-i1-lifecycle-probe-v3-explicit-lease-boundary",`,
  `  revision: "world-v0-integration-i1-lifecycle-probe-v4-all-disconnected-grace",`,
  "I1 probe revision",
);
i1 = replaceExactlyOnce(
  i1,
  `  boundedCleanup: {\n    oldEpochRetiredAfterAllConnectionsLost: true,\n    freshEpochCreatedAfterCleanup: true,\n  },`,
  `  boundedCleanup: {\n    oldEpochPreservedAt1800msAllDisconnected: true,\n    actorSessionResumedInsideGrace: true,\n    oldEpochRetiredAfterGrace: true,\n    freshEpochCreatedAfterCleanup: true,\n  },`,
  "I1 result semantics",
);
writeFileSync(i1Path, i1);

const c = await import(`../src/world-v0-contract.ts?closure=${Date.now()}`);
if (c.WORLD_V0_LIFECYCLE.allDisconnectedGraceTicks !== 900) throw new Error("unexpected all-disconnected grace");

const buildPath = "public/world-v0/build-contract.js";
let build = readFileSync(buildPath, "utf8");
build = replaceExactlyOnce(
  build,
  `export const WORLD_V0_EXPECTED_SERVER_REVISION = "shared-yard-v0-authority-v5-i4-exact-full-state-rebase";`,
  `export const WORLD_V0_EXPECTED_SERVER_REVISION = "${c.WORLD_V0_SERVER_REVISION}";`,
  "browser server revision",
);
build = replaceExactlyOnce(
  build,
  `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "shared-yard-v0-sim-85ac7ad492b61610";`,
  `export const WORLD_V0_EXPECTED_SIM_BUILD_ID = "${c.WORLD_V0_SIM_BUILD_ID}";`,
  "browser SimBuild",
);
writeFileSync(buildPath, build);

console.log("WORLD_V0_ALL_DISCONNECTED_GRACE_MATERIALIZED", JSON.stringify({
  contractRevision: c.WORLD_V0_CONTRACT_REVISION,
  serverRevision: c.WORLD_V0_SERVER_REVISION,
  simBuildId: c.WORLD_V0_SIM_BUILD_ID,
  graceTicks: c.WORLD_V0_LIFECYCLE.allDisconnectedGraceTicks,
}));
