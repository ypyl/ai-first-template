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
   example `0001-use-postgres.md`. The skeleton stays where it is: it is the next
   decision's starting point, not a record of one.
2. Fill every section. Keep it under a page. Leave the status `Proposed`: the
   gate that approves it flips it to `Accepted`, and the change that supersedes
   it flips it again. Both lines sit above the first section, and
   `scripts/gate.mjs` leaves them out of the hash, so a flip cannot invalidate an
   approval.
3. Add a row to the table above.
4. Link it from the change that introduced it, and from `AGENTS.md` when it
   changes how agents work.

An accepted ADR is never edited to say something else. A new ADR supersedes it
and both link to each other.
