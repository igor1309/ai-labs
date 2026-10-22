import { afterEach, describe, expect, it } from "vitest";
import { catalogueColumns } from "../src/catalogueColumns.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { EDGE_PARTS, SCREEN_ROOTS, edgePart, screenRoot } from "./screenRoots.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { manualWindow, mediaQueries } from "./support.ts";

const INSETS: SafeArea = { top: 11, right: 13, bottom: 17, left: 19 };
const SIDES = ["top", "right", "bottom", "left"] as const;
const px = (value: string) => parseFloat(value);

// A window with the insets is the test document with the app's
// stylesheet read again under them, after the one without.
function withInsets<T>(read: () => T, insets: SafeArea = INSETS): T {
  const sheet = document.createElement("style");
  sheet.textContent = appStylesheet(insets);
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
  it.each([
    [820, 2],
    [854, 2],
    [855, 3]
  ])("reads app.css's side insets through the viewport and counts %i pixels as %i catalogue columns", (width, columns) => {
    const media = mediaQueries({ "(orientation: portrait)": true, "(max-width: 599.98px)": false, "(max-height: 599.98px)": false });
    const viewport = mediaViewport(media.matchMedia, undefined, manualWindow(width), () => getComputedStyle(document.documentElement));
    const count = () => {
      const { left, right } = viewport.sideInsets();
      return catalogueColumns(viewport.width(), viewport.sizeClass(), left, right);
    };
    expect(viewport.sideInsets()).toEqual({ left: 0, right: 0 });
    expect(count()).toBe(3);

    withInsets(() => {
      expect(viewport.sideInsets()).toEqual({ left: 44, right: 20 });
      expect(count()).toBe(columns);
    }, { top: 0, bottom: 0, left: 44, right: 20 });
  });

  it("finds every screen's root", () => {
    expect(SCREEN_ROOTS).toEqual(expect.arrayContaining(["home", "catalogue", "dinosaur-page", "question", "result", "result result-with-levels", "dig-screen dig-reveal-screen", "dig-screen dig-field-guide-screen", "skeleton-screen"]));
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
