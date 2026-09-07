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
writeFileSync(PROBE, probe);

console.log("WORLD_V0_PLAYABILITY_NO_RENDER_CADENCE_PREPARED");
