import { act, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import type { BoardLevel } from "../src/pairs/index.ts";
import { board, openPairsApp, pairCards, pairsRecord, PICKED_HATCHLING } from "./pairsApp.tsx";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// iPhones on their side, full screen: the smallest, a common one and the
// largest, each with the insets its notch and home indicator take.
const PHONES = [
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;

// Each board's shape: a climb's three, and the larger levels'.
const BOARDS = {
  "climb 1": [{ climbLevel: 1 }, 2, 3],
  "climb 2": [{ climbLevel: 2 }, 2, 4],
  "climb 4": [{ climbLevel: 4 }, 3, 4],
  explorer: [{ large: "explorer" }, 3, 6],
  paleontologist: [{ large: "paleontologist" }, 4, 6]
} as const satisfies Record<string, readonly [BoardLevel, number, number]>;

type BoardName = keyof typeof BOARDS;

const EVERY = PHONES.flatMap(([width, height, insets]) => (Object.keys(BOARDS) as BoardName[]).map((name) => [name, width, height, insets] as const));

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// A board dealt at `name` in a wide-short window of `size` with the
// safe-area insets `insets`.
async function openBoard(size: WindowSize, insets: SafeArea, name: BoardName, language: Language = "en") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const [level] = BOARDS[name];
  const climbing = "climbLevel" in level;
  const storage = memoryStorage(climbing ? { [PROGRESS_KEY]: pairsRecord({ stars: 0, level: level.climbLevel, boardsOnLevel: 0, best: {}, found: [] }) } : {});
  const ageLevel = climbing ? PICKED_HATCHLING : { level: level.large, revision: `picked-${level.large}` };
  const app = openPairsApp({ storage, viewport, deviceLanguage: DEVICES[language], ageLevel });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].play }));
  return { ...app, viewport };
}

// The board's size in the room under the bar, `room` wide and tall, as a
// browser resolves the stylesheet's width and aspect ratio: as wide as
// the room, or as its height allows at 3:2 cards, whichever is less, the
// cards sharing what the 8-pixel gaps leave.
const boardIn = ([width, height]: readonly [number, number], rows: number, columns: number) => {
  const boardWidth = Math.min(width, (height * columns * 3) / (rows * 2));
  const boardHeight = (boardWidth * rows * 2) / (columns * 3);
  return { boardWidth, boardHeight, card: { width: (boardWidth - (columns - 1) * 8) / columns, height: (boardHeight - (rows - 1) * 8) / rows } };
};

describe("find the pair's board in a wide-short window", () => {
  it.each(EVERY)("stands the %s board whole under a 48-pixel bar at %i by %i, every card over 44 tall", async (name, width, height, insets) => {
    await openBoard([width, height], insets, name);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const screenStyle = at(".pairs-board-screen");
    expect([screenStyle.px("padding-top"), screenStyle.px("padding-right"), screenStyle.px("padding-bottom"), screenStyle.px("padding-left"), screenStyle.rowGap()]).toEqual([8, 20 + insets.right, 12 + insets.bottom, 20 + insets.left, 8]);
    expect([screenStyle.value("height"), screenStyle.value("overflow")]).toEqual([`${height}px`, "hidden"]);
    expect(at(".pairs-bar").value("height")).toBe("48px");
    const room = at(".pair-board-room");
    expect([room.value("flex").replace("0px", "0"), room.px("min-height"), room.value("container-type")]).toEqual(["1 1 0", 0, "size"]);
    const [, rows, columns] = BOARDS[name];
    expect([board().style.getPropertyValue("--rows"), board().style.getPropertyValue("--columns")]).toEqual([`${rows}`, `${columns}`]);
    const grid = at(".pair-board");
    expect([grid.value("width"), grid.value("aspect-ratio")]).toEqual(["min(100cqw, 100cqh * var(--columns) * 3 / (var(--rows) * 2))", "calc(var(--columns) * 3) / calc(var(--rows) * 2)"]);
    expect([grid.value("grid-template-columns"), grid.value("grid-template-rows"), grid.rowGap(), grid.columnGap()]).toEqual(["repeat(var(--columns), minmax(0, 1fr))", "repeat(var(--rows), minmax(0, 1fr))", 8, 8]);
    expect(pairCards()).toHaveLength(rows * columns);
    const { boardWidth, boardHeight, card } = boardIn([width - 40 - insets.left - insets.right, height - 8 - 48 - 8 - 12 - insets.bottom], rows, columns);
    expect([boardWidth, boardHeight].every((side) => side > 0)).toBe(true);
    expect(card.width / card.height).toBeGreaterThan(1);
    expect(Math.min(card.width, card.height)).toBeGreaterThan(44);
  });

  it("keeps the fullest board's cards over 44 tall in the shortest window, 568 by 320", () => {
    const { card } = boardIn([568 - 40, 320 - 8 - 48 - 8 - 12], 4, 6);
    expect(card.height).toBeGreaterThan(44);
  });

  it.each(PHONES)("shows BACK and HOME as 48-pixel squares of their symbols, their names kept for screen readers, at %i by %i", async (width, height, insets) => {
    await openBoard([width, height], insets, "climb 4");
    const size: WindowSize = [width, height];
    const buttons = [screen.getByRole("button", { name: TEXTS.en.back }), screen.getByRole("button", { name: TEXTS.en.home })];
    for (const button of buttons) {
      const style = styleAt(button, size);
      expect([style.value("width"), style.value("height"), style.px("padding-left"), style.value("justify-content")]).toEqual(["48px", "48px", 0, "center"]);
      const name = styleAt(part(".upright-hidden", button), size);
      expect([name.value("position"), name.value("clip-path")]).toEqual(["absolute", "inset(50%)"]);
    }
    const title = styleAt(part(".pairs-bar-title .upright-hidden"), size);
    expect(title.value("position") || "static").toBe("static");
    expect(styleAt(part(".pairs-bar-title"), size).value("font-size")).toBe("24px");
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", async () => {
    const { viewport } = await openBoard([852, 393], PHONES[1][2], "explorer");
    act(() => viewport.resize("wide", false));
    openWindow(1180, 820);
    const grid = styleAt(board(), [1180, 820]);
    expect([document.documentElement.dataset.size, styleAt(part(".pairs-bar"), [1180, 820]).value("height"), grid.value("aspect-ratio")]).toEqual(["wide", "56px", "calc(var(--columns) * 3) / calc(var(--rows) * 3.2)"]);
  });
});

// Advances at weight 700, rounded up: Lexend's for English, the system
// face's for Russian with 10% room.
const TITLE_EMS: Record<string, number> = { "FIND THE PAIR": 8.03, "НАЙДИ ПАРУ": 7.4 };

describe("find the pair's bar fits on a phone on its side", () => {
  it.each(["en", "ru"] as const)("keeps BACK, HOME, the title, the climb level and the tries on one row at every width, in %s", async (language) => {
    const size: WindowSize = [667, 375];
    await openBoard(size, PHONES[0][2], "climb 4", language);
    const at = (selector: string) => styleAt(part(selector), size);
    const title = at(".pairs-bar-title");
    const chips = [...document.querySelectorAll<HTMLElement>(".pairs-bar-chip")];
    expect(chips).toHaveLength(2);
    const chip = styleAt(chips[0]!, size);
    const symbol = styleAt(part("svg", chips[0]!), size).px("width");
    // A chip: its sides, its symbol, the gap and its count, the tries kept
    // 1.4 ems wide, the climb level one digit.
    const chipWidth = (ems: number) => chip.px("padding-left") + chip.px("padding-right") + symbol + chip.columnGap() + ems * chip.px("font-size");
    const titleWidth = at(".pairs-bar-mark").px("width") + title.columnGap() + TITLE_EMS[TEXTS[language].pairs]! * title.px("font-size");
    const bar = 2 * 48 + titleWidth + chipWidth(0.67) + chipWidth(1.4) + 4 * at(".pairs-bar").columnGap();
    for (let width = 568; width <= 932; width += 1) expect(bar, `${width}`).toBeLessThanOrEqual(width - 40);
    for (let width = 812; width <= 932; width += 1) expect(bar, `${width} with a notch`).toBeLessThanOrEqual(width - 40 - 2 * 59);
  });
});
