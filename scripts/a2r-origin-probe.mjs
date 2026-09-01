const ORIGINS = [
  { name: "production", url: "https://cloudflare-multiplayer-lab.jozzpoly.workers.dev" },
  { name: "staging", url: "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev" },
];

const PATHS = ["/api/ping", "/world0/app.js", "/world0-a2r/app.js"];
const AFFINITY_SAMPLE_COUNT = 16;

function extractClientRevision(text) {
  return /CLIENT_REVISION\s*=\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1] ?? null;
}

async function probe(origin, path, versionKey = null) {
  const url = `${origin.url}${path}`;
  const headers = versionKey ? { "Cloudflare-Workers-Version-Key": versionKey } : undefined;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    const result = {
      path,
      status: response.status,
      ok: response.ok,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      bytes: text.length,
    };
    if (path.endsWith(".js")) result.clientRevision = extractClientRevision(text);
    if (path === "/api/ping") {
      try {
        const json = JSON.parse(text);
        result.ping = {
          ok: json?.ok ?? null,
          revision: json?.revision ?? null,
          stage: json?.stage ?? null,
        };
      } catch {
        result.ping = null;
      }
    }
    return result;
  } catch (error) {
    return {
      path,
      status: null,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

async function fingerprint(origin, versionKey) {
  const results = [];
  for (const path of PATHS) results.push(await probe(origin, path, versionKey));
  const ping = results.find((result) => result.path === "/api/ping");
  const world0 = results.find((result) => result.path === "/world0/app.js");
  const a2r = results.find((result) => result.path === "/world0-a2r/app.js");
  return {
    pingStatus: ping?.status ?? null,
    pingStage: ping?.ping?.stage ?? null,
    world0Status: world0?.status ?? null,
    world0Revision: world0?.clientRevision ?? null,
    a2rStatus: a2r?.status ?? null,
    a2rRevision: a2r?.clientRevision ?? null,
  };
}

function signature(value) {
  return JSON.stringify(value);
}

console.log("A2R public origin safety probe — diagnostic only");
for (const origin of ORIGINS) {
  const unkeyed = [];
  for (const path of PATHS) unkeyed.push(await probe(origin, path));
  console.log(`${origin.name} ${origin.url}`);
  console.log(JSON.stringify(unkeyed, null, 2));

  if (origin.name !== "production") continue;
  const fingerprintCounts = new Map();
  for (let i = 0; i < AFFINITY_SAMPLE_COUNT; i += 1) {
    const versionKey = `a2r-origin-probe-${i}`;
    const value = await fingerprint(origin, versionKey);
    const key = signature(value);
    const existing = fingerprintCounts.get(key) || { fingerprint: value, count: 0, sampleKeys: [] };
    existing.count += 1;
    existing.sampleKeys.push(versionKey);
    fingerprintCounts.set(key, existing);
  }
  const fingerprints = [...fingerprintCounts.values()].map((entry) => ({
    count: entry.count,
    sampleKeys: entry.sampleKeys.slice(0, 3),
    fingerprint: entry.fingerprint,
  }));
  console.log(`production affinity fingerprints · ${fingerprints.length} distinct across ${AFFINITY_SAMPLE_COUNT} keys`);
  console.log(JSON.stringify(fingerprints, null, 2));
}
