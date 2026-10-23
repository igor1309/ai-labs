import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { shapeOf, type BoardLevel } from "../src/pairs/index.ts";
import { pairsResultColumns, pairsResultGeometry, pairsResultType, pairsResultWidth, PORTRAIT_PAIRS_RESULT, type UprightResult } from "../src/pairsResultLayout.ts";
import { dealt, endWave, namesOf, openPairsApp, pairCards, pairsRecord, PICKED_HATCHLING, placesOf, playBoard } from "./pairsApp.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualPictures, manualViewport, memoryStorage, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// find-the-pair-result-portrait.feature. The turn between the layouts is
// pairsResultTurn.test.tsx's; the words' fit pairsResultFit's.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = {
  home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"], "pairs-result": ["tall"]
};

// Each board the feature names. A climb's is played on the second board
// of its level over a best of 99, so it is a new best and a new level,
// or with no best yet, a first best.
const BOARDS = {
  "climb 1": { climbLevel: 1 },
  "climb 2": { climbLevel: 2 },
  explorer: { large: "explorer" },
  paleontologist: { large: "paleontologist" }
} as const satisfies Record<string, BoardLevel>;

type BoardName = keyof typeof BOARDS;

// "The result stands upright": the window, the board, its card's height
// and whether the screen scrolls.
const EXAMPLES = [
  [600, 800, "climb 1", 157, false],
  [600, 800, "climb 2", 112, false],
  [600, 800, "paleontologist", 90, true],
  [744, 1133, "climb 2", 254, false],
  [744, 1133, "paleontologist", 119, false],
  [768, 1024, "explorer", 133, false],
  [768, 1024, "paleontologist", 96, false],
  [820, 1180, "explorer", 177, false],
  [1024, 1366, "paleontologist", 174, false]
] as const;

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const classesOf = (element: Element) => [...element.children].map((child) => child.className);

// The board of `name`, played to its result in a window of `size`.
async function openResult(size: WindowSize, name: BoardName, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), firstBest = false
}: { language?: Language; insets?: SafeArea; viewport?: ManualViewport; firstBest?: boolean } = {}) {
  openWindow(...size);
  const level: BoardLevel = BOARDS[name];
  const climbing = "climbLevel" in level;
  const storage = memoryStorage(climbing ? { [PROGRESS_KEY]: pairsRecord({ stars: 1, level: level.climbLevel, boardsOnLevel: 1, best: firstBest ? {} : { [level.climbLevel]: 99 }, found: [] }) } : {});
  const ageLevel = climbing ? PICKED_HATCHLING : { level: level.large, revision: `picked-${level.large}` };
  const app = openPairsApp({ storage, viewport, portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: DEVICES[language], ageLevel });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].play }));
  await playBoard(app.user, app.clock);
  endWave(app.clock);
  return { ...app, viewport, count: shapeOf(level).pairs };
}

// The sizes the screen gives the stylesheet, as its custom properties.
const shownType = () => {
  const { style } = part(".pairs-result");
  return { cardMaximum: style.getPropertyValue("--card-maximum"), action: style.getPropertyValue("--action-size") };
};
const typeOf = (width: number, count: number) => {
  const type = pairsResultType(width, count);
  return { cardMaximum: `${type.cardMaximum}px`, action: `${type.action}px` };
};

// The CSS contracts under which the geometry's sums hold. jsdom does not
// lay out boxes, so every structural assumption is checked here, and the
// column and the dinosaurs' rows are summed from the stylesheet.
function uprightRules(size: WindowSize, width: number, result: UprightResult) {
  const sizes = PORTRAIT_PAIRS_RESULT;
  const at = (selector: string) => styleAt(part(selector), size);
  const page = at(".pairs-result");
  expect(classesOf(part(".pairs-result"))).toEqual(["festivity", "stratum result-stratum", "pairs-found", "result-content"]);
  expect([page.value("display"), page.value("flex-direction"), page.value("align-items"), page.value("justify-content"), page.rowGap()]).toEqual(["flex", "column", "center", "center", sizes.foundGap]);
  expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right"), page.value("box-sizing")]).toEqual([32, 32, 32, 32, "border-box"]);
  expect([page.px("min-height"), page.value("height")]).toEqual([size[1], "auto"]);
  expect(shownType()).toEqual(typeOf(width, result.count));
  const type = pairsResultType(width, result.count);
  const scrollbar = size[0] - 2 * sizes.padding - width;
  const geometry = pairsResultGeometry(result, size[0], size[1], 0, 0, scrollbar);

  // The dinosaurs: three across, two for four, the width wide, at most
  // 648, their rows sharing what the grid grows to between its least and
  // its most.
  const found = at(".pairs-found");
  const rows = Number(part(".pairs-found").style.getPropertyValue("--found-rows"));
  expect([rows, part(".pairs-found").children.length]).toEqual([geometry.rows, result.count]);
  expect([found.value("flex-grow"), found.value("flex-shrink"), found.value("flex-basis"), found.value("align-self"), found.value("width"), found.px("max-width"), found.value("height")]).toEqual(["1", "0", "0px", "center", "100%", sizes.foundMaximum, "auto"]);
  expect([found.value("grid-template-columns"), found.value("grid-template-rows"), found.rowGap(), found.columnGap()]).toEqual([
    `repeat(${pairsResultColumns(result.count)}, minmax(0, 1fr))`, "repeat(var(--found-rows), minmax(0, 1fr))", sizes.cardsGap, sizes.cardsGap
  ]);
  const least = /^calc\(var\(--found-rows\) \* ([\d.]+)px \+ \(var\(--found-rows\) - 1\) \* ([\d.]+)px\)$/.exec(found.value("min-height"));
  const most = /^calc\(var\(--found-rows\) \* var\(--card-maximum\) \+ \(var\(--found-rows\) - 1\) \* ([\d.]+)px\)$/.exec(found.value("max-height"));
  if (!least || !most) throw new Error(`Rows the test cannot read: ${found.value("min-height")}, ${found.value("max-height")}`);
  expect([Number(least[1]), Number(least[2]), Number(most[1])]).toEqual([sizes.cardMinimum, sizes.cardsGap, sizes.cardsGap]);
  const art = at(".pairs-found-art");
  expect([art.value("flex-grow"), art.value("flex-shrink"), art.value("flex-basis"), art.value("min-height"), art.value("aspect-ratio")]).toEqual(["1", "1", "0px", "0px", "auto"]);
  // The name is sized from the card's width as in landscape.
  const name = /^min\(([\d.]+)px, ([\d.]+) \* \(100cqi - ([\d.]+)px\)\)$/.exec(at(".pairs-found-name").value("font-size"));
  if (!name) throw new Error(`A name the test cannot read: ${at(".pairs-found-name").value("font-size")}`);
  expect([Number(name[1]), Number(name[3]), at(".pairs-found-name").px("padding-top"), at(".pairs-found-name").value("line-height")]).toEqual([sizes.nameMaximum, 2 * sizes.namePadding, sizes.namePadding, String(sizes.nameLineHeight)]);
  expect(Number(name[2])).toBeCloseTo(1 / sizes.nameEms, 3);

  // The column under them, 16 apart.
  const content = at(".result-content");
  expect(classesOf(part(".result-content"))).toEqual(["pairs-badges", "pairs-result-tries", "pairs-result-stars", "result-title", "best-score", "result-actions"]);
  expect([content.value("display"), content.value("flex-direction"), content.value("align-items"), content.value("align-self"), content.rowGap()]).toEqual(["flex", "column", "center", "stretch", sizes.gap]);
  const badges = at(".pairs-badges");
  expect([badges.value("flex-wrap"), badges.rowGap(), badges.columnGap()]).toEqual(["wrap", sizes.gap, sizes.gap]);
  for (const badge of part(".pairs-badges").children) expect(styleAt(badge, size).px("height")).toBe(sizes.badge);
  const tries = at(".pairs-result-tries-value").px("font-size");
  expect(tries).toBeCloseTo(geometry.tries, 6);
  expect([at(".pairs-result-tries").value("line-height"), Number(part(".pairs-result-hand").getAttribute("height"))]).toEqual(["1", sizes.hand]);
  const stars = at(".pairs-result-stars");
  expect([stars.px("font-size"), stars.value("line-height")]).toEqual([sizes.stars, "1"]);
  const title = at(".result-title");
  expect(title.px("font-size") * Number(title.value("line-height"))).toBeCloseTo(sizes.title, 9);
  expect(at(".best-score").px("height")).toBe(sizes.best);
  const actions = at(".result-actions");
  expect([actions.px("padding-top"), actions.columnGap()]).toEqual([0, sizes.actionsGap]);
  for (const button of part(".result-actions").children) {
    const own = styleAt(button, size);
    expect([own.px("height"), own.px("padding-left"), own.px("padding-right"), own.columnGap(), own.px("font-size"), own.value("white-space")]).toEqual([
      sizes.actions, sizes.actionSidePadding, sizes.actionSidePadding, sizes.actionInnerGap, type.action, "nowrap"
    ]);
  }
  const badgeRows = result.badgeRows * sizes.badge + (result.badgeRows - 1) * badges.rowGap();
  const column = badgeRows + Math.max(tries, sizes.hand) + stars.px("font-size") + sizes.title + sizes.best + actions.px("padding-top") + sizes.actions + 5 * content.rowGap();
  expect(column).toBeCloseTo(geometry.column, 6);

  // The grid grows into what the column leaves of the window's height,
  // within its least and its most.
  const left = size[1] - page.px("padding-top") - page.px("padding-bottom") - page.rowGap() - column;
  const grid = Math.min(rows * type.cardMaximum + (rows - 1) * found.rowGap(), Math.max(rows * sizes.cardMinimum + (rows - 1) * found.rowGap(), left));
  expect((grid - (rows - 1) * found.rowGap()) / rows).toBeCloseTo(geometry.card.height, 6);
  expect((Math.min(sizes.foundMaximum, width) - (pairsResultColumns(result.count) - 1) * found.columnGap()) / pairsResultColumns(result.count)).toBeCloseTo(geometry.card.width, 6);
  expect(grid > left + 1e-9).toBe(geometry.scrolls);
  return geometry;
}

describe("find the pair's result upright", () => {
  it.each(EXAMPLES)("stands upright at %i by %i, a board of %s, each card %i tall, scrolling %s", async (width, height, name, card, scrolls) => {
    const { count } = await openResult([width, height], name);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(screen.queryByRole("img", { name: TEXTS.en.makeWindowWider })).toBeNull();
    const climbing = name.startsWith("climb");
    expect([screen.getAllByRole("status").length, part(".pairs-badges").children.length]).toEqual(climbing ? [2, 2] : [1, 1]);
    const geometry = uprightRules([width, height], pairsResultWidth(width, 0, 0), { count, badgeRows: 1 });
    expect(Math.abs(geometry.card.height - card)).toBeLessThanOrEqual(4);
    expect(geometry.scrolls).toBe(scrolls);
  });

  it.each([
    ["en", 0], ["ru", 0], ["en", 16], ["ru", 16]
  ] as const)("gives the result in %s its sizes at 600 by 1000 with a %i-pixel scrollbar, the actions' type at least 22", async (language, scrollbar) => {
    const viewport = { ...manualViewport("portrait"), scrollbarWidth: () => scrollbar };
    const { count } = await openResult([600, 1000], "climb 1", { language, viewport, firstBest: true });
    expect(screen.getByRole("status", { name: TEXTS[language].celebrations["first-best"].label })).toBeDefined();
    const width = pairsResultWidth(600, 0, 0, scrollbar);
    expect(shownType()).toEqual(typeOf(width, count));
    expect(pairsResultType(width, count).action).toBeGreaterThanOrEqual(22);
    expect(gateShown()).toBe(false);
    // Russian's badges stand one above the other, as pairsResultFit's
    // widths have them.
    uprightRules([600, 1000], width, { count, badgeRows: language === "ru" ? 2 : 1 });
  });

  it("takes the side insets and the scrollbar from the viewport for the sizes", async () => {
    const viewport = { ...manualViewport("portrait", { left: 19, right: 13 }), scrollbarWidth: () => 16 };
    await openResult([744, 1133], "paleontologist", { viewport });
    expect(shownType()).toEqual(typeOf(744 - 19 - 13 - 64 - 16, 12));
  });

  it("fades the picture asking to turn over the result as a tall window narrows", async () => {
    const viewport = manualViewport("portrait");
    await openResult([820, 1180], "explorer", { viewport });
    const result = part(".pairs-result");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), part(".pairs-result")]).toEqual([true, true, result]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
  });

  it("keeps the landscape result as it was", async () => {
    await openResult([1180, 820], "paleontologist", { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const style = (selector: string) => getComputedStyle(part(selector));
    expect([style(".pairs-result").display, style(".pairs-result").height, style(".pairs-result").gridTemplateColumns]).toEqual(["grid", "820px", "minmax(0, 640fr) minmax(0, 680fr)"]);
    expect([style(".pairs-found").height, style(".pairs-found").gap, style(".pairs-found").maxHeight]).toEqual(["100%", "14px", "calc(var(--found-rows) * 162px + (var(--found-rows) - 1) * 14px)"]);
    expect([style(".pairs-result-tries-value").fontSize, style(".pairs-result .result-title").fontSize, style(".play-again-button").fontSize]).toEqual([`${0.22 * 820}px`, `${0.0334 * 1180}px`, `${0.018 * 1180}px`]);
  });

  it("puts the dinosaurs below the top inset and the actions above the home indicator, the background to the edges", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openResult([744, 1133], "paleontologist", { insets });
    const result = getComputedStyle(part(".pairs-result"));
    expect([result.paddingTop, result.paddingRight, result.paddingBottom, result.paddingLeft]).toEqual(["56px", "45px", "52px", "51px"]);
    expect([result.boxSizing, result.minHeight, result.height, result.backgroundColor]).toEqual(["border-box", "1133px", "auto", "rgb(31, 43, 77)"]);
    expect(part(".pairs-found").previousElementSibling).toBe(part(".result-stratum"));
    expect([part(".result-content").lastElementChild, part(".result-content")]).toEqual([part(".result-actions"), part(".pairs-result").lastElementChild]);
    expect(shownType()).toEqual(typeOf(744 - 19 - 13 - 64, 12));
    expect(getComputedStyle(document.body).margin).toBe("0px");
    expect(gateShown()).toBe(false);
  });
});

describe("the offer of a level over the upright result", () => {
  // jsdom has no animation engine: with none running, the offer rises in
  // when the timer of no wait fires.
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
  });
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "getAnimations");
  });

  it("comes over the result once its rewards have landed, laid out for a tall window", async () => {
    openWindow(820, 1180);
    const clock = manualPictures();
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 0, level: 4, boardsOnLevel: 0, best: {}, found: [], offer: { level: "hatchling", strong: 2, declined: [] } }) });
    const app = openPairsApp({ storage, viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, clock });
    await app.user.click(gameDoor(TEXTS.en.pairs));
    await app.user.click(screen.getByRole("button", { name: TEXTS.en.play }));
    act(() => clock.finishAll());
    // Every pair at the first try: a strong board, the third in a row.
    const names = namesOf(dealt({ climbLevel: 4 }));
    expect(pairCards()).toHaveLength(names.length);
    const cards = pairCards();
    for (const name of new Set(names)) placesOf(names, name).forEach((place) => fireEvent.click(cards[place]!));
    endWave(clock);
    expect([part(".pairs-result").isConnected, gateShown(), screen.queryByRole("dialog")]).toEqual([true, false, null]);
    act(() => clock.fire(0));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("h2")?.textContent).toBe(TEXTS.en.levelOffer.question(TEXTS.en.ageLevels.explorer.name));
    expect([gateShown(), part(".pairs-result").hasAttribute("inert")]).toEqual([false, true]);
    // LAB-480's tall rules: the offer across the window less 24 a side,
    // at most 710, YES and NOT NOW one above the other.
    expect([styleAt(part(".pairs-offer-scrim"), [820, 1180]).value("grid-template-columns"), styleAt(part(".pairs-offer"), [820, 1180]).value("width")]).toEqual(["minmax(0, 710px)", "100%"]);
    expect([styleAt(part(".pairs-offer-question"), [820, 1180]).px("font-size"), styleAt(part(".pairs-offer-answers"), [820, 1180]).value("flex-direction")]).toEqual([32, "column"]);
  });
});
