import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../session/internal/web/static/app.js', import.meta.url), 'utf8');

function element({ dataset = {}, selectors = {}, closest = {} } = {}) {
  const classes = new Set();
  return {
    dataset, style: {}, hidden: true, value: '', textContent: '',
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    querySelector(selector) {
      assert.ok(selector in selectors, `unexpected selector ${selector}`);
      return selectors[selector];
    },
    closest: selector => closest[selector] ?? null,
    setAttribute() {}, focus() {}, after() {}, remove() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ right: 400, bottom: 200 }),
  };
}

function browser(readerData, paragraphData, responses) {
  const events = {};
  let submit;
  const waiting = [];
  const nextRender = () => new Promise(resolve => waiting.push(resolve));
  const rendered = nextRender();
  const complete = value => { assert.ok(waiting.length, 'unexpected render'); waiting.shift()(value); };
  const recovery = element();
  const body = element({ selectors: { button: recovery } });
  body.replaceChildren = paragraph => complete(paragraph.textContent);
  Object.defineProperty(body, 'innerHTML', { set: html => complete(html) });
  const answer = element({ selectors: {
    'header b': element(), '.quote': element(), '.q': element(),
    'header button': element(), '.body': body,
  } });
  const button = element();
  const paragraph = element({
    dataset: paragraphData,
    selectors: { '.para-menu': button },
  });
  button.closest = selector => selector === '.para' ? paragraph : selector === '.para-menu' ? button : null;
  const reader = element({ dataset: readerData });
  const form = { addEventListener: (name, callback) => { assert.equal(name, 'submit'); submit = callback; } };
  const input = element();
  const menu = element({ selectors: { '.menu-quote span': element(), '.menu-ask input': input, '.menu-ask': form } });
  menu.querySelectorAll = selector => { assert.equal(selector, '[role=menuitem], .menu-ask input'); return [input]; };
  const scrim = element();
  const icons = { content: { querySelector: () => ({ innerHTML: '<svg></svg>' }) } };
  const requests = [];
  const navigations = [];
  const document = {
    documentElement: { clientWidth: 1000 },
    querySelector: selector => ({ '.reader': reader, '.sheet-scrim': scrim })[selector],
    getElementById: id => ({ menu, 'answer-icons': icons })[id],
    addEventListener: (name, callback) => { events[name] = callback; },
    createElement: name => { assert.ok(['section', 'p'].includes(name)); return name === 'section' ? answer : element(); },
  };
  vm.runInNewContext(script, {
    document, matchMedia: () => ({ matches: false }), scrollX: 0, scrollY: 0,
    location: { assign: url => navigations.push(url) },
    fetch: async (url, options) => {
      requests.push({ url, ...options, headers: { ...options.headers }, body: JSON.parse(options.body) });
      const response = responses[requests.length - 1];
      assert.ok(response, 'unexpected fetch');
      if (response instanceof Error) throw response;
      return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
    },
  });
  return { requests, rendered, nextRender, navigations,
    recover: () => recovery.onclick(),
    quote: answer.querySelector('.quote'), question: answer.querySelector('.q'),
    open: () => events.click({ target: button }),
    choose: kind => events.click({ target: element({ closest: { '[role=menuitem]': { dataset: { kind } } } }) }),
    ask: text => submit({ preventDefault() {}, target: { q: { value: text } } }),
  };
}

for (const kind of ['more', 'simpler', 'example', 'ask']) {
  test(`paragraph ${kind} sends rendered identity and source reference`, async () => {
    const page = browser(
      { revision: '37', materialRevision: 'source-revision', entity: 'lecture-id', page: '3' },
      { n: '2', reference: 'source-revision:byte-157', text: 'The selected paragraph.' },
      [{ status: 200, body: { available: false, text: 'Explanation unavailable.' } }],
    );
    page.open();
    if (kind === 'ask') page.ask('  Why this step?  ');
    else await page.choose(kind);
    assert.equal(await page.rendered, 'Explanation unavailable.');
    assert.deepEqual(page.requests, [{
      url: '/api/answer', method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: {
        revision: 37, materialRevision: 'source-revision', reference: 'source-revision:byte-157',
        kind, entityId: 'lecture-id', page: 3, paragraph: 2,
        text: kind === 'ask' ? 'Why this step?' : 'The selected paragraph.',
      },
    }]);
  });
}

for (const kind of ['more', 'ask']) {
  test(`stale ${kind} keeps context and explicitly reopens this absolute page`, async () => {
    const page = browser(
      { revision: '37', materialRevision: 'old-source', entity: 'lecture/part', page: '3' },
      { n: '2', reference: 'old-source:157', text: 'Selected paragraph.' },
      [{ status: 409 }],
    );
    page.open();
    if (kind === 'ask') page.ask(' Why this? ');
    else await page.choose(kind);
    const html = await page.rendered;
    assert.match(html, /Страница устарела/);
    assert.match(html, /вернёт общее место чтения/);
    assert.match(html, /кнопки Telegram устареют/);
    assert.match(html, /Открыть эту страницу снова/);
    assert.doesNotMatch(html, /Повторить|Agonara не ответила/);
    assert.equal(page.quote.textContent, 'Selected paragraph.');
    assert.equal(page.question.textContent, kind === 'ask' ? 'Why this?' : '');
    assert.equal(page.question.hidden, kind !== 'ask');
    assert.deepEqual(page.navigations, []);
    assert.equal(page.requests.length, 1);
    assert.equal(page.requests[0].body.reference, 'old-source:157');
    page.recover();
    assert.deepEqual(page.navigations, ['/m/lecture%2Fpart?page=3']);
    assert.equal(page.requests.length, 1, 'reopening must not resubmit the stale question');
  });
}

for (const failure of [{ status: 500 }, { status: 400 }, new Error('connection lost')]) {
  test(`retryable failure ${failure.status ?? 'network'} preserves paragraph and question`, async () => {
    const page = browser(
      { revision: '37', materialRevision: 'source', entity: 'lecture', page: '3' },
      { n: '2', reference: 'source:157', text: 'Selected paragraph.' },
      [failure, { status: 200, body: { available: false, text: 'Explanation unavailable.' } }],
    );
    page.open();
    page.ask(' Why this? ');
    assert.match(await page.rendered, /Повторить/);
    assert.equal(page.quote.textContent, 'Selected paragraph.');
    assert.equal(page.question.textContent, 'Why this?');
    assert.equal(page.question.hidden, false);
    const retried = page.nextRender();
    page.recover();
    assert.equal(await retried, 'Explanation unavailable.');
    assert.equal(page.requests.length, 2);
    assert.deepEqual(page.requests[1], page.requests[0]);
    assert.deepEqual(page.navigations, []);
  });
}
