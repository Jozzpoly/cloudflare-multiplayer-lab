import assert from "node:assert/strict";
import {
  WORLD_V0_CAMERA_CONTROL,
  WORLD_V0_CAMERA_LIMITS,
  cameraClipPlanes,
  cameraFogRange,
  cameraRelativeInput,
  clampOrbit,
  dragOrbit,
  orbitFromOffset,
  orbitOffset,
  pinchZoomDistance,
  wheelZoomDistance,
} from "../public/world-v0/playable-control.js";

const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

const legacyDesktop = [7.4, 6.3, 8.7];
const orbit = orbitFromOffset(legacyDesktop);
const roundTrip = orbitOffset(orbit);
for (let i = 0; i < 3; i += 1) approx(roundTrip[i], legacyDesktop[i], 1e-9);

let input = cameraRelativeInput({ x: 0, z: -1 }, 0);
approx(input.x, 0);
approx(input.z, -1);

input = cameraRelativeInput({ x: 1, z: 0 }, 0);
approx(input.x, 1);
approx(input.z, 0);

input = cameraRelativeInput({ x: 0, z: -1 }, Math.PI / 2);
approx(input.x, -1, 1e-9);
approx(input.z, 0, 1e-9);

input = cameraRelativeInput({ x: 1, z: 0 }, Math.PI / 2);
approx(input.x, 0, 1e-9);
approx(input.z, -1, 1e-9);

input = cameraRelativeInput({ x: 1, z: -1 }, 0);
approx(Math.hypot(input.x, input.z), 1, 1e-9);

const clamped = clampOrbit({ yaw: 9, pitch: -100, distance: 1000 });
assert.equal(clamped.yaw, 9);
assert.equal(clamped.pitch, WORLD_V0_CAMERA_LIMITS.minPitch);
assert.equal(clamped.distance, WORLD_V0_CAMERA_LIMITS.maxDistance);
assert.ok(WORLD_V0_CAMERA_LIMITS.minDistance <= 0.2, `near zoom too restrictive ${WORLD_V0_CAMERA_LIMITS.minDistance}`);
assert.ok(WORLD_V0_CAMERA_LIMITS.maxDistance >= 500, `far zoom too restrictive ${WORLD_V0_CAMERA_LIMITS.maxDistance}`);

const draggedUp = dragOrbit({ yaw: 0, pitch: 0.4, distance: 10 }, 0, -50);
assert.ok(draggedUp.pitch > 0.4, `Owner-default vertical drag must raise orbit for upward pointer motion, got ${draggedUp.pitch}`);
const draggedUpInverted = dragOrbit({ yaw: 0, pitch: 0.4, distance: 10 }, 0, -50, { invertY: true });
assert.ok(draggedUpInverted.pitch < 0.4, `invert-Y path must reverse vertical orbit, got ${draggedUpInverted.pitch}`);
assert.equal(WORLD_V0_CAMERA_CONTROL.invertYDefault, false);

const wheelFar = wheelZoomDistance(10, 1000);
assert.ok(wheelFar > 40 && wheelFar < WORLD_V0_CAMERA_LIMITS.maxDistance, `multiplicative wheel zoom unexpected ${wheelFar}`);
const wheelNear = wheelZoomDistance(10, -1000);
assert.ok(wheelNear < 3 && wheelNear > WORLD_V0_CAMERA_LIMITS.minDistance, `multiplicative wheel zoom-in unexpected ${wheelNear}`);
assert.equal(wheelZoomDistance(WORLD_V0_CAMERA_LIMITS.maxDistance, 10000), WORLD_V0_CAMERA_LIMITS.maxDistance);
assert.equal(wheelZoomDistance(WORLD_V0_CAMERA_LIMITS.minDistance, -10000), WORLD_V0_CAMERA_LIMITS.minDistance);

const pinchCloser = pinchZoomDistance(12, 100, 200);
approx(pinchCloser, 6);
const pinchFarther = pinchZoomDistance(12, 100, 50);
approx(pinchFarther, 24);

const nearClip = cameraClipPlanes(WORLD_V0_CAMERA_LIMITS.minDistance);
const farClip = cameraClipPlanes(500);
assert.ok(nearClip.near <= 0.01 + 1e-9, `near clip blocks close inspection ${nearClip.near}`);
assert.ok(farClip.far > 500, `far clip cannot see 500m orbit target ${farClip.far}`);
assert.ok(farClip.far / farClip.near < 50_000, `far/near ratio too aggressive ${farClip.far / farClip.near}`);

const farFog = cameraFogRange(500);
assert.ok(farFog.near < 500 && farFog.far > 500, `500m target must remain inside fog range ${JSON.stringify(farFog)}`);

console.log("WORLD_V0_PLAYABLE_CONTROL_SMOKE_PASS", JSON.stringify({
  orbit,
  roundTrip,
  limits: WORLD_V0_CAMERA_LIMITS,
  control: WORLD_V0_CAMERA_CONTROL,
  wheelFar,
  wheelNear,
  pinchCloser,
  pinchFarther,
  nearClip,
  farClip,
  farFog,
}));
