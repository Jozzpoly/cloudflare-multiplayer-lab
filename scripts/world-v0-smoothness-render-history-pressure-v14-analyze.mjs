import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] || "world-v0-smoothness-history-pressure-v14-analysis.json";
if (!input) throw new Error("usage: node world-v0-smoothness-render-history-pressure-v14-analyze.mjs <capture.json> [output.json]");

const source = JSON.parse(readFileSync(input, "utf8"));
const hp = source.historyPressureV14 || {};
const mode = String(hp.mode || "unknown");
const episodes = Array.isArray(hp.episodes) ? hp.episodes : [];
const closedEpisodes = episodes.filter((entry) => entry && entry.active !== true && Number.isFinite(entry.durationMs));
const activeEpisodes = episodes.filter((entry) => entry?.active === true);
const durations = closedEpisodes.map((entry) => Number(entry.durationMs)).filter(Number.isFinite);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function summary(values) {
  const clean = values.filter(Number.isFinite);
  return {
    count: clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: clean.length ? Math.max(...clean) : 0,
    min: clean.length ? Math.min(...clean) : 0,
    mean: clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0,
  };
}

const rawPeerErrors = Array.isArray(source.apparatus?.rawPeer?.errors) ? source.apparatus.rawPeer.errors : [];
const pressureFrames = Number(hp.pressureFrames || 0);
const observations = Number(hp.observations || 0);
const pressureRatio = Number(hp.pressureRatio || 0);
const maxSilenceTicks = Number(hp.maxSilenceTicks || 0);
const safeBlindTicks = Number(hp.minSafeBlindTicks);
const resumeDelta = Number(source.authoritySilenceResumeDelta || 0);
const guardMismatchDelta = Number(source.guardMismatchDelta || 0);
const pressureReachedThreshold = pressureFrames > 0 && Number.isFinite(safeBlindTicks) && maxSilenceTicks >= safeBlindTicks;

const common = {
  recognizedMode: mode === "baseline" || mode === "freeze",
  latencyPressureConfigured: Number(source.requestedLatencyMs) >= 400,
  observationsPresent: observations > 0,
  historyPressureObserved: pressureReachedThreshold,
  exactnessPreserved: guardMismatchDelta === 0,
  rawPeerProtocolClean: rawPeerErrors.length === 0,
};

const modeSpecific = mode === "baseline"
  ? {
      baselineTriggeredResume: resumeDelta > 0,
    }
  : mode === "freeze"
    ? {
        freezeAvoidedResume: resumeDelta === 0,
        freezeRecoveredWithoutSessionReset: closedEpisodes.length > 0,
        freezeDidNotRemainPermanentlyStuck: activeEpisodes.length === 0 || pressureRatio < 1,
      }
    : { invalidMode: false };

const comparable = Object.values(common).every(Boolean);
const modePass = comparable && Object.values(modeSpecific).every(Boolean);

const result = {
  revision: "world-v0-smoothness-history-pressure-v14-analysis-v1",
  sourceRevision: source.revision ?? null,
  status: "test-only history-pressure semantics characterization; distinguishes retained-history pressure from ActorSession transport loss",
  mode,
  requestedLatencyMs: source.requestedLatencyMs ?? null,
  stressMs: source.stressMs ?? null,
  exactness: {
    guardMismatchDelta,
    correctionDelta: source.correctionDelta ?? null,
    serverLateDelta: source.serverLateDelta ?? null,
    authoritySilenceResumeDelta: resumeDelta,
  },
  pressure: {
    observations,
    pressureFrames,
    pressureRatio,
    maxSilenceTicks,
    safeBlindTicks: Number.isFinite(safeBlindTicks) ? safeBlindTicks : null,
    episodes: episodes.length,
    closedEpisodes: closedEpisodes.length,
    activeEpisodes: activeEpisodes.length,
    closedEpisodeDurationMs: summary(durations),
    longestEpisodes: [...episodes]
      .filter((entry) => Number.isFinite(entry?.durationMs))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 8),
  },
  apparatus: {
    rawPeerSuperseded: source.apparatus?.rawPeer?.superseded ?? null,
    rawPeerErrors,
    cadence: source.cadence ?? null,
    sampleCount: source.sampleCount ?? null,
  },
  signature: { ...common, ...modeSpecific },
  verdict: modePass
    ? (mode === "baseline" ? "HISTORY_PRESSURE_BASELINE_RESUME_REPRODUCED" : "HISTORY_PRESSURE_FREEZE_SEMANTICS_CHARACTERIZED")
    : "HISTORY_PRESSURE_V14_NOT_COMPARABLE",
};

writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(result.verdict);
if (!modePass) process.exitCode = 1;
