#!/usr/bin/env bash
# Compares this repository's process files with the template it was copied from,
# so a stale copy is a report instead of a mystery.
#
#   bash scripts/template-diff.sh [--from <path-or-url>] [--head]
#
# The provenance is three lines in Project facts: `- Template:`,
# `- Template revision:`, and `- Template copied:`. A template repository leaves
# them empty, and this script then says so and stops.
#
# Only the files a project keeps identical are compared: .agents/skills,
# .githooks, and scripts. AGENTS.md, README.md, CHANGELOG.md, CONVENTIONS.md,
# REPO-FACTS.md, adr/, and openspec/config.yaml are seeds the project rewrites on
# purpose, so a difference there is not news.
#
# The default compares against the recorded revision, which answers "did I edit a
# process file?". --head compares against the tip of the source, which answers
# "what does the template have that this copy does not?".
#
# Files are compared by the hash git would commit, so a checkout's line endings
# are not a difference. The source is fetched into .tmp/template-source and
# cached there, so this needs git, sort, and join, nothing else. A path works
# offline; a URL needs the network.
#
# Exit status: 0 when the comparison ran, 1 when it could not. A difference is
# the answer, not a failure.

set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root" || exit 1

paths=(.agents/skills .githooks scripts)
work=".tmp/template-source"

fact() {
  sed -n "s/^- $1:[[:space:]]*//p" AGENTS.md 2>/dev/null | head -1
}

usage() {
  printf 'usage: bash scripts/template-diff.sh [--from <path-or-url>] [--head]\n\n'
  printf '  --from <path-or-url>  compare with this template instead of the recorded one\n'
  printf '  --head                compare with the tip of the source, not the recorded commit\n'
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

upstream=$(fact Template)
revision=$(fact "Template revision")
copied=$(fact "Template copied")
head=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      [[ -n "${2-}" ]] || fail '--from needs a path or a URL'
      upstream=$2
      shift 2
      ;;
    --head)
      head=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$upstream" ]]; then
  printf 'No "- Template:" line in Project facts.\n\n'
  printf 'There is nothing to compare against: this repository is the template\n'
  printf 'itself, or the copy has not recorded where it came from. See AGENTS.md\n'
  printf 'under Project facts, and .agents/skills/bootstrap/SKILL.md step 2.\n'
  exit 0
fi

if [[ -z "$revision" && $head -eq 0 ]]; then
  printf 'No "- Template revision:" line in Project facts, so no commit is recorded\n'
  printf 'for this copy. Run with --head to compare against the template tip.\n'
  exit 1
fi

mkdir -p "$work" || fail 'cannot make .tmp/template-source'
[[ -d "$work/.git" ]] || git init -q "$work" || fail 'cannot start the cache repository in .tmp/template-source'

if [[ $head -eq 1 ]]; then
  git -C "$work" fetch -q --depth 1 "$upstream" HEAD 2>/dev/null ||
    fail "cannot read the tip of $upstream; check the path, the URL, or the network"
  rev=$(git -C "$work" rev-parse FETCH_HEAD)
  label="the tip of $upstream"
else
  git -C "$work" fetch -q --depth 1 "$upstream" "$revision" 2>/dev/null ||
    fail "cannot read $revision from $upstream; a revision has to be a commit the source still has"
  rev=$(git -C "$work" rev-parse FETCH_HEAD)
  label="recorded ${copied:-without a date}"
fi

printf 'template  %s\n' "$upstream"
[[ -n "$copied" ]] && printf 'copied    %s at %s\n' "$copied" "${revision:-unknown}"
printf 'compared  %s (%s)\n\n' "$label" "${rev:0:12}"

# The template's blobs, then this working tree hashed the way git would commit
# it, so a checkout's line endings and the file's mode never count as a change.
# The lists are sorted and joined, not held in memory: this runs on the bash 3.2
# that macOS still ships, which has no associative arrays.
tpl=.tmp/template-blobs
loc=.tmp/local-blobs
while IFS=$'\t' read -r meta path; do
  [[ -n "$path" ]] && printf '%s\t%s\n' "$path" "${meta##* }"
done < <(git -C "$work" ls-tree -r "$rev" -- "${paths[@]}") | sort -t$'\t' -k1,1 > "$tpl"

{
  git ls-files -- "${paths[@]}"
  git ls-files --others --exclude-standard -- "${paths[@]}"
} | sort -u | while IFS= read -r path; do
  printf '%s\t%s\n' "$path" "$(git hash-object --path="$path" -- "$path")"
done | sort -t$'\t' -k1,1 > "$loc"

same=0
changed=0
absent=0
only_here=0
while IFS=$'\t' read -r path thash lhash; do
  if [[ "$thash" == "$lhash" ]]; then
    printf '  same     %s\n' "$path"
    same=$((same + 1))
  else
    printf '  changed  %s\n' "$path"
    changed=$((changed + 1))
  fi
done < <(join -t "$(printf '\t')" -1 1 -2 1 "$tpl" "$loc")
while IFS=$'\t' read -r path _; do
  printf '  absent   %s\n' "$path"
  absent=$((absent + 1))
done < <(join -t "$(printf '\t')" -v 1 -1 1 -2 1 "$tpl" "$loc")
while IFS=$'\t' read -r path _; do
  printf '  local    %s\n' "$path"
  only_here=$((only_here + 1))
done < <(join -t "$(printf '\t')" -v 2 -1 1 -2 1 "$tpl" "$loc")
rm -f "$tpl" "$loc"

printf '\n%d files: %d same, %d changed, %d absent, %d local\n' \
  "$((same + changed + absent + only_here))" "$same" "$changed" "$absent" "$only_here"
printf 'A changed or absent process file is a decision: take the template version,\n'
printf 'keep yours and say why in the change, or open one to reconcile the two.\n'
