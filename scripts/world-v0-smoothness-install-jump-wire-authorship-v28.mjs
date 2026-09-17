import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "scripts/world-v0-smoothness-jump-rapid-repress-probe.mjs";
let source = readFileSync(TARGET, "utf8");

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
`  const falseBeforeAuthorship = deliveries.filter((d) => !Number.isInteger(d.firstAuthoredTick) || d.deliveredTick < d.firstAuthoredTick);
  const outsideAuthoredRange = deliveries.filter((d) => Number.isInteger(d.firstAuthoredTick) && Number.isInteger(d.lastAuthoredTick) && (d.deliveredTick < d.firstAuthoredTick || d.deliveredTick > d.lastAuthoredTick));
`,
`  // The live jumpDelivery object is mutable. Under fixed external attempts, the
  // next press may already own firstAuthoredTick/lastAuthoredTick before the 4 ms
  // sampler notices the previous delivery. Qualify authorship from the actual
  // outbound WebSocket records instead of associating a delivery with whichever
  // press currently owns those mutable UI fields.
  const wireAuthoredRangeBySequence = new Map();
  for (const frame of outboundFrames) {
    let message = null;
    try { message = JSON.parse(frame.data); } catch {}
    if (message?.type !== "world_v0_input_batch" || !Array.isArray(message.records)) continue;
    for (const record of message.records) {
      if (!Boolean(record?.jump) || !Number.isInteger(record?.jumpSequence) || !Number.isInteger(record?.targetTick)) continue;
      const existing = wireAuthoredRangeBySequence.get(record.jumpSequence);
      if (!existing) {
        wireAuthoredRangeBySequence.set(record.jumpSequence, { first: record.targetTick, last: record.targetTick });
      } else {
        existing.first = Math.min(existing.first, record.targetTick);
        existing.last = Math.max(existing.last, record.targetTick);
      }
    }
  }
  const deliveriesWithWireAuthorship = deliveries.map((delivery) => {
    const range = wireAuthoredRangeBySequence.get(delivery.sequence) || null;
    return {
      ...delivery,
      snapshotFirstAuthoredTick: delivery.firstAuthoredTick,
      snapshotLastAuthoredTick: delivery.lastAuthoredTick,
      firstAuthoredTick: range?.first ?? null,
      lastAuthoredTick: range?.last ?? null,
    };
  });
  const falseBeforeAuthorship = deliveriesWithWireAuthorship.filter((d) =>
    !Number.isInteger(d.firstAuthoredTick) || d.deliveredTick < d.firstAuthoredTick);
  const outsideAuthoredRange = deliveriesWithWireAuthorship.filter((d) =>
    Number.isInteger(d.firstAuthoredTick) && Number.isInteger(d.lastAuthoredTick)
      && (d.deliveredTick < d.firstAuthoredTick || d.deliveredTick > d.lastAuthoredTick));
  const authorshipSnapshotMismatches = deliveriesWithWireAuthorship.filter((d) =>
    Number.isInteger(d.firstAuthoredTick)
      && (d.snapshotFirstAuthoredTick !== d.firstAuthoredTick || d.snapshotLastAuthoredTick !== d.lastAuthoredTick));
`,
"wire-authored causal range",
);

replaceExact(
`    outsideAuthoredRangeCount: outsideAuthoredRange.length,
    overlapExamples: overlaps.slice(0, 8),
    falseAssociationExamples: falseBeforeAuthorship.slice(0, 8),
`,
`    outsideAuthoredRangeCount: outsideAuthoredRange.length,
    authorshipSnapshotMismatchCount: authorshipSnapshotMismatches.length,
    overlapExamples: overlaps.slice(0, 8),
    falseAssociationExamples: falseBeforeAuthorship.slice(0, 8),
    authorshipSnapshotMismatchExamples: authorshipSnapshotMismatches.slice(0, 8),
`,
"wire-authorship diagnostics summary",
);

writeFileSync(TARGET, source);
console.log("WORLD_V0_JUMP_WIRE_AUTHORSHIP_V28_INSTALLED");
