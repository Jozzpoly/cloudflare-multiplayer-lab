from pathlib import Path

path = Path("scripts/world-v0-chromium-cloud-smoke.mjs")
text = path.read_text()
old = '''  await dispatchMovement(clients[0], "KeyD", false);
  await dispatchMovement(clients[1], "KeyA", false);
  await sleep(800);

  const finalA = await evidence(clients[0]);
  const finalB = await evidence(clients[1]);
'''
new = '''  await dispatchMovement(clients[0], "KeyD", false);
  await dispatchMovement(clients[1], "KeyA", false);

  const [finalA, finalB] = await Promise.all(clients.map((client, index) => waitFor(
    client,
    `(() => {
      const e = window.__sharedYardV0Evidence?.();
      return e &&
        !e.runtimeFailed &&
        e.metrics.guardMismatches === 0 &&
        e.metrics.guardPending === 0 &&
        e.metrics.guardMatches >= ${MIN_GUARD_MATCHES} &&
        Number.isInteger(e.protocolStartTick) &&
        e.localBoundaryTick >= e.protocolStartTick + ${MIN_ACTIVE_TICKS}
        ? e
        : null;
    })()`,
    `client ${index} final exact-state guard drain`,
    5_000,
  )));
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"exact final-snapshot seam count={count}")
path.write_text(text.replace(old, new, 1))
print("Exact guard-drain apparatus patch materialized")
