import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config.js';

const C = globalThis.AgisterConfig;
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function notFound() {
  return new DOMException('NotFoundError raised', 'NotFoundError');
}

// A fake directory handle over an object tree: a string is a file's text,
// an object a folder.
function memDir(name, tree) {
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const [n, v] of Object.entries(tree)) yield [n, typeof v === 'string' ? memFile(n, v) : memDir(n, v)];
    },
    async getDirectoryHandle(n) {
      if (typeof tree[n] !== 'object') throw notFound();
      return memDir(n, tree[n]);
    },
    async getFileHandle(n) {
      if (typeof tree[n] !== 'string') throw notFound();
      return memFile(n, tree[n]);
    },
  };
}

function memFile(name, text) {
  return { kind: 'file', name, async getFile() { return { text: async () => text }; } };
}

// A directory handle over a real folder, for the settings in this repo.
function diskDir(path) {
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
  return {
    kind: 'directory',
    name: path,
    async *entries() {
      for (const n of readdirSync(path)) {
        const p = join(path, n);
        yield [n, isDir(p) ? diskDir(p) : memFile(n, readFileSync(p, 'utf8'))];
      }
    },
    async getDirectoryHandle(n) {
      if (!isDir(join(path, n))) throw notFound();
      return diskDir(join(path, n));
    },
    async getFileHandle(n) {
      if (!isFile(join(path, n))) throw notFound();
      return memFile(n, readFileSync(join(path, n), 'utf8'));
    },
  };
}

test('YAML: nested maps, flow maps, numbers, booleans and comments', () => {
  const doc = C.parseYaml([
    '# leading',
    'name: code_review   # trailing',
    'input:',
    '  params:',
    '    base: {default: origin/agister}',
    '    brief: {}',
    'timeout: 20m',
    'max_cost_usd: 2',
    'require_valid: true',
    'url: "a # not a comment"',
  ].join('\n'));
  assert.deepEqual(doc, {
    name: 'code_review',
    input: { params: { base: { default: 'origin/agister' }, brief: {} } },
    timeout: '20m',
    max_cost_usd: 2,
    require_valid: true,
    url: 'a # not a comment',
  });
});

test('YAML: lists of flow maps, of scalars, at the key indent and of block maps', () => {
  const doc = C.parseYaml([
    'fan_out:',
    '  - {node: a, uses: process:x}',
    '  - {node: b, uses: process:y}',
    'allow:',
    '- repository.read',
    '- "host.read"',
    'items:',
    '  - name: one',
    '    on: true',
    '  - name: two',
  ].join('\n'));
  assert.deepEqual(doc, {
    fan_out: [{ node: 'a', uses: 'process:x' }, { node: 'b', uses: 'process:y' }],
    allow: ['repository.read', 'host.read'],
    items: [{ name: 'one', on: true }, { name: 'two' }],
  });
});

test('YAML: a flow list may continue on the next lines', () => {
  const doc = C.parseYaml([
    'grants: [repository.read, process.execute,',
    '         host.write]',
    'verified: ["0.158.", "0.159."]',
  ].join('\n'));
  assert.deepEqual(doc, {
    grants: ['repository.read', 'process.execute', 'host.write'],
    verified: ['0.158.', '0.159.'],
  });
});

test('YAML: a folded scalar joins its lines and keeps # as text', () => {
  const doc = C.parseYaml([
    'input:',
    '  instruction: >-',
    '    Review the change;',
    '    # this is text, not a comment.',
    '',
    '    New paragraph.',
    '  values: {}',
    'verify:',
    '  command: |',
    '    a',
    '    b',
  ].join('\n'));
  assert.equal(doc.input.instruction, 'Review the change; # this is text, not a comment.\nNew paragraph.');
  assert.deepEqual(doc.input.values, {});
  assert.equal(doc.verify.command, 'a\nb\n');
});

test('YAML: a line that is not "key: value" fails with its line number', () => {
  assert.throws(() => C.parseYaml('name: x\njust text\n'), /line 2/);
  assert.throws(() => C.parseYaml('a: [1, 2\n'), /\[1, 2/);
});

test('TOML: keys, strings, numbers, multi-line arrays and tables', () => {
  const doc = C.parseToml([
    'schema = "agister.service/v1alpha1"',
    'max_attempts = 1   # comment',
    'permissions = [',
    '  "repository.read",  # first',
    '  "network",',
    ']',
    '[limits]',
    'cost = 2.5',
  ].join('\n'));
  assert.deepEqual(doc, {
    schema: 'agister.service/v1alpha1',
    max_attempts: 1,
    permissions: ['repository.read', 'network'],
    limits: { cost: 2.5 },
  });
  assert.throws(() => C.parseToml('ok = 1\nnot toml\n'), /line 2/);
});

test('the purpose is the first sentence of the leading comment', () => {
  assert.equal(C.leadingComment('# One. Two\n# three.\nname: x\n# later\n'), 'One. Two three.');
  assert.equal(C.firstSentence('Review of one change (ADR-003): the reviews. Then more.'),
    'Review of one change (ADR-003): the reviews.');
  assert.equal(C.firstSentence('no stop'), 'no stop');
});

const settings = {
  'service.toml': 'max_timeout = "1h"\nmax_attempts = 1\nmax_verify_attempts = 3\npermissions = ["a", "b"]\n',
  agents: {
    'opus.toml': 'name = "opus"\nruntime = "claude-code"\nmodel = "opus"\neffort = "high"\nsession = "resumable"\n',
    'sol.toml': 'name = "sol"\nruntime = "codex"\nmodel = "gpt"\neffort = "high"\nsession = "fresh-only"\n',
    'notes.md': 'ignored',
  },
  runtimes: {
    'codex.yaml': 'name: codex\nadapter: codex\ncontract: codex/2\nprimitives:\n  items:\n' +
      '    ro: {verified: ["0.158."]}\n    rw: {verified: ["0.158.", "0.159."]}\n',
  },
  policies: {
    'review.yaml': '# Read-only review. More.\nname: review\nworkspace: {access: read-only}\ntimeout: 20m\n' +
      'tools:\n  allow: [repository.read]\nisolation:\n  deny: [network]\n',
    'bad.yaml': 'name: bad\n  oops: 1\n',
  },
  processes: {
    'implement.yaml': 'name: implement\nuses: agent:opus\npolicy: process-policy:missing\ninput:\n' +
      '  instruction: >-\n    Implement the brief. Then report.\n  params:\n    brief: {}\n' +
      '    candidate: {default: HEAD}\nverify:\n  max_attempts: 3\noutput: {schema: implementation}\n',
    'review.yaml': '# Reviews a change.\nname: review\nuses: agent:sol\npolicy: process-policy:review\n',
  },
  workflows: {
    'panel.yaml': '# A panel. Details.\nname: panel\nfan_out:\n  - {node: r, uses: process:review}\n' +
      'join: {node: j, uses: process:judge}\n',
  },
  schemas: { 'implementation.json': '{}' },
};

test('loadAgister reads each kind into its dashboard fields', async () => {
  const m = await C.loadAgister(memDir('.agister', settings));
  assert.deepEqual(m.service, { maxTimeout: '1h', maxAttempts: 1, maxVerifyAttempts: 3, permissions: 2 });
  assert.deepEqual(m.agents.map((a) => [a.name, a.runtime, a.model, a.effort, a.session]), [
    ['opus', 'claude-code', 'opus', 'high', 'resumable'],
    ['sol', 'codex', 'gpt', 'high', 'fresh-only'],
  ]);
  const impl = m.processes.find((p) => p.name === 'implement');
  assert.equal(impl.purpose, 'Implement the brief.');
  assert.equal(impl.agent, 'opus');
  assert.equal(impl.policy, 'missing');
  assert.deepEqual(impl.params, [{ name: 'brief', default: undefined }, { name: 'candidate', default: 'HEAD' }]);
  assert.deepEqual(impl.verify, { maxAttempts: 3 });
  assert.equal(impl.output, 'implementation');
  const review = m.policies.find((p) => p.name === 'review');
  assert.deepEqual([review.purpose, review.access, review.timeout, review.allow, review.deny],
    ['Read-only review.', 'read-only', '20m', ['repository.read'], ['network']]);
  assert.deepEqual(m.runtimes[0].verified, ['0.158.', '0.159.']);
  assert.equal(m.workflows[0].purpose, 'A panel.');
  assert.deepEqual(m.schemas.map((x) => x.name), ['implementation']);
});

test('loadAgister links users and marks names defined outside the folder', async () => {
  const m = await C.loadAgister(memDir('.agister', settings));
  const agent = (n) => m.agents.find((a) => a.name === n);
  assert.deepEqual([agent('opus').runtimeOutside, agent('sol').runtimeOutside], [true, false]);
  assert.deepEqual(agent('sol').usedBy, ['review']);
  const impl = m.processes.find((p) => p.name === 'implement');
  assert.deepEqual([impl.agentOutside, impl.policyOutside, impl.outputOutside], [false, true, false]);
  assert.deepEqual(m.schemas[0].usedBy, ['implement']);
  assert.deepEqual(m.runtimes[0].usedBy, ['sol']);
  assert.deepEqual(m.processes.find((p) => p.name === 'review').usedBy, ['panel']);
  assert.deepEqual(m.policies.find((p) => p.name === 'review').usedBy, ['review']);
  assert.deepEqual(m.workflows[0].fanOut, [{ node: 'r', process: 'review', outside: false }]);
  assert.deepEqual(m.workflows[0].join, { node: 'j', process: 'judge', outside: true });
});

test('a file that does not parse becomes an error item; the rest still load', async () => {
  const m = await C.loadAgister(memDir('.agister', settings));
  const bad = m.policies.find((p) => p.name === 'bad');
  assert.equal(bad.file, 'bad.yaml');
  assert.match(bad.error, /line 2/);
  assert.equal(m.policies.length, 2);
});

test('a repo goes over Agister home: same kind and file name replaces, the rest adds up', async () => {
  const home = memDir('.agister', {
    'service.toml': 'max_attempts = 2\n',
    agents: { 'opus.toml': 'name = "opus"\nmodel = "opus-old"\n', 'haiku.toml': 'name = "haiku"\nruntime = "claude-code"\n' },
    runtimes: { 'claude-code.yaml': 'name: claude-code\nadapter: claude-code\n' },
    policies: { 'review.yaml': 'name: review\n' },
  });
  const repo = memDir('.agister', {
    agents: { 'opus.toml': 'name = "opus"\nmodel = "opus"\nruntime = "claude-code"\n' },
    processes: { 'p.yaml': 'name: p\nuses: agent:opus\npolicy: process-policy:review\noutput: {schema: missing}\n' },
  });
  const m = await C.loadComposed(home, repo);
  assert.deepEqual(m.agents.map((a) => [a.name, a.model, a.source, !!a.overrides]),
    [['haiku', null, 'home', false], ['opus', 'opus', 'repo', true]]);
  assert.deepEqual(m.service, { maxTimeout: null, maxAttempts: 2, maxVerifyAttempts: null, permissions: 0, source: 'home' });
  const p = m.processes[0];
  assert.deepEqual([p.source, p.agentOutside, p.policyOutside, p.outputOutside], ['repo', false, false, true]);
  assert.deepEqual(m.agents.find((a) => a.name === 'opus').runtimeOutside, false);
  assert.deepEqual(m.policies[0].usedBy, ['p']);

  const own = await C.loadComposed(memDir('.agister', { 'service.toml': 'max_attempts = 2\n' }),
    memDir('.agister', { 'service.toml': 'max_attempts = 1\n' }));
  assert.deepEqual([own.service.maxAttempts, own.service.source, own.service.overrides], [1, 'repo', true]);
});

test('missing folders and service.toml read as empty', async () => {
  const m = await C.loadAgister(memDir('.agister', {}));
  assert.deepEqual(m, { service: null, workflows: [], processes: [], agents: [], policies: [], runtimes: [], schemas: [] });
});

for (const path of ['.agister', 'agister/examples/settings']) {
  test(`the settings in ${path} load without errors`, async () => {
    const m = await C.loadAgister(diskDir(join(repoRoot, path)));
    const items = [...m.workflows, ...m.processes, ...m.agents, ...m.policies, ...m.runtimes];
    assert.ok(items.length > 0);
    assert.deepEqual(items.filter((x) => x.error).map((x) => `${x.file}: ${x.error}`), []);
    assert.ok(!m.service?.error, m.service?.error);
  });
}
