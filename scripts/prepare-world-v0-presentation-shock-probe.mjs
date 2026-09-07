import { readFileSync, writeFileSync } from "node:fs";

const PATH = "scripts/.world-v0-playability-input-shape-probe.mjs";
let source = readFileSync(PATH, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `function summarize(start, end) {`,
  `function shockStatsDelta(start, end) {
  if (!start || !end) return null;
  return {
    samples: (end.samples || 0) - (start.samples || 0),
    total: (end.total || 0) - (start.total || 0),
    max: end.max || 0,
    over001: (end.over001 || 0) - (start.over001 || 0),
    over005: (end.over005 || 0) - (start.over005 || 0),
    over010: (end.over010 || 0) - (start.over010 || 0),
    over025: (end.over025 || 0) - (start.over025 || 0),
  };
}

function shockGroupDelta(start, end) {
  if (!start || !end) return null;
  return {
    self: shockStatsDelta(start.self, end.self),
    remote: shockStatsDelta(start.remote, end.remote),
    prop: shockStatsDelta(start.prop, end.prop),
  };
}

function presentationShockDelta(start, end) {
  const a = start?.presentationShock;
  const b = end?.presentationShock;
  if (!a || !b) return null;
  return {
    revision: b.revision,
    renderedFrames: (b.renderedFrames || 0) - (a.renderedFrames || 0),
    correctedFrames: (b.correctedFrames || 0) - (a.correctedFrames || 0),
    uncorrectedFrames: (b.uncorrectedFrames || 0) - (a.uncorrectedFrames || 0),
    correctionEventsObserved: (b.correctionEventsObserved || 0) - (a.correctionEventsObserved || 0),
    maxCorrectionsInFrame: b.maxCorrectionsInFrame || 0,
    byReason: {
      "peer-record": (b.byReason?.["peer-record"] || 0) - (a.byReason?.["peer-record"] || 0),
      "authority-consumed": (b.byReason?.["authority-consumed"] || 0) - (a.byReason?.["authority-consumed"] || 0),
      other: (b.byReason?.other || 0) - (a.byReason?.other || 0),
    },
    netCorrection: shockGroupDelta(a.netCorrection, b.netCorrection),
    renderDisplacementCorrected: shockGroupDelta(a.renderDisplacementCorrected, b.renderDisplacementCorrected),
    renderDisplacementUncorrected: shockGroupDelta(a.renderDisplacementUncorrected, b.renderDisplacementUncorrected),
    latestCorrectedFrame: b.latestCorrectedFrame || null,
  };
}

function summarize(start, end) {`,
  "presentation shock delta helpers",
);

replaceOnce(
  `    observability: observabilityDelta(start, end),
    authoredDelta:`,
  `    observability: observabilityDelta(start, end),
    presentationShock: presentationShockDelta(start, end),
    authoredDelta:`,
  "presentation shock summary",
);

replaceOnce(
  `  await sleep(700);
  start = await Promise.all(clients.map(evidence));`,
  `  await sleep(700);
  await Promise.all(clients.map((client) => evaluate(client, \`window.__sharedYardV0PlayabilityTest.resetPresentationShock(); true\`)));
  start = await Promise.all(clients.map(evidence));`,
  "presentation shock workload reset",
);

writeFileSync(PATH, source);
console.log("WORLD_V0_PRESENTATION_SHOCK_PROBE_PREPARED", PATH);
