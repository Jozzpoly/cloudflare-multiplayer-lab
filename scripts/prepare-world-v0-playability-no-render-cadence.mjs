import { readFileSync, writeFileSync } from "node:fs";

const APP = "public/world-v0/app.js";
const PROBE = "scripts/.world-v0-playability-input-shape-probe.mjs";

function replaceUnique(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor missing`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let app = readFileSync(APP, "utf8");
if (!app.includes("inputLeadTicks: simulation?.timing?.predictionLeadTicks")) {
  app = replaceUnique(
    app,
    "      cadenceMs: STEP_MS,\n      ownsCanonicalAuthorship: true,",
    "      cadenceMs: STEP_MS,\n      inputLeadTicks: simulation?.timing?.predictionLeadTicks ?? null,\n      simulationLeadTicks: simulation?.timing?.clientSimulationLeadTicks ?? simulation?.timing?.predictionLeadTicks ?? null,\n      ownsCanonicalAuthorship: true,",
    "normalized split-lead evidence",
  );
}
app = replaceUnique(
  app,
  "  renderer.render(scene, camera);",
  "  if (!window.__mwSkipWorldV0Render) renderer.render(scene, camera);",
  "conditional WebGL draw",
);
writeFileSync(APP, app);

let probe = readFileSync(PROBE, "utf8");
probe = replaceUnique(
  probe,
  '  for (const client of clients) await evaluate(client, `document.querySelector("#enter").click(); true`);',
  '  for (const client of clients) await evaluate(client, `window.__mwSkipWorldV0Render = true; document.querySelector("#enter").click(); true`);',
  "enable no-render cadence before enter",
);
probe = replaceUnique(
  probe,
  '  verdict: "WORLD_V0_PLAYABILITY_INPUT_SHAPE_FAIL",',
  '  verdict: "WORLD_V0_PLAYABILITY_INPUT_SHAPE_FAIL",\n  apparatusMode: "no-webgl-draw-rAF-v1",',
  "apparatus marker",
);
probe = replaceUnique(
  probe,
  `    frameP95Ms: end.frame?.p95Ms ?? null,
    frameMaxMs: end.frame?.maxMs ?? null,`,
  `    frameP95Ms: end.frame?.p95Ms ?? null,
    frameMaxMs: end.frame?.maxMs ?? null,
    rttMedianMs: end.rtt?.medianMs ?? null,
    rttP95Ms: end.rtt?.p95Ms ?? null,`,
  "network timing evidence",
);

const waitThrowBefore = '  throw new Error(`${label} timeout · last=${JSON.stringify(last)}`);';
const waitThrowAfter = [
  '  let debug = null;',
  '  try {',
  '    debug = await evaluate(client, `(() => {',
  '      const e = window.__sharedYardV0Evidence?.();',
  '      if (!e) return { href: location.href, documentReady: document.readyState, bootStatus: document.querySelector("#boot-status")?.textContent || null };',
  '      return {',
  '        networkState: e.networkState,',
  '        runtimeFailed: e.runtimeFailed,',
  '        runtimeFailureReason: e.runtimeFailureReason,',
  '        identity: e.identity,',
  '        protocolStartTick: e.protocolStartTick,',
  '        localBoundaryTick: e.localBoundaryTick,',
  '        latestAuthorityBoundary: e.metrics?.latestAuthorityBoundary ?? null,',
  '        guardMatches: e.metrics?.guardMatches ?? null,',
  '        guardMismatches: e.metrics?.guardMismatches ?? null,',
  '        guardPending: e.metrics?.guardPending ?? null,',
  '        frame: e.frame,',
  '        actorResume: e.session?.actorResume ?? null,',
  '        sessionEnd: e.session?.end ?? null,',
  '        lifecycleTail: e.lifecycleEvents?.slice(-10) || [],',
  '      };',
  '    })()`);',
  '  } catch (error) { debug = { debugReadError: error instanceof Error ? error.message : String(error) }; }',
  '  throw new Error(`${label} timeout · last=${JSON.stringify(last)} · debug=${JSON.stringify(debug)}`);',
].join("\n");
probe = replaceUnique(probe, waitThrowBefore, waitThrowAfter, "timeout diagnostic capture");

writeFileSync(PROBE, probe);

console.log("WORLD_V0_PLAYABILITY_NO_RENDER_CADENCE_PREPARED");
