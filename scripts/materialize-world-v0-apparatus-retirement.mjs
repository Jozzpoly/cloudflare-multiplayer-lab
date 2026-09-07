import { readFileSync, writeFileSync } from "node:fs";

function insertAfterExactlyOnce(text, anchor, addition, label) {
  const first = text.indexOf(anchor);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (text.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`${label}: anchor occurs more than once`);
  const offset = first + anchor.length;
  return text.slice(0, offset) + addition + text.slice(offset);
}

const replayEnv = "MW_ALLOW_HISTORICAL_WORLD_V0_APPARATUS";

const sessionPath = "scripts/world-v0-session-friction-smoke.mjs";
let session = readFileSync(sessionPath, "utf8");
session = insertAfterExactlyOnce(
  session,
  `import { WORLD_V0_BROWSER_UI_REVISION } from "../public/world-v0/build-contract.js";\n`,
  `\n// WORLD_V0_HISTORICAL_APPARATUS_ONLY_PRE_I1\n// This smoke intentionally encodes the pre-I1 contract: one peer leaving ends the\n// global WorldEpoch and exposes Restart. Current I1 semantics intentionally reject\n// that contract; use world-v0-integration-i1-lifecycle-probe.mjs and the current\n// human-entry browser smoke for current lifecycle evidence.\nif (process.env.${replayEnv} !== "1") {\n  throw new Error("HISTORICAL APPARATUS ONLY: world-v0-session-friction-smoke encodes pre-I1 peer-loss => global epoch-end semantics; current I1 keeps the healthy world alive. Set ${replayEnv}=1 only for intentional historical replay.");\n}\n`,
  "session-friction retirement",
);
writeFileSync(sessionPath, session);

const authorityPath = "scripts/world-v0-authority-runtime-smoke.mjs";
let authority = readFileSync(authorityPath, "utf8");
authority = insertAfterExactlyOnce(
  authority,
  `import { deriveWorldV0AuthorityProbe } from "./world-v0-authority-stimulus.mjs";\n`,
  `\n// WORLD_V0_HISTORICAL_APPARATUS_ONLY_PRE_I1\n// This smoke intentionally expects input-lease expiry to terminate the global\n// WorldEpoch. I1 changed that failure boundary to actor-local neutralization /\n// transport detachment, so this is provenance apparatus rather than a current gate.\nif (process.env.${replayEnv} !== "1") {\n  throw new Error("HISTORICAL APPARATUS ONLY: world-v0-authority-runtime-smoke encodes pre-I1 lease-expiry => global epoch-end semantics; current I1 makes lease expiry actor-local. Set ${replayEnv}=1 only for intentional historical replay.");\n}\n`,
  "authority-runtime retirement",
);
writeFileSync(authorityPath, authority);

console.log("WORLD_V0_STALE_APPARATUS_RETIRED", JSON.stringify({ sessionPath, authorityPath, replayEnv }));
