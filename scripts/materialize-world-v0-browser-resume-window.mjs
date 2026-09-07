import { readFileSync, writeFileSync } from "node:fs";

const files = [
  {
    path: "public/world-v0/app.js",
    from: "const ACTOR_RESUME_MAX_ATTEMPTS = 8;",
    // Capped backoff reaches attempts at ~0.15, 0.45, 1.05, 2.25, then every 2 s.
    // Twelve attempts keep the client retry horizon beyond the 15 s all-disconnected
    // WorldEpoch grace instead of allowing the browser to fail itself first.
    to: "const ACTOR_RESUME_MAX_ATTEMPTS = 12;",
  },
  {
    path: "public/world-v0/build-contract.js",
    from: 'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v10-room-recovery";',
    to: 'export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v11-resume-window";',
  },
];

for (const edit of files) {
  const source = readFileSync(edit.path, "utf8");
  const first = source.indexOf(edit.from);
  const last = source.lastIndexOf(edit.from);
  if (first < 0) throw new Error(`${edit.path}: expected source text missing`);
  if (first !== last) throw new Error(`${edit.path}: expected source text is not unique`);
  if (source.includes(edit.to)) throw new Error(`${edit.path}: target text already present`);
  writeFileSync(edit.path, source.slice(0, first) + edit.to + source.slice(first + edit.from.length));
  console.log(`materialized ${edit.path}`);
}

console.log("WORLD_V0_CLOSURE_BROWSER_RESUME_WINDOW_MATERIALIZED");
