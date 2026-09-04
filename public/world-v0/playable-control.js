export const WORLD_V0_PLAYABLE_CONTROL_REVISION = "shared-yard-v0-playable-control-v2";

export const WORLD_V0_CAMERA_LIMITS = {
  minPitch: -1.45,
  maxPitch: 1.45,
  minDistance: 0.18,
  maxDistance: 750,
};

export const WORLD_V0_CAMERA_CONTROL = {
  horizontalDragSensitivity: 0.006,
  verticalDragSensitivity: 0.004,
  wheelZoomExponent: 0.0017,
  gimbalYawRadiansPerSecond: 1.8,
  gimbalPitchRadiansPerSecond: 1.45,
  invertYDefault: false,
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

export function dragOrbit(orbit, dx, dy, { invertY = WORLD_V0_CAMERA_CONTROL.invertYDefault } = {}) {
  const verticalSign = invertY ? 1 : -1;
  return clampOrbit({
    yaw: orbit.yaw - dx * WORLD_V0_CAMERA_CONTROL.horizontalDragSensitivity,
    pitch: orbit.pitch + verticalSign * dy * WORLD_V0_CAMERA_CONTROL.verticalDragSensitivity,
    distance: orbit.distance,
  });
}

export function wheelZoomDistance(distance, deltaY) {
  const safeDistance = clamp(Number(distance) || WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
  const next = safeDistance * Math.exp((Number(deltaY) || 0) * WORLD_V0_CAMERA_CONTROL.wheelZoomExponent);
  return clamp(next, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
}

export function pinchZoomDistance(startDistance, startSpan, currentSpan) {
  if (!Number.isFinite(startSpan) || !Number.isFinite(currentSpan) || startSpan <= 1e-6 || currentSpan <= 1e-6) {
    return clamp(Number(startDistance) || WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
  }
  return clamp(startDistance * (startSpan / currentSpan), WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
}

export function cameraClipPlanes(distance) {
  const d = clamp(Number(distance) || WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
  return {
    near: clamp(d * 0.02, 0.01, 0.08),
    far: Math.max(120, d * 3 + 80),
  };
}

export function cameraFogRange(distance) {
  const d = clamp(Number(distance) || WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.minDistance, WORLD_V0_CAMERA_LIMITS.maxDistance);
  return {
    near: Math.max(18, d * 0.75),
    far: Math.max(48, d * 1.6),
  };
}
