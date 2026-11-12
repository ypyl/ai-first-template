# Conventions

How the code is written here. One rule per heading, two lines each, and a rule
with no trigger is ignored. The ownership rule and how to add one are in
`AGENTS.md` under **Files**.

## Formatting and naming

None yet.

## Error handling and logging

None yet.

## Testing

None yet.

## Dependencies

None yet.

## Repository

Ignore build output by a path anchored at the repository root: `/dist/`, never
`dist/`. An unanchored pattern also matches a directory of that name deeper in
the tree, so a build can drop files a page loads and still succeed on the machine
that already has them.
