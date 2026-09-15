#!/usr/bin/env python3
from pathlib import Path
import sys

OLD = "\n".join([
    '  const ordinal = Number(actorId.slice("actor:".length));',
    '  const angle = ordinal * 1.618 + targetTick * 0.031;',
    '  return [Math.cos(angle), Math.sin(angle)];',
])
NEW = "\n".join([
    '  const ordinal = Number(actorId.slice("actor:".length));',
    '  const phase = (ordinal + targetTick) & 3;',
    '  if (phase === 0) return [1, 0];',
    '  if (phase === 1) return [0, 1];',
    '  if (phase === 2) return [-1, 0];',
    '  return [0, -1];',
])

if len(sys.argv) < 2:
    raise SystemExit("usage: patch-foundation-recovery-deterministic-driver.py <file> [file ...]")

for raw_path in sys.argv[1:]:
    path = Path(raw_path)
    source = path.read_text()
    count = source.count(OLD)
    if count != 1:
        raise RuntimeError(f"deterministic-input insertion point drifted in {path}: found {count}")
    patched = source.replace(OLD, NEW, 1)
    if OLD in patched or "Math.cos(angle)" in patched or "Math.sin(angle)" in patched:
        raise RuntimeError(f"transcendental recovery driver remains in {path}")
    if patched.count(NEW) != 1:
        raise RuntimeError(f"deterministic-input replacement count wrong in {path}")
    path.write_text(patched)
    print(f"FOUNDATION_RECOVERY_DETERMINISTIC_DRIVER_PATCHED {path}")
