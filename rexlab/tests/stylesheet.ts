import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export const NO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

const CSS = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");

// The app's stylesheet as a window with the given safe-area insets reads
// it. jsdom knows no env(), so each inset is written in as the browser
// would resolve it; an environment variable with no value here fails.
// Nor does jsdom put a custom property into another property's value, so
// each custom property that reads an inset is written in where it is
// read. jsdom knows no dvh either: the test's window has no toolbars that
// come and go, so its visible height is its height, and each dvh is read
// as the vh jsdom resolves against that window.
export function appStylesheet(insets: SafeArea): string {
  const inset = (text: string) => text.replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g, (_, side: keyof SafeArea) => `${insets[side]}px`).replace(/\b([\d.]+)dvh\b/g, "$1vh");
  const css = inset(CSS);
  const unknown = /env\([^)]*\)/.exec(css);
  if (unknown) throw new Error(`app.css reads ${unknown[0]}, which the tests give no value`);
  const insetting = new Map([...CSS.matchAll(/(--[\w-]+)\s*:\s*([^;{}]*env\(safe-area-inset-[^;{}]*);/g)].map(([, name, value]) => [name, inset(value ?? "")]));
  return css.replace(/var\((--[\w-]+)\)/g, (read, name: string) => insetting.get(name) ?? read);
}

// Balance functions rather than splitting on commas: a fallback can itself
// contain var(), calc(), or a colour function with several arguments.
function substituteVariables(value: string, read: (name: string) => string, seen = new Set<string>()): string {
  return replace(value);

  function replace(text: string): string {
    const start = text.indexOf("var(");
    if (start < 0) return text;
    let depth = 1;
    let end = start + 4;
    let comma = -1;
    for (; end < text.length && depth; end++) {
      if (text[end] === "(") depth++;
      if (text[end] === ")") depth--;
      if (text[end] === "," && depth === 1 && comma < 0) comma = end;
    }
    if (depth) return text;
    const name = text.slice(start + 4, comma < 0 ? end - 1 : comma).trim();
    const fallback = comma < 0 ? "" : text.slice(comma + 1, end - 1).trim();
    const variable = seen.has(name) ? "" : read(name);
    const next = new Set(seen).add(name);
    const resolved = substituteVariables(variable || fallback, read, next);
    return text.slice(0, start) + resolved + replace(text.slice(end));
  }
}

type Declaration = readonly [name: string, value: string, priority: string];
type ParsedRule = { prelude: unknown; block: { children: { toArray(): { type: string; property: string; value: unknown; important: boolean }[] } } };
const cssParser = createRequire(import.meta.url)("css-tree") as {
  parse(css: string, options?: object): unknown;
  generate(node: unknown): string;
  walk(node: unknown, options: { visit: "Rule"; enter(rule: ParsedRule): void }): void;
};

// jsdom discards a pending shorthand when a later longhand overrides one
// side. Keep the source declarations so substitution precedes that parse.
function sourceDeclarations() {
  const sheets = new WeakMap<CSSStyleSheet, { text: string; rules: WeakMap<CSSStyleRule, Declaration[]> }>();
  return (rule: CSSStyleRule): Declaration[] => {
    const sheet = rule.parentStyleSheet;
    const text = sheet?.ownerNode?.textContent;
    if (sheet && text) {
      let indexed = sheets.get(sheet);
      if (!indexed || indexed.text !== text) {
        indexed = { text, rules: new WeakMap() };
        const bySelector = new Map<string, Declaration[][]>();
        cssParser.walk(cssParser.parse(text, { parseValue: false }), { visit: "Rule", enter(node) {
          const selector = cssParser.generate(node.prelude);
          const declarations = node.block.children.toArray().filter(({ type }) => type === "Declaration")
            .map(({ property, value, important }) => [property, cssParser.generate(value), important ? "important" : ""] as const);
          const entries = bySelector.get(selector) ?? [];
          entries.push(declarations);
          bySelector.set(selector, entries);
        } });
        const collect = (rules: CSSRuleList) => {
          for (const own of rules) {
            if (own instanceof CSSStyleRule) {
              const key = cssParser.generate(cssParser.parse(own.selectorText, { context: "selectorList" }));
              const declarations = bySelector.get(key)?.shift();
              if (declarations) indexed!.rules.set(own, declarations);
            } else if (own instanceof CSSMediaRule) collect(own.cssRules);
          }
        };
        collect(sheet.cssRules);
        sheets.set(sheet, indexed);
      }
      const declarations = indexed.rules.get(rule);
      if (declarations) return declarations;
    }
    return [...rule.style].map((name) => [name, rule.style.getPropertyValue(name), rule.style.getPropertyPriority(name)]);
  };
}

// Keep jsdom's own cascade, shorthand expansion and serialization. Only
// declarations reading variables are substituted while it computes the style;
// the authored stylesheet and the element's inline styles are restored after it.
function resolvedStyle(native: typeof getComputedStyle, declarations: ReturnType<typeof sourceDeclarations>): typeof getComputedStyle {
  return (element, pseudo) => {
    const original = native(element, pseudo);
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current);
    const restores: (() => void)[] = [];
    const resolve = (style: CSSStyleDeclaration, owner: Element, source?: readonly Declaration[]) => {
      const computed = native(owner);
      const saved = [...style].map((name) => [name, style.getPropertyValue(name), style.getPropertyPriority(name)] as const);
      const authored = source ?? saved;
      if (!authored.some(([name, value]) => !name.startsWith("--") && value.includes("var("))) return;
      const write = (entries: readonly (readonly [string, string, string])[]) => {
        style.cssText = "";
        for (const [name, value, priority] of entries) style.setProperty(name, value, priority);
      };
      restores.push(() => write(saved));
      write(authored.map(([name, value, priority]) => [name, name.startsWith("--") ? value : substituteVariables(value, (variable) => computed.getPropertyValue(variable).trim()), priority] as const));
    };
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          if (rule.selectorText.includes("::") || !declarations(rule).some(([, value]) => value.includes("var("))) continue;
          const owner = ancestors.find((candidate) => candidate.matches(rule.selectorText));
          if (owner) resolve(rule.style, owner, declarations(rule));
        } else if (rule instanceof CSSMediaRule && [...rule.media].some((media) => media === "all" || media === "screen")) {
          walk(rule.cssRules);
        }
      }
    };
    try {
      for (const sheet of element.ownerDocument.styleSheets) walk(sheet.cssRules);
      for (const owner of ancestors) if (owner instanceof HTMLElement || owner instanceof SVGElement) resolve(owner.style, owner);
      if (!restores.length) return original;
      const computed = native(element, pseudo);
      // Snapshot while inherited declarations still have their substituted values.
      const values = new Map([...new Set([...computed, "color", "font-size", "font-family", "line-height"])].map((name) => [name, computed.getPropertyValue(name)]));
      const literal = element.ownerDocument.createElement("span").style;
      for (const [name, value] of values) literal.setProperty(name, value);
      return new Proxy(computed, {
        get(target, key) {
          if (key === "getPropertyValue") return (name: string) => values.get(name) ?? (literal.getPropertyValue(name) || original.getPropertyValue(name));
          if (typeof key === "string" && key in literal && typeof Reflect.get(literal, key) === "string") return Reflect.get(literal, key) || Reflect.get(original, key);
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  };
}


// Most reads concern layout declarations with no variables. Keep those on
// jsdom's cached path; substitute only when the requested value needs it.
export function computedStyleWithVariables(native: typeof getComputedStyle, includes: (value: string) => boolean = () => true): typeof getComputedStyle {
  const declarations = sourceDeclarations();
  const resolve = resolvedStyle(native, declarations);
  const index = new WeakMap<CSSStyleSheet, { rule: CSSStyleRule; properties: string[] }[]>();
  function rules(sheet: CSSStyleSheet) {
    let entries = index.get(sheet);
    if (entries) return entries;
    entries = [];
    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        if (rule instanceof CSSStyleRule && !rule.selectorText.includes("::")) {
          const properties = declarations(rule).filter(([name, value]) => !name.startsWith("--") && value.includes("var(")).map(([name]) => name);
          if (properties.length) entries!.push({ rule, properties });
        } else if (rule instanceof CSSMediaRule && [...rule.media].some((media) => media === "all" || media === "screen")) walk(rule.cssRules);
      }
    };
    walk(sheet.cssRules);
    index.set(sheet, entries);
    return entries;
  }
  return (element, pseudo) => {
    const original = native(element, pseudo);
    let resolved: CSSStyleDeclaration | undefined;
    const read = (property: string) => {
      const value = original.getPropertyValue(property);
      if (property.startsWith("--")) return includes(value) ? substituteVariables(value, (name) => original.getPropertyValue(name)) : value;
      if (value.includes("var(") && includes(value)) {
        const literal = element.ownerDocument.createElement("span");
        literal.style.setProperty(property, substituteVariables(value, (name) => original.getPropertyValue(name).trim()));
        return native(literal).getPropertyValue(property);
      }
      const affects = (name: string) => name === property || property.startsWith(`${name}-`);
      let needsResolution = value.includes("var(") && includes(value);
      if (!needsResolution && element instanceof HTMLElement) {
        needsResolution = [...element.style].some((name) => affects(name) && element.style.getPropertyValue(name).includes("var(") && includes(element.style.getPropertyValue(name)));
      }
      if (!needsResolution) {
        needsResolution = [...element.ownerDocument.styleSheets].some((sheet) => rules(sheet).some(({ rule, properties }) => properties.some((name) => affects(name) && includes(declarations(rule).find(([property]) => property === name)?.[1] ?? "")) && element.matches(rule.selectorText)));
      }
      if (!needsResolution) return value;
      resolved ??= resolve(element, pseudo);
      return resolved.getPropertyValue(property);
    };
    return new Proxy(original, {
      get(target, key) {
        if (key === "getPropertyValue") return read;
        if (typeof key === "string" && key in target && typeof Reflect.get(target, key) === "string" && key !== "cssText") {
          return read(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
        }
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  };
}
