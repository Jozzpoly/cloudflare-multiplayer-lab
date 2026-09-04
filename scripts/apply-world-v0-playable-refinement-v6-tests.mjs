import { readFileSync, writeFileSync } from "node:fs";

const V5 = "shared-yard-v0-browser-ui-v5-session-friction";
const V6 = "shared-yard-v0-browser-ui-v6-camera-evidence-refinement";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor missing`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function update(path, transform) {
  const source = readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`${path}: expected v6 test change missing`);
  writeFileSync(path, next);
}

update("scripts/world-v0-runtime-shell-smoke.mjs", (source) =>
  replaceOnce(source, V5, V6, "runtime-shell UI revision"),
);

update("scripts/world-v0-session-friction-smoke.mjs", (source) => {
  let next = replaceOnce(source, V5, V6, "session-friction UI revision");
  next = replaceOnce(
    next,
    "  assert(ended.evidence.runtimeFailed === false, `ended runtime failed ${ended.evidence.runtimeFailureReason}`);\n  assert(ended.session.restartAvailable === true, \"restart helper not available\");",
    "  assert(ended.evidence.runtimeFailed === false, `ended runtime failed ${ended.evidence.runtimeFailureReason}`);\n  assert(ended.evidence.session?.end?.kind === \"epoch-ended\", `expected normal epoch-end classification ${JSON.stringify(ended.evidence.session?.end)}`);\n  assert(ended.evidence.lifecycleEvents?.some((event) => event.type === \"epoch-ended\"), \"epoch-ended lifecycle evidence missing\");\n  assert(ended.evidence.lifecycleEvents?.some((event) => event.type === \"socket-close\" && event.expectedAfterEpochEnd === true), \"expected socket-close lifecycle classification missing\");\n  assert(ended.session.restartAvailable === true, \"restart helper not available\");",
    "session-friction lifecycle assertions",
  );
  return next;
});

update("scripts/world-v0-playable-interaction-smoke.mjs", (source) => {
  let next = replaceOnce(source, V5, V6, "interaction UI revision");
  next = replaceOnce(
    next,
    "  await cdp.call(\"Emulation.setDeviceMetricsOverride\", {\n    width: viewport.width,\n    height: viewport.height,\n    deviceScaleFactor: viewport.scale,\n    mobile: viewport.mobile,\n    screenWidth: viewport.width,\n    screenHeight: viewport.height,\n    screenOrientation: { type: viewport.mobile ? \"portraitPrimary\" : \"landscapePrimary\", angle: viewport.mobile ? 0 : 90 },\n  }, sessionId);\n  await sleep(120);",
    "  await cdp.call(\"Emulation.setDeviceMetricsOverride\", {\n    width: viewport.width,\n    height: viewport.height,\n    deviceScaleFactor: viewport.scale,\n    mobile: viewport.mobile,\n    screenWidth: viewport.width,\n    screenHeight: viewport.height,\n    screenOrientation: { type: viewport.mobile ? \"portraitPrimary\" : \"landscapePrimary\", angle: viewport.mobile ? 0 : 90 },\n  }, sessionId);\n  await cdp.call(\"Emulation.setTouchEmulationEnabled\", { enabled: viewport.mobile, maxTouchPoints: 5 }, sessionId);\n  await sleep(120);",
    "interaction touch emulation",
  );
  next = replaceOnce(
    next,
    "async function mouse(cdp, sessionId, type, x, y, button = \"none\", buttons = 0, clickCount = 0) {\n  await cdp.call(\"Input.dispatchMouseEvent\", { type, x, y, button, buttons, clickCount }, sessionId);\n}\n",
    "async function mouse(cdp, sessionId, type, x, y, button = \"none\", buttons = 0, clickCount = 0) {\n  await cdp.call(\"Input.dispatchMouseEvent\", { type, x, y, button, buttons, clickCount }, sessionId);\n}\n\nasync function touch(cdp, sessionId, type, points) {\n  await cdp.call(\"Input.dispatchTouchEvent\", {\n    type,\n    touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: point.id, radiusX: 2, radiusY: 2, force: 1 })),\n  }, sessionId);\n}\n",
    "interaction touch helper",
  );
  next = replaceOnce(
    next,
    "  assert(afterDrag.cameraOrbit.userAdjusted === true, \"camera drag did not mark user adjustment\");\n  assert(Math.abs(afterDrag.cameraOrbit.yaw - before.control.cameraOrbit.yaw) > 0.2, `camera yaw barely changed ${before.control.cameraOrbit.yaw} -> ${afterDrag.cameraOrbit.yaw}`);\n\n  const joy = await cdp.evaluate(sessionId, `(() => { const r = document.querySelector(\"#joystick\").getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, width:r.width, height:r.height }; })()`);",
    "  assert(afterDrag.cameraOrbit.userAdjusted === true, \"camera drag did not mark user adjustment\");\n  assert(Math.abs(afterDrag.cameraOrbit.yaw - before.control.cameraOrbit.yaw) > 0.2, `camera yaw barely changed ${before.control.cameraOrbit.yaw} -> ${afterDrag.cameraOrbit.yaw}`);\n  assert(afterDrag.cameraOrbit.pitch > before.control.cameraOrbit.pitch, `Owner-default vertical drag direction wrong ${before.control.cameraOrbit.pitch} -> ${afterDrag.cameraOrbit.pitch}`);\n\n  const canvas = await cdp.evaluate(sessionId, `(() => { const r = document.querySelector(\"#viewport canvas\").getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height }; })()`);\n  const pinchBefore = await cdp.evaluate(sessionId, `window.__sharedYardV0PlayableControl()`);\n  const pinchY = Math.min(canvas.top + canvas.height * 0.6, 560);\n  const pinchCenterX = canvas.left + canvas.width * 0.52;\n  await touch(cdp, sessionId, \"touchStart\", [{ id: 11, x: pinchCenterX - 32, y: pinchY }, { id: 12, x: pinchCenterX + 32, y: pinchY }]);\n  await touch(cdp, sessionId, \"touchMove\", [{ id: 11, x: pinchCenterX - 72, y: pinchY }, { id: 12, x: pinchCenterX + 72, y: pinchY }]);\n  await sleep(80);\n  const pinchAfter = await cdp.evaluate(sessionId, `window.__sharedYardV0PlayableControl()`);\n  await touch(cdp, sessionId, \"touchEnd\", []);\n  assert(pinchAfter.cameraOrbit.distance < pinchBefore.cameraOrbit.distance * 0.7, `pinch-out did not zoom closer ${pinchBefore.cameraOrbit.distance} -> ${pinchAfter.cameraOrbit.distance}`);\n\n  const gimbal = await cdp.evaluate(sessionId, `(() => { const e = document.querySelector(\"#camera-gimbal\"); const r=e.getBoundingClientRect(); return { visible:getComputedStyle(e).display!==\"none\", x:r.left+r.width/2, y:r.top+r.height/2, width:r.width, height:r.height }; })()`);\n  assert(gimbal.visible && gimbal.width > 40, `mobile camera gimbal not visible ${JSON.stringify(gimbal)}`);\n  const gimbalBefore = await cdp.evaluate(sessionId, `window.__sharedYardV0PlayableControl()`);\n  await touch(cdp, sessionId, \"touchStart\", [{ id: 21, x: gimbal.x, y: gimbal.y }]);\n  await touch(cdp, sessionId, \"touchMove\", [{ id: 21, x: gimbal.x + gimbal.width * 0.2, y: gimbal.y - gimbal.height * 0.28 }]);\n  await sleep(220);\n  const gimbalDuring = await cdp.evaluate(sessionId, `window.__sharedYardV0PlayableControl()`);\n  await touch(cdp, sessionId, \"touchEnd\", []);\n  await sleep(60);\n  const gimbalAfter = await cdp.evaluate(sessionId, `window.__sharedYardV0PlayableControl()`);\n  assert(gimbalDuring.cameraOrbit.pitch > gimbalBefore.cameraOrbit.pitch, `gimbal-up did not raise orbit ${gimbalBefore.cameraOrbit.pitch} -> ${gimbalDuring.cameraOrbit.pitch}`);\n  assert(Math.abs(gimbalDuring.cameraOrbit.yaw - gimbalBefore.cameraOrbit.yaw) > 0.03, `gimbal yaw barely changed ${gimbalBefore.cameraOrbit.yaw} -> ${gimbalDuring.cameraOrbit.yaw}`);\n  assert(Math.hypot(gimbalAfter.gimbalInput?.x || 0, gimbalAfter.gimbalInput?.y || 0) < 1e-6, `gimbal did not release ${JSON.stringify(gimbalAfter.gimbalInput)}`);\n\n  const lifecycleBefore = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);\n  await cdp.evaluate(sessionId, `document.dispatchEvent(new Event(\"visibilitychange\")); true`);\n  await sleep(80);\n  const lifecycleAfter = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);\n  assert(lifecycleAfter.lifecycleEvents?.some((event) => event.type === \"visibility\"), \"visibility lifecycle event not retained\");\n  assert(lifecycleAfter.frame?.longFrameEvents && Array.isArray(lifecycleAfter.frame.longFrameEvents), \"long-frame contextual evidence missing\");\n  assert(lifecycleAfter.presentation.cameraControls?.pinchZoom === true && lifecycleAfter.presentation.cameraControls?.gimbal === true, \"camera control capability evidence missing\");\n\n  const joy = await cdp.evaluate(sessionId, `(() => { const r = document.querySelector(\"#joystick\").getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, width:r.width, height:r.height }; })()`);",
    "interaction camera refinement checks",
  );
  next = replaceOnce(
    next,
    "  const desktop = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);\n  assert(desktop.runtimeFailed === false, `runtime failed after viewport change ${desktop.runtimeFailureReason}`);\n  assert(desktop.networkState === \"waiting for peer\", `unexpected network state ${desktop.networkState}`);",
    "  const desktopBeforeWheel = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);\n  await cdp.call(\"Input.dispatchMouseEvent\", { type: \"mouseWheel\", x: 720, y: 450, deltaX: 0, deltaY: 1000 }, sessionId);\n  await sleep(80);\n  const desktop = await cdp.evaluate(sessionId, `window.__sharedYardV0Evidence()`);\n  assert(desktop.runtimeFailed === false, `runtime failed after viewport change ${desktop.runtimeFailureReason}`);\n  assert(desktop.networkState === \"waiting for peer\", `unexpected network state ${desktop.networkState}`);\n  assert(desktop.presentation.cameraOrbit.distance > desktopBeforeWheel.presentation.cameraOrbit.distance * 2, `desktop multiplicative wheel zoom weak ${desktopBeforeWheel.presentation.cameraOrbit.distance} -> ${desktop.presentation.cameraOrbit.distance}`);\n  assert(desktop.presentation.cameraFar > desktop.presentation.cameraOrbit.distance, `camera far plane cannot see orbit target ${desktop.presentation.cameraFar}`);",
    "interaction desktop wheel refinement",
  );
  next = replaceOnce(
    next,
    "    afterDrag,\n    joystickUp,",
    "    afterDrag,\n    pinch: { before: pinchBefore.cameraOrbit.distance, after: pinchAfter.cameraOrbit.distance },\n    gimbal: { before: gimbalBefore.cameraOrbit, during: gimbalDuring.cameraOrbit, after: gimbalAfter.cameraOrbit },\n    lifecycle: { before: lifecycleBefore.lifecycleEvents?.length || 0, after: lifecycleAfter.lifecycleEvents?.length || 0 },\n    joystickUp,",
    "interaction result payload",
  );
  return next;
});

console.log("WORLD_V0_PLAYABLE_REFINEMENT_V6_TEST_PATCH_PASS");
