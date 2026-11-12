#!/usr/bin/env bash
# Checks the rules this repository claims a machine enforces. It needs bash, git,
# and the text tools Git for Windows and any Unix-like shell ship, including the
# bash 3.2 that macOS still runs: grep, sed, awk, sort, tr, head, cat, cut, find,
# and dirname. `git config core.hooksPath .githooks` installs the
# pre-commit hook that runs it, once per clone.
#
#   bash scripts/check-change.sh
#
# Exit status: 0 when every check passes, 1 when any check fails. Warnings
# never change the exit status.

set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

failures=()
warnings=()

section() { printf '\n==> %s\n' "$*"; }
bad() { failures+=("$1"); printf '  FAIL %s\n' "$1"; }
warn() { warnings+=("$1"); printf '  WARN %s\n' "$1"; }
ok() { printf '  ok   %s\n' "$*"; }

# --- changelog --------------------------------------------------------------

section "Changelog"
if [[ ! -f CHANGELOG.md ]]; then
  bad "CHANGELOG.md is missing"
elif ! grep -qx '## Unreleased' CHANGELOG.md; then
  bad "CHANGELOG.md has no '## Unreleased' heading, so there is nowhere to record what the next release carries"
else
  ok "CHANGELOG.md carries an Unreleased heading; the release renames it"
fi

# --- contract documents ----------------------------------------------------

section "Contract documents"
for doc in AGENTS.md REPO-FACTS.md CONVENTIONS.md adr/README.md; do
  if [[ -f "$doc" ]]; then
    ok "$doc"
  else
    bad "$doc is referenced by AGENTS.md but missing"
  fi
done

# --- change metadata -------------------------------------------------------

section "Change metadata"
shopt -s nullglob
changefiles=(openspec/changes/*/.openspec.yaml openspec/changes/archive/*/.openspec.yaml)
if [[ ${#changefiles[@]} -eq 0 ]]; then
  ok "no change folders yet"
fi
# Bash 3.2, which macOS still ships, treats an empty array as unset under
# `set -u`, so the expansion is guarded instead of bare.
for meta in ${changefiles[@]+"${changefiles[@]}"}; do
  dir=$(dirname "$meta")
  level=$(sed -n 's/^x-level:[[:space:]]*//p' "$meta" | tr -d "\"'[:space:]")
  skip=$(sed -n 's/^skip_specs:[[:space:]]*//p' "$meta" | tr -d "\"'[:space:]")
  case "$level" in
    L0|L1|L2|L3) ;;
    "") bad "$dir: no x-level in .openspec.yaml" ; continue ;;
    *) bad "$dir: x-level '$level' is not L0, L1, L2, or L3" ; continue ;;
  esac
  if [[ "$dir" != *"/archive/"* && -f "$dir/proposal.md" ]]; then
    firstline=$(head -n 1 "$dir/proposal.md" 2>/dev/null)
    if ! grep -qE '(^|[^[:alnum:]])L[0-3]([^[:alnum:]]|$)' <<< "$firstline"; then
      bad "$dir: the first line of proposal.md names no level (L0-L3), so the record and .openspec.yaml can drift"
    fi
  fi
  if [[ "$level" == "L0" && "$skip" != "true" ]]; then
    bad "$dir: L0 must set skip_specs: true"
  fi
  if [[ "$level" =~ ^L[23]$ && -f "$dir/proposal.md" ]]; then
    if ! grep -qi 'adr/' "$dir/proposal.md"; then
      bad "$dir: $level proposal does not link an ADR"
    fi
  fi
  if [[ "$dir" != *"/archive/"* && -f "$dir/proposal.md" ]]; then
    for heading in '## Why' '## What Changes'; do
      grep -qxF "$heading" "$dir/proposal.md" \
        || bad "$dir: proposal.md has no '$heading' section; openspec accepts it, archive then fails"
    done
    grep -qxF '## Routing' "$dir/proposal.md" \
      || bad "$dir: proposal.md has no '## Routing' section, so the four routing answers have no home"
  fi
  if [[ "$dir" == *"/archive/"* && "$level" != "L0" && -f "$dir/proposal.md" ]]; then
    if ! grep -qx '## Approval' "$dir/proposal.md" || ! grep -q '^- Artifact: ' "$dir/proposal.md"; then
      bad "$dir: archived $level change has no recorded approval; gate it and record the hashes before archiving"
    fi
  fi
  if [[ "$dir" == *"/archive/"* && ( "$level" == "L2" || "$level" == "L3" ) && -f "$dir/proposal.md" ]]; then
    grep -qE '^- Artifact: adr/[0-9]{4}-.* sha256:' "$dir/proposal.md" \
      || bad "$dir: archived $level change has no approved ADR; the decision gate was not recorded"
    if [[ -d "$dir/specs" ]] && find "$dir/specs" -name '*.md' -print -quit | grep -q .; then
      grep -qE '^- Artifact: .*/specs/.*\.md sha256:' "$dir/proposal.md" \
        || bad "$dir: archived $level change has no approved delta spec; gate the spec after the ADR"
    fi
  fi
  if [[ "$level" == "L3" && "$dir" == *"/archive/"* ]]; then
    for artifact in rehearsal.md rollback.md reconciliation.md; do
      [[ -f "$dir/$artifact" ]] || bad "$dir: L3 archive is missing $artifact"
    done
  fi
  ok "$dir: $level"
done

# --- approval record --------------------------------------------------------

section "Approval"
if ! command -v node >/dev/null 2>&1 || [[ ! -f scripts/gate.mjs ]]; then
  warn "node or scripts/gate.mjs is missing, so approved artifacts were not compared with their hashes"
else
  approved=0
  for meta in "${changefiles[@]}"; do
    dir=$(dirname "$meta")
    [[ -f "$dir/proposal.md" ]] || continue
    grep -q '^- Artifact:' "$dir/proposal.md" || continue
    approved=$((approved + 1))
    name=${dir##*/}
    name=${name#????-??-??-}
    if out=$(node scripts/gate.mjs "$name" --verify 2>&1); then
      ok "$dir: approved artifacts still match their hashes"
    else
      while IFS= read -r line; do
        [[ -n "$line" ]] && bad "$dir: ${line#FAIL }"
      done <<< "$out"
    fi
  done
  if [[ $approved -eq 0 ]]; then
    ok "no approval names an artifact hash yet"
  fi
fi

# --- specs -----------------------------------------------------------------

# A scenario's test is a line in the project's own code that contains the title.
# Documentation, specs, and the process files the template owns do not count: the
# gate's fixtures carry example scenario titles, and a title that only appears in
# a fixture has no test behind it. One pass over the tree collects every code
# line that carries any known title, and each title is then looked up in that
# corpus: a walk of the tree per commit, not a walk per title.
section "Specs"
corpus=.tmp/check-change-corpus
patterns=.tmp/check-change-titles
durable_all=.tmp/check-change-durable
durable_pairs=.tmp/check-change-durable-pairs
removed_reqs=.tmp/check-change-removed-reqs
removed_titles=.tmp/check-change-removed-titles
to_test=.tmp/check-change-to-test
mkdir -p .tmp
# A requirement an active change removes still sits in the durable spec until
# the archive merges the delta, so its scenario titles outlive the tests the
# change deletes. The delta's `## REMOVED Requirements` heading is what says so.
: > "$removed_reqs"
: > "$removed_titles"

durable_titles=""
if [[ ! -d openspec/specs ]]; then
  ok "openspec/specs does not exist yet"
else
  rendering=$(grep -rEn '(^|[^[:alnum:]_])[0-9]+px([^[:alnum:]_]|$)|class=|fill=|var\(' openspec/specs 2>/dev/null)
  if [[ -n "$rendering" ]]; then
    while IFS= read -r hit; do bad "spec describes rendering, not behavior: $hit"; done <<< "$rendering"
  else
    ok "no rendering detail in the durable specs"
  fi

  durable_titles=$(grep -rh '^#### Scenario:' openspec/specs 2>/dev/null | sed 's/^#### Scenario:[[:space:]]*//')
  printf '%s\n' "$durable_titles" | sed '/^[[:space:]]*$/d' | sort -u > "$durable_all"
  # Each durable scenario paired with the requirement it sits under, so a
  # removal can name the requirement and take its scenarios with it.
  while IFS= read -r specfile; do
    awk '
      /^### Requirement:/ { r = $0; sub(/^### Requirement:[[:space:]]*/, "", r) }
      /^#### Scenario:/ { t = $0; sub(/^#### Scenario:[[:space:]]*/, "", t); printf "%s\t%s\n", r, t }
    ' "$specfile"
  done < <(find openspec/specs -type f -name 'spec.md' -print 2>/dev/null) > "$durable_pairs"
  if [[ -n "$durable_titles" ]]; then
    duplicates=$(printf '%s\n' "$durable_titles" | sort | uniq -d)
    if [[ -n "$duplicates" ]]; then
      while IFS= read -r title; do bad "duplicate scenario title: $title"; done <<< "$duplicates"
    fi
  else
    ok "no scenarios yet"
  fi
fi

# A change's delta spec becomes the durable spec at archive. Rendering detail in
# it is wrong the moment it is written, and after the gate the only honest repair
# is a re-gate, so it fails here. A missing test is expected until apply writes
# one: that is a warning while the change is active, and a failure once the spec
# is durable, which is the block above.
deltas=0
delta_files=()
delta_titles=""
while IFS= read -r specfile; do
  deltas=$((deltas + 1))
  delta_files+=("$specfile")
  hits=$(grep -En '(^|[^[:alnum:]_])[0-9]+px([^[:alnum:]_]|$)|class=|fill=|var\(' "$specfile" 2>/dev/null)
  if [[ -n "$hits" ]]; then
    while IFS= read -r hit; do bad "$specfile describes rendering, not behavior: $hit"; done <<< "$hits"
  fi
  awk -v reqs="$removed_reqs" -v titles="$removed_titles" '
    /^## / { removed = ($0 ~ /^## REMOVED/); next }
    !removed { next }
    /^### Requirement:/ { s = $0; sub(/^### Requirement:[[:space:]]*/, "", s); print s >> reqs }
    /^#### Scenario:/ { s = $0; sub(/^#### Scenario:[[:space:]]*/, "", s); print s >> titles }
  ' "$specfile"
  delta_titles="$delta_titles
$(grep '^#### Scenario:' "$specfile" 2>/dev/null | sed 's/^#### Scenario:[[:space:]]*//')"
done < <(find openspec/changes -path 'openspec/changes/archive' -prune -o -type f -path '*/specs/*' -name 'spec.md' -print 2>/dev/null)
if [[ $deltas -eq 0 ]]; then
  ok "no active change carries a delta spec"
fi

if [[ -n "$durable_titles" || -n "$delta_titles" ]]; then
  printf '%s\n%s\n' "$durable_titles" "$delta_titles" | sed '/^[[:space:]]*$/d' | sort -u > "$patterns"
  grep -rhiF --binary-files=without-match \
    --exclude-dir=.git --exclude-dir=.tmp --exclude-dir=node_modules \
    --exclude-dir=openspec --exclude-dir=.agents --exclude-dir=.githooks \
    --exclude-dir=.github --exclude-dir=scripts --exclude='*.md' \
    -f "$patterns" . 2>/dev/null > "$corpus"
else
  : > "$corpus"
fi
rm -f "$patterns"

# The corpus holds code lines only, so a lookup is a read of a small file.
title_has_test() { grep -qiF -- "$1" "$corpus"; }

if [[ -n "$durable_titles" ]]; then
  # A durable scenario a removal names needs no test: the change deletes the
  # test in apply, and the requirement only leaves the durable spec at archive.
  # Without this, a change that deletes a requirement cannot pass verify.sh
  # before its own archive, and its only way through is to archive first.
  if [[ -s "$removed_reqs" ]]; then
    awk -F'\t' 'NR == FNR { req[$0] = 1; next } ($1 in req) { print $2 }' \
      "$removed_reqs" "$durable_pairs" >> "$removed_titles"
  fi
  grep -vxF -f "$removed_titles" "$durable_all" > "$to_test" || :
  while IFS= read -r title; do
    [[ -z "$title" ]] && continue
    title_has_test "$title" || bad "no test contains the scenario title: $title"
  done < "$to_test"
  if ! printf '%s\n' "${failures[@]:-}" | grep -q 'scenario title'; then
    removed_count=$(grep -c . "$removed_titles")
    if [[ $removed_count -gt 0 ]]; then
      ok "$(grep -c . "$to_test") scenario titles have a test; $removed_count belong to a requirement an active change removes, so they need none until the archive deletes it"
    else
      ok "$(grep -c . "$to_test") scenario titles have a test"
    fi
  fi
fi

if [[ ${#delta_files[@]} -gt 0 ]]; then
  for specfile in "${delta_files[@]}"; do
    untested=0
    while IFS= read -r title; do
      [[ -z "$title" ]] && continue
      title_has_test "$title" || untested=$((untested + 1))
    done < <(grep '^#### Scenario:' "$specfile" 2>/dev/null | sed 's/^#### Scenario:[[:space:]]*//' | grep -vxF -f "$removed_titles")
    if [[ $untested -gt 0 ]]; then
      warn "$specfile: $untested scenario title(s) have no test yet, which is expected until apply writes them; the archive fails without them"
    fi
  done
fi
rm -f "$corpus" "$durable_all" "$durable_pairs" "$removed_reqs" "$removed_titles" "$to_test"

# --- deferred limits -------------------------------------------------------

section "Shortcut markers"
markers=$(grep -rn --exclude-dir=.git --exclude-dir=.tmp --exclude-dir=node_modules \
  --exclude-dir=.agents --exclude-dir=scripts --exclude-dir=.githooks \
  --exclude-dir=.github --exclude='*.md' 'shortcut:' . 2>/dev/null)
if [[ -z "$markers" ]]; then
  ok "no shortcut markers"
else
  missing=0
  while IFS= read -r hit; do
    body=${hit#*shortcut:}
    case "$body" in
      *,*) ;;
      *) bad "shortcut marker with no upgrade trigger: $hit" ; missing=1 ;;
    esac
  done <<< "$markers"
  [[ "$missing" -eq 0 ]] && ok "$(printf '%s\n' "$markers" | grep -c .) shortcut markers carry a trigger"
fi

# --- project facts ---------------------------------------------------------

section "Project facts"
unfilled_count=0
unfilled_list=""
fields=("Product slug" "Stack" "Toolchain" "Trunk branch" "Lint" "Build" \
        "Test" "Run" "Secrets" "Environments")
for field in "${fields[@]}"; do
  if grep -q "^- ${field}:[[:space:]]*$" AGENTS.md 2>/dev/null; then
    unfilled_count=$((unfilled_count + 1))
    unfilled_list="$unfilled_list $field"
  fi
done
if [[ $unfilled_count -gt 0 ]]; then
  warn "Project facts are unfilled:${unfilled_list}"
else
  ok "Project facts are filled in"
fi

# verify.sh runs a command fact through bash -c, which makes two shapes fail
# quietly: a backtick pair, which bash reads as a command substitution, and a
# wrapped continuation, which the reader drops after the first line. A command
# fact is one bare command on one line; notes belong in Toolchain.
for field in Lint Build Test Run; do
  value=$(sed -n "s/^- ${field}:[[:space:]]*//p" AGENTS.md 2>/dev/null | head -1)
  [[ -z "$value" ]] && continue
  if [[ "$value" == *'`'* ]]; then
    bad "$field: the command carries a backtick, so bash runs it as a substitution; write the command bare"
    continue
  fi
  extra=$(awk -v key="- ${field}:" '
    index($0, key) == 1 { seen = 1; next }
    !seen { next }
    /^[[:space:]]*$/ { exit }
    /^[[:space:]]/ { n++; next }
    { exit }
    END { print n + 0 }
  ' AGENTS.md 2>/dev/null)
  case "${extra:-0}" in
    0) ;;
    1) bad "$field: the command is wrapped onto a following line and only the first is run; keep the notes in Toolchain" ;;
    *) bad "$field: the command is wrapped onto ${extra} following lines and only the first is run; keep the notes in Toolchain" ;;
  esac
done

# --- bootstrap -------------------------------------------------------------

section "Bootstrap"
if grep -q '^A repository template for projects where a coding agent writes all the code' README.md 2>/dev/null; then
  if [[ -f adr/0001-*.md ]] || [[ $unfilled_count -gt 0 && $unfilled_count -lt ${#fields[@]} ]]; then
    warn "half bootstrapped: an ADR or Project facts say project, README is still the template's"
  else
    ok "fresh copy: bootstrap has not run yet"
  fi
else
  ok "README is the product's, so bootstrap ran"
  if [[ -z "$(sed -n 's/^- Template:[[:space:]]*//p' AGENTS.md 2>/dev/null | head -1)" ]]; then
    warn "no '- Template:' line in Project facts, so scripts/template-diff.sh cannot compare this copy with the template; record the source, the revision, and the date"
  fi
fi

# --- local gate ------------------------------------------------------------

section "Local gate"
[[ "$(git config --get core.hooksPath 2>/dev/null)" == ".githooks" ]] \
  && ok "core.hooksPath is .githooks" \
  || warn "hooks are off in this clone: git config core.hooksPath .githooks"
# Git runs a hook only when its mode in the index is 100755. Linux and macOS say
# so as a hint and commit anyway; Git for Windows runs the file regardless, so a
# copy that dropped the bit looks healthy on the machine that made it and has no
# gate anywhere else. Every file a hook or a human runs directly is checked.
while IFS= read -r entry; do
  if [[ ! -f "$entry" ]]; then
    bad "$entry is missing"
    continue
  fi
  case "$(git ls-files -s -- "$entry" | cut -d' ' -f1)" in
    100755) ok "$entry" ;;
    "") bad "$entry is not tracked, so the commit gate cannot run it" ;;
    *) bad "$entry is not executable in the index, so git skips it: git update-index --chmod=+x $entry" ;;
  esac
done < <(git ls-files -- '.githooks/pre-commit' '.githooks/commit-msg' 'scripts/*.sh')

# --- declared pipeline -----------------------------------------------------

check_pipeline() {
  local heading=$1 fields=$2 empty=$3
  local field value filled=0 missing=""
  section "$heading"
  if ! grep -Eq "^#{2,3} ${heading}$" AGENTS.md 2>/dev/null; then
    warn "AGENTS.md has no '${heading}' section, so it cannot be declared here"
    return
  fi
  for field in $fields; do
    value=$(sed -n "s/^- ${field}:[[:space:]]*//p" AGENTS.md | head -1)
    if [[ -z "$value" || "$value" == "<"* ]]; then
      missing="$missing $field"
    else
      filled=$((filled + 1))
    fi
  done
  if [[ $filled -eq 0 ]]; then
    ok "$empty"
  elif [[ -z "$missing" ]]; then
    ok "$heading is declared: $fields"
  else
    bad "$heading is half filled, missing${missing}: fill all four or none"
  fi
}

# A Trigger that starts a workflow by hand has to name one that exists and
# declares workflow_dispatch, because gh refuses the rest. A Trigger that pushes
# is the push itself and needs no check.
check_trigger() {
  local value wf base file
  value=$(sed -n 's/^- Trigger:[[:space:]]*//p' AGENTS.md 2>/dev/null | head -1)
  [[ $value =~ gh[[:space:]]+workflow[[:space:]]+run[[:space:]]+([^[:space:]]+) ]] || return 0
  wf=${BASH_REMATCH[1]}
  wf=${wf%\"}
  wf=${wf#\"}
  wf=${wf%\'}
  wf=${wf#\'}
  if [[ "$wf" == .github/workflows/* ]]; then
    file=$wf
  else
    base=${wf%.yml}
    base=${base%.yaml}
    for file in ".github/workflows/$base" ".github/workflows/$base.yml" ".github/workflows/$base.yaml"; do
      [[ -f "$file" ]] && break
    done
  fi
  if [[ ! -f "$file" ]]; then
    bad "the Trigger runs $wf, and no workflow file under .github/workflows/ matches it"
    return
  fi
  if ! grep -Eq '^[[:space:]]*workflow_dispatch[[:space:]]*:' "$file" &&
    ! grep -Eq '^on:[[:space:]]*\[.*workflow_dispatch' "$file"; then
    bad "the Trigger runs $wf by hand and $file declares no workflow_dispatch, so gh refuses it: add the trigger or write the push that starts the run"
  fi
}

check_pipeline CI "Trigger Wait Status Logs" \
  "no CI declared, so the gate is local only"
check_trigger
check_pipeline Deploy "Release Deploy Smoke Rollback" "no Deploy declared"
# A repository that ships on every push and records nothing has no written
# rollback, which is the one thing an incident needs first.
if [[ -z "$(sed -n 's/^- Deploy:[[:space:]]*//p' AGENTS.md 2>/dev/null | head -1)" ]]; then
  if compgen -G '.github/workflows/*deploy*' >/dev/null; then
    warn "a deploy workflow exists under .github/workflows/, so a merge ships; with no block, nothing records how a release is cut or rolled back"
  else
    ok "no deploy workflow either, so releases stay manual"
  fi
fi

# --- remote ----------------------------------------------------------------

section "Remote"
# The push and merge steps of the loop need somewhere to push. A project with no
# remote has not failed: it is local only until the human adds one, and then the
# first push verifies every change that already merged.
trigger=$(sed -n 's/^- Trigger:[[:space:]]*//p' AGENTS.md 2>/dev/null | head -1)
if [[ -n "$(git remote 2>/dev/null)" ]]; then
  ok "a remote is configured, so a pushed branch can get a run"
elif [[ -n "$trigger" ]]; then
  warn "the CI block is filled and this clone has no remote: the loop's push and merge steps wait until one exists, and the first push then runs CI over everything already merged"
else
  ok "no remote and no CI, so this project is local only"
fi

# --- openspec config -------------------------------------------------------

section "OpenSpec config"
if command -v openspec >/dev/null 2>&1; then
  doctor=$(openspec doctor 2>&1)
  if grep -Eq 'could not parse|could not be read as YAML' <<< "$doctor"; then
    bad "openspec/config.yaml does not parse; the CLI ignores it, so the project context never reaches an artifact"
  else
    ok "config.yaml parses and the root is healthy"
  fi
else
  warn "OpenSpec CLI not found, so config.yaml and the generated skills were not checked"
fi

# OpenSpec 2.1 stopped stamping the generated skills with their version, so the
# pin is compared with the installed CLI, and the skills with the CLI's own dry
# run: `openspec update --dry-run` names every file it would change, which is
# exactly the drift the pin exists to catch.
pinned=$(sed -n 's/^- OpenSpec CLI:[[:space:]]*\([0-9][0-9.]*\).*/\1/p' AGENTS.md 2>/dev/null | head -1)
if command -v openspec >/dev/null 2>&1; then
  installed=$(openspec --version 2>/dev/null | head -1)
  if [[ -n "$pinned" && "$pinned" != "$installed" ]]; then
    warn "the installed OpenSpec is ${installed:-unknown}, AGENTS.md pins $pinned: re-read the override note before trusting it"
  fi
  if openspec update --dry-run --json 2>/dev/null | grep -q '"changes":[[:space:]]*\[\]'; then
    ok "generated skills match the installed OpenSpec"
  else
    warn "the generated skills are stale for the installed OpenSpec: run openspec update, then re-read the override note"
  fi
fi

# --- summary ---------------------------------------------------------------

printf '\n'
if [[ ${#failures[@]} -gt 0 ]]; then
  printf '%s check(s) failed, %s warning(s).\n' "${#failures[@]}" "${#warnings[@]}"
  exit 1
fi
printf 'All checks passed, %s warning(s).\n' "${#warnings[@]}"
