import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { UPRIGHT_LEVEL_SWITCH } from "../src/levelSwitchLayout.ts";
import { pairsWelcomeGeometry, pairsWelcomeType, pairsWelcomeWidth, PORTRAIT_WELCOME } from "../src/pairsWelcomeLayout.ts";
import { endWave, openPairsApp, pairsRecord, PICKED_HATCHLING, playBoard } from "./pairsApp.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// find-the-pair-welcome-portrait.feature. The turn between the layouts
// is pairsWelcomeTurn.test.tsx's; the words' fit pairsWelcomeFit's.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = {
  home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"]
};

// "The welcome stands upright": each window, its card's width and whether
// the screen scrolls.
const WINDOWS = [
  [600, 700, 120, true],
  [600, 800, 135, false],
  [744, 1133, 218, false],
  [768, 1024, 225, false],
  [820, 1180, 242, false],
  [1024, 1366, 280, false]
] as const;

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });
const classesOf = (element: Element) => [...element.children].map((child) => child.className);

// Find the pair opened at Hatchling on its climb's second level, five
// stars earned.
async function openWelcome(size: WindowSize, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets)
}: { language?: Language; insets?: SafeArea; viewport?: ManualViewport } = {}) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 5, level: 2, boardsOnLevel: 0, best: {}, found: [] }) });
  const app = openPairsApp({ storage, viewport, portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: DEVICES[language], ageLevel: PICKED_HATCHLING });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  return { ...app, viewport };
}

// The type the screen gives the stylesheet, as its custom properties.
const shownType = () => {
  const { style } = part(".pairs-welcome");
  return { title: style.getPropertyValue("--pairs-title-size"), levelName: style.getPropertyValue("--level-name-size") };
};
const typeOf = (width: number) => {
  const type = pairsWelcomeType(width);
  return { title: `${type.title}px`, levelName: `${type.levelName}px` };
};

// A card's width as the stylesheet gives it, jsdom having put the
// window's height in for the viewport's: at least its minimum, and at
// most its maximum, its share of the width and 3:4 of the height the
// window leaves less what the rest of the screen takes and the insets.
function cardRule(size: WindowSize) {
  const width = styleAt(part(".pairs-hero-card"), size).value("width");
  const rule = /^max\(([\d.]+)px, min\(([\d.]+)px, ([\d.]+)%, ([\d.]+) \* \(([\d.]+)px - \(([\d.]+)px \+ ([\d.]+)px \+ ([\d.]+)px\)\)\)\)$/.exec(width);
  if (!rule) throw new Error(`A card's width the test cannot read: ${width}`);
  const [minimum, maximum, share, ratio, height, taken, top, bottom] = rule.slice(1).map(Number) as [number, number, number, number, number, number, number, number];
  return { minimum, maximum, share, ratio, height, taken, top, bottom, at: (welcomeWidth: number) => Math.max(minimum, Math.min(maximum, (share / 100) * welcomeWidth, ratio * (height - taken - top - bottom))) };
}

// The CSS contracts under which the geometry's sums hold. jsdom does not
// lay out boxes, so every structural assumption is checked here, and what
// the cards' rule takes from the height is summed from the stylesheet.
function uprightRules(size: WindowSize, width: number) {
  const sizes = PORTRAIT_WELCOME;
  const at = (selector: string) => styleAt(part(selector), size);
  const welcome = at(".pairs-welcome");
  expect(classesOf(part(".pairs-welcome"))).toEqual(["stratum stratum-1", "pairs-welcome-bar", "pairs-welcome-body"]);
  expect([welcome.value("display"), welcome.value("flex-direction"), welcome.rowGap(), welcome.value("box-sizing")]).toEqual(["flex", "column", sizes.gap, "border-box"]);
  expect([welcome.px("padding-top"), welcome.px("padding-bottom"), welcome.px("padding-left"), welcome.px("padding-right")]).toEqual([sizes.topPadding, sizes.bottomPadding, sizes.sidePadding, sizes.sidePadding]);
  expect([welcome.px("min-height"), welcome.value("height"), welcome.value("overflow")]).toEqual([size[1], "auto", "hidden"]);
  // The type for the window, as the geometry gives it.
  expect(shownType()).toEqual(typeOf(width));
  const type = pairsWelcomeType(width);
  const bar = at(".home-button");
  const body = at(".pairs-welcome-body");
  expect(classesOf(part(".pairs-welcome-body"))).toEqual(["pairs-hero", "pairs-start"]);
  expect([body.value("flex-grow"), body.value("flex-shrink"), body.value("flex-basis"), body.value("display"), body.value("flex-direction"), body.value("justify-content"), body.value("align-items"), body.rowGap()]).toEqual([
    "1", "0", "auto", "flex", "column", "center", "center", sizes.cardsGap
  ]);
  const hero = at(".pairs-hero");
  expect([hero.value("flex-grow"), hero.value("flex-shrink"), hero.value("flex-basis"), hero.value("align-self"), hero.value("display"), hero.value("justify-content"), hero.value("align-items")]).toEqual([
    "0", "0", "auto", "stretch", "flex", "center", "center"
  ]);
  for (const card of document.querySelectorAll(".pairs-hero-card")) {
    const own = styleAt(card, size);
    expect([own.value("aspect-ratio"), own.value("max-height"), own.value("flex-shrink"), own.value("margin-top"), own.value("margin-bottom")]).toEqual(["3 / 4", "none", "0", "0px", "0px"]);
  }
  // The column under the cards: the width, at most 648, its parts
  // centred, three gaps apart.
  const start = at(".pairs-start");
  expect(classesOf(part(".pairs-start"))).toEqual(["pairs-title", "pairs-chips", "level-switch", "card pairs-play-button"]);
  expect([start.value("width"), start.px("max-width"), start.value("display"), start.value("flex-direction"), start.value("align-items"), start.rowGap()]).toEqual(["100%", sizes.columnMaximum, "flex", "column", "center", sizes.gap]);
  const title = at(".pairs-title");
  const mark = at(".pairs-mark");
  expect([title.value("display"), title.value("align-items"), title.value("flex-wrap"), title.value("white-space"), title.px("font-size"), title.columnGap()]).toEqual(["flex", "center", "nowrap", "nowrap", type.title, sizes.markGap]);
  expect([mark.px("width"), mark.px("height")]).toEqual([sizes.mark, sizes.mark]);
  // The title's line is no taller than its mark, so the row is the mark's.
  expect(type.title * Number(title.value("line-height"))).toBeLessThanOrEqual(sizes.mark);
  const chips = [...document.querySelectorAll(".pairs-chip")].map((chip) => styleAt(chip, size).px("height"));
  expect(new Set(chips)).toEqual(new Set([sizes.chips]));
  const levels = at(".level-switch");
  const switchSizes = UPRIGHT_LEVEL_SWITCH;
  expect([levels.value("width"), levels.px("max-width"), levels.value("align-self"), levels.value("border-top-style"), levels.value("box-sizing")]).toEqual(["100%", switchSizes.maximum, "center", "none", "border-box"]);
  expect([levels.px("padding-top"), levels.px("padding-bottom"), levels.px("padding-left"), levels.columnGap()]).toEqual([switchSizes.padding, switchSizes.padding, switchSizes.padding, switchSizes.gap]);
  for (const level of document.querySelectorAll(".level-switch-level")) {
    const own = styleAt(level, size);
    expect([own.px("height"), own.value("flex-direction"), own.value("align-items"), own.px("font-size"), own.px("letter-spacing"), own.px("padding-left")]).toEqual([
      switchSizes.level, "column", "center", type.levelName, switchSizes.letterSpacing, switchSizes.sidePadding
    ]);
  }
  const play = at(".pairs-play-button");
  expect(play.px("height")).toBe(sizes.play);
  // What the cards' rule takes from the height is the screen's padding,
  // the bar and its gap, the cards' gap and the column, as the stylesheet
  // sizes them, and the geometry's stack is that column.
  const stack = mark.px("height") + chips[0]! + levels.px("padding-top") + switchSizes.level + levels.px("padding-bottom") + play.px("height") + 3 * start.rowGap();
  const geometry = pairsWelcomeGeometry(size[0], size[1], 0, 0, size[0] - 2 * sizes.sidePadding - width);
  expect(stack).toBe(geometry.stack);
  const card = cardRule(size);
  expect(card.taken).toBe(welcome.px("padding-top") + welcome.px("padding-bottom") + bar.px("height") + welcome.rowGap() + body.rowGap() + stack);
  expect([card.minimum, card.maximum, card.share / 100, card.ratio, card.height]).toEqual([sizes.cardMinimum, sizes.cardMaximum, sizes.cardShare, sizes.cardRatio, size[1]]);
  expect(card.at(width)).toBeCloseTo(geometry.card.width, 6);
}

describe("find the pair's welcome upright", () => {
  it.each(WINDOWS)("stands upright at %i by %i, its cards %i wide, scrolling %s", async (width, height, card, scrolls) => {
    await openWelcome([width, height]);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(screen.queryByRole("img", { name: TEXTS.en.makeWindowWider })).toBeNull();
    expect([screen.getByRole("heading").textContent, screen.getByLabelText(TEXTS.en.level).textContent, screen.getByLabelText(TEXTS.en.starsEarned).textContent]).toEqual([TEXTS.en.pairs, "2", "5"]);
    const geometry = pairsWelcomeGeometry(width, height, 0, 0);
    expect(Math.abs(geometry.card.width - card)).toBeLessThanOrEqual(4);
    expect(geometry.scrolls).toBe(scrolls);
    // The screen scrolls by growing past the window, from its least.
    const content = 88 + 56 + 28 + geometry.card.height + 32 + geometry.stack;
    expect(content > height).toBe(scrolls);
    uprightRules([width, height], pairsWelcomeWidth(width, 0, 0));
  });

  it.each([
    ["en", 0], ["ru", 0], ["en", 16], ["ru", 16]
  ] as const)("gives the welcome in %s its type at 600 by 1000 with a %i-pixel scrollbar", async (language, scrollbar) => {
    const viewport = { ...manualViewport("portrait"), scrollbarWidth: () => scrollbar };
    await openWelcome([600, 1000], { language, viewport });
    const width = pairsWelcomeWidth(600, 0, 0, scrollbar);
    expect([shownType(), gateShown()]).toEqual([typeOf(width), false]);
    uprightRules([600, 1000], width);
  });

  it("takes the side insets from the viewport for the type", async () => {
    await openWelcome([744, 1133], { insets: { top: 0, right: 13, bottom: 0, left: 19 } });
    expect(shownType()).toEqual(typeOf(648));
  });

  it("slides the mark to EXPLORER as in landscape, and folds the climb level away beside the stars", async () => {
    const { user } = await openWelcome([820, 1180]);
    const climb = part(".pairs-climb");
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, levelSwitch().style.getPropertyValue("--chosen"), climb.hasAttribute("data-shown")]).toEqual(["🥚HATCHLING", "0", true]);
    await user.click(within(levelSwitch()).getByRole("button", { name: TEXTS.en.ageLevels.explorer.name }));
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, levelSwitch().style.getPropertyValue("--chosen")]).toEqual(["🦖EXPLORER", "1"]);
    expect(getComputedStyle(part(".level-switch-mark")).transition).toBe("translate var(--motion-standard) var(--ease-out)");
    expect(getComputedStyle(part(".level-switch-mark")).translate).toBe("calc(var(--chosen) * (100% + 4px)) 0");
    expect([part(".pairs-climb"), climb.hasAttribute("data-shown"), climb.getAttribute("aria-hidden"), screen.getByLabelText(TEXTS.en.starsEarned).textContent, gateShown()]).toEqual([climb, false, "true", "5", false]);
    expect([getComputedStyle(climb).gridTemplateColumns, getComputedStyle(climb).marginRight]).toEqual(["0fr", "-16px"]);
    uprightRules([820, 1180], 756);
  });

  it("keeps asking to turn over a board and its result", async () => {
    const viewport = manualViewport("portrait");
    const { user, clock } = await openWelcome([820, 1180], { viewport });
    expect(gateShown()).toBe(false);
    await user.click(screen.getByRole("button", { name: TEXTS.en.play }));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), screen.getAllByRole("img", { name: TEXTS.en.turnSideways }).length]).toEqual([true, true, 1]);
    // Played in landscape, the result asks to turn as the window does.
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));
    expect(gateShown()).toBe(false);
    await playBoard(user, clock);
    endWave(clock);
    expect(document.querySelector(".pairs-welcome")).toBeNull();
    expect(screen.getByRole("button", { name: TEXTS.en.playAgain })).toBeDefined();
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), screen.getAllByRole("img", { name: TEXTS.en.turnSideways }).length]).toEqual([true, true, 1]);
    // Back to the welcome, which stands upright again.
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));
    await user.click(screen.getByRole("button", { name: TEXTS.en.back }));
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([part(".pairs-welcome").isConnected, gateShown()]).toEqual([true, false]);
  });

  it("fades the picture asking to turn over the welcome as a tall window narrows", async () => {
    const viewport = manualViewport("portrait");
    await openWelcome([820, 1180], { viewport });
    const welcome = part(".pairs-welcome");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect(part(".pairs-welcome")).toBe(welcome);
  });

  it("keeps the landscape welcome as it was", async () => {
    await openWelcome([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const style = (selector: string) => getComputedStyle(part(selector));
    expect([style(".pairs-welcome").height, style(".pairs-welcome").paddingLeft, style(".pairs-welcome").minHeight || "auto"]).toEqual(["820px", "56px", "auto"]);
    expect([style(".pairs-welcome-body").flexDirection || "row", style(".pairs-welcome-body").gap, style(".pairs-hero").flexGrow]).toEqual(["row", "40px", "760"]);
    expect([style(".pairs-hero-card").width, style(".pairs-hero-card").maxHeight]).toEqual(["32%", `${0.6 * 820}px`]);
    expect([style(".pairs-start").width, style(".pairs-start").alignItems, style(".pairs-title").fontSize, style(".pairs-title").flexWrap]).toEqual(["648px", "flex-start", "64px", "wrap"]);
    expect([style(".level-switch").borderTopWidth, style(".level-switch").width || "auto", style(".level-switch-level").height, style(".level-switch-level").fontSize, style(".level-switch-level").flexDirection || "row"]).toEqual(["1px", "auto", "58px", "16px", "row"]);
  });

  it("puts the bar below the top inset and PLAY above the home indicator, the background to the edges", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openWelcome([744, 1133], { insets });
    const welcome = getComputedStyle(part(".pairs-welcome"));
    expect([welcome.paddingTop, welcome.paddingRight, welcome.paddingBottom, welcome.paddingLeft]).toEqual(["64px", "45px", "68px", "51px"]);
    expect([welcome.boxSizing, welcome.minHeight, welcome.height, welcome.maxWidth]).toEqual(["border-box", "1133px", "auto", "none"]);
    expect([part(".pairs-welcome-bar").previousElementSibling, part(".pairs-welcome-body").lastElementChild?.lastElementChild]).toEqual([part(".stratum-1"), screen.getByRole("button", { name: TEXTS.en.play })]);
    // The cards take the insets from the height the window leaves them.
    const card = cardRule([744, 1133]);
    expect([card.top, card.bottom]).toEqual([24, 20]);
    expect(card.at(pairsWelcomeWidth(744, 19, 13))).toBeCloseTo(Math.min(280, 0.32 * 648, 0.75 * (1133 - 620 - 44)), 6);
    expect(getComputedStyle(document.body).margin).toBe("0px");
    expect(gateShown()).toBe(false);
  });
});
