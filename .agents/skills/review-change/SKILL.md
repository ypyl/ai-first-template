---
name: review-change
description: "Review the current change before commit or archive. Use when a change is ready to finish, when asked to review a diff or a commit, or before archiving an OpenSpec change."
---

# Review the Change

Read the change the way the person who gets paged will read it. The human does
not read the diff, so this review is the last chance to catch what the machine
cannot.

## 1. Read

- The diff from the freeze commit or the branch base.
- Every caller of a changed function.
- The functions the change calls.
- The tests.
- The delta spec, the ADR, and `design.md`.
- The README or deploy config, to learn the expected load.

If the change names a scenario that has no test, stop and write the test.

## 2. Check

**Correct.** Wrong result, crash, missed edge case (empty, zero, last item,
rounding, time zone), a caller broken by a signature or return change, a fix
applied in one caller while the shared function stays broken.

**Safe.** Read `references/security-checklist.md` when the change touches auth,
input, secrets, crypto, file paths, dependencies, or personal data. A security
finding is always Must fix unless the human accepts the risk in writing.

**Holds under load.** Check-then-write races, the same work done by every
process, unbounded lists, a query per item, O(n^2) on real input, state that
must be shared but lives per process. Judge against the load the repo expects,
and say which load you assumed.

**Tested.** Each scenario has a test whose name contains the scenario title.
Risky new logic (a branch, a loop, a parser, money, security, a data write, a
bug fix) has one test that fails when it breaks.

**Fast enough.** Look for a slowdown on a hot path, not micro-optimizations.

**Lean.** Every line is needed for this change. Reuse what exists. No
speculative option, wrapper, config, or abstraction with one implementation.

## 3. Verify every finding

A finding needs a concrete case: this input or situation leads to this wrong
result. Re-read the lines and confirm the caller exists, the value can be empty,
the code is really unused.

No style taste. No "consider". No vague worry.

## 4. Report

Start with `What this change does:` in two or three sentences.

Then, skipping empty groups:

- **Must fix:** bug, security, data loss, or a break at the expected load.
- **Should fix:** risky code without a test, real slowness, duplication, a
  function that mixes jobs, code that should not exist.
- **Nice to have:** small speed-ups, shorter forms.

Each finding states what the code does, what goes wrong, the smallest fix, and
what happens if it is skipped.

If there is a Must fix, do not commit. Fix it and review again.

## Who reviews

You wrote the code, so this pass is a checklist, not an independent check. For
L2 and L3, run it twice: once now, and once in a fresh session that reads only
the change artifacts and the diff, without the conversation that produced them.
The second pass is looking for the assumption you never wrote down, which is
exactly what the first pass cannot see.

## 5. Leave the record

- Fixes go in the change commit.
- An accepted limitation gets `shortcut: <limit>, <when to upgrade>` in the
  code.
- A security risk the human accepted is written into `design.md` or
  `threat-model.md`, with the decision, not just the finding.
