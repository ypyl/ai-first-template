---
name: bootstrap
description: "Set up a project from the AI-first template in the first session. Use when a fresh copy still holds the template placeholder in AGENTS.md, has unfilled Project facts, or has no accepted ADR, or when the user says start, set up, or bootstrap the project."
---

# Bootstrap

The first session in a copy. You interview the human, turn the answers into
artifacts, and run one L2 change. After it archives this skill never runs again.

`AGENTS.md` "Bootstrap: the first session" holds the contract. This file is the
method.

## 1. Prove the copy is a template

The repository is still a template while any of these is true:

- **What this is** in `AGENTS.md` holds the `<One paragraph...>` placeholder
- Project facts are unfilled
- `adr/` has no accepted decision

If none is true, stop. This is already a project. Ask what the human wants
instead of overwriting anything.

Do not infer a product from the folder. There is nothing to read yet.

## 2. Make the machine runnable

Do these, report each result, and stop at the first failure:

- `node --version` is 22.12 or newer.
- `openspec --version` is 1.17.0. If it is missing or older, ask before running
  `npm install -g @fission-ai/openspec@1.17.0`, because it changes the machine.
  If the human declines or there is no network, stop and say what is blocked.
- `git rev-parse --is-inside-work-tree`. When that fails, run
  `git init -b main`, then commit the copy as it stands as
  `chore: initial template`. That commit is the baseline every change branches
  from, and the one commit that carries no trailers.
- `git config core.hooksPath .githooks`. This is per clone and never committed.
- Confirm the trunk branch when it is not `main`, and write it into Project
  facts.

Report every change you made to the machine. Do not fill a fact you did not
hear: an unanswered question becomes a stated assumption in the proposal, never
a quiet default.

## 3. Interview

Two batches, not ten messages. Ten topics is the ceiling. Stop asking as soon as
you can write the artifacts.

Batch 1, the product:

1. What does it do, in one sentence?
2. Who is it for?
3. What is it explicitly not?
4. What data does it handle, and is any of it personal, financial, or regulated?
5. How much load, and how many users in the first year?

Batch 2, the machine:

6. Platform: web, desktop, mobile, service, or command line?
7. Stack preference, if there is one?
8. Where does it run: this machine only, or a server, and which cloud?
9. CI: GitHub Actions, another provider, or none yet?
10. Where do secrets live locally, and where in CI?

Rules:

- Ask all ten, then stop. Do not keep interviewing after the gate.
- When the human answers "you decide" or "I don't know" to stack, hosting, or
  CI, offer two or three options with a one-line tradeoff, then pick one. Record
  it as an assumption in the proposal with a revisit trigger.
- If an answer contradicts an earlier one, ask once which one stands.
- Local only is a valid answer. It means no remote, and the CI and Deploy blocks
  stay empty.
- Do not ask for a remote, a CI account, or deploy credentials. Those are the
  human's, and the project works without them.

## 4. Write the artifacts

One change, `bootstrap`, L2, with `skip_specs: true`:

```bash
openspec new change bootstrap
```

Then set its metadata:

```yaml
schema: spec-driven
created: <today>
x-level: L2
skip_specs: true
```

Write:

- `adr/0001-<stack-slug>.md`: the stack, the alternatives, what was assumed, and
  the revisit trigger. Add the row to `adr/README.md`.
- `proposal.md`: the headings the CLI expects, `## Why`, `## What Changes`,
  `## Capabilities`, `## Impact`; then the level, the four routing answers, the
  ten answers in the human's words in an `## Answers` table, every assumption
  with its trigger, and what is out of scope.
- `tasks.md`: every artifact below, with how its completion is verified.
- `design.md` only when a choice is not obvious from the ADR.
- No delta spec. This change changes no product behavior.

## 5. Stop at the gate

One gate, not two. Write the summary into `proposal.md`, then open the page:

```bash
node scripts/gate.mjs bootstrap
```

It blocks until the human submits. What the page must carry:

- the product in the human's words, and what was recorded as out of scope
- the stack, and the rejected options one line each
- every assumption taken instead of an answer, with its revisit trigger
- what will be created, and what is deferred
- what is left for the human: a remote, CI credentials, deploy credentials

Do not ask them to judge the ADR. The ADR is the record; the summary is the
decision. Exit 2 means comments came back: revise, open `--rev 2`, and wait
again. Exit 0 means approved: add the approval block with the hashes from
`.tmp/gate/bootstrap-r1.json`, then amend the freeze commit, as `AGENTS.md`
says.

## 6. Apply

After the gate:

- Replace `README.md` with the product README: what it is, who it is for, what
  it is not, how to run it, and where to start.
- Fill **What this is** with the same paragraph.
- Fill Project facts, all of them: product slug, stack, toolchain, trunk branch,
  lint, build, test, run, secrets, environments.
- Write the first `CONVENTIONS.md` entries: formatter, error handling, test
  layout, dependencies.
- Add `.gitignore`, `.editorconfig`, the package manager files, and the lockfile
  policy.
- Add the first `CHANGELOG.md` entry under `## Unreleased`.
- Fill the CI and Deploy blocks when the human named a provider. Leave both
  empty otherwise, and say so.
- Remove template wording you have not already replaced.

## 7. Finish

- `bash scripts/verify.sh`. It fails while Project facts are unfilled, which is
  the point.
- Archive the change and merge it.
- Tell the human two things: the next change is a normal feature change, and they
  will read a delta spec or an ADR depending on its level, and bootstrap never
  runs again.

## Stop conditions

- A question the human will not answer and cannot default: stop, and say which
  artifact the missing answer blocks.
- No network and no OpenSpec: stop. Do not hand-write what the CLI validates.
- The folder already has a product: stop. Do not overwrite it.
