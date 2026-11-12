// Tests for the gate page. Run with `node --test scripts/gate.test.mjs`, or
// through `bash scripts/verify.sh`, which runs them as part of the local check.
//
// What is worth proving: input cannot become markup, the artifact list and its
// hashes come from disk and not from the browser, and a submission cannot name
// bytes the human did not see.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { md, sha256, stripRecord, artifactHash, collectArtifacts, changeDir, validateSubmission, renderPage, verify } from './gate.mjs';

const PROPOSAL = `# Bootstrap

The stack is .NET and SQLite. See adr/0001-dotnet-sqlite.md.

- one
- two

\`\`\`
git status
\`\`\`
`;

const SPEC = `## ADDED Requirements

### Requirement: A theme is remembered

The app SHALL remember the theme.

#### Scenario: after a restart
- **WHEN** the user relaunches
- **THEN** the theme is the one chosen
`;

async function fixture(level = 'L2') {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-'));
  const dir = path.join(root, 'openspec', 'changes', 'demo');
  await mkdir(path.join(dir, 'specs', 'theming'), { recursive: true });
  await mkdir(path.join(root, 'adr'), { recursive: true });
  await writeFile(path.join(dir, '.openspec.yaml'), `schema: spec-driven\nx-level: ${level}\n`);
  await writeFile(path.join(dir, 'proposal.md'), PROPOSAL);
  await writeFile(path.join(dir, 'specs', 'theming', 'spec.md'), SPEC);
  await writeFile(path.join(root, 'adr', '0001-dotnet-sqlite.md'), '# Use .NET with SQLite\n');
  return { root, dir };
}

test('md escapes markup and keeps the subset that matters', () => {
  const html = md('# Title\n\n<script>alert(1)</script>\n\n- **bold** and `code`\n\n```\nrm -rf /\n```\n');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<li><strong>bold<\/strong> and <code>code<\/code><\/li>/);
  assert.match(html, /<pre><code>rm -rf \/<\/code><\/pre>/);
});

test('md links keep the href but not the angle brackets', () => {
  const html = md('[link](https://example.com/a?b=1&c=2)');
  assert.match(html, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2" rel="noreferrer">link<\/a>/);
});

test('collectArtifacts reads the level, the specs, and the linked ADR', async () => {
  const { root, dir } = await fixture();
  const { level, gateKind, files } = await collectArtifacts(root, dir);
  assert.equal(level, 'L2');
  assert.equal(gateKind, 'adr', 'an L2 gate opens on the decision');
  assert.deepEqual(
    files.map((file) => file.kind),
    ['adr', 'proposal', 'spec'],
  );
  assert.equal(files[0].rel, 'adr/0001-dotnet-sqlite.md');
  assert.equal(files.at(-1).rel, 'openspec/changes/demo/specs/theming/spec.md');
  assert.equal(files.at(-1).sha256, sha256(SPEC));
  await rm(root, { recursive: true, force: true });
});

test('an L1 gate opens on the spec and needs no ADR', async () => {
  const { root, dir } = await fixture('L1');
  await rm(path.join(root, 'adr'), { recursive: true, force: true });
  const { gateKind, files } = await collectArtifacts(root, dir);
  assert.equal(gateKind, 'spec');
  assert.deepEqual(files.map((file) => file.kind), ['spec', 'proposal']);
  await rm(root, { recursive: true, force: true });
});

test('changeDir finds an archived change by its date prefix', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-'));
  await mkdir(path.join(root, 'openspec', 'changes', 'archive', '2026-02-11-demo'), { recursive: true });
  assert.equal(
    await changeDir(root, 'demo'),
    path.join(root, 'openspec', 'changes', 'archive', '2026-02-11-demo'),
  );
  assert.equal(await changeDir(root, 'missing'), null);
  await rm(root, { recursive: true, force: true });
});

test('a submission cannot approve bytes the browser did not see', async () => {
  const files = [
    { rel: 'openspec/changes/demo/proposal.md', sha256: 'a'.repeat(64) },
    { rel: 'openspec/changes/demo/specs/theming/spec.md', sha256: 'b'.repeat(64) },
  ];
  const record = validateSubmission(
    {
      decision: 'approve',
      words: '  good  ',
      comments: [{ artifact: 'openspec/changes/demo/specs/theming/spec.md', note: ' fixes it ' }],
      artifacts: [{ path: 'openspec/changes/demo/specs/theming/spec.md', sha256: 'c'.repeat(64) }],
    },
    files,
  );
  assert.equal(record.words, 'good');
  assert.deepEqual(
    record.artifacts.map((file) => file.sha256),
    ['a'.repeat(64), 'b'.repeat(64)],
    'the server owns the hashes, not the request',
  );
  assert.equal(record.comments.length, 1);
});

test('a submission with an unknown artifact or no reason is refused', () => {
  const files = [{ rel: 'openspec/changes/demo/proposal.md', sha256: 'a'.repeat(64) }];
  assert.throws(() => validateSubmission({ decision: 'maybe' }, files), /approve/);
  assert.throws(() => validateSubmission({ decision: 'changes', words: '', comments: [] }, files), /comment/);
  const dropped = validateSubmission(
    { decision: 'approve', comments: [{ artifact: '../../etc/passwd', note: 'hi' }] },
    files,
  );
  assert.deepEqual(dropped.comments, [], 'a path outside the artifact list is ignored, not written');
});

test('the page carries every artifact, its hash, and the transport', async () => {
  const { root, dir } = await fixture();
  const { level, files } = await collectArtifacts(root, dir);
  const page = renderPage({ change: 'demo', revision: 2, level, files });
  assert.match(page, /demo · revision 2 · L2/);
  for (const file of files) {
    assert.ok(page.includes(file.rel), `${file.rel} is on the page`);
    assert.ok(page.includes(file.sha256.slice(0, 12)), `${file.label} shows its hash`);
    assert.ok(page.includes(`data-artifact="${file.rel}"`), `${file.label} has a note box`);
  }
  assert.match(page, /"static":false/);
  const staticPage = renderPage({ change: 'demo', revision: 1, level, files, staticMode: true });
  assert.match(staticPage, /"static":true/);
  await rm(root, { recursive: true, force: true });
});

test('sha256 matches the platform hash of the same bytes', () => {
  const text = 'the same bytes';
  assert.equal(sha256(text), createHash('sha256').update(text).digest('hex'));
});

test('stripRecord removes the approval block and nothing else', () => {
  const before = '# Change\n\n## Why\n\nBecause.\n';
  const record = '\n## Approval\n\n- Gate: L1 delta spec\n- Words: "ok"\n';
  assert.equal(stripRecord(before + record), before);
  const after = '\n## Impact\n\nNothing outside.\n';
  assert.equal(stripRecord(before + record + after), before + after);
});

test('recording an approval does not change the hash it records', async () => {
  const { root, dir } = await fixture();
  const plain = await collectArtifacts(root, dir);
  await writeFile(
    path.join(dir, 'proposal.md'),
    PROPOSAL + '\n## Approval\n\n- Gate: L2 ADR\n- Artifact: openspec/changes/demo/proposal.md sha256:' + 'a'.repeat(64) + '\n',
  );
  const withRecord = await collectArtifacts(root, dir);
  const hashOf = (collection) => collection.files.find((file) => file.kind === 'proposal').sha256;
  assert.equal(hashOf(withRecord), hashOf(plain));
  assert.notEqual(
    withRecord.files.find((file) => file.kind === 'proposal').text,
    plain.files.find((file) => file.kind === 'proposal').text,
  );
  await rm(root, { recursive: true, force: true });
});

test('md renders a table instead of joining its lines into a paragraph', () => {
  const html = md('| Topic | Answer |\n|---|---|\n| Stack | `dotnet` |\n| CI | **none** |\n');
  assert.match(html, /<table><thead><tr><th>Topic<\/th><th>Answer<\/th><\/tr><\/thead>/);
  assert.match(html, /<tr><td>Stack<\/td><td><code>dotnet<\/code><\/td><\/tr>/);
  assert.match(html, /<tr><td>CI<\/td><td><strong>none<\/strong><\/td><\/tr>/);
  assert.doesNotMatch(html, /<p>\|/);
});

test('md keeps a pipe line without a rule as text', () => {
  const html = md('a | b\nnot a table\n');
  assert.equal(html, '<p>a | b not a table</p>');
  const afterParagraph = md('Text.\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  assert.match(afterParagraph, /^<p>Text\.<\/p>\n<table>/);
});

test('md escapes markup inside a table cell', () => {
  const html = md('| A |\n|---|\n| <img src=x onerror=alert(1)> |\n');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});

test('a hash does not depend on the line endings of the checkout', () => {
  assert.equal(artifactHash('spec', 'a\r\nb\r\n'), artifactHash('spec', 'a\nb\n'));
  const crlf = 'x\r\n\r\n## Approval\r\n\r\n- Gate: L1\r\n';
  const lf = 'x\n\n## Approval\n\n- Gate: L1\n';
  assert.equal(artifactHash('proposal', crlf), artifactHash('proposal', lf));
});

test('tasks are shown on the page but never recorded as approved', () => {
  const files = [
    { kind: 'spec', rel: 'openspec/changes/demo/specs/x/spec.md', sha256: 'a'.repeat(64) },
    { kind: 'tasks', rel: 'openspec/changes/demo/tasks.md', sha256: 'b'.repeat(64) },
  ];
  const record = validateSubmission({ decision: 'approve' }, files);
  assert.deepEqual(record.artifacts.map((file) => file.path), ['openspec/changes/demo/specs/x/spec.md']);
});

test('verify accepts a path recorded before the change moved to archive', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gate-'));
  const dir = path.join(root, 'openspec', 'changes', 'archive', '2026-01-01-demo');
  await mkdir(path.join(dir, 'specs', 'x'), { recursive: true });
  const spec = '## ADDED Requirements\n';
  await writeFile(path.join(dir, 'specs', 'x', 'spec.md'), spec);
  await writeFile(path.join(dir, '.openspec.yaml'), 'x-level: L1\n');
  const hash = artifactHash('spec', spec);
  const proposal = (recorded) =>
    `# Demo\n\n## Why\n\nBecause.\n\n## What Changes\n\nSomething.\n\n## Approval\n\n- Gate: L1 delta spec\n- Artifact: ${recorded} sha256:${hash}\n`;
  await writeFile(
    path.join(dir, 'proposal.md'),
    proposal('openspec/changes/demo/specs/x/spec.md'),
  );
  assert.equal(await verify('demo', root), 0, 'the active path still names the archived file');
  await writeFile(
    path.join(dir, 'proposal.md'),
    proposal('openspec/changes/archive/2026-01-01-demo/specs/x/spec.md'),
  );
  assert.equal(await verify('demo', root), 0, 'the archived path names the same file');
  await writeFile(path.join(dir, 'specs', 'x', 'spec.md'), '## MODIFIED Requirements\n');
  const quiet = console.log;
  console.log = () => {};
  try {
    assert.equal(await verify('demo', root), 1, 'edited after approval');
  } finally {
    console.log = quiet;
  }
  await rm(root, { recursive: true, force: true });
});
