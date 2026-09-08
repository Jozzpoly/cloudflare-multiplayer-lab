import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("./ws0-f4-bounded-scheduled-history.mjs", import.meta.url);
const tempPath = new URL("./.ws0-f4-bounded-scheduled-history-run.mjs", import.meta.url);
const source = readFileSync(sourcePath, "utf8");

const oldMetric = `function quaternionAngle(a, b) {
  const dot = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}`;
const newMetric = `function quaternionAngle(a, b) {
  const na = Math.hypot(a[0], a[1], a[2], a[3]);
  const nb = Math.hypot(b[0], b[1], b[2], b[3]);
  if (na === 0 || nb === 0) return Infinity;
  const dot = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]) / (na * nb);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}`;

const first = source.indexOf(oldMetric);
const last = source.lastIndexOf(oldMetric);
if (first < 0 || first !== last) {
  throw new Error("F4 runner refused: expected exactly one pre-qualified quaternion metric block");
}

const patched = source.replace(oldMetric, newMetric);
writeFileSync(tempPath, patched);
try {
  await import(`${pathToFileURL(tempPath.pathname).href}?f4-normalized-quaternion-v1`);
} finally {
  try { unlinkSync(tempPath); } catch {}
}
