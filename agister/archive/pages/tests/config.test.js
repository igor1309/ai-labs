import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// The spellings Agister's YAML reads as booleans (yaml.v3's !!bool), in a
// block map, a flow map and a list; quoted, or spelled otherwise, a value
// stays a string.
test('YAML: true, True, TRUE, false, False and FALSE are booleans; quoted ones and other spellings are strings', () => {
  const doc = C.parseYaml([
    'a: true',
    'b: True',
    'c: TRUE',
    'd: false',
    'e: False',
    'f: FALSE',
    'flow: {clean: True, off: FALSE}',
    'list: [TRUE, False]',
    'quoted: ["True", \'FALSE\', "true"]',
    'other: [tRue, yes, on, y]',
  ].join('\n'));
  assert.deepEqual(doc, {
    a: true, b: true, c: true, d: false, e: false, f: false,
    flow: { clean: true, off: false },
    list: [true, false],
    quoted: ['True', 'FALSE', 'true'],
    other: ['tRue', 'yes', 'on', 'y'],
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

// A settings file holds one YAML document (LAB-77): one with a second,
// empty or not, does not parse, as Agister refuses it.
test('YAML: a second document fails at its --- line', () => {
  assert.throws(() => C.parseYaml('name: x\n---\nname: y\n'), /line 2/);
  assert.throws(() => C.parseYaml('name: x\n---\n'), /line 2/);
});

// Agister's YAML reads a --- that opens the one document; a second after
// it still fails.
test('YAML: a leading --- opens the one document; a second still fails', () => {
  assert.deepEqual(C.parseYaml('---\nname: x\nguidance: [a]\n'), { name: 'x', guidance: ['a'] });
  assert.deepEqual(C.parseYaml('# head\n--- # opens\nname: x\n'), { name: 'x' });
  assert.throws(() => C.parseYaml('---\nname: x\n---\nname: y\n'), /line 3/);
  assert.throws(() => C.parseYaml('---\n---\nname: x\n'), /line 2/);
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

test('a purpose is the first sentence of its text', () => {
  assert.equal(C.firstSentence('Review of one change (ADR-003): the reviews. Then more.'),
    'Review of one change (ADR-003): the reviews.');
  assert.equal(C.firstSentence('no stop'), 'no stop');
});

const settings = {
  'service.toml': 'max_timeout = "1h"\nmax_attempts = 1\nmax_verify_attempts = 3\npermissions = ["a", "b"]\n',
  agents: {
    'opus.toml': 'name = "opus"\nruntime = "claude-code"\nmodel = "opus"\neffort = "high"\n',
    'sol.toml': 'name = "sol"\nruntime = "codex"\nmodel = "gpt"\neffort = "high"\n',
    'notes.md': 'ignored',
  },
  runtimes: {
    'codex.yaml': 'name: codex\nadapter: codex\ncontract: codex/2\nprimitives:\n  items:\n' +
      '    ro: {verified: ["0.158."]}\n    rw: {verified: ["0.158.", "0.159."]}\n',
  },
  processes: {
    'implement.yaml': 'name: implement\nsession: resumable\ninput:\n' +
      '  instruction: >-\n    Implement the brief. Then report.\n  params:\n    brief: {}\n' +
      '    candidate: {default: HEAD}\nverify:\n  max_attempts: 3\noutput: {schema: implementation}\n',
    'review.yaml': '# Reviews a change.\nname: review\nworkspace: {access: read-only, scope: candidate}\ntimeout: 20m\n' +
      'max_cost_usd: 2\nretry: {max_attempts: 2}\ntools:\n  allow: [repository.read, repository.diff]\n  require: [repository.read]\n' +
      'isolation:\n  deny: [network]\n',
    'bad.yaml': 'name: bad\n  oops: 1\n',
  },
  workflows: {
    'panel.yaml': '# A panel. Details.\nname: panel\nfan_out:\n  - {node: r, uses: process:review, agent: sol}\n' +
      'join: {node: j, uses: process:judge, agent: opus}\n',
  },
  schemas: { 'implementation.json': '{}' },
};

test('loadAgister reads each kind into its dashboard fields', async () => {
  const m = await C.loadAgister(memDir('.agister', settings));
  assert.deepEqual(m.service, { maxTimeout: '1h', maxAttempts: 1, maxVerifyAttempts: 3, permissions: 2 });
  assert.deepEqual(m.agents.map((a) => [a.name, a.runtime, a.model, a.effort]), [
    ['opus', 'claude-code', 'opus', 'high'],
    ['sol', 'codex', 'gpt', 'high'],
  ]);
  for (const a of m.agents) assert.ok(!('session' in a), a.name);
  const impl = m.processes.find((p) => p.name === 'implement');
  assert.equal(impl.purpose, 'Implement the brief.');
  assert.equal(impl.session, 'resumable');
  for (const gone of ['agent', 'policy']) assert.ok(!(gone in impl), gone);
  assert.deepEqual(impl.params, [{ name: 'brief', default: undefined }, { name: 'candidate', default: 'HEAD' }]);
  assert.deepEqual(impl.verify, { maxAttempts: 3 });
  assert.equal(impl.output, 'implementation');
  // ADR-030 rules 3 and 4: a process holds its own limits and session.
  const review = m.processes.find((p) => p.name === 'review');
  assert.deepEqual([review.access, review.scope, review.timeout, review.maxCostUsd, review.attempts, review.allow, review.require, review.deny, review.session],
    ['read-only', 'candidate', '20m', 2, 2, ['repository.read', 'repository.diff'], ['repository.read'], ['network'], null]);
  assert.equal(m.policies, undefined);
  assert.deepEqual(m.runtimes[0].verified, ['0.158.', '0.159.']);
  assert.equal(m.workflows[0].purpose, undefined, 'a comment is no purpose');
  assert.deepEqual(m.schemas.map((x) => x.name), ['implementation']);
});

test('loadAgister links users and marks names defined outside the folder', async () => {
  const m = await C.loadAgister(memDir('.agister', settings));
  const agent = (n) => m.agents.find((a) => a.name === n);
  assert.deepEqual([agent('opus').runtimeOutside, agent('sol').runtimeOutside], [true, false]);
  // An agent is used by the workflows whose nodes bind it (ADR-030 rule 5).
  assert.deepEqual([agent('sol').usedBy, agent('opus').usedBy], [['panel'], ['panel']]);
  const impl = m.processes.find((p) => p.name === 'implement');
  assert.equal(impl.outputOutside, false);
  assert.deepEqual(m.schemas[0].usedBy, ['implement']);
  assert.deepEqual(m.runtimes[0].usedBy, ['sol']);
  assert.deepEqual(m.processes.find((p) => p.name === 'review').usedBy, ['panel']);
  assert.deepEqual(m.processes.find((p) => p.name === 'review').agents, ['sol']);
  assert.deepEqual(m.workflows[0].fanOut, [{ node: 'r', process: 'review', agent: 'sol', outside: false }]);
  assert.deepEqual(m.workflows[0].join, { node: 'j', process: 'judge', agent: 'opus', outside: true });
});

// ADR-030 rule 5: a node names the agent its call runs on, by its name
// alone, in a flow map or a block map; a node that names none has none,
// which Agister refuses. A process names no agent: it is bound to the
// agents its nodes name.
test('a workflow node keeps the agent it names, and a process is bound to its nodes\' agents', async () => {
  const m = await C.loadAgister(memDir('.agister', {
    agents: { 'sol.toml': 'name = "sol"\n' },
    processes: { 'check.yaml': 'name: check\n', 'bare.yaml': 'name: bare\n' },
    workflows: {
      'panel.yaml': 'name: panel\nfan_out:\n  - {node: one, uses: process:check, agent: opus}\n' +
        '  - node: two\n    uses: process:bare\n    agent: sol\n  - {node: three, uses: process:check}\n' +
        'join: {node: j, uses: process:bare, agent: opus}\n',
    },
  }));
  assert.deepEqual(m.workflows[0].fanOut, [
    { node: 'one', process: 'check', agent: 'opus', outside: false },
    { node: 'two', process: 'bare', agent: 'sol', outside: false },
    { node: 'three', process: 'check', agent: null, outside: false },
  ]);
  assert.deepEqual(m.workflows[0].join, { node: 'j', process: 'bare', agent: 'opus', outside: false });
  const bare = m.processes.find((p) => p.name === 'bare');
  assert.deepEqual([bare.agents, bare.usedBy], [['sol', 'opus'], ['panel']]);
  assert.deepEqual(m.processes.find((p) => p.name === 'check').agents, ['opus']);
  assert.deepEqual(m.agents[0].usedBy, ['panel']);
});

// ADR-030 rule 6: a workflow of one call has that call as its one node,
// with the agent it binds, and takes its process's params.
test('a workflow of one call keeps its node and takes its process params', async () => {
  const m = await C.loadAgister(memDir('.agister', {
    agents: { 'sol.toml': 'name = "sol"\n' },
    processes: { 'implement.yaml': 'name: implement\ninput:\n  params:\n    brief: {}\n    candidate: {default: HEAD}\n' },
    workflows: { 'implement_sol.yaml': 'name: implement_sol\ncall: {node: implement, uses: process:implement, agent: sol}\n' },
  }));
  const w = m.workflows[0];
  assert.deepEqual([w.fanOut, w.join], [[], null]);
  assert.deepEqual(w.call, { node: 'implement', process: 'implement', agent: 'sol', outside: false });
  assert.deepEqual(w.params, [{ name: 'brief', default: undefined }, { name: 'candidate', default: 'HEAD' }]);
  assert.deepEqual(m.processes[0].usedBy, ['implement_sol']);
});

test('a file that does not parse becomes an error item; the rest still load', async () => {
  const m = await C.loadAgister(memDir('.agister', settings));
  const bad = m.processes.find((p) => p.name === 'bad');
  assert.equal(bad.file, 'bad.yaml');
  assert.match(bad.error, /line 2/);
  assert.equal(m.processes.length, 3);
});

test('a repo goes over Agister home: same kind and file name replaces, the rest adds up', async () => {
  const home = memDir('.agister', {
    'service.toml': 'max_attempts = 2\n',
    agents: { 'opus.toml': 'name = "opus"\nmodel = "opus-old"\n', 'haiku.toml': 'name = "haiku"\nruntime = "claude-code"\n' },
    runtimes: { 'claude-code.yaml': 'name: claude-code\nadapter: claude-code\n' },
  });
  const repo = memDir('.agister', {
    agents: { 'opus.toml': 'name = "opus"\nmodel = "opus"\nruntime = "claude-code"\n' },
    processes: { 'p.yaml': 'name: p\noutput: {schema: missing}\n' },
  });
  const m = await C.loadComposed(home, repo);
  assert.deepEqual(m.agents.map((a) => [a.name, a.model, a.source, !!a.overrides]),
    [['haiku', null, 'home', false], ['opus', 'opus', 'repo', true]]);
  assert.deepEqual(m.service, { maxTimeout: null, maxAttempts: 2, maxVerifyAttempts: null, permissions: 0, source: 'home' });
  const p = m.processes[0];
  assert.deepEqual([p.source, p.outputOutside], ['repo', true]);
  assert.deepEqual(m.agents.find((a) => a.name === 'opus').runtimeOutside, false);

  const own = await C.loadComposed(memDir('.agister', { 'service.toml': 'max_attempts = 2\n' }),
    memDir('.agister', { 'service.toml': 'max_attempts = 1\n' }));
  assert.deepEqual([own.service.maxAttempts, own.service.source, own.service.overrides], [1, 'repo', true]);
});

// ADR-025 rules 2 and 3: a process names the input whose revision HEAD
// must be at, and says whether a fresh call needs HEAD's content; neither,
// by default. The obsolete workspace.yaml is not read, and neither the
// process's setup nor a verification's where is shown.
test('each process shows what its call needs of the caller\'s worktree', async () => {
  const process = (name, workspace) => `name: ${name}\nworkspace:\n${workspace}`;
  const processes = {
    'fix.yaml': process('fix', '  revision: rev\n  clean: true\n  setup: {command: ./own.sh, timeout: 30s}\n'),
    'review.yaml': process('review', '  revision: rev\n'),
    'shout.yaml': process('shout', '  clean: TRUE\n'),
    'title.yaml': process('title', '  revision: rev\n  clean: True\n'),
    'quoted.yaml': process('quoted', '  clean: "true"\n'),
    'none.yaml': process('none', '  access: read-only\n'),
    'checks.yaml': 'name: checks\nverify:\n  command: make test\n  max_attempts: 2\n  where: workspace\n',
  };
  const workspace = 'schema: agister.workspace/v1alpha1\nmode: in-place\nprecheck: {command: ./check.sh, timeout: 1m}\n';
  const m = await C.loadComposed(memDir('.agister', { 'workspace.yaml': workspace }), memDir('.agister', { 'workspace.yaml': workspace, processes }));
  const needs = (name) => {
    const p = m.processes.find((x) => x.name === name);
    return [p.revision, p.clean];
  };
  assert.deepEqual(needs('fix'), ['rev', true]);
  assert.deepEqual(needs('review'), ['rev', false]);
  assert.deepEqual(needs('shout'), [null, true]);
  assert.deepEqual(needs('title'), ['rev', true]);
  assert.deepEqual(needs('quoted'), [null, false]); // a string, which Agister refuses
  assert.deepEqual(needs('none'), [null, false]);
  assert.equal(m.workspace, undefined);
  const fix = m.processes.find((x) => x.name === 'fix');
  for (const gone of ['checkout', 'setup', 'effectiveSetup', 'effectiveMode', 'precheck']) assert.ok(!(gone in fix), gone);
  assert.deepEqual(m.processes.find((x) => x.name === 'checks').verify, { maxAttempts: 2 });
});

// ADR-010: a process names its verification, found in the repo before home.
test('a named verification is resolved from the composed settings, or marked outside', async () => {
  const home = {
    processes: { 'implement.yaml': 'name: implement\nverify: verify:repo\n' },
  };
  const repo = { verifies: { 'repo.yaml': 'name: repo\ncommand: make test\nmax_attempts: 2\n' } };
  const m = await C.loadComposed(memDir('.agister', home), memDir('.agister', repo));
  assert.deepEqual(m.processes[0].verify, { ref: 'repo', maxAttempts: 2, outside: false });
  assert.deepEqual([m.verifies[0].name, m.verifies[0].source, m.verifies[0].usedBy], ['repo', 'repo', ['implement']]);

  const alone = await C.loadAgister(memDir('.agister', home));
  assert.deepEqual(alone.processes[0].verify, { ref: 'repo', maxAttempts: null, outside: true });
});

// ADR-028: prompt and guidance resolve separately, and obsolete input
// sources do not name prompts in the view.
test('prompt and guidance are found in the composed settings, or marked outside', async () => {
  const home = {
    processes: { 'review.yaml': 'name: review\nprompt: review\nguidance: [style]\ninput:\n  values:\n    obsolete: {source: prompt, name: obsolete, optional: true}\n' },
    prompts: { 'review.md': 'Home review.\n', 'style.md': 'Home style.\n' },
  };
  const repo = { prompts: { 'review.md': 'Repo review.\n' } };
  const m = await C.loadComposed(memDir('.agister', home), memDir('.agister', repo));
  assert.deepEqual(m.processes[0].prompt, { name: 'review', outside: false, source: 'repo', overrides: true });
  assert.deepEqual(m.processes[0].guidance, [{ name: 'style', outside: false, source: 'home', overrides: false }]);
  assert.deepEqual(m.prompts[0].usedBy, ['review']);
  const alone = await C.loadAgister(memDir('.agister', { processes: home.processes }));
  assert.deepEqual(alone.processes[0].prompt, { name: 'review', outside: true });
  assert.deepEqual(alone.processes[0].guidance, [{ name: 'style', outside: true }]);
  const empty = await C.loadComposed(memDir('.agister', home), memDir('.agister', { processes: { 'review.yaml': 'guidance: []\n' } }));
  assert.deepEqual(empty.processes[0].guidance, []);
  assert.equal(empty.processes[0].prompt.name, 'review');
});

// ADR-026: a process's and a workflow's file inputs name the brief forms
// their text must have, each once, found in the repo before home; a form
// says which processes and workflows name it.
test('the brief forms a process and a workflow name are found in the composed settings, or marked outside', async () => {
  const home = {
    processes: { 'implement.yaml': 'name: implement\ninput:\n  instruction: Implement.\n  values:\n    brief: {source: file, path: "${param.brief}", form: [goal, step]}\n    notes: {source: file, path: notes.md, form: [goal]}\n    plain: {source: file, path: plain.md}\n' },
    workflows: { 'review.yaml': 'name: review\ninput:\n  values:\n    goal: {source: file, path: "${param.goal}", form: [goal]}\nfan_out:\n  - {node: one, uses: process:implement}\njoin: {node: j, uses: process:implement}\n' },
    briefs: {
      'goal.yaml': '# The goal: what a piece of work is for.\nname: goal\nparts:\n  - {heading: "## Intent", required: true}\n  - {heading: "## Sources", required: false}\ntemplate: |\n  ## Intent\n',
      'step.yaml': 'name: step\nparts:\n  - {heading: "## Goal", required: true, reference: file}\ntemplate: |\n  ## Goal\n',
    },
  };
  const repo = { briefs: { 'goal.yaml': '# The project goal: what this repo\'s work is for.\nname: goal\nparts:\n  - {heading: "## Intent", required: true}\n  - {heading: "## Done when", required: true}\n  - {heading: "## Open", required: true, reads: None.}\ntemplate: |\n  ## Intent\n' } };
  const m = await C.loadComposed(memDir('.agister', home), memDir('.agister', repo));
  assert.deepEqual(m.processes[0].forms, [
    { name: 'goal', outside: false, source: 'repo', overrides: true },
    { name: 'step', outside: false, source: 'home', overrides: false },
  ]);
  assert.deepEqual(m.workflows[0].forms, [{ name: 'goal', outside: false, source: 'repo', overrides: true }]);
  const goal = m.briefs[0];
  assert.deepEqual([goal.name, goal.purpose, goal.source, goal.usedBy], ['goal', undefined, 'repo', ['implement', 'review']]);
  assert.deepEqual(goal.parts, [{ heading: '## Intent', required: true }, { heading: '## Done when', required: true }, { heading: '## Open', required: true }]);

  const alone = await C.loadAgister(memDir('.agister', { processes: home.processes, workflows: home.workflows }));
  assert.deepEqual(alone.processes[0].forms, [{ name: 'goal', outside: true }, { name: 'step', outside: true }]);
  assert.deepEqual(alone.workflows[0].forms, [{ name: 'goal', outside: true }]);
});

// ADR-021: an agent and a process name skills, each a folder of
// skills/, found in the repo before home; a node's call gets its process's,
// then those of the agent the node binds, so a skill is used by each process
// that names it or is bound to an agent that does. The skills are the server's inventory of
// both layers (api/skills' settings), not the folder's files (D-16): one
// that fails its checks is there all the same.
test('an agent\'s and a process\'s skills are found in the composed settings, or marked outside', async () => {
  const passed = { passed: true };
  const failed = { passed: false, failed: ['SKILL.md is missing'] };
  const skill = (scope, name, more = {}) => ({ scope, name, path: `/${scope}/skills/${name}`, description: 'D.', checks: passed, ...more });
  const inventory = [
    skill('repo', 'plan'),
    skill('home', 'go'), skill('home', 'plan'),
    skill('home', 'style', { state: 'missing', description: undefined, checks: failed }),
  ];
  const home = {
    agents: { 'opus.toml': 'name = "opus"\nruntime = "claude-code"\nskills = ["go", "plan", "gone", "go"]\n' },
    processes: { 'review.yaml': 'name: review\nskills: [plan, style, ghost]\ninput:\n  instruction: Review.\n' },
    workflows: { 'review_opus.yaml': 'name: review_opus\ncall: {node: review, uses: process:review, agent: opus}\n' },
    // Files under skills/ are not what the skills are.
    skills: { ghost: { 'SKILL.md': '---\nname: ghost\ndescription: D.\n---\n' } },
  };
  const m = await C.loadComposed(memDir('.agister', home), memDir('.agister', {}), inventory);
  assert.deepEqual(m.skills.map((s) => [s.name, s.source, !!s.overrides, s.usedBy]), [
    ['go', 'home', false, ['review']],
    ['plan', 'repo', true, ['review']],
    ['style', 'home', false, ['review']],
  ]);
  const found = (name, source, overrides, checks = passed, state = null, description = 'D.') => ({
    name, outside: false, source, overrides, path: `/${source}/skills/${name}`, state, description, checks,
  });
  assert.deepEqual(m.agents[0].skills, [
    found('go', 'home', false),
    found('plan', 'repo', true),
    { name: 'gone', outside: true },
  ]);
  const review = m.processes[0];
  assert.deepEqual(review.skills, [
    found('plan', 'repo', true),
    found('style', 'home', false, failed, 'missing', null),
    { name: 'ghost', outside: true },
  ]);
  assert.deepEqual(review.agents, ['opus']);

  // One layer alone takes its inventory as it is.
  const tilde = await C.loadAgister(memDir('.agister', home), inventory.filter((s) => s.scope === 'home'));
  assert.deepEqual(tilde.agents[0].skills.map((x) => [x.name, x.outside, x.path]),
    [['go', false, '/home/skills/go'], ['plan', false, '/home/skills/plan'], ['gone', true, undefined]]);

  const alone = await C.loadAgister(memDir('.agister', { agents: home.agents, processes: home.processes }));
  assert.deepEqual(alone.agents[0].skills.map((x) => [x.name, x.outside]), [['go', true], ['plan', true], ['gone', true]]);
  assert.deepEqual(alone.processes[0].skills.map((x) => [x.name, x.outside]),
    [['plan', true], ['style', true], ['ghost', true]]);
});

test('missing folders and service.toml read as empty', async () => {
  const m = await C.loadAgister(memDir('.agister', {}));
  assert.deepEqual(m, { service: null, workflows: [], processes: [], agents: [], runtimes: [], schemas: [], verifies: [], prompts: [], briefs: [], skills: [] });
});

for (const path of ['agister/.agister', 'warder/.agister', 'agister/home', 'agister/examples/settings']) {
  test(`the settings in ${path} load without errors`, async () => {
    const m = await C.loadAgister(diskDir(join(repoRoot, path)));
    const items = [...m.workflows, ...m.processes, ...m.agents, ...m.runtimes, ...m.verifies, ...m.briefs];
    assert.ok(items.length > 0);
    assert.deepEqual(items.filter((x) => x.error).map((x) => `${x.file}: ${x.error}`), []);
    assert.ok(!m.service?.error, m.service?.error);
  });
}

// The layers a call launched in project reads over home: the project's
// own, for the repository holds no layer of its own (ADR-033 rule 4). The
// server composes the layers with Go.
function launchedIn(project) {
  assert.equal(existsSync(join(repoRoot, '.agister')), false, 'the repository holds a layer of its own');
  return diskDir(join(repoRoot, project, '.agister'));
}

// Home's source folder holds every document its processes and workflows
// name but the verification, which each project's layer of this
// repository supplies (ADR-027 rules 3 and 6, ADR-028 Migration step 4):
// composed as the page composes home and a repo, for a call launched in
// each project, nothing they name is missing, and the folder alone lacks
// only that. Home's processes name prompt and guidance (ADR-028 rule 8);
// each is resolved and linked in the view, the Go guidance from home's
// prompts (ADR-033). A base leaves out the prompt, which each process
// that extends it sets, laid over it (ADR-030 rule 9). No process names an
// agent, a base included: a workflow's node binds it (ADR-030 rule 2).
for (const project of ['agister', 'warder']) {
  test(`the settings in agister/home, with the layers of ${project}/ over them, name nothing missing`, async () => {
    const m = await C.loadComposed(diskDir(join(repoRoot, 'agister/home')), launchedIn(project));
    assert.ok(m.processes.length > 0);
    assert.ok(m.workflows.length > 0);
    for (const p of m.processes) {
      assert.ok(!p.error, `${p.file}: ${p.error}`);
      assert.equal(p.outputOutside, false, p.name);
      for (const gone of ['agent', 'policy']) assert.ok(!(gone in p), `${p.name}: ${gone}`);
      assert.ok(p.base || (p.prompt && !p.prompt.outside), p.name);
      for (const prompt of p.guidance) assert.equal(prompt.outside, false, `${p.name}: ${prompt.name}`);
      for (const form of p.forms) assert.equal(form.outside, false, `${p.name}: ${form.name}`);
      if (p.verify) {
        const v = m.verifies.find((x) => x.name === p.verify.ref);
        assert.deepEqual([v?.source, p.verify.outside], ['repo', false], `${p.name}: ${p.verify.ref}`);
      }
    }
    for (const w of m.workflows) {
      assert.ok(!w.error, `${w.file}: ${w.error}`);
      for (const node of w.call ? [w.call] : [...w.fanOut, w.join]) assert.equal(node.outside, false, `${w.name}: ${node.process}`);
      for (const form of w.forms) assert.equal(form.outside, false, `${w.name}: ${form.name}`);
    }
    for (const a of m.agents) assert.equal(a.runtimeOutside, false, a.name);
    assert.deepEqual(m.verifies.map((v) => [v.name, v.source]), [['repo', 'repo']]);
    const implement = m.processes.find((p) => p.name === 'implement');
    assert.deepEqual(implement.guidance.map((g) => g.name), ['go-testing-seams', 'go-architecture']);
    const reviews = {
      adr_review_codex: ['code-review-adr', []],
      adversarial_review: ['code-review-adversarial', ['go-testing-seams', 'go-architecture']],
      architecture_review: ['code-review-architecture', ['go-testing-seams', 'go-architecture']],
      clarity_review: ['code-review-clarity', []],
      intent_review: ['code-review-intent', []],
      tests_review: ['code-review-tests', ['go-testing-seams']],
    };
    for (const [name, [prompt, guidance]] of Object.entries(reviews)) {
      const p = m.processes.find((x) => x.name === name);
      assert.deepEqual([p.extends, p.access, p.output, p.prompt.name, p.guidance.map((g) => g.name)],
        ['review', 'read-only', 'review-result', prompt, guidance], name);
    }
    const base = m.processes.find((p) => p.name === 'review');
    assert.equal(base.base, true);
    assert.deepEqual(base.extendedBy.sort(), Object.keys(reviews).sort());
    assert.equal(implement.session, 'resumable');
  });
}

test('the settings in agister/home alone lack only the verification', async () => {
  const alone = await C.loadAgister(diskDir(join(repoRoot, 'agister/home')));
  const implement = alone.processes.find((p) => p.name === 'implement');
  assert.equal(implement.verify.outside, true);
  assert.equal(implement.prompt.name, 'implement');
  assert.equal(implement.prompt.outside, false);
  assert.deepEqual(implement.guidance.map((g) => [g.name, g.outside]), [['go-testing-seams', false], ['go-architecture', false]]);
});

// The server has already composed the documents with Go. This reader
// retains that provenance, including a layer that gave no surviving fields.
test('the reported model keeps three layers, prompt and guidance, and document errors', async () => {
  const processLayers = [
    { layer: 'project', path: '/r/docs/.agister/processes/p.yaml', fields: ['guidance'] },
    { layer: 'repository', path: '/r/.agister/processes/p.yaml', fields: [] },
    { layer: 'home', path: '/h/processes/p.yaml', fields: ['name', 'prompt', 'verify'] },
  ];
  const sources = {
    'processes/p.yaml': { layers: processLayers },
    'prompts/main.md': { layers: [{ layer: 'repository', path: '/r/prompts/main.md' }, { layer: 'home', path: '/h/prompts/main.md' }] },
    'processes/bad.yaml': { layers: [{ layer: 'home', path: '/h/processes/bad.yaml', fields: [] }], error: 'must hold exactly one YAML document' },
    'verifies/repo.yaml': { layers: [{ layer: 'project', path: '/r/docs/.agister/verifies/repo.yaml', fields: ['command'] }] },
  };
  const m = await C.loadReported(memDir('.agister', {
    processes: { 'p.yaml': 'name: p\nprompt: main\nguidance: [missing]\nverify: verify:repo\n' },
    prompts: { 'main.md': 'Main.' },
    verifies: { 'repo.yaml': 'command: cd docs && make test\nmax_attempts: 2\n' },
  }), sources, [
    { scope: 'home', name: 'rules', path: '/h/skills/rules', description: 'Home.' },
    { scope: 'project', name: 'rules', path: '/r/docs/.agister/skills/rules', description: 'Project.' },
  ]);
  const p = m.processes.find((x) => x.name === 'p');
  assert.deepEqual(p.layers, processLayers);
  assert.deepEqual(p.prompt.layers, sources['prompts/main.md'].layers);
  assert.equal(p.prompt.source, 'repository');
  assert.deepEqual(p.guidance, [{ name: 'missing', outside: true }]);
  assert.equal(p.verify.outside, false);
  assert.equal(m.verifies[0].source, 'project');
  assert.equal(m.skills[0].description, 'Project.');
  assert.equal(m.processes.find((x) => x.name === 'bad').error, 'must hold exactly one YAML document');
});

test('nested partial fields merge and lists replace rather than join in folder fixtures', async () => {
  const home = memDir('.agister', { processes: { 'p.yaml': 'name: p\nprompt: main\nguidance: [a, b]\ninput:\n  params:\n    candidate: {default: HEAD}\n    brief: {}\n' } });
  const repo = memDir('.agister', { processes: { 'p.yaml': 'guidance: [c]\ninput:\n  params:\n    candidate: {default: trunk}\n' } });
  const p = (await C.loadComposed(home, repo)).processes[0];
  assert.equal(p.prompt.name, 'main');
  assert.deepEqual(p.guidance, [{ name: 'c', outside: true }]);
  assert.deepEqual(p.params, [{ name: 'candidate', default: 'trunk' }, { name: 'brief', default: undefined }]);
});

// The binary reports a process whose text opens with --- as it is; the
// reported view reads its prompt, guidance and layers, not an error.
test('the reported model reads a process that opens with a document marker', async () => {
  const layers = [{ layer: 'home', path: '/h/processes/p.yaml', fields: ['name', 'prompt', 'guidance'] }];
  const m = await C.loadReported(memDir('.agister', {
    processes: { 'p.yaml': '---\nname: p\nprompt: main\nguidance: [style]\n' },
    prompts: { 'main.md': 'Main.' },
  }), { 'processes/p.yaml': { layers }, 'prompts/main.md': { layers: [{ layer: 'home', path: '/h/prompts/main.md' }] } });
  const p = m.processes.find((x) => x.name === 'p');
  assert.equal(p.error, undefined);
  assert.deepEqual(p.layers, layers);
  assert.equal(p.prompt.name, 'main');
  assert.equal(p.prompt.source, 'home');
  assert.deepEqual(p.guidance, [{ name: 'style', outside: true }]);
});
