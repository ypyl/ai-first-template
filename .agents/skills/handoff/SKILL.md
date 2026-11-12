---
name: handoff
description: "Write a handoff note when a session ends mid-goal or mid-change, so the next agent can continue without replaying the conversation."
---

# Handoff

A handoff note is temporary. The permanent record is OpenSpec, git, and the ADR.
This note only fills the gap between two sessions.

## When

Write one when:

- the session ends before the goal or change is finished
- the next session will use a different model or a fresh context
- the work is blocked on a human decision

Do not write one for a finished change. The archive is the handoff.

## Where

`.tmp/handoff-<goal-or-change>-<YYYY-MM-DD>.md`

`.tmp/` is gitignored, so the note is local to this machine. It is the one file
in `.tmp/` that outlives the session: the next session reads it, then deletes
it. If a fact in it matters after that, move it into the change folder or the
ADR. A temp file is not a record.

## What

Keep it under one page. Reference artifacts by path instead of copying them.

```markdown
# Handoff: <goal or change>

- Date:
- Level:
- Current change:
- State: in progress | blocked | ready for gate

## What is done

- ...

## Next step

The one next action, with the exact command.

## Open decisions

| Decision | Options | Who decides |
|---|---|---|

## Commands

```bash
# the commands that reproduce the current state
```

## Files to read first

- `openspec/changes/<change>/proposal.md`
- `openspec/changes/<change>/tasks.md`

## Gotchas

- What failed, what was tried, what not to repeat.
```

## Rules

- Redact every secret. Write `<REDACTED>`.
- Say what is not done. Do not describe intent as progress.
- Name the failing command and its output, not "tests fail".
- The next agent reads the change artifacts first, then this note.
- Do not put a durable decision only here. Write it into the ADR or the delta
  spec before ending the session.
