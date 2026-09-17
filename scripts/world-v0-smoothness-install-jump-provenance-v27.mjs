import { readFileSync, writeFileSync } from "node:fs";

const protocolPath = new URL("../src/world-v0-protocol.ts", import.meta.url);
const appPath = new URL("../public/world-v0/app.js", import.meta.url);
let protocol = readFileSync(protocolPath, "utf8");
let app = readFileSync(appPath, "utf8");

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`V27 seam missing: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`V27 seam non-unique: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

// ---- Wire/authority provenance. Metadata only; WorldV0InputValue and sameWorldV0Input stay physics-only. ----
protocol = replaceOnce(
  protocol,
  'export type WorldV0InputRecord = WorldV0InputValue & { targetTick: number };',
  'export type WorldV0InputRecord = WorldV0InputValue & { targetTick: number; jumpSequence?: number };\ntype WorldV0ScheduledInput = WorldV0InputValue & { jumpSequence?: number };',
  'input record provenance type',
);
protocol = replaceOnce(
  protocol,
  '  jump: boolean;\n  status: WorldV0RecordStatus;\n};',
  '  jump: boolean;\n  jumpSequence?: number;\n  status: WorldV0RecordStatus;\n};',
  'acceptance provenance type',
);
protocol = replaceOnce(
  protocol,
  'export type WorldV0ConsumedInput = WorldV0InputValue & {\n  targetTick: number;',
  'export type WorldV0ConsumedInput = WorldV0InputValue & {\n  targetTick: number;\n  jumpSequence?: number;',
  'consumed provenance type',
);
protocol = replaceOnce(
  protocol,
  '    if ("jump" in inputRecord && typeof inputRecord.jump !== "boolean") return null;\n    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z, inputRecord.jump === true);\n    records.push({ targetTick: inputRecord.targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });',
  '    if ("jump" in inputRecord && typeof inputRecord.jump !== "boolean") return null;\n    const jumpSequence = "jumpSequence" in inputRecord ? inputRecord.jumpSequence : undefined;\n    if (jumpSequence !== undefined && (!isFiniteInteger(jumpSequence) || jumpSequence <= 0)) return null;\n    const input = normalizeWorldV0Input(inputRecord.x, inputRecord.z, inputRecord.jump === true);\n    records.push({\n      targetTick: inputRecord.targetTick,\n      x: input.x,\n      z: input.z,\n      jump: Boolean(input.jump),\n      ...(jumpSequence !== undefined ? { jumpSequence } : {}),\n    });',
  'parser provenance',
);
protocol = replaceOnce(
  protocol,
  'export class WorldV0ScheduledInputBuffer {\n  private readonly pending = new Map<number, WorldV0InputValue>();',
  'function sameWorldV0ScheduledInput(a: WorldV0ScheduledInput, b: WorldV0ScheduledInput): boolean {\n  return sameWorldV0Input(a, b) && (a.jumpSequence ?? null) === (b.jumpSequence ?? null);\n}\n\nexport class WorldV0ScheduledInputBuffer {\n  private readonly pending = new Map<number, WorldV0ScheduledInput>();',
  'scheduled provenance equality',
);
protocol = replaceOnce(
  protocol,
  '          if (sameWorldV0Input(existing, { x: record.x, z: record.z, jump: Boolean(record.jump) })) {',
  '          if (sameWorldV0ScheduledInput(existing, {\n            x: record.x, z: record.z, jump: Boolean(record.jump), jumpSequence: record.jumpSequence,\n          })) {',
  'authority duplicate provenance comparison',
);
const pendingSetOld = '            this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });';
const pendingSetNew = '            this.pending.set(record.targetTick, {\n              x: record.x, z: record.z, jump: Boolean(record.jump), jumpSequence: record.jumpSequence,\n            });';
if ((protocol.match(new RegExp(pendingSetOld.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "g")) || []).length !== 1) {
  throw new Error('V27 expected exactly one superseding pending.set seam');
}
protocol = protocol.replace(pendingSetOld, pendingSetNew);
protocol = replaceOnce(
  protocol,
  '          this.pending.set(record.targetTick, { x: record.x, z: record.z, jump: Boolean(record.jump) });\n          status = "accepted";',
  '          this.pending.set(record.targetTick, {\n            x: record.x, z: record.z, jump: Boolean(record.jump), jumpSequence: record.jumpSequence,\n          });\n          status = "accepted";',
  'authority accepted provenance storage',
);
protocol = replaceOnce(
  protocol,
  '      return { targetTick, x: pending.x, z: pending.z, jump: Boolean(pending.jump), fresh: true, source: "fresh", missingStreak: 0 };',
  '      return {\n        targetTick, x: pending.x, z: pending.z, jump: Boolean(pending.jump),\n        ...(Number.isInteger(pending.jumpSequence) ? { jumpSequence: pending.jumpSequence } : {}),\n        fresh: true, source: "fresh", missingStreak: 0,\n      };',
  'consumed provenance echo',
);

// ---- Browser authorship provenance. Keep intendedSelf physics-only; sequence is separate metadata. ----
app = replaceOnce(
  app,
  'const intendedSelf = new Map();\nconst peerRemote = new Map();',
  'const intendedSelf = new Map();\nconst intendedJumpSequence = new Map(); // V27 causal metadata; never part of physics/state guard\nconst peerRemote = new Map();',
  'browser provenance map',
);
app = app.replaceAll('intendedSelf.clear();\n', 'intendedSelf.clear();\n  intendedJumpSequence.clear();\n');
app = replaceOnce(
  app,
  '  for (const tick of [...intendedSelf.keys()]) if (tick < cutoff - 1) intendedSelf.delete(tick);\n  for (const tick of [...peerRemote.keys()])',
  '  for (const tick of [...intendedSelf.keys()]) if (tick < cutoff - 1) intendedSelf.delete(tick);\n  for (const tick of [...intendedJumpSequence.keys()]) if (tick < cutoff - 1) intendedJumpSequence.delete(tick);\n  for (const tick of [...peerRemote.keys()])',
  'browser provenance retention trim',
);
app = replaceOnce(
  app,
  'function queueInputRecord(targetTick, input) {\n  const previousPending = pendingBatch[pendingBatch.length - 1];\n  if (previousPending && targetTick !== previousPending.targetTick + 1) flushPendingInputBatch();\n  pendingBatch.push({ targetTick, x: input.x, z: input.z, jump: Boolean(input.jump) });',
  'function queueInputRecord(targetTick, input, jumpSequence = null) {\n  const previousPending = pendingBatch[pendingBatch.length - 1];\n  if (previousPending && targetTick !== previousPending.targetTick + 1) flushPendingInputBatch();\n  pendingBatch.push({\n    targetTick, x: input.x, z: input.z, jump: Boolean(input.jump),\n    ...(Number.isInteger(jumpSequence) ? { jumpSequence } : {}),\n  });',
  'browser queue provenance',
);

const canonicalStart = app.indexOf('function noteCanonicalJumpDelivery(');
const canonicalEnd = app.indexOf('\nfunction stopLogicalInputScheduler()', canonicalStart);
if (canonicalStart < 0 || canonicalEnd < 0) throw new Error('V27 canonical jump seam missing');
app = app.slice(0, canonicalStart) + `function noteCanonicalJumpDelivery(targetTick, jump, jumpApplied, jumpSequence = null) {
  if (jumpApplied && jumpDelivery.lastAppliedTick !== targetTick) {
    jumpDelivery.appliedCount += 1;
    jumpDelivery.lastAppliedTick = targetTick;
  }
  const matchingPendingSequence = jumpDelivery.pending
    && jump
    && Number.isInteger(jumpSequence)
    && jumpSequence === jumpDelivery.pendingSequence;
  if (matchingPendingSequence) {
    jumpDelivery.pending = false;
    jumpDelivery.deliveredSequence = jumpDelivery.pendingSequence;
    jumpDelivery.pendingSequence = null;
    jumpDelivery.deliveredTick = targetTick;
    jumpDelivery.lastDeliveredApplied = Boolean(jumpApplied);
    recordLifecycle("jump-delivery-canonical", {
      sequence: jumpDelivery.deliveredSequence,
      targetTick,
      jumpApplied: Boolean(jumpApplied),
      jumpSequence,
      provenanceRevision: "world-v0-jump-explicit-provenance-v27",
    });
  } else if (jumpDelivery.pending && jump) {
    recordLifecycle("jump-delivery-stale-provenance", {
      pendingSequence: jumpDelivery.pendingSequence,
      targetTick,
      jumpSequence: Number.isInteger(jumpSequence) ? jumpSequence : null,
      provenanceRevision: "world-v0-jump-explicit-provenance-v27",
    });
  }
  if (!jumpDelivery.pending && !jump && !jumpDelivery.edgeArmed) {
    jumpDelivery.edgeArmed = true;
    jumpDelivery.rearmedTick = targetTick;
    recordLifecycle("jump-delivery-rearmed", { targetTick });
  }
}
` + app.slice(canonicalEnd);

app = replaceOnce(
  app,
  '  const movement = currentInput();\n  const jumpIntent = jumpDelivery.pending;\n  const revisions = [];',
  '  const movement = currentInput();\n  const jumpIntent = jumpDelivery.pending;\n  const jumpSequence = jumpIntent ? jumpDelivery.pendingSequence : null;\n  if (jumpIntent && !Number.isInteger(jumpSequence)) throw new Error("pending jump missing sequence provenance");\n  const revisions = [];',
  'scheduler provenance capture',
);
app = replaceOnce(
  app,
  '      intendedSelf.set(tick, next);\n      queueInputRecord(tick, next);\n      logicalInputAuthored += 1;',
  '      intendedSelf.set(tick, next);\n      intendedJumpSequence.set(tick, jumpSequence);\n      queueInputRecord(tick, next, jumpSequence);\n      logicalInputAuthored += 1;',
  'new authored provenance',
);
app = replaceOnce(
  app,
  '    if (sameInput(existing, next)) continue;\n    intendedSelf.set(tick, next);',
  '    const existingJumpSequence = intendedJumpSequence.get(tick) ?? null;\n    if (sameInput(existing, next) && existingJumpSequence === jumpSequence) continue;\n    intendedSelf.set(tick, next);\n    intendedJumpSequence.set(tick, jumpSequence);',
  'provenance-only supersession',
);
app = replaceOnce(
  app,
  '      unsent.jump = Boolean(next.jump);\n    } else {\n      revisions.push({ targetTick: tick, x: next.x, z: next.z, jump: Boolean(next.jump) });',
  '      unsent.jump = Boolean(next.jump);\n      if (Number.isInteger(jumpSequence)) unsent.jumpSequence = jumpSequence;\n      else delete unsent.jumpSequence;\n    } else {\n      revisions.push({\n        targetTick: tick, x: next.x, z: next.z, jump: Boolean(next.jump),\n        ...(Number.isInteger(jumpSequence) ? { jumpSequence } : {}),\n      });',
  'revision provenance',
);
app = replaceOnce(
  app,
  '    noteCanonicalJumpDelivery(message.targetTick, selfCanonical.jump, selfCanonical.jumpApplied);',
  '    noteCanonicalJumpDelivery(\n      message.targetTick, selfCanonical.jump, selfCanonical.jumpApplied, selfCanonical.jumpSequence ?? null,\n    );',
  'consumed provenance delivery call',
);
app = replaceOnce(
  app,
  '    if (player.sessionId === selfSessionId) selfCanonical = next;',
  '    if (player.sessionId === selfSessionId) {\n      selfCanonical = {\n        ...next,\n        jumpSequence: Number.isInteger(player.jumpSequence) ? player.jumpSequence : null,\n      };\n    }',
  'self consumed provenance capture',
);

if (!protocol.includes('sameWorldV0ScheduledInput') || !protocol.includes('jumpSequence?: number')) throw new Error('V27 protocol marker missing');
if (!app.includes('world-v0-jump-explicit-provenance-v27') || !app.includes('intendedJumpSequence')) throw new Error('V27 browser marker missing');
writeFileSync(protocolPath, protocol);
writeFileSync(appPath, app);
console.log('WORLD_V0_JUMP_EXPLICIT_PROVENANCE_V27_INSTALLED');
