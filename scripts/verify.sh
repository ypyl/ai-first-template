#!/usr/bin/env bash
# Runs the whole machine check in one place: the invariants in
# scripts/check-change.sh, then the lint, build, and test commands declared in
# Project facts in AGENTS.md.
#
#   bash scripts/verify.sh
#
# Add a project check here, not in the pre-commit hook. The hook runs only the
# fast half, so a commit stays cheap; this script is what a release candidate
# and a hosted runner execute.
#
# Exit status: 0 when everything passed, 1 when anything failed. A step that
# Project facts does not declare is skipped and reported as skipped.

set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

status=0

fact() {
  sed -n "s/^- $1:[[:space:]]*//p" AGENTS.md 2>/dev/null | head -1
}

run() {
  local label=$1 cmd=$2
  printf '\n==> %s: %s\n' "$label" "$cmd"
  bash -c "$cmd" || { printf '  FAIL %s\n' "$label"; status=1; }
}

bash scripts/check-change.sh || status=1

if command -v node >/dev/null 2>&1 && [[ -f scripts/gate.test.mjs ]]; then
  run "Gate page" "node --test scripts/gate.test.mjs"
else
  printf '
==> Gate page: node or the test file is missing, skipped
'
fi

for step in Lint Build Test; do
  cmd=$(fact "$step")
  if [[ -z "$cmd" ]]; then
    printf '\n==> %s: not declared in Project facts, skipped\n' "$step"
  else
    run "$step" "$cmd"
  fi
done

printf '\n'
if [[ $status -eq 0 ]]; then
  printf 'verify: all checks passed\n'
else
  printf 'verify: failures above\n'
fi
exit $status
