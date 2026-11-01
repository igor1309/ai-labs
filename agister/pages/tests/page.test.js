// The page's Runs and Compare views over a fake DOM and a fetch whose
// replies the test releases, each in the order it chooses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { page } from './dom.js';

const script = readFileSync(new URL('../static/page.js', import.meta.url), 'utf8');

// open starts the page; fetch's replies wait until reply(path, body) or
// fail(path) releases them.
function open(view = 'runs') {
  const context = vm.createContext({ encodeURIComponent, console });
  vm.runInContext(script, context);
  const document = page();
  const waiting = new Map();
  const asked = [];
  const fetch = (path) => {
    asked.push(path);
    return new Promise((resolve) => { waiting.set(path, resolve); });
  };
  const release = (path, res) => {
    const resolve = waiting.get(path);
    assert.ok(resolve, `${path} was not asked`);
    waiting.delete(path);
    resolve(res);
  };
  const stored = new Map([['agister-pages:view', view]]);
  const storage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) };
  const app = context.AgisterPage.start({ document, fetch, storage });
  const settle = () => new Promise((r) => setImmediate(r));
  return {
    document, app, asked, stored, settle,
    view: () => document.getElementById('view'),
    button: (name) => document.getElementById('nav').children.find((b) => b.dataset.view === name),
    reply: async (path, body) => { release(path, { ok: true, json: async () => body, text: async () => '' }); await settle(); },
    fail: async (path, status, text) => { release(path, { ok: false, status, text: async () => text }); await settle(); },
  };
}

const list = {
  total: 2, skipped: 1,
  runs: [
    { id: 'R2', workflow: 'code_review', started: '2026-11-01T09:00:00Z', status: 'completed', duration_ms: 90000, cost: 1.5, calls: 2 },
    { id: 'R1', process: 'implement', agent: 'codex', started: '2026-11-01T08:00:00Z', status: 'failed', class: 'runtime_error', reason: 'it broke', calls: 1 },
  ],
};

const detail = {
  id: 'R2', workflow: 'code_review', started: '2026-11-01T09:00:00Z', status: 'completed', dir: '/work', params: { base: 'trunk' },
  calls: [{ step: 'implement', process: 'implement', agent: 'codex', status: 'completed', duration_ms: 60000, cost: 0.5 }],
  children: [{ id: 'R2-c', workflow: 'tests_debate', status: 'failed', class: 'refused' }],
  output: { verdict: 'pass' },
};

test('the Runs view shows each run the endpoint gives, and how many were left out', async () => {
  const p = open();
  await p.reply('api/runs', list);
  const rows = p.view().all('tbody')[0].all('tr');
  assert.deepEqual(rows.map((r) => r.all('td').map((td) => td.textContent).slice(1)), [
    ['code_review', 'completed', '1m 30s', '$1.50', '2', ''],
    ['implement on codex', 'failed: runtime_error', '', '', '1', 'it broke'],
  ]);
  assert.match(p.view().textContent, /2 of 2 read\. 1 could not be read and is left out\./);
});

test('a run opened shows its facts, params, calls, child runs and output', async () => {
  const p = open();
  await p.reply('api/runs', list);
  p.view().all('tbody')[0].all('tr')[0].click();
  await p.reply('api/runs/R2', detail);
  const box = p.document.getElementById('detail');
  const facts = Object.fromEntries(box.all('dt').map((dt, i) => [dt.textContent, box.all('dd')[i].textContent]));
  assert.equal(facts.directory, '/work');
  assert.equal(facts['param base'], 'trunk');
  assert.deepEqual(box.all('tbody')[0].all('td').map((td) => td.textContent), ['implement', 'implement', 'codex', 'completed', '1m 0s', '$0.50']);
  assert.match(box.textContent, /Child runs: tests_debate failed: refused/);
  assert.match(box.textContent, /"verdict": "pass"/);
  assert.doesNotMatch(box.textContent, /\[object/);
});

test('Compare shows a row per process and agent', async () => {
  const p = open();
  await p.reply('api/runs', list);
  p.button('compare').click();
  await p.reply('api/runs/compare', { skipped: 0, groups: [{ process: 'review', agent: 'codex', runs: 3, completed: 2, pass_rate: 2 / 3, median_ms: 20000, total_cost: 0.25, cost_unknown: 2 }] });
  assert.deepEqual(p.view().all('td').map((td) => td.textContent), ['review', 'codex', '3', '2', '67%', '20s', '$0.25 (+2 unknown)']);
  assert.equal(p.button('compare').className, 'on');
  assert.equal(p.stored.get('agister-pages:view'), 'compare');
});

test('a reply to a view no longer chosen is dropped', async () => {
  const p = open('compare');
  p.button('runs').click();
  await p.reply('api/runs', list);
  await p.reply('api/runs/compare', { skipped: 0, groups: [{ process: 'late', agent: 'x', runs: 1, completed: 1, pass_rate: 1, median_ms: 1, total_cost: 0, cost_unknown: 1 }] });
  assert.match(p.view().textContent, /code_review/);
  assert.doesNotMatch(p.view().textContent, /late/);
  assert.equal(p.button('runs').className, 'on');
});

test('a failure of a view no longer chosen is dropped', async () => {
  const p = open();
  p.button('compare').click();
  await p.reply('api/runs/compare', { skipped: 0, groups: [] });
  await p.fail('api/runs', 500, 'boom');
  assert.match(p.view().textContent, /No ended calls yet/);
});

test('a run without calls, children or output shows none of them', async () => {
  const p = open();
  await p.reply('api/runs', list);
  p.view().all('tbody')[0].all('tr')[1].click();
  await p.reply('api/runs/R1', { id: 'R1', process: 'implement', started: '2026-11-01T08:00:00Z', status: 'failed', calls: [], children: [] });
  const box = p.document.getElementById('detail');
  assert.equal(box.all('table').length, 0);
  assert.doesNotMatch(box.textContent, /null|Child runs/);
});

test('a failed read is shown', async () => {
  const p = open();
  await p.fail('api/runs', 500, 'boom');
  assert.match(p.view().textContent, /api\/runs: 500 boom/);
});
