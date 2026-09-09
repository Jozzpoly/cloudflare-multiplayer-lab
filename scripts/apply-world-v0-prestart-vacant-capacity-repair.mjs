import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, oldText, newText, label) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text missing in ${path}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: old text not unique in ${path}`);
  const next = source.slice(0, first) + newText + source.slice(first + oldText.length);
  writeFileSync(path, next);
}

replaceExact(
  "src/world-v0-shared-yard.ts",
  `      const activeEpoch = this.protocolStartTick !== null || Boolean(this.loopTimer);\n      const fullyVacantActiveEpoch = activeEpoch && this.players.size > 0 && this.connectedPlayerCount() === 0;\n      const softOnlyReplacement = activeEpoch && this.softReservedPlayers().length > 0 && this.protectedReservedPlayers().length === 0;\n      if (fullyVacantActiveEpoch) {\n        // Private ActorSession resume authority may survive while the epoch is unused,\n        // but zero connected humans never own scarce public room capacity. The first\n        // authority-valid request wins: a Resume request is handled above, while a\n        // fresh request retires the fully dormant epoch before creating a new one.\n        this.endEpoch("all_players_disconnected_replaced");\n      } else if (softOnlyReplacement) {`,
  `      const activeEpoch = this.protocolStartTick !== null || Boolean(this.loopTimer);\n      const fullyVacantAssembledEpoch = this.players.size === MAX_PLAYERS && this.connectedPlayerCount() === 0;\n      const softOnlyReplacement = activeEpoch && this.softReservedPlayers().length > 0 && this.protectedReservedPlayers().length === 0;\n      if (fullyVacantAssembledEpoch) {\n        // Private ActorSession resume authority may survive while an assembled 2P epoch\n        // is unused, including bounded pre-start ambiguity. Zero connected humans never\n        // own scarce public capacity: Resume is handled above and wins if it arrives\n        // first; a fresh request retires the dormant epoch and starts a new waiting room.\n        this.endEpoch("all_players_disconnected_replaced");\n      } else if (softOnlyReplacement) {`,
  "authority fully-vacant assembled epoch"
);

replaceExact(
  "src/world-slice-entry.ts",
  `      const fullyVacantResumable = active && connected === 0 && reserved > 0;\n      const replacementCapable = active && connected < WORLD_V0_PUBLIC_ROOM_CAPACITY && (\n        fullyVacantResumable || (softReserved > 0 && protectedReserved === 0)\n      );\n      const state = active\n        ? fullyVacantResumable\n          ? "live-vacant-resumable"\n          : protectedReserved > 0\n            ? "live-protected-reserved"\n            : softReserved > 0\n              ? "live-soft-reserved"\n              : "live"\n        : occupancy > 0\n          ? reserved > 0 ? "waiting-reserved" : "waiting"\n          : "empty";`,
  `      const fullyVacantResumable = occupancy === WORLD_V0_PUBLIC_ROOM_CAPACITY && connected === 0 && reserved === occupancy && reserved > 0;\n      const replacementCapable = connected < WORLD_V0_PUBLIC_ROOM_CAPACITY && (\n        fullyVacantResumable || (active && softReserved > 0 && protectedReserved === 0)\n      );\n      const state = active\n        ? fullyVacantResumable\n          ? "live-vacant-resumable"\n          : protectedReserved > 0\n            ? "live-protected-reserved"\n            : softReserved > 0\n              ? "live-soft-reserved"\n              : "live"\n        : occupancy > 0\n          ? fullyVacantResumable\n            ? "waiting-vacant-resumable"\n            : reserved > 0 ? "waiting-reserved" : "waiting"\n          : "empty";`,
  "directory fully-vacant assembled epoch"
);

console.log("WORLD_V0_PRESTART_VACANT_CAPACITY_REPAIR_APPLIED");
