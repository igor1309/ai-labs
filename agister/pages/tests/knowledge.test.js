import { test } from 'node:test';
import assert from 'node:assert/strict';
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

const t = (text) => ({ type: 'text', text });

test('Markdown blocks: headings, paragraphs, lists, code, quotes and rules', () => {
  assert.deepEqual(K.markdown('# One\n## Two ##\n\nfirst\nline\n\n- a\n- b\n  more\n\n1. x\n2) y\n\n```sh\n# not a heading\n- nor a list\n```\n> said\n> twice\n\n---\nlast'), [
    { type: 'heading', level: 1, inline: [t('One')] },
    { type: 'heading', level: 2, inline: [t('Two')] },
    { type: 'paragraph', inline: [t('first line')] },
    { type: 'list', ordered: false, items: [[t('a')], [t('b more')]] },
    { type: 'list', ordered: true, items: [[t('x')], [t('y')]] },
    { type: 'code', text: '# not a heading\n- nor a list' },
    { type: 'quote', inline: [t('said twice')] },
    { type: 'rule' },
    { type: 'paragraph', inline: [t('last')] },
  ]);
  assert.deepEqual(K.markdown(''), []);
  // An unclosed fence takes the rest.
  assert.deepEqual(K.markdown('```\nopen'), [{ type: 'code', text: 'open' }]);
});

test('Markdown inline: code, emphasis and links, with what is not markup left as text', () => {
  assert.deepEqual(K.inline('a `b*c*` **d _e_** *f* g_h_i 2 * 3 \\*j\\*'), [
    t('a '), { type: 'code', text: 'b*c*' }, t(' '),
    { type: 'strong', children: [t('d '), { type: 'em', children: [t('e')] }] }, t(' '),
    { type: 'em', children: [t('f')] }, t(' g_h_i 2 * 3 *j*'),
  ]);
  assert.deepEqual(K.inline('[docs](https://example.com/a_(b) "title") and [x](HTTP://y)'), [
    { type: 'link', href: 'https://example.com/a_(b)', children: [t('docs')] }, t(' and '),
    { type: 'link', href: 'HTTP://y', children: [t('x')] },
  ]);
});

// The work inline does for src, as its tally counts it.
function work(src) {
  let steps = 0;
  const out = K.inline(src, (n) => { steps += n; });
  return { out, steps };
}

// A SKILL.md just under the 256 KB cap: read quadratically, each of these
// took a minute or more. The work is counted, not timed; the timeout only
// stops a hang.
const n = 262052;

test('a run of unmatched brackets is read in linear time', { timeout: 60_000 }, () => {
  for (const src of ['['.repeat(n), `${'['.repeat(n)}](${'x'.repeat(n)}`, '[]'.repeat(n / 2)]) {
    const { out, steps } = work(src);
    assert.ok(out.length === 1 && out[0].text === src, `${src.slice(0, 4)}…: not one text`);
    assert.ok(steps <= 4 * src.length, `${src.slice(0, 4)}…: ${steps} steps for ${src.length} characters`);
  }
  // The text runs from the first [ to the first ], as before.
  assert.deepEqual(K.inline('[[a [b](https://x) c] [d] [e](https://y)'), [
    { type: 'link', href: 'https://x', children: [t('[a [b')] }, t(' c] [d] '),
    { type: 'link', href: 'https://y', children: [t('e')] },
  ]);
});

test('a run of unmatched emphasis marks is read in linear time', { timeout: 60_000 }, () => {
  // Each * or _ here is unmatched and its text stays text; in **a a lone *
  // still closes after the * before it.
  for (const [unit, text] of [['*a ', true], ['_a ', true], ['__a ', true], ['**a ', false], ['*a _b **c __d ', false]]) {
    const src = unit.repeat(Math.floor(n / unit.length));
    const { out, steps } = work(src);
    if (text) assert.ok(out.length === 1 && out[0].text === src, `${unit}…: not one text`);
    assert.ok(steps <= 8 * src.length, `${unit}…: ${steps} steps for ${src.length} characters`);
  }
  // Each mark still closes at the first place it can.
  assert.deepEqual(K.inline('*a *b* c* **d **e** f** _g h_i j_'), [
    { type: 'em', children: [t('a *b')] }, t(' c* '),
    { type: 'strong', children: [t('d **e')] }, t(' f** '),
    { type: 'em', children: [t('g h_i j')] },
  ]);
  // markdown passes the tally on to every inline it reads.
  let steps = 0;
  K.markdown('# *a*\n\n- *b*\n\n> *c*\n\n*d*', (k) => { steps += k; });
  assert.ok(steps > 0);
});

test('a link that is not http(s) is its text, and HTML is text', () => {
  for (const target of ['javascript:alert(1)', 'data:text/html,x', '/etc/passwd', 'file:///x', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)']) {
    assert.deepEqual(K.inline(`see [here](${target}).`), [t('see here.')], target);
  }
  assert.deepEqual(K.markdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)> and <b>bold</b>'), [
    { type: 'paragraph', inline: [t('<script>alert(1)</script>')] },
    { type: 'paragraph', inline: [t('<img src=x onerror=alert(1)> and <b>bold</b>')] },
  ]);
});
