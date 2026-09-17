import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/world-v0-shared-yard.ts", import.meta.url);
let source = readFileSync(path, "utf8");

const search = `    const message = parseWorldV0ClientMessage(raw);\n    if (!message) {\n      this.send(ws, { type: "world_v0_error", error: "invalid_message", ...this.identityPayload() });\n      return;\n    }`;

const replacement = `    const message = parseWorldV0ClientMessage(raw);\n    if (!message) {\n      console.error("WORLD_V0_INVALID_MESSAGE_WITNESS", JSON.stringify({\n        playerId: player.playerId,\n        sessionId: player.sessionId,\n        rawType: typeof raw,\n        rawLength: typeof raw === "string" ? raw.length : null,\n        raw: typeof raw === "string" ? raw.slice(0, 4000) : null,\n      }));\n      this.send(ws, { type: "world_v0_error", error: "invalid_message", ...this.identityPayload() });\n      return;\n    }`;

const first = source.indexOf(search);
if (first < 0) throw new Error("invalid-message witness seam missing");
if (source.indexOf(search, first + search.length) >= 0) throw new Error("invalid-message witness seam non-unique");
source = source.slice(0, first) + replacement + source.slice(first + search.length);

if (!source.includes("WORLD_V0_INVALID_MESSAGE_WITNESS")) throw new Error("invalid-message witness marker missing");
writeFileSync(path, source);
console.log("WORLD_V0_INVALID_MESSAGE_WITNESS_INSTALLED");
