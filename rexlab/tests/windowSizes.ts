import { onTestFinished } from "vitest";

export type WindowSize = readonly [width: number, height: number];

// The landscape windows every fit budget keeps, in CSS pixels, as
// window-fit.feature gives them: the 9.7" iPad and the iPad mini in
// Safari and full screen, the 13" iPad Pro, a Mac window and a Mac window
// on a large display. Budgets count no safe-area inset.
export const WINDOW_SIZES: readonly WindowSize[] = [
  [1024, 690],
  [1024, 768],
  [1133, 670],
  [1133, 744],
  [1376, 1032],
  [1440, 900],
  [1920, 1080]
];

// The shared windows, then those of `more` a budget keeps besides them.
export const windowsAnd = (...more: WindowSize[]): readonly WindowSize[] => [
  ...WINDOW_SIZES,
  ...more.filter(([width, height]) => !WINDOW_SIZES.some((size) => size[0] === width && size[1] === height))
];

// The window the test opened last, in place of the one it had before.
let opened: { innerWidth: number; innerHeight: number } | undefined;

// The test's window is `width` by `height` until the test ends: jsdom
// resolves vw and vh against it, as a browser does against the window.
// Set it before the screen is rendered: jsdom keeps a style it has
// worked out.
export function openWindow(width: number, height: number) {
  if (!opened) {
    const before = (opened = { innerWidth: window.innerWidth, innerHeight: window.innerHeight });
    onTestFinished(() => {
      Object.assign(window, before);
      opened = undefined;
    });
  }
  Object.assign(window, { innerWidth: width, innerHeight: height });
}

const holds = (condition: string, [width, height]: WindowSize) => {
  const [, feature, least] = /^\((min-width|min-height): (\d+)px\)$/.exec(condition) ?? [];
  return feature === "min-width" ? width >= Number(least) : feature === "min-height" ? height >= Number(least) : false;
};

const px = (value: string) => Number.parseFloat(value) || 0;

// An element's style in a window of `size`. jsdom applies no media query, so the
// screen's rules for wider or taller windows are applied here: each
// restates a selector of the screen's own rules, and the last that
// matches wins.
export function styleAt(element: Element, size: WindowSize) {
  const computed = getComputedStyle(element);
  const value = (property: string) => {
    let found = computed.getPropertyValue(property);
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSMediaRule) || !holds(rule.conditionText, size)) continue;
        for (const inner of rule.cssRules) {
          if (inner instanceof CSSStyleRule && element.matches(inner.selectorText)) found = inner.style.getPropertyValue(property) || found;
        }
      }
    }
    const variable = /^var\((--[\w-]+)\)$/.exec(found)?.[1];
    if (variable) {
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        const resolved = getComputedStyle(parent).getPropertyValue(variable);
        if (resolved) return resolved;
      }
    }
    return found;
  };
  // jsdom works out a gap's longhand only where the CSS sets it; one the
  // shorthand alone sets reads as normal, and the shorthand gives it, row
  // gap first.
  const gap = (longhand: string, at: (both: string[]) => string | undefined) => {
    const set = value(longhand);
    return px(set && set !== "normal" ? set : (at(value("gap").split(" ")) ?? ""));
  };
  return { value, px: (property: string) => px(value(property)), rowGap: () => gap("row-gap", (both) => both[0]), columnGap: () => gap("column-gap", (both) => both.at(-1)) };
}
