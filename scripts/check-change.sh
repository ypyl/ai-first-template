#!/usr/bin/env bash
# Checks the rules this repository claims a machine enforces. It needs bash, git,
# and the text tools Git for Windows already ships: grep, sed, sort, tr, head,
# cat, and dirname. `git config core.hooksPath .githooks` installs the
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
for meta in "${changefiles[@]}"; do
  dir=$(dirname "$meta")
  level=$(sed -n 's/^x-level:[[:space:]]*//p' "$meta" | tr -d "\"'[:space:]")
  skip=$(sed -n 's/^skip_specs:[[:space:]]*//p' "$meta" | tr -d "\"'[:space:]")
  case "$level" in
    L0|L1|L2|L3) ;;
    "") bad "$dir: no x-level in .openspec.yaml" ; continue ;;
    *) bad "$dir: x-level '$level' is not L0, L1, L2, or L3" ; continue ;;
  esac
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

section "Specs"
if [[ ! -d openspec/specs ]]; then
  ok "openspec/specs does not exist yet"
else
  rendering=$(grep -rEn '(^|[^[:alnum:]_])[0-9]+px([^[:alnum:]_]|$)|class=|fill=|var\(' openspec/specs 2>/dev/null)
  if [[ -n "$rendering" ]]; then
    while IFS= read -r hit; do bad "spec describes rendering, not behavior: $hit"; done <<< "$rendering"
  else
    ok "no rendering detail in the durable specs"
  fi

  titles=$(grep -rh '^#### Scenario:' openspec/specs 2>/dev/null | sed 's/^#### Scenario:[[:space:]]*//')
  if [[ -n "$titles" ]]; then
    duplicates=$(printf '%s\n' "$titles" | sort | uniq -d)
    if [[ -n "$duplicates" ]]; then
      while IFS= read -r title; do bad "duplicate scenario title: $title"; done <<< "$duplicates"
    fi
    while IFS= read -r title; do
      [[ -z "$title" ]] && continue
      if ! grep -rqiF --binary-files=without-match \
        --exclude-dir=.git --exclude-dir=.tmp --exclude-dir=node_modules \
        --exclude-dir=openspec --exclude='*.md' -- "$title" .; then
        bad "no test contains the scenario title: $title"
      fi
    done < <(printf '%s\n' "$titles" | sort -u)
    if [[ -z "$duplicates" ]] && ! printf '%s\n' "${failures[@]:-}" | grep -q 'scenario title'; then
      ok "$(printf '%s\n' "$titles" | grep -c .) scenario titles have a test"
    fi
  else
    ok "no scenarios yet"
  fi
fi

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
fi

# --- local gate ------------------------------------------------------------

section "Local gate"
[[ "$(git config --get core.hooksPath 2>/dev/null)" == ".githooks" ]] \
  && ok "core.hooksPath is .githooks" \
  || warn "hooks are off in this clone: git config core.hooksPath .githooks"
for hook in pre-commit commit-msg; do
  [[ -f ".githooks/$hook" ]] \
    && ok ".githooks/$hook" \
    || bad ".githooks/$hook is missing"
done

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

check_pipeline CI "Trigger Wait Status Logs" \
  "no CI declared, so the gate is local only"
check_pipeline Deploy "Release Deploy Smoke Rollback" \
  "no Deploy declared, so releases stay manual"

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
  warn "OpenSpec CLI not found, so config.yaml was not validated"
fi

pinned=$(sed -n 's/^- OpenSpec CLI:[[:space:]]*\([0-9][0-9.]*\).*/\1/p' AGENTS.md 2>/dev/null | head -1)
generated=$(sed -n 's/^  generatedBy: "\(.*\)"$/\1/p' .agents/skills/openspec-propose/SKILL.md 2>/dev/null | head -1)
if [[ -z "$generated" ]]; then
  warn "no generated skills found, so the pinned OpenSpec version was not compared"
elif [[ -n "$pinned" && "$pinned" != "$generated" ]]; then
  warn "generated skills are $generated, AGENTS.md pins $pinned: re-read the override note"
else
  ok "generated skills match the pinned OpenSpec version"
fi

# --- summary ---------------------------------------------------------------

printf '\n'
if [[ ${#failures[@]} -gt 0 ]]; then
  printf '%s check(s) failed, %s warning(s).\n' "${#failures[@]}" "${#warnings[@]}"
  exit 1
fi
printf 'All checks passed, %s warning(s).\n' "${#warnings[@]}"
