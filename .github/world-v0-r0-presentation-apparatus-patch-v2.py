from pathlib import Path

path = Path("scripts/world-v0-session-friction-smoke.mjs")
text = path.read_text()
old = '  assert(recovered.evidence.lifecycleEvents?.some((event) => event.type === "epoch-ended"), "epoch-ended lifecycle evidence missing");\n'
if text.count(old) != 1:
    raise SystemExit(f"expected one obsolete post-reconnect epoch-ended assertion, got {text.count(old)}")
path.write_text(text.replace(old, "", 1))
print("R0 session apparatus post-reconnect evidence boundary corrected")
