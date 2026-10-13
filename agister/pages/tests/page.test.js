import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../repos.js';
import '../config.js';
import '../runs.js';
import './markdown-it.js';
import '../knowledge.js';
import '../page.js';
import { pageDocument, Event } from './dom.js';

const P = globalThis.AgisterPage;
const VIEW_KEY = globalThis.AgisterRuns.VIEW_KEY;

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    raw: (k) => data.get(k),
  };
}

const respond = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// A promise the test settles when it chooses.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

// Lets every answered request and what it sets off run to the end.
async function settle() {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
}

// Summaries as pages/runs.go writes them: a call that is a node of the
// workflow run wf-1, and the workflow with its judge's items.
const call = {
  id: 'call-1', process: 'implement', agent: 'opus', created_at: '2026-10-01T10:00:00Z', finished_at: '2026-10-01T10:01:47Z', status: 'completed',
  implementor: { adapter: 'claude-code', version: '2.1', model: 'opus', reported_model: 'claude-opus-5-5', effort: 'high' },
  policy: { timeout_ms: 1200000, max_cost_usd: 5, access: 'read-write', scope: 'candidate' },
  outcome: { verify: { attempts: 2, passed: true }, wall_ms: 107000, turn_ms: 100000, runtime_ms: 412, cost_usd: 0.5, cost_source: 'runtime' },
  parent: 'wf-1', skills: [{ name: 'review', count: 3 }, { name: 'go', count: 1 }], tool_calls: 12,
};
const workflow = {
  id: 'wf-1', process: 'panel', created_at: '2026-10-01T09:59:00Z', status: 'completed', outcome: { wall_ms: 120000 },
  workflow: {
    nodes: [
      { name: 'first', process: 'implement', run: 'call-1', status: 'completed', wall_ms: 107000, cost_usd: 0.5 },
      { name: 'judge', process: 'judge', join: true, run: 'judge-1', status: 'failed' },
    ],
    items: {
      total: 3, by_ruling: { fix: 2, defer: 1 }, by_severity: { major: 1, minor: 2 },
      by_source: [{ source: 1, node: 'first', run: 'call-1', by_ruling: { fix: 2, defer: 1 } }],
    },
  },
};
const later = { ...call, id: 'call-2', created_at: '2026-10-01T11:00:00Z', parent: undefined };
const compare = {
  groups: [
    { process: 'implement', adapter: 'claude-code', model: 'opus', effort: 'high', runs: 3, completed: 2, pass_rate: 2 / 3,
      mean_verify_attempts: 1.5, median_wall_ms: 107000, total_cost_usd: 1, cost_unknown: 1, cost_per_completed_usd: 0.5 },
    { process: 'review', adapter: 'codex', model: 'gpt-6.1-sol', effort: '', runs: 1, completed: 0, pass_rate: 0,
      median_wall_ms: 412, total_cost_usd: 0, cost_unknown: 1 },
  ],
  skipped: 0,
};
// Records as stored: a field no summary carries shows they are the record's.
const callRecord = { id: 'call-1', request: { cwd: '/w/run' }, verify: { max_attempts: 3 }, from_a_newer_agister: { kept: [1, 2] } };
const workflowRecord = { id: 'wf-1', workflow: { barrier: { state: 'passed' } } };
const agent = { 'agents/opus.toml': 'name = "opus"\nruntime = "claude-code"\nmodel = "opus"\neffort = "high"\n' };

// The page over a fake server: answers maps a request's URL to its
// response (a promise for one the test answers later); calls lists the
// URLs asked for, in order.
function page({ storage = fakeStorage(), answers = {} } = {}) {
  const calls = [];
  const asked = (prefix) => calls.filter((u) => u === prefix || u.startsWith(`${prefix}?`)).length;
  const fallback = {
    'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files: {} }),
    'api/skills': () => respond({ path: '~', home: true, adapters: [], folders: [], settings: [] }),
    'api/runs': () => respond({ runs: [call, workflow], total: 2, skipped: 0 }),
    'api/runs/compare': () => respond(compare),
    'api/runs/call-1': () => respond({ summary: call, record: callRecord }),
    'api/runs/wf-1': () => respond({ summary: workflow, record: workflowRecord }),
  };
  const fetch = async (url) => {
    calls.push(url);
    const route = url.split('?')[0];
    const answer = answers[route] ?? fallback[route];
    if (!answer) return respond({ error: `no ${url}` }, 404);
    return answer(asked(route), url);
  };
  const document = pageDocument();
  const location = { protocol: 'http:', hash: '' };
  const started = P.start({ document, fetch, localStorage: storage, location, navigator: {}, setTimeout: (fn) => queueMicrotask(fn) });
  const $ = (id) => document.getElementById(id);
  return {
    started, calls, asked, storage, document, location, $,
    rows: () => document.querySelectorAll('#run-list tr.pick'),
    row: (id) => document.querySelectorAll('#run-list tr.pick').find((r) => r.title === id),
    shown: () => ({ settings: !$('dashboard').hidden, runs: !$('runs').hidden, compare: !$('compare').hidden }),
    pressed: (view) => $(`view-${view}`).getAttribute('aria-pressed'),
    // The run opened over the list, by its ID, or null when none shows.
    detail: () => ($('run-overlay')?.hidden === false ? $('run-detail').querySelector('article')?.dataset.run ?? null : null),
    // The cells of a table row, as text.
    cells: (row) => row.children.map((td) => td.textContent),
    // The compare tables: per process, its rows' cells.
    compared: () => $('compare').querySelectorAll('section.card').filter((s) => s.parentNode === $('compare')).map((s) => ({
      process: s.querySelector('h3').textContent,
      rows: s.querySelectorAll('tbody tr').map((tr) => tr.children.map((td) => td.textContent)),
    })),
    // The opened run's facts: each label's lines, a line per innermost div.
    facts: () => {
      const nodes = $('run-detail').querySelector('div.facts').children;
      const facts = {};
      for (let i = 0; i < nodes.length; i += 2) {
        const value = nodes[i + 1];
        const lines = value.querySelectorAll('div').filter((d) => !d.querySelector('div')).map((d) => d.textContent);
        facts[nodes[i].textContent] = lines.length ? lines : [value.textContent];
      }
      return facts;
    },
    // Sets the filter name to value, as choosing it in its select does.
    filter: (name, value) => {
      const node = $('runs').querySelectorAll('select').find((s) => s.name === name);
      node.value = value;
      node.dispatchEvent(new Event('change'));
    },
  };
}

test('the view chosen is shown and remembered, and the page starts in it next time', async () => {
  const storage = fakeStorage();
  const p = page({ storage });
  await p.started;
  assert.deepEqual(p.shown(), { settings: true, runs: false, compare: false });
  assert.equal(p.pressed('settings'), 'true');
  assert.equal(p.asked('api/runs'), 0);
  assert.match(p.$('dashboard').textContent, /Agister home/);

  p.$('view-runs').click();
  await settle();
  assert.equal(storage.raw(VIEW_KEY), 'runs');
  assert.deepEqual(p.shown(), { settings: false, runs: true, compare: false });
  assert.deepEqual([p.pressed('settings'), p.pressed('runs')], ['false', 'true']);
  assert.deepEqual(p.rows().map((r) => r.title), ['call-1', 'wf-1']);
  assert.match(p.$('runs').textContent, /claude-code/);
  assert.doesNotMatch(p.$('run-list').textContent, /null/);
  assert.match(p.$('read-at').title, /^Runs read/);

  // The next visit opens on Runs and reads them.
  const next = page({ storage });
  await next.started;
  assert.deepEqual(next.shown(), { settings: false, runs: true, compare: false });
  assert.equal(next.pressed('runs'), 'true');
  assert.deepEqual(next.rows().map((r) => r.title), ['call-1', 'wf-1']);

  next.$('view-settings').click();
  await settle();
  assert.equal(storage.raw(VIEW_KEY), 'settings');
  assert.deepEqual(next.shown(), { settings: true, runs: false, compare: false });
});

test('refresh reads the shown view again and only that one', async () => {
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: {
      // The second read of the runs finds a new one; the third read of the
      // settings finds an agent.
      'api/runs': (n) => respond({ runs: n > 1 ? [later, call, workflow] : [call, workflow], total: n > 1 ? 3 : 2, skipped: 0 }),
      'api/settings': (n) => respond({ path: '~', dir: '/u/.agister', home: true, files: n > 2 ? agent : {} }),
    },
  });
  await p.started;
  assert.deepEqual(p.rows().map((r) => r.title), ['call-1', 'wf-1']);
  assert.deepEqual([p.asked('api/runs'), p.asked('api/settings')], [1, 1]);

  p.$('refresh').click();
  assert.ok(p.$('refresh').classList.contains('spinning'));
  await settle();
  assert.ok(!p.$('refresh').classList.contains('spinning'));
  assert.deepEqual(p.rows().map((r) => r.title), ['call-2', 'call-1', 'wf-1']);
  assert.deepEqual([p.asked('api/runs'), p.asked('api/settings')], [2, 1]);

  p.$('view-settings').click();
  await settle();
  assert.doesNotMatch(p.$('dashboard').textContent, /opus/);
  p.$('refresh').click();
  await settle();
  assert.deepEqual([p.asked('api/runs'), p.asked('api/settings')], [2, 3]);
  assert.match(p.$('dashboard').textContent, /Agents.*opus/s);
  assert.match(p.$('read-at').title, /^Settings read/);
});

test('a row opens its run over the list; its links open other runs in its place', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;
  assert.equal(p.detail(), null);
  assert.equal(p.$('run-overlay').hidden, true);

  p.row('call-1').click();
  await settle();
  assert.equal(p.calls.at(-1), 'api/runs/call-1');
  assert.equal(p.detail(), 'call-1');
  assert.ok(p.row('call-1').classList.contains('chosen'));
  assert.equal(p.document.activeElement, p.$('run-close'));
  assert.equal(p.$('run-detail').getAttribute('role'), 'dialog');

  // The workflow fact links to the parent; following it opens the parent
  // in its place.
  const link = p.$('run-detail').querySelectorAll('a').find((a) => a.textContent === 'the workflow run');
  assert.equal(link.href, '#wf-1');
  assert.equal(link.title, 'wf-1');
  assert.ok(link.click().defaultPrevented);
  await settle();
  assert.equal(p.calls.at(-1), 'api/runs/wf-1');
  assert.equal(p.detail(), 'wf-1');
  assert.equal(p.location.hash, '');
  assert.deepEqual(p.rows().filter((r) => r.classList.contains('chosen')).map((r) => r.title), ['wf-1']);

  // A node opens its run.
  p.$('run-detail').querySelectorAll('a').find((a) => a.textContent === 'first').click();
  await settle();
  assert.equal(p.detail(), 'call-1');
});

test('Close, Escape and a click beside the run close it and give its row the focus', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;
  const closed = () => {
    assert.equal(p.detail(), null);
    assert.equal(p.$('run-overlay').hidden, true);
    assert.deepEqual(p.rows().filter((r) => r.classList.contains('chosen')), []);
  };

  p.row('call-1').click();
  await settle();
  p.$('run-close').click();
  closed();
  assert.equal(p.document.activeElement, p.row('call-1'));

  p.row('wf-1').click();
  await settle();
  // A click inside the run leaves it open; one beside it closes it.
  p.$('run-detail').querySelector('h3').click();
  assert.equal(p.detail(), 'wf-1');
  p.$('run-overlay').click();
  closed();
  assert.equal(p.document.activeElement, p.row('wf-1'));

  p.row('call-1').click();
  await settle();
  p.document.dispatchEvent(new Event('keydown', { key: 'Escape' }));
  closed();

  // A run that cannot be read says why over the list, and closes the same.
  const failing = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }), answers: { 'api/runs/call-1': () => respond({ error: 'gone' }, 404) } });
  await failing.started;
  failing.row('call-1').click();
  await settle();
  assert.equal(failing.$('run-overlay').hidden, false);
  assert.equal(failing.$('run-detail').querySelector('p.error').textContent, 'call-1: gone');
  failing.$('run-close').click();
  assert.equal(failing.$('run-overlay').hidden, true);
});

test('a Runs read that succeeds after the user went to Settings leaves the read time and the status alone', async () => {
  const runs = deferred();
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }), answers: { 'api/runs': () => runs.promise } });
  await settle();
  p.$('view-settings').click();
  await settle();
  assert.match(p.$('read-at').title, /^Settings read/);

  runs.resolve(respond({ runs: [call], total: 1, skipped: 0 }));
  await p.started;
  await settle();
  assert.match(p.$('read-at').title, /^Settings read/);
  assert.equal(p.$('status').hidden, true);
  assert.deepEqual(p.shown(), { settings: true, runs: false, compare: false });
});

test('a Runs read that fails after the user went to Settings does not show its error', async () => {
  const runs = deferred();
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }), answers: { 'api/runs': () => runs.promise } });
  await settle();
  p.$('view-settings').click();
  await settle();

  runs.resolve(respond({ error: 'the runs could not be read' }, 500));
  await p.started;
  await settle();
  assert.equal(p.$('status').hidden, true);
  assert.equal(p.$('status').textContent, '');
  assert.match(p.$('read-at').title, /^Settings read/);
});

test('a Runs read that fails while Runs is shown says why', async () => {
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/runs': () => respond({ error: 'the runs could not be read' }, 500) },
  });
  await p.started;
  assert.equal(p.$('status').hidden, false);
  assert.equal(p.$('status').textContent, 'the runs could not be read');
});

test('Compare is its own view: it reads the comparison only, and Runs the runs only', async () => {
  const storage = fakeStorage();
  const p = page({ storage });
  await p.started;
  p.$('view-compare').click();
  await settle();
  assert.equal(storage.raw(VIEW_KEY), 'compare');
  assert.deepEqual(p.shown(), { settings: false, runs: false, compare: true });
  assert.deepEqual([p.pressed('runs'), p.pressed('compare')], ['false', 'true']);
  assert.deepEqual([p.asked('api/runs/compare'), p.asked('api/runs')], [1, 0]);
  assert.match(p.$('read-at').title, /^Compare read/);
  assert.deepEqual(p.compared(), [
    { process: 'implement', rows: [['claude-code', 'opus', 'high', '3', '2', '67%', '1.5', '1m 47s', '$0.50 (1 unknown)']] },
    { process: 'review', rows: [['codex', 'gpt-6.1-sol', '-', '1', '0', '0%', '', '412ms', '(1 unknown)']] },
  ]);

  p.$('refresh').click();
  await settle();
  assert.deepEqual([p.asked('api/runs/compare'), p.asked('api/runs')], [2, 0]);

  p.$('view-runs').click();
  await settle();
  assert.deepEqual(p.shown(), { settings: false, runs: true, compare: false });
  assert.deepEqual([p.asked('api/runs/compare'), p.asked('api/runs')], [2, 1]);
  assert.equal(p.$('runs').querySelector('section.card table th').textContent, 'Started');

  // The next visit opens on Compare and reads it.
  const next = page({ storage: fakeStorage({ [VIEW_KEY]: 'compare' }) });
  await next.started;
  assert.deepEqual(next.shown(), { settings: false, runs: false, compare: true });
  assert.equal(next.compared().length, 2);
});

test('a process in Compare shows Runs with only its runs, whatever was filtered before', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;
  p.filter('status', 'completed');
  p.$('view-compare').click();
  await settle();

  const link = p.$('compare').querySelectorAll('h3 a').find((a) => a.textContent === 'implement');
  assert.equal(link.href, '#implement');
  assert.ok(link.click().defaultPrevented);
  await settle();
  assert.deepEqual(p.shown(), { settings: false, runs: true, compare: false });
  assert.equal(p.location.hash, '');
  const chosen = (name) => p.$('runs').querySelectorAll('select').find((s) => s.name === name).children.find((o) => o.selected)?.value ?? '';
  assert.deepEqual([chosen('process'), chosen('status')], ['implement', '']);
  assert.deepEqual(p.rows().map((r) => r.title), ['call-1']);
});

test('a Compare read that ends after the user went to Runs leaves the read time and the status alone', async () => {
  const compared = deferred();
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'compare' }),
    answers: { 'api/runs/compare': () => compared.promise },
  });
  await settle();
  p.$('view-runs').click();
  await settle();
  assert.match(p.$('read-at').title, /^Runs read/);

  compared.resolve(respond({ error: 'the runs could not be read' }, 500));
  await p.started;
  await settle();
  assert.match(p.$('read-at').title, /^Runs read/);
  assert.equal(p.$('status').hidden, true);
  assert.deepEqual(p.compared(), []);
});

test('a Settings read that fails while Compare is shown says why only once Settings is shown', async () => {
  const settings = deferred();
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'compare' }), answers: { 'api/settings': () => settings.promise } });
  await settle();
  assert.equal(p.compared().length, 2);

  settings.resolve(respond({ error: 'no .agister folder at /gone/.agister' }, 404));
  await p.started;
  await settle();
  assert.equal(p.$('status').hidden, true);
  assert.match(p.$('read-at').title, /^Compare read/);

  p.$('view-settings').click();
  await settle();
  assert.equal(p.$('status').textContent, 'no .agister folder at /gone/.agister');
});

test('the run list shows what the summaries carry', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;

  // The started cell is in local time; the rest as the page writes it.
  assert.ok(p.cells(p.row('call-1'))[0]);
  assert.deepEqual(p.cells(p.row('call-1')).slice(1),
    ['implement', 'claude-code opus high', '✓', '2 ✓', '1m 47s', '$0.50', 'review×3, go', '12']);
  assert.equal(p.row('call-1').children[3].querySelector('span').title, 'completed');
  assert.equal(p.row('call-1').children[7].title, 'review×3, go');
  assert.equal(p.row('call-1').children[2].querySelector('span').title, 'the runtime reported claude-opus-5-5');
  // A workflow's row: its nodes and its judge's rulings.
  assert.deepEqual(p.cells(p.row('wf-1')).slice(1),
    ['panel', '2 nodes', '✓', '', '2m 0s', '', 'fix 2, defer 1', '']);
});

test('an opened run heads with its process, status, cost and wall, and keeps its ID small', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;
  p.row('call-1').click();
  await settle();
  const title = p.$('run-detail').querySelector('div.run-title');
  assert.deepEqual(title.children.map((c) => c.textContent), ['implement', '✓', '$0.50', '1m 47s']);
  assert.equal(title.querySelector('span.mark').title, 'completed');
  assert.equal(title.children[2].title, 'cost, from the runtime');
  const when = p.$('run-detail').querySelector('p.run-when');
  assert.match(when.textContent, /^\S.* – .*, .* · agent opus · call-1$/);
  assert.equal(when.querySelector('span.run-id').textContent, 'call-1');
  assert.deepEqual(p.$('run-detail').querySelectorAll('h3').map((h) => h.textContent), ['implement']);
});

test('an opened run shows its facts, a workflow its nodes as a table, and the record folded', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;

  p.row('call-1').click();
  await settle();
  assert.deepEqual(p.facts(), {
    implementor: ['claude-code 2.1 · opus · high effort · the runtime reported claude-opus-5-5'],
    limits: ['read-write workspace · 20m 0s · $5.00 cap · scope candidate'],
    verify: ['2/3 ✓'],
    timing: ['turn 1m 40s · runtime 412ms'],
    activity: ['12 tool calls'],
    skills: ['review×3, go'],
    workflow: ['the workflow run'],
  });
  assert.equal(p.$('run-detail').querySelector('div.nodes'), null);
  const record = p.$('run-detail').querySelector('details.record');
  assert.ok(!record.open);
  assert.equal(record.querySelector('summary').textContent, 'Record as stored');
  assert.deepEqual(JSON.parse(record.querySelector('pre').textContent), callRecord);

  p.row('wf-1').click();
  await settle();
  assert.deepEqual(p.facts(), {
    rulings: ['fix 2, defer 1 (3 items)'],
    severities: ['minor 2, major 1'],
  });
  const nodes = p.$('run-detail').querySelector('div.nodes table');
  assert.deepEqual(nodes.querySelectorAll('th').map((th) => th.textContent), ['Node', 'Process', 'Status', 'Wall', 'Cost', 'Rulings']);
  assert.deepEqual(nodes.querySelectorAll('tbody tr').map(p.cells), [
    ['first', 'implement', '✓', '1m 47s', '$0.50', 'fix 2, defer 1'],
    ['judge join', 'judge', '⚠\uFE0E', '', '', ''],
  ]);
  assert.deepEqual(nodes.querySelectorAll('span.mark').map((m) => [m.title, m.className]), [['completed', 'mark ok'], ['failed', 'mark failed']]);
  assert.deepEqual(JSON.parse(p.$('run-detail').querySelector('details.record pre').textContent), workflowRecord);
});

test('an opened run shows what its result says above the record: verdict in the head, findings as cards, coverage as a table', async () => {
  const reviewed = {
    status: 'completed',
    output: {
      verdict: 'request_changes', summary: 'One **real** finding.',
      findings: [{ severity: 'major', file: 'a.go', line: 12, title: 'A race', detail: 'It races.', fix_cost: { size: 'small' } }],
      coverage: [{ item: '1. Paths', status: 'checked', detail: 'Read it.' }, { item: '2. Tests', status: 'finding', detail: 'See finding 1.' }],
    },
    text: '{"verdict":"request_changes"}',
  };
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/runs/call-1': () => respond({ summary: call, record: { ...callRecord, result: reviewed } }) },
  });
  await p.started;
  p.row('call-1').click();
  await settle();
  const d = p.$('run-detail');
  const verdict = d.querySelector('div.run-title span.verdict');
  assert.equal(verdict.textContent, 'request changes');
  assert.ok(verdict.classList.contains('tone-bad'));

  const card = d.querySelector('article.run-card').children;
  const output = d.querySelector('section.output');
  assert.ok(card.indexOf(output) < card.indexOf(d.querySelector('details.record')));
  assert.deepEqual(output.children.map((c) => c.dataset.key), ['summary', 'findings', 'coverage']);
  assert.equal(output.children[0].querySelector('strong').textContent, 'real');

  const finding = output.querySelector('article.finding');
  assert.deepEqual(finding.querySelector('div.finding-head').children.map((c) => c.textContent), ['major', 'A race', 'a.go:12']);
  assert.ok(finding.querySelector('span.chip').classList.contains('tone-bad'));
  assert.equal(finding.querySelector('div.finding-text').textContent, 'It races.');
  assert.match(finding.querySelector('details.more').textContent, /^morefix costsizesmall$/);

  const coverage = output.querySelector('table.part-table');
  assert.deepEqual(coverage.querySelectorAll('th').map((th) => th.textContent), ['item', 'status', 'detail']);
  assert.deepEqual(coverage.querySelectorAll('tbody tr').map(p.cells), [['1. Paths', 'checked', 'Read it.'], ['2. Tests', 'finding', 'See finding 1.']]);
  assert.deepEqual(coverage.querySelectorAll('tbody tr').map((tr) => tr.children[1].className), ['tone-ok', 'tone-bad']);
  // The text is the output as JSON: not shown again.
  assert.doesNotMatch(output.textContent, /"verdict"/);
});

test('a failed run shows its error first, then its text, and no verdict', async () => {
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/runs/call-1': () => respond({ summary: call, record: { result: { status: 'failed', error: { class: 'rate_limited', message: 'Hit the limit.' }, text: 'Got as far as *this*.' } } }) },
  });
  await p.started;
  p.row('call-1').click();
  await settle();
  const parts = p.$('run-detail').querySelector('section.output').children;
  assert.deepEqual(parts.map((c) => [c.dataset.key, c.querySelector('h4').textContent, c.querySelector('div.markdown').textContent]),
    [['error', 'error: rate limited', 'Hit the limit.'], ['text', 'text', 'Got as far as this.']]);
  assert.equal(p.$('run-detail').querySelector('span.verdict'), null);
});

// The records committed under testdata/records, runs made before a workflow
// bound an agent (ADR-030 rule 11), as the page gets them: the list as
// testdata/pages/runs.json holds it, which cmd/agister's test of these
// records holds to what their home's pages serve, and each run as its
// summary there with its record as committed.
const committed = (path) => JSON.parse(readFileSync(new URL(`../../testdata/${path}`, import.meta.url), 'utf8'));
const todaysRuns = committed('pages/runs.json');
const todaysRecord = (id) => committed(`records/${id}/record.json`);
const todaysAnswers = {
  'api/runs': () => respond(todaysRuns),
  ...Object.fromEntries(todaysRuns.runs.map((summary) =>
    [`api/runs/${summary.id}`, () => respond({ summary, record: todaysRecord(summary.id) })])),
};

test('the Runs view shows each record of today with its process, agent and status, in a home with no settings', async () => {
  // The settings read answers with no file: none of what the records name.
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }), answers: todaysAnswers });
  await p.started;
  const refused = '20261006T165603Z-7bcadd';
  const workflowOfOne = '20261010T095548Z-bac87a';
  const repaired = '20261009T184118Z-ae4689';
  const continuation = '20261010T181147Z-999397';

  // A row names its run's process, who did its work and its status; the
  // agent's name is in the opened run. Newest first.
  assert.deepEqual(p.rows().map((r) => [r.title, ...p.cells(r).slice(1, 3), r.children[3].querySelector('span.mark').title]), [
    [continuation, 'implement', 'claude-code opus high', 'completed'],
    [workflowOfOne, 'adr_review', '2 nodes', 'completed'],
    [repaired, 'implement_warder', 'claude-code opus high', 'completed'],
    [refused, 'review_judge', 'claude-code opus high', 'failed'],
  ]);

  // Each opens as a card that heads with its process and status and names
  // its agent before its ID, and folds its record as committed.
  const cards = {};
  for (const id of [continuation, workflowOfOne, repaired, refused]) {
    p.row(id).click();
    await settle();
    const card = p.$('run-detail').querySelector('article.run-card');
    assert.equal(card.dataset.run, id);
    const title = card.querySelector('div.run-title');
    // After the times: the agent, when the record names one, and the ID.
    const named = card.querySelector('p.run-when').textContent.split(' · ').slice(1);
    assert.equal(named.pop(), id);
    cards[id] = { process: title.querySelector('h3').textContent, agent: named, status: title.querySelector('span.mark').title };
    assert.deepEqual(JSON.parse(card.querySelector('details.record pre').textContent), todaysRecord(id));

    // The refused run says what refused it; the workflow, which names no
    // agent, shows its node and its join with the process of each.
    if (id === refused) {
      assert.deepEqual(card.querySelector('section.output').children.map((c) => [c.dataset.key, c.querySelector('div.markdown').textContent]),
        [['error', 'agent claude-judge is fresh-only; it cannot continue run 20261006T135952Z-bfcb4e']]);
    }
    if (id === workflowOfOne) {
      assert.deepEqual(card.querySelectorAll('div.nodes tbody tr').map((tr) => [...p.cells(tr).slice(0, 2), tr.querySelector('span.mark').title]),
        [['adr', 'adr_review_codex', 'completed'], ['judge join', 'review_judge', 'completed']]);
    }
  }
  assert.deepEqual(cards, {
    [continuation]: { process: 'implement', agent: ['agent claude-implementer-opus'], status: 'completed' },
    [workflowOfOne]: { process: 'adr_review', agent: [], status: 'completed' },
    [repaired]: { process: 'implement_warder', agent: ['agent claude-implementer-opus'], status: 'completed' },
    [refused]: { process: 'review_judge', agent: ['agent claude-judge'], status: 'failed' },
  });
});

test('an error with a class alone is one line, its head', async () => {
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/runs/call-1': () => respond({ summary: call, record: { result: { status: 'interrupted', error: { class: 'timeout' } } } }) },
  });
  await p.started;
  p.row('call-1').click();
  await settle();
  const parts = p.$('run-detail').querySelector('section.output').children;
  assert.deepEqual(parts.map((c) => [c.dataset.key, c.textContent]), [['error', 'error: timeout']]);
});

// An api/skills reply holding a skill named review in a folder for adapter.
const skillsHolding = (content, adapter = 'claude-code', extra = {}) => respond({
  home: false, adapters: [adapter], settings: [],
  folders: [{ scope: 'repo', folder: '.claude/skills', adapters: [adapter], skills: [{ name: 'review', path: '/w/run/.claude/skills/review', content, checks: { passed: true }, ...extra }] }],
});

test('a skill the run used is a link that opens it over the run, from the run\'s working directory', async () => {
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/skills': (n, url) => (url === 'api/skills?path=%2Fw%2Frun' ? skillsHolding('---\nname: review\n---\n# Review\n\nRead **all** of it.') : respond({ home: true, folders: [], settings: [] })) },
  });
  await p.started;
  p.row('call-1').click();
  await settle();
  const links = p.$('run-detail').querySelector('div.facts').querySelectorAll('a').filter((a) => a.href === '#review' || a.href === '#go');
  assert.deepEqual(links.map((a) => a.textContent), ['review', 'go']);
  assert.ok(links[0].click().defaultPrevented);
  await settle();
  assert.equal(p.$('skill-overlay').hidden, false);
  assert.equal(p.document.activeElement, p.$('skill-close'));
  const card = p.$('skill-detail').querySelector('article.skill-card');
  assert.equal(card.dataset.skill, 'review');
  assert.equal(card.querySelector('h3').textContent, 'review');
  assert.equal(card.querySelector('p.run-when').textContent, '.claude/skills in /w/run · /w/run/.claude/skills/review');
  assert.match(card.querySelector('p.group-note').textContent, /^As the run’s working directory holds it now/);
  assert.equal(card.querySelector('div.markdown').textContent, 'ReviewRead all of it.');

  // Escape closes the skill and leaves the run open; then the run.
  p.document.dispatchEvent(new Event('keydown', { key: 'Escape' }));
  assert.equal(p.$('skill-overlay').hidden, true);
  assert.equal(p.detail(), 'call-1');
  assert.equal(p.document.activeElement, p.$('run-close'));
  p.document.dispatchEvent(new Event('keydown', { key: 'Escape' }));
  assert.equal(p.detail(), null);

  // A click beside the skill closes it alone; closing the run closes both.
  p.row('call-1').click();
  await settle();
  links[0].click();
  p.$('run-detail').querySelectorAll('a').find((a) => a.href === '#review').click();
  await settle();
  p.$('skill-overlay').click();
  assert.equal(p.$('skill-overlay').hidden, true);
  assert.equal(p.detail(), 'call-1');
  p.$('run-detail').querySelectorAll('a').find((a) => a.href === '#review').click();
  await settle();
  p.$('run-close').click();
  assert.equal(p.$('skill-overlay').hidden, true);
  assert.equal(p.detail(), null);
});

test('a skill whose run\'s working directory is gone is read from the folder the picker shows, and says so', async () => {
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/skills': (n, url) => (url === 'api/skills?path=%2Fw%2Frun' ? respond({ error: 'no .agister folder at /w/run/.agister' }, 404) : skillsHolding('Home copy.')) },
  });
  await p.started;
  p.row('call-1').click();
  await settle();
  p.$('run-detail').querySelectorAll('a').find((a) => a.href === '#review').click();
  await settle();
  const card = p.$('skill-detail').querySelector('article.skill-card');
  assert.equal(card.querySelector('p.run-when').textContent.split(' · ')[0], '.claude/skills in Agister home');
  assert.equal(card.querySelector('p.group-note').textContent,
    'The run’s working directory, /w/run, cannot be read: this is the skill as it is here now, which can differ from what the run read.');
  assert.equal(card.querySelector('div.markdown').textContent, 'Home copy.');
  assert.deepEqual(p.calls.filter((u) => u.startsWith('api/skills')).slice(-2), ['api/skills?path=%2Fw%2Frun', 'api/skills?path=~']);

  // A skill no place has says where it looked.
  p.$('run-detail').querySelectorAll('a').find((a) => a.href === '#go').click();
  await settle();
  assert.equal(p.$('skill-detail').querySelector('p.group-note').textContent, 'No skill named go in /w/run, Agister home.');
});

test('the process and status filters show only the runs that match, and clearing them shows all', async () => {
  const at = (n) => `2026-10-01T1${n}:00:00Z`;
  const mixed = [
    { id: 'r-5', process: 'plan', created_at: at(5), status: 'running', outcome: {} },
    { id: 'r-4', process: 'review', created_at: at(4), status: 'completed', outcome: {} },
    { id: 'r-3', process: 'implement', created_at: at(3), status: 'failed', outcome: {} },
    { id: 'r-2', process: 'review', created_at: at(2), status: 'failed', outcome: {} },
    { id: 'r-1', process: 'implement', created_at: at(1), status: 'completed', outcome: {} },
  ];
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'runs' }),
    answers: { 'api/runs': () => respond({ runs: mixed, total: 5, skipped: 0 }) },
  });
  await p.started;
  const ids = () => p.rows().map((r) => r.title);
  const options = (name) => p.$('runs').querySelectorAll('select').find((s) => s.name === name).children.map((o) => o.value);
  assert.deepEqual(options('process'), ['', 'implement', 'plan', 'review']);
  assert.deepEqual(options('status'), ['', 'completed', 'failed', 'running']);
  assert.deepEqual(ids(), ['r-5', 'r-4', 'r-3', 'r-2', 'r-1']);
  // Only the run still running is accented.
  assert.deepEqual(p.rows().filter((r) => r.classList.contains('running')).map((r) => r.title), ['r-5']);

  p.filter('process', 'implement');
  assert.deepEqual(ids(), ['r-3', 'r-1']);
  p.filter('status', 'failed');
  assert.deepEqual(ids(), ['r-3']);
  p.filter('process', 'review');
  assert.deepEqual(ids(), ['r-2']);
  p.filter('process', 'plan');
  assert.deepEqual(ids(), []);
  assert.match(p.$('run-list').textContent, /No runs match the filters/);
  p.filter('process', '');
  assert.deepEqual(ids(), ['r-3', 'r-2']);
  p.filter('status', '');
  assert.deepEqual(ids(), ['r-5', 'r-4', 'r-3', 'r-2', 'r-1']);
});

test('a Settings read that succeeds after the user went to Runs leaves the Runs failure shown', async () => {
  const settings = deferred();
  const p = page({
    answers: {
      'api/settings': () => settings.promise,
      'api/runs': () => respond({ error: 'the runs could not be read' }, 500),
    },
  });
  await settle();
  p.$('view-runs').click();
  await settle();
  assert.equal(p.$('status').textContent, 'the runs could not be read');

  settings.resolve(respond({ path: '~', dir: '/u/.agister', home: true, files: {} }));
  await p.started;
  await settle();
  assert.equal(p.$('status').hidden, false);
  assert.equal(p.$('status').textContent, 'the runs could not be read');
  assert.deepEqual(p.shown(), { settings: false, runs: true, compare: false });
});

test('a Settings read that fails while Runs is shown says why only once Settings is shown', async () => {
  const settings = deferred();
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }), answers: { 'api/settings': () => settings.promise } });
  await settle();
  assert.deepEqual(p.rows().map((r) => r.title), ['call-1', 'wf-1']);
  assert.equal(p.$('status').hidden, true);

  settings.resolve(respond({ error: 'no .agister folder at /gone/.agister' }, 404));
  await p.started;
  await settle();
  assert.equal(p.$('status').hidden, true);
  assert.equal(p.$('status').textContent, '');
  assert.match(p.$('read-at').title, /^Runs read/);

  p.$('view-settings').click();
  await settle();
  assert.equal(p.$('status').textContent, 'no .agister folder at /gone/.agister');
});

// ADR-025 rules 2 and 3: a process card shows what its call needs of the
// caller's worktree: HEAD at the revision an input names, and clean when
// a fresh call needs HEAD's content, with a pinned revision or without
// one. The obsolete workspace.yaml is not
// read, even broken, and no setup, mode or precheck is shown.
test('a process card shows what its call needs of the caller\'s worktree', async () => {
  const files = {
    ...agent,
    'workspace.yaml': 'schema: agister.workspace/v1alpha1\nsetup: {command: [}\n',
    'processes/fix.yaml': 'name: fix\nworkspace:\n  revision: rev\n  clean: true\n  setup: {command: ./own.sh, timeout: 30s}\n',
    'processes/review.yaml': 'name: review\nworkspace:\n  revision: rev\n',
    'processes/tidy.yaml': 'name: tidy\nworkspace:\n  clean: true\n',
    'processes/ask.yaml': 'name: ask\n',
  };
  const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
  await p.started;
  const facts = (name) => {
    const nodes = p.$('dashboard').querySelector(`article#process-${name} div.facts`).children;
    const labels = nodes.filter((_, i) => i % 2 === 0).map((n) => n.textContent);
    const i = nodes.findIndex((n) => n.textContent === 'worktree');
    return { labels, worktree: i < 0 ? null : nodes[i + 1] };
  };
  const fix = facts('fix');
  assert.equal(fix.worktree.textContent, 'HEAD at rev, clean');
  assert.equal(fix.worktree.querySelector('code').textContent, 'rev');
  for (const gone of ['setup', 'mode', 'precheck']) assert.ok(!fix.labels.includes(gone), gone);
  assert.equal(facts('review').worktree.textContent, 'HEAD at rev');
  assert.equal(facts('tidy').worktree.textContent, 'clean');
  assert.equal(facts('ask').worktree, null);
  assert.equal(p.$('dashboard').querySelectorAll('.error').length, 0);
  assert.doesNotMatch(p.$('dashboard').textContent, /Workspace settings|workspace\.yaml/);
});

// ADR-030 rules 3 and 4: a process holds its own limits, read-only when
// it sets no access, and its session, fresh-only when it sets none: its
// card and its workflow step show them.
test('a process shows its own limits and session', async () => {
  const files = {
    ...agent,
    'processes/edit.yaml': 'name: edit\nsession: resumable\nworkspace: {access: read-write, scope: candidate}\ntimeout: 45m\n' +
      'max_cost_usd: 2\nretry: {max_attempts: 1}\ntools:\n  allow: [repository.read, repository.write]\n  require: [repository.write]\n' +
      'isolation:\n  deny: [network]\n',
    'processes/ask.yaml': 'name: ask\n',
    'processes/write.yaml': 'name: write\nworkspace: {access: read-write}\ntimeout: 20m\n',
    'processes/read.yaml': 'name: read\nsession: resumable\n',
    'workflows/both.yaml': 'name: both\nfan_out:\n  - {node: w, uses: process:write, agent: opus}\njoin: {node: r, uses: process:read, agent: opus}\n',
  };
  const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
  await p.started;
  const fact = (name, label) => {
    const nodes = p.$('dashboard').querySelector(`article#process-${name} div.facts`).children;
    return nodes[nodes.findIndex((n) => n.textContent === label) + 1];
  };
  assert.equal(fact('edit', 'limits').textContent,
    'read-write workspace, 45m, $2 cap, 1 attempt, scope candidaterequires: repository.writeallows: repository.read, repository.writedenies: network');
  assert.equal(fact('edit', 'limits').querySelector('span.access-read-write').textContent, 'read-write workspace');
  assert.equal(fact('edit', 'session').textContent, 'resumable: a run can be continued (--continue)');
  assert.equal(fact('ask', 'limits').textContent, 'read-only workspaceallows: nothing');
  assert.equal(fact('ask', 'session').textContent, 'fresh-only: every call starts fresh');
  for (const name of ['edit', 'ask']) {
    assert.equal(fact(name, 'limits').querySelector('span.missing'), null, name);
    const labels = p.$('dashboard').querySelector(`article#process-${name} div.facts`).children.map((n) => n.textContent);
    assert.ok(!labels.includes('policy'), name);
  }

  const [write, read] = p.$('dashboard').querySelector('article#workflow-both').querySelectorAll('div.step');
  const meta = (step) => step.querySelector('div.step-meta').children[1];
  assert.equal(meta(write).textContent, 'limits read-write workspace · 20m');
  assert.equal(meta(write).querySelector('span.access-read-write').textContent, 'read-write workspace');
  assert.equal(meta(read).textContent, 'limits read-only workspace');
  const session = (step) => {
    const nodes = step.querySelector('div.facts').children;
    return nodes[nodes.findIndex((n) => n.textContent === 'session') + 1].textContent;
  };
  assert.deepEqual([session(write), session(read)],
    ['fresh-only: every call starts fresh', 'resumable: a run can be continued (--continue)']);
  assert.doesNotMatch(p.$('dashboard').textContent, /polic/i);
});

// ADR-030 rule 9: a process that extends a base says so on its step, and a
// base, which is not work, names the processes that extend it. The server
// reports the process already laid over its base, as the binary composes
// it, with the extends it names; the page does not lay it over again.
test('a process names the base it extends, and a base the processes that extend it', async () => {
  const composedFiles = {
    ...agent,
    'processes/review.yaml': 'name: review\ntimeout: 20m\ntools:\n  require: [repository.read]\n',
    'processes/tests_review.yaml': 'name: tests_review\nextends: process:review\ntimeout: 20m\ntools:\n  require: [repository.read]\nprompt: tests\n',
    'workflows/tests.yaml': 'name: tests\ncall: {node: tests, uses: process:tests_review, agent: opus}\n',
  };
  const sources = {
    'processes/review.yaml': { layers: [{ layer: 'home', path: '/h/processes/review.yaml', fields: ['name', 'timeout', 'tools'] }] },
    'processes/tests_review.yaml': { layers: [
      { layer: 'home', path: '/h/processes/tests_review.yaml', fields: ['name', 'extends', 'prompt'] },
      { layer: 'home', path: '/h/processes/review.yaml', fields: ['timeout', 'tools'] },
    ] },
    'workflows/tests.yaml': { layers: [{ layer: 'home', path: '/h/workflows/tests.yaml', fields: ['name', 'call'] }] },
  };
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r' }),
    answers: {
      'api/settings': () => respond({ path: '/r', files: {}, composedFiles, sources }),
      'api/skills': () => respond({ path: '/r', home: false, adapters: [], folders: [], settings: [] }),
    },
  });
  await p.started;
  const facts = (root) => {
    const nodes = root.querySelector('div.facts').children;
    return (label) => nodes[nodes.findIndex((n) => n.textContent === label) + 1].textContent;
  };
  const base = facts(p.$('dashboard').querySelector('article#process-review'));
  assert.equal(base('extends'), 'a base, not work: extended by tests_review');
  const step = p.$('dashboard').querySelector('article#workflow-tests div.step');
  assert.equal(facts(step)('extends'), 'review — its fields under this process’s own');
  assert.equal(step.querySelector('div.step-meta').children[1].textContent, 'limits read-only workspace · 20m');
});

// ADR-030 rule 6: a workflow of one call shows its one call, on the
// agent it binds, and the command it runs with its process's params; the
// process has no card of its own.
test('a workflow of one call shows its call and its process params', async () => {
  const files = {
    ...agent,
    'agents/sol.toml': 'name = "sol"\nruntime = "codex"\nmodel = "gpt"\neffort = "low"\n',
    'processes/implement.yaml': 'name: implement\ninput:\n  params:\n    brief: {}\n    candidate: {default: HEAD}\n',
    'workflows/implement_sol.yaml': 'name: implement_sol\ncall: {node: implement, uses: process:implement, agent: sol}\n',
  };
  const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
  await p.started;
  const card = (name) => p.$('dashboard').querySelector(`article#${name}`);
  const w = card('workflow-implement_sol');
  const facts = w.querySelector('div.facts').children;
  assert.equal(facts[facts.findIndex((n) => n.textContent === 'calls') + 1].textContent, 'gpt');
  assert.equal(w.querySelector('div.cmd code').textContent, 'agister run implement_sol --param brief=<brief>');
  const stages = w.querySelectorAll('section.stage');
  assert.deepEqual(stages.map((stage) => stage.querySelector('h4').textContent), ['One call']);
  assert.equal(stages[0].querySelector('div.step-meta').children[0].textContent, 'agent  sol · gpt · low effort');
  assert.equal(card('process-implement'), null);
});

// ADR-030 rules 2 and 5: a step shows the agent its node binds, and the
// workflow's calls line counts the same models. A process names no agent,
// so a node that binds none shows none, as Agister refuses the workflow;
// an agent a node names and these settings lack is marked missing; a
// process no node binds shows none on its own card, as nothing runs it.
test('a workflow step and the calls line show the agent the node binds, and a process names none', async () => {
  const files = {
    ...agent,
    'agents/sol.toml': 'name = "sol"\nruntime = "codex"\nmodel = "gpt"\neffort = "low"\n',
    'processes/check.yaml': 'name: check\n',
    'processes/bare.yaml': 'name: bare\n',
    'processes/lone.yaml': 'name: lone\n',
    'workflows/panel.yaml': 'name: panel\nfan_out:\n  - {node: one, uses: process:check, agent: sol}\n' +
      '  - {node: two, uses: process:check}\n  - {node: three, uses: process:bare, agent: sol}\n' +
      'join: {node: j, uses: process:bare, agent: opus}\n',
    'workflows/refused.yaml': 'name: refused\nfan_out:\n  - {node: ghost, uses: process:check, agent: gone}\n' +
      'join: {node: unbound, uses: process:bare}\n',
  };
  const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
  await p.started;
  const card = (name) => p.$('dashboard').querySelector(`article#${name}`);
  const fact = (name, label) => {
    const nodes = card(name).querySelector('div.facts').children;
    return nodes[nodes.findIndex((n) => n.textContent === label) + 1];
  };
  const agents = (name) => card(name).querySelectorAll('div.step').map((step) => step.querySelector('div.step-meta').children[0]);

  assert.equal(fact('workflow-panel', 'calls').textContent, '2 × gpt + unknown model at once, then opus');
  const panel = agents('workflow-panel');
  assert.deepEqual(panel.map((line) => line.textContent), [
    'agent  sol · gpt · low effort',
    'agent  none',
    'agent  sol · gpt · low effort',
    'agent  opus · opus · high effort',
  ]);
  assert.equal(panel[1].querySelector('span.missing').title, 'The node binds no agent: Agister refuses the workflow');
  for (const line of [panel[0], ...panel.slice(2)]) assert.equal(line.querySelector('span.missing'), null, line.textContent);

  assert.equal(fact('workflow-refused', 'calls').textContent, 'unknown model, then unknown model');
  const [ghost, unbound] = agents('workflow-refused');
  assert.equal(ghost.textContent, 'agent  gone (missing agent)');
  assert.equal(ghost.querySelector('span.missing').title, 'No agent named gone in these settings: Agister refuses the call');
  assert.equal(unbound.textContent, 'agent  none');
  assert.equal(unbound.querySelector('span.missing').title, 'The node binds no agent: Agister refuses the workflow');

  // Bound by a node, a process has no card of its own; unbound, its card
  // names no agent and gives no command, as agister run runs a workflow
  // only (ADR-030 rule 7).
  for (const name of ['check', 'bare']) assert.equal(card(`process-${name}`), null, name);
  assert.equal(fact('process-lone', 'agent').textContent, 'none');
  assert.equal(fact('process-lone', 'agent').querySelector('span.missing').title,
    'The process names no agent: only a workflow’s node binds it to one, and Agister runs it only so');
  assert.equal(card('process-lone').querySelector('div.cmd'), null);
});

// docs/reference/processes-and-workflows.md: a process card shows the
// attempts of the verification the process names, or marks it missing
// when these settings have none.
test('a process card shows the verification its process names, or marks it missing', async () => {
  const naming = { ...agent, 'processes/implement.yaml': 'name: implement\nverify: verify:repo\n' };
  const output = async (files) => {
    const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
    await p.started;
    const facts = p.$('dashboard').querySelector('article#process-implement div.facts').children;
    return facts[facts.findIndex((n) => n.textContent === 'output') + 1];
  };

  const found = await output({ ...naming, 'verifies/repo.yaml': 'name: repo\ncommand: make test\nmax_attempts: 2\n' });
  assert.equal(found.textContent, 'a failed verify (repo) is fixed up to 2×');
  assert.equal(found.querySelector('span.missing'), null);

  // ADR-025 rule 5: where is obsolete; every verification runs in the
  // call's worktree.
  const obsolete = await output({ ...naming, 'verifies/repo.yaml': 'name: repo\ncommand: make test\nmax_attempts: 2\nwhere: workspace\n' });
  assert.equal(obsolete.textContent, 'a failed verify (repo) is fixed up to 2×');

  const absent = await output(naming);
  assert.equal(absent.textContent, 'repo (missing verify)');
  const marker = absent.querySelector('span.missing');
  assert.equal(marker.textContent, 'repo (missing verify)');
  assert.equal(marker.title, 'No verify named repo in these settings: Agister refuses the call');
});

// docs/reference/processes-and-workflows.md: a process card shows the
// prompts its process names, each marked missing when these settings
// have none of that name.
test('a process card shows the prompts its process names, and marks a missing one', async () => {
  const naming = { ...agent, 'processes/review.yaml': 'name: review\nprompt: rules\nguidance: [style]\ninput:\n  instruction: Review.\n' };
  const prompts = async (files) => {
    const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
    await p.started;
    const facts = p.$('dashboard').querySelector('article#process-review div.facts').children;
    return facts[facts.findIndex((n) => n.textContent === 'guidance') + 1];
  };

  const found = await prompts({ ...naming, 'prompts/rules.md': 'Rules.\n', 'prompts/style.md': 'Style.\n' });
  assert.equal(found.textContent, 'style');
  assert.equal(found.querySelector('span.missing'), null);

  const absent = await prompts({ ...naming, 'prompts/rules.md': 'Rules.\n' });
  assert.equal(absent.textContent, 'style (missing prompt)');
  const marker = absent.querySelector('span.missing');
  assert.equal(marker.textContent, 'style (missing prompt)');
  assert.equal(marker.title, 'No prompt named style in these settings: Agister refuses the call');
});

// ADR-026, docs/reference/processes-and-workflows.md: a process card and
// a workflow card show the brief forms their inputs name, each marked
// missing when these settings have none of that name.
test('a process card and a workflow card show the brief forms their inputs name, and mark a missing one', async () => {
  const naming = {
    ...agent,
    'processes/implement.yaml': 'name: implement\ninput:\n  instruction: Implement.\n  values:\n    brief: {source: file, path: brief.md, form: [goal, step]}\n',
    'workflows/review.yaml': 'name: review\ninput:\n  values:\n    goal: {source: file, path: goal.md, form: [goal]}\nfan_out:\n  - {node: one, uses: process:review_one}\njoin: {node: j, uses: process:review_one}\n',
  };
  const briefs = async (files, card) => {
    const p = page({ answers: { 'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }) } });
    await p.started;
    const facts = p.$('dashboard').querySelector(`article#${card} div.facts`).children;
    return facts[facts.findIndex((n) => n.textContent === 'briefs') + 1];
  };
  const goal = 'name: goal\nparts:\n  - {heading: "## Intent", required: true}\ntemplate: |\n  ## Intent\n';
  const step = 'name: step\nparts:\n  - {heading: "## Goal", required: true}\ntemplate: |\n  ## Goal\n';
  const all = { ...naming, 'briefs/goal.yaml': goal, 'briefs/step.yaml': step };

  const found = await briefs(all, 'process-implement');
  assert.equal(found.textContent, 'goal, step');
  assert.equal(found.querySelector('span.missing'), null);
  assert.equal((await briefs(all, 'workflow-review')).textContent, 'goal');

  const absent = await briefs({ ...naming, 'briefs/goal.yaml': goal }, 'process-implement');
  assert.equal(absent.textContent, 'goal, step (missing brief)');
  assert.equal(absent.querySelector('span.missing').title, 'No brief named step in these settings: Agister refuses the call');
});

// ADR-014: pages show which layer each prompt comes from. In a repo, a
// prompt of its own replaces home's and says so; one only home has says
// home. Prompt and guidance have separate facts.
test('a process card in a repo shows the layer each prompt comes from, each prompt once', async () => {
  const homeFiles = {
    ...agent,
    'processes/review.yaml': 'name: review\nprompt: rules\nguidance: [style]\ninput:\n  instruction: Review.\n',
    'prompts/rules.md': 'Home rules.\n',
    'prompts/style.md': 'Home style.\n',
  };
  const files = { 'prompts/rules.md': 'Repo rules.\n' };
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r' }),
    answers: { 'api/settings': () => respond({ path: '/r', dir: '/r/.agister', files, homeFiles }) },
  });
  await p.started;
  const facts = p.$('dashboard').querySelector('article#process-review div.facts').children;
  const line = facts[facts.findIndex((n) => n.textContent === 'guidance') + 1];
  assert.equal(line.textContent, 'style home');
  const primary = facts[facts.findIndex((n) => n.textContent === 'prompt') + 1];
  assert.equal(primary.textContent, 'rules repo, replaces home');
  assert.deepEqual(line.querySelectorAll('span.chip').map((c) => c.textContent), ['home']);
});

// ADR-021, docs/reference/skills.md: a process card lists the skills its
// process names, and a workflow step the skills its call gets, its process's then
// those of the agent the node binds, each once, with the layer each comes
// from in a repo, and one these settings do not have marked missing. The
// agents' table shows each agent's skills and the workflows that bind it. The skills are the server's inventory
// (api/skills' settings), never the settings files (D-16).
test('a process card and the agents table list skills, each once, with their layer or marked missing', async () => {
  const skill = (scope, name) => ({ scope, name, path: `/${scope}/skills/${name}`, description: 'D.', checks: { passed: true } });
  const homeFiles = {
    'agents/opus.toml': `${agent['agents/opus.toml']}skills = ["go", "plan", "gone"]\n`,
    'agents/sol.toml': 'name = "sol"\nruntime = "codex"\n',
    'processes/review.yaml': 'name: review\nskills: [plan, style, ghost]\ninput:\n  instruction: Review.\n',
    'processes/check.yaml': 'name: check\nskills: [plan, style, ghost]\ninput:\n  instruction: Check.\n',
    'workflows/check_opus.yaml': 'name: check_opus\ncall: {node: check, uses: process:check, agent: opus}\n',
  };
  const settings = [skill('repo', 'plan'), skill('home', 'go'), skill('home', 'plan'), skill('home', 'style')];
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r' }),
    answers: {
      'api/settings': () => respond({ path: '/r', dir: '/r/.agister', files: {}, homeFiles }),
      'api/skills': () => respond({ path: '/r', home: false, adapters: [], folders: [], settings }),
    },
  });
  await p.started;
  const facts = p.$('dashboard').querySelector('article#process-review div.facts').children;
  const line = facts[facts.findIndex((n) => n.textContent === 'skills') + 1];
  assert.equal(line.textContent, 'plan repo, replaces home, style home, ghost (missing skill)');
  const stepFacts = p.$('dashboard').querySelector('article#workflow-check_opus div.step div.facts').children;
  const call = stepFacts[stepFacts.findIndex((n) => n.textContent === 'skills') + 1];
  assert.equal(call.textContent, 'plan repo, replaces home, style home, ghost (missing skill), go home, gone (missing skill)');
  assert.deepEqual(call.querySelectorAll('span.missing').map((m) => m.title), [
    'No skill named ghost in these settings: Agister refuses the call',
    'No skill named gone in these settings: Agister refuses the call',
  ]);

  const head = p.$('dashboard').querySelectorAll('section.card').find((c) => c.querySelector('h3')?.textContent === 'Agents').querySelectorAll('th').map((th) => th.textContent);
  assert.deepEqual(head, ['Agent', 'Runtime', 'Model', 'Effort', 'Skills', 'Bound by', 'From']);
  const cell = (name, label = 'Skills') => p.$(`Agents-${name}`).querySelectorAll('td').find((td) => td.dataset.label === label);
  assert.equal(cell('opus').textContent, 'go home, plan repo, replaces home, gone (missing skill)');
  assert.equal(cell('opus').querySelector('span.missing').textContent, 'gone (missing skill)');
  assert.equal(cell('sol').textContent, '—');
  assert.deepEqual([cell('opus', 'Bound by').textContent, cell('sol', 'Bound by').textContent], ['check_opus', '—']);

  // Agister home alone: no layers, the same missing marks.
  const tilde = page({ answers: {
    'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files: homeFiles }),
    'api/skills': () => respond({ path: '~', home: true, adapters: [], folders: [], settings: settings.filter((s) => s.scope === 'home') }),
  } });
  await tilde.started;
  const own = tilde.$('dashboard').querySelector('article#process-review div.facts').children;
  assert.equal(own[own.findIndex((n) => n.textContent === 'skills') + 1].textContent, 'plan, style, ghost (missing skill)');
});

test('the served process card shows prompt, guidance and all reported field layers', async () => {
  const composedFiles = {
    ...agent,
    'processes/review.yaml': 'name: review\nprompt: rules\nguidance: [style, missing]\nskills: [rules]\nverify: verify:repo\noutput: {schema: result}\n',
    'verifies/repo.yaml': 'timeout: 1m\nmax_attempts: 2\ncommand: cd docs && make test\n',
    'prompts/rules.md': 'Rules.', 'prompts/style.md': 'Style.',
    'schemas/result.json': '{}',
  };
  const layers = [
    { layer: 'project', path: '/r/docs/.agister/processes/review.yaml', fields: ['guidance'] },
    { layer: 'repository', path: '/r/.agister/processes/review.yaml', fields: [] },
    { layer: 'home', path: '/h/processes/review.yaml', fields: ['name', 'prompt', 'skills', 'verify'] },
  ];
  const verificationLayers = [
    { layer: 'project', path: '/r/docs/.agister/verifies/repo.yaml', fields: ['command'] },
    { layer: 'home', path: '/h/verifies/repo.yaml', fields: ['timeout', 'max_attempts'] },
  ];
  const sources = {
    'verifies/repo.yaml': { layers: verificationLayers },
    'processes/review.yaml': { layers },
    'prompts/rules.md': { layers: [{ layer: 'repository', path: '/r/prompts/rules.md' }, { layer: 'home', path: '/h/prompts/rules.md' }] },
    'prompts/style.md': { layers: [{ layer: 'project', path: '/r/docs/prompts/style.md' }] },
    'schemas/result.json': { layers: [{ layer: 'repository', path: '/r/.agister/schemas/result.json' }, { layer: 'home', path: '/h/schemas/result.json' }] },
  };
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r/docs' }),
    answers: {
      'api/settings': () => respond({ path: '/r/docs', files: {}, homeFiles: {}, composedFiles, sources }),
      'api/skills': () => respond({ path: '/r/docs', home: false, adapters: [], folders: [], settings: [
        { name: 'rules', scope: 'project', path: '/r/docs/.agister/skills/rules', state: '', checks: { passed: true, failed: [] } },
      ] }),
    },
  });
  await p.started;
  const card = p.$('dashboard').querySelector('article#process-review');
  assert.equal(card.querySelector('header span.chip').textContent, 'project + repository + home');
  const facts = card.querySelector('div.facts').children;
  const fact = (name) => facts[facts.findIndex((n) => n.textContent === name) + 1];
  assert.equal(fact('prompt').textContent, 'rules repository + home');
  assert.equal(fact('prompt').querySelector('span.chip').title, 'repository /r/prompts/rules.md\nhome /h/prompts/rules.md (replaced)');
  assert.equal(fact('guidance').textContent, 'style project, missing (missing prompt)');
  assert.equal(fact('skills').textContent, 'rules project');
  assert.equal(fact('skills').querySelector('span.chip').title, 'project /r/docs/.agister/skills/rules/SKILL.md');
  // The output schema comes whole from the nearest layer, which replaces home's.
  assert.equal(fact('output').textContent, 'result schema repository + home; a failed verify (repo) is fixed up to 2×');
  assert.equal(fact('output').querySelector('span.chip').title, 'repository /r/.agister/schemas/result.json\nhome /h/schemas/result.json (replaced)');
  assert.equal(fact('verification layers').textContent, 'repoproject /r/docs/.agister/verifies/repo.yaml: commandhome /h/verifies/repo.yaml: timeout, max_attempts');
  const provenance = card.querySelectorAll('div.facts')[1].textContent;
  assert.match(provenance, /project \/r\/docs\/\.agister\/processes\/review.yaml: guidance/);
  assert.match(provenance, /repository \/r\/\.agister\/processes\/review.yaml: \(none\)/);
  assert.match(provenance, /home \/h\/processes\/review.yaml: name, prompt/);
});

test('empty guidance is shown as none and a missing primary prompt is marked', async () => {
  const p = page({ answers: { 'api/settings': () => respond({ path: '~', home: true,
    files: { ...agent, 'processes/review.yaml': 'name: review\nprompt: missing\nguidance: []\n' } }) } });
  await p.started;
  const facts = p.$('dashboard').querySelector('article#process-review div.facts').children;
  const fact = (name) => facts[facts.findIndex((n) => n.textContent === name) + 1];
  assert.equal(fact('prompt').textContent, 'missing (missing prompt)');
  assert.equal(fact('guidance').textContent, 'none');
});


test('workflow nodes show their process prompt, guidance and field layers', async () => {
  const composedFiles = {
    ...agent,
    'workflows/review.yaml': 'name: review\nfan_out:\n  - {node: one, uses: process:check}\njoin: {node: j, uses: process:check}\n',
    'processes/check.yaml': 'name: check\nprompt: rules\nguidance: [style]\nverify: verify:repo\noutput: {schema: result}\n',
    'verifies/repo.yaml': 'max_attempts: 3\ncommand: make test\n',
    'prompts/rules.md': 'Rules.', 'prompts/style.md': 'Style.',
    'schemas/result.json': '{}',
  };
  const sources = {
    'processes/check.yaml': { layers: [
      { layer: 'project', path: '/r/docs/.agister/processes/check.yaml', fields: ['guidance'] },
      { layer: 'home', path: '/h/processes/check.yaml', fields: ['name', 'prompt', 'verify'] },
    ] },
    'prompts/rules.md': { layers: [{ layer: 'home', path: '/h/prompts/rules.md' }] },
    'prompts/style.md': { layers: [{ layer: 'project', path: '/r/docs/library/style.md' }] },
    'schemas/result.json': { layers: [{ layer: 'project', path: '/r/docs/.agister/schemas/result.json' }, { layer: 'home', path: '/h/schemas/result.json' }] },
    'verifies/repo.yaml': { layers: [
      { layer: 'project', path: '/r/docs/.agister/verifies/repo.yaml', fields: ['command'] },
      { layer: 'home', path: '/h/verifies/repo.yaml', fields: ['max_attempts'] },
    ] },
  };
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r/docs' }),
    answers: {
      'api/settings': () => respond({ path: '/r/docs', files: {}, composedFiles, sources }),
      'api/skills': () => respond({ path: '/r/docs', home: false, adapters: [], folders: [], settings: [] }),
    },
  });
  await p.started;
  assert.equal(p.$('dashboard').querySelector('article#process-check'), null);
  const nodes = p.$('dashboard').querySelector('article#workflow-review').querySelectorAll('div.step');
  assert.equal(nodes.length, 2);
  for (const node of nodes) {
    const facts = node.querySelector('div.facts').children;
    const fact = (name) => facts[facts.findIndex((n) => n.textContent === name) + 1];
    assert.equal(fact('prompt').textContent, 'rules home');
    assert.equal(fact('guidance').textContent, 'style project');
    assert.equal(fact('guidance').querySelector('span.chip').title, 'project /r/docs/library/style.md');
    assert.equal(fact('output').textContent, 'result schema project + home; a failed verify (repo) is fixed up to 3×');
    assert.equal(fact('output').querySelector('span.chip').title, 'project /r/docs/.agister/schemas/result.json\nhome /h/schemas/result.json (replaced)');
    assert.equal(fact('layers').textContent, 'project /r/docs/.agister/processes/check.yaml: guidancehome /h/processes/check.yaml: name, prompt, verify');
    assert.equal(fact('verification layers').textContent, 'repoproject /r/docs/.agister/verifies/repo.yaml: commandhome /h/verifies/repo.yaml: max_attempts');
  }
});

// A prompt the binary cannot read breaks the call (ADR-028 rule 5): the
// server reports its error with its layers, and the page shows that error
// beside the reference, on a process card and on each workflow step,
// rather than as configured guidance.
test('a prompt reference the binary cannot read shows its error on process cards and workflow steps', async () => {
  const broken = '/r/.agister/prompts/style.md: not a regular file';
  const composedFiles = {
    ...agent,
    'workflows/panel.yaml': 'name: panel\nfan_out:\n  - {node: one, uses: process:check}\n',
    'processes/check.yaml': 'name: check\nprompt: rules\nguidance: [style]\n',
    'processes/alone.yaml': 'name: alone\nprompt: style\nguidance: [rules]\n',
    'prompts/rules.md': 'Rules.',
  };
  const sources = {
    'prompts/rules.md': { layers: [{ layer: 'home', path: '/h/prompts/rules.md' }] },
    'prompts/style.md': { layers: [{ layer: 'repository', path: '/r/.agister/prompts/style.md' }], error: broken },
  };
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r' }),
    answers: {
      'api/settings': () => respond({ path: '/r', files: {}, composedFiles, sources }),
      'api/skills': () => respond({ path: '/r', home: false, adapters: [], folders: [], settings: [] }),
    },
  });
  await p.started;
  const factsOf = (root) => {
    const facts = root.querySelector('div.facts').children;
    return (name) => facts[facts.findIndex((n) => n.textContent === name) + 1];
  };
  const card = factsOf(p.$('dashboard').querySelector('article#process-alone'));
  assert.equal(card('prompt').textContent, `style repository ${broken}`);
  assert.equal(card('prompt').querySelector('span.error').title, `Agister refuses the call: ${broken}`);
  assert.equal(card('guidance').textContent, 'rules home');
  assert.equal(card('guidance').querySelector('span.error'), null);
  const step = factsOf(p.$('dashboard').querySelector('article#workflow-panel div.step'));
  assert.equal(step('prompt').textContent, 'rules home');
  assert.equal(step('guidance').textContent, `style repository ${broken}`);
  assert.equal(step('guidance').querySelector('span.error').textContent, broken);
});

// Runtime evidence is a warning surface, not a prerequisite for planning.
test('Settings shows best-effort permissions and unverified declared grants', async () => {
  const p = page({ answers: {
    'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files: {
      'runtimes/rt.yaml': 'name: rt\nadapter: codex\ncontract: codex/1\nprimitives:\n  select: one\n  items:\n    read-only: {grants: [repository.read, process.execute]}\n',
    } }),
  } });
  await p.started;
  const content = p.$('dashboard').textContent;
  assert.match(content, /Runtime permissions are best effort/);
  assert.match(content, /Extra grants and unverified versions warn; require and state reach are hard checks/);
  assert.match(content, /read-only: repository.read, process.execute/);
  assert.match(content, /Unverified — warns/);
});
