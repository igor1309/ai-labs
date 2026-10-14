import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../repos.js';
import '../config.js';
import '../runs.js';
import './markdown-it.js';
import '../knowledge.js';
import '../page.js';
import { readFileSync } from 'node:fs';
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

// Lets every answered request and what it sets off run to the end.
async function settle() {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
}

// Settings: opus on Claude Code, sol on Codex, ghost on a runtime that is
// not there.
const files = {
  'agents/opus.toml': 'name = "opus"\nruntime = "claude-code"\nmodel = "opus"\neffort = "high"\n',
  'agents/sol.toml': 'name = "sol"\nruntime = "codex"\nmodel = "gpt-6.1-sol"\n',
  'agents/ghost.toml': 'name = "ghost"\nruntime = "gone"\nmodel = "m"\n',
  'runtimes/claude-code.yaml': 'name: claude-code\nadapter: claude-code\n',
  'runtimes/codex.yaml': 'name: codex\nadapter: codex\n',
};

const planText = [
  '---', 'name: plan', 'description: Plans the work.', '---',
  '# Plan <script>alert(1)</script>', '',
  'Use **care** and `go test`; see [the docs](https://example.com/docs) or [this](javascript:alert(2)).', '',
  '- first', '- <img src=x onerror=alert(3)>', '',
  '```', '<b>raw</b>', '```', '',
].join('\n');

// Folders as pages/skills.go writes them: plan is in two folders, torn
// fails its checks, big was not read; nothing here is named go or review,
// which only the runs used.
const skills = {
  path: '/r', home: false, adapters: ['claude-code', 'codex'],
  folders: [
    {
      scope: 'repo', folder: '.claude/skills', path: '/r/.claude/skills', real: '/r/.claude/skills', adapters: ['claude-code'],
      skills: [
        { name: 'big', path: '/r/.claude/skills/big', real: '/r/.claude/skills/big', state: 'too_large', checks: { passed: false, failed: ['SKILL.md is over 256 KB'] } },
        { name: 'plan', path: '/r/.claude/skills/plan', real: '/shared/plan', link: '/shared/plan', content: planText, description: 'Plans the work.', checks: { passed: true } },
        { name: 'torn', path: '/r/.claude/skills/torn', real: '/r/.claude/skills/torn', content: '# Torn\n', checks: { passed: false, failed: ['no front matter'] } },
      ],
    },
    {
      scope: 'repo', folder: '.agents/skills', path: '/r/.agents/skills', real: '/r/.agents/skills', adapters: ['codex'],
      skills: [
        { name: 'plan', path: '/r/.agents/skills/plan', real: '/r/.agents/skills/plan', content: '---\nname: plan\ndescription: Codex plans.\n---\nCodex plan.\n', description: 'Codex plans.', checks: { passed: true } },
        { name: 'ship', path: '/r/.agents/skills/ship', real: '/r/.agents/skills/ship', content: '---\nname: ship\ndescription: Ships.\n---\nShip it.\n', description: 'Ships.', checks: { passed: true } },
      ],
    },
    { scope: 'home', folder: '~/.claude/skills', path: '/h/.claude/skills', adapters: ['claude-code'], state: 'missing', skills: [] },
  ],
};

// opus's runs used review and go, neither in a folder; sol has no runs.
const runs = [
  { id: 'run-2', process: 'implement', agent: 'opus', created_at: '2026-10-01T11:00:00Z', status: 'completed', outcome: {}, skills: [{ name: 'review', count: 3 }, { name: 'go', count: 1 }] },
  { id: 'run-1', process: 'implement', agent: 'opus', created_at: '2026-10-01T10:00:00Z', status: 'completed', outcome: {}, skills: [{ name: 'go', count: 2 }] },
];

// The page over a fake server, started on Knowledge with the repo /r.
function page({ storage = fakeStorage({ [VIEW_KEY]: 'knowledge', 'agister-pages:current': '/r' }), answers = {} } = {}) {
  const calls = [];
  const fallback = {
    'api/settings': () => respond({ path: '/r', dir: '/r/.agister', home: false, files, homeFiles: {} }),
    'api/skills': () => respond(skills),
    'api/runs': () => respond({ runs, total: runs.length, skipped: 0 }),
    'api/runs/compare': () => respond({ groups: [], skipped: 0 }),
    'api/runs/run-1': () => respond({ summary: runs[1], record: {} }),
  };
  const fetch = async (url) => {
    calls.push(url);
    const route = url.split('?')[0];
    const answer = answers[route] ?? fallback[route];
    return answer ? answer(calls.filter((u) => u.split('?')[0] === route).length) : respond({ error: `no ${url}` }, 404);
  };
  const document = pageDocument();
  const started = P.start({ document, fetch, localStorage: storage, location: { protocol: 'http:', hash: '' }, navigator: {}, setTimeout: (fn) => queueMicrotask(fn) });
  const $ = (id) => document.getElementById(id);
  const button = (root, label) => root.querySelectorAll('button').find((b) => b.textContent === label);
  return {
    started, calls, storage, document, $, button,
    shown: () => ['dashboard', 'runs', 'compare', 'knowledge'].filter((id) => !$(id).hidden),
    // The overview: its agent columns, and per skill row its cells.
    columns: () => $('knowledge-overview').querySelectorAll('thead th').slice(1).map((th) => th.children.map((c) => c.textContent)),
    matrix: () => Object.fromEntries($('knowledge-overview').querySelectorAll('tbody tr').map((tr) => [tr.children[0].textContent, tr.children.slice(1).map((td) => td.textContent)])),
    // Opens the agent or skill name from the overview.
    open: (name) => button($('knowledge-overview'), name).click(),
    detail: () => $('knowledge-detail').querySelector('h3')?.textContent ?? null,
    // The rows of the table in the opened agent's section id.
    table: (id) => $(id)?.querySelectorAll('tbody tr').map((tr) => tr.children.map((td) => td.textContent)) ?? null,
  };
}

// What a refresh reads the second time: opus on another model, one new
// skill in place of the others, and a third run that used it.
const later = (first, second) => (n) => respond(n === 1 ? first : second);
const refreshed = {
  'api/settings': later(
    { path: '/r', dir: '/r/.agister', home: false, files, homeFiles: {} },
    { path: '/r', dir: '/r/.agister', home: false, files: { ...files, 'agents/opus.toml': 'name = "opus"\nruntime = "claude-code"\nmodel = "opus-5"\neffort = "low"\n' }, homeFiles: {} }),
  'api/skills': later(skills, {
    ...skills,
    folders: [{
      scope: 'repo', folder: '.claude/skills', path: '/r/.claude/skills', real: '/r/.claude/skills', adapters: ['claude-code'],
      skills: [{ name: 'fresh', path: '/r/.claude/skills/fresh', real: '/r/.claude/skills/fresh', content: '---\nname: fresh\ndescription: New.\n---\nFresh text.\n', description: 'New.', checks: { passed: true } }],
    }],
  }),
  'api/runs': later({ runs, total: runs.length, skipped: 0 }, {
    runs: [{ id: 'run-3', process: 'implement', agent: 'opus', created_at: '2026-10-01T12:00:00Z', status: 'completed', outcome: {}, skills: [{ name: 'fresh', count: 5 }] }, ...runs],
    total: runs.length + 1, skipped: 0,
  }),
};

test('Knowledge is a third view, remembered, read from the settings, their skills and the runs', async () => {
  const storage = fakeStorage({ 'agister-pages:current': '/r' });
  const p = page({ storage });
  await p.started;
  assert.deepEqual(p.shown(), ['dashboard']);
  // Settings read their skills' inventory with the settings files (D-16);
  // the runs only Knowledge reads.
  assert.deepEqual(p.calls, ['api/settings?path=%2Fr', 'api/skills?path=%2Fr']);

  p.$('view-knowledge').click();
  await settle();
  assert.equal(storage.raw(VIEW_KEY), 'knowledge');
  assert.deepEqual(p.shown(), ['knowledge']);
  assert.equal(p.$('view-knowledge').getAttribute('aria-pressed'), 'true');
  assert.equal(p.$('view-settings').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(p.calls.slice(2), ['api/settings?path=%2Fr', 'api/skills?path=%2Fr', 'api/runs']);
  assert.match(p.$('read-at').title, /^Knowledge read/);

  // The next visit opens on Knowledge.
  const next = page({ storage, answers: refreshed });
  await next.started;
  assert.deepEqual(next.shown(), ['knowledge']);
  assert.ok(next.$('knowledge-overview'));

  // Refresh reads the settings, the skills and the runs again, and shows
  // what they hold now.
  const before = next.calls.length;
  next.$('refresh').click();
  await settle();
  assert.deepEqual(next.calls.slice(before).map((u) => u.split('?')[0]).sort(), ['api/runs', 'api/settings', 'api/skills']);
  assert.deepEqual(next.columns()[1], ['opus', 'claude-code', 'opus-5 · low']);
  assert.deepEqual(next.matrix(), { fresh: ['', '●', ''] });
  next.open('fresh');
  assert.match(next.$('skill-detail').textContent, /Fresh text\./);
  next.open('opus');
  assert.deepEqual(next.table('agent-loads'), [['fresh', 'repo', '.claude/skills', 'checks passed']]);
  assert.match(next.$('agent-observed').querySelector('p').textContent, /^observed: what the 3 runs of this agent/);
  assert.deepEqual(next.table('agent-observed'), [
    ['fresh', '5', '1', 'run-3'],
    ['go', '3', '2', 'run-2, run-1'],
    ['review', '3', '1', 'run-2'],
  ]);
});

test('the overview is a matrix of skills and agents, with shared names marked', async () => {
  const p = page();
  await p.started;
  assert.deepEqual(p.columns(), [
    ['ghost', 'gone (missing runtime)', 'm'],
    ['opus', 'claude-code', 'opus · high'],
    ['sol', 'codex', 'gpt-6.1-sol'],
  ]);
  assert.deepEqual(p.matrix(), {
    big: ['', '●', ''],
    'plan shared ×2': ['', '●', '●'],
    ship: ['', '', '●'],
    torn: ['', '●', ''],
  });
  // The folders read are named, the missing one too.
  assert.deepEqual(p.$('knowledge-folders').querySelectorAll('tbody tr').map((tr) => tr.children.map((td) => td.textContent)), [
    ['.claude/skills', 'repo', '/r/.claude/skills', 'claude-code', '3'],
    ['.agents/skills', 'repo', '/r/.agents/skills', 'codex', '2'],
    ['~/.claude/skills', 'home', '/h/.claude/skills', 'claude-code', 'not there'],
  ]);
  // ADR-021 amended ADR-011 rule 5: the tab no longer says Agister does
  // not choose an agent's skills; editing is still not part of it.
  assert.doesNotMatch(p.$('knowledge').textContent, /does not choose/);
  assert.match(p.$('knowledge').textContent, /two lists, shown apart: the skills its settings name.*the skills its runtime would load from the repo and the home.*editing is not part of it/);
});

test('an agent opens below the overview: what its runtime would load, and apart from it what its runs used', async () => {
  const p = page();
  await p.started;
  assert.equal(p.detail(), null);

  p.open('opus');
  assert.equal(p.detail(), 'opus');
  const detail = p.$('agent-detail');
  assert.equal(detail.querySelector('div.facts').textContent, 'runtimeclaude-code — adapter claude-codemodelopusefforthigh');
  assert.doesNotMatch(detail.textContent, /does not choose/);
  assert.match(detail.textContent, /two lists, shown apart.*\(ADR-021\).*\(ADR-006\).*editing is not part of it/);
  assert.deepEqual(p.table('agent-loads'), [
    ['big', 'repo', '.claude/skills', 'checks failed: SKILL.md is over 256 KB'],
    ['plan shared', 'repo', '.claude/skills', 'checks passed'],
    ['torn', 'repo', '.claude/skills', 'checks failed: no front matter'],
  ]);
  assert.match(p.$('agent-left-out').textContent, /what claude-code loads from elsewhere.*built into the runtime.*managed-settings/);

  // Observed is its own section, labelled so: review and go were used and
  // are in no folder; nothing loaded gains a word about use.
  assert.equal(p.$('agent-observed').querySelector('h4').textContent, 'Observed in runs');
  assert.match(p.$('agent-observed').querySelector('p').textContent, /^observed: what the 2 runs of this agent/);
  assert.deepEqual(p.table('agent-observed'), [
    ['go', '3', '2', 'run-2, run-1'],
    ['review', '3', '1', 'run-2'],
  ]);
  assert.doesNotMatch(p.$('agent-loads').textContent, /review|run-|×|used/);
  assert.doesNotMatch(p.$('agent-observed').textContent, /plan|torn|big/);
  assert.doesNotMatch(p.$('knowledge').textContent, /unused|not used|never used/i);

  // The chosen agent again closes it.
  p.open('opus');
  assert.equal(p.detail(), null);
});

test('an agent with no observed use shows nothing about use', async () => {
  const p = page();
  await p.started;
  p.open('sol');
  assert.deepEqual(p.table('agent-loads').map((r) => r[0]), ['plan shared', 'ship']);
  assert.match(p.$('agent-left-out').textContent, /\/etc\/codex\/skills/);
  assert.equal(p.$('agent-observed'), null);
  assert.doesNotMatch(p.$('knowledge').textContent, /unused|not used|never used|observed|0 runs/i);

  // An agent whose runtime is not there loads nothing the page knows of.
  p.open('ghost');
  assert.match(p.$('agent-detail').textContent, /gone \(missing runtime\)/);
  assert.equal(p.table('agent-loads').length, 0);
  assert.match(p.$('agent-loads').textContent, /No skill folders are known/);
  assert.equal(p.$('agent-left-out'), null);
});

test('an observed run’s link shows Runs with that run opened', async () => {
  const p = page();
  await p.started;
  p.open('opus');
  const link = p.$('agent-observed').querySelectorAll('a').find((a) => a.textContent === 'run-1');
  assert.ok(link.click().defaultPrevented);
  await settle();
  assert.deepEqual(p.shown(), ['runs']);
  assert.equal(p.$('run-overlay').hidden, false);
  assert.equal(p.$('run-detail').querySelector('article').dataset.run, 'run-1');
});

test('a skill opens with the agents that load it, each folder’s entry and its checks', async () => {
  const p = page();
  await p.started;
  p.open('plan');
  assert.equal(p.detail(), 'plan');
  const detail = p.$('skill-detail');
  assert.equal(detail.querySelector('span.chip').textContent, 'shared ×2');
  assert.match(detail.querySelector('div.facts').textContent, /^loaded byopus, sol$/);
  assert.deepEqual(detail.querySelectorAll('section.stage h4').map((h) => h.textContent), ['repo · .claude/skills', 'repo · .agents/skills']);
  // The real path is beside the link.
  assert.match(detail.querySelector('section.stage').textContent, /\/r\/.claude\/skills\/plan→ \/shared\/plan/);
  assert.deepEqual(detail.querySelectorAll('section.stage div.facts').map((f) => /checks(checks \w+)/.exec(f.textContent)[1]), ['checks passed', 'checks passed']);
  assert.doesNotMatch(detail.textContent, /reviewed|approved|safe|verified/i);

  // From the skill to an agent that loads it, and back from its list.
  p.button(detail, 'sol').click();
  assert.equal(p.detail(), 'sol');
  p.button(p.$('agent-loads'), 'ship').click();
  assert.equal(p.detail(), 'ship');
  assert.match(p.$('skill-detail').textContent, /Ship it\./);

  p.open('torn');
  assert.match(p.$('skill-detail').textContent, /checks failed: no front matter/);
  assert.equal(p.$('skill-detail').querySelector('span.failed').textContent, 'checks failed: no front matter');
  assert.doesNotMatch(p.$('skill-detail').textContent, /reviewed|approved|safe|refuse/i);

  // A SKILL.md that was not read says why and shows no text.
  p.open('big');
  assert.match(p.$('skill-detail').textContent, /checks failed: SKILL\.md is over 256 KB.*too large, not read/);
  assert.equal(p.$('skill-detail').querySelector('div.markdown'), null);

  p.button(p.$('skill-detail'), 'Close').click();
  assert.equal(p.detail(), null);
});

test('a skill is rendered from Markdown with its HTML as text; Source shows the SKILL.md as stored', async () => {
  const p = page();
  await p.started;
  p.open('plan');
  const first = () => p.$('skill-detail').querySelector('section.stage');
  const md = first().querySelector('div.markdown');
  assert.equal(p.button(p.$('skill-source'), 'Rendered').getAttribute('aria-pressed'), 'true');
  // The front matter is in the facts, not in the rendered text.
  assert.doesNotMatch(md.textContent, /name: plan/);
  assert.equal(md.querySelector('h3').textContent, 'Plan <script>alert(1)</script>');
  assert.equal(md.querySelector('strong').textContent, 'care');
  assert.equal(md.querySelector('p code').textContent, 'go test');
  assert.deepEqual(md.querySelectorAll('li').map((li) => li.textContent), ['first', '<img src=x onerror=alert(3)>']);
  assert.equal(md.querySelector('pre code').textContent, '<b>raw</b>');
  // Nothing the skill wrote became an element; only an http(s) link is one.
  assert.deepEqual(['script', 'img', 'b'].flatMap((tag) => md.querySelectorAll(tag)), []);
  assert.deepEqual(md.querySelectorAll('a').map((a) => [a.textContent, a.href, a.rel]), [['the docs', 'https://example.com/docs', 'noopener noreferrer']]);
  assert.match(md.querySelector('p').textContent, /or this\.$/);

  p.button(p.$('skill-source'), 'Source').click();
  assert.equal(p.button(p.$('skill-source'), 'Source').getAttribute('aria-pressed'), 'true');
  assert.equal(first().querySelector('div.markdown'), null);
  assert.equal(first().querySelector('pre.source').textContent, planText);
  assert.deepEqual(first().querySelector('pre.source').children, []);

  p.button(p.$('skill-source'), 'Rendered').click();
  assert.ok(first().querySelector('div.markdown'));
});

test('~ shows the home folders only, and says so', async () => {
  const home = { path: '~', home: true, adapters: ['claude-code'], folders: [skills.folders[2]] };
  const p = page({
    storage: fakeStorage({ [VIEW_KEY]: 'knowledge' }),
    answers: {
      'api/settings': () => respond({ path: '~', dir: '/u/.agister', home: true, files }),
      'api/skills': () => respond(home),
    },
  });
  await p.started;
  assert.ok(p.calls.includes('api/skills?path=~'));
  assert.match(p.$('knowledge').textContent, /Agister home, no repo/);
  assert.deepEqual(p.matrix(), {});
  assert.match(p.$('knowledge-overview').textContent, /No skills in the folders read/);
  assert.deepEqual(p.columns().map((c) => c[0]), ['ghost', 'opus', 'sol']);
});

// The skills are read with the settings (D-16), the runs by Knowledge.
test('a Knowledge read that fails says why; one that ends after the user left leaves the page alone', async () => {
  const failing = page({ answers: { 'api/skills': () => respond({ error: 'no .agister folder at /r/.agister' }, 404) } });
  await failing.started;
  assert.equal(failing.$('status').textContent, 'no .agister folder at /r/.agister');
  const noRuns = page({ answers: { 'api/runs': () => respond({ error: 'the runs could not be read' }, 500) } });
  await noRuns.started;
  assert.equal(noRuns.$('status').textContent, 'the runs could not be read');

  let answer;
  const slow = page({ answers: { 'api/runs': () => new Promise((r) => { answer = r; }) } });
  await settle();
  slow.$('view-settings').click();
  await settle();
  answer(respond({ error: 'gone' }, 500));
  await slow.started;
  await settle();
  assert.equal(slow.$('status').hidden, true);
  assert.match(slow.$('read-at').title, /^Settings read/);
  assert.deepEqual(slow.shown(), ['dashboard']);
});

test('a Knowledge read that ends after a newer settings read failed leaves the error shown', async () => {
  let answer;
  const p = page({
    answers: {
      'api/settings': (n) => (n === 1
        ? respond({ path: '/r', dir: '/r/.agister', home: false, files, homeFiles: {} })
        : respond({ error: 'settings unreadable' }, 500)),
      'api/runs': () => new Promise((r) => { answer = r; }),
    },
  });
  await settle();
  p.$('refresh').click();
  await settle();
  assert.equal(p.$('status').textContent, 'settings unreadable');

  answer(respond({ runs, total: runs.length, skipped: 0 }));
  await p.started;
  await settle();
  assert.equal(p.$('status').textContent, 'settings unreadable');
  assert.equal(p.$('status').hidden, false);
  assert.doesNotMatch(p.$('read-at').title, /^Knowledge read/);
  assert.equal(p.$('knowledge-overview'), null);
});

test('a skill of 130,000 inline nodes opens, and Source and Rendered switch', async () => {
  // Just under the 256 KB cap: spread into one call, its nodes overflowed
  // the stack and no card was shown.
  const content = `---\nname: wide\ndescription: Wide.\n---\n${'x`a`'.repeat(65000)}`;
  const wide = { name: 'wide', path: '/r/.claude/skills/wide', real: '/r/.claude/skills/wide', content, description: 'Wide.', checks: { passed: true } };
  const p = page({ answers: { 'api/skills': () => respond({ ...skills, folders: [{ ...skills.folders[0], skills: [wide] }] }) } });
  await p.started;
  p.open('wide');
  const md = () => p.$('skill-detail').querySelector('div.markdown');
  assert.equal(p.detail(), 'wide');
  assert.equal(md().querySelector('p').childNodes.length, 130000);
  assert.equal(md().querySelector('p').textContent, 'xa'.repeat(65000));

  p.button(p.$('skill-source'), 'Source').click();
  assert.equal(md(), null);
  assert.equal(p.$('skill-detail').querySelector('pre.source').textContent, content);
  p.button(p.$('skill-source'), 'Rendered').click();
  assert.equal(md().querySelectorAll('code').length, 65000);
});

// A failed skills read fails the settings read, which keeps what was shown
// (D-16); a failed runs read fails Knowledge alone.
test('Knowledge read for one folder is not shown under another: a failed read after a switch leaves none', async () => {
  const home = { path: '~', dir: '/u/.agister', home: true, files };
  const p = page({
    answers: {
      'api/settings': (n) => respond(n <= 2 ? { path: '/r', dir: '/r/.agister', home: false, files, homeFiles: {} } : home),
      'api/skills': (n) => (n === 2 ? respond({ error: 'skills unreadable' }, 500) : respond(n === 1 ? skills : { ...skills, path: '~', home: true })),
      'api/runs': (n) => (n === 1 ? respond({ runs, total: runs.length, skipped: 0 }) : respond({ error: 'runs unreadable' }, 500)),
    },
  });
  await p.started;
  assert.deepEqual(Object.keys(p.matrix()), ['big', 'plan shared ×2', 'ship', 'torn']);

  // A refresh of the same folder that fails keeps what was read.
  p.$('refresh').click();
  await settle();
  assert.equal(p.$('status').textContent, 'skills unreadable');
  assert.equal(p.$('picker-label').textContent, 'r');
  assert.deepEqual(Object.keys(p.matrix()), ['big', 'plan shared ×2', 'ship', 'torn']);

  // Switched to ~, a failed read shows nothing of /r under ~.
  p.$('open-home').click();
  await settle();
  assert.ok(p.calls.includes('api/skills?path=~'));
  assert.equal(p.$('picker-label').textContent, '~');
  assert.equal(p.$('status').textContent, 'runs unreadable');
  assert.equal(p.$('knowledge-overview'), null);
  assert.equal(p.$('knowledge').textContent, '');
});

// The page with one skill whose SKILL.md body is text, opened: its
// rendered Markdown and the page's document.
async function rendered(text) {
  const content = `---\nname: one\ndescription: One.\n---\n${text}`;
  const one = { name: 'one', path: '/r/.claude/skills/one', real: '/r/.claude/skills/one', content, description: 'One.', checks: { passed: true } };
  const p = page({ answers: { 'api/skills': () => respond({ ...skills, folders: [{ ...skills.folders[0], skills: [one] }] }) } });
  await p.started;
  p.open('one');
  return { md: p.$('skill-detail').querySelector('div.markdown'), document: p.document };
}

// Every element below root.
const elements = (root) => root.children.flatMap((c) => [c, ...elements(c)]);

test('the page loads markdown-it before knowledge.js', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (src) => html.indexOf(`<script src="${src}"></script>`);
  assert.ok(at('markdown-it.min.js') > 0 && at('markdown-it.min.js') < at('knowledge.js'));
});

test('a skill’s HTML is text: no script, image or other element of its own, and never innerHTML', async () => {
  const { md, document } = await rendered([
    '<script>alert(1)</script>', '',
    'Text <img src=x onerror=alert(2)> and <b>bold</b> <a href="javascript:alert(3)">a</a>', '',
    '<div onclick="alert(4)">', '*block*', '</div>', '',
    '![alt text](https://x/i.png "t")',
  ].join('\n'));
  // The only elements are Markdown's own: paragraphs and the emphasis.
  assert.deepEqual(elements(md).map((e) => e.tagName), ['P', 'P', 'P', 'EM', 'P']);
  assert.deepEqual(md.children.map((c) => c.textContent), [
    '<script>alert(1)</script>',
    'Text <img src=x onerror=alert(2)> and <b>bold</b> <a href="javascript:alert(3)">a</a>',
    '<div onclick="alert(4)">\nblock\n</div>',
    'alt text',
  ]);
  assert.deepEqual(document.markup, []);
});

test('a link that is not http(s), javascript: and mailto: among them, is its text alone', async () => {
  const { md, document } = await rendered('[run](javascript:alert(1)) [mail](mailto:a@b.c) [rel](docs/x.md) [ok](https://example.com/x)');
  assert.deepEqual(md.querySelectorAll('a').map((a) => [a.textContent, a.href, a.target, a.rel]), [
    ['ok', 'https://example.com/x', '_blank', 'noopener noreferrer'],
  ]);
  assert.equal(md.textContent, 'run mail rel ok');
  assert.deepEqual(document.markup, []);
});

test('a GFM table becomes a table with its header, body and alignment', async () => {
  const { md } = await rendered('| Name | Count | Note |\n|:-----|------:|:----:|\n| a | 1 | *x* |\n| b | 2 | |');
  const table = md.querySelector('table');
  assert.deepEqual(table.children.map((c) => c.tagName), ['THEAD', 'TBODY']);
  assert.deepEqual(table.querySelectorAll('thead th').map((th) => [th.textContent, th.className]), [
    ['Name', 'align-left'], ['Count', 'align-right'], ['Note', 'align-center'],
  ]);
  assert.deepEqual(table.querySelectorAll('tbody tr').map((tr) => tr.children.map((td) => td.textContent)), [['a', '1', 'x'], ['b', '2', '']]);
  assert.equal(table.querySelector('tbody em').textContent, 'x');
});

test('nested lists nest, ordered in unordered and back', async () => {
  const { md } = await rendered('- a\n  1. one\n  2. two\n     - deep\n- b\n\n5. five\n6. six');
  const [ul, ol] = md.children;
  assert.equal(ul.tagName, 'UL');
  assert.deepEqual(ul.children.map((li) => li.childNodes[0].textContent), ['a', 'b']);
  const inner = ul.children[0].querySelector('ol');
  assert.deepEqual(inner.children.map((li) => li.childNodes[0].textContent), ['one', 'two']);
  assert.equal(inner.children[1].querySelector('ul li').textContent, 'deep');
  assert.equal(md.querySelectorAll('ul ol ul li').length, 1);
  assert.equal(ol.tagName, 'OL');
  assert.equal(ol.start, 5);
});

// A SKILL.md body just under the 256 KB cap of what markup reads worst:
// it must render, to a bounded tree. The timeout only stops a hang.
test('worst-case 256 KB skills of brackets, emphasis marks and backticks render', { timeout: 120_000 }, async () => {
  const n = 262000;
  const fill = (unit) => unit.repeat(Math.floor(n / unit.length));
  for (const text of ['[', '*', '_', '`', '[]', '![', '[a](', '*a ', '_a ', '**a ', '`a ', '*a _b **c __d ', '> ', '- '].map(fill)) {
    const { md, document } = await rendered(text);
    assert.ok(md, `${text.slice(0, 6)}…: not rendered`);
    const count = elements(md).length;
    assert.ok(count <= text.length, `${text.slice(0, 6)}…: ${count} elements for ${text.length} characters`);
    assert.deepEqual(document.markup, []);
  }
});

// ADR-021, the amendment of ADR-011 rule 5: an agent's card shows the
// skills its settings name, its own and those of the processes a
// workflow's node binds to it, each with its
// layer and checks or marked missing, apart from what its runtime would
// load and from what its runs used, each labelled.
test('an agent’s card lists the skills its settings name apart from what its runtime would load', async () => {
  // The skills are the inventory api/skills gives; api/settings sends no
  // file of skills/ (D-16).
  const homeFiles = {};
  const named = {
    ...files,
    'agents/opus.toml': `${files['agents/opus.toml']}skills = ["plan", "style", "gone"]\n`,
    'processes/review.yaml': 'name: review\nskills: [ship]\ninput:\n  instruction: Review.\n',
    'workflows/review_opus.yaml': 'name: review_opus\ncall: {node: review, uses: process:review, agent: opus}\n',
  };
  const beside = 'holds notes.txt beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call';
  const read = {
    ...skills,
    settings: [
      { scope: 'repo', name: 'plan', path: '/r/.agister/skills/plan', description: 'Repo plan.', checks: { passed: true } },
      { scope: 'home', name: 'plan', path: '/h/.agister/skills/plan', description: 'Home plan.', checks: { passed: true } },
      { scope: 'home', name: 'style', path: '/h/.agister/skills/style', description: 'Style.', checks: { passed: false, failed: [beside] } },
    ],
  };
  const p = page({ answers: {
    'api/settings': () => respond({ path: '/r', dir: '/r/.agister', home: false, files: named, homeFiles }),
    'api/skills': () => respond(read),
  } });
  await p.started;
  p.open('opus');

  const section = p.$('agent-settings-skills');
  assert.equal(section.querySelector('h4').textContent, 'Its settings name');
  assert.match(section.querySelector('p').textContent, /skills\/ folders, which Agister gives the call/);
  assert.deepEqual(p.table('agent-settings-skills'), [
    ['plan', 'agent', 'repo, replaces home', 'checks passed'],
    ['style', 'agent', 'home', `checks failed: ${beside}`],
    ['gone (missing skill)', 'agent', '—', '—'],
    ['ship (missing skill)', 'process review', '—', '—'],
  ]);
  assert.equal(section.querySelectorAll('span.missing').map((m) => m.title)[0], 'No skill named gone in these settings: Agister refuses the call');

  // The runtime's list is as before and labelled as the runtime's; neither
  // list holds the other's skills, and observed use is apart from both.
  assert.equal(p.$('agent-loads').querySelector('h4').textContent, 'Its runtime would load from the repo and the home');
  assert.deepEqual(p.table('agent-loads'), [
    ['big', 'repo', '.claude/skills', 'checks failed: SKILL.md is over 256 KB'],
    ['plan shared', 'repo', '.claude/skills', 'checks passed'],
    ['torn', 'repo', '.claude/skills', 'checks failed: no front matter'],
  ]);
  assert.doesNotMatch(p.$('agent-loads').textContent, /style|gone|ship|process/);
  assert.doesNotMatch(section.textContent, /\.claude\/skills|torn|big|review \d|run-/);
  assert.doesNotMatch(p.$('agent-observed').textContent, /style|gone|plan/);

  // An agent whose settings name none says so.
  p.open('sol');
  assert.deepEqual(p.table('agent-settings-skills'), []);
  assert.match(p.$('agent-settings-skills').textContent, /Its settings name no skills, and no process on it does\./);
});

// D-16, ADR-021 rule 1: a repo skill that is there goes over home's of the
// same name whatever its state, as in Agister, which refuses the call
// rather than fall back to home's. Too large, empty, without SKILL.md or a
// symbolic link, it is the repo's in both views, with its failed checks;
// only a skill the repo does not have is home's. The replies are as
// pages/serve.go and pages/skills.go send them: no skill files in the
// settings, the inventory in api/skills' settings.
test('BrokenRepoOverrideRemainsEffectiveInSettingsAndKnowledge', async () => {
  const names = ['big', 'empty', 'blank', 'bare', 'linked', 'absent'];
  const settingsFiles = {
    'agents/opus.toml': `name = "opus"\nruntime = "claude-code"\nskills = [${names.map((n) => `"${n}"`).join(', ')}]\n`,
    'runtimes/claude-code.yaml': 'name: claude-code\nadapter: claude-code\n',
  };
  const beside = 'holds notes.txt beside SKILL.md: a skill is its SKILL.md alone, and its other files are not given to a call';
  const broken = {
    big: { state: 'too_large', checks: { passed: false, failed: ['SKILL.md is over 256 KB'] } },
    empty: { state: 'missing', checks: { passed: false, failed: ['SKILL.md is missing'] } },
    blank: { content: '', checks: { passed: false, failed: ['no front matter'] } },
    bare: { state: 'missing', checks: { passed: false, failed: ['SKILL.md is missing', beside] } },
    linked: { link: '/shared/linked', state: 'linked_folder', checks: { passed: false, failed: ['the folder is a symbolic link: a skill is a folder holding its SKILL.md'] } },
  };
  const inventory = [
    ...Object.entries(broken).map(([name, s]) => ({ scope: 'repo', name, path: `/r/.agister/skills/${name}`, ...s })),
    ...names.map((name) => ({
      scope: 'home', name, path: `/u/.agister/skills/${name}`,
      content: `---\nname: ${name}\ndescription: Home's.\n---\n`, description: 'Home\'s.', checks: { passed: true },
    })),
  ];
  const p = page({
    storage: fakeStorage({ 'agister-pages:current': '/r' }),
    answers: {
      'api/settings': () => respond({ path: '/r', dir: '/r/.agister', home: false, files: settingsFiles, homeFiles: {} }),
      'api/skills': () => respond({ path: '/r', home: false, adapters: ['claude-code'], folders: [], settings: inventory }),
    },
  });
  await p.started;

  // Settings: the agents table names each skill with the layer in effect.
  assert.deepEqual(p.shown(), ['dashboard']);
  const cell = p.$('Agents-opus').querySelectorAll('td').find((td) => td.dataset.label === 'Skills');
  assert.equal(cell.textContent, [
    ...Object.keys(broken).map((n) => `${n} repo, replaces home checks failed`), 'absent home',
  ].join(', '));
  assert.deepEqual(cell.querySelectorAll('span.failed').map((s) => s.title), Object.values(broken).map((s) => s.checks.failed.join('; ')));
  assert.equal(cell.querySelectorAll('span.missing').length, 0);

  // Knowledge: the agent's settings skills, each the repo's with its failed
  // checks, and absent home's, passing.
  p.$('view-knowledge').click();
  await settle();
  p.open('opus');
  assert.deepEqual(p.table('agent-settings-skills'), [
    ...Object.entries(broken).map(([name, s]) => [name, 'agent', 'repo, replaces home', `checks failed: ${s.checks.failed.join('; ')}`]),
    ['absent', 'agent', 'home', 'checks passed'],
  ]);
  const paths = p.$('agent-settings-skills').querySelectorAll('tbody tr').map((tr) => tr.children[0].querySelector('span').title);
  assert.deepEqual(paths, [...Object.keys(broken).map((n) => `/r/.agister/skills/${n}`), '/u/.agister/skills/absent']);
});
