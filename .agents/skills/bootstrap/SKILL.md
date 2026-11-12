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

- `node --version` is 22.20 or newer, because the npm package needs it.
- `openspec --version` is 2.1.0. If it is missing or older, ask before running
  `npm install -g @fission-ai/openspec@2.1.0`, because it changes the machine.
  If the human declines or there is no network, stop and say what is blocked.
- The skills live in this repository, and `openspec/config.yaml` records
  `skillsScope: project`. Keep it that way: the contract is a self-contained
  repo, so `openspec update` always keeps the skills here, and a copy that
  offers to move them global is answered with no.
- `git rev-parse --is-inside-work-tree`. When that fails, run
  `git init -b master`, then commit the copy as it stands as
  `chore: initial template`. That commit is the baseline every change branches
  from, and the one commit that carries no trailers.
- `git config core.hooksPath .githooks`. This is per clone and never committed.
- `git update-index --chmod=+x .githooks/pre-commit .githooks/commit-msg
  scripts/check-change.sh scripts/template-diff.sh scripts/verify.sh`, after
  the baseline commit, because `--chmod` needs the files tracked. A copy through
  a filesystem without POSIX modes, such as a folder copied on Windows, lands
  them as 644; git then skips the hook on Linux and macOS with a one-line hint,
  while Git for Windows runs it anyway, so the copy looks gated and is not.
  Verified by `git ls-files -s` showing `100755` for all five.
- Confirm the trunk branch when it is not `master`, and write it into Project
  facts.
- Record where this copy came from, in the three template lines of Project
  facts: `- Template:` is the path or URL it was copied from, `- Template
  revision:` is the commit it was taken at, and `- Template copied:` is the
  date. Read the commit from the source with `git -C <path> rev-parse HEAD` or
  `git ls-remote <url> HEAD` when the copy is fresh. When the copy is older and
  nobody remembers, leave the revision empty and say so, because a guessed
  commit makes every later comparison lie; `bash scripts/template-diff.sh
  --head` still works against the tip. A repository that was not copied from
  the template leaves all three empty.

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
4. What data does it handle, whether any of it is personal, financial, or
   regulated, and where it lives: in the repository, in the user's home
   directory, or in a service?
5. How much load, and how many users in the first year?

Batch 2, the machine:

6. Platform: web, desktop, mobile, service, or command line?
7. Stack preference, if there is one?
8. Where does it run: this machine only, or a server, and which cloud?
9. CI: GitHub Actions, another provider, or none yet?
10. Where do secrets live locally, and where in CI?

Rules:

- Ask all ten, then stop. Do not keep interviewing after the gate.
- Runtime data never lives in the repository. The repository holds code, tests,
  and specs; data goes in the user's home directory or a service. If anything
  points inward, `.gitignore` covers that path, and the ADR records the choice.
  An answer that the data is not sensitive does not decide this: "nothing
  personal" is not a licence to write plant names, addresses, or ids into git.
- When the human answers "you decide" or "I don't know" to stack, hosting, or
  CI, offer two or three options with a one-line tradeoff, then pick one. Record
  it as an assumption in the proposal with a revisit trigger.
- If an answer contradicts an earlier one, ask once which one stands.
- Local only is a valid answer. It means no remote, and the CI and Deploy blocks
  stay empty. A provider named while there is still no remote is the other case:
  write the block, and say that the branch run waits until a remote exists.
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
  `## Capabilities`, `## Impact`; then the level in the title line, the four
  routing answers under a `## Routing` heading, the ten answers in the human's
  words in an `## Answers` table, every assumption with its trigger, and what is
  out of scope.
- `tasks.md`: every artifact below, with how its completion is verified.
- `design.md` only when a choice is not obvious from the ADR.
- No delta spec. This change changes no product behavior.

## 5. Stop at the gate

One gate, not two. Write the summary into `proposal.md`, then open the page:

```bash
node scripts/gate.mjs bootstrap
```

It blocks until the human submits, and the page shows how long it will wait.
With no `--gate` the page is the change's gate, which for bootstrap is the ADR:
the decision plus the proposal that summarises it. Design and tasks are the plan,
not the decision, so they are neither shown nor hashed. What the page must
carry:

- the product in the human's words, and what was recorded as out of scope
- the stack, and the rejected options one line each
- every assumption taken instead of an answer, with its revisit trigger
- what will be created, and what is deferred
- what is left for the human: a remote, CI credentials, deploy credentials

Do not ask them to judge the ADR. The ADR is the record; the summary is the
decision. Exit 2 means comments came back: revise, open `--rev 2`, and wait
again. Exit 3 means the page closed with no answer: nothing was recorded, so
stop and say you will wait until the human is ready, then reopen the same
revision. Exit 0 means approved: add the approval block with the hashes from the
submission the command printed, then amend the freeze commit, as `AGENTS.md`
says.

## 6. Apply

After the gate:

- Replace `README.md` with the product README: what it is, who it is for, what
  it is not, how to run it, and where to start.
- Fill **What this is** with the same paragraph.
- Fill Project facts, all of them: product slug, stack, toolchain, trunk branch,
  template source, template revision, template date, lint, build, test, run,
  secrets, environments. Lint, build, test, and run are one bare command each,
  with no backticks and nothing after it, because `scripts/verify.sh` runs the
  line as it stands. Notes go in toolchain.
- Write the first `CONVENTIONS.md` entries: formatter, error handling, test
  layout, dependencies, and the ignore policy.
- Add `.gitignore`, `.editorconfig`, the package manager files, and the lockfile
  policy.
- Add the first `CHANGELOG.md` entry under `## Unreleased`.
- Fill the CI and Deploy blocks when the human named a provider. Leave both
  empty otherwise, and say so. A remote the human has not created yet does not
  empty the block: write the commands, and say that the branch run waits for it.
  Write commands this project has run, and remember that `gh workflow run` needs
  the workflow to declare `workflow_dispatch`. A provider that deploys on every
  merge is the continuous model in `AGENTS.md`: the block still gets all four
  lines, with Deploy naming the workflow and the command that watches it.
- Remove template wording you have not already replaced, and the framework's
  own demo with it: the scaffold's sample pages and sample data, its About or
  documentation link, and its default product name. A leftover in the scaffolder
  is a leftover in the product, and nobody reads that file again.

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
