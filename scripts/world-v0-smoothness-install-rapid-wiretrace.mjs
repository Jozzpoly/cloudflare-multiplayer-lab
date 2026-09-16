import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("./world-v0-smoothness-jump-rapid-repress-probe.mjs", import.meta.url);
let source = readFileSync(path, "utf8");

function replaceOnce(search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`wiretrace seam missing: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`wiretrace seam ambiguous: ${label}`);
  source = source.slice(0, index) + replacement + source.slice(index + search.length);
}

replaceOnce(
  'import { tmpdir } from "node:os";\n',
  'import { tmpdir } from "node:os";\nimport { parseWorldV0ClientMessage } from "../src/world-v0-protocol.ts";\n',
  "protocol import",
);

replaceOnce(
  'let target = null; let peer = null;\nconst result = {',
  'let target = null; let peer = null;\nlet wireDiagnostics = null;\nconst result = {',
  "diagnostic state",
);

replaceOnce(
  '  await evalIn(target, \'document.querySelector("#enter").click(); true\');\n',
  `  await evalIn(target, \`(() => {\n    if (window.__mwWireTraceInstalled) return true;\n    const originalSend = WebSocket.prototype.send;\n    window.__mwOutboundFrames = [];\n    WebSocket.prototype.send = function(data) {\n      if (typeof data === "string" && window.__mwOutboundFrames.length < 5000) {\n        window.__mwOutboundFrames.push({ t: performance.now(), data });\n      }\n      return originalSend.call(this, data);\n    };\n    window.__mwWireTraceInstalled = true;\n    return true;\n  })()\`);\n  await evalIn(target, 'document.querySelector("#enter").click(); true');\n`,
  "pre-connect websocket witness",
);

replaceOnce(
  '  const after = await evidence(target);\n\n  const presses = trace?.presses || [];',
  `  const after = await evidence(target);\n  const outboundFrames = await evalIn(target, 'window.__mwOutboundFrames || []');\n  const invalidFrames = [];\n  const typeCounts = {};\n  for (const frame of outboundFrames) {\n    let parsedJson = null;\n    try { parsedJson = JSON.parse(frame.data); } catch {}\n    const type = parsedJson?.type || "unparseable-json";\n    typeCounts[type] = (typeCounts[type] || 0) + 1;\n    if (!parseWorldV0ClientMessage(frame.data)) {\n      invalidFrames.push({\n        t: frame.t,\n        type,\n        raw: frame.data.slice(0, 2000),\n        parsedJson,\n      });\n    }\n  }\n  wireDiagnostics = {\n    frameCount: outboundFrames.length,\n    typeCounts,\n    invalidCount: invalidFrames.length,\n    invalidExamples: invalidFrames.slice(0, 12),\n  };\n\n  const presses = trace?.presses || [];`,
  "post-run wire validation",
);

replaceOnce(
  '    finalJump: after.inputScheduler.jumpDelivery,\n  };',
  '    finalJump: after.inputScheduler.jumpDelivery,\n    wireDiagnostics,\n  };',
  "summary wire diagnostics",
);

replaceOnce(
  '  result.error = error instanceof Error ? error.stack || error.message : String(error);\n',
  '  result.error = error instanceof Error ? error.stack || error.message : String(error);\n  result.wireDiagnostics = wireDiagnostics;\n',
  "failure preservation",
);

writeFileSync(path, source);
console.log("WORLD_V0_RAPID_WIRETRACE_INSTALLED");
