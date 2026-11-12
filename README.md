# AI-first template

A repository template for projects where a coding agent writes all the code and
a human owns the decisions. It carries the process, not a stack. Pick the stack
in the first change.

This template is opinionated. The human does not read diffs and does not edit
files. The agent does the production. The human reads the decision at a gate:
the spec for a behavior change, the ADR for a contract change, the evidence for
something that cannot be undone. The idea comes from
[Review the Decision, Not the Code](https://ypyl.github.io/ai/2026/11/09/review-the-decision-not-the-code.html).

`AGENTS.md` is the contract. It holds the routing questions, the four levels, the
gates, the commit shape, and every rule. This file is the tour: what the template
is, how to copy it, and what is inside. If the two ever disagree, `AGENTS.md` is
right.

The skills live in `.agents/skills/`, the shared Agent Skills location, so any
agent that reads that directory and `AGENTS.md` can use the template.

## Copy it

1. Click **Use this template** on GitHub, or copy the folder into a new one.
2. Open that folder in your agent and say what you want to build. That is the
   whole start. The agent checks the machine, installs the one tool with your
   permission, turns on the commit gate, and asks ten questions about the
   product and where it runs.
3. Answer the questions. Where you do not know, say so: the agent offers options,
   picks one, and records it as an assumption you can revisit.
4. Read one summary and approve it. It shows the product in your words, the
   stack with the options it rejected, every assumption, and what will be
   created. The agent then writes the product README, fills `AGENTS.md`, adds the
   stack decision, and merges it as the first change.
5. From then on, describe one change at a time. The agent routes it, tells you
   what to read, and does the rest.

What the agent needs from you: a folder it can write to, permission to run
commands (a global `npm install` and `git init` are asked for, not assumed), and
answers. No remote, CI account, or deploy credentials are needed to start. Those
are the human's to add later, and the project works without them.

Without an agent, install OpenSpec 1.17.0 on Node 22.12 or newer, run
`git config core.hooksPath .githooks` once per clone, and follow `AGENTS.md` by
hand.

## What you get

- **A first session that does the setup.** The `bootstrap` skill interviews you,
  picks the stack, and turns the answers into artifacts. You approve one page.
  See [`AGENTS.md`](AGENTS.md#bootstrap-the-first-session).
- **A page at every gate.** The agent runs `node scripts/gate.mjs <change>`,
  which renders the artifacts into one local page, waits while you read and
  comment, and returns your decision with a hash of every file. Approving is
  one click; nothing is uploaded, and no port is left open.
- **Four levels.** L0 ships silently, L1 shows a spec, L2 shows an ADR and then
  the spec, and L3 shows the rehearsal, the rollback, and the reconciliation.
  The questions and the gate for each level are in
  [`AGENTS.md`](AGENTS.md#route-the-change-before-writing-anything).
- **One change, one branch, one merge.** The freeze commit makes "the spec
  changed after approval" a diff instead of a claim. See
  [`AGENTS.md`](AGENTS.md#one-change-one-branch-one-merge).
- **One owner per artifact.** Behavior lives in `openspec/specs/`, decisions in
  `adr/`, technical rules in `CONVENTIONS.md`, confirmed facts in
  `REPO-FACTS.md`, and the process itself in `AGENTS.md`.
- **A machine half.** A pre-commit gate, a verify script, an optional CI block,
  and a release path with deploy, smoke, and rollback. The release is in
  [`AGENTS.md`](AGENTS.md#cutting-a-release).

## A worked example

A small behavior change at L1: the app remembers the theme the user picks. The
agent opens a page, and the human reads one artifact on it,
`openspec/changes/add-theme/specs/theming/spec.md`:

```markdown
## ADDED Requirements

### Requirement: The theme follows the system until the user chooses one

The app SHALL follow the operating system theme. When the user picks a theme,
the app SHALL use that theme on every later launch, even when the system theme
changes.

#### Scenario: first launch follows the system
- **WHEN** the user has never chosen a theme
- **THEN** the app matches the operating system theme

#### Scenario: an explicit choice survives a restart
- **WHEN** the user chooses dark and relaunches the app
- **THEN** the app is dark, whatever the operating system says
```

Around it sit the artifacts the human does not read: the proposal names the
level and records the approval, the tasks pair each scenario with the test that
carries its title, and a design exists only when the approach is not obvious.
After the gate the agent records the approval with the hash of every file it
showed, runs `scripts/verify.sh`, archives, and commits. That archived folder is
the example the next change in the project copies.

## What is inside

```
AGENTS.md              the operating contract
CONVENTIONS.md         how the code is written here
REPO-FACTS.md          confirmed operational facts, not instructions
ARCHITECTURE.md        C4 shape; appears with the first change that adds a
                       container, store, queue, or external system
CHANGELOG.md           what a user can now do, under Unreleased
scripts/check-change.sh  the invariant checks, run by the pre-commit hook
scripts/verify.sh      those checks plus the declared lint, build, and test
scripts/gate.mjs       the gate page: render, serve, collect, hash
.githooks/pre-commit   the gate: runs the check script before every commit
.githooks/commit-msg   trailer check
openspec/
  config.yaml          project context and artifact rules
  specs/               durable behavior, one folder per capability
  changes/             active changes and their archive
adr/                   durable decisions, MADR style
.agents/skills/        every method the repo needs, in the shared Agent Skills
                       location
```

The pre-commit hook runs the invariant checks. The **CI** and **Deploy** blocks
in `AGENTS.md` are optional and never automatic: fill them and the agent runs
them, leave them empty and the agent verifies and releases by hand.

## Skills

The methods live in `.agents/skills/`, and `AGENTS.md` lists each one with when
to use it. Eight belong to the template. Six are generated by the OpenSpec CLI
and rewritten by `openspec update`, so edit only the eight.

One generated skill contradicts `AGENTS.md` on purpose. `AGENTS.md` says which
one wins, and why a hand edit is not the fix:
[`AGENTS.md`](AGENTS.md#when-a-generated-skill-contradicts-this-file).

## Requirements

- A coding agent that reads `AGENTS.md` and `.agents/skills/`.
- OpenSpec CLI 1.17.0, on Node 22.12 or newer.
- A shell with `bash`, `git`, and the usual text tools (`grep`, `sed`, `sort`,
  `tr`, `head`, `cat`, `dirname`). Git for Windows and any Unix-like shell
  provide them. No CI service, test runner, or container runtime is required.
- No other global skill is required. The repo is self-contained.

## License

No license is included. Add one before you publish.
