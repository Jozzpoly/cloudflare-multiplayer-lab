import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const url = "https://cdn.jsdelivr.net/npm/box3d.js@0.1.1/dist/box3d.inline.mjs";
const response = await fetch(url, { redirect: "follow" });
if (!response.ok) throw new Error(`Box3D CDN fetch failed: ${response.status} ${response.statusText}`);

const contentType = response.headers.get("content-type") || "";
const allowOrigin = response.headers.get("access-control-allow-origin") || "";
if (!/javascript|ecmascript|text\/plain/i.test(contentType)) {
  throw new Error(`Box3D CDN content-type is not module-compatible: ${contentType || "missing"}`);
}
if (allowOrigin !== "*") {
  throw new Error(`Box3D CDN is not cross-origin importable: access-control-allow-origin=${allowOrigin || "missing"}`);
}

const source = await response.text();
if (source.length < 100_000 || source.trimStart().startsWith("<")) {
  throw new Error(`Box3D CDN payload is not a plausible inline module (${source.length} chars)`);
}
const sha256 = createHash("sha256").update(source).digest("hex");

const tempPath = join(tmpdir(), `ws0-a2r-box3d-${process.pid}.mjs`);
try {
  await writeFile(tempPath, source, "utf8");
  const imported = await import(`${pathToFileURL(tempPath).href}?smoke=${Date.now()}`);
  if (typeof imported.default !== "function") throw new Error("Box3D CDN module has no default factory");
  const b3 = await imported.default();
  for (const name of ["b3DefaultWorldDef", "b3CreateWorld", "b3World_Step", "b3DestroyWorld"]) {
    if (typeof b3[name] !== "function") throw new Error(`Box3D CDN runtime missing ${name}`);
  }
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  b3.b3World_Step(world, 1 / 60, 4);
  b3.b3DestroyWorld(world);
  console.log(`A2R browser dependency smoke PASS · ${source.length} chars · sha256 ${sha256} · CORS * · ${contentType} · ${url}`);
} finally {
  await unlink(tempPath).catch(() => {});
}
