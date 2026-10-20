import { afterEach, describe, expect, it } from "vitest";
import { EDGE_PARTS, SCREEN_ROOTS, edgePart, screenRoot } from "./screenRoots.ts";
import { WINDOW_SIZES, openWindow } from "./windowSizes.ts";

// window-fit.feature, "A landscape window from the iPad mini to a large
// Mac display": each screen's content at most 1440 pixels wide, centred,
// its background filling the window.

const CONTENT = 1440;

// The narrowest landscape window, where a screen has only its own padding.
const NARROWEST = 1024;

// The windows of the feature, and wider ones than any Mac display there.
const WINDOWS = [...WINDOW_SIZES, [2560, 1440], [3440, 1440]] as const;

const px = (value: string) => parseFloat(value);

// What makes a screen's box, and so its background, fill the window.
const box = (style: CSSStyleDeclaration) => [style.margin, style.boxSizing, style.width, style.height, style.minHeight, style.inset, style.position, style.backgroundColor];

// The side paddings of a screen's root, and its box, measured on a root
// made afresh: jsdom keeps a style it has worked out. Each is measured
// against a window of the same height as the other.
function measure(classes: string) {
  const style = getComputedStyle(screenRoot(classes));
  return { left: px(style.paddingLeft), right: px(style.paddingRight), box: box(style) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("a landscape window from the iPad mini to a large Mac display", () => {
  it.each(SCREEN_ROOTS.flatMap((classes) => WINDOWS.map(([width, height]) => [classes, width, height] as const)))(
    "keeps the content of .%s, its own padding included, at most 1440 pixels wide and centred in a %i by %i window, its background filling the window",
    (classes, width, height) => {
      openWindow(NARROWEST, height);
      const own = measure(classes);

      openWindow(width, height);
      const shown = measure(classes);

      const added = [shown.left - own.left, shown.right - own.right];
      expect(added[0]).toBe(added[1]);
      expect(width - (added[0] ?? NaN) - (added[1] ?? NaN)).toBe(Math.min(width, CONTENT));
      expect(shown.box).toEqual(own.box);
    }
  );

  it.each(EDGE_PARTS.flatMap(([name, tag, attributes, sides]) => WINDOWS.map(([width, height]) => [name, tag, attributes, sides, width, height] as const)))(
    "keeps %s at the edge of the content in a %i by %i window",
    (_, tag, attributes, sides, width, height) => {
      openWindow(NARROWEST, height);
      const own = sides.map((side) => px(getComputedStyle(edgePart(tag, attributes))[side]));

      openWindow(width, height);
      const shown = sides.map((side) => px(getComputedStyle(edgePart(tag, attributes))[side]));

      expect(shown.map((offset, at) => offset - (own[at] ?? NaN))).toEqual(sides.map((side) => (side === "left" || side === "right" ? Math.max(0, (width - CONTENT) / 2) : 0)));
    }
  );
});
