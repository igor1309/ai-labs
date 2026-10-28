import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { jawMouth } from "../src/jawPresentation.ts";
import { WhoseJawBoardScreen } from "../src/WhoseJawBoardScreen.tsx";
import { manualPictures } from "./support.ts";
import { withManualPictures } from "./pictures.tsx";
import { JAWS } from "./whoseJaw.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const style = (selector: string, size: WindowSize) => styleAt(part(selector), size);
const PORTRAITS = [[390, 844, "tall-narrow"], [820, 1180, "tall"]] as const;

function show(size: WindowSize, layout: string, level: AgeLevel, language: "en" | "ru" = "en", theme = "light") {
  openWindow(...size);
  const root = document.documentElement;
  const before = { size: root.dataset.size, theme: root.dataset.theme };
  Object.assign(root.dataset, { size: layout, theme });
  onTestFinished(() => {
    for (const key of ["size", "theme"] as const) {
      if (before[key] === undefined) delete root.dataset[key];
      else root.dataset[key] = before[key];
    }
  });
  const count = level === "hatchling" ? 2 : level === "explorer" ? 3 : 4;
  render(<WhoseJawBoardScreen language={language} phase="waiting"
    choices={JAWS.slice(0, count).map((jaw) => ({ id: jaw.id, name: jaw.name[language].toLocaleUpperCase(language), picture: `${jaw.id}.webp`, food: "food.webp", diet: jaw.diet, mouth: jawMouth(jaw.id) }))}
    jawPicture="jaw.webp" placed={[]} target={undefined} hint={undefined} jawDiet="meat"
    foodShown={level === "hatchling"} namesShown={level === "paleontologist"}
    feedback={{ words: JAWS.find(({ id }) => id === "edmontosaurus")!.fact[language], symbol: "🦷" }}
    onPlace={vi.fn()} onName={vi.fn()} onSlide={vi.fn()} onBack={vi.fn()} onHome={vi.fn()} />,
  withManualPictures(manualPictures()));
  return count;
}

describe("Whose Jaw portrait composition", () => {
  it.each(PORTRAITS.flatMap(([width, height, layout]) => AGE_LEVELS.flatMap((level) =>
    (["en", "ru"] as const).map((language) => ({ size: [width, height] as WindowSize, layout, level, language }))
  )))("keeps the $language $level cards together at $size", ({ size, layout, level, language }) => {
    const count = show(size, layout, level, language);
    const grid = style(".jaw-choices", size);
    expect(grid.value("grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect([grid.value("flex-grow"), grid.value("flex-shrink"), grid.value("align-items"), grid.value("align-content")]).toEqual(["0", "0", "stretch", "start"]);
    expect([grid.value("width"), grid.value("margin-top"), grid.rowGap()]).toEqual(["min(100%, 680px)", "auto", 12]);
    expect(document.querySelectorAll(".jaw-dinosaur")).toHaveLength(count);
    const card = style(".jaw-dinosaur", size);
    expect(card.value("box-sizing")).toBe("border-box");
    expect([card.px("padding-top"), card.px("border-top-width"), card.value("border-top-style")]).toEqual([6, 2, "solid"]);
    const art = style(".jaw-dinosaur-art", size);
    expect([art.value("width"), art.value("max-width")]).toEqual(["100%", "none"]);
    expect(style(".jaw-gummy", size).value("height")).toBe("auto");
    if (level === "paleontologist") {
      const name = style(".jaw-name", size);
      expect(name.px("font-size")).toBeGreaterThanOrEqual(16);
      expect(name.px("font-size")).toBeLessThanOrEqual(22);
      expect(name.value("line-height")).toBe("1.2");
      expect(name.px("min-height")).toBeCloseTo(2.4 * name.px("font-size"));
      expect([...document.querySelectorAll(".jaw-name")].every((name) => name.textContent === name.textContent?.toLocaleUpperCase(language))).toBe(true);
    }
    const feedback = style(".jaw-feedback", size);
    const words = style(".jaw-feedback p", size);
    expect([words.value("box-sizing"), words.value("max-width")]).toEqual(["border-box", "100%"]);
    expect([feedback.px("min-height"), words.px("padding-top"), words.value("line-height")]).toEqual([48, 8, "1.25"]);
    expect(words.px("font-size")).toBeGreaterThanOrEqual(16);
    expect(words.px("font-size")).toBeLessThanOrEqual(20);
    const tray = style(".jaw-tray", size);
    expect(tray.value("box-sizing")).toBe("border-box");
    expect([tray.px("min-height"), tray.value("flex-shrink"), tray.value("margin-bottom"), tray.value("width")]).toEqual([0, "0", "auto", "min(100%, 440px)"]);
    const looseWidth = style(".jaw-loose", size).px("width");
    expect(looseWidth).toBeGreaterThanOrEqual(160);
    expect(looseWidth).toBeLessThanOrEqual(184);

    // jsdom has no layout. The budget uses the stylesheet's card frame,
    // the full 4:3 canvas, two lines for names and three for feedback.
    const page = style(".whose-jaw-board", size);
    const across = Math.min(size[0] - page.px("padding-left") - page.px("padding-right"), 680);
    const cardWidth = (across - grid.columnGap()) / 2;
    const artWidth = cardWidth - 2 * (card.px("padding-left") + card.px("border-left-width"));
    const nameHeight = level === "paleontologist" ? style(".jaw-name", size).px("min-height") + style(".jaw-name", size).px("margin-top") : 0;
    const cardHeight = artWidth * .75 + 2 * (card.px("padding-top") + card.px("border-top-width")) + nameHeight;
    const rows = Math.ceil(count / 2);
    const gridHeight = rows * cardHeight + (rows - 1) * grid.rowGap();
    const trayHeight = looseWidth * .75 + 2 * (tray.px("padding-top") + tray.px("border-top-width"));
    const feedbackHeight = Math.max(feedback.px("min-height"), 3 * words.px("font-size") * 1.25 + 2 * words.px("padding-top"));
    expect(style(".jaw-board-title", size).value("line-height")).toBe("1.2");
    const titleHeight = style(".jaw-board-title", size).px("font-size") * 1.2;
    const total = page.px("padding-top") + page.px("padding-bottom") + 56 + titleHeight + gridHeight + feedbackHeight + trayHeight + 4 * page.rowGap();
    expect(artWidth).toBeGreaterThanOrEqual(size[0] < 600 ? 150 : 300);
    expect(trayHeight).toBeLessThanOrEqual(160);
    expect(total).toBeLessThanOrEqual(size[1]);
  });

  it.each(PORTRAITS)("keeps a visible frame and pickup highlight in dark theme at %i by %i", (width, height, layout) => {
    const size = [width, height] as const;
    show(size, layout, "paleontologist", "en", "dark");
    expect(style(".jaw-dinosaur", size).value("background-color")).toBe("rgb(24, 30, 46)");
    expect(style(".jaw-dinosaur", size).value("border-top-color")).toBe("rgb(71, 81, 106)");
    expect(style(".jaw-tray", size).value("background-color")).toBe("rgb(24, 30, 46)");
    expect(style(".jaw-tray", size).value("border-top-style")).toBe("dashed");
    fireEvent.click(part(".jaw-loose"));
    expect(style(".jaw-dinosaur", size).value("border-top-color")).toBe("rgb(227, 155, 45)");
    expect(style(".jaw-dinosaur", size).value("background-color")).toBe("rgba(227, 155, 45, 0.19)");
  });

  it.each(AGE_LEVELS)("keeps the %s landscape board at 1180 by 820", (level) => {
    const size = [1180, 820] as const;
    show(size, "wide", level);
    expect(style(".jaw-choices", size).value("grid-template-columns")).toBe("repeat(var(--choices), minmax(0, 1fr))");
    expect(style(".jaw-choices", size).value("flex-grow")).toBe("1");
    expect(style(".jaw-dinosaur", size).px("border-top-width")).toBe(0);
    expect(style(".jaw-tray", size).px("min-height")).toBe(150);
  });
});
