#!/usr/bin/env node
// The gate page. Renders the artifacts of one change into a single HTML page,
// serves it on loopback, waits for the human's decision, and writes that
// decision as JSON for the agent to quote into `proposal.md`.
//
//   node scripts/gate.mjs <change> [--rev N] [--static] [--timeout 900]
//
// `--timeout` is idle time: the number of seconds without a check-in from the
// open page before the gate gives up. While the page is open it checks in every
// ten seconds, so reading takes as long as it takes. `--timeout 0` waits until
// the human answers or the agent stops it.
//
// Exit status carries the decision, so no prose has to be parsed:
//   0  approved
//   2  changes requested
//   3  no response: nothing was recorded, and the same revision can be reopened
//   1  could not run: no change, no artifacts, port or render failure
//
// `--static` writes the page and exits 0 without serving it. The human saves
// the JSON by hand and says so. Use it when the agent cannot hold a shell open,
// or when the human is not on the machine that runs this.
//
// No dependencies beyond Node. Nothing is uploaded: the server binds 127.0.0.1,
// answers one route under a random path, and accepts one submission.

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.tmp', 'gate');
const MAX_BODY = 256 * 1024;

const GUIDES = {
  proposal: 'The level, the four routing answers, and why this exists. Check the level, then the scope.',
  spec: 'Requirements and scenarios. Every SHALL is a promise, every scenario a test.',
  adr: 'One decision, its alternatives, and what it costs. Judge the decision, not the code.',
  design: 'The approach for this change only. It may be wrong next month, and that is allowed.',
  tasks: 'What will be done, and how each item is proven.',
};

/* ---------- text ---------- */

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// The approval block lives in the proposal and names the hash of the proposal.
// Recording it must not change the bytes it describes, so the block is removed
// before hashing. Everything outside `## Approval` is still covered.
export function stripRecord(text) {
  const kept = [];
  let skipping = false;
  for (const line of text.split('\n')) {
    if (/^## Approval\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^## /.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

// The ADR's status and date are the gate's own outcome, not part of what the
// human reads and decides: the file is written Proposed, approved, then Accepted,
// and a later ADR marks it Superseded. Both lines sit above the first section and
// move after the hash is recorded, so they are removed before hashing and the
// Context, Decision, Consequences, and Alternatives stay covered.
export function stripDecisionMeta(text) {
  const lines = text.split('\n');
  const firstSection = lines.findIndex((line) => /^## /.test(line));
  const end = firstSection === -1 ? lines.length : firstSection;
  return lines
    .filter((line, index) => index >= end || !/^- (Status|Date):/.test(line))
    .join('\n');
}

// The approval names bytes, so it must not depend on how the checkout stored
// them: a CRLF working tree and a fresh LF clone have to produce one hash.
// Tasks are the agent's plan and their checkboxes change during apply, so they
// appear on the page but are never recorded as approved.
export function artifactHash(kind, text) {
  const body = text.replace(/\r\n/g, '\n');
  if (kind === 'proposal') return sha256(stripRecord(body));
  if (kind === 'adr') return sha256(stripDecisionMeta(body));
  return sha256(body);
}

function esc(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Markdown to HTML for the subset an artifact actually uses: headings, fenced
// code, lists, tables, quotes, links, bold, inline code. Escape first, convert
// second, so no raw input reaches the page as markup.
// shortcut: lists do not nest and a table cell cannot hold a pipe, upgrade when
// a spec needs a sublist or writes a pipe outside a code span
export function md(source) {
  const lines = source.split('\n');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const inline = (text) =>
    esc(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, url) =>
        // The page runs on loopback and can submit the decision, so a link
        // whose scheme executes something is the text, not a link.
        /^(javascript|data|vbscript|file):/i.test(url)
          ? label
          : `<a href="${url}" rel="noreferrer">${label}</a>`);

  const cells = (row) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const tableRow = /^\s*\|/;
  const tableRule = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  // A block starts a new element. Anything else is a wrapped line of the element
  // above it, which is how every artifact in the repository is written.
  const startsBlock = (text) =>
    /^(#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s|\s*```|\s*>|\s*\|)/.test(text);
  const continues = (text) => text.trim() !== '' && !startsBlock(text);
  let lastLine = 0;
  const gather = (text, from) => {
    let body = text;
    lastLine = from;
    while (lastLine + 1 < lines.length && continues(lines[lastLine + 1])) {
      body += ' ' + lines[++lastLine].trim();
    }
    return body;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeList();
      const buf = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(gather(line.replace(/^\s*[-*]\s+/, ''), i))}</li>`);
      i = lastLine;
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(gather(line.replace(/^\s*\d+[.)]\s+/, ''), i))}</li>`);
      i = lastLine;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (tableRow.test(line) && i + 1 < lines.length && tableRule.test(lines[i + 1])) {
      closeList();
      const head = cells(line);
      const rows = [];
      i++;
      while (i + 1 < lines.length && tableRow.test(lines[i + 1])) rows.push(cells(lines[++i]));
      const headHtml = head.map((cell) => `<th>${inline(cell)}</th>`).join('');
      const rowsHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`);
      continue;
    }
    closeList();
    const para = [line];
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !startsBlock(lines[i + 1])
    ) {
      para.push(lines[++i]);
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

/* ---------- change ---------- */

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

export async function changeDir(root, name) {
  const active = path.join(root, 'openspec', 'changes', name);
  if (existsSync(active)) return active;
  const archive = path.join(root, 'openspec', 'changes', 'archive');
  if (existsSync(archive)) {
    const match = (await readdir(archive))
      .filter((entry) => entry === name || entry.replace(/^\d{4}-\d{2}-\d{2}-/, '') === name)
      .sort()
      .at(-1);
    if (match) return path.join(archive, match);
  }
  return null;
}

export async function collectArtifacts(root, dir) {
  const meta = existsSync(path.join(dir, '.openspec.yaml'))
    ? await readFile(path.join(dir, '.openspec.yaml'), 'utf8')
    : '';
  const level = (/^x-level:\s*["']?([^"'\s]+)/m.exec(meta) || [])[1] || 'L1';

  const files = [];
  const add = async (abs, kind, label) => {
    const text = await readFile(abs, 'utf8');
    files.push({
      kind,
      label,
      text,
      sha256: artifactHash(kind, text),
      rel: path.relative(root, abs).split(path.sep).join('/'),
    });
  };

  for (const [file, kind] of [
    ['proposal.md', 'proposal'],
    ['design.md', 'design'],
    ['tasks.md', 'tasks'],
  ]) {
    const abs = path.join(dir, file);
    if (existsSync(abs)) await add(abs, kind, file);
  }

  const specs = path.join(dir, 'specs');
  for (const abs of await walk(specs)) {
    await add(abs, 'spec', path.relative(dir, abs).split(path.sep).join('/'));
  }

  const proposal = files.find((file) => file.kind === 'proposal');
  if (proposal) {
    const refs = [...new Set(proposal.text.match(/adr\/[0-9]{4}-[a-z0-9._-]+\.md/gi) || [])];
    for (const ref of refs) {
      const abs = path.join(root, ref);
      if (existsSync(abs)) await add(abs, 'adr', ref);
    }
  }

  if (!files.length) return { level, files: [] };

  const gateKind =
    level === 'L1'
      ? 'spec'
      : level === 'L2' || level === 'L3'
        ? files.some((file) => file.kind === 'adr')
          ? 'adr'
          : 'spec'
        : 'proposal';

  return { level, gateKind, files: arrange(files, gateKind) };
}

// The artifact the gate is about comes first, the proposal next as context, and
// the rest after. A file the human cannot see cannot be approved, and a file
// that is not approved does not belong in the record.
export function arrange(files, gateKind) {
  const order = ['proposal', 'spec', 'adr', 'design', 'tasks'];
  return [...files].sort((a, b) => {
    const rank = (file) => (file.kind === gateKind ? -1 : order.indexOf(file.kind));
    return rank(a) - rank(b) || a.label.localeCompare(b.label);
  });
}

// The page shows the gate, not the change. Asking for everything is a deliberate
// act, because a page that shows the decision and its consequences together
// invites approving both at once. A change with no artifact of its gate kind
// (skip_specs, so no delta spec; no ADR, so no decision page) gates the whole
// change, and the proposal is what the human reads.
export function defaultGate(gateKind, files = []) {
  if ((gateKind === 'adr' || gateKind === 'spec') && files.some((file) => file.kind === gateKind)) {
    return gateKind;
  }
  return 'all';
}

// L2 and L3 gate the decision before the behavior: the ADR first, the delta spec
// after. Gating everything in one page would let the consequences ride on the
// decision, which is the one thing the two gates exist to prevent.
export function selectForGate(files, gate) {
  if (gate === 'all') return files;
  const kinds = gate === 'adr' ? ['adr', 'proposal'] : ['spec', 'proposal'];
  return files.filter((file) => kinds.includes(file.kind));
}

/* ---------- submission ---------- */

// The server owns the artifact list and the hash of every file. A submission
// may say what the human decided and what they wrote; it may not say which
// bytes were approved. Anything else in the body is dropped.
export function validateSubmission(body, files) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('submission is not an object');
  }
  if (body.decision !== 'approve' && body.decision !== 'changes') {
    throw new Error('decision must be "approve" or "changes"');
  }
  const words = typeof body.words === 'string' ? body.words.trim().slice(0, 8000) : '';
  const known = new Set(files.map((file) => file.rel));
  const comments = (Array.isArray(body.comments) ? body.comments : [])
    .filter((item) => item && known.has(item.artifact) && typeof item.note === 'string')
    .map((item) => ({ artifact: item.artifact, note: item.note.trim().slice(0, 8000) }))
    .filter((item) => item.note);
  if (body.decision === 'changes' && !words && !comments.length) {
    throw new Error('request changes needs at least one comment');
  }
  return {
    decision: body.decision,
    words,
    comments,
    artifacts: files
      .filter((file) => file.kind !== 'tasks')
      .map((file) => ({ path: file.rel, sha256: file.sha256 })),
  };
}

export function whoami() {
  for (const key of ['user.name', 'user.email']) {
    try {
      const value = execFileSync('git', ['config', key], { cwd: ROOT, encoding: 'utf8' }).trim();
      if (value) return value;
    } catch {
      /* not a git repo, or the key is unset */
    }
  }
  return '';
}

/* ---------- page ---------- */

function section(file, index, gateKind) {
  const kindLabel = { proposal: 'Proposal', spec: 'Spec', adr: 'Decision', design: 'Design', tasks: 'Tasks' }[file.kind];
  const open = file.kind === gateKind || index === 0;
  return `<section>
  <details${open ? ' open' : ''}>
    <summary>
      <span class="kind">${kindLabel}</span>
      <span class="label">${esc(file.label)}</span>
      <span class="hash" title="sha256 ${file.sha256}">${file.sha256.slice(0, 12)}</span>
    </summary>
    <p class="guide">${esc(GUIDES[file.kind] || '')}</p>
    <article>${md(file.text)}</article>
    <label class="note">Your note on this file
      <textarea data-artifact="${esc(file.rel)}" rows="2" placeholder="What is wrong, missing, or unclear? Leave empty if it is right."></textarea>
    </label>
  </details>
</section>`;
}

export function renderPage({ change, revision, level, files, gate = 'all', staticMode = false, idle = 0 }) {
  const gateLabel = gate === 'all' ? '' : ` · ${gate} gate`;
  const gateKind = files[0] ? files[0].kind : 'proposal';
  const lead = gate === 'all'
    ? 'Read what is open. Everything else is there if you want it.'
    : 'This page carries only what this gate approves. The design and the tasks are not approved at a gate, so they are not on it. Ask for --gate all to read the whole change.';
  const data = {
    change,
    revision,
    level,
    gate,
    static: staticMode,
    idle,
    artifacts: files.map((file) => ({ path: file.rel, sha256: file.sha256 })),
  };
  const body = files.map((file, index) => section(file, index, gateKind)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(change)} r${revision} · ${esc(level)}${gateLabel}</title>
<style>
  :root { color-scheme: light dark; --ink: #1b1b1b; --dim: #666; --line: #d8d8d8; --bg: #fff; --accent: #2d6a4f; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e8e8e8; --dim: #9a9a9a; --line: #3a3a3a; --bg: #161616; --accent: #74c69d; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2rem 1rem 8rem; background: var(--bg); color: var(--ink);
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 46rem; margin: 0 auto; }
  header h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  header p { margin: 0 0 1.5rem; color: var(--dim); font-size: .85rem; }
  section { border-top: 1px solid var(--line); padding: .35rem 0; }
  summary { cursor: pointer; display: flex; gap: .6rem; align-items: baseline; padding: .45rem 0; }
  .kind { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); min-width: 5.2rem; }
  .label { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .85rem; }
  .hash { margin-left: auto; color: var(--dim); font-family: ui-monospace, monospace; font-size: .7rem; }
  .guide { margin: 0 0 1rem; color: var(--dim); font-size: .8rem; border-left: 2px solid var(--accent); padding-left: .7rem; }
  article { font-size: .95rem; overflow-wrap: anywhere; }
  article h1 { font-size: 1.15rem; } article h2 { font-size: 1.02rem; } article h3 { font-size: .96rem; }
  article code { font-size: .85em; background: rgba(127,127,127,.16); padding: .1em .3em; border-radius: 3px; }
  article pre { background: rgba(127,127,127,.12); padding: .8rem; overflow-x: auto; border-radius: 6px; }
  article pre code { background: none; padding: 0; }
  article table { border-collapse: collapse; margin: .8rem 0; font-size: .88rem; display: block; overflow-x: auto; }
  article th, article td { border: 1px solid var(--line); padding: .35rem .55rem; text-align: left; vertical-align: top; }
  article th { background: rgba(127,127,127,.1); font-weight: 600; white-space: nowrap; }
  article blockquote { margin: .6rem 0; padding-left: .8rem; border-left: 3px solid var(--line); color: var(--dim); }
  .note { display: block; margin: 1rem 0 1.4rem; font-size: .75rem; color: var(--dim); }
  textarea { display: block; width: 100%; margin-top: .3rem; padding: .5rem .6rem; font: inherit;
    font-size: .88rem; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 6px; resize: vertical; }
  #overall { margin-top: 1.5rem; }
  .bar { position: fixed; inset: auto 0 0 0; background: var(--bg); border-top: 1px solid var(--line);
    padding: .8rem 1rem; display: flex; gap: .6rem; align-items: center; justify-content: center; flex-wrap: wrap; }
  button { font: inherit; font-size: .9rem; padding: .5rem 1.1rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--line); background: transparent; color: var(--ink); }
  button#approve { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  button:disabled { opacity: .5; cursor: default; }
  #done { color: var(--accent); font-size: .85rem; }
  .clock { color: var(--dim); font-size: .8rem; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(change)} · revision ${revision} · ${esc(level)}${gateLabel}</h1>
    <p>${lead} Your notes and your decision go back to the agent.</p>
  </header>
  ${body}
  <label class="note">Anything else
    <textarea id="overall" rows="3" placeholder="The one thing you want changed, or why this is right."></textarea>
  </label>
</main>
<div class="bar">
  <button id="changes">Request changes</button>
  <button id="approve">Approve</button>
  <span id="done" hidden></span>
  <span id="clock" class="clock"></span>
</div>
<script>
const D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const $ = (s) => document.querySelector(s);
let submitted = false;
let remaining = D.idle;
let listening = D.idle > 0;
function showClock() {
  if (!D.idle || submitted) return;
  if (!listening) {
    $('#clock').textContent = 'The gate closed. Tell the agent to reopen it.';
    return;
  }
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  $('#clock').textContent = 'Time left ' + minutes + ':' + String(seconds).padStart(2, '0');
}
async function ping() {
  if (!D.idle || !listening || submitted) return;
  try {
    const res = await fetch('alive', { method: 'POST' });
    if (!res.ok) throw new Error(String(res.status));
    remaining = (await res.json()).remaining;
  } catch {
    listening = false;
  }
  showClock();
}
function payload(decision) {
  const comments = [...document.querySelectorAll('textarea[data-artifact]')]
    .map((t) => ({ artifact: t.dataset.artifact, note: t.value.trim() }))
    .filter((c) => c.note);
  return { decision, words: $('#overall').value.trim(), comments };
}
async function send(decision) {
  const body = payload(decision);
  $('#approve').disabled = $('#changes').disabled = true;
  if (D.static) {
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = D.change + '-r' + D.revision + '.json';
    a.click();
    $('#done').textContent = 'Saved ' + a.download + '. Move it to .tmp/gate/ and tell the agent.';
    $('#done').hidden = false;
    return;
  }
  try {
    const res = await fetch('submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      submitted = true;
      $('#clock').textContent = '';
      $('#done').textContent = decision === 'approve'
        ? 'Approved. The agent continues.'
        : 'Sent. The agent will revise and reopen this page.';
    } else {
      $('#done').textContent = 'Submit failed: ' + res.status + '. Tell the agent.';
    }
  } catch (err) {
    $('#done').textContent = 'Submit failed: ' + err.message + '. Tell the agent.';
  }
  $('#done').hidden = false;
}
if (D.idle) {
  showClock();
  setInterval(() => { if (listening && remaining > 0 && !submitted) { remaining--; showClock(); } }, 1000);
  setInterval(ping, 10000);
}
$('#approve').addEventListener('click', () => send('approve'));
$('#changes').addEventListener('click', () => send('changes'));
</script>
</body>
</html>
`;
}

/* ---------- verify ---------- */

// Recomputes the hashes an approval recorded and compares them with the files.
// Prints one FAIL line per disagreement and returns 1. Used by
// scripts/check-change.sh, so there is one implementation of the hash.
// A recorded path is written while the change is active and read after it moves
// to archive/, so both forms name the same file. The suffix after the change
// folder is what survives the move.
function resolveRecorded(file, change, dirRel) {
  const match = /^openspec\/changes\/(?:archive\/\d{4}-\d{2}-\d{2}-)?([^/]+)\/(.+)$/.exec(file);
  if (!match || match[1] !== change) return null;
  return `${dirRel}/${match[2]}`;
}

export async function verify(change, root = ROOT) {
  const dir = await changeDir(root, change);
  if (!dir) {
    console.log(`FAIL no change named ${change}`);
    return 1;
  }
  const { files } = await collectArtifacts(root, dir);
  const proposal = files.find((file) => file.kind === 'proposal');
  if (!proposal) return 0;
  const recorded = [...proposal.text.matchAll(/^- Artifact:\s*(\S+)\s+sha256:([0-9a-fA-F]{64})\s*$/gm)];
  const byPath = new Map(files.map((file) => [file.rel, file.sha256]));
  const dirRel = path.relative(root, dir).split(path.sep).join('/');
  let problems = 0;
  for (const [, file, want] of recorded) {
    const moved = resolveRecorded(file, change, dirRel);
    const got = byPath.get(file) ?? (moved ? byPath.get(moved) : undefined);
    if (got === undefined) {
      console.log(`FAIL ${file} is missing, and an approval names it`);
      problems++;
    } else if (got !== want.toLowerCase()) {
      console.log(`FAIL ${file} changed after its approval; re-gate it rather than editing an approved artifact`);
      problems++;
    }
  }
  return problems ? 1 : 0;
}

/* ---------- cli ---------- */

function parseArgs(argv) {
  const options = { rev: 1, port: 0, timeout: 900, static: false, open: true, gate: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--rev') options.rev = Number(argv[++i]);
    else if (arg === '--port') options.port = Number(argv[++i]);
    else if (arg === '--timeout') options.timeout = Number(argv[++i]);
    else if (arg === '--gate') options.gate = argv[++i];
    else if (arg === '--by') options.by = argv[++i];
    else if (arg === '--static') options.static = true;
    else if (arg === '--verify') options.verify = true;
    else if (arg === '--no-open') options.open = false;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else rest.push(arg);
  }
  options.change = rest[0];
  if (options.gate !== null && !['all', 'adr', 'spec'].includes(options.gate)) {
    throw new Error(`--gate takes adr, spec, or all, not ${options.gate}`);
  }
  return options;
}

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(command[0], command[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    /* the printed URL is the fallback */
  }
}

function summary(decision, record, target) {
  const label = decision === 'approve' ? 'Approved' : 'Changes requested';
  console.log(`${label}: ${record.change} r${record.revision} (${record.level})`);
  console.log(`  by:        ${record.approvedBy || 'unknown'}`);
  console.log(`  artifacts: ${record.artifacts.length}`);
  if (record.words) console.log(`  words:     ${record.words}`);
  for (const comment of record.comments) console.log(`  note ${comment.artifact}: ${comment.note}`);
  console.log(`  record:    ${path.relative(ROOT, target).split(path.sep).join('/')}`);
}

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.change) {
    console.log(`usage: node scripts/gate.mjs <change> [--gate adr|spec|all] [--rev N] [--static] [--timeout 900] [--port N] [--by name] [--no-open]
       node scripts/gate.mjs <change> --verify

Renders the change's artifacts to a page, waits for approve or request changes,
and writes .tmp/gate/<change>-r<N>.json. Exit 0 approved, 2 changes, 3 no
response, 1 cannot run.

--verify recomputes the hashes an approval recorded in proposal.md and exits 1
when one no longer matches the file it names.`);
    return options.help ? 0 : 1;
  }

  if (options.verify) return await verify(options.change);

  const dir = await changeDir(ROOT, options.change);
  if (!dir) throw new Error(`no change named ${options.change} under openspec/changes/`);
  const collected = await collectArtifacts(ROOT, dir);
  const level = collected.level;
  const gate = options.gate ?? defaultGate(collected.gateKind, collected.files);
  const files = arrange(selectForGate(collected.files, gate), gate === 'all' ? collected.gateKind : gate);
  if (!files.length) throw new Error(`${path.relative(ROOT, dir)} has no artifacts to review`);
  if (gate !== 'all' && !files.some((file) => file.kind === gate)) {
    throw new Error(`${path.relative(ROOT, dir)} has no ${gate} to gate`);
  }

  const revision = options.rev;
  const base = `${options.change}-r${revision}-${gate}`;
  await mkdir(OUT, { recursive: true });
  const pagePath = path.join(OUT, `${base}.html`);
  const jsonPath = path.join(OUT, `${base}.json`);
  const page = renderPage({
    change: options.change,
    revision,
    level,
    files,
    gate,
    staticMode: options.static,
    idle: options.static ? 0 : options.timeout > 0 ? options.timeout : 0,
  });
  await writeFile(pagePath, page, 'utf8');

  if (options.static) {
    console.log(`Page:      ${path.relative(ROOT, pagePath).split(path.sep).join('/')}`);
    console.log(`Submission: ${path.relative(ROOT, jsonPath).split(path.sep).join('/')}`);
    console.log('Static page: the human saves the JSON by hand and tells you. Nothing is served.');
    return 0;
  }

  const token = randomBytes(16).toString('hex');
  const route = `/g/${token}`;
  const approvedBy = options.by || whoami();

  return await new Promise((resolve, reject) => {
    let settled = false;
    let watchdog;
    const idle = options.timeout > 0 ? options.timeout : 0;
    let deadline = idle ? Date.now() + idle * 1000 : 0;
    const finish = (code, record) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      server.close();
      if (record) {
        summary(record.decision, record, jsonPath);
      } else {
        console.log('No response. Nothing was recorded, and the artifacts are unchanged.');
        console.log(`Reopen when the human is ready: node scripts/gate.mjs ${options.change} --rev ${revision}`);
      }
      resolve(code);
    };

    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const send = (status, type, text) => {
        res.writeHead(status, {
          'content-type': type,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        });
        res.end(text);
      };

      if (url.pathname === '/') {
        res.writeHead(302, { location: `${route}/` });
        return res.end();
      }
      if (req.method === 'GET' && (url.pathname === `${route}/` || url.pathname === route)) {
        return send(200, 'text/html; charset=utf-8', page);
      }
      if (req.method === 'POST' && url.pathname === `${route}/alive`) {
        if (settled) return send(409, 'text/plain', 'already submitted');
        if (idle) deadline = Date.now() + idle * 1000;
        const left = idle ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : 0;
        return send(200, 'application/json', JSON.stringify({ remaining: left }));
      }
      if (req.method === 'POST' && url.pathname === `${route}/submit`) {
        if (settled) return send(409, 'text/plain', 'already submitted');
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY) {
            send(413, 'text/plain', 'too large');
            return;
          }
          chunks.push(chunk);
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, 'text/plain', 'not json');
        }
        let checked;
        try {
          checked = validateSubmission(body, files);
        } catch (error) {
          return send(400, 'text/plain', error.message);
        }
        const record = {
          change: options.change,
          revision,
          level,
          gate,
          ...checked,
          approvedBy,
          approvedAt: new Date().toISOString(),
        };
        await writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
        send(200, 'application/json', '{"ok":true}');
        finish(record.decision === 'approve' ? 0 : 2, record);
        return;
      }
      send(404, 'text/plain', 'not found');
    });

    server.on('error', reject);
    if (idle) {
      watchdog = setInterval(() => {
        if (Date.now() >= deadline) finish(3, null);
      }, 1000);
    }
    server.listen(options.port, '127.0.0.1', () => {
      const { port } = server.address();
      const link = `http://127.0.0.1:${port}${route}/`;
      console.log(`Gate open: ${options.change} r${revision} (${level}, ${gate}), ${files.length} artifact(s)`);
      console.log(`Page:      ${link}`);
      if (approvedBy) console.log(`Approval:  recorded as ${approvedBy}`);
      if (gate === 'adr' && collected.files.some((file) => file.kind === 'spec')) {
        console.log('Next gate: --gate spec, after this one is approved.');
      }
      console.log(
        idle
          ? `Waiting for the human. ${idle}s idle, then exit 3; the open page checks in every 10s. Ctrl-C to stop.`
          : 'Waiting for the human, no timeout. Ctrl-C to stop.',
      );
      if (options.open) openBrowser(link);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`gate: ${error.message}`);
      process.exit(1);
    });
}
