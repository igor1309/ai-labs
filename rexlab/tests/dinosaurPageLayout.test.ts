import { describe, expect, it } from "vitest";
import { dinosaurWordsWidth, keptLines } from "../src/dinosaurPageLayout.ts";

describe("a portrait dinosaur page's word bands", () => {
  it.each([
    [472, { description: 5, note: 4 }],
    [519, { description: 5, note: 4 }],
    [520, { description: 4, note: 4 }],
    [599, { description: 4, note: 4 }],
    [600, { description: 4, note: 3 }],
    [655, { description: 4, note: 3 }],
    [656, { description: 3, note: 3 }]
  ])("keeps %j lines at %i pixels", (width, expected) => {
    expect(keptLines(width)).toEqual(expected);
  });

  it.each([
    [600, 0, 0, 0, 488],
    [600, 0, 0, 16, 472],
    [744, 19, 13, 0, 600]
  ])("takes side insets, padding and scrollbar from a %i pixel window", (windowWidth, left, right, scrollbar, expected) => {
    expect(dinosaurWordsWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });
});
