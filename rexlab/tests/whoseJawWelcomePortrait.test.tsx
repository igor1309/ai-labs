import { GameAudioButton } from "../src/GameAudioButton.tsx";
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
  render(<WhoseJawWelcomeScreen audioControl={<GameAudioButton language={language} muted={false} onToggle={() => {}} />} language={language} level="explorer" best={best} collected={16} total={16}
    jawPicture="jaw.webp" gummyPicture="gummy.webp" onLevel={() => {}} onPlay={() => {}} onShelf={() => {}} onHome={() => {}} />,
  withManualPictures(manualPictures()));
}

describe("Whose Jaw welcome portrait balance", () => {
  it.each(PORTRAITS.flatMap(([width, height, layout]) => (["en", "ru"] as const).flatMap((language) =>
    [null, 10].map((best) => ({ size: [width, height] as WindowSize, layout, language, best }))
  )))("fits dominant artwork and compact actions in $language at $size with best $best", ({ size, layout, language, best }) => {
    show(size, layout, language, best);
    const page = style(".whose-jaw-welcome", size);
    expect(style(".whose-jaw-welcome header", size).value("justify-content")).toBe("space-between");
    if (size[0] < 600) {
      expect(style(".whose-jaw-welcome header > .home-button:first-child", size).px("width")).toBe(48);
      expect(style(".whose-jaw-welcome header > .home-button:first-child span", size).value("display")).toBe("none");
    }
    expect(part(".game-audio-button").getAttribute("aria-label")).toBe(TEXTS[language].gameAudio.mute);
    const body = style(".whose-jaw-welcome-body", size);
    expect([page.value("display"), page.value("flex-direction")]).toEqual(["flex", "column"]);
    expect([body.px("min-height"), body.value("grid-template-columns"), body.value("align-content")]).toEqual([0, "minmax(0, 1fr)", "center"]);
    expect(body.rowGap()).toBeGreaterThanOrEqual(20);
    const hero = style(".whose-jaw-hero", size);
    expect([hero.value("width"), hero.value("aspect-ratio")]).toEqual(["100%", "4 / 3"]);
    const jaw = style(".whose-jaw-chomp", size);
    expect([jaw.value("position"), jaw.px("bottom"), jaw.px("right"), jaw.value("margin")]).toEqual(["absolute", 0, 0, "0px"]);
    expect(style(".whose-jaw-gummy", size).value("width")).toBe("100%");
    expect(jaw.value("width")).toBe("44%");
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
    // Both actions keep their content width; artwork owns the spare space.
    // The actions may share a row or wrap, with the same touch target.
    const actions = style(".whose-jaw-welcome-actions", size);
    expect([actions.value("display"), actions.value("flex-wrap"), actions.value("justify-content")]).toEqual(["flex", "wrap", "center"]);
    expect(actions.rowGap()).toBeGreaterThanOrEqual(16);
    expect(start.rowGap()).toBeGreaterThanOrEqual(16);
    for (const action of [play, shelf]) {
      expect(action.value("width")).toBe("max-content");
      expect(action.value("flex-grow")).toBe("0");
      expect(action.value("max-width")).toBe("100%");
      expect(action.px("min-height")).toBeGreaterThanOrEqual(48);
      expect(action.px("font-size")).toBeGreaterThanOrEqual(20);
    }

    // jsdom has no layout: budget the reserved hero, two title lines,
    // one badge row and the controls from their stylesheet sizes.
    const width = Math.min(size[0] - page.px("padding-left") - page.px("padding-right"), body.px("max-width"));
    const heroHeight = width * 3 / 4;
    expect(width).toBeGreaterThanOrEqual(size[0] < 600 ? 350 : 550);
    const badge = style(".whose-jaw-badges p", size);
    const badgeHeight = badge.px("font-size") * 1.5 + badge.px("padding-top") + badge.px("padding-bottom");
    const switcher = style(".level-switch", size);
    const switchHeight = level.px("height") + 2 * (switcher.px("padding-top") + switcher.px("border-top-width"));
    const controlsHeight = 2 * title.px("font-size") * title.px("line-height") + badgeHeight + switchHeight + play.px("min-height") + shelf.px("min-height") + actions.rowGap() + 3 * start.rowGap();
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

  it.each(([[1180, 820, "wide"], [844, 390, "wide-short"]] as const).flatMap(([width, height, layout]) =>
    (["en", "ru"] as const).flatMap((language) => (["light", "dark"] as const).map((theme) => ({ size: [width, height] as WindowSize, layout, language, theme }))))
  )("fits landscape artwork and wrapping $language actions at $size in $theme", ({ size, layout, language, theme }) => {
    show(size, layout, language, 10, theme);
    const short = layout === "wide-short";
    const page = style(".whose-jaw-welcome", size);
    const body = style(".whose-jaw-welcome-body", size);
    expect(body.value("grid-template-columns")).toBe(short ? "minmax(0, 1fr) minmax(0, 1.4fr)" : "minmax(0, 1.25fr) minmax(0, 1fr)");
    const available = size[0] - page.px("padding-left") - page.px("padding-right") - body.columnGap();
    const heroWidth = short ? Math.min(available / 2.4, size[1] * .76) : available * 1.25 / 2.25;
    const controlWidth = short ? available * 1.4 / 2.4 : available / 2.25;
    expect(heroWidth).toBeGreaterThan(short ? 280 : 600);
    expect(style(".whose-jaw-hero", size).value("width")).toBe(short ? `min(100%, ${size[1] * .76}px)` : "100%");
    expect(style(".whose-jaw-gummy", size).value("width")).toBe("100%");
    expect(style(".whose-jaw-hero", size).value("aspect-ratio")).toBe("4 / 3");
    expect(style(".whose-jaw-chomp", size).value("position")).toBe("absolute");
    const start = style(".whose-jaw-start", size);
    const title = style(".whose-jaw-start h1", size);
    const badge = style(".whose-jaw-badges p", size);
    const switcher = style(".level-switch", size);
    const level = style(".whose-jaw-start .level-switch-level", size);
    expect(level.px("height")).toBeGreaterThanOrEqual(48);
    const actions = style(".whose-jaw-welcome-actions", size);
    expect([actions.value("display"), actions.value("flex-wrap"), actions.value("justify-content")]).toEqual(["flex", "wrap", "center"]);
    expect(actions.rowGap()).toBeGreaterThanOrEqual(16);
    const play = style(".whose-jaw-play", size);
    const shelf = style(".whose-jaw-shelf", size);
    for (const [selector, name, action] of [[".whose-jaw-play", TEXTS[language].play, play], [".whose-jaw-shelf", TEXTS[language].jawShelf, shelf]] as const) {
      expect(action.value("width")).toBe("max-content");
      expect(action.value("flex-grow")).toBe("0");
      expect(action.px("min-height")).toBeGreaterThanOrEqual(48);
      expect(style(`${selector} svg`, size).px("width") + name.length * action.px("font-size") + 2 * action.px("padding-left") + action.columnGap()).toBeLessThan(controlWidth);
    }
    // Budget two action rows even when both names fit side by side.
    // The short layout has room for one title line in either language.
    if (short) expect(part("h1").textContent!.length * title.px("font-size")).toBeLessThan(controlWidth);
    const controlsHeight = (short ? 1 : 2) * title.px("font-size") * title.px("line-height")
      + badge.px("font-size") * 1.5 + badge.px("padding-top") + badge.px("padding-bottom")
      + level.px("height") + 2 * (switcher.px("padding-top") + switcher.px("border-top-width"))
      + play.px("min-height") + shelf.px("min-height") + actions.rowGap() + 3 * start.rowGap();
    const header = style(".home-button", size).px("height");
    expect(page.px("padding-top") + page.px("padding-bottom") + header + page.rowGap() + Math.max(heroWidth * 3 / 4, controlsHeight)).toBeLessThanOrEqual(size[1]);
  });
});
