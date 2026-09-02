import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sourcePath = new URL("./rc2-poststop-moving-closure.mjs", import.meta.url);
const generatedPath = new URL("./.rc2-poststop-release-generated.mjs", import.meta.url);

const original = readFileSync(sourcePath, "utf8");
const oldTrace = `const traceB = [\n  { atMs: 0, x: 0, z: -1 },\n  { atMs: 360, x: 0, z: 0 },\n  { atMs: 1500, x: -1, z: 0 },\n  { atMs: STOP_AT_MS, x: 0, z: 0 },\n];`;
const releaseTrace = `const traceB = [\n  { atMs: 0, x: 0, z: -1 },\n  { atMs: 360, x: 0, z: 0 },\n  { atMs: 1500, x: -1, z: 0 },\n  // Release B 500 ms before A. This preserves the opposed-history split while\n  // giving A a short uncontested tail intended to leave shared props with\n  // measurable net momentum after both delayed stop intents have arrived.\n  { atMs: STOP_AT_MS - 500, x: 0, z: 0 },\n];`;

if (!original.includes(oldTrace)) {
  throw new Error("RC2 release-tail wrapper could not locate the frozen base trace");
}

let generated = original.replace(oldTrace, releaseTrace);
generated = generated.replace(
  'revision: "ws0-rc2-poststop-moving-closure-v1",',
  'revision: "ws0-rc2-poststop-release-closure-v1",',
);
generated = generated.replace(
  'intent: "Separate incomplete moving-body closure state from continued delayed player causality.",',
  'intent: "After an opposed-history split, release B early to create net prop momentum; then test transform-only closure only after both delayed stop intents are applied.",',
);
generated = generated.replace(
  'console.log(`RC2 post-stop moving r${REPEAT} — causality stopped, props still moving, transform-only closure`);',
  'console.log(`RC2 post-stop release r${REPEAT} — opposed history + release tail; causality stopped before closure`);',
);

generated = `// GENERATED EPHEMERALLY by rc2-poststop-release-closure.mjs.\n${generated}`;
writeFileSync(generatedPath, generated);

try {
  const run = spawnSync(process.execPath, [generatedPath.pathname], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
} finally {
  try { unlinkSync(generatedPath); } catch { /* teardown only */ }
}
