from pathlib import Path

app = Path("public/world-v0/app.js")
s = app.read_text()
anchor = 'window.__sharedYardV0Session = () => ({\n'
assert s.count(anchor) == 1, "app session export anchor drift"
probe = r'''window.__sharedYardV0JumpProbe = () => {
  const body = localState?.sim?.actorBodies?.get(selfSessionId);
  if (!body) return null;
  return {
    boundaryTick: localState?.boundaryTick ?? null,
    position: bodyPosition(body),
    velocity: bodyLinearVelocity(body),
    supported: hasJumpSupport(body),
  };
};
'''
s = s.replace(anchor, probe + anchor)
app.write_text(s)

source = Path("scripts/world-v0-chromium-cloud-smoke.mjs")
target = Path("scripts/.world-v0-jump-browser-probe.mjs")
s = source.read_text()

old_page = 'const STAGING_PAGE = "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev/world-v0/";'
new_page = 'const STAGING_PAGE = (process.env.MW_WORLD_V0_JUMP_BASE_URL || "http://127.0.0.1:8787").replace(/\\/$/, "") + "/world-v0/";'
assert s.count(old_page) == 1, "cloud smoke page anchor drift"
s = s.replace(old_page, new_page)

movement_anchor = r'''async function dispatchMovement(client, code, down) {
  const type = down ? "keydown" : "keyup";
  const key = code === "KeyD" ? "d" : code === "KeyA" ? "a" : code;
  await client.cdp.evaluate(
    client.page.sessionId,
    `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { code: ${JSON.stringify(code)}, key: ${JSON.stringify(key)}, bubbles: true })); true`,
  );
}
'''
assert s.count(movement_anchor) == 1, "movement helper anchor drift"
helpers = movement_anchor + r'''
async function jumpProbe(client) {
  return await client.cdp.evaluate(client.page.sessionId, `window.__sharedYardV0JumpProbe?.() || null`);
}

async function dispatchKeyboardJump(client) {
  await client.cdp.evaluate(client.page.sessionId, `(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code:"Space", key:" ", bubbles:true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code:"Space", key:" ", bubbles:true }));
    return true;
  })()`);
}

async function dispatchButtonJump(client) {
  await client.cdp.evaluate(client.page.sessionId, `(() => {
    const button = document.querySelector("#jump-button");
    if (!button || button.classList.contains("hidden")) return false;
    button.dispatchEvent(new PointerEvent("pointerdown", { pointerId:71, pointerType:"touch", isPrimary:true, bubbles:true }));
    return true;
  })()`);
}
'''
s = s.replace(movement_anchor, helpers)

anchor = r'''  await dispatchMovement(clients[0], "KeyD", true);
  await dispatchMovement(clients[1], "KeyA", true);

  await Promise.all(clients.map((client, index) => waitFor(
'''
assert s.count(anchor) == 1, "main movement anchor drift"
jump_test = r'''  await dispatchMovement(clients[0], "KeyD", true);
  await dispatchMovement(clients[1], "KeyA", true);

  await Promise.all(clients.map((client, index) => waitFor(
    client,
    `(() => { const p = window.__sharedYardV0JumpProbe?.(); return p?.supported === true && p.position?.[1] > 0.75 && p.position?.[1] < 0.9; })()`,
    `client ${index} grounded before jump`,
  )));

  const jumpStartA = await jumpProbe(clients[0]);
  await dispatchKeyboardJump(clients[0]);
  await waitFor(
    clients[0],
    `(() => { const p = window.__sharedYardV0JumpProbe?.(); return p && p.position[1] > ${jumpStartA.position[1] + 0.30} && p.velocity[1] > 0.5; })()`,
    "client A keyboard jump ascent",
  );
  const jumpAscentA = await jumpProbe(clients[0]);
  assert(jumpAscentA.supported === false, `client A should be airborne after jump ${JSON.stringify(jumpAscentA)}`);

  await waitFor(
    clients[0],
    `(() => { const p = window.__sharedYardV0JumpProbe?.(); return p && p.supported === false && p.position[1] > 1.05 && p.velocity[1] < -1; })()`,
    "client A descending airborne phase",
  );
  const descendingBeforeA = await jumpProbe(clients[0]);
  await dispatchKeyboardJump(clients[0]);
  await sleep(100);
  const descendingAfterA = await jumpProbe(clients[0]);
  assert(descendingAfterA.supported === false, `client A unexpectedly supported during anti-double-jump probe ${JSON.stringify(descendingAfterA)}`);
  assert(descendingAfterA.velocity[1] < 0, `airborne second Space incorrectly re-launched client A ${JSON.stringify({before:descendingBeforeA,after:descendingAfterA})}`);

  await waitFor(
    clients[0],
    `(() => { const p = window.__sharedYardV0JumpProbe?.(); return p?.supported === true && p.position?.[1] > 0.75 && p.position?.[1] < 0.9; })()`,
    "client A landing after keyboard jump",
  );
  const jumpLandedA = await jumpProbe(clients[0]);

  const jumpStartB = await jumpProbe(clients[1]);
  const buttonDispatched = await dispatchButtonJump(clients[1]);
  assert(buttonDispatched === true, "client B jump button unavailable while live");
  await waitFor(
    clients[1],
    `(() => { const p = window.__sharedYardV0JumpProbe?.(); return p && p.position[1] > ${jumpStartB.position[1] + 0.30} && p.velocity[1] > 0.5; })()`,
    "client B button jump ascent",
  );
  const jumpAscentB = await jumpProbe(clients[1]);
  await waitFor(
    clients[1],
    `(() => { const p = window.__sharedYardV0JumpProbe?.(); return p?.supported === true && p.position?.[1] > 0.75 && p.position?.[1] < 0.9; })()`,
    "client B landing after button jump",
  );
  const jumpLandedB = await jumpProbe(clients[1]);

  await Promise.all(clients.map((client, index) => waitFor(
'''
s = s.replace(anchor, jump_test)

result_anchor = r'''    runKey,
    identity: finalA.identity,
    pages: [finalA, finalB],
'''
assert s.count(result_anchor) == 1, "result anchor drift"
result_insert = r'''    runKey,
    identity: finalA.identity,
    jumpEvidence: {
      clientA: { start: jumpStartA, ascent: jumpAscentA, descendingBeforeSecondPress: descendingBeforeA, descendingAfterSecondPress: descendingAfterA, landed: jumpLandedA },
      clientB: { start: jumpStartB, ascent: jumpAscentB, landed: jumpLandedB },
    },
    pages: [finalA, finalB],
'''
s = s.replace(result_anchor, result_insert)

target.write_text(s)
print("WORLD_V0_JUMP_BROWSER_INSTRUMENT_READY")
