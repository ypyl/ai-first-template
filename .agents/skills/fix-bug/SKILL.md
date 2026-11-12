---
name: fix-bug
description: "Diagnose a bug or performance regression before changing code. Use when something is broken, throwing, failing, slow, or when a fix is requested and the cause is not already proven."
---

# Fix a Bug

Do not edit code until a failing signal exists. A guess is not a diagnosis.

## 1. Build a failing signal

Find or create something that fails on this bug and passes when it is fixed:

- a unit or integration test
- a command that exits non-zero
- a reproduction script
- a browser check or screenshot diff
- a log line or metric that is wrong

Spend real effort here. If you cannot build a signal, stop and say what input or
access you need. Do not proceed on inspection alone.

The signal must fail for the right reason. If it fails for a different reason,
it proves nothing.

## 2. Redact

Never put a secret in a test, a log, a commit, or a message. Write `<REDACTED>`.
Pass credentials through the environment, not the command line.

## 3. Narrow

One hypothesis at a time:

- Read the error and the stack, not the whole file.
- `git log` and `git blame` the lines in the path.
- Bisect by commit, by input, or by disabling one branch.
- Instrument the boundary where the value is still correct and the next line
  where it is wrong.

Stop when the cause is a specific line or condition, not a general area.

## 4. Fix the root cause once

- Grep every caller of the function you touch.
- Fix the shared code, not one caller.
- Keep the fix as small as the behavior allows.
- Do not change the test to match the bug.

## 5. Prove it

- The signal now passes.
- The rest of the suite passes.
- A regression test remains, named for the behavior, so the bug cannot return
  silently.

## 6. Record the change

A bug that restores intended behavior is L0 when it is reversible, provable, and
unshared. If the bug reveals behavior that was never specified, it is L1: write
the delta spec and take the gate.

## When the bug is in production

Restore service before diagnosing. Revert to the last good version or turn the
flag off, then run this skill on the reverted tree. The fix still needs the
failing signal and the regression test, and it is still routed: a revert is L0,
a behavior fix is L1.

If you accept a known limit, mark it:

```
shortcut: <the limit>, <when to upgrade>
```

## Anti-patterns

- Editing before the signal exists.
- Fixing the caller and leaving the shared function broken.
- Widening a test until it passes.
- "It works now" with no command output.
- A secret in a log, a diff, or a commit.
