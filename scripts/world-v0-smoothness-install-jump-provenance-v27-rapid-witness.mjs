import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("./world-v0-smoothness-jump-rapid-repress-probe.mjs", import.meta.url);
let source = readFileSync(path, "utf8");

function replaceOnce(search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`V27 rapid witness seam missing: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`V27 rapid witness seam ambiguous: ${label}`);
  source = source.slice(0, index) + replacement + source.slice(index + search.length);
}

replaceOnce(
  '  await evalIn(target, \'document.querySelector("#enter").click(); true\');\n',
  `  await evalIn(target, \`(() => {\n    if (window.__mwV27WireWitnessInstalled) return true;\n    const originalSend = WebSocket.prototype.send;\n    window.__mwV27OutboundFrames = [];\n    WebSocket.prototype.send = function(data) {\n      if (typeof data === "string" && window.__mwV27OutboundFrames.length < 5000) {\n        window.__mwV27OutboundFrames.push({ t: performance.now(), data });\n      }\n      return originalSend.call(this, data);\n    };\n    window.__mwV27WireWitnessInstalled = true;\n    return true;\n  })()\`);\n  await evalIn(target, 'document.querySelector("#enter").click(); true');\n`,
  "pre-connect outbound provenance witness",
);

replaceOnce(
  '  const after = await evidence(target);\n\n  const presses = trace?.presses || [];',
  `  const after = await evidence(target);\n  const outboundFrames = await evalIn(target, 'window.__mwV27OutboundFrames || []');\n\n  const presses = trace?.presses || [];`,
  "outbound provenance capture",
);

replaceOnce(
  '  const outsideAuthoredRange = deliveries.filter((d) => Number.isInteger(d.firstAuthoredTick) && Number.isInteger(d.lastAuthoredTick) && (d.deliveredTick < d.firstAuthoredTick || d.deliveredTick > d.lastAuthoredTick));\n\n  assert(after.runtimeFailed === false,',
  `  const outsideAuthoredRange = deliveries.filter((d) => Number.isInteger(d.firstAuthoredTick) && Number.isInteger(d.lastAuthoredTick) && (d.deliveredTick < d.firstAuthoredTick || d.deliveredTick > d.lastAuthoredTick));\n\n  const lifecycle = after.lifecycleEvents || [];\n  const canonicalDeliveryEvents = lifecycle.filter((event) => event?.type === "jump-delivery-canonical");\n  const staleProvenanceEvents = lifecycle.filter((event) => event?.type === "jump-delivery-stale-provenance");\n  const canonicalProvenanceMismatches = canonicalDeliveryEvents.filter((event) =>\n    Number.isInteger(event?.jumpSequence) && event.jumpSequence !== event.sequence);\n\n  let provenanceOnlySupersessions = 0;\n  const lastRecordByTick = new Map();\n  for (const frame of outboundFrames) {\n    let message = null;\n    try { message = JSON.parse(frame.data); } catch {}\n    if (message?.type !== "world_v0_input_batch" || !Array.isArray(message.records)) continue;\n    for (const record of message.records) {\n      if (!Number.isInteger(record?.targetTick)) continue;\n      const previous = lastRecordByTick.get(record.targetTick);\n      if (previous) {\n        const samePhysics = previous.x === record.x && previous.z === record.z && Boolean(previous.jump) === Boolean(record.jump);\n        const provenanceChanged = (previous.jumpSequence ?? null) !== (record.jumpSequence ?? null);\n        if (samePhysics && provenanceChanged) provenanceOnlySupersessions += 1;\n      }\n      lastRecordByTick.set(record.targetTick, record);\n    }\n  }\n\n  const pressBySequence = new Map(presses.map((press) => [press.sequence, press]));\n  const deliveryLatenciesMs = deliveries\n    .map((delivery) => {\n      const press = pressBySequence.get(delivery.sequence);\n      return press ? delivery.t - press.t : null;\n    })\n    .filter((value) => Number.isFinite(value) && value >= 0)\n    .sort((a, b) => a - b);\n  const interPressMs = presses.slice(1).map((press, index) => press.t - presses[index].t).sort((a, b) => a - b);\n  const percentile = (values, q) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))] : null;\n  const secondPress = presses[1] || null;\n  const secondDelivery = secondPress ? deliveries.find((delivery) => delivery.sequence === secondPress.sequence) : null;\n\n  const correctionSamples = (after.corrections || []).filter((event) =>\n    Number.isInteger(event?.boundaryBefore) && event.boundaryBefore >= before.localBoundaryTick);\n  const rewindDistribution = correctionSamples.map((event) => event.rewind).filter(Number.isFinite).sort((a, b) => a - b);\n  const selfJumpFlips = correctionSamples.filter((event) =>\n    Boolean(event?.usedBefore?.self?.jump) !== Boolean(event?.resolvedAfter?.self?.jump)).length;\n  const remoteJumpFlips = correctionSamples.filter((event) =>\n    Boolean(event?.usedBefore?.remote?.jump) !== Boolean(event?.resolvedAfter?.remote?.jump)).length;\n\n  assert(after.runtimeFailed === false,`,
  "provenance and correction diagnostics",
);

replaceOnce(
  '    finalJump: after.inputScheduler.jumpDelivery,\n  };',
  `    finalJump: after.inputScheduler.jumpDelivery,\n    staleProvenanceRejections: staleProvenanceEvents.length,\n    canonicalProvenanceMismatchCount: canonicalProvenanceMismatches.length,\n    provenanceOnlySupersessions,\n    provenancePressureCount: staleProvenanceEvents.length + provenanceOnlySupersessions,\n    canonicalDeliveryEventCount: canonicalDeliveryEvents.length,\n    deliveryLatencyP50Ms: percentile(deliveryLatenciesMs, 0.50),\n    deliveryLatencyP95Ms: percentile(deliveryLatenciesMs, 0.95),\n    interPressP50Ms: percentile(interPressMs, 0.50),\n    interPressP95Ms: percentile(interPressMs, 0.95),\n    secondPressDeliveryMs: secondPress && secondDelivery ? secondDelivery.t - secondPress.t : null,\n    correctionSampleCount: correctionSamples.length,\n    correctionMaxSelf: correctionSamples.reduce((max, event) => Math.max(max, Number(event?.delta?.self) || 0), 0),\n    correctionMaxRemote: correctionSamples.reduce((max, event) => Math.max(max, Number(event?.delta?.remote) || 0), 0),\n    correctionMaxProp: correctionSamples.reduce((max, event) => Math.max(max, Number(event?.delta?.prop) || 0), 0),\n    rewindP50: percentile(rewindDistribution, 0.50),\n    rewindP95: percentile(rewindDistribution, 0.95),\n    selfJumpFlips,\n    remoteJumpFlips,\n  };`,
  "V27 rapid summary metrics",
);

replaceOnce(
  '    result.verdict = "RAPID_REPRESS_V26_DRAIN_BARRIER_HELD";\n  } else {\n    throw new Error(`unknown mode ${MODE}`);\n  }',
  `    result.verdict = "RAPID_REPRESS_V26_DRAIN_BARRIER_HELD";\n  } else if (MODE === "v27") {\n    assert(summary.canonicalProvenanceMismatchCount === 0,\n      \`V27 canonical delivery provenance mismatch: \${JSON.stringify(canonicalProvenanceMismatches.slice(0, 8))}\`);\n    assert(summary.falseBeforeAuthorshipCount === 0 && summary.outsideAuthoredRangeCount === 0,\n      \`V27 accepted canonical true outside pending authored range: \${JSON.stringify(summary.falseAssociationExamples)}\`);\n    assert(summary.provenancePressureCount > 0,\n      \`V27 specimen did not exercise provenance pressure: \${JSON.stringify(summary)}\`);\n    result.verdict = "RAPID_REPRESS_V27_EXPLICIT_PROVENANCE_HELD";\n  } else {\n    throw new Error(\`unknown mode \${MODE}\`);\n  }`,
  "V27 mode verdict",
);

writeFileSync(path, source);
console.log("WORLD_V0_JUMP_PROVENANCE_V27_RAPID_WITNESS_INSTALLED");
