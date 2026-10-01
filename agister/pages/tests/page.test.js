import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../repos.js';
import '../config.js';
import '../runs.js';
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
      { name: 'first', process: 'implement', run: 'call-1', status: 'completed' },
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
const callRecord = { id: 'call-1', verify: { max_attempts: 3 }, from_a_newer_agister: { kept: [1, 2] } };
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
    return answer(asked(route));
  };
  const document = pageDocument();
  const location = { protocol: 'http:', hash: '' };
  const started = P.start({ document, fetch, localStorage: storage, location, navigator: {}, setTimeout: (fn) => queueMicrotask(fn) });
  const $ = (id) => document.getElementById(id);
  return {
    started, calls, asked, storage, document, location, $,
    rows: () => document.querySelectorAll('#run-list tr.pick'),
    row: (id) => document.querySelectorAll('#run-list tr.pick').find((r) => r.title === id),
    shown: () => ({ settings: !$('dashboard').hidden, runs: !$('runs').hidden }),
    pressed: (view) => $(`view-${view}`).getAttribute('aria-pressed'),
    detail: () => $('run-detail').querySelector('h3')?.textContent ?? null,
    // The cells of a table row, as text.
    cells: (row) => row.children.map((td) => td.textContent),
    // The compare tables: per process, its rows' cells.
    compared: () => $('runs').querySelectorAll('section.card').filter((s) => s.parentNode === $('runs')).map((s) => ({
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
  assert.deepEqual(p.shown(), { settings: true, runs: false });
  assert.equal(p.pressed('settings'), 'true');
  assert.equal(p.asked('api/runs'), 0);
  assert.match(p.$('dashboard').textContent, /Agister home/);

  p.$('view-runs').click();
  await settle();
  assert.equal(storage.raw(VIEW_KEY), 'runs');
  assert.deepEqual(p.shown(), { settings: false, runs: true });
  assert.deepEqual([p.pressed('settings'), p.pressed('runs')], ['false', 'true']);
  assert.deepEqual(p.rows().map((r) => r.title), ['call-1', 'wf-1']);
  assert.match(p.$('runs').textContent, /claude-code/);
  assert.doesNotMatch(p.$('run-list').textContent, /null/);
  assert.match(p.$('read-at').title, /^Runs read/);

  // The next visit opens on Runs and reads them.
  const next = page({ storage });
  await next.started;
  assert.deepEqual(next.shown(), { settings: false, runs: true });
  assert.equal(next.pressed('runs'), 'true');
  assert.deepEqual(next.rows().map((r) => r.title), ['call-1', 'wf-1']);

  next.$('view-settings').click();
  await settle();
  assert.equal(storage.raw(VIEW_KEY), 'settings');
  assert.deepEqual(next.shown(), { settings: true, runs: false });
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

test('a row opens its run below the table; its workflow link opens the parent run', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;
  assert.equal(p.detail(), null);

  p.row('call-1').click();
  await settle();
  assert.equal(p.calls.at(-1), 'api/runs/call-1');
  assert.equal(p.detail(), 'call-1');
  assert.ok(p.row('call-1').classList.contains('chosen'));
  assert.equal(p.document.scrolledTo, p.$('run-detail'));

  // The workflow fact links to the parent; following it stays on the page
  // and opens the parent below the table.
  const link = p.$('run-detail').querySelectorAll('a').find((a) => a.textContent === 'wf-1');
  assert.equal(link.href, '#wf-1');
  const click = link.click();
  assert.ok(click.defaultPrevented);
  await settle();
  assert.equal(p.calls.at(-1), 'api/runs/wf-1');
  assert.equal(p.detail(), 'wf-1');
  assert.equal(p.location.hash, '');
  assert.deepEqual(p.rows().filter((r) => r.classList.contains('chosen')).map((r) => r.title), ['wf-1']);
  assert.match(p.$('run-detail').textContent, /first — implement/);

  // The chosen row again closes it.
  p.row('wf-1').click();
  await settle();
  assert.equal(p.detail(), null);
  assert.deepEqual(p.rows().filter((r) => r.classList.contains('chosen')), []);
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
  assert.deepEqual(p.shown(), { settings: true, runs: false });
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

test('the comparison and the run list show what the summaries carry', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;
  assert.deepEqual(p.compared(), [
    { process: 'implement', rows: [['claude-code', 'opus', 'high', '3', '2', '67%', '1.5', '1m 47s', '$0.50 (1 unknown)']] },
    { process: 'review', rows: [['codex', 'gpt-6.1-sol', '-', '1', '0', '0%', '', '412ms', '(1 unknown)']] },
  ]);

  // The started cell is in local time; the rest as the page writes it.
  assert.ok(p.cells(p.row('call-1'))[0]);
  assert.deepEqual(p.cells(p.row('call-1')).slice(1),
    ['implement', 'claude-code opus high', 'completed', '2 ✓', '1m 47s', '$0.50', 'review×3, go×1', '12']);
  assert.equal(p.row('call-1').children[2].querySelector('span').title, 'the runtime reported claude-opus-5-5');
  // A workflow's row: its nodes and its judge's rulings.
  assert.deepEqual(p.cells(p.row('wf-1')).slice(1),
    ['panel', '2 nodes', 'completed', '', '2m 0s', '', 'fix 2, defer 1', '']);
});

test('an opened run shows its facts, its judge counts and its record folded', async () => {
  const p = page({ storage: fakeStorage({ [VIEW_KEY]: 'runs' }) });
  await p.started;

  p.row('call-1').click();
  await settle();
  const opened = p.facts();
  assert.ok(opened.started[0] && opened.finished[0]);
  delete opened.started;
  delete opened.finished;
  assert.deepEqual(opened, {
    process: ['implement — agent opus'],
    implementor: ['claude-code 2.1 · opus · high effort', 'the runtime reported claude-opus-5-5'],
    policy: ['read-write workspace · 20m 0s · $5.00 cap · scope candidate'],
    outcome: ['completed · verify 2/3 ✓', 'wall 1m 47s · turn 1m 40s · runtime 412ms', '$0.50 (runtime)'],
    skills: ['review×3, go×1'],
    'tool calls': ['12'],
    workflow: ['wf-1'],
  });
  const record = p.$('run-detail').querySelector('details.record');
  assert.ok(!record.open);
  assert.equal(record.querySelector('summary').textContent, 'Record as stored');
  assert.deepEqual(JSON.parse(record.querySelector('pre').textContent), callRecord);

  p.row('wf-1').click();
  await settle();
  const workflow = p.facts();
  assert.ok(workflow.started[0]);
  delete workflow.started;
  assert.deepEqual(workflow, {
    process: ['panel'],
    outcome: ['completed', 'wall 2m 0s'],
    nodes: ['first — implement · completed', 'judge — judge, join · failed'],
    rulings: ['fix 2, defer 1 (3 items)'],
    severities: ['minor 2, major 1'],
    'by source': ['1 first: fix 2, defer 1'],
  });
  assert.deepEqual(p.$('run-detail').querySelectorAll('span.failed').map((s) => s.textContent), ['failed']);
  assert.deepEqual(JSON.parse(p.$('run-detail').querySelector('details.record pre').textContent), workflowRecord);
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
  assert.deepEqual(p.shown(), { settings: false, runs: true });
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
