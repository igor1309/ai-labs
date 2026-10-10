import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../runs.js';

const U = globalThis.AgisterRuns;

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    raw: (k) => data.get(k),
  };
}

// Summaries as pages/runs.go writes them.
const call = {
  id: '20261001T100000Z-aaaaaa', process: 'implement', agent: 'implementor',
  created_at: '2026-10-01T10:00:00Z', finished_at: '2026-10-01T10:01:47Z', status: 'completed',
  implementor: { adapter: 'claude-code', version: '2.1', model: 'opus', reported_model: 'claude-opus-5-5', effort: 'high' },
  policy: { timeout_ms: 1200000, max_cost_usd: 5, access: 'read-write', scope: 'candidate' },
  outcome: { verify: { attempts: 2, passed: true }, wall_ms: 107000, turn_ms: 100000, runtime_ms: 99000, cost_usd: 0.5, cost_source: 'runtime' },
  parent: '20261001T095900Z-wwwwww',
  skills: [{ name: 'review', count: 3 }, { name: 'go', count: 1 }],
  tool_calls: 42,
};
const old = {
  id: '20260930T100000Z-bbbbbb', process: 'implement', created_at: '2026-09-30T10:00:00Z', status: 'failed',
  implementor: { adapter: 'codex', version: '0.9', model: 'gpt-6.1-sol', reported_model: 'gpt-6.1-sol' },
  outcome: { wall_ms: 412 },
};
const review = {
  id: '20260929T100000Z-cccccc', process: 'code_review', created_at: '2026-09-29T10:00:00Z', status: 'running',
  outcome: {},
  workflow: {
    nodes: [
      { name: 'first', process: 'review', run: 'r1', status: 'completed' },
      { name: 'second', process: 'review', run: 'r2', status: 'completed' },
      { name: 'judge', process: 'judge', join: true, run: 'r3', status: 'completed' },
    ],
    items: {
      total: 3, by_ruling: { fix: 2, defer: 1 }, by_severity: { high: 1, low: 2 },
      by_source: [{ source: 1, node: 'first', run: 'r1', by_ruling: { fix: 2 } }],
    },
  },
};
const runs = [call, old, review];

test('the view shown is kept under agister-pages:view; anything else reads as settings', () => {
  const storage = fakeStorage();
  assert.equal(U.readView(storage), 'settings');
  U.writeView(storage, 'runs');
  assert.equal(storage.raw('agister-pages:view'), 'runs');
  assert.equal(U.readView(storage), 'runs');
  U.writeView(storage, 'knowledge');
  assert.equal(U.readView(storage), 'knowledge');
  U.writeView(storage, 'compare');
  assert.equal(U.readView(storage), 'compare');
  assert.equal(U.readView(fakeStorage({ [U.VIEW_KEY]: 'other' })), 'settings');
  assert.equal(U.readView({ getItem() { throw new Error('blocked'); } }), 'settings');
  U.writeView({ setItem() { throw new Error('full'); } }, 'runs');
});

test('Runs and Compare read Agister home\'s runs; Settings and Knowledge read the settings', () => {
  assert.deepEqual(U.VIEWS.filter(U.readsRuns), ['runs', 'compare']);
});

test('a duration reads in ms under a second, then in seconds, minutes and hours', () => {
  assert.equal(U.duration(412), '412ms');
  assert.equal(U.duration(0), '0ms');
  assert.equal(U.duration(1000), '1s');
  assert.equal(U.duration(47400), '47s');
  assert.equal(U.duration(107000), '1m 47s');
  assert.equal(U.duration(120000), '2m 0s');
  assert.equal(U.duration(7500000), '2h 5m');
  assert.equal(U.duration(1500.5), '2s');
  for (const missing of [undefined, null, NaN, -1, '412']) assert.equal(U.duration(missing), '', String(missing));
});

test('a cost reads in dollars and cents; none reads as empty', () => {
  assert.equal(U.cost(0.5), '$0.50');
  assert.equal(U.cost(0), '$0.00');
  assert.equal(U.cost(12.345), '$12.35');
  assert.equal(U.cost(undefined), '');
  assert.equal(U.cost(null), '');
});

test('verify reads as the attempts used, out of the most when known, and a pass mark', () => {
  assert.equal(U.verify({ attempts: 2, passed: true }, 3), '2/3 ✓');
  assert.equal(U.verify({ attempts: 3, passed: false }, 3), '3/3 ✗');
  assert.equal(U.verify({ attempts: 2, passed: true }), '2 ✓');
  assert.equal(U.verify({ attempts: 0, passed: false }, 0), '0 ✗');
  assert.equal(U.verify(undefined), '');
  assert.equal(U.verify(call.outcome.verify), '2 ✓');
  assert.equal(U.verify(old.outcome.verify), '');
});

test('the implementor reads as adapter, model and effort; the reported model only when it differs', () => {
  assert.equal(U.implementor(call.implementor), 'claude-code opus high');
  assert.equal(U.reportedModel(call.implementor), 'claude-opus-5-5');
  assert.equal(U.implementor(old.implementor), 'codex gpt-6.1-sol');
  assert.equal(U.reportedModel(old.implementor), '');
  assert.equal(U.implementor({ adapter: 'codex' }), 'codex');
  assert.equal(U.reportedModel({ model: 'opus' }), '');
  assert.equal(U.implementor(undefined), '');
  assert.equal(U.reportedModel(undefined), '');
});

test('skills read as name×count in the order given; none reads as empty', () => {
  assert.equal(U.skills(call.skills), 'review×3, go×1');
  assert.equal(U.skills([]), '');
  assert.equal(U.skills(undefined), '');
});

test('counts read most first, then by name; a workflow reads as its node count', () => {
  assert.equal(U.counts(review.workflow.items.by_ruling), 'fix 2, defer 1');
  assert.equal(U.counts({ b: 1, a: 1, c: 0 }), 'a 1, b 1');
  assert.equal(U.counts({ '': 2 }), '- 2');
  assert.equal(U.counts({}), '');
  assert.equal(U.counts(undefined), '');
  assert.equal(U.nodes(review.workflow), '3 nodes');
  assert.equal(U.nodes({ nodes: [{}] }), '1 node');
  assert.equal(U.nodes({ nodes: [] }), '0 nodes');
});

test('rates, means and failure marks', () => {
  assert.equal(U.percent(2 / 3), '67%');
  assert.equal(U.percent(1), '100%');
  assert.equal(U.percent(undefined), '');
  assert.equal(U.mean(1.5), '1.5');
  assert.equal(U.mean(2), '2');
  assert.equal(U.mean(4 / 3), '1.3');
  assert.equal(U.mean(undefined), '');
  assert.ok(U.failed('failed') && U.failed('interrupted'));
  assert.ok(!U.failed('completed') && !U.failed('running') && !U.failed(undefined));
});

test('runs filter by process and status; an empty filter takes them all', () => {
  assert.deepEqual(U.filterRuns(runs, {}), runs);
  assert.deepEqual(U.filterRuns(runs), runs);
  assert.deepEqual(U.filterRuns(runs, { process: 'implement' }), [call, old]);
  assert.deepEqual(U.filterRuns(runs, { status: 'failed' }), [old]);
  assert.deepEqual(U.filterRuns(runs, { process: 'implement', status: 'running' }), []);
  assert.deepEqual(U.filterRuns(runs, { process: 'code_review', status: 'running' }), [review]);
  assert.deepEqual(U.filterRuns(undefined, { process: 'implement' }), []);
});

test('the filters list the processes and statuses present, once each, sorted', () => {
  assert.deepEqual(U.processes(runs), ['code_review', 'implement']);
  assert.deepEqual(U.statuses(runs), ['completed', 'failed', 'running']);
  assert.deepEqual(U.processes([]), []);
  assert.deepEqual(U.processes(undefined), []);
});

test('compare groups become a table per process, a row per configuration', () => {
  // As Compare writes them: sorted by process, adapter, model, effort.
  const groups = [
    { process: 'implement', adapter: 'claude-code', model: 'opus', effort: 'high', runs: 3, completed: 2, pass_rate: 2 / 3,
      mean_verify_attempts: 1.5, median_wall_ms: 107000, total_cost_usd: 1, cost_unknown: 1, cost_per_completed_usd: 0.5 },
    { process: 'implement', adapter: 'codex', model: 'gpt-6.1-sol', effort: '', runs: 1, completed: 0, pass_rate: 0,
      total_cost_usd: 0, cost_unknown: 1 },
    { process: 'review', adapter: 'codex', model: 'gpt-6.1-sol', effort: 'high', runs: 2, completed: 2, pass_rate: 1,
      median_wall_ms: 412, total_cost_usd: 1, cost_unknown: 0, cost_per_completed_usd: 0.5 },
  ];
  assert.deepEqual(U.compareTables(groups), [
    { process: 'implement', rows: [
      { adapter: 'claude-code', model: 'opus', effort: 'high', runs: '3', completed: '2', passRate: '67%',
        verifyAttempts: '1.5', medianWall: '1m 47s', costPerCompleted: '$0.50 (1 unknown)' },
      { adapter: 'codex', model: 'gpt-6.1-sol', effort: '-', runs: '1', completed: '0', passRate: '0%',
        verifyAttempts: '', medianWall: '', costPerCompleted: '(1 unknown)' },
    ] },
    // A process with a single configuration still has its table.
    { process: 'review', rows: [
      { adapter: 'codex', model: 'gpt-6.1-sol', effort: 'high', runs: '2', completed: '2', passRate: '100%',
        verifyAttempts: '', medianWall: '412ms', costPerCompleted: '$0.50' },
    ] },
  ]);
  assert.deepEqual(U.compareTables([]), []);
  assert.deepEqual(U.compareTables(undefined), []);
});

test('a call recorded before runtimes compares with its configuration as -', () => {
  const [table] = U.compareTables([{ process: 'p', adapter: '', model: '', effort: '', runs: 1, completed: 1, pass_rate: 1,
    total_cost_usd: 0, cost_unknown: 0, cost_per_completed_usd: 0 }]);
  assert.deepEqual([table.rows[0].adapter, table.rows[0].model, table.rows[0].effort, table.rows[0].costPerCompleted], ['-', '-', '-', '$0.00']);
});

test('completed, failed and interrupted show as marks; the other statuses as words', () => {
  assert.deepEqual(U.statusMark('completed'), { glyph: '✓', tone: 'ok' });
  assert.deepEqual(U.statusMark('failed'), { glyph: '⚠︎', tone: 'failed' });
  assert.deepEqual(U.statusMark('interrupted'), { glyph: '⚠︎', tone: 'warn' });
  assert.equal(U.statusMark('running'), null);
  assert.equal(U.statusMark('lost'), null);
});

test('a time span gives the date once when both ends fall on it', () => {
  const local = (h, m, day = 9) => new Date(2026, 9, day, h, m).toISOString();
  const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const [a, b, c] = [local(22, 1), local(22, 13), local(0, 10, 10)];
  assert.equal(U.timeSpan(a, b), `${time(a)} – ${time(b)}, 09.10.26`);
  assert.equal(U.timeSpan(a, c), `${time(a)}, 09.10.26 – ${time(c)}, 10.10.26`);
  assert.equal(U.timeSpan(a, undefined), `${time(a)} –, 09.10.26`);
  assert.match(U.timeSpan(new Date(2031, 0, 5, 9, 0).toISOString()), /, 05\.01\.31$/);
  assert.equal(U.timeSpan('', b), '');
  assert.equal(U.timeSpan('not a time', b), '');
});

test('a workflow\'s node rows carry their wall, cost and the rulings of the items they were a source of', () => {
  assert.deepEqual(U.nodeRows(review.workflow).map((n) => [n.name, n.join, n.run, n.rulings]),
    [['first', false, 'r1', 'fix 2'], ['second', false, 'r2', ''], ['judge', true, 'r3', '']]);
  assert.deepEqual(U.nodeRows({ nodes: [{ name: 'a', process: 'p', wall_ms: 1500, cost_usd: 0.25 }] }),
    [{ name: 'a', process: 'p', join: false, run: '', status: '', wall: '2s', cost: '$0.25', rulings: '' }]);
  assert.deepEqual(U.nodeRows(undefined), []);
});

test('a review\'s output reads as its verdict, then summary, findings and coverage as text, cards and a table', () => {
  const said = U.runOutput({
    status: 'completed',
    output: {
      coverage: [{ item: '1. Paths', status: 'checked', detail: 'Read it.' }, { item: '2. Tests', status: 'finding' }],
      verdict: 'request_changes',
      findings: [{
        severity: 'major', file: 'a.go', line: 12, title: 'A race', detail: 'It races.',
        evidence: { case: 'Run it twice.', trace: ['a.go:12', 'b.go:3'] }, fix_cost: { size: 'small' },
      }],
      summary: 'One finding.',
      extra: 7,
    },
    text: '{"verdict":"request_changes"}',
  });
  assert.equal(said.verdict, 'request_changes');
  assert.deepEqual(said.parts.map((p) => [p.key, p.kind]), [['summary', 'text'], ['findings', 'cards'], ['coverage', 'table'], ['extra', 'text']]);
  assert.deepEqual(said.parts[1].cards[0], {
    tags: ['major'], title: 'A race', where: 'a.go:12', sources: '', texts: [['detail', 'It races.']],
    more: { kind: 'facts', facts: [
      ['evidence', { kind: 'facts', facts: [['case', { kind: 'text', text: 'Run it twice.' }], ['trace', { kind: 'list', items: ['a.go:12', 'b.go:3'] }]] }],
      ['fix_cost', { kind: 'facts', facts: [['size', { kind: 'text', text: 'small' }]] }],
    ] },
  });
  assert.deepEqual(said.parts[2], { key: 'coverage', kind: 'table', columns: ['item', 'status', 'detail'], rows: [['1. Paths', 'checked', 'Read it.'], ['2. Tests', 'finding', '']] });
});

test('a judge\'s items are cards with their ruling, sources, reason and action; an empty list reads as none', () => {
  const said = U.runOutput({ output: { summary: 's', items: [{ title: 'T', ruling: 'fix', severity: 'minor', sources: ['1#1', '3#2'], reason: 'R', action: 'A', missing_evidence: '' }], coverage_gaps: [] } });
  assert.equal(said.verdict, '');
  assert.deepEqual(said.parts[1].cards[0], { tags: ['minor', 'fix'], title: 'T', where: '', sources: '1#1, 3#2', texts: [['reason', 'R'], ['action', 'A']], more: null });
  assert.deepEqual(said.parts[2], { key: 'coverage_gaps', kind: 'none' });
});

test('without an output a result reads as its text; an error comes first, its message then its class', () => {
  assert.deepEqual(U.runOutput({ status: 'completed', text: 'Plain *answer*.' }).parts, [{ key: 'text', kind: 'text', text: 'Plain *answer*.' }]);
  assert.deepEqual(U.runOutput({ status: 'failed', error: { class: 'rate_limited', message: 'Hit the limit.' }, text: 'partial' }).parts, [
    { key: 'error', kind: 'text', text: 'Hit the limit.\n\nclass: rate_limited' },
    { key: 'text', kind: 'text', text: 'partial' },
  ]);
  // An implement's checks are left out; its files and notes show.
  assert.deepEqual(U.runOutput({ output: { summary: 's', checks: [{ command: 'go test', exit_code: 0 }], files_changed: ['a.go'], notes: 'n' } }).parts.map((p) => p.key),
    ['summary', 'files_changed', 'notes']);
  assert.deepEqual(U.runOutput({ output: 'just a string' }).parts, [{ key: 'output', kind: 'text', text: 'just a string' }]);
  assert.deepEqual(U.runOutput({ output: { verdict: { odd: true } } }).parts, [{ key: 'verdict', kind: 'facts', facts: [['odd', { kind: 'text', text: 'true' }]] }]);
  assert.deepEqual(U.runOutput(undefined), { verdict: '', parts: [] });
});

test('a run\'s skill is looked for in its working directory, the picker\'s folder and home, each once', () => {
  assert.deepEqual(U.skillPlaces('/w', '/repo', '~'), ['/w', '/repo', '~']);
  assert.deepEqual(U.skillPlaces('/repo', '/repo', '~'), ['/repo', '~']);
  assert.deepEqual(U.skillPlaces(undefined, '~', '~'), ['~']);
});

test('a skill is found as the run\'s runtime finds it: settings first, then its adapter\'s folders, read before unread', () => {
  const skill = (name, content, path) => ({ name, content, path });
  const reply = {
    settings: [skill('named', 'from settings', 's')],
    folders: [
      { folder: '.claude/skills', adapters: ['claude-code'], skills: [skill('review', 'claude copy', 'c'), skill('named', 'claude named', 'cn')] },
      { folder: '.agents/skills', adapters: ['codex'], skills: [skill('review', '', 'unread'), skill('review', 'codex copy', 'x')] },
    ],
  };
  assert.deepEqual(U.findSkill(reply, 'review', 'codex'), { skill: skill('review', 'codex copy', 'x'), folder: '.agents/skills' });
  assert.deepEqual(U.findSkill(reply, 'review', 'claude-code'), { skill: skill('review', 'claude copy', 'c'), folder: '.claude/skills' });
  assert.equal(U.findSkill(reply, 'named', 'claude-code').folder, 'settings');
  assert.equal(U.findSkill({ folders: [{ folder: 'f', adapters: [], skills: [{ name: 'x', state: 'too_large' }] }] }, 'x', 'codex').skill.state, 'too_large');
  assert.equal(U.findSkill(reply, 'absent', 'codex'), null);
  assert.equal(U.findSkill(undefined, 'review', 'codex'), null);
});

test('verdicts, statuses and severities have a tone; other values none', () => {
  assert.deepEqual(['approve', 'checked', 'request_changes', 'finding', 'major', 'minor', 'rule_only', 'fix', 'whatever'].map(U.tone),
    ['ok', 'ok', 'bad', 'bad', 'bad', 'warn', 'warn', '', '']);
});
