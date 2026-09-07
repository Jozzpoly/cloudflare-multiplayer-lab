# World V0 — R0d Reliability Remote Evidence Manifest

Status: **PRESERVED DIGEST / FINAL REMOTE RUN 34060903778**  
Prepared: **2026-09-07**

This document preserves the identity and key exact outputs of the final isolated R0d reliability workflow artifact without committing the 1.56 MB full I3 browser trace into the handoff branch.

The original GitHub Actions artifact was created by workflow run:

`34060903778`

Artifact ID:

`9997448698`

Artifact name:

`world-v0-r0d-reliability-retest-1`

GitHub artifact retention at creation: **14 days** (expected expiry 2026-09-20).

The handoff documents and issue #8 checkpoints are the long-lived semantic evidence. This manifest provides exact file hashes so any retained/recovered artifact can be verified byte-for-byte.

---

## 1. Artifact ZIP identity

Downloaded archive filename used during closure audit:

`world-v0-r0d-reliability-retest-final.zip`

Size:

`54,384 bytes`

SHA-256:

`2a2a740d9fe3e9f87602a1704814ef824f0fb716ec8e8c79d1194e441d3942b4`

This digest matches the GitHub Actions artifact digest reported for artifact `9997448698`.

---

## 2. File manifest

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/world-v0/r0d-reliability-provenance.json` | 285 | `f31b43ae4ab7c21fad196673654903ad701774a0e273a21375cf22844b80b787` |
| `world-v0-r0d-remote-i1.log` | 1,490 | `dfe71e0327d4f73dd0d242b361096d114025544b61195b650dee82cd5dfc0dcb` |
| `world-v0-r0d-remote-i2.log` | 1,183 | `fc6194f3971a2da5f329a1aa4987ecb8aff08e61dd3a1ff143975af3cae93526` |
| `world-v0-r0d-remote-i3-attempt-1.json` | 1,563,604 | `35e2780f2b3e1f4bee8c81961a4277e379442c29ade137584a837dcc0325516e` |
| `world-v0-r0d-remote-i3-attempt-1.log` | 6,977 | `0bb1c57a1a29491ee7121cbf0a8ab4f3a55b0333480e490a7da6a9ad80789f94` |
| `world-v0-r0d-remote-i3-campaign-summary.json` | 919 | `0227bb1fc1f1ef956f676843622b6c8b8cae6816f12463ad0c1a3942e09f3466` |
| `world-v0-r0d-remote-i4b-authority.log` | 1,333 | `641517f1aa358f73250afb41f08144f62da81f9c4ef38fbd60fec046b607fce6` |
| `world-v0-r0d-remote-i4b-browser.json` | 1,697 | `c488f3389384fdd2bd0ff12a86c13e9a550d991ed32e7611a57d3c89c044fe14` |
| `world-v0-r0d-remote-i4b-browser.log` | 1,801 | `7c485c4510ca6a5ef29384a2241afba07cafc8344c693540345135808e9cdb9b` |

---

## 3. Exact deployed provenance payload

The artifact contained:

```json
{
  "purpose": "r0d-reliability-retest",
  "qualifiedSourceSha": "a2e821afbbc88371b033af311cc6882d46aa6916",
  "deliverySha": "7da9ddd4ad37221f63a3cd418a140824783480ec",
  "worker": "cloudflare-multiplayer-lab-reliability-play",
  "simBuildId": "shared-yard-v0-sim-888e471bc211091e"
}
```

This is the exact provenance identity expected by the handoff.

---

## 4. Exact I1 result summary

Artifact verdict:

`WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS`

Exact measured fields retained in the final log:

```text
run = r0d-ci-i1-34060903778-1
oldEpoch = bba21799-c335-428f-8f36-bead85e0ac22
replacementEpoch = 38c1af57-62d0-4e5f-b831-f9a890cf13c4
dropObservationBoundary = 91
lastFreshBoundary = 98
staleBoundary = 134
preauthoredTailTicks = 7
leaseAfterLastFreshTicks = 36
sessionId = d27a5bc0-4cf0-427a-9443-dab7e6771a9c
netEntityId = actor:1
resumeCount = 2
sameIdentityAcrossRebinds = true
oldSocketCanonicalSentinelRejected = true
healthyPeerSurvivedSingleDrop = true
worldEpochPreservedAcrossSingleDrop = true
resumedCanonicalInputObserved = true
oldEpochRetiredAfterAllConnectionsLost = true
freshEpochCreatedAfterCleanup = true
```

Important interpretation preserved by the probe itself: the 36-tick lease is measured from the **last canonical fresh record**, not from local socket-close time, because already-authored future records remain in the authority buffer.

---

## 5. Exact I2 result summary

Artifact verdict:

`WORLD_V0_INTEGRATION_I2_REAL_DO_WEBSOCKET_PASS`

Exact retained fields:

```text
run = r0d-ci-i2-34060903778-1
worldEpoch = dd4b29f2-724a-4e5d-b5a1-1fa748334ba3
simBuildId = shared-yard-v0-sim-888e471bc211091e
protocolRevision = shared-yard-v0-scheduled-input-v3-supersession
targetTick = 111
initialSeq = 6
revisedSeq = 7
duplicateSeq = 8
lateSeq = 9
latestUnconsumedFutureWon = true
staleBatchCouldNotRewind = true
consumedHistoryImmutable = true
oneShotJumpPreserved = true
acceptedRelayed = true
supersededRelayed = true
duplicateNotRelayed = true
staleNotRelayed = true
lateNotRelayed = true
```

---

## 6. Exact I3 clean-campaign summary

Artifact verdict:

`WORLD_V0_I3B_CLEAN_CAMPAIGN_PASS`

Campaign summary:

```json
{
  "revision": "world-v0-i3b-clean-campaign-v3-success-recovery-attribution",
  "base": "https://cloudflare-multiplayer-lab-reliability-play.jozzpoly.workers.dev",
  "freezeMs": 1200,
  "requiredClean": 1,
  "maxAttempts": 4,
  "clean": 1,
  "crossContractInvalid": 0,
  "postFreezeDrainInvalid": 0,
  "attempts": [
    {
      "attempt": 1,
      "verdict": "CLEAN_PASS",
      "exitCode": 0,
      "freezeContractProven": true,
      "recoveryEvents": []
    }
  ],
  "verdict": "WORLD_V0_I3B_CLEAN_CAMPAIGN_PASS"
}
```

The full `world-v0-r0d-remote-i3-attempt-1.json` trace is deliberately not duplicated in git; its exact size and SHA-256 are preserved above.

---

## 7. Exact I4b authority result

Artifact verdict:

`WORLD_V0_INTEGRATION_I4B_AUTHORITY_EXACT_REBASE_PASS`

Retained fields:

```text
dropBoundary = 91
leaseExpiredBoundary = 136
seed/rebaseBoundary = 141
gapTicks = 50
sessionId = 152da3b5-3533-4efb-b1ed-58205d42db20
sameAcrossRebind = true
resumeCount = 1
resumeLastBatchSeq = 5
crossedClientHistory = true
crossedInputLease = true
rawSeed.byteLength = 30169
rawSeed.fnv1a32 = 3ee70390
checksumExact = true
exactF32Guard = true
resumedFreshBoundary = 150
```

---

## 8. Exact I4b real-Chromium result

Artifact verdict:

`WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS`

Exact final JSON:

```json
{
  "revision": "world-v0-integration-i4b-real-chromium-rebase-v2-targeted-outage",
  "runKey": "i4b-tqbl56u",
  "chromeVersion": "Google Chrome 152.0.7977.64",
  "offlineMs": 1500,
  "simBuildId": "shared-yard-v0-sim-888e471bc211091e",
  "worldEpoch": "e882067c-835b-42f2-983f-8b386ded8b56",
  "actorSession": {
    "before": "930ae099-8a63-4c39-b8f7-80f02cbbc740",
    "after": "930ae099-8a63-4c39-b8f7-80f02cbbc740",
    "preserved": true,
    "netEntityPreserved": true
  },
  "gap": {
    "sourceBoundary": 219,
    "healthyPeerBoundaryDuringGap": 318,
    "rebaseBoundary": 389,
    "gapTicks": 170,
    "historyRetainTicks": 24,
    "inputLeaseMissingTicks": 36
  },
  "seed": {
    "bytes": 30045,
    "fnv1a32": "06a343c5"
  },
  "exactness": {
    "rebaseCount": 1,
    "guardMatchesBefore": 32,
    "guardMatchesAfter": 40,
    "guardMismatches": 0,
    "firstStateMismatch": null
  },
  "incidentalRecovery": {
    "authoritySilenceResumes": 1,
    "latestRebaseBoundary": 389,
    "latestRebaseGapTicks": 170
  },
  "healthyPeer": {
    "boundaryAfter": 428,
    "runtimeFailed": false,
    "guardMismatches": 0
  },
  "verdict": "WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS"
}
```

---

## 9. Evidence boundary

This manifest preserves exact remote machine evidence identity. It does **not** upgrade the machine gate into the missing Owner human verdict.

The unresolved next evidence remains the real two-person/device R0d reliability re-test described in:

- `MULTI_WORLD_CURRENT_STATE.md`;
- `WORLD_V0_R0D_RELIABILITY_RETEST_HANDOFF.md`;
- `MULTI_WORLD_FRESH_TAKEOVER_V2.md`.

Do not regenerate machine evidence simply because the original artifact expires if the live source/delivery heads and repo-native checkpoints remain unchanged. Re-run only if a material contradiction or new candidate makes fresh evidence necessary.
