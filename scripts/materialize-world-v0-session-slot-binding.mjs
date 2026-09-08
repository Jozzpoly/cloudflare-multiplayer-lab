import { readFileSync, writeFileSync } from "node:fs";

function edit(path, edits) {
  let text = readFileSync(path, "utf8");
  for (const { from, to, label } of edits) {
    const first = text.indexOf(from);
    if (first < 0) throw new Error(`${path}: missing anchor ${label}`);
    if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${path}: non-unique anchor ${label}`);
    text = text.slice(0, first) + to + text.slice(first + from.length);
  }
  writeFileSync(path, text);
}

edit("src/world-v0-shared-yard.ts", [
  {
    label: "status reserved slots",
    from: `        connectedPlayers: this.connectedPlayerCount(),\n        stalePlayers:`,
    to: `        connectedPlayers: this.connectedPlayerCount(),\n        // Public presence metadata: slot numbers are simulation topology, not reconnect authority.\n        // This lets the room directory prove whether a browser's own stored slot is the\n        // disconnected/reserved one without exposing player IDs, session IDs, or resume tokens.\n        reservedSlots: this.sortedPlayers()\n          .filter((player) => player.socket?.readyState !== WebSocket.OPEN)\n          .map((player) => player.slot),\n        stalePlayers:`,
  },
]);

edit("src/world-slice-entry.ts", [
  {
    label: "directory status type",
    from: `        connectedPlayers?: number;\n        protocolStartTick?: number | null;`,
    to: `        connectedPlayers?: number;\n        reservedSlots?: number[];\n        protocolStartTick?: number | null;`,
  },
  {
    label: "directory reserved slots compute",
    from: `      const reserved = Math.max(0, occupancy - connected);\n      const active = status.protocolStartTick !== null && status.protocolStartTick !== undefined;`,
    to: `      const reserved = Math.max(0, occupancy - connected);\n      const reservedSlots = Array.isArray(status.reservedSlots)\n        ? [...new Set(status.reservedSlots.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < WORLD_V0_PUBLIC_ROOM_CAPACITY))].sort((a, b) => a - b)\n        : [];\n      if (reservedSlots.length !== reserved) throw new Error(\`reserved_slot_accounting_\${reservedSlots.length}_\${reserved}\`);\n      const active = status.protocolStartTick !== null && status.protocolStartTick !== undefined;`,
  },
  {
    label: "directory available payload",
    from: `        reserved,\n        capacity: WORLD_V0_PUBLIC_ROOM_CAPACITY,`,
    to: `        reserved,\n        reservedSlots,\n        capacity: WORLD_V0_PUBLIC_ROOM_CAPACITY,`,
  },
  {
    label: "directory unavailable payload",
    from: `        reserved: null,\n        capacity: WORLD_V0_PUBLIC_ROOM_CAPACITY,`,
    to: `        reserved: null,\n        reservedSlots: [],\n        capacity: WORLD_V0_PUBLIC_ROOM_CAPACITY,`,
  },
  {
    label: "directory revision",
    from: `    revision: "world-v0-public-room-directory-r1",`,
    to: `    revision: "world-v0-public-room-directory-r2-slot-presence",`,
  },
]);

edit("public/world-v0/public-room-entry.js", [
  {
    label: "entry revisions",
    from: `export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r1-v1";\nexport const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r1";`,
    to: `export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r1-v2-slot-presence";\nexport const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r2-slot-presence";`,
  },
  {
    label: "normalize reserved slots",
    from: `    const reserved = room.reserved === null || room.reserved === undefined ? null : Number(room.reserved);\n    if (!Number.isInteger(capacity) || capacity <= 0)`,
    to: `    const reserved = room.reserved === null || room.reserved === undefined ? null : Number(room.reserved);\n    const reservedSlots = Array.isArray(room.reservedSlots) ? [...room.reservedSlots] : null;\n    if (!Number.isInteger(capacity) || capacity <= 0)`,
  },
  {
    label: "validate reserved slots",
    from: `    if (occupancy !== null && connected !== null && reserved !== null && connected + reserved !== occupancy) {\n      throw new Error(\`public room presence accounting invalid: \${id}\`);\n    }\n    return {`,
    to: `    if (occupancy !== null && connected !== null && reserved !== null && connected + reserved !== occupancy) {\n      throw new Error(\`public room presence accounting invalid: \${id}\`);\n    }\n    if (reservedSlots === null || reservedSlots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= capacity)) {\n      throw new Error(\`public room reserved slots invalid: \${id}\`);\n    }\n    if (new Set(reservedSlots).size !== reservedSlots.length) throw new Error(\`public room reserved slots duplicate: \${id}\`);\n    if (reserved !== null && reservedSlots.length !== reserved) throw new Error(\`public room reserved slot accounting invalid: \${id}\`);\n    reservedSlots.sort((a, b) => a - b);\n    return {`,
  },
  {
    label: "return reserved slots",
    from: `      reserved,\n      capacity,`,
    to: `      reserved,\n      reservedSlots,\n      capacity,`,
  },
]);

edit("public/world-v0/session-continuity.js", [
  {
    label: "continuity revision",
    from: `export const WORLD_V0_SESSION_CONTINUITY_REVISION = "world-v0-session-continuity-r1";`,
    to: `export const WORLD_V0_SESSION_CONTINUITY_REVISION = "world-v0-session-continuity-r2-slot-bound";`,
  },
  {
    label: "slot-bound match",
    from: `    session.worldEpoch === room.worldEpoch &&\n    Number.isInteger(room.reserved) && room.reserved > 0`,
    to: `    session.worldEpoch === room.worldEpoch &&\n    Array.isArray(room.reservedSlots) &&\n    room.reservedSlots.includes(session.slot)`,
  },
]);

edit("public/world-v0/friend-ready.js", [
  {
    label: "clear helper import",
    from: `  WORLD_V0_SESSION_CONTINUITY_REVISION,\n  readWorldV0StoredSession,`,
    to: `  WORLD_V0_SESSION_CONTINUITY_REVISION,\n  clearWorldV0StoredSession,\n  readWorldV0StoredSession,`,
  },
  {
    label: "room snapshot reserved slots",
    from: `      reserved: room.reserved,\n      capacity: room.capacity,`,
    to: `      reserved: room.reserved,\n      reservedSlots: [...room.reservedSlots],\n      capacity: room.capacity,`,
  },
  {
    label: "direct stale epoch cleanup",
    from: `      const room = rooms.find((candidate) => candidate.id === run);\n      if (!room || room.worldEpoch !== stored.worldEpoch) break;\n      const resumable = worldV0StoredSessionMatchesRoom(stored, room);`,
    to: `      const room = rooms.find((candidate) => candidate.id === run);\n      if (!room) break;\n      if (room.worldEpoch !== stored.worldEpoch) {\n        if (room.state !== "unavailable") clearWorldV0StoredSession(run, stored.worldEpoch);\n        break;\n      }\n      const resumable = worldV0StoredSessionMatchesRoom(stored, room);`,
  },
]);

edit("public/world-v0/build-contract.js", [
  {
    label: "browser UI revision",
    from: `export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v16-session-continuity-r1";`,
    to: `export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v17-slot-bound-session-continuity";`,
  },
]);

edit("scripts/world-v0-session-continuity-smoke.mjs", [
  {
    label: "room fixtures",
    from: `    { id: "yard-1", name: "Yard 1", occupancy: 0, connected: 0, reserved: 0, capacity: 2, state: "empty", joinable: true, worldEpoch: null },\n    { id: "yard-2", name: "Yard 2", occupancy: 2, connected: 2, reserved: 0, capacity: 2, state: "live", joinable: false, worldEpoch: "epoch-2" },\n    { id: "yard-3", name: "Yard 3", occupancy: 2, connected: 1, reserved: 1, capacity: 2, state: "live-reserved", joinable: false, worldEpoch: "epoch-a" },`,
    to: `    { id: "yard-1", name: "Yard 1", occupancy: 0, connected: 0, reserved: 0, reservedSlots: [], capacity: 2, state: "empty", joinable: true, worldEpoch: null },\n    { id: "yard-2", name: "Yard 2", occupancy: 2, connected: 2, reserved: 0, reservedSlots: [], capacity: 2, state: "live", joinable: false, worldEpoch: "epoch-2" },\n    { id: "yard-3", name: "Yard 3", occupancy: 2, connected: 1, reserved: 1, reservedSlots: [1], capacity: 2, state: "live-reserved", joinable: false, worldEpoch: "epoch-a" },`,
  },
  {
    label: "slot binding assertions",
    from: `assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a" }), true);\nassert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-b" }), false);`,
    to: `assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reservedSlots: [1] }), true);\nassert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reservedSlots: [0] }), false, "other reserved slot must not authorize takeover");\nassert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-b", reservedSlots: [1] }), false);`,
  },
]);

edit("scripts/world-v0-direct-link-resume-browser-audit.mjs", [
  {
    label: "mixed probe variable",
    from: `let activeProbePage = null;\nlet resumePage = null;`,
    to: `let activeProbePage = null;\nlet mixedReservedProbePage = null;\nlet resumePage = null;`,
  },
  {
    label: "mixed reserved negative control",
    from: `  assert(reservedRoom?.occupancy === 2 && reservedRoom?.connected === 1 && reservedRoom?.reserved === 1, \`reserved directory mismatch \${JSON.stringify(reservedRoom)}\`);\n\n  const ownerBoundaryAfterClose = ownerBefore.localBoundaryTick + 12;`,
    to: `  assert(reservedRoom?.occupancy === 2 && reservedRoom?.connected === 1 && reservedRoom?.reserved === 1, \`reserved directory mismatch \${JSON.stringify(reservedRoom)}\`);\n  assert(Array.isArray(reservedRoom?.reservedSlots) && reservedRoom.reservedSlots.length === 1 && reservedRoom.reservedSlots[0] === 1, \`reserved slot mismatch \${JSON.stringify(reservedRoom)}\`);\n\n  // Mixed presence red-team: Owner-A is still live in slot 0 while only Peer-B's\n  // slot 1 is reserved. Owner-A's second direct-link tab knows its own stored token,\n  // but MUST NOT be offered Resume just because some other slot is reserved.\n  mixedReservedProbePage = await attachPage(ownerBrowser, DIRECT_URL);\n  await bootDirect(ownerBrowser, mixedReservedProbePage);\n  const mixedReservedProbe = await evaluate(ownerBrowser, mixedReservedProbePage, \`({\n    entry: window.__sharedYardV0FriendEntry(),\n    status: document.querySelector("#boot-status")?.textContent || null,\n    callsign: document.querySelector("#callsign")?.value || null,\n  })\`);\n  assert(mixedReservedProbe.entry?.directLinkResumable === false, \`connected own slot incorrectly matched other reserved slot \${JSON.stringify(mixedReservedProbe)}\`);\n  assert(mixedReservedProbe.entry?.enterLabel === "Enter world", \`mixed reserved direct-link label \${mixedReservedProbe.entry?.enterLabel}\`);\n  const ownerDuringMixedProbe = await evaluate(ownerBrowser, ownerPage, \`window.__sharedYardV0Evidence()\`);\n  assert(ownerDuringMixedProbe.session?.actorSessionId === ownerBefore.session.actorSessionId, "mixed reserved probe stole connected owner ActorSession");\n  assert(!String(ownerDuringMixedProbe.networkState || "").startsWith("closed"), \`mixed reserved probe closed owner \${ownerDuringMixedProbe.networkState}\`);\n  await closePage(ownerBrowser, mixedReservedProbePage);\n  mixedReservedProbePage = null;\n\n  const ownerBoundaryAfterClose = ownerBefore.localBoundaryTick + 12;`,
  },
  {
    label: "result mixed probe",
    from: `    activeProbe,\n    reservedRoom,`,
    to: `    activeProbe,\n    mixedReservedProbe,\n    reservedRoom,`,
  },
  {
    label: "cleanup mixed probe",
    from: `  await closePage(peerBrowser, activeProbePage);\n  await closePage(peerBrowser, peerPage);`,
    to: `  await closePage(peerBrowser, activeProbePage);\n  await closePage(ownerBrowser, mixedReservedProbePage);\n  await closePage(peerBrowser, peerPage);`,
  },
]);

edit(".github/workflows/world-v0-current-validation.yml", [
  {
    label: "direct audit watched path",
    from: `      - scripts/world-v0-cross-page-resume-browser-audit.mjs\n      - scripts/world-v0-integration-i1-lifecycle-probe.mjs`,
    to: `      - scripts/world-v0-cross-page-resume-browser-audit.mjs\n      - scripts/world-v0-direct-link-resume-browser-audit.mjs\n      - scripts/world-v0-integration-i1-lifecycle-probe.mjs`,
  },
  {
    label: "direct audit global step",
    from: `          console.log("WORLD_V0_CURRENT_CROSS_PAGE_PASS", evidence.original.actorSessionId);\n          NODE\n\n      - name: Requalify bounded all-transport-loss window`,
    to: `          console.log("WORLD_V0_CURRENT_CROSS_PAGE_PASS", evidence.original.actorSessionId);\n          NODE\n\n      - name: Requalify direct Yard-link slot-bound resume\n        env:\n          MW_WORLD_V0_DIRECT_RESUME_BASE: http://127.0.0.1:8787\n          MW_WORLD_V0_DIRECT_RESUME_ROOM: yard-2\n          MW_WORLD_V0_DIRECT_RESUME_OUTPUT: world-v0-current-direct-resume.json\n        shell: bash\n        run: |\n          set -euo pipefail\n          timeout 90s node scripts/world-v0-direct-link-resume-browser-audit.mjs | tee world-v0-current-direct-resume.log\n          grep -q 'WORLD_V0_DIRECT_LINK_RESUME_PASS' world-v0-current-direct-resume.log\n          node --input-type=module <<'NODE'\n          import { readFileSync } from "node:fs";\n          const evidence = JSON.parse(readFileSync("world-v0-current-direct-resume.json", "utf8"));\n          if (evidence.activeProbe?.entry?.directLinkResumable !== false) throw new Error("active session takeover guard regression");\n          if (evidence.mixedReservedProbe?.entry?.directLinkResumable !== false) throw new Error("other-slot reserved takeover guard regression");\n          if (evidence.directResume?.entry?.directLinkResumable !== true) throw new Error("reserved own-slot direct resume regression");\n          if (evidence.original?.actorSessionId !== evidence.peerAfter?.actorSessionId) throw new Error("direct ActorSession drift");\n          if (evidence.peerAfter?.guardMismatches !== 0 || evidence.ownerAfter?.guardMismatches !== 0) throw new Error("direct resume exact-state regression");\n          console.log("WORLD_V0_CURRENT_DIRECT_SLOT_BOUND_RESUME_PASS", evidence.original.actorSessionId);\n          NODE\n\n      - name: Requalify bounded all-transport-loss window`,
  },
  {
    label: "direct artifact paths",
    from: `            world-v0-current-cross-page.json\n            world-v0-current-all-drop.log`,
    to: `            world-v0-current-cross-page.json\n            world-v0-current-direct-resume.log\n            world-v0-current-direct-resume.json\n            world-v0-current-all-drop.log`,
  },
]);

console.log("WORLD_V0_SESSION_SLOT_BINDING_MATERIALIZED");
