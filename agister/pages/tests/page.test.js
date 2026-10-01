import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../repos.js';
import '../config.js';
import '../runs.js';
import '../page.js';
import { pageDocument } from './dom.js';

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
// workflow run wf-1.
const call = {
  id: 'call-1', process: 'implement', created_at: '2026-10-01T10:00:00Z', status: 'completed',
  implementor: { adapter: 'claude-code', model: 'opus', effort: 'high' }, outcome: { wall_ms: 1000 }, parent: 'wf-1',
};
const workflow = {
  id: 'wf-1', process: 'panel', created_at: '2026-10-01T09:59:00Z', status: 'completed', outcome: {},
  workflow: { nodes: [{ name: 'first', process: 'implement', run: 'call-1', status: 'completed' }] },
};
const later = { ...call, id: 'call-2', created_at: '2026-10-01T11:00:00Z', parent: undefined };
const compare = {
  groups: [{ process: 'implement', adapter: 'claude-code', model: 'opus', effort: 'high', runs: 1, completed: 1, pass_rate: 1, total_cost_usd: 0, cost_unknown: 1 }],
  skipped: 0,
};
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
    'api/runs/call-1': () => respond({ summary: call, record: { id: 'call-1' } }),
    'api/runs/wf-1': () => respond({ summary: workflow, record: { id: 'wf-1' } }),
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
