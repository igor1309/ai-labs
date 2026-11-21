import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { it } from 'node:test';
import { card, parseLocOutput, readRegistry, renderData, renderScript, sync } from '../../dashboard-sync-agent/sync.js';

const SCRIPT = `#!/usr/bin/env bash
# Options: --sort=name (default) | --sort=total
#
# ROW PROJECTS (update the loop in main when adding a new project):
#   alpha
check_project_drift() {
  local known="alpha docs"
}
for proj in alpha; do
  :
done
`;

const PRODUCTS = `<html>
  <section class="products">
    <h2 class="section-title">Products</h2>

    <h3 class="group-title">Applications</h3>
    <div class="product-grid">
    </div>

  </section>
</html>
`;

const DATA = `<script>
const data = [
  { name: "alpha",                code:    10, tests:     5, docs:     1 },
];
</script>
`;

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'dss-'));
  const all = {
    'scripts/loc-dashboard.sh': SCRIPT,
    'docs/products.html': PRODUCTS,
    'docs/loc-dashboard.html': DATA,
    ...files,
  };
  for (const [path, body] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const readme = (components, structure = '| `docs/` | Docs |') => `# Repo

## Components

| Component | Type | Description |
|-----------|------|-------------|
${components}

## Structure

| Path | Purpose |
|------|---------|
${structure}
`;

it('classifies registry rows into tracked, sub-component, removed and candidates', () => {
  const root = repo({
    'README.md': readme([
      '| alpha | Application | A. |',
      '| alpha-backend | Service | Backend of alpha. |',
      '| beta-cli | CLI release unit | Release unit. |',
      '| docker/langfuse | Observability | Tracing. |',
      '| gone | Tool | Was here. |',
      '| alpha | Tool | Duplicate. |',
    ].join('\n'), '| `prompts/` | Prompts |'),
    'alpha/README.md': '# Alpha\n',
    'prompts/x.md': 'x',
    'stray/x.md': 'x',
    '.agents/x.md': 'x',
    'docs/x.md': 'x',
  });
  const r = readRegistry(root);
  assert.deepEqual(r.tracked, ['alpha', 'prompts']);
  assert.deepEqual(r.removed, ['gone']);
  assert.deepEqual(r.candidates, ['.agents', 'stray']);
  assert.deepEqual(r.duplicates, ['alpha']);
});

it('reports a missing registry table as an error and keeps the other', () => {
  const root = repo({ 'README.md': '# Repo\n\n## Structure\n\n| Path | Purpose |\n|---|---|\n| `alpha/` | A |\n', 'alpha/x': 'x' });
  const r = readRegistry(root);
  assert.deepEqual(r.tracked, ['alpha']);
  assert.deepEqual(r.errors, ['## Components table missing or empty']);
});

it('renders the script header wrapped at 78 columns and keeps known carry-overs', () => {
  const names = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd', 'eeeeeeeeee', 'ffffffffff', 'gggggggggg'];
  const script = SCRIPT.replace('alpha docs', 'alpha docs stray');
  const { content } = renderScript(script, { tracked: names, candidates: ['stray'], removed: [] });
  const header = content.split('\n').filter((l) => l.startsWith('#   '));
  assert.deepEqual(header, [
    '#   aaaaaaaaaa, bbbbbbbbbb, cccccccccc, dddddddddd, eeeeeeeeee, ffffffffff,',
    '#   gggggggggg',
  ]);
  assert.ok(header.every((l) => l.length <= 78));
  assert.match(content, new RegExp(`^for proj in ${names.join(' ')}; do$`, 'm'));
  const known = content.match(/local known="(.*)"/)[1].split(' ');
  assert.ok(known.includes('stray') && known.includes('_inbox') && known.includes('docs'));
  assert.equal(known.at(-1), '_inbox');
  assert.deepEqual(known.slice(0, -1), [...known.slice(0, -1)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

it('reports script markers missing as an error', () => {
  assert.match(renderScript('#!/bin/bash\n', { tracked: [], candidates: [], removed: [] }).error, /markers missing/);
});

it('renders a card from the Components row and the project README', () => {
  const root = repo({
    'alpha/README.md': [
      '# Alpha', '', 'Landing page: index.html', '', '## Description', '',
      'Body with *em*, **strong**, `code <x>` and a [link](https://e.x).', '',
      '## Deployment', '', 'Runs at https://alpha.example.com. More.', '',
      '## Stack', '', '- Swift', '- Wasm', '',
    ].join('\n'),
  });
  const html = card(root, { key: 'alpha', type: 'Application', description: 'Lead sentence. Rest is ignored when README has a body.' });
  assert.equal(html, [
    '      <a class="product reveal" href="../alpha/index.html">',
    '        <div class="product-header">',
    '          <span class="product-name">Alpha</span>',
    '        </div>',
    '        <p class="product-desc">',
    '          <strong>Lead sentence.</strong> Body with <em>em</em>, <strong>strong</strong>, <code>code &lt;x&gt;</code> and a <a href="https://e.x">link</a>. Deployed at <code>https://alpha.example.com</code>.',
    '        </p>',
    '        <div class="product-stack">',
    '          <span class="tag">Swift</span>',
    '          <span class="tag">Wasm</span>',
    '        </div>',
    '      </a>',
  ].join('\n'));
});

it('uses a quoted title, the Description remainder and no stack when the README lacks them', () => {
  const root = repo({ 'the-thing/README.md': '# T\n\n## Stack\n\nSwift and Go.\n' });
  const html = card(root, { key: 'the-thing', type: 'Tool', description: '"The Thing" does it. Then more.' });
  assert.match(html, /<span class="product-name">The Thing<\/span>/);
  assert.match(html, /<strong>"The Thing" does it.<\/strong> Then more./);
  assert.doesNotMatch(html, /product-stack/);
  assert.match(html, /^      <div class="product reveal">/);
});

it('title-cases keys and applies the display-name table', () => {
  const root = repo({});
  assert.match(card(root, { key: 'claude-insights', type: 'Tooling', description: 'X' }), />Claude Insights</);
  assert.match(card(root, { key: 'mizan-ble', type: 'Product', description: 'X' }), />Mizan BLE</);
});

it('places unmapped types under Research and reports them', () => {
  const root = repo({ 'README.md': readme('| alpha | Product (concept) | A. |'), 'alpha/README.md': '# A\n' });
  const report = sync({ root, locOutput: 'alpha 10 5 1 16\n' });
  assert.deepEqual(report.unmapped, ['alpha (Product (concept))']);
  assert.match(readFileSync(join(root, 'docs/products.html'), 'utf8'), /Applications/); // dry run: untouched
  const write = sync({ root, write: true, locOutput: 'alpha 10 5 1 16\n' });
  assert.equal(write.surfaces[1].status, 'drift');
  const html = readFileSync(join(root, 'docs/products.html'), 'utf8');
  assert.match(html, /<h3 class="group-title">Research<\/h3>/);
  assert.doesNotMatch(html, /Applications/);
  assert.match(html, /<\/div>\n\n  <\/section>/);
});

it('reports missing products markers as an error and leaves the file alone', () => {
  const root = repo({ 'README.md': readme('| alpha | Application | A. |'), 'alpha/x': 'x', 'docs/products.html': '<html></html>\n' });
  const report = sync({ root, write: true, locOutput: 'alpha 10 5 1 16\n' });
  assert.equal(report.surfaces[1].status, 'error');
  assert.equal(readFileSync(join(root, 'docs/products.html'), 'utf8'), '<html></html>\n');
});

it('gates numeric data drift on the LOC threshold and never gates structure', () => {
  const rows = parseLocOutput('project code tests docs TOTAL\nalpha  10 5 1 16\nrepo-text 1 1 1 3\nTOTAL 1 1 1 3\n');
  assert.deepEqual(rows, [{ name: 'alpha', code: 10, tests: 5, docs: 1 }]);
  const near = renderData(DATA, [{ name: 'alpha', code: 309, tests: 5, docs: 1 }], 300);
  assert.equal(near.delta, 299);
  assert.equal(near.below, true);
  const at = renderData(DATA, [{ name: 'alpha', code: 310, tests: 5, docs: 1 }], 300);
  assert.equal(at.below, false);
  const added = renderData(DATA, [rows[0], { name: 'beta', code: 1, tests: 1, docs: 1 }], 300);
  assert.equal(added.structural, true);
  assert.equal(added.below, false);
  assert.match(added.content, /  \{ name: "beta",                 code:     1, tests:     1, docs:     1 \},/);
});

it('widens the name column for a long new name', () => {
  const long = 'a-very-long-project-name';
  const { content } = renderData(DATA, [{ name: 'alpha', code: 1, tests: 1, docs: 1 }, { name: long, code: 1, tests: 1, docs: 1 }], 0);
  const cols = content.split('\n').filter((l) => l.includes('name:')).map((l) => l.indexOf('code:'));
  assert.equal(new Set(cols).size, 1);
  assert.ok(cols[0] > `  { name: "${long}",`.length);
});

it('renders trunk script and products page without drift', () => {
  const report = sync({ root: process.cwd(), locOutput: '' });
  assert.deepEqual(report.registryErrors, []);
  assert.deepEqual(report.surfaces.slice(0, 2).map((s) => [s.path, s.status]), [
    ['scripts/loc-dashboard.sh', 'clean'],
    ['docs/products.html', 'clean'],
  ]);
});
