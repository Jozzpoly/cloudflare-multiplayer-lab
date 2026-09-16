#!/usr/bin/env bash
set -euo pipefail

TEST_CASE="${1:?usage: world-v0-smoothness-v20-isolated-gate.sh <case> [base]}"
BASE="${2:-http://127.0.0.1:8787}"
RUN_ID="${GITHUB_RUN_ID:-local}"

case "$TEST_CASE" in
  product)
    MW_WORLD_V0_ONGOING_BASE="$BASE" MW_WORLD_V0_ONGOING_OUTPUT=world-v0-v20-product.json \
      timeout 110s node scripts/world-v0-ongoing-yard-product-chromium.mjs | tee world-v0-v20-product.log
    grep -q 'WORLD_V0_ONGOING_YARD_PUBLIC_FLOW_PASS' world-v0-v20-product.log
    ;;

  i1)
    MW_WORLD_V0_I1_BASE="$BASE" MW_WORLD_V0_I1_RUN="v20-i1-${RUN_ID}" \
      node scripts/world-v0-integration-i1-lifecycle-probe.mjs | tee world-v0-v20-i1.log
    grep -q 'WORLD_V0_INTEGRATION_I1_SERVER_SESSION_PASS' world-v0-v20-i1.log
    grep -q '"oldEpochPreservedAt1800msAllDisconnected": true' world-v0-v20-i1.log
    grep -q '"oldEpochRetiredAfterGrace": true' world-v0-v20-i1.log
    ;;

  waiting-room)
    MW_WORLD_V0_WAITING_DROP_BASE="$BASE" MW_WORLD_V0_WAITING_DROP_OUTPUT=world-v0-v20-waiting.json \
      timeout 60s node scripts/world-v0-closure-waiting-room-drop-audit.mjs | tee world-v0-v20-waiting.log
    grep -q 'WORLD_V0_CLOSURE_WAITING_ROOM_FAIL_CLOSED_PASS' world-v0-v20-waiting.log
    ;;

  uncommitted-ready)
    MW_WORLD_V0_UNCOMMITTED_READY_BASE="$BASE" MW_WORLD_V0_UNCOMMITTED_READY_OUTPUT=world-v0-v20-uncommitted.json \
      timeout 90s node scripts/world-v0-closure-uncommitted-ready-audit.mjs | tee world-v0-v20-uncommitted.log
    grep -q 'WORLD_V0_CLOSURE_UNCOMMITTED_READY_RECOVERY_PASS' world-v0-v20-uncommitted.log
    ;;

  prestart-partial)
    MW_WORLD_V0_PRESTART_PARTIAL_BASE="$BASE" MW_WORLD_V0_PRESTART_PARTIAL_OUTPUT=world-v0-v20-prestart-partial.json \
      timeout 45s node scripts/world-v0-closure-prestart-partial-resume-audit.mjs | tee world-v0-v20-prestart-partial.log
    grep -q 'WORLD_V0_CLOSURE_PRESTART_PARTIAL_RESUME_GATE_PASS' world-v0-v20-prestart-partial.log
    ;;

  prestart-grace)
    MW_WORLD_V0_PRESTART_GRACE_BASE="$BASE" MW_WORLD_V0_PRESTART_GRACE_OUTPUT=world-v0-v20-prestart-grace.json \
      timeout 45s node scripts/world-v0-closure-prestart-grace-probe.mjs | tee world-v0-v20-prestart-grace.log
    grep -q 'WORLD_V0_CLOSURE_PRESTART_AMBIGUITY_GRACE_PASS' world-v0-v20-prestart-grace.log
    ;;

  start-window)
    MW_WORLD_V0_START_WINDOW_BASE="$BASE" MW_WORLD_V0_START_WINDOW_OUTPUT=world-v0-v20-start-window.json \
      timeout 90s node scripts/world-v0-closure-start-window-audit.mjs | tee world-v0-v20-start-window.log
    grep -q 'WORLD_V0_CLOSURE_START_WINDOW_BROWSER_RECOVERY_PASS' world-v0-v20-start-window.log
    ;;

  cross-page)
    MW_WORLD_V0_CROSS_PAGE_BASE="$BASE" MW_WORLD_V0_CROSS_PAGE_ROOM=yard-3 MW_WORLD_V0_CROSS_PAGE_OUTPUT=world-v0-v20-cross-page.json \
      timeout 90s node scripts/world-v0-cross-page-resume-browser-audit.mjs | tee world-v0-v20-cross-page.log
    grep -q 'WORLD_V0_CROSS_PAGE_RESUME_PASS' world-v0-v20-cross-page.log
    node -e 'const e=require("./world-v0-v20-cross-page.json"); if(e.original?.worldEpoch!==e.peerAfter?.worldEpoch) throw new Error("WorldEpoch drift"); if(e.original?.actorSessionId!==e.peerAfter?.actorSessionId) throw new Error("ActorSession drift"); if(e.original?.netEntityId!==e.peerAfter?.netEntityId) throw new Error("NetEntity drift"); if(e.peerAfter?.guardMismatches!==0||e.ownerAfter?.guardMismatches!==0) throw new Error("exact-state regression");'
    ;;

  all-drop)
    MW_WORLD_V0_ALL_DROP_BASE="$BASE" MW_WORLD_V0_ALL_DROP_DELAYS=500,1500,5000,11000,14500,19000,21000 \
      node scripts/world-v0-closure-all-drop-window-probe.mjs | tee world-v0-v20-all-drop.log
    grep -q 'WORLD_V0_CLOSURE_ALL_DROP_WINDOW_MAPPED' world-v0-v20-all-drop.log
    for delay in 500 1500 5000 11000 14500 19000; do
      grep -E "WORLD_V0_ALL_DROP_CASE .*\"delayMs\":${delay}.*\"classification\":\"preserved\"" world-v0-v20-all-drop.log >/dev/null
    done
    grep -E 'WORLD_V0_ALL_DROP_CASE .*"delayMs":21000.*"classification":"retired"' world-v0-v20-all-drop.log >/dev/null
    ;;

  i4b)
    MW_WORLD_V0_I4B_BASE="$BASE" \
      node --experimental-strip-types scripts/world-v0-integration-i4b-authority-probe.mjs | tee world-v0-v20-i4b-authority.log
    MW_WORLD_V0_I4B_BASE="$BASE" MW_WORLD_V0_I4B_OFFLINE_MS=14000 MW_WORLD_V0_I4B_OUTPUT=world-v0-v20-i4b.json \
      node --experimental-strip-types scripts/world-v0-integration-i4b-chromium-rebase-audit.mjs | tee world-v0-v20-i4b.log
    grep -q 'WORLD_V0_INTEGRATION_I4B_AUTHORITY_EXACT_REBASE_PASS' world-v0-v20-i4b-authority.log
    grep -q 'WORLD_V0_INTEGRATION_I4B_REAL_CHROMIUM_EXACT_REBASE_PASS' world-v0-v20-i4b.log
    node -e 'const e=require("./world-v0-v20-i4b.json"); if(e.actorSession?.preserved!==true||e.actorSession?.netEntityPreserved!==true) throw new Error("ActorSession identity regression"); if(e.exactness?.guardMismatches!==0) throw new Error("exact-state regression");'
    ;;

  dual-browser)
    MW_WORLD_V0_DUAL_BROWSER_BASE="$BASE" MW_WORLD_V0_DUAL_BROWSER_OFFLINE_MS=14500 MW_WORLD_V0_DUAL_BROWSER_OUTPUT=world-v0-v20-dual.json \
      timeout 90s node --experimental-strip-types scripts/world-v0-closure-dual-browser-grace-audit.mjs | tee world-v0-v20-dual.log
    grep -q 'WORLD_V0_CLOSURE_DUAL_BROWSER_GRACE_PASS' world-v0-v20-dual.log
    node -e 'const e=require("./world-v0-v20-dual.json"); if(!Array.isArray(e.clients)||e.clients.length!==2) throw new Error("dual recovery missing clients"); if(e.clients.some(c=>c.guardMismatches!==0)) throw new Error("dual exact-state regression");'
    ;;

  human-entry)
    MW_WORLD_V0_HUMAN_ENTRY_BASE_URL="$BASE" MW_WORLD_V0_HUMAN_ENTRY_OUTPUT=world-v0-v20-human.json \
      timeout 90s node scripts/world-v0-human-entry-browser-smoke.mjs | tee world-v0-v20-human.log
    grep -q 'WORLD_V0_HUMAN_ENTRY_PASS' world-v0-v20-human.log
    node -e 'const e=require("./world-v0-v20-human.json"); if(e.peerTabCloseFreshReopenRejectedTruthfully!==true) throw new Error("foreign-profile truth regression"); if(e.healthyOwnerWorldEpochPreservedAcrossPeerReopen!==true) throw new Error("healthy owner continuity regression");'
    ;;

  *)
    echo "Unknown V20 isolated gate: $TEST_CASE" >&2
    exit 2
    ;;
esac

echo "WORLD_V0_V20_ISOLATED_GATE_PASS case=${TEST_CASE}"
