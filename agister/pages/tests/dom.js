// A fake DOM, just enough of one for page.js: the page's own markup from
// index.html, elements made by createElement, text, classes, attributes,
// events that bubble, and selectors of tags, IDs and classes. It parses no
// HTML: setting innerHTML or outerHTML is recorded in the document's
// markup and throws.
import { readFileSync } from 'node:fs';

const VOID = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);

class Text {
  constructor(data) {
    this.data = data;
    this.parentNode = null;
  }

  get textContent() {
    return this.data;
  }
}

class ClassList {
  constructor(node) {
    this.node = node;
  }

  get names() {
    return this.node.className.split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this.names.includes(name);
  }

  add(name) {
    if (!this.contains(name)) this.node.className = [...this.names, name].join(' ');
  }

  remove(name) {
    this.node.className = this.names.filter((n) => n !== name).join(' ');
  }

  toggle(name, force = !this.contains(name)) {
    if (force) this.add(name);
    else this.remove(name);
    return force;
  }
}

class Event {
  constructor(type, props = {}) {
    Object.assign(this, { type, defaultPrevented: false, path: [] }, props);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  composedPath() {
    return this.path;
  }
}

class Target {
  constructor() {
    this.listeners = [];
  }

  addEventListener(type, listener) {
    this.listeners.push({ type, listener });
  }

  // Calls the listeners on the target, then on each ancestor up to the
  // document; the event says whether its default was prevented.
  dispatchEvent(event) {
    event.target = this;
    const path = [];
    for (let node = this; node; node = node.parentNode) path.push(node);
    event.path = path;
    for (const node of path) {
      for (const { type, listener } of node.listeners) if (type === event.type) listener(event);
    }
    return event;
  }
}

class Element extends Target {
  constructor(document, tag) {
    super();
    this.ownerDocument = document;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.classList = new ClassList(this);
    this.className = '';
    this.hidden = false;
    this.title = '';
    this.id = '';
  }

  get children() {
    return this.childNodes.filter((n) => n instanceof Element);
  }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set innerHTML(value) {
    this.ownerDocument.markup.push(String(value));
    throw new Error('the page set innerHTML');
  }

  set outerHTML(value) {
    this.ownerDocument.markup.push(String(value));
    throw new Error('the page set outerHTML');
  }

  set textContent(value) {
    this.replaceChildren(...(value === '' || value == null ? [] : [String(value)]));
  }

  append(...nodes) {
    for (const node of nodes) {
      // As in a browser, anything but a node becomes its text: null too.
      const child = node instanceof Element || node instanceof Text ? node : new Text(String(node));
      if (child.parentNode) child.parentNode.childNodes = child.parentNode.childNodes.filter((n) => n !== child);
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }

  hasChildNodes() {
    return this.childNodes.length > 0;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  click() {
    return this.dispatchEvent(new Event('click'));
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  scrollIntoView() {
    this.ownerDocument.scrolledTo = this;
  }

  querySelectorAll(selector) {
    return descendants(this).filter((node) => matches(node, selector, this));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function descendants(root) {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

// One compound selector: an optional tag, #id and .classes.
function compound(node, text) {
  const [, tag, id, classes] = /^([a-z0-9]*)(?:#([\w-]+))?((?:\.[\w-]+)*)$/i.exec(text) ?? [];
  if (tag === undefined) throw new Error(`selector not supported: ${text}`);
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  if (id && node.id !== id) return false;
  return classes.split('.').filter(Boolean).every((c) => node.classList.contains(c));
}

// Descendant selectors: the last part matches node, the others ancestors
// of it inside root, in order.
function matches(node, selector, root) {
  const parts = selector.trim().split(/\s+/);
  if (!compound(node, parts.pop())) return false;
  let ancestor = node.parentNode;
  while (parts.length && ancestor && ancestor !== root.parentNode) {
    if (ancestor instanceof Element && compound(ancestor, parts.at(-1))) parts.pop();
    ancestor = ancestor.parentNode;
  }
  return parts.length === 0;
}

class Document extends Target {
  constructor() {
    super();
    this.parentNode = null;
    this.body = new Element(this, 'body');
    this.body.parentNode = this;
    this.activeElement = null;
    this.scrolledTo = null;
    // What the page tried to set as HTML: nothing, ever.
    this.markup = [];
  }

  createElement(tag) {
    return new Element(this, tag);
  }

  getElementById(id) {
    return descendants(this.body).find((node) => node.id === id) ?? null;
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }
}

// A document holding the page's markup: index.html's body up to its
// scripts.
export function pageDocument() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const markup = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('<script'));
  const document = new Document();
  let parent = document.body;
  for (const [, close, tag, attrs, text] of markup.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    if (text !== undefined) {
      if (text.trim()) parent.append(text.trim());
    } else if (close) {
      parent = parent.parentNode;
    } else {
      const node = document.createElement(tag);
      for (const [, name, value = ''] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        if (name === 'id') node.id = value;
        else if (name === 'class') node.className = value;
        else if (name === 'hidden') node.hidden = true;
        else if (name === 'title' || name === 'type') node[name] = value;
        else node.setAttribute(name, value);
      }
      parent.append(node);
      if (!VOID.has(tag.toLowerCase())) parent = node;
    }
  }
  return document;
}

export { Event };
