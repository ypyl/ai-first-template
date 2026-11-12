# Architecture Decision Records

Durable decisions, numbered in order. MADR style: Status, Date, Context,
Decision, Consequences, Alternatives.

Read this index before proposing a change. If a change touches a decision here,
link it from the proposal. If it changes the decision, write a new ADR and mark
the old one Superseded.

| ADR | Title | Status |
|---|---|---|
| | | |

## Adding a decision

1. Copy `0000-template.md` to the next free number and a kebab-case slug, for
   example `0001-use-postgres.md`.
2. Fill every section. Keep it under a page.
3. Add a row to the table above.
4. Link it from the change that introduced it, and from `AGENTS.md` when it
   changes how agents work.

An accepted ADR is never edited to say something else. A new ADR supersedes it
and both link to each other.
