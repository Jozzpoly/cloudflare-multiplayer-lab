import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import LocalBox3D from "box3d.js";

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

function moveToward2(currentX, currentZ, targetX, targetZ, maxDelta) {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDelta || distance < 1e-9) return [targetX, targetZ];
  const scale = maxDelta / distance;
  return [currentX + dx * scale, currentZ + dz * scale];
}

function createStaticBox(b3, world, position, halfExtents) {
  const bodyDef = b3.b3DefaultBodyDef();
  bodyDef.position = position;
  const body = b3.b3CreateBody(world, bodyDef);
  b3.b3CreateBoxShape(body, b3.b3DefaultShapeDef(), halfExtents[0], halfExtents[1], halfExtents[2]);
}

function readBody(b3, body) {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 1];
  const linearVelocity = [0, 0, 0];
  const angularVelocity = [0, 0, 0];
  b3.b3Body_GetPosition(position, body);
  b3.b3Body_GetRotation(rotation, body);
  b3.b3Body_GetLinearVelocity(linearVelocity, body);
  b3.b3Body_GetAngularVelocity(angularVelocity, body);
  return [...position, ...rotation, ...linearVelocity, ...angularVelocity];
}

function runParityTrace(b3) {
  const worldDef = b3.b3DefaultWorldDef();
  worldDef.gravity = [0, -20, 0];
  const world = b3.b3CreateWorld(worldDef);
  createStaticBox(b3, world, [0, -0.5, 0], [10, 0.5, 10]);
  createStaticBox(b3, world, [-9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(b3, world, [9.5, 1.5, 0], [0.5, 2, 10]);
  createStaticBox(b3, world, [0, 1.5, -9.5], [10, 2, 0.5]);
  createStaticBox(b3, world, [0, 1.5, 9.5], [10, 2, 0.5]);

  const props = [];
  for (let index = 0; index < 4; index += 1) {
    const bodyDef = b3.b3DefaultBodyDef();
    bodyDef.type = b3.b3BodyType.b3_dynamicBody;
    bodyDef.position = [-0.2 + index * 0.95, 0.46, index % 2 ? 0.35 : -0.35];
    bodyDef.linearDamping = 0.08;
    bodyDef.angularDamping = 0.12;
    const body = b3.b3CreateBody(world, bodyDef);
    const shapeDef = b3.b3DefaultShapeDef();
    shapeDef.density = 22;
    shapeDef.baseMaterial.friction = 0.72;
    shapeDef.baseMaterial.restitution = 0.04;
    b3.b3CreateBoxShape(body, shapeDef, 0.46, 0.46, 0.46);
    props.push(body);
  }

  const playerDef = b3.b3DefaultBodyDef();
  playerDef.type = b3.b3BodyType.b3_dynamicBody;
  playerDef.position = [-4.2, 0.82, -0.25];
  playerDef.linearDamping = 0.3;
  playerDef.angularDamping = 8;
  const player = b3.b3CreateBody(world, playerDef);
  const playerShapeDef = b3.b3DefaultShapeDef();
  playerShapeDef.density = 80;
  playerShapeDef.baseMaterial.friction = 0.8;
  playerShapeDef.baseMaterial.restitution = 0.02;
  b3.b3CreateCapsuleShape(player, playerShapeDef, {
    center1: [0, -0.45, 0],
    center2: [0, 0.45, 0],
    radius: 0.35,
  });
  b3.b3Body_SetMotionLocks(player, {
    linearX: false,
    linearY: false,
    linearZ: false,
    angularX: true,
    angularY: true,
    angularZ: true,
  });

  const dt = 1 / 60;
  for (let tick = 0; tick < 600; tick += 1) {
    let inputX = 0;
    let inputZ = 0;
    if (tick < 170) inputX = 1;
    else if (tick < 280) { inputX = -0.8; inputZ = 0.35; }
    else if (tick < 380) { inputX = 0.9; inputZ = -0.5; }
    const inputLength = Math.hypot(inputX, inputZ);
    if (inputLength > 1) { inputX /= inputLength; inputZ /= inputLength; }

    const velocity = [0, 0, 0];
    b3.b3Body_GetLinearVelocity(velocity, player);
    const hasInput = Math.hypot(inputX, inputZ) > 0.01;
    const [nextX, nextZ] = moveToward2(
      velocity[0],
      velocity[2],
      inputX * 5.2,
      inputZ * 5.2,
      (hasInput ? 28 : 36) * dt,
    );
    b3.b3Body_SetLinearVelocity(player, [nextX, velocity[1], nextZ]);
    b3.b3World_Step(world, dt, 4);
  }

  const state = [readBody(b3, player), ...props.map((body) => readBody(b3, body))].flat();
  b3.b3DestroyWorld(world);
  return state;
}

function maxAbsDelta(a, b) {
  if (a.length !== b.length) return Infinity;
  let max = 0;
  for (let index = 0; index < a.length; index += 1) max = Math.max(max, Math.abs(a[index] - b[index]));
  return max;
}

const tempPath = join(tmpdir(), `ws0-a2r-box3d-${process.pid}.mjs`);
try {
  await writeFile(tempPath, source, "utf8");
  const imported = await import(`${pathToFileURL(tempPath).href}?smoke=${Date.now()}`);
  if (typeof imported.default !== "function") throw new Error("Box3D CDN module has no default factory");

  const [inlineB3, localB3] = await Promise.all([imported.default(), LocalBox3D()]);
  for (const name of ["b3DefaultWorldDef", "b3CreateWorld", "b3World_Step", "b3DestroyWorld"]) {
    if (typeof inlineB3[name] !== "function") throw new Error(`Box3D CDN runtime missing ${name}`);
  }

  const inlineState = runParityTrace(inlineB3);
  const localState = runParityTrace(localB3);
  const parityDelta = maxAbsDelta(inlineState, localState);
  if (!Number.isFinite(parityDelta) || parityDelta > 1e-7) {
    throw new Error(`Box3D default↔inline parity failed: max state delta ${parityDelta}`);
  }

  console.log(`A2R browser dependency smoke PASS · ${source.length} chars · sha256 ${sha256} · CORS * · ${contentType} · default↔inline maxΔ ${parityDelta} · ${url}`);
} finally {
  await unlink(tempPath).catch(() => {});
}
