import { afterEach, describe, expect, it } from "vitest";
import { EDGE_PARTS, SCREEN_ROOTS, edgePart, screenRoot } from "./screenRoots.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";

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
    expect(SCREEN_ROOTS).toEqual(expect.arrayContaining(["home", "catalogue", "dinosaur-page", "question", "result", "result result-with-levels", "dig-screen dig-reveal-screen", "skeleton-screen"]));
  });

  it.each(SCREEN_ROOTS)("insets the content of .%s by adding the safe areas to its own padding, its background still filling the window", (classes) => {
    const root = screenRoot(classes);
    const measure = () => {
      const style = getComputedStyle(root);
      return { padding: padding(style), box: box(style) };
    };
    const without = measure();

    const inset = withInsets(measure);

    expect(SIDES.map((side) => inset.padding[side] - without.padding[side])).toEqual(SIDES.map((side) => INSETS[side]));
    expect(inset.box).toEqual(without.box);
  });

  it.each(EDGE_PARTS)("keeps %s, fixed at the window's edges, clear of the safe areas", (_, tag, attributes, sides) => {
    const part = edgePart(tag, attributes);
    const offsets = () => sides.map((side) => px(getComputedStyle(part)[side]));
    const without = offsets();

    const inset = withInsets(offsets);

    expect(getComputedStyle(part).position).toBe("fixed");
    expect(inset.map((offset, at) => offset - (without[at] ?? NaN))).toEqual(sides.map((side) => INSETS[side]));
  });
});
