export const WORLD_V0_PLAYABLE_CONTROL_REVISION = "shared-yard-v0-playable-control-v1";

export const WORLD_V0_CAMERA_LIMITS = {
  minPitch: 0.16,
  maxPitch: 1.08,
  minDistance: 5.5,
  maxDistance: 26,
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function orbitFromOffset(offset) {
  const [x, y, z] = offset;
  const horizontal = Math.hypot(x, z);
  return {
    yaw: Math.atan2(x, z),
    pitch: Math.atan2(y, horizontal),
    distance: Math.hypot(horizontal, y),
  };
}

export function orbitOffset({ yaw, pitch, distance }) {
  const clampedPitch = clamp(pitch, WORLD_V0_CAMERA_LIMITS.minPitch, WORLD_V0_CAMERA_LIMITS.maxPitch);
  const clampedDistance = clamp(distance, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
  const horizontal = Math.cos(clampedPitch) * clampedDistance;
  return [
    Math.sin(yaw) * horizontal,
    Math.sin(clampedPitch) * clampedDistance,
    Math.cos(yaw) * horizontal,
  ];
}

export function cameraRelativeInput(input, yaw) {
  const x = Number(input?.x) || 0;
  const z = Number(input?.z) || 0;
  const magnitude = Math.hypot(x, z);
  if (magnitude < 1e-9) return { x: 0, z: 0 };
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  const localRight = x * scale;
  const localForward = -z * scale;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return {
    x: localRight * cos - localForward * sin,
    z: -localRight * sin - localForward * cos,
  };
}

export function clampOrbit({ yaw, pitch, distance }) {
  return {
    yaw,
    pitch: clamp(pitch, WORLD_V0_CAMERA_LIMITS.minPitch, WORLD_V0_CAMERA_LIMITS.maxPitch),
    distance: clamp(distance, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance),
  };
}
