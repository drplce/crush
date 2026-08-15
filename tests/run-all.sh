#!/usr/bin/env bash
# Goal Girls test suite. Usage: ./tests/run-all.sh [quick|full]
# quick (default) ~1 min · full runs the big sweeps (~3 min)
set -uo pipefail
cd "$(dirname "$0")"
MODE="${1:-quick}"
NODE="${NODE:-node}"
FAIL=0

run() { printf '%-34s ' "$1"; shift; if out=$("$@" 2>&1); then
    echo "$out" | grep -oE "([0-9]+ passed, [0-9]+ failed|[0-9]+/[0-9]+ (scenarios hold|hold)|Invariants held: [0-9]+/[0-9]+)" | tail -1
  else echo "FAILED"; echo "$out" | tail -15; FAIL=1; fi; }

echo "── App (browser-driven, real build) ─────────────────"
for f in app/*.mjs; do [ "$(basename "$f")" = "_boot.mjs" ] && continue; run "$(basename "$f" .mjs)" "$NODE" "$f"; done

echo
echo "── Engine model (headless) ──────────────────────────"
run "edge (70 hand-built cases)"   "$NODE" engine/edge.mjs
run "goalie opt-out"               "$NODE" engine/goalie.mjs
if [ "$MODE" = "full" ]; then
  run "fuzz (8000 random games)"   "$NODE" engine/fuzz.mjs 8000
  run "stress (1500 matches)"      "$NODE" engine/stress.mjs 1500
  run "expanded sweep (7500)"      "$NODE" engine/stress2.mjs 7500
else
  run "fuzz (2000 random games)"   "$NODE" engine/fuzz.mjs 2000
  run "stress (400 matches)"       "$NODE" engine/stress.mjs 400
  run "expanded sweep (1000)"      "$NODE" engine/stress2.mjs 1000
fi

echo
[ $FAIL -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $FAIL
