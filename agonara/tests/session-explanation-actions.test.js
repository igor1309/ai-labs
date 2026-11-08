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

function browser(readerData, paragraphData, reply) {
  const events = {};
  let submit;
  let complete;
  const rendered = new Promise(resolve => { complete = resolve; });
  const body = element();
  body.replaceChildren = paragraph => complete(paragraph.textContent);
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
  const document = {
    documentElement: { clientWidth: 1000 },
    querySelector: selector => ({ '.reader': reader, '.sheet-scrim': scrim })[selector],
    getElementById: id => ({ menu, 'answer-icons': icons })[id],
    addEventListener: (name, callback) => { events[name] = callback; },
    createElement: name => { assert.ok(['section', 'p'].includes(name)); return name === 'section' ? answer : element(); },
  };
  vm.runInNewContext(script, {
    document, matchMedia: () => ({ matches: false }), scrollX: 0, scrollY: 0,
    fetch: async (url, options) => {
      requests.push({ url, ...options, headers: { ...options.headers }, body: JSON.parse(options.body) });
      return { ok: true, json: async () => reply };
    },
  });
  return { requests, rendered,
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
      { available: false, text: 'Explanation unavailable.' },
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
