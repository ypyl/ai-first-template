---
name: change-level
description: "Derive the L0-L3 level for an OpenSpec change and run its gate. Use before proposing a change, when starting, continuing, or resuming an OpenSpec change, when a change grows a shared contract, dependency, migration, or irreversible step, or when asked whether something needs review."
---

# Change Level

Route a change before any OpenSpec artifact is written. The level is derived
from the change, not chosen. It decides what the human reads and what the
machine must prove. It never decides whether the work gets done.

Read `AGENTS.md` and `openspec/config.yaml` first. Every method used here lives
in `.agents/skills/`. Do not depend on a skill installed outside this repository.

## 1. Answer the four questions

First, is this repository a template? If **What this is** holds the placeholder,
Project facts are unfilled, or `adr/` has no accepted decision, stop and run
`bootstrap`. Routing needs a product to route, and there is nothing else to do
first.

State the change in one sentence, then answer the four routing questions from
`AGENTS.md` **Route the change before writing anything**, each with the evidence
that section names. `AGENTS.md` owns the questions, the level table, and the
examples; this skill owns the order of the steps and the stop conditions.

An unanswerable question is a stop. The change is not scoped enough. Scope it
with the human instead of guessing.

## 2. Derive the level

The level is derived, never chosen: take the highest level any one answer
justifies, and never pick one to make the work smaller. `AGENTS.md` **Route the
change** owns the table, the artifact list for each level, and the examples of
what is typical. Read that section, then write the level into the change's
`.openspec.yaml` before the first artifact.

A step that is small but not undoable is not a decomposition, it is a schedule.
The level belongs to the feature; every step inherits it.

## Splitting a big request

One change has one intent you can say in a sentence. When a request needs
several, `AGENTS.md` **Big work** owns the tests for when that is true and the
rules for the split. This section is the method:

1. Pick a kebab-case goal slug, for example `offline-sync`.
2. Create each child with
   `openspec new change 01-<name> --goal "<slug>: <one line>"`.
3. The first child's proposal states the goal: the outcome, the shared contract,
   the children you expect, and what is out of scope. Later children link back
   and name their order.
4. Route the goal once. Every child inherits its level. A child that turns out
   irreversible makes the goal L3; it is not relabelled as a smaller child.

If the size is unclear, explore before proposing. Never infer a split from the
title.

## 3. Record the level

Write `openspec/changes/<change>/.openspec.yaml` before the first artifact:

```yaml
schema: spec-driven
x-level: L2
```

Add `skip_specs: true` for L0, and for the L1 that moves no requirement but
only a human can judge. The proposal's title line carries the level, for
example `# The board keeps its size (L0)`, and the four answers live under a
`## Routing` heading. Both are part of the record, and both survive archive.

## 4. Write only the artifacts the level needs

- **L0:** proposal and tasks, no delta spec. The proposal names the requirement
  the work leaves intact. No design unless the approach is not obvious.
- **L1:** proposal, delta spec, tasks. `design.md` only when the approach is
  not obvious.
- **L2:** the ADR in `adr/` first, then the proposal, delta spec, design, tasks.
  If the change adds a service, dependency, store, permission model, or external
  integration, also write `threat-model.md`.
- **L3:** everything in L2, plus `rehearsal.md`, `rollback.md`, and
  `reconciliation.md` in the change folder.

### The L3 evidence

Three files, each short enough to read at the gate. They are the difference
between an L3 gate and a promise.

**`rehearsal.md`.** Where it ran, the command, the row counts before and after,
the duration, and what differed from production. Rehearse against a copy of
production-shaped data, never an empty store. A rehearsal on an empty database
proves the syntax, not the change.

**`rollback.md`.** The exact command, who runs it, the window in which it still
works, and the point of no return with the reason. Execute it during the
rehearsal and paste the output. A rollback that has only been described is a
plan, and you are already asking the human to trust one plan.

**`reconciliation.md`.** The query that proves the data is complete and correct,
the numbers before and after, and the tolerance for a mismatch. Zero tolerance
means do not ship it.

The sequence for a data change is always the same shape: add the new form and
dual-write, backfill in batches, reconcile, switch reads, keep the old form for
one release, then remove it. Each step is its own change and inherits the level
of the goal.

## 5. Write the spec for a product owner

`AGENTS.md` owns the rule: a durable spec states observable behavior for a
product owner and a tester, with no implementation detail. `write-for-humans`
owns the voice. What is specific to this step:

- Write the delta behavior-first, because archive promotes it to the durable spec
  unchanged.
- Use `skip_specs: true` when no behavior changes, and name in the proposal the
  requirement the work leaves intact. Do not invent a requirement to satisfy
  validation.
- If the product owner cannot decide from the text alone, the gate is a
  signature, not a review.
- `scripts/check-change.sh` fails on a spec that carries rendering detail, on a
  duplicated scenario title, and on a scenario with no test.

## 6. Stop at the gate

- **L0:** do not ask. Continue through apply, checks, archive, commit, push.
- **L1:** `--gate spec`, wait, then run the loop.
- **L2:** `--gate adr`, wait. Then `--gate spec`, wait. Then run the loop. Two
  gates, in that order, recorded as two blocks. A `skip_specs` change has no
  spec, so its ADR gate is the only one.
- **L3:** same as L2, then the evidence. Apply only after approval.

`node scripts/gate.mjs <change>` renders that level's gate and blocks until the
human submits; exit 0 approved, 2 changes, 3 no response. The gate is the ADR at
L2 and L3 and the delta spec at L1, so a bare run never shows everything. On 3, stop: nothing
was recorded, so say you will wait until the human is ready and reopen the same
revision when they are. On 2, comments mean a new revision: revise, `--rev`+1,
open again. `AGENTS.md` **How a gate is presented** holds the rest.

After the gate passes, do not stop again except for a blocker, an ambiguity
that changes the plan, or a failing check that needs a decision. A generated
workflow skill may tell you to stop after proposing and wait for a new request.
`AGENTS.md` overrides it: this session continues into apply.

Write the approval into `proposal.md` as soon as the submission arrives, with
the artifact hashes it carries, then run `bash scripts/check-change.sh` before
amending the freeze commit, so the spec and the record of its approval land
together and neither has moved. `AGENTS.md` holds the block to copy. A chat
message alone is not a record; the repository is.

## 7. Re-route when facts change

The level is set once, but facts arrive during apply. If any answer flips:

- A shared module turns out to consume the change: raise L0 or L1 to L2.
- The change starts deleting or publishing: raise to L3.
- A second capability or a second decision of the same kind appears: stop and
  split the remaining work into a goal. Finish the current child, then plan the
  next one.
- The change no longer touches behavior: lowering is allowed only with the
  human's approval.

Stop at the new gate before continuing. Never lower a level silently.

## 8. Before you finish

- Run `review-change`. Fix every Must fix before committing.
- If the change touches auth, input, secrets, crypto, file paths, dependencies,
  or personal data, run its security checklist. Record an accepted risk in
  `design.md` or `threat-model.md`.
- If the change adds or removes a container, store, queue, external system, or
  trust boundary, run `architecture-doc` and update `ARCHITECTURE.md`.
- Run the repo's lint, build, and test commands. Report the exact commands and
  results.
- Update `CHANGELOG.md` under `## Unreleased` for a user-facing change. The
  version belongs to the release, so no commit carries one.
- Leave `OpenSpec-Change` and `OpenSpec-Level` in the commit trailers. No
  trailer names a version; the version is a tag cut at release.
- List any `shortcut:` marker you added, with its upgrade trigger.
- Record an operational fact in `REPO-FACTS.md` only after two independent
  confirmations, with evidence and date. A fact is not an instruction and never
  overrides a rule or a gate.
- A new or changed skill is L2 with `skip_specs: true`, and `AGENTS.md`
  **Skills** owns its rules: the ADR first, then the proposal with the trigger,
  the repeated evidence, the steps, and the cost, then the human at the ADR
  gate. Never write a skill and activate it in the same session.

## Anti-patterns

- Asking the human which level to use. Derive it.
- Treating L0 as permission to skip tests. L0 still needs a machine check.
- A spec that names files, classes, or CSS values. That is a diff with
  headers, and the product owner cannot judge it.
- A spec that restates the implementation instead of the behavior. Ask what a
  user or downstream system can observe, and write that.
- A new capability per change. Extend the capability that owns the behavior.
- A change that needs three intents. Make it a goal and split it into ordered
  children.
- A plan commit after apply has started. The freeze commit comes first.
- Writing an approval the human did not give.
