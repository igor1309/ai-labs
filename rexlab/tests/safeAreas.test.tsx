import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";

const SRC = join(import.meta.dirname, "../src");

// Each screen's root, by the classes its <main> can carry, as the
// components write them, and the portrait gate that covers a screen.
const SCREENS = [
  ...new Set(
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) => [...readFileSync(join(SRC, file), "utf8").matchAll(/<main\b[^>]*?\bclassName=(\{[^}]*\}|"[^"]*")/g)])
      .flatMap(([, className]) => [...(className ?? "").matchAll(/"([^"]+)"/g)].map(([, classes]) => classes ?? ""))
  ),
  "orientation-gate"
];

const INSETS: SafeArea = { top: 11, right: 13, bottom: 17, left: 19 };
const SIDES = ["top", "right", "bottom", "left"] as const;
const px = (value: string) => parseFloat(value);

// A window with the insets is the test document with the app's
// stylesheet read again under them, after the one without.
function withInsets<T>(read: () => T): T {
  const sheet = document.createElement("style");
  sheet.textContent = appStylesheet(INSETS);
  document.head.append(sheet);
  try {
    return read();
  } finally {
    sheet.remove();
  }
}

const padding = (style: CSSStyleDeclaration) => ({ top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) });

// What makes a screen's box fill the window, which the insets leave as
// they are.
const box = (style: CSSStyleDeclaration) => [style.margin, style.boxSizing, style.width, style.height, style.minHeight, style.inset, style.position];

afterEach(() => {
  document.body.replaceChildren();
});

describe("safe areas stay clear", () => {
  it("finds every screen's root", () => {
    expect(SCREENS).toEqual(expect.arrayContaining(["home", "catalogue", "dinosaur-page", "question", "result", "result result-with-levels", "dig-screen dig-reveal-screen", "skeleton-screen"]));
  });

  it.each(SCREENS)("insets the content of .%s by adding the safe areas to its own padding, its background still filling the window", (classes) => {
    const root = document.createElement(classes === "orientation-gate" ? "div" : "main");
    root.className = classes;
    document.body.append(root);
    const measure = () => {
      const style = getComputedStyle(root);
      return { padding: padding(style), box: box(style) };
    };
    const without = measure();

    const inset = withInsets(measure);

    expect(SIDES.map((side) => inset.padding[side] - without.padding[side])).toEqual(SIDES.map((side) => INSETS[side]));
    expect(inset.box).toEqual(without.box);
  });

  it.each([
    ["the version footer", "footer", { id: "version" }, ["right", "bottom"]],
    ["the wordmark", "p", { className: "wordmark" }, ["top", "left"]],
    ["the home corner", "div", { className: "home-corner" }, ["top", "right"]]
  ] as const)("keeps %s, fixed at the window's edges, clear of the safe areas", (_, tag, attributes, sides) => {
    const part = Object.assign(document.createElement(tag), attributes);
    document.body.append(part);
    const offsets = () => sides.map((side) => px(getComputedStyle(part)[side]));
    const without = offsets();

    const inset = withInsets(offsets);

    expect(getComputedStyle(part).position).toBe("fixed");
    expect(inset.map((offset, at) => offset - (without[at] ?? NaN))).toEqual(sides.map((side) => INSETS[side]));
  });
});
