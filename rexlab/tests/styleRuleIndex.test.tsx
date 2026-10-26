import { afterEach, expect, it } from "vitest";

// jsdom looks up an element's rules in an index of each sheet's rules, by
// the id, class and tag they name. A style read must see the sheets as
// they are now, whatever an earlier read indexed.
const added: Element[] = [];

function addSheet(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  added.push(style);
  return style;
}

function addElement(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  added.push(host);
  return host.firstElementChild as HTMLElement;
}

afterEach(() => {
  for (const element of added.splice(0)) element.remove();
});

it("applies a rule by id, by class, by tag, by attribute and on every element, in cascade order", () => {
  addSheet(`
    * { outline-style: dotted; }
    em { font-style: normal; }
    .probe-a { color: rgb(1, 1, 1); }
    .probe-b { color: rgb(2, 2, 2); }
    #probe-id { letter-spacing: 3px; }
    [data-probe] { word-spacing: 4px; }
  `);
  const element = addElement('<em id="probe-id" class="probe-b probe-a" data-probe>x</em>');
  const style = getComputedStyle(element);
  expect([style.outlineStyle, style.fontStyle, style.color, style.letterSpacing, style.wordSpacing]).toEqual(["dotted", "normal", "rgb(2, 2, 2)", "3px", "4px"]);
});

it("sees a rule inserted, a rule deleted and a sheet added or removed after a read", () => {
  const style = addSheet(".probe { color: rgb(1, 1, 1); }");
  const element = addElement('<span class="probe">x</span>');
  expect(getComputedStyle(element).color).toBe("rgb(1, 1, 1)");

  const sheet = style.sheet as CSSStyleSheet;
  sheet.insertRule(".probe { color: rgb(2, 2, 2); }", 1);
  expect(getComputedStyle(element).color).toBe("rgb(2, 2, 2)");

  sheet.deleteRule(1);
  expect(getComputedStyle(element).color).toBe("rgb(1, 1, 1)");

  const later = addSheet(".probe { color: rgb(3, 3, 3); }");
  expect(getComputedStyle(element).color).toBe("rgb(3, 3, 3)");

  later.remove();
  expect(getComputedStyle(element).color).toBe("rgb(1, 1, 1)");

  style.textContent = ".probe { color: rgb(4, 4, 4); }";
  expect(getComputedStyle(element).color).toBe("rgb(4, 4, 4)");
});

it("sees a rule inserted inside a media rule after a read", () => {
  const style = addSheet("@media all { .probe { color: rgb(1, 1, 1); } }");
  const element = addElement('<span class="probe">x</span>');
  expect(getComputedStyle(element).color).toBe("rgb(1, 1, 1)");

  ((style.sheet as CSSStyleSheet).cssRules[0] as CSSMediaRule).insertRule(".probe { color: rgb(2, 2, 2); }", 1);
  expect(getComputedStyle(element).color).toBe("rgb(2, 2, 2)");
});

it("follows an element's class and id as they change", () => {
  addSheet(".probe-a { color: rgb(1, 1, 1); } #probe-id { color: rgb(2, 2, 2); }");
  const element = addElement("<span>x</span>");
  expect(getComputedStyle(element).color).not.toBe("rgb(1, 1, 1)");

  element.classList.add("probe-a");
  expect(getComputedStyle(element).color).toBe("rgb(1, 1, 1)");

  element.id = "probe-id";
  expect(getComputedStyle(element).color).toBe("rgb(2, 2, 2)");
});

it("applies a media rule only while its query matches the window", () => {
  addSheet("@media (min-width: 100000px) { .probe { color: rgb(1, 1, 1); } }");
  const element = addElement('<span class="probe">x</span>');
  expect(getComputedStyle(element).color).not.toBe("rgb(1, 1, 1)");
});
