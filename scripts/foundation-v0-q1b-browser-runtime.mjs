import { createServer } from "node:http";
import { readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import Box3D from "box3d.js/inline";
import {
  Q1B_EXPECTED_PERTURB_BOUNDARY,
  firstTraceDifference,
  runQ1bSimulation,
} from "../public/foundation-q1b/sim-core.js";

const ROOT = resolve(".");
const OUTPUT_PREFIX = process.env.MW_Q1B_OUTPUT_PREFIX || "foundation-v0-q1b";
const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], {
    encoding: "utf8",
  });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error(`Chromium/Chrome binary not found: ${probe.stderr || "no candidate on PATH"}`);
  return binary;
}

function chromeVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").trim();
}

function serveFile(req, res) {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const target = resolve(ROOT, `.${pathname}`);
    if (target !== ROOT && !target.startsWith(`${ROOT}${sep}`)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const stat = statSync(target);
    if (!stat.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME.get(extname(target)) || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(readFileSync(target));
  } catch {
    res.writeHead(404).end("not found");
  }
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("unexpected server address"));
      resolveListen(address.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function runChrome(binary, url) {
  const profile = mkdtempSync(join(tmpdir(), "mw-q1b-chrome-"));
  return new Promise((resolveRun, reject) => {
    const args = [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=15000",
      "--dump-dom",
      url,
    ];
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 30000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      rmSync(profile, { recursive: true, force: true });
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      rmSync(profile, { recursive: true, force: true });
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(`Chrome exited code=${code} signal=${signal ?? "none"}\n${err.slice(-5000)}`));
        return;
      }
      resolveRun({ dom: out, stderr: err });
    });
  });
}

function parseBrowserPayload(dom, stderr) {
  const match = dom.match(/<script[^>]*id="q1b-result"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match || !match[1].trim()) {
    throw new Error(`Q1b result payload missing from Chromium DOM\nChrome stderr tail:\n${stderr.slice(-5000)}\nDOM tail:\n${dom.slice(-5000)}`);
  }
  const payload = JSON.parse(match[1]);
  if (!payload.ok) throw new Error(`Chromium Q1b page failed: ${payload.error || "unknown browser error"}`);
  return payload;
}

function writeEvidence(name, value) {
  writeFileSync(`${OUTPUT_PREFIX}-${name}.json`, JSON.stringify(value, null, 2));
}

const packageJson = JSON.parse(readFileSync("node_modules/box3d.js/package.json", "utf8"));
if (packageJson.version !== "0.1.1") throw new Error(`unexpected box3d.js version ${packageJson.version}`);

const b3 = await Box3D();
const nodeResult = runQ1bSimulation(b3, { perturb: false });
writeEvidence("node", {
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  result: nodeResult,
});

const chromeBinary = findChrome();
const detectedChromeVersion = chromeVersion(chromeBinary);
const server = createServer(serveFile);
const port = await listen(server);

let browserBaselinePayload;
let browserPerturbPayload;
try {
  const baseUrl = `http://127.0.0.1:${port}/public/foundation-q1b/index.html`;
  const baseline = await runChrome(chromeBinary, baseUrl);
  browserBaselinePayload = parseBrowserPayload(baseline.dom, baseline.stderr);
  const perturb = await runChrome(chromeBinary, `${baseUrl}?perturb=1`);
  browserPerturbPayload = parseBrowserPayload(perturb.dom, perturb.stderr);
} finally {
  await closeServer(server);
}

writeEvidence("chromium", {
  chromeBinary,
  chromeVersion: detectedChromeVersion,
  ...browserBaselinePayload,
});
writeEvidence("chromium-perturb", {
  chromeBinary,
  chromeVersion: detectedChromeVersion,
  ...browserPerturbPayload,
});

const browserResult = browserBaselinePayload.result;
const perturbResult = browserPerturbPayload.result;
const fieldsMatch = JSON.stringify(nodeResult.fields) === JSON.stringify(browserResult.fields);
const exactRuntimeDifference = fieldsMatch ? firstTraceDifference(nodeResult, browserResult) : {
  boundaryTick: 0,
  field: "field-layout",
};
const perturbDifference = firstTraceDifference(nodeResult, perturbResult);
const coupledPass = nodeResult.maxPropDisplacement > 0.05 && browserResult.maxPropDisplacement > 0.05;
const exactRuntimePass = fieldsMatch && exactRuntimeDifference === null;
const perturbationPass = perturbDifference?.boundaryTick === Q1B_EXPECTED_PERTURB_BOUNDARY;
const pass = coupledPass && exactRuntimePass && perturbationPass;

const summary = {
  revision: nodeResult.revision,
  generatedAt: new Date().toISOString(),
  provenance: {
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  packageContract: {
    name: packageJson.name,
    version: packageJson.version,
    nodeImport: "box3d.js/inline",
    browserImport: "/node_modules/box3d.js/dist/box3d.inline.mjs",
  },
  runtimes: {
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      box3dVersion: nodeResult.box3dVersion,
    },
    chromium: {
      binary: chromeBinary,
      version: detectedChromeVersion,
      userAgent: browserBaselinePayload.runtime.userAgent,
      platform: browserBaselinePayload.runtime.platform,
      box3dVersion: browserResult.box3dVersion,
    },
  },
  coupledScene: {
    pass: coupledPass,
    nodeMaxPropDisplacement: nodeResult.maxPropDisplacement,
    chromiumMaxPropDisplacement: browserResult.maxPropDisplacement,
  },
  nodeVsChromium: {
    pass: exactRuntimePass,
    comparedBoundaryTicks: Math.min(nodeResult.trace.length, browserResult.trace.length),
    fieldsMatch,
    firstDivergence: exactRuntimeDifference,
  },
  chromiumEvidencePathSensitivity: {
    pass: perturbationPass,
    perturbedTargetTick: 90,
    expectedFirstDivergentBoundary: Q1B_EXPECTED_PERTURB_BOUNDARY,
    firstDivergence: perturbDifference,
  },
  verdict: pass ? "Q1B_PASS_NODE_CHROMIUM_RUNTIME_ENVELOPE" : "Q1B_FAIL",
  nonClaim: "Q1b does not qualify Android/ARM, other browser engines, Cloudflare Worker runtime, reconnect/persistence or production synchronization architecture.",
};

writeEvidence("summary", summary);
console.log(`${summary.revision} · ${summary.verdict}`);
console.log(`Node↔Chromium exact trace: ${exactRuntimePass ? "IDENTICAL" : `DIVERGED@${exactRuntimeDifference?.boundaryTick ?? "unknown"}`}`);
console.log(`coupled displacement node=${nodeResult.maxPropDisplacement.toFixed(6)}m chromium=${browserResult.maxPropDisplacement.toFixed(6)}m`);
console.log(`Chromium perturb control: ${perturbDifference ? `DIVERGED@${perturbDifference.boundaryTick} ${perturbDifference.field}` : "NO DIVERGENCE"}`);
console.log(`runtime: ${process.version} ${process.platform}/${process.arch} ↔ ${detectedChromeVersion}`);
if (!pass) process.exitCode = 1;
