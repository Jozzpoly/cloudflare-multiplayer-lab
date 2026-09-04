import Box3D from "box3d.js/inline";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wasmBytes(module) {
  const candidates = [
    module?.HEAPU8?.buffer,
    module?.HEAP8?.buffer,
    module?.wasmMemory?.buffer,
  ];
  const buffer = candidates.find((value) => value && Number.isFinite(value.byteLength));
  return buffer ? buffer.byteLength : null;
}

function allocatorBytes(module) {
  for (const name of ["b3GetByteCount", "_b3GetByteCount"]) {
    const fn = module?.[name];
    if (typeof fn !== "function") continue;
    try {
      const value = Number(fn());
      if (Number.isFinite(value)) return { api: name, bytes: value };
    } catch {
      // Capability probe: a present-but-unusable export is reported as absent.
    }
  }
  return { api: null, bytes: null };
}

async function runCell({ label, initialCapacityBytes, recordingCount }) {
  // A fresh modularized Box3D instance gives this cell its own WebAssembly.Memory,
  // avoiding contamination by high-water growth from another allocation policy.
  const b3 = await Box3D();
  assert(typeof b3.b3CreateRecording === "function", `${label}: b3CreateRecording missing`);
  assert(typeof b3.b3DestroyRecording === "function", `${label}: b3DestroyRecording missing`);

  const beforeWasm = wasmBytes(b3);
  const beforeAllocator = allocatorBytes(b3);
  const recordings = [];
  const createStart = performance.now();
  try {
    for (let index = 0; index < recordingCount; index += 1) {
      const recording = b3.b3CreateRecording(initialCapacityBytes);
      assert(recording, `${label}: recording create failed at ${index}`);
      recordings.push(recording);
    }
    const createMs = performance.now() - createStart;
    const afterCreateWasm = wasmBytes(b3);
    const afterCreateAllocator = allocatorBytes(b3);

    for (const recording of recordings.splice(0)) b3.b3DestroyRecording(recording);
    const afterDestroyWasm = wasmBytes(b3);
    const afterDestroyAllocator = allocatorBytes(b3);

    return {
      label,
      recordingCount,
      requestedInitialCapacityBytes: initialCapacityBytes,
      upstreamEffectiveInitialCapacityBytes: initialCapacityBytes > 0 ? initialCapacityBytes : 64 * 1024,
      requestedInitialBytesTotal: recordingCount * (initialCapacityBytes > 0 ? initialCapacityBytes : 64 * 1024),
      createMs,
      wasmLinearMemory: {
        exposed: beforeWasm !== null,
        beforeBytes: beforeWasm,
        afterCreateBytes: afterCreateWasm,
        afterDestroyBytes: afterDestroyWasm,
        growthBytes: beforeWasm !== null && afterCreateWasm !== null ? afterCreateWasm - beforeWasm : null,
        shrankAfterDestroy: afterCreateWasm !== null && afterDestroyWasm !== null ? afterDestroyWasm < afterCreateWasm : null,
      },
      allocator: {
        exposed: beforeAllocator.bytes !== null || afterCreateAllocator.bytes !== null,
        api: beforeAllocator.api || afterCreateAllocator.api || afterDestroyAllocator.api,
        beforeBytes: beforeAllocator.bytes,
        afterCreateBytes: afterCreateAllocator.bytes,
        afterDestroyBytes: afterDestroyAllocator.bytes,
        liveDeltaBytes: beforeAllocator.bytes !== null && afterCreateAllocator.bytes !== null ? afterCreateAllocator.bytes - beforeAllocator.bytes : null,
        residualDeltaBytes: beforeAllocator.bytes !== null && afterDestroyAllocator.bytes !== null ? afterDestroyAllocator.bytes - beforeAllocator.bytes : null,
      },
    };
  } finally {
    for (const recording of recordings) {
      try { b3.b3DestroyRecording(recording); } catch { /* teardown */ }
    }
  }
}

const policies = [
  { label: "upstream-default-64k", initialCapacityBytes: 0 },
  { label: "qualified-current-2m", initialCapacityBytes: 2 * 1024 * 1024 },
];
const counts = [1, 4, 8, 16];
const cells = [];

for (const policy of policies) {
  for (const recordingCount of counts) {
    cells.push(await runCell({ ...policy, recordingCount }));
  }
}

const highWaterObservable = cells.some((cell) => cell.wasmLinearMemory.exposed);
const allocatorObservable = cells.some((cell) => cell.allocator.exposed);

// The source-level immediate-allocation semantics are already established from
// upstream Box3D. This probe's job is to learn which runtime memory observables
// are available in the exact JS package, not to invent a failure when they are not.
const evidence = {
  verdict: "WORLD_V0_RECORDING_ALLOCATION_PROBE_COMPLETE",
  box3d: "box3d.js@0.1.1",
  policies,
  counts,
  observability: {
    wasmLinearMemory: highWaterObservable,
    allocatorByteCount: allocatorObservable,
    limitation: allocatorObservable
      ? null
      : "b3GetByteCount is not exposed by the current JS binding; WASM linear-memory high-water is not equivalent to live Box3D allocated bytes",
  },
  cells,
  claimBoundary: "allocation/observability microprobe only; no physics, history exactness or product performance claim",
};

// If WASM memory is visible, the deliberately large 16 x 2 MiB request should
// not consume less linear-memory high-water than 16 x 64 KiB in fresh instances.
if (highWaterObservable) {
  const small = cells.find((cell) => cell.label === "upstream-default-64k" && cell.recordingCount === 16);
  const large = cells.find((cell) => cell.label === "qualified-current-2m" && cell.recordingCount === 16);
  assert(small && large, "allocation comparison cells missing");
  assert(
    (large.wasmLinearMemory.afterCreateBytes ?? 0) >= (small.wasmLinearMemory.afterCreateBytes ?? 0),
    "2 MiB initial allocation unexpectedly produced lower WASM high-water than 64 KiB in fresh instances",
  );
}

console.log(JSON.stringify(evidence, null, 2));
