import { expect, it } from "vitest";
import { appStylesheet, cascadingOnRead, NO_SAFE_AREA } from "./stylesheet.ts";

// The reads taken on their own give what jsdom's whole computed style
// gives, on an element of every class app.css styles, nested so that the
// rules for descendants match too, some hidden or inert.
it("reads display, visibility and pointer-events as jsdom's whole computed style does", () => {
  const css = appStylesheet(NO_SAFE_AREA);
  const classes = [...new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(([, name]) => name!))];
  // A frame's window keeps jsdom's own getComputedStyle.
  const frame = globalThis.document.createElement("iframe");
  globalThis.document.body.append(frame);
  const window = frame.contentWindow as Window & typeof globalThis;
  const { document } = window;
  const sheet = document.createElement("style");
  sheet.textContent = css;
  document.head.append(sheet);
  let parent: Element = document.body;
  classes.forEach((name, index) => {
    const element = document.createElement(index % 3 === 0 ? "button" : "div");
    element.className = name;
    if (index % 7 === 0) element.setAttribute("hidden", "");
    if (index % 11 === 0) element.setAttribute("aria-hidden", "true");
    if (index % 5 === 0) element.setAttribute("data-state", "open");
    parent.append(element);
    if (index % 4 === 0) parent = element;
    if (index % 40 === 0) parent = document.body;
  });
  const native = window.getComputedStyle.bind(window);
  const onRead = cascadingOnRead(native);
  const elements = [...document.querySelectorAll("*")];
  expect(elements.length).toBeGreaterThan(500);
  const read = (style: CSSStyleDeclaration) => [style.display, style.visibility, style.getPropertyValue("pointer-events"), style.getPropertyValue("color")];
  // Each read on a fresh document, so neither path reuses the other's cascade.
  const fast = elements.map((element) => read(onRead(element)));
  document.head.append(document.createElement("meta"));
  expect(fast).toEqual(elements.map((element) => read(native(element))));
});
