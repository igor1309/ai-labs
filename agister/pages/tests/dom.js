// A fake DOM, just enough of one for page.js: elements made by
// createElement, text, children, properties set on them, and lookup by id.
export class Element {
  constructor(tag, props = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.ownText = null;
    Object.assign(this, props);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'object' && !(node instanceof Element)) throw new Error(`appended a ${Object.prototype.toString.call(node)}`);
      this.children.push(node instanceof Element ? node : String(node));
    }
    this.ownText = null;
  }

  appendChild(node) { this.append(node); return node; }

  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }

  get textContent() {
    if (this.ownText != null) return this.ownText;
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }

  set textContent(text) { this.children = []; this.ownText = String(text); }

  *walk() {
    yield this;
    for (const c of this.children) if (c instanceof Element) yield* c.walk();
  }

  all(tag) { return [...this.walk()].filter((e) => e.tagName === tag.toUpperCase()); }

  click() { this.onclick?.(); }
}

// page is a document holding the page's own markup: the views' buttons,
// the read stamp, the reload button and the view.
export function page() {
  const body = new Element('body');
  const nav = new Element('nav', { id: 'nav' });
  for (const view of ['runs', 'compare']) {
    const b = new Element('button');
    b.dataset.view = view;
    nav.append(b);
  }
  body.append(nav, new Element('span', { id: 'read' }), new Element('button', { id: 'reload' }), new Element('main', { id: 'view' }));
  return {
    body,
    createElement: (tag) => new Element(tag),
    getElementById: (id) => [...body.walk()].find((e) => e.id === id) ?? null,
  };
}
