import { render } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { WhoseJawWelcomeScreen } from "../src/WhoseJawWelcomeScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { withManualPictures } from "./pictures.tsx";
import { manualPictures } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

const PORTRAITS = [[390, 844, "tall-narrow"], [820, 1180, "tall"]] as const;
const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const style = (selector: string, size: WindowSize) => styleAt(part(selector), size);

function show(size: WindowSize, layout: string, language: "en" | "ru", best: number | null, theme = "light") {
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
  render(<WhoseJawWelcomeScreen language={language} level="explorer" best={best} collected={16} total={16}
    jawPicture="jaw.webp" gummyPicture="gummy.webp" onLevel={() => {}} onPlay={() => {}} onShelf={() => {}} onHome={() => {}} />,
  withManualPictures(manualPictures()));
}

describe("Whose Jaw welcome portrait balance", () => {
  it.each(PORTRAITS.flatMap(([width, height, layout]) => (["en", "ru"] as const).flatMap((language) =>
    [null, 10].map((best) => ({ size: [width, height] as WindowSize, layout, language, best }))
  )))("fits a bounded hero and compact actions in $language at $size with best $best", ({ size, layout, language, best }) => {
    show(size, layout, language, best);
    const page = style(".whose-jaw-welcome", size);
    const body = style(".whose-jaw-welcome-body", size);
    expect([page.value("display"), page.value("flex-direction")]).toEqual(["flex", "column"]);
    expect([body.px("min-height"), body.value("grid-template-columns"), body.value("align-content")]).toEqual([0, "minmax(0, 1fr)", "center"]);
    expect(body.rowGap()).toBe(16);
    const hero = style(".whose-jaw-hero", size);
    expect([hero.value("width"), hero.value("aspect-ratio")]).toEqual(["min(100%, 400px)", "4 / 3"]);
    const jaw = style(".whose-jaw-chomp", size);
    expect([jaw.value("position"), jaw.px("bottom"), jaw.px("right"), jaw.value("margin")]).toEqual(["absolute", 0, 0, "0px"]);
    expect(style(".whose-jaw-gummy", size).value("width")).toBe("88%");
    const start = style(".whose-jaw-start", size);
    expect(start.value("text-align")).toBe("center");
    const title = style(".whose-jaw-start h1", size);
    expect(title.px("font-size")).toBeGreaterThanOrEqual(32);
    expect(part("h1").textContent).toContain(TEXTS[language].whoseJaw);
    expect(part("h1").textContent).toBe(part("h1").textContent!.toLocaleUpperCase(language));
    const badges = style(".whose-jaw-badges", size);
    expect(badges.value("justify-content")).toBe("center");
    expect(part(".whose-jaw-badges").children).toHaveLength(best === null ? 1 : 2);
    const level = style(".whose-jaw-start .level-switch-level", size);
    expect(level.px("height")).toBe(56);
    const play = style(".whose-jaw-play", size);
    const shelf = style(".whose-jaw-shelf", size);
    expect(play.px("min-height")).toBeGreaterThan(shelf.px("min-height"));
    expect(play.px("font-size")).toBeGreaterThan(shelf.px("font-size"));
    expect(shelf.px("min-height")).toBeGreaterThanOrEqual(48);

    // jsdom has no layout: budget the reserved hero, two title lines,
    // one badge row and the controls from their stylesheet sizes.
    const width = Math.min(size[0] - page.px("padding-left") - page.px("padding-right"), body.px("max-width"));
    const heroHeight = Math.min(width, 400) * 3 / 4;
    const badge = style(".whose-jaw-badges p", size);
    const badgeHeight = badge.px("font-size") * 1.5 + badge.px("padding-top") + badge.px("padding-bottom");
    const switcher = style(".level-switch", size);
    const switchHeight = level.px("height") + 2 * (switcher.px("padding-top") + switcher.px("border-top-width"));
    const controlsHeight = 2 * title.px("font-size") * title.px("line-height") + badgeHeight + switchHeight + play.px("min-height") + shelf.px("min-height") + 4 * start.rowGap();
    const total = page.px("padding-top") + page.px("padding-bottom") + style(".home-button", size).px("height") + page.rowGap() + heroHeight + body.rowGap() + controlsHeight;
    expect(total).toBeLessThanOrEqual(size[1]);
    expect(style(".whose-jaw-play svg", size).px("width") + TEXTS[language].play.length * play.px("font-size") + 2 * play.px("padding-left") + play.columnGap()).toBeLessThan(width);
    expect(style(".whose-jaw-shelf svg", size).px("width") + TEXTS[language].jawShelf.length * shelf.px("font-size") + 2 * shelf.px("padding-left") + shelf.columnGap()).toBeLessThan(width);
  });

  it.each(PORTRAITS)("keeps dark controls distinct at %i by %i", (width, height, layout) => {
    const size = [width, height] as const;
    show(size, layout, "ru", 10, "dark");
    expect(style(".whose-jaw-welcome", size).value("background-color")).toBe("rgb(15, 19, 32)");
    expect(style(".whose-jaw-play", size).value("background-color")).toBe("rgb(242, 178, 75)");
    expect(style(".whose-jaw-shelf", size).value("background-color")).toBe("rgb(24, 30, 46)");
    expect(style(".whose-jaw-shelf", size).value("color")).toBe("rgb(236, 232, 222)");
  });

  it.each([[1180, 820, "wide"], [844, 390, "wide-short"]] as const)("preserves the landscape composition at %i by %i", (width, height, layout) => {
    const size = [width, height] as const;
    show(size, layout, "en", null);
    expect(style(".whose-jaw-welcome-body", size).value("grid-template-columns")).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(style(".whose-jaw-chomp", size).value("position")).toBe("relative");
    expect(style(".whose-jaw-start .level-switch-level", size).px("height")).toBe(64);
    expect(style(".whose-jaw-start", size).rowGap()).toBe(layout === "wide" ? 20 : 8);
    if (layout === "wide-short") {
      const hero = style(".whose-jaw-hero", size).px("width");
      const page = style(".whose-jaw-welcome", size);
      expect(hero + style(".home-button", size).px("height") + page.px("padding-top") + page.px("padding-bottom")).toBeLessThan(height);
    }
  });
});
