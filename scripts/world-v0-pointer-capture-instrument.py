from pathlib import Path

source = Path("scripts/world-v0-playable-interaction-smoke.mjs")
target = Path("scripts/.world-v0-pointer-capture-diagnostic.mjs")
s = source.read_text()

anchor = "  const dragStart = { x: 210, y: 350 };\n"
assert s.count(anchor) == 1, "dragStart anchor drift"
instrumentation = r'''  const dragStart = { x: 210, y: 350 };
  const dragDiagnosticBefore = await cdp.evaluate(sessionId, `(() => {
    const canvas = document.querySelector("#viewport canvas");
    const r = canvas.getBoundingClientRect();
    const hit = document.elementFromPoint(${dragStart.x}, ${dragStart.y});
    window.__mwPointerTrace = [];
    const describe = (node) => node ? { tag: node.tagName, id: node.id || null, className: typeof node.className === "string" ? node.className : null } : null;
    const record = (phase) => (event) => {
      window.__mwPointerTrace.push({
        phase,
        type: event.type,
        pointerId: event.pointerId ?? null,
        pointerType: event.pointerType ?? null,
        button: event.button ?? null,
        buttons: event.buttons ?? null,
        clientX: event.clientX ?? null,
        clientY: event.clientY ?? null,
        target: describe(event.target),
        currentTarget: describe(event.currentTarget),
        hasCapture: typeof canvas.hasPointerCapture === "function" && event.pointerId != null ? canvas.hasPointerCapture(event.pointerId) : null,
        orbitPointerId: window.__sharedYardV0PlayableControl?.().cameraOrbit?.pointerId ?? null,
        userAdjusted: window.__sharedYardV0PlayableControl?.().cameraOrbit?.userAdjusted ?? null,
      });
    };
    for (const type of ["pointerdown", "gotpointercapture", "pointermove", "lostpointercapture", "pointerup", "pointercancel"]) {
      canvas.addEventListener(type, record("capture"), true);
      canvas.addEventListener(type, record("bubble"), false);
    }
    return {
      canvasRect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
      hit: describe(hit),
      hitIsCanvas: hit === canvas,
      playing: window.__sharedYardV0Evidence?.().networkState,
      control: window.__sharedYardV0PlayableControl?.(),
    };
  })()`);
'''
s = s.replace(anchor, instrumentation)

anchor2 = '  assert(afterDrag.cameraOrbit.userAdjusted === true, "camera drag did not mark user adjustment");\n'
assert s.count(anchor2) == 1, "camera assertion anchor drift"
instrumentation2 = r'''  const dragDiagnosticAfter = await cdp.evaluate(sessionId, `({
    trace: window.__mwPointerTrace || [],
    hit: (() => { const n = document.elementFromPoint(${dragStart.x}, ${dragStart.y}); return n ? { tag:n.tagName, id:n.id || null, className:typeof n.className === "string" ? n.className : null } : null; })(),
    control: window.__sharedYardV0PlayableControl?.(),
  })`);
  result.dragDiagnostic = { before: dragDiagnosticBefore, after: dragDiagnosticAfter, observedControl: afterDrag };
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  assert(afterDrag.cameraOrbit.userAdjusted === true, "camera drag did not mark user adjustment");
'''
s = s.replace(anchor2, instrumentation2)

target.write_text(s)
