import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import type { Theme } from "../src/theme.ts";
import { keptSkeletons, openSkeletonsApp } from "./skeletonsApp.tsx";
import { PALETTE, sameColour } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

// skeleton-assembly-museum.feature: each stand's button on its own under
// its exhibit, in the hall's rows of three and its centred row of two,
// with as much room under the buttons as above the names, nothing cut
// off, and the amber ring of a stand awaiting its skeleton.

// Windows in landscape, in CSS pixels: the shared ones, more iPads and a
// Mac window, as the museum was seen in.
const WINDOWS = windowsAnd([1180, 820], [1366, 1024], [1475, 820]);

// The least height of an exhibit, so a skeleton shows on it.
const EXHIBIT = 96;

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded, the row gap first.
const rowGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ")[0] ?? "");

const styleOf = (selector: string) => getComputedStyle(document.querySelector(selector) ?? document.body);

const transparent = (color: string) => color === "" || color === "transparent" || /^rgba\(.*, 0\)$/.test(color);

async function openMuseum(language: Language, appearance: Theme) {
  const { user } = openSkeletonsApp({
    deviceLanguage: language === "ru" ? "ru-RU" : "en-GB",
    appearance,
    storage: keptSkeletons({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: ["triceratops"] })
  });
  await user.click(screen.getByRole("button", { name: TEXTS[language].museum }));
  const hall = screen.getByRole("group", { name: TEXTS[language].stands });
  return { hall, stands: within(hall).getAllByRole("region") };
}

describe.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))("the museum in %s, %s", (language, theme) => {
  it("stands each button on its own under its exhibit, with no card behind it", async () => {
    const { stands } = await openMuseum(language, theme);

    expect(stands.map((stand) => [...stand.children].map((part) => part.className))).toEqual(
      stands.map(() => ["skeleton-stand-top", "skeleton-exhibit", "skeleton-stand-button"])
    );
    expect(stands.filter((stand) => !transparent(getComputedStyle(stand).backgroundColor))).toEqual([]);
  });

  it.each(WINDOWS)("leaves as much room under the buttons as above the names, and cuts nothing off, in a %i by %i window", async (width, height) => {
    openWindow(width, height);
    const { hall, stands } = await openMuseum(language, theme);

    // jsdom lays nothing out, so the hall is laid out here as app.css
    // gives it: the room the screen leaves under its bar, as tall as its
    // HOME button, in rows of three stands sharing its height.
    const page = styleOf(".skeleton-screen");
    const bar = px(getComputedStyle(screen.getByRole("button", { name: TEXTS[language].home })).height);
    const style = getComputedStyle(hall);
    expect([px(style.paddingBottom), style.flexWrap, style.minHeight]).toEqual([px(style.paddingTop), "wrap", "0px"]);
    expect(px(style.paddingTop)).toBeGreaterThan(0);
    const inside = height - px(page.paddingTop) - px(page.paddingBottom) - bar - rowGapOf(page) - px(style.paddingTop) - px(style.paddingBottom);
    const rows = Math.ceil(stands.length / 3);
    const row = (inside - rowGapOf(style) * (rows - 1)) / rows;
    expect([rows, stands.length - 3]).toEqual([2, 2]);
    for (const stand of stands) {
      const standStyle = getComputedStyle(stand);
      const [top, exhibit, button] = [...stand.children].map((part) => getComputedStyle(part));
      if (!top || !exhibit || !button) throw new Error("A stand lacks its parts");
      expect([exhibit.flexGrow, exhibit.minHeight, button.flexShrink]).toEqual(["1", "0px", "0"]);
      const needed = px(top.minHeight) + px(button.height) + rowGapOf(standStyle) * 2 + EXHIBIT;
      expect(needed).toBeLessThanOrEqual(row);
    }
  });

  it("rings the exhibit and button of the stand awaiting its skeleton in amber, inside their edges", async () => {
    const { stands } = await openMuseum(language, theme);

    const rebuilding = stands.find((stand) => stand.getAttribute("data-state") === "rebuilding");
    if (!rebuilding) throw new Error("No stand awaits its skeleton");
    const rings = [rebuilding.querySelector(".skeleton-exhibit"), within(rebuilding).getByRole("button")].map((part) => getComputedStyle(part ?? rebuilding));
    // jsdom keeps an outline as it is written, unexpanded: its width, its
    // style and its colour, which a later colour of its own replaces.
    const drawn = rings.map((ring) => {
      const [width = "", style, color = ""] = ring.outline.split(" ");
      return [style, sameColour(transparent(ring.outlineColor) ? color : ring.outlineColor, PALETTE[theme].amber ?? ""), px(ring.outlineOffset) + px(width) / 2 <= 0];
    });
    expect(drawn).toEqual([
      ["dashed", true, true],
      ["dashed", true, true]
    ]);
  });
});
