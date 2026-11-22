#!/usr/bin/env node
// Deterministic dashboard sync: renders scripts/loc-dashboard.sh, docs/products.html
// and the docs/loc-dashboard.html data array from the root README registries, per
// agent/project-registry.md and agent/synthesis-spec.md.
//
// Usage: node dashboard-sync-agent/sync.js [--root=<repo>] [--write] [--loc-threshold=<N>]
// Prints a JSON report on stdout. Exit 0 on success (drift or not), 2 on bad arguments.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXCLUDED = [
  'node_modules', 'vendor', '.git', '.github', '.claude', '.codex', '.lazyweb', '.wrangler',
  'worktrees', '_inbox', 'backlog',
  'docker', 'docs', 'img', 'migrate-to-skills', 'research', 'scripts', 'tests',
];

// Display names that title-casing cannot produce (synthesis-spec "Display names").
export const DISPLAY_NAMES = { 'mizan-ble': 'Mizan BLE' };

export const SUB_UNIT_TYPES = ['Release unit', 'CLI release unit'];

export const CATEGORIES = [
  ['Editorial', ['Editorial channel', 'Editorial Channel']],
  ['Applications', ['Application', 'Product', 'Product (research)', 'App family']],
  ['Web Apps', ['Web App', 'Static page']],
  ['Services', ['Service', 'Service (on hold)']],
  ['CLI & Tooling', ['CLI', 'CLI (Go)', 'CLI Utilities', 'CLI release unit', 'Tool', 'Tool (MVP stage)', 'Tooling']],
  ['MCP Servers', ['MCP Server', 'MCP tool']],
  ['Foundations', ['Framework', 'Library (Go)']],
  ['Concepts', ['Concept']],
  ['Observability & Automation', ['Observability', 'Automation']],
  ['Agents', ['Agent definition', 'Agent Definition', 'Agent definitions']],
  ['Research', ['Research']],
];

const AGGREGATE_ROWS = ['agents', 'repo-scripts'];
const DEFAULT_THRESHOLD = 300;

const ascii = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- registry ----------

function tableRows(readme, header) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => l.trim() === header);
  if (start < 0) return null;
  const rows = [];
  let seenTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    if (!line.trim().startsWith('|')) {
      if (seenTable) break;
      continue;
    }
    seenTable = true;
    const cells = splitRow(line);
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // drop the header row
}

function splitRow(line) {
  // Split on unescaped pipes outside backticks.
  const cells = [];
  let cur = '';
  let code = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '`') code = !code;
    if (ch === '|' && !code && body[i - 1] !== '\\') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isDir(root, key) {
  try {
    return statSync(join(root, key)).isDirectory();
  } catch {
    return false;
  }
}

export function readRegistry(root) {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const errors = [];
  const duplicates = [];
  const components = tableRows(readme, '## Components');
  const structure = tableRows(readme, '## Structure');
  if (!components || components.length === 0) errors.push('## Components table missing or empty');
  if (!structure || structure.length === 0) errors.push('## Structure table missing or empty');

  const entries = new Map(); // key -> {key, type, description, fromComponents}
  const removed = [];
  const keys = [];
  const seenComponents = new Set();
  for (const [key, type = '', description = ''] of components || []) {
    if (seenComponents.has(key)) {
      duplicates.push(key);
      continue;
    }
    seenComponents.add(key);
    keys.push({ key, type, description, fromComponents: true });
  }
  for (const [path] of structure || []) {
    const key = path.replace(/^`|`$/g, '').replace(/\/$/, '');
    keys.push({ key, type: '', description: '', fromComponents: false });
  }
  const pending = [];
  for (const row of keys) {
    if (isDir(root, row.key) && !row.key.includes('/')) {
      if (!entries.has(row.key) || (row.fromComponents && !entries.get(row.key).fromComponents)) {
        entries.set(row.key, row);
      }
    } else {
      pending.push(row);
    }
  }
  for (const row of pending) {
    if (entries.has(row.key)) continue;
    const parent = row.key.match(/^(.+)-[^-]+$/);
    const sub = row.key.includes('/') ||
      SUB_UNIT_TYPES.includes(row.type) ||
      (parent && [...entries.keys()].some((k) => row.key.startsWith(k + '-')));
    if (!sub && !removed.includes(row.key)) removed.push(row.key);
  }

  const tracked = [...entries.keys()].sort(ascii);
  const candidates = readdirSync(root)
    .filter((d) => isDir(root, d) && !EXCLUDED.includes(d) && !entries.has(d))
    .sort(ascii);
  return { tracked, entries, candidates, removed: removed.sort(ascii), errors, duplicates };
}

// ---------- surface (1): scripts/loc-dashboard.sh ----------

function wrapHeader(names) {
  const out = [];
  let line = '#  ';
  names.forEach((name, i) => {
    const word = name + (i < names.length - 1 ? ',' : '');
    if (line !== '#  ' && (line + ' ' + word).length > 78) {
      out.push(line);
      line = '#  ';
    }
    line += ' ' + word;
  });
  out.push(line);
  return out;
}

export function renderScript(current, registry) {
  const lines = current.split('\n');
  const head = lines.findIndex((l) => l.startsWith('# ROW PROJECTS'));
  const loop = lines.findIndex((l) => /^for proj in .*; do$/.test(l));
  const known = lines.findIndex((l) => /^  local known=".*"$/.test(l));
  if (head < 0 || loop < 0 || known < 0) {
    return { error: 'loc-dashboard.sh markers missing (ROW PROJECTS header, for proj loop or known list)' };
  }
  let end = head + 1;
  while (end < lines.length && lines[end].startsWith('#   ')) end++;

  const currentKnown = lines[known].match(/"(.*)"/)[1].split(/\s+/).filter(Boolean);
  const loopNames = lines[loop].replace(/^for proj in /, '').replace(/; do$/, '').split(' ');
  // Untracked names already in the script are left alone.
  const carry = registry.candidates.filter((c) => currentKnown.includes(c));
  // ASCII order, except names with a leading underscore go last (`_inbox`), as the script has them.
  const knownSet = [...new Set([...registry.tracked, ...EXCLUDED, ...carry])]
    .sort((a, b) => (a.startsWith('_') - b.startsWith('_')) || ascii(a, b));
  const loopSet = [...registry.tracked, ...registry.candidates.filter((c) => loopNames.includes(c))]
    .concat(registry.removed.filter((r) => loopNames.includes(r)))
    .sort(ascii);

  const next = [...lines];
  next[loop] = `for proj in ${loopSet.join(' ')}; do`;
  next[known] = `  local known="${knownSet.join(' ')}"`;
  next.splice(head + 1, end - head - 1, ...wrapHeader(loopSet));
  return { content: next.join('\n') };
}

// ---------- surface (2): docs/products.html ----------

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(md) {
  const parts = md.split(/(`[^`]*`)/);
  return parts.map((p) => {
    if (/^`[^`]*`$/.test(p)) return `<code>${escapeHtml(p.slice(1, -1))}</code>`;
    let s = escapeHtml(p);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }).join('');
}

function section(readme, titles) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => titles.includes(l.trim()));
  if (start < 0) return null;
  const body = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(l)) break;
    body.push(l);
  }
  return body;
}

function firstParagraph(lines) {
  const out = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (out.length) break;
      continue;
    }
    out.push(l.trim());
  }
  return out.length ? out.join(' ') : null;
}

function splitFirstSentence(text) {
  const m = text.match(/^(.*?[.!?])\s+(?=[A-Z])/);
  if (!m) return [text, ''];
  return [m[1], text.slice(m[0].length)];
}

function titleCase(key) {
  return key.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function card(root, entry) {
  const readmePath = join(root, entry.key, 'README.md');
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';
  const quoted = entry.description.match(/^"([^"]+)"/);
  const name = quoted ? quoted[1] : DISPLAY_NAMES[entry.key] ?? titleCase(entry.key);
  const [lead, rest] = splitFirstSentence(entry.description);
  const desc = readme ? firstParagraph(section(readme, ['## Description', '## Overview']) || []) : null;
  let body = desc ?? rest;

  const deployLine = readme.split('\n').find((l) => /^Deployed at: \S/.test(l));
  let url = deployLine ? deployLine.replace(/^Deployed at: /, '').trim() : null;
  if (!url && readme) {
    const dep = firstParagraph(section(readme, ['## Deployment']) || []);
    const m = dep && splitFirstSentence(dep)[0].match(/https?:\/\/\S+?(?=[.,;)]?(\s|$))/);
    if (m) url = m[0];
  }
  let html = `<strong>${inline(lead)}</strong>`;
  if (body) html += ` ${inline(body)}`;
  if (url) html += ` Deployed at <code>${escapeHtml(url)}</code>.`;

  const stackLines = readme ? section(readme, ['## Stack', '## Tech Stack', '## Tags']) : null;
  let tags = [];
  if (stackLines) {
    const items = stackLines.filter((l) => l.trim());
    if (items.length && items.every((l) => /^[-*] [^`*\[\]]+$/.test(l.trim()))) {
      tags = items.map((l) => l.trim().slice(2).trim());
    }
  }

  const landing = readme.split('\n').find((l) => l.startsWith('Landing page: '));
  let href = null;
  if (landing) {
    const v = landing.slice('Landing page: '.length).trim();
    href = /^https?:\/\//.test(v) ? v : `../${entry.key}/${v}`;
  }
  const open = href ? `<a class="product reveal" href="${href}">` : '<div class="product reveal">';
  const close = href ? '</a>' : '</div>';
  const out = [
    `      ${open}`,
    '        <div class="product-header">',
    `          <span class="product-name">${escapeHtml(name)}</span>`,
    '        </div>',
    '        <p class="product-desc">',
    `          ${html}`,
    '        </p>',
  ];
  if (tags.length) {
    out.push('        <div class="product-stack">');
    for (const t of tags) out.push(`          <span class="tag">${escapeHtml(t)}</span>`);
    out.push('        </div>');
  }
  out.push(`      ${close}`);
  return out.join('\n');
}

export function renderProducts(root, current, registry) {
  const lines = current.split('\n');
  const begin = lines.findIndex((l) => l.includes('<h2 class="section-title">Products</h2>'));
  const sectionOpen = lines.findIndex((l) => l.includes('<section class="products">'));
  let end = -1;
  for (let i = Math.max(begin, sectionOpen) + 1; i < lines.length; i++) {
    if (lines[i].includes('</section>')) { end = i; break; }
  }
  if (begin < 0 || sectionOpen < 0 || end < 0) {
    return { error: 'products.html region markers missing' };
  }
  const unmapped = [];
  const groups = new Map(CATEGORIES.map(([c]) => [c, []]));
  for (const key of registry.tracked) {
    const e = registry.entries.get(key);
    if (!e.fromComponents) continue;
    let cat = CATEGORIES.find(([, types]) => types.includes(e.type))?.[0];
    if (!cat) {
      unmapped.push(`${key} (${e.type})`);
      cat = 'Research';
    }
    groups.get(cat).push(card(root, e));
  }
  const region = [];
  for (const [cat, cards] of groups) {
    if (!cards.length) continue;
    if (region.length) region.push('');
    region.push(`    <h3 class="group-title">${escapeHtml(cat)}</h3>`);
    region.push('    <div class="product-grid">');
    region.push(...cards);
    region.push('    </div>');
  }
  let last = end - 1;
  while (last > begin && !lines[last].trim()) last--;
  const next = [...lines.slice(0, begin + 1), '', ...region, ...lines.slice(last + 1)];
  return { content: next.join('\n'), unmapped };
}

// ---------- surface (3): docs/loc-dashboard.html data array ----------

export function parseLocOutput(out) {
  const rows = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
    if (!m || m[1] === 'TOTAL' || m[1] === 'repo-text') continue;
    rows.push({ name: m[1], code: +m[2], tests: +m[3], docs: +m[4] });
  }
  return rows;
}

export function renderData(current, rows, threshold) {
  const start = current.indexOf('const data = [\n');
  const end = start < 0 ? -1 : current.indexOf('\n];', start);
  if (start < 0 || end < 0) return { error: 'loc-dashboard.html `const data = [` block missing' };
  const block = current.slice(start + 'const data = [\n'.length, end);
  const old = new Map();
  let codeCol = 0;
  for (const l of block.split('\n')) {
    const m = l.match(/^\s*\{ name: "([^"]+)",(\s*)code:\s*(\d+), tests:\s*(\d+), docs:\s*(\d+) \},?$/);
    if (!m) continue;
    if (!codeCol) codeCol = l.indexOf('code:');
    old.set(m[1], { code: +m[3], tests: +m[4], docs: +m[5] });
  }
  if (!rows.length) return { error: 'loc-dashboard.sh output unparseable' };
  const sorted = [...rows].sort((a, b) => ascii(a.name, b.name));
  const minCol = Math.max(...sorted.map((r) => `  { name: "${r.name}", `.length));
  const col = Math.max(codeCol, minCol);
  const num = (n) => String(n).padStart(5);
  const body = sorted.map((r) => {
    const prefix = `  { name: "${r.name}",`;
    return `${prefix.padEnd(col)}code: ${num(r.code)}, tests: ${num(r.tests)}, docs: ${num(r.docs)} },`;
  }).join('\n');
  const content = current.slice(0, start + 'const data = [\n'.length) + body + current.slice(end);
  const names = new Set(sorted.map((r) => r.name));
  const structural = sorted.some((r) => !old.has(r.name)) || [...old.keys()].some((n) => !names.has(n));
  let delta = 0;
  for (const r of sorted) {
    const o = old.get(r.name);
    if (o) delta += Math.abs(r.code - o.code) + Math.abs(r.tests - o.tests) + Math.abs(r.docs - o.docs);
  }
  return { content, structural, delta, below: !structural && delta < threshold };
}

// ---------- run ----------

function diffCount(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const counts = new Map();
  for (const l of al) counts.set(l, (counts.get(l) || 0) + 1);
  let add = 0;
  for (const l of bl) {
    if (counts.get(l)) counts.set(l, counts.get(l) - 1);
    else add++;
  }
  let rem = 0;
  for (const v of counts.values()) rem += v;
  return { add, rem };
}

export function sync({ root, write = false, threshold = DEFAULT_THRESHOLD, locOutput }) {
  const registry = readRegistry(root);
  const surfaces = [];
  const record = (path, result, extra = {}) => {
    const file = join(root, path);
    const current = readFileSync(file, 'utf8');
    if (result.error) {
      surfaces.push({ path, status: 'error', add: 0, rem: 0, note: result.error });
      return;
    }
    if (result.content === current || result.below) {
      const note = result.below ? `below LOC threshold: ${result.delta} < ${threshold}` : '';
      surfaces.push({ path, status: 'clean', add: 0, rem: 0, note, ...extra });
      return;
    }
    const { add, rem } = diffCount(current, result.content);
    surfaces.push({ path, status: 'drift', add, rem, note: '', ...extra });
    if (write) writeFileSync(file, result.content);
  };

  const scriptPath = 'scripts/loc-dashboard.sh';
  const script = renderScript(readFileSync(join(root, scriptPath), 'utf8'), registry);
  record(scriptPath, script);

  const productsPath = 'docs/products.html';
  const products = renderProducts(root, readFileSync(join(root, productsPath), 'utf8'), registry);
  record(productsPath, products);

  // The data array is computed from the script with surface (1) applied, so a
  // dry run feeds the rendered script, not the file on disk.
  const dataPath = 'docs/loc-dashboard.html';
  let locOut = locOutput;
  if (locOut === undefined) {
    try {
      const scriptBody = script.content ?? readFileSync(join(root, scriptPath), 'utf8');
      locOut = execFileSync('bash', ['-s', '--', '--sort=name'], {
        cwd: root, input: scriptBody, encoding: 'utf8', maxBuffer: 16 << 20,
      });
    } catch (e) {
      locOut = '';
    }
  }
  record(dataPath, renderData(readFileSync(join(root, dataPath), 'utf8'), parseLocOutput(locOut), threshold));

  return {
    tracked: registry.tracked.length,
    candidates: registry.candidates,
    removed: registry.removed,
    registryErrors: registry.errors,
    duplicates: registry.duplicates,
    unmapped: products.unmapped || [],
    surfaces,
    drifted: surfaces.filter((s) => s.status === 'drift').length,
    errors: surfaces.filter((s) => s.status === 'error').length,
  };
}

// ---------- report rendering ----------

const SHORT = {
  'scripts/loc-dashboard.sh': 'loc-dashboard.sh',
  'docs/products.html': 'products.html',
  'docs/loc-dashboard.html': 'loc-dashboard.html',
};

function statusToken(s) {
  if (s.status === 'drift') return `drift (+${s.add} -${s.rem})`;
  if (s.status === 'error') return `error: ${s.note}`;
  return s.note ? `clean (${s.note})` : 'clean';
}

const capped = (list) => list.slice(0, 10).join(', ') + (list.length > 10 ? ', …' : '');

// Plain-text summary per notification-spec.md; empty when there is nothing to report.
export function summary(report, { stamp, prUrl }) {
  const head = `[dashboard-sync] scheduled · ${stamp}`;
  if (report.drifted > 0) {
    const lines = [
      head, '',
      `${report.drifted}/3 surfaces drifted, ${report.errors}/3 in error`,
      `Tracked: ${report.tracked} projects · Candidates: ${report.candidates.length} · Removed: ${report.removed.length}`,
      '', `PR: ${prUrl || '(no PR link)'}`, '',
      ...report.surfaces.map((s) => `· ${SHORT[s.path]}: ${statusToken(s)}`),
    ];
    if (report.candidates.length) lines.push(`Candidates: ${capped(report.candidates)}`);
    if (report.removed.length) lines.push(`Removed: ${capped(report.removed)}`);
    return lines.join('\n');
  }
  if (report.errors > 0) {
    return [
      head, '', `${report.errors}/3 surfaces in error. No drift detected on the rest.`, 'No PR opened.',
      ...report.surfaces.filter((s) => s.status === 'error').map((s) => `· ${SHORT[s.path]}: ${statusToken(s)}`),
    ].join('\n');
  }
  return '';
}

const listSection = (title, items, empty = 'none') =>
  [`## ${title}`, '', ...(items.length ? items.map((i) => `- ${i}`) : [empty]), ''];

export function prBody(report, { commit }) {
  return [
    '# Dashboard sync report', '',
    `- Tracked projects: ${report.tracked}`,
    `- Surfaces drifted: ${report.drifted}`,
    `- Surfaces in error: ${report.errors}`, '',
    '| Surface | Status | Added | Removed | Note |',
    '|---------|--------|-------|---------|------|',
    ...report.surfaces.map((s) => `| ${s.path} | ${s.status} | ${s.add} | ${s.rem} | ${s.note} |`), '',
    ...listSection('Untracked candidates', report.candidates),
    ...listSection('Removed-directory drift', report.removed),
    ...listSection('Unmapped types', report.unmapped),
    ...listSection('Registry errors', [...report.registryErrors, ...report.duplicates.map((d) => `duplicate Components key: ${d}`)]),
    '---', '',
    '**Do not auto-merge.** Generated by `dashboard-sync-agent/sync.js`, which never merges or approves PRs.', '',
    '`docs/products.html` cards are regenerated from the root README `## Components` table and per-project',
    'READMEs on every run; manual edits to that file are not preserved.', '',
    'Untracked candidates are top-level directories absent from both `## Components` and `## Structure`:',
    'add a table row or extend the excluded list in `dashboard-sync-agent/agent/project-registry.md`.',
    'Removed-directory drift is a registry row whose directory no longer exists: remove the row.', '',
    `Source: trunk at ${commit}.`, '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}` && ['summary', 'pr-body'].includes(process.argv[2])) {
  const out = formatCli(process.argv.slice(2));
  if (out) process.stdout.write(out + '\n');
} else if (import.meta.url === `file://${process.argv[1]}`) {
  let root = process.cwd();
  let write = false;
  let threshold = DEFAULT_THRESHOLD;
  const notes = [];
  for (const a of process.argv.slice(2)) {
    if (a === '--write') write = true;
    else if (a.startsWith('--root=')) root = a.slice(7);
    else if (a.startsWith('--loc-threshold=')) {
      const v = a.slice(16);
      if (/^\d+$/.test(v)) threshold = Number(v);
      else notes.push(`malformed --loc-threshold=${v}; using ${DEFAULT_THRESHOLD}`);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  const report = sync({ root, write, threshold });
  report.notes = notes;
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

// `node sync.js summary|pr-body <report.json> <stamp-or-commit> [prUrl]`
export function formatCli(argv) {
  const [mode, file, arg, prUrl] = argv;
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (mode === 'summary') return summary(report, { stamp: arg, prUrl });
  if (mode === 'pr-body') return prBody(report, { commit: arg });
  throw new Error(`unknown format mode: ${mode}`);
}
