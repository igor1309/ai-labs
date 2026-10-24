import { screen, within } from "@testing-library/react";
import { expect } from "vitest";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { styleAt, type WindowSize } from "./windowSizes.ts";

// jsdom has no layout engine. Check the flex rules and sum the fixed
// targets and gaps, including HOME, so a clipped or scrolling row fails.
export function expectCompactControls(size: WindowSize, language: Language = "en") {
  const group = screen.getByRole("group", { name: TEXTS[language].foodChoice });
  const bar = group.parentElement!;
  const home = screen.getByRole("button", { name: TEXTS[language].home });
  const chips = within(group).getAllByRole("button");
  const at = (element: Element) => styleAt(element, size);
  for (const row of [bar, group]) {
    expect([at(row).value("display"), at(row).value("flex-direction"), at(row).value("flex-wrap")]).toEqual(["flex", "row", "nowrap"]);
    expect([at(row).value("overflow-x"), at(row).px("margin-left"), at(row).px("margin-right")]).toEqual(["visible", 0, 0]);
  }
  expect([...bar.children]).toEqual([home, group]);
  expect([...group.children].map((row) => at(row).value("display"))).toEqual(["contents", "contents"]);
  expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([TEXTS[language].everyFood, ...(["meat", "plants", "both"] as const).map((food) => TEXTS[language].diets[food])]);
  expect(chips).toHaveLength(4);
  let chipsWidth = at(group).columnGap() * (chips.length - 1);
  for (const chip of chips) {
    const face = chip.querySelector(".food-chip-face")!;
    const symbols = chip.querySelector(".food-chip-symbols")!;
    const width = at(face).px("width");
    const height = at(chip).px("height");
    expect([width >= 44, height >= 44, at(chip).value("flex-shrink")]).toEqual([true, true, "0"]);
    expect([at(face).px("padding-left"), at(face).px("padding-right"), at(face).value("justify-content")]).toEqual([0, 0, "center"]);
    expect([at(chip).value("width"), at(chip).value("max-width")]).toEqual([document.documentElement.dataset.size === "tall-narrow" ? "48px" : "auto", "none"]);
    expect(at(symbols).value("display")).toBe("flex");
    const icons = [...symbols.querySelectorAll("svg")];
    expect(icons.length).toBe(chip.getAttribute("data-food") === "both" ? 2 : 1);
    const symbolsWidth = icons.reduce((sum, icon) => sum + Number(icon.getAttribute("width")), 0) + at(symbols).columnGap() * (icons.length - 1);
    expect(symbolsWidth).toBeLessThanOrEqual(width);
    expect(chip.querySelector(".food-chip-face")?.children.length).toBe(chip.getAttribute("data-food") === "all" ? 1 : 3);
    for (const label of chip.querySelectorAll(".food-chip-word, .food-chip-count")) expect(at(label).value("display")).toBe("none");
    chipsWidth += width;
  }
  let homeWidth: number;
  if (document.documentElement.dataset.size === "tall-narrow") {
    expect(at(home.querySelector(".catalogue-home-word")!).value("display")).toBe("none");
    expect([at(home).px("width"), at(home).px("height"), at(home).value("flex-shrink")]).toEqual([48, 48, "0"]);
    homeWidth = at(home).px("width");
  } else {
    const word = home.querySelector(".catalogue-home-word")!;
    expect(at(word).value("display")).not.toBe("none");
    // Reserve one em per localized glyph as a conservative text budget;
    // jsdom cannot measure the rendered font or its fallback.
    const textWidth = [...TEXTS[language].home].length * (at(word).px("font-size") + Math.max(0, at(word).px("letter-spacing")));
    const icon = home.querySelector("svg")!;
    homeWidth = Number(icon.getAttribute("width")) + at(home).columnGap() + textWidth + at(home).px("padding-left") + at(home).px("padding-right");
  }
  const main = at(bar.parentElement!);
  const available = size[0] - main.px("padding-left") - main.px("padding-right") - at(bar).px("padding-left") - at(bar).px("padding-right");
  expect(homeWidth + at(bar).columnGap() + chipsWidth).toBeLessThanOrEqual(available);
  return { chipsWidth, height: at(chips[0]!).px("height") };
}
