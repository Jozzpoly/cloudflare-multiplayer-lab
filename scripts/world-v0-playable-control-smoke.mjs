import assert from "node:assert/strict";
import {
  WORLD_V0_CAMERA_LIMITS,
  cameraRelativeInput,
  clampOrbit,
  orbitFromOffset,
  orbitOffset,
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

console.log("WORLD_V0_PLAYABLE_CONTROL_SMOKE_PASS", JSON.stringify({ orbit, roundTrip, limits: WORLD_V0_CAMERA_LIMITS }));
