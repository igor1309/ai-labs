import { test } from 'node:test';
import assert from 'node:assert/strict';
import './markdown-it.js';
import '../knowledge.js';

const K = globalThis.AgisterKnowledge;

// Settings as config.js models them, and folders as pages/skills.go
// writes them.
const settings = {
  agents: [
    { name: 'opus', runtime: 'claude-code', model: 'opus', effort: 'high' },
    { name: 'sol', runtime: 'codex', model: 'gpt-6.1-sol', effort: null },
    { name: 'ghost', runtime: 'gone', model: 'm', effort: null },
    { name: 'bad', file: 'agents/bad.toml', error: 'does not parse' },
  ],
  runtimes: [
    { name: 'claude-code', adapter: 'claude-code' },
    { name: 'codex', adapter: 'codex' },
  ],
};
const skill = (name, checks = { passed: true }) => ({ name, path: `/p/${name}`, checks });
const skills = {
  home: false, adapters: ['claude-code', 'codex'],
  folders: [
    { scope: 'repo', folder: '.claude/skills', path: '/r/.claude/skills', adapters: ['claude-code'], skills: [skill('plan'), skill('solo')] },
    { scope: 'repo', folder: '.agents/skills', path: '/r/.agents/skills', adapters: ['codex'], skills: [skill('go'), skill('plan')] },
    { scope: 'home', folder: '~/.claude/skills', path: '/h/.claude/skills', adapters: ['claude-code'], state: 'missing', skills: [] },
  ],
};
const runs = [
  { id: 'r-3', agent: 'opus', skills: [{ name: 'review', count: 3 }, { name: 'go', count: 1 }] },
  { id: 'r-2', agent: 'opus', skills: [{ name: 'go', count: 4 }] },
  { id: 'r-1', agent: 'opus' },
  { id: 'wf', agent: 'opus', workflow: { nodes: [] }, skills: [{ name: 'never', count: 9 }] },
  { id: 'other', agent: 'someone', skills: [{ name: 'plan', count: 1 }] },
];

test('an agent loads the skills of the folders its runtime’s adapter loads', () => {
  const m = K.model(settings, skills, runs);
  assert.deepEqual(m.agents.map((a) => [a.name, a.adapter, a.runtimeMissing, a.loads.map((e) => `${e.folder.folder}/${e.name}`)]), [
    ['opus', 'claude-code', false, ['.claude/skills/plan', '.claude/skills/solo']],
    ['sol', 'codex', false, ['.agents/skills/go', '.agents/skills/plan']],
    ['ghost', null, true, []],
  ]);
  assert.deepEqual(m.agents[0].folders.map((f) => f.folder), ['.claude/skills', '~/.claude/skills']);
});

test('a skill name lists its entries, is shared in several folders, and names the agents that load it', () => {
  const m = K.model(settings, skills, runs);
  assert.deepEqual(m.skills.map((s) => [s.name, s.shared, s.entries.map((e) => e.folder.folder), s.agents]), [
    ['go', false, ['.agents/skills'], ['sol']],
    ['plan', true, ['.claude/skills', '.agents/skills'], ['opus', 'sol']],
    ['solo', false, ['.claude/skills'], ['opus']],
  ]);
});

test('observed use is the agent’s calls only, counted per skill with its runs', () => {
  assert.deepEqual(K.observed(runs, 'opus'), {
    runs: 3,
    skills: [{ name: 'go', count: 5, runs: ['r-3', 'r-2'] }, { name: 'review', count: 3, runs: ['r-3'] }],
  });
  assert.deepEqual(K.observed(runs, 'sol'), { runs: 0, skills: [] });
  assert.deepEqual(K.observed(undefined, 'opus'), { runs: 0, skills: [] });
});

test('the checks read as passed or failed with each failed check, never as a review', () => {
  assert.equal(K.checks({ passed: true }), 'checks passed');
  assert.equal(K.checks({ passed: false, failed: ['name is missing or empty', 'no front matter'] }),
    'checks failed: name is missing or empty; no front matter');
  assert.equal(K.checks(undefined), 'checks failed');
});

test('each runtime’s list says what it leaves out', () => {
  assert.match(K.leftOut('claude-code').join('\n'), /built into the runtime.*managed-settings.*commands.*below the repo/s);
  assert.match(K.leftOut('codex').join('\n'), /plugin or package skills.*\/etc\/codex\/skills/s);
  assert.match(K.leftOut('pi').join('\n'), /Pi’s settings files/);
  assert.deepEqual(K.leftOut('opencode'), K.leftOut('unknown'));
});

test('the body is the SKILL.md without its front matter', () => {
  assert.equal(K.body('---\nname: a\n---\n# A\n'), '# A\n');
  assert.equal(K.body('---\r\nname: a\r\n---\r\nbody'), 'body');
  assert.equal(K.body('# No front matter\n---\n'), '# No front matter\n---\n');
  assert.equal(K.body('---\nname: unclosed\n'), '---\nname: unclosed\n');
  assert.equal(K.body(undefined), '');
});

// The Markdown tree: markdown-it's tokens as tags and text.
test('Markdown is read by markdown-it into a tree of tags and text', () => {
  const n = (tag, ...children) => ({ tag, children });
  assert.deepEqual(K.markdown('# One\n## Two ##\n\nfirst\nline\n\n- a\n- b\n\n3. x\n\n```sh\n# not a heading\n```\n\n    indented\n\n> said\n\n---\n*e* **s** ~~d~~ `c`  \nlast'), [
    n('h3', 'One'), n('h4', 'Two'),
    n('p', 'first', '\n', 'line'),
    n('ul', n('li', 'a'), n('li', 'b')),
    { tag: 'ol', start: 3, children: [n('li', 'x')] },
    n('pre', n('code', '# not a heading')),
    n('pre', n('code', 'indented')),
    n('blockquote', n('p', 'said')),
    n('hr'),
    n('p', n('em', 'e'), ' ', n('strong', 's'), ' ', n('s', 'd'), ' ', n('code', 'c'), n('br'), 'last'),
  ]);
  assert.deepEqual(K.markdown(''), []);
  assert.deepEqual(K.markdown(undefined), []);
});

test('only an http(s) link is a link; any other is its text, and an image its alt text', () => {
  assert.deepEqual(K.markdown('[docs](https://example.com/a_(b) "title") [x](HTTP://y)'), [
    { tag: 'p', children: [{ tag: 'a', href: 'https://example.com/a_(b)', children: ['docs'] }, ' ', { tag: 'a', href: 'HTTP://y', children: ['x'] }] },
  ]);
  for (const target of ['javascript:alert(1)', 'mailto:a@b.c', 'data:text/html,x', '/etc/passwd', 'rel/path', 'file:///x', '<javascript:alert(1)>', 'JaVaScRiPt:alert(1)']) {
    assert.deepEqual(K.markdown(`see [here *now*](${target}).`), [{ tag: 'p', children: ['see ', 'here ', { tag: 'em', children: ['now'] }, '.'] }], target);
  }
  assert.deepEqual(K.markdown('![a *b* `c`](https://x/i.png) [![logo](https://x/l.png)](javascript:x)'), [{ tag: 'p', children: ['a b c', ' ', 'logo'] }]);
});

