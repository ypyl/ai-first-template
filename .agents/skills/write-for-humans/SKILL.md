---
name: write-for-humans
description: "Write or rewrite text a human will read: specs, proposals, ADRs, changelogs, release notes, READMEs, product copy, and messages. Use whenever a deliverable is prose, not code."
---

# Write for Humans

Decide who reads the text before choosing a word. The reader is not the agent,
and usually not the developer.

## Know the reader

| Text | Reader | What they need |
|---|---|---|
| `openspec/specs/` | Product owner, tester | What the system does, and whether it does it |
| `proposal.md` | Decision maker | Why this, why now, what is in and out |
| `adr/` | Future engineer, future agent | What forced the choice, what was rejected, what it costs |
| `CHANGELOG.md` | User | What they can now do, and since which version |
| `AGENTS.md`, skills | Agent | One instruction per sentence, with a clear trigger |
| README | New contributor | What this is, how to run it, where to start |

## Write

- Put the fact first. The reader should get it in one pass.
- One idea per sentence. One instruction per sentence in agent text.
- Active voice when the actor matters. "The agent archives the change", not
  "the change is archived".
- Concrete nouns and numbers. "128 tests pass" is a fact; "tests pass" is a
  claim.
- Define a technical term the first time the reader meets it. Use the same word
  for the same thing everywhere.
- Cut every word that does not change the meaning. Cut the throat-clearing
  opening. Start with the first real claim.
- Keep code, commands, identifiers, file paths, and error strings exact.
- No marketing adjectives, no hype, no fear. No "seamless", "robust",
  "powerful", "revolutionary".
- No em dashes. Use a period, comma, colon, semicolon, or parentheses.
- Do not invent a fact to make a sentence flow. If a number is missing, say so.

## For specs

- State observable behavior only.
- Functional and non-functional requirements in the same file.
- No file paths, class names, function names, CSS values, or library choices.
- The test: if the implementation can change without the visible behavior
  changing, the detail does not belong.
- Write for the product owner deciding and the tester checking, not for the
  developer implementing.

## For agent instructions

- Say when the rule applies, then what to do. A rule with no trigger is ignored.
- Use "must", "never", "stop", and "do not". Avoid "should", "consider", and
  "try to".
- Put the condition before the instruction: "If the change touches auth, run
  the security checklist."
- Do not restate a rule in two places. One owner per rule.
- State the stop condition. An agent needs to know when it is done.

## Check before sending

- Read it once as the intended reader. Can they decide or act?
- Every claim has a number, a path, or a named source.
- No sentence needs a second read to parse.
- No em dash. No "it is worth noting". No "in today's landscape".
- The text says what is true now, not what was intended.
