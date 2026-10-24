import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import type { AgeLevelSetting } from "../src/ageLevel.ts";
import { App, type PortraitLayouts, type Viewport } from "../src/App.tsx";
import { compareResultGeometry, compareResultType, compareResultWidth, NARROW_RESULT, PORTRAIT_RESULT, type ResultSizes } from "../src/compareResultLayout.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { correctOf } from "../src/quiz/round.ts";
import type { ProgressStore } from "../src/quizGame.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptySkeletons, emptySorting, fakeBodyPicture, featuring, gameDoor,
  lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom,
  shownQuestion, unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// compare-dinosaurs-result-portrait.feature. The turn between the layouts
// is compareResultTurn.test.tsx's; the words' fit compareResultFit's.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"] };

// "The result stands upright": each window, its dinosaur's height and
// whether the screen scrolls.
const WINDOWS = [
  [600, 800, 200, true],
  [744, 1133, 431, false],
  [768, 1024, 338, false],
  [820, 1180, 471, false],
  [1024, 1366, 480, false]
] as const;

// An earlier best of 7 at every level, so a round won whole is a new best
// over it, celebrated.
const EARLIER_BEST: ProgressStore = {
  load: () => ({ progress: { best: { hatchling: 7, explorer: 7, paleontologist: 7 }, roundsPlayed: 3 }, levelChoice: undefined }),
  save: () => {}
};

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });

async function openResult(size: WindowSize, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), ageLevel, layouts = PORTRAIT_LAYOUTS
}: { language?: Language; insets?: SafeArea; viewport?: Viewport; ageLevel?: AgeLevelSetting; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const user = userEvent.setup();
  render(<App
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={layouts}
    viewport={viewport}
    progress={EARLIER_BEST}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...(ageLevel ? { ageLevelStore: { load: () => ageLevel, save: () => {} } } : {})}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
  />);
  const text = TEXTS[language];
  await user.click(gameDoor(text.quizCard));
  // Every question answered right, to the result.
  while (screen.queryByRole("group", { name: text.creatures })) {
    const right = correctOf(shownQuestion(language));
    await user.click(within(screen.getByRole("group", { name: text.creatures })).getByRole("button", { name: right.name[language] }));
    await user.click(screen.queryByRole("button", { name: text.next }) ?? screen.getByRole("button", { name: text.seeResult }));
  }
  return { user, viewport };
}

// The sizes the screen gives the stylesheet, as its custom properties.
const shownType = () => {
  const { style } = part(".result");
  return { star: style.getPropertyValue("--star-size"), levelName: style.getPropertyValue("--level-name-size"), heroMaximum: style.getPropertyValue("--hero-maximum") };
};
const px = (size: number) => `${size}px`;
const typeOf = (width: number, sizes: ResultSizes = PORTRAIT_RESULT) => {
  const type = compareResultType(width, sizes);
  return { star: px(type.star), levelName: px(type.levelName), heroMaximum: px(type.heroMaximum) };
};

// The CSS contracts under which the geometry's sums hold. jsdom does not
// lay out boxes, so every structural assumption is checked here, and the
// column the geometry stacks is summed from the stylesheet.
function uprightRules(size: WindowSize, width: number, sizes: ResultSizes = PORTRAIT_RESULT) {
  const at = (selector: string) => styleAt(part(selector), size);
  const result = at(".result");
  expect([...part(".result").children].map((element) => element.className)).toEqual(["festivity", "stratum result-stratum", "picture result-hero", "result-content"]);
  expect([result.value("display"), result.value("flex-direction"), result.value("align-items"), result.value("justify-content"), result.rowGap()]).toEqual(["flex", "column", "center", "center", sizes.heroGap]);
  expect([result.px("padding-top"), result.px("padding-bottom"), result.px("padding-left"), result.px("padding-right"), result.value("box-sizing")]).toEqual([sizes.padding, sizes.padding, sizes.padding, sizes.padding, "border-box"]);
  expect([result.px("min-height"), result.value("height"), result.value("overflow")]).toEqual([size[1], "auto", "hidden"]);
  // The sizes for the window, as the geometry gives them.
  expect(shownType()).toEqual(typeOf(width, sizes));
  const type = compareResultType(width, sizes);
  const hero = at(".result-hero");
  expect([hero.value("flex-grow"), hero.value("flex-shrink"), hero.value("flex-basis"), hero.value("align-self"), hero.value("object-fit")]).toEqual(["1", "0", "0px", "stretch", "contain"]);
  expect([hero.px("min-height"), hero.px("max-height")]).toEqual([sizes.heroMinimum, type.heroMaximum]);
  const content = at(".result-content");
  expect([...part(".result-content").children].map((element) => element.className)).toEqual(["celebration", "result-score", "result-stars", "result-title", "best-score", "level-switch", "result-actions"]);
  expect([content.value("display"), content.value("flex-direction"), content.value("align-items"), content.value("align-self"), content.rowGap()]).toEqual(["flex", "column", "center", "stretch", sizes.gap]);
  // The score's share of the window's height, as jsdom resolves it.
  const score = at(".result-score-value").px("font-size");
  expect(score).toBeCloseTo(compareResultGeometry(size[0], size[1], 0, 0, 0, sizes).score, 6);
  expect(at(".result-score").value("line-height")).toBe("1");
  const stars = at(".result-stars");
  expect([stars.px("font-size"), stars.value("line-height"), stars.columnGap()]).toEqual([type.star, "1", sizes.starGap]);
  const title = at(".result-title");
  const levelSwitch = at(".level-switch");
  expect([levelSwitch.value("width"), levelSwitch.px("max-width"), levelSwitch.value("align-self"), levelSwitch.value("border-top-style"), levelSwitch.value("box-sizing")]).toEqual(["100%", sizes.switchMaximum, "center", "none", "border-box"]);
  expect([levelSwitch.px("padding-top"), levelSwitch.px("padding-bottom"), levelSwitch.px("padding-left"), levelSwitch.columnGap()]).toEqual([sizes.switchPadding, sizes.switchPadding, sizes.switchPadding, sizes.switchGap]);
  // The mark covers a level: a third of what the padding and the gaps
  // leave of the switch, which has no border to take more.
  const mark = at(".level-switch-mark");
  const [, taken = ""] = /\(100% - ([\d.]+)px\)/.exec(mark.value("width")) ?? [];
  expect([mark.px("top"), mark.px("bottom"), mark.px("left"), Number(taken)]).toEqual([sizes.switchPadding, sizes.switchPadding, sizes.switchPadding, 2 * sizes.switchPadding + 2 * sizes.switchGap]);
  for (const level of document.querySelectorAll(".level-switch-level")) {
    const own = styleAt(level, size);
    expect([own.px("height"), own.value("flex-direction"), own.value("align-items"), own.px("font-size"), own.px("letter-spacing"), own.px("padding-left")]).toEqual([
      sizes.level, "column", "center", type.levelName, sizes.levelLetterSpacing, sizes.levelSidePadding
    ]);
  }
  const actions = at(".result-actions");
  const buttons = [...part(".result-actions").children].map((button) => styleAt(button, size).px("height"));
  const button = sizes === NARROW_RESULT ? 64 : 72;
  expect(new Set(buttons)).toEqual(new Set([button]));
  // Side by side, or in a tall-narrow window one above the other.
  const stacked = actions.value("flex-direction") === "column";
  expect(stacked).toBe(sizes === NARROW_RESULT);
  const actionsHeight = stacked ? buttons.length * button + (buttons.length - 1) * actions.rowGap() : button;
  const column = at(".celebration").px("height") + score + stars.px("font-size") + title.px("font-size") * Number(title.value("line-height"))
    + at(".best-score").px("height") + levelSwitch.px("padding-top") + levelSwitch.px("padding-bottom") + sizes.level
    + actions.px("padding-top") + actionsHeight + 6 * content.rowGap();
  expect(column).toBeCloseTo(compareResultGeometry(size[0], size[1], 0, 0, size[0] - 2 * sizes.padding - width, sizes).column, 6);
  expect(result.px("padding-top") + result.px("padding-bottom") + result.rowGap()).toBe(2 * sizes.padding + sizes.heroGap);
}

describe("the compare quiz's result upright", () => {
  it.each(WINDOWS)("stands upright at %i by %i, its dinosaur %i tall, scrolling %s", async (width, height, dinosaur, scrolls) => {
    await openResult([width, height]);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label })).toBeDefined();
    expect([screen.getByLabelText(TEXTS.en.score).textContent, screen.getByLabelText(TEXTS.en.bestScore).textContent]).toEqual(["10/10", `${TEXTS.en.best}710`]);
    const geometry = compareResultGeometry(width, height, 0, 0);
    expect(Math.abs(geometry.hero.height - dinosaur)).toBeLessThanOrEqual(4);
    expect(geometry.scrolls).toBe(scrolls);
    uprightRules([width, height], compareResultWidth(width, 0, 0));
  });

  it.each([
    ["en", 0], ["ru", 0], ["en", 16], ["ru", 16]
  ] as const)("gives the result in %s its sizes at 600 by 1000 with a %i-pixel scrollbar, the stars at least 44 and the names at least 14", async (language, scrollbar) => {
    const viewport = { ...manualViewport("portrait"), scrollbarWidth: () => scrollbar };
    await openResult([600, 1000], { language, viewport });
    const width = compareResultWidth(600, 0, 0, scrollbar);
    expect(shownType()).toEqual(typeOf(width));
    expect(compareResultType(width).star).toBeGreaterThanOrEqual(44);
    expect(compareResultType(width).levelName).toBeGreaterThanOrEqual(14);
    expect(gateShown()).toBe(false);
    uprightRules([600, 1000], width);
  });

  it("takes the side insets from the viewport for the sizes", async () => {
    await openResult([744, 1133], { insets: { top: 0, right: 13, bottom: 0, left: 19 } });
    expect(shownType()).toEqual(typeOf(648));
  });

  it("slides the mark to EXPLORER as in landscape, the round's stars and score staying", async () => {
    const { user } = await openResult([820, 1180], { ageLevel: { level: "hatchling", revision: "picked" } });
    const stars = screen.getByRole("img", { name: TEXTS.en.stars(10, 10) });
    const score = screen.getByLabelText(TEXTS.en.score);
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, levelSwitch().style.getPropertyValue("--chosen")]).toEqual(["🥚HATCHLING", "0"]);
    await user.click(within(levelSwitch()).getByRole("button", { name: TEXTS.en.ageLevels.explorer.name }));
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, levelSwitch().style.getPropertyValue("--chosen")]).toEqual(["🦖EXPLORER", "1"]);
    expect(getComputedStyle(part(".level-switch-mark")).transition).toBe("translate var(--motion-standard) var(--ease-out)");
    expect(getComputedStyle(part(".level-switch-mark")).translate).toBe("calc(var(--chosen) * (100% + 4px)) 0");
    expect([screen.getByRole("img", { name: TEXTS.en.stars(10, 10) }), screen.getByLabelText(TEXTS.en.score)]).toEqual([stars, score]);
    expect([score.textContent, stars.querySelectorAll(".star-won").length, gateShown()]).toEqual(["10/10", 10, false]);
    uprightRules([820, 1180], 756);
  });

  it("fades the picture asking to turn over the result as a tall window narrows", async () => {
    const viewport = manualViewport("portrait");
    await openResult([820, 1180], { viewport });
    const result = part(".result");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect([part(".result"), screen.getByLabelText(TEXTS.en.score).textContent]).toEqual([result, "10/10"]);
  });

  it("keeps the landscape result as it was", async () => {
    await openResult([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const style = (selector: string) => getComputedStyle(part(selector));
    expect([style(".result").display, style(".result").height, style(".result").gridTemplateColumns, style(".result").padding]).toEqual(["grid", "820px", "minmax(0, 1fr) minmax(0, 648px)", "32px"]);
    expect([style(".result-hero").flexGrow || "0", style(".result-hero").maxHeight, style(".result-content").gap]).toEqual(["0", "480px", "16px"]);
    expect([style(".result-stars").fontSize, style(".result-score-value").fontSize]).toEqual(["48px", "164px"]);
    expect([style(".level-switch").borderTopWidth, style(".level-switch").width || "auto", style(".level-switch-level").height, style(".level-switch-level").fontSize, style(".level-switch-level").flexDirection || "row"]).toEqual(["1px", "auto", "58px", "16px", "row"]);
  });

  it("puts the dinosaur below the top inset and the actions above the home indicator, the background to the edges", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openResult([744, 1133], { insets });
    const result = getComputedStyle(part(".result"));
    expect([result.paddingTop, result.paddingRight, result.paddingBottom, result.paddingLeft]).toEqual(["56px", "45px", "52px", "51px"]);
    expect([result.boxSizing, result.minHeight, result.height, result.backgroundColor]).toEqual(["border-box", "1133px", "auto", "rgb(31, 43, 77)"]);
    expect(part(".result-hero").previousElementSibling).toBe(part(".result-stratum"));
    expect([part(".result-content").lastElementChild, part(".result-content")]).toEqual([part(".result-actions"), part(".result").lastElementChild]);
    expect(getComputedStyle(document.body).margin).toBe("0px");
    expect(gateShown()).toBe(false);
  });
});

// compare-dinosaurs-result-narrow-portrait.feature: an iPhone upright.
const NARROW_LAYOUTS: PortraitLayouts = { ...PORTRAIT_LAYOUTS, home: ["tall", "tall-narrow"], "compare-question": ["tall", "tall-narrow"], "compare-result": ["tall", "tall-narrow"] };
const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

// Each phone's window, its dinosaur's height and whether the screen scrolls.
const PHONES = [
  [320, 568, 120, true],
  [375, 667, 120, true],
  [393, 759, 143, false],
  [393, 852, 225, false],
  [430, 932, 292, false]
] as const;

describe("the compare quiz's result in a tall-narrow window", () => {
  it.each(PHONES)("stands upright at %i by %i, its dinosaur %i tall, scrolling %s", async (width, height, dinosaur, scrolls) => {
    await openResult([width, height], { viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const geometry = compareResultGeometry(width, height, 0, 0, 0, NARROW_RESULT);
    expect(Math.abs(geometry.hero.height - dinosaur)).toBeLessThanOrEqual(1);
    expect(geometry.scrolls).toBe(scrolls);
    uprightRules([width, height], compareResultWidth(width, 0, 0, 0, NARROW_RESULT), NARROW_RESULT);
  });

  it("shows each level as its picture alone, its name still read out, the chosen level marked", async () => {
    await openResult([393, 852], { viewport: narrowViewport(), layouts: NARROW_LAYOUTS, ageLevel: { level: "hatchling", revision: "picked" } });
    for (const level of within(levelSwitch()).getAllByRole("button")) {
      expect(styleAt(part(".level-switch-name", level), [393, 852]).value("position")).toBe("absolute");
      expect(styleAt(level, [393, 852]).px("height")).toBe(PORTRAIT_RESULT.level);
    }
    expect(within(levelSwitch()).getByRole("button", { pressed: true, name: TEXTS.en.ageLevels.hatchling.name })).toBeDefined();
  });
});
