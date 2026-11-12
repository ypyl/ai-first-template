import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'template-diff.sh');

function git(cwd, ...args) {
  const result = spawnSync(
    'git',
    ['-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

// A template with two commits, and a copy of the first one that has been edited
// in place, which is the state the script has to describe.
async function fixture({ facts = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'template-diff-'));
  const upstream = path.join(root, 'upstream');
  const project = path.join(root, 'project');
  const posix = (value) => value.split(path.sep).join('/');

  for (const dir of ['scripts', '.githooks', '.agents/skills/s']) {
    await mkdir(path.join(upstream, dir), { recursive: true });
  }
  await writeFile(path.join(upstream, 'scripts/one.sh'), 'one\n');
  await writeFile(path.join(upstream, 'scripts/two.sh'), 'two\n');
  await writeFile(path.join(upstream, '.githooks/pre-commit'), 'hook\n');
  await writeFile(path.join(upstream, '.agents/skills/s/SKILL.md'), 'skill\n');
  git(upstream, 'init', '-q', '-b', 'main', '.');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-qm', 'one');
  const first = git(upstream, 'rev-parse', 'HEAD');

  await writeFile(path.join(upstream, 'scripts/two.sh'), 'two, changed upstream\n');
  await writeFile(path.join(upstream, 'scripts/three.sh'), 'three\n');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-qm', 'two');

  for (const dir of ['scripts', '.githooks', '.agents/skills/s']) {
    await mkdir(path.join(project, dir), { recursive: true });
  }
  await writeFile(path.join(project, 'scripts/one.sh'), 'one\n');
  await writeFile(path.join(project, 'scripts/two.sh'), 'two\n');
  await writeFile(path.join(project, '.githooks/pre-commit'), 'hook, edited here\n');
  await writeFile(path.join(project, '.agents/skills/s/SKILL.md'), 'skill\n');
  await cp(script, path.join(project, 'scripts/template-diff.sh'));
  await writeFile(
    path.join(project, 'AGENTS.md'),
    facts
      ? `# Facts\n\n- Template: ${posix(upstream)}\n- Template revision: ${first}\n- Template copied: 2026-02-11\n`
      : '# Facts\n\n- Template:\n- Template revision:\n',
  );
  git(project, 'init', '-q', '-b', 'main', '.');
  git(project, 'add', '-A');
  git(project, 'commit', '-qm', 'copy');

  return { root, upstream, project, first };
}

function run(project, ...args) {
  return spawnSync('bash', ['scripts/template-diff.sh', ...args], { cwd: project, encoding: 'utf8' });
}

test('template-diff compares the process files with the recorded revision', async () => {
  const { root, project } = await fixture();
  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /same\s+scripts\/one\.sh/);
  assert.match(result.stdout, /same\s+scripts\/two\.sh/, 'upstream moved on, the copy did not');
  assert.match(result.stdout, /changed\s+\.githooks\/pre-commit/, 'edited here');
  assert.match(result.stdout, /same\s+\.agents\/skills\/s\/SKILL\.md/);
  assert.match(result.stdout, /local\s+scripts\/template-diff\.sh/, 'in this copy only');
  assert.doesNotMatch(result.stdout, /absent\s+scripts\/three\.sh/, 'that file is not in the recorded commit');
  await rm(root, { recursive: true, force: true });
});

test('template-diff --head sees what the template has that the copy does not', async () => {
  const { root, project } = await fixture();
  const result = run(project, '--head');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /changed\s+scripts\/two\.sh/, 'the template changed it after the copy');
  assert.match(result.stdout, /absent\s+scripts\/three\.sh/, 'the template added it after the copy');
  assert.match(result.stdout, /changed\s+\.githooks\/pre-commit/, 'still a local edit');
  await rm(root, { recursive: true, force: true });
});

test('template-diff says a repository with no recorded source has nothing to compare', async () => {
  const { root, project } = await fixture({ facts: false });
  const result = run(project);
  assert.equal(result.status, 0, 'not an error: this is the template itself, or an unfilled line');
  assert.match(result.stdout, /There is nothing to compare against/);
  assert.match(result.stdout, /itself/);
  await rm(root, { recursive: true, force: true });
});

test('template-diff refuses a revision the source cannot produce', async () => {
  const { root, project } = await fixture();
  await writeFile(
    path.join(project, 'AGENTS.md'),
    '# Facts\n\n- Template: ../upstream\n- Template revision: 0000000000000000000000000000000000000000\n- Template copied: 2026-02-11\n',
  );
  const result = run(project);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read 0000000/);
  await rm(root, { recursive: true, force: true });
});
