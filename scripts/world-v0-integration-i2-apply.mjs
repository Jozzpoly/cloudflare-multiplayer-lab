import { readFileSync, writeFileSync } from "node:fs";

const files = {
  contract: "src/world-v0-contract.ts",
  protocol: "src/world-v0-protocol.ts",
  server: "src/world-v0-shared-yard.ts",
  browser: "public/world-v0/app.js",
};

const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]));

const NEW = {
  contract: "shared-yard-v0-contract-v3-supersession",
  server: "shared-yard-v0-authority-v3-supersession",
  client: "shared-yard-v0-browser-sim-v3-supersession",
  protocol: "shared-yard-v0-scheduled-input-v3-supersession",
};

if (
  source.contract.includes(NEW.contract) &&
  source.contract.includes(NEW.server) &&
  source.contract.includes(NEW.client) &&
  source.contract.includes(NEW.protocol) &&
  source.protocol.includes('status = "superseded";') &&
  source.server.includes('record.status === "superseded"') &&
  source.browser.includes("I2 future-intent supersession")
) {
  console.log("WORLD_V0_I2_APPLY already applied");
  process.exit(0);
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`I2 patch marker missing: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`I2 patch marker ambiguous: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let contract = source.contract;
contract = replaceOnce(
  contract,
  `export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v2-jump";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v2-jump";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "shared-yard-v0-browser-sim-v2-jump";`,
  `export const WORLD_V0_CONTRACT_REVISION = "${NEW.contract}";\nexport const WORLD_V0_SERVER_REVISION = "${NEW.server}";\nexport const WORLD_V0_CLIENT_SIM_REVISION = "${NEW.client}";`,
  "contract/server/client generation",
);
contract = replaceOnce(
  contract,
  `export const WORLD_V0_PROTOCOL_REVISION = "shared-yard-v0-scheduled-input-v2-jump";`,
  `export const WORLD_V0_PROTOCOL_REVISION = "${NEW.protocol}";`,
  "protocol generation",
);

let protocol = source.protocol;
protocol = replaceOnce(
  protocol,
  `  | "too_future"\n  | "conflict";`,
  `  | "too_future"\n  | "superseded";`,
  "record status union",
);
protocol = replaceOnce(protocol, `  conflictRecords: number;`, `  supersededRecords: number;`, "stats type");
protocol = replaceOnce(protocol, `  private conflictRecords = 0;`, `  private supersededRecords = 0;`, "stats field");
protocol = replaceOnce(
  protocol,
  `          } else {\n            status = "conflict";\n            this.conflictRecords += 1;\n          }`,
  `          } else {\n            // I2: higher batchSeq is later authority for an unconsumed future tick.\n            // Consumed history remains immutable because late is checked above.\n            this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });\n            status = "superseded";\n            this.supersededRecords += 1;\n          }`,
  "future conflict semantics",
);
protocol = replaceOnce(protocol, `      conflictRecords: this.conflictRecords,`, `      supersededRecords: this.supersededRecords,`, "stats output");

let server = source.server;
server = replaceOnce(
  server,
  `    const accepted = acceptance.records.filter((record) => record.status === "accepted");`,
  `    const accepted = acceptance.records.filter((record) =>\n      record.status === "accepted" || record.status === "superseded"\n    );`,
  "relay superseded records",
);

let browser = source.browser;
browser = replaceOnce(
  browser,
  `    if (["before_start", "too_future", "conflict"].includes(record.status)) metrics.serverRejected += 1;`,
  `    if (["before_start", "too_future"].includes(record.status)) metrics.serverRejected += 1;`,
  "ack rejection classification",
);
browser = replaceOnce(
  browser,
  `    const existing = peerRemote.get(record.targetTick);\n    if (existing && !sameInput(existing, record)) throw new Error(\`conflicting relayed remote record at \${record.targetTick}\`);\n    if (!existing) {\n      peerRemote.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });\n      candidates.push(record.targetTick);\n    }`,
  `    const existing = peerRemote.get(record.targetTick);\n    const next = { x: record.x, z: record.z, jump: Boolean(record.jump) };\n    // I2 future-intent supersession: WebSocket relay order mirrors authority batchSeq order.\n    // A changed, still-correctable tick replaces the earlier prefill and reuses the existing\n    // prediction correction path; identical relay data stays idempotent.\n    if (!existing || !sameInput(existing, next)) {\n      peerRemote.set(record.targetTick, next);\n      candidates.push(record.targetTick);\n    }`,
  "browser peer future timeline",
);

if (!contract.includes(NEW.protocol) ||
    !protocol.includes('status = "superseded";') ||
    protocol.includes('status = "conflict";') ||
    !server.includes('record.status === "superseded"') ||
    !browser.includes("I2 future-intent supersession") ||
    browser.includes("conflicting relayed remote record")) {
  throw new Error("I2 patch postcondition failed");
}

writeFileSync(files.contract, contract);
writeFileSync(files.protocol, protocol);
writeFileSync(files.server, server);
writeFileSync(files.browser, browser);
console.log("WORLD_V0_I2_APPLY PASS");
