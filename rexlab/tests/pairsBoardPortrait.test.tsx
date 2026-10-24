import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import type { BoardLevel } from "../src/pairs/index.ts";
import { NARROW_BOARD, pairsBoardCardWidth, pairsBoardGeometry, pairsBoardWidth, PORTRAIT_BOARD, type BoardSizes } from "../src/pairsBoardLayout.ts";
import { board, dealt, endWave, labelAt, namesOf, openPairsApp, pairCards, pairsRecord, PICKED_HATCHLING, playBoard, stateAt, triesShown, turnCard } from "./pairsApp.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// find-the-pair-board-portrait.feature. The turn between the layouts is
// pairsBoardTurn.test.tsx's; the bar's and the names' fit pairsBoardFit's.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = {
  home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"]
};

// Each board the feature names.
const BOARDS = {
  "climb 1": { climbLevel: 1 },
  "climb 2": { climbLevel: 2 },
  "climb 4": { climbLevel: 4 },
  explorer: { large: "explorer" },
  paleontologist: { large: "paleontologist" }
} as const satisfies Record<string, BoardLevel>;

type BoardName = keyof typeof BOARDS;

// "The board stands upright": the window, the board, the rows and columns
// it stands in, its card's width and whether the screen scrolls.
const EXAMPLES = [
  [744, 1133, "climb 1", 3, 2, 290, false],
  [744, 1133, "climb 4", 4, 3, 214, false],
  [744, 1133, "explorer", 6, 3, 138, false],
  [744, 1133, "paleontologist", 6, 4, 138, false],
  [768, 1024, "paleontologist", 6, 4, 121, false],
  [768, 1024, "explorer", 6, 3, 130, true],
  [820, 1180, "climb 2", 4, 2, 225, false],
  [1024, 1366, "paleontologist", 6, 4, 174, false],
  [600, 800, "climb 1", 3, 2, 186, false],
  [600, 800, "climb 4", 4, 3, 150, true],
  [600, 800, "paleontologist", 6, 4, 120, true]
] as const;

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const classesOf = (element: Element) => [...element.children].map((child) => child.className);

// A board dealt at `name` in a window of `size`, a climb's at its climb
// level, a larger level's at that age level.
async function openBoard(size: WindowSize, name: BoardName, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), layouts = PORTRAIT_LAYOUTS
}: { language?: Language; insets?: SafeArea; viewport?: ManualViewport; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const level: BoardLevel = BOARDS[name];
  const climbing = "climbLevel" in level;
  const storage = memoryStorage(climbing ? { [PROGRESS_KEY]: pairsRecord({ stars: 0, level: level.climbLevel, boardsOnLevel: 0, best: {}, found: [] }) } : {});
  const ageLevel = climbing ? PICKED_HATCHLING : { level: level.large, revision: `picked-${level.large}` };
  const app = openPairsApp({ storage, viewport, portraitLayouts: layouts, deviceLanguage: DEVICES[language], ageLevel });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].play }));
  return { ...app, viewport, level };
}

// The board's custom properties, in pixels or counts.
const property = (name: string) => Number.parseFloat(board().style.getPropertyValue(name));

// A card's width as the stylesheet gives it, jsdom having put the
// window's height in for the viewport's and none of the board's custom
// properties: at least the board's floor, and at most the width the
// screen gives and 3:3.2 of the height the window leaves each row, less
// what the rest of the screen takes, the insets and the cards' gaps. In a
// tall-narrow window the width holds the card, its floor 56.
function cardRule(size: WindowSize) {
  const columns = styleAt(board(), size).value("grid-template-columns");
  const byHeightRule = String.raw`\(([\d.]+)vh - \(([\d.]+)px \+ ([\d.]+)px \+ ([\d.]+)px\) - \(var\(--columns\) - 1\) \* ([\d.]+)px\) \/ var\(--columns\) \* ([\d.]+)`;
  const floorFirst = new RegExp(String.raw`^repeat\(var\(--rows\), max\(var\(--card-floor\), min\(var\(--card-by-width\), ${byHeightRule}\)\)\)$`).exec(columns);
  const widthFirst = new RegExp(String.raw`^repeat\(var\(--rows\), min\(var\(--card-by-width\), max\(([\d.]+)px, ${byHeightRule}\)\)\)$`).exec(columns);
  const rule = floorFirst ?? widthFirst;
  if (!rule) throw new Error(`A card's width the test cannot read: ${columns}`);
  const phoneFloor = widthFirst ? Number(widthFirst[1]) : undefined;
  const [viewport, taken, top, bottom, gap, ratio] = rule.slice(widthFirst ? 2 : 1).map(Number) as [number, number, number, number, number, number];
  const [rows, floor, byWidth, uprightRows] = [property("--rows"), property("--card-floor"), property("--card-by-width"), property("--columns")];
  const byHeight = (((viewport / 100) * size[1] - (taken + top + bottom) - (uprightRows - 1) * gap) / uprightRows) * ratio;
  const width = phoneFloor === undefined ? Math.max(floor, Math.min(byWidth, byHeight)) : Math.min(byWidth, Math.max(phoneFloor, byHeight));
  return { taken, top, bottom, gap, ratio, rows, floor, byWidth, uprightRows, width, phoneFloor };
}

// Where the grid puts the card at `index`: down each column in turn where
// it flows by column, otherwise along each row.
const placed = (index: number, flow: string, rows: number, columns: number) =>
  flow === "column" ? { row: index % rows, column: Math.floor(index / rows) } : { row: Math.floor(index / columns), column: index % columns };

// The CSS contracts under which the geometry's sums hold. jsdom does not
// lay out boxes, so every structural assumption is checked here, and what
// the cards' rule takes from the height is summed from the stylesheet.
function uprightRules(size: WindowSize, width: number, sizes: BoardSizes = PORTRAIT_BOARD) {
  const at = (selector: string) => styleAt(part(selector), size);
  const page = at(".pairs-board-screen");
  expect(classesOf(part(".pairs-board-screen"))).toEqual(["stratum stratum-1", "pairs-bar", "pair-board-room"]);
  expect([page.value("display"), page.value("flex-direction"), page.rowGap(), page.value("box-sizing")]).toEqual(["flex", "column", sizes.gap, "border-box"]);
  expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right")]).toEqual([sizes.topPadding, sizes.bottomPadding, sizes.sidePadding, sizes.sidePadding]);
  expect([page.px("min-height"), page.value("height"), page.value("overflow")]).toEqual([size[1], "auto", "hidden"]);
  const bar = at(".pairs-bar");
  expect(bar.px("height")).toBe(sizes.bar);
  // The room under the bar grows with the board, its board centred.
  const room = at(".pair-board-room");
  expect([room.value("flex-grow"), room.value("flex-shrink"), room.value("flex-basis"), room.value("container-type"), room.value("display"), room.value("place-items")]).toEqual(["1", "0", "auto", "normal", "grid", "center"]);
  // The grid on its side: as many columns as landscape has rows, as many
  // rows as it has columns, the cards flowing down each column.
  const grid = styleAt(board(), size);
  expect([grid.value("display"), grid.value("width"), grid.value("aspect-ratio"), grid.value("grid-auto-flow"), grid.value("grid-template-rows"), grid.rowGap(), grid.columnGap()]).toEqual([
    "grid", "auto", "auto", "column", "repeat(var(--columns), auto)", sizes.cardsGap, sizes.cardsGap
  ]);
  const card = cardRule(size);
  expect(board().style.getPropertyValue("--card-by-width")).toBe(`${pairsBoardCardWidth(width, card.rows, sizes)}px`);
  expect(card.phoneFloor).toBe(sizes.phoneFloor);
  expect(pairCards()).toHaveLength(card.rows * card.uprightRows);
  for (const each of pairCards()) expect(styleAt(each, size).value("aspect-ratio")).toBe("3 / 3.2");
  // What the cards' rule takes from the height is the screen's padding,
  // the bar and its gap, as the stylesheet sizes them.
  expect(card.taken).toBe(page.px("padding-top") + page.px("padding-bottom") + bar.px("height") + page.rowGap());
  expect([card.gap, card.ratio]).toEqual([grid.rowGap(), 0.9375]);
  expect(card.ratio).toBeCloseTo(sizes.cardRatio, 12);
  const scrollbar = size[0] - 2 * sizes.sidePadding - width;
  const geometry = pairsBoardGeometry({ rows: card.rows, columns: card.uprightRows, floor: card.floor }, size[0], size[1], 0, 0, scrollbar, sizes);
  expect(card.width).toBeCloseTo(geometry.card.width, 6);
  return { card, flow: grid.value("grid-auto-flow"), geometry };
}

describe("find the pair's board upright", () => {
  it.each(EXAMPLES)("stands upright at %i by %i, a board of %s in %i rows of %i cards each %i wide, scrolling %s", async (width, height, name, rows, columns, card, scrolls) => {
    const { level } = await openBoard([width, height], name);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(screen.queryByRole("img", { name: TEXTS.en.makeWindowWider })).toBeNull();
    const { card: rule, flow, geometry } = uprightRules([width, height], pairsBoardWidth(width, 0, 0));
    expect([geometry.rows, geometry.columns, rule.uprightRows, rule.rows]).toEqual([rows, columns, rows, columns]);
    expect(Math.abs(rule.width - card)).toBeLessThanOrEqual(1);
    // The screen scrolls by growing past the window, from its least.
    const content = 172 + rows * ((rule.width * 3.2) / 3) + (rows - 1) * 16;
    expect([content > height, geometry.scrolls]).toEqual([scrolls, scrolls]);
    // Each card stands where landscape's row and column swap: the card at
    // row r, column c stands at row c, column r.
    for (const index of pairCards().keys()) {
      const landscape = placed(index, "row", columns, rows);
      expect(placed(index, flow, rows, columns)).toEqual({ row: landscape.column, column: landscape.row });
    }
    // The cards keep their order in the page and their names.
    expect(pairCards().map((each) => each.getAttribute("aria-label"))).toEqual(pairCards().map((_, index) => TEXTS.en.card(index + 1)));
    expect([screen.getByRole("heading").textContent, triesShown(), screen.queryByLabelText(TEXTS.en.level)?.textContent]).toEqual([
      TEXTS.en.pairs, "0", "climbLevel" in level ? String(level.climbLevel) : undefined
    ]);
  });

  it("turns the card dealt in each place, as in landscape", async () => {
    const { user } = await openBoard([744, 1133], "explorer");
    const names = namesOf(dealt({ large: "explorer" }));
    await turnCard(user, 4);
    await turnCard(user, 13);
    expect([labelAt(4), labelAt(13), stateAt(4), stateAt(13), triesShown()]).toEqual([names[4], names[13], names[4] === names[13] ? "found" : "open", names[4] === names[13] ? "found" : "open", "1"]);
  });

  it("takes the side insets and the scrollbar from the viewport for the cards' width", async () => {
    const viewport = { ...manualViewport("portrait", { left: 19, right: 13 }), scrollbarWidth: () => 16 };
    await openBoard([744, 1133], "paleontologist", { viewport });
    expect(board().style.getPropertyValue("--card-by-width")).toBe(`${pairsBoardCardWidth(744 - 19 - 13 - 64 - 16, 4)}px`);
  });

  it("takes the phone's sizes as a tall window narrows, and plays on to the result, asking nothing", async () => {
    const viewport = manualViewport("portrait");
    const { user, clock } = await openBoard([820, 1180], "climb 1", { viewport, layouts: NARROW_LAYOUTS });
    const shown = board();
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert"), board()]).toEqual(["tall-narrow", false, false, shown]);
    expect(board().style.getPropertyValue("--card-by-width")).toBe(`${pairsBoardCardWidth(pairsBoardWidth(393, 0, 0, 0, NARROW_BOARD), 2, NARROW_BOARD)}px`);
    await playBoard(user, clock);
    endWave(clock);
    expect([part(".pairs-result").isConnected, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, false, false]);
  });

  it("keeps the landscape board as it was", async () => {
    await openBoard([1180, 820], "explorer", { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const style = (element: Element) => getComputedStyle(element);
    const page = style(part(".pairs-board-screen"));
    expect([page.height, page.paddingLeft, page.minHeight || "auto"]).toEqual(["820px", "56px", "auto"]);
    expect([style(part(".pair-board-room")).flexShrink, style(part(".pair-board-room")).getPropertyValue("container-type")]).toEqual(["1", "size"]);
    const grid = style(board());
    expect([grid.width, grid.gridTemplateColumns, grid.gridAutoFlow || "row", style(pairCards()[0]!).aspectRatio || "auto"]).toEqual([
      "min(100cqw, 100cqh * var(--columns) * 3 / (var(--rows) * 3.2))", "repeat(var(--columns), minmax(var(--card-floor), 1fr))", "row", "auto"
    ]);
    // BACK, HOME and the title show their names.
    const bar = part(".pairs-bar");
    expect([...bar.querySelectorAll(".upright-hidden")].map((name) => [name.textContent, style(name).position || "static"])).toEqual([
      [TEXTS.en.back, "static"], [TEXTS.en.home, "static"], [TEXTS.en.pairs, "static"]
    ]);
    expect(style(within(bar).getByRole("button", { name: TEXTS.en.back })).paddingLeft).toBe("16px");
  });

  it("puts the bar below the top inset and the last row above the home indicator, the background to the edges", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openBoard([744, 1133], "paleontologist", { insets });
    const page = getComputedStyle(part(".pairs-board-screen"));
    expect([page.paddingTop, page.paddingRight, page.paddingBottom, page.paddingLeft]).toEqual(["64px", "45px", "68px", "51px"]);
    expect([page.boxSizing, page.minHeight, page.height, page.maxWidth]).toEqual(["border-box", "1133px", "auto", "none"]);
    expect([part(".pairs-bar").previousElementSibling, part(".pairs-board-screen").lastElementChild, board().lastElementChild]).toEqual([part(".stratum-1"), part(".pair-board-room"), pairCards().at(-1)]);
    // The cards take the insets from the height the window leaves them.
    const card = cardRule([744, 1133]);
    expect([card.top, card.bottom, card.byWidth]).toEqual([24, 20, pairsBoardCardWidth(648, 4)]);
    expect(card.width).toBeCloseTo(Math.max(120, Math.min(pairsBoardCardWidth(648, 4), ((1133 - 172 - 44 - 5 * 16) / 6) * (3 / 3.2))), 6);
    expect(getComputedStyle(document.body).margin).toBe("0px");
    expect(gateShown()).toBe(false);
  });
});

// find-the-pair-board-narrow-portrait.feature: an iPhone upright.
const NARROW_LAYOUTS: PortraitLayouts = { ...PORTRAIT_LAYOUTS, home: ["tall", "tall-narrow"], "pairs-welcome": ["tall", "tall-narrow"], "pairs-board": ["tall", "tall-narrow"], "pairs-result": ["tall", "tall-narrow"] };
const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

// The window, the board, the rows and columns it stands in, its card's
// width and whether the screen scrolls.
const PHONES = [
  [320, 568, "climb 1", 3, 2, 131, false],
  [320, 568, "climb 2", 4, 2, 97, false],
  [393, 852, "climb 4", 4, 3, 112, false],
  [393, 759, "explorer", 6, 3, 92, false],
  [393, 852, "paleontologist", 6, 4, 82, false],
  [320, 568, "paleontologist", 6, 4, 62, false],
  [320, 400, "paleontologist", 6, 4, 56, true]
] as const;

describe("find the pair's board in a tall-narrow window", () => {
  it.each(PHONES)("stands upright at %i by %i, a board of %s in %i rows of %i cards each %i wide, scrolling %s", async (width, height, name, rows, columns, card, scrolls) => {
    await openBoard([width, height], name, { viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const { card: rule, geometry } = uprightRules([width, height], pairsBoardWidth(width, 0, 0, 0, NARROW_BOARD), NARROW_BOARD);
    expect([geometry.rows, geometry.columns]).toEqual([rows, columns]);
    expect(Math.abs(rule.width - card)).toBeLessThanOrEqual(1);
    expect(geometry.scrolls).toBe(scrolls);
    // The grid never stands wider than the width.
    expect(columns * rule.width + (columns - 1) * 8).toBeLessThanOrEqual(width - 40 + 1e-9);
  });

  it("keeps BACK, HOME, the climb level and 100 tries in one row, a found card's name left to its label", async () => {
    await openBoard([320, 568], "climb 4", { viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    const size: WindowSize = [320, 568];
    const bar = styleAt(part(".pairs-bar"), size);
    expect([styleAt(part(".pairs-bar-title"), size).value("position"), styleAt(part(".pairs-bar-title + .pairs-bar-chip"), size).value("margin-left")]).toEqual(["absolute", "auto"]);
    const buttons = [TEXTS.en.back, TEXTS.en.home].map((name) => styleAt(screen.getByRole("button", { name }), size));
    for (const button of buttons) expect([button.px("width"), button.px("height")]).toEqual([48, 56]);
    const chips = [...document.querySelectorAll(".pairs-bar-chip")].map((chip) => {
      const own = styleAt(chip, size);
      // A symbol, and the level or 100 tries at 0.8 em a glyph.
      const glyphs = chip.getAttribute("aria-label") === TEXTS.en.tries ? 3 : 1;
      return own.px("padding-left") + own.px("padding-right") + styleAt(part("svg", chip), size).px("width") + own.columnGap() + 0.8 * glyphs * own.px("font-size");
    });
    expect(chips).toHaveLength(2);
    expect(buttons.reduce((sum, button) => sum + button.px("width"), 0) + chips[0]! + chips[1]! + 3 * bar.columnGap()).toBeLessThanOrEqual(280);
    // A found card's name is left to its label; one shown while its
    // picture is not stays.
    const card = pairCards()[0]!;
    const name = document.createElement("span");
    name.className = "pair-card-name";
    card.append(name);
    onTestFinished(() => name.remove());
    card.dataset.state = "found";
    expect(styleAt(name, size).value("display")).toBe("none");
    card.dataset.state = "up";
    expect(styleAt(name, size).value("display")).not.toBe("none");
  });
});
