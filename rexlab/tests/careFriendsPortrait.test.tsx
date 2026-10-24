import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { careRecord, openCareApp } from "./careApp.tsx";
import { SHIPPED_VISITORS, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dinosaur-care-friends-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "care-welcome": ["tall"], "care-friends": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const FRIENDS = SHIPPED_VISITORS.slice(0, 3).map(({ id }) => id);

// FRIENDS with `friends` in a window of `size`.
function openFriends(size: WindowSize, { language = "en", friends = FRIENDS, viewport = manualViewport("portrait") }: { language?: "en" | "ru"; friends?: string[]; viewport?: ReturnType<typeof manualViewport> } = {}) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 6, visitsFinished: friends.length, friends }) });
  openCareApp({ storage, viewport, portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].care }));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].friends }));
}

// jsdom does not lay out: capitals at a conservative 0.8 em with their
// spacing.
const capitalsWidth = (words: string, style: ReturnType<typeof styleAt>) => words.length * (style.px("font-size") * 0.8 + style.px("letter-spacing"));

// Whether every shipped name fits the two lines a friend card's footer
// holds, its cards `columns` to a row of the window of `size`: then every
// card is as tall as the others, and a turn keeps the list's place by its
// rows.
function namesFit(size: WindowSize, columns: number, language: "en" | "ru") {
  const page = styleAt(part(".friends"), size);
  const grid = styleAt(part(".friends-grid"), size);
  const footer = styleAt(part(".friend-footer"), size);
  const name = styleAt(part(".friend-name"), size);
  expect(name.value("white-space") || "normal").toBe("normal");
  expect([grid.value("grid-auto-rows"), footer.value("box-sizing"), footer.px("height")]).toEqual(["max-content", "border-box", footer.px("padding-top") + footer.px("padding-bottom") + 2 * name.px("line-height")]);
  const card = (size[0] - page.px("padding-left") - page.px("padding-right") - (columns - 1) * grid.columnGap()) / columns;
  const line = card - footer.px("padding-left") - footer.px("padding-right") - 20 - footer.columnGap();
  return SHIPPED_VISITORS.every((visitor) => capitalsWidth(visitor.name[language], name) <= 2 * line);
}

describe("care's friends upright", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, the cards two to a row under NEW VISITOR", (...size) => {
    openFriends(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const page = styleAt(part(".friends"), size);
    expect([page.px("padding-left"), page.px("padding-right")]).toEqual([32, 32]);
    expect(styleAt(part(".friends-grid"), size).value("grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(within(screen.getByRole("group", { name: TEXTS.en.friends })).getAllByRole("button")).toHaveLength(FRIENDS.length);
    const visitor = styleAt(screen.getByRole("button", { name: TEXTS.en.newVisitor }), size);
    expect([visitor.value("flex-basis"), visitor.value("justify-content")]).toEqual(["100%", "center"]);
    expect(styleAt(part(".friends-bar"), size).value("flex-wrap")).toBe("wrap");
    // NEW VISITOR comes last on the bar, so it alone wraps to the second
    // row; nothing is ordered ahead of the rest.
    const bar = [...part(".friends-bar").children] as HTMLElement[];
    expect(bar.at(-1)).toBe(screen.getByRole("button", { name: TEXTS.en.newVisitor }));
    expect(bar.map((each) => styleAt(each, size).value("order") || "0")).toEqual(bar.map(() => "0"));
    expect(styleAt(part(".friends-bar"), size).value("flex-direction") || "row").toBe("row");
  });

  it.each(["en", "ru"] as const)("keeps the bar on one row and every word in its room at 600 wide in %s", (language) => {
    const size: WindowSize = [600, 1000];
    openFriends(size, { language });
    const text = TEXTS[language];
    const page = styleAt(part(".friends"), size);
    const width = 600 - page.px("padding-left") - page.px("padding-right");

    for (const name of [text.back, text.home]) {
      const button = screen.getByRole("button", { name });
      expect(styleAt(button, size).px("width")).toBe(56);
      expect(button.querySelector(".upright-hidden")?.textContent).toBe(name);
    }
    // BACK, HOME, the title with its mark and the count with two digits
    // share the first row; NEW VISITOR wraps to its own.
    const bar = styleAt(part(".friends-bar"), size);
    const title = styleAt(part(".friends-title"), size);
    const mark = styleAt(part(".friends-mark"), size);
    const count = styleAt(part(".friend-count"), size);
    const titleWidth = title.px("padding-left") + mark.px("width") + title.columnGap() + capitalsWidth(text.friends, title);
    const countWidth = count.px("padding-left") + count.px("padding-right") + 20 + count.columnGap() + 2 * count.px("font-size") * 0.7;
    expect(56 + 56 + titleWidth + countWidth + 3 * bar.columnGap()).toBeLessThanOrEqual(width);

    const visitor = styleAt(part(".new-visitor-button"), size);
    expect(visitor.px("padding-left") + 24 + visitor.columnGap() + capitalsWidth(text.newVisitor, visitor) + visitor.px("padding-right")).toBeLessThanOrEqual(width);

    // Every friend's name in two lines of its card, half the row.
    expect(styleAt(part(".friend-name"), size).value("overflow-wrap")).toBe("anywhere");
    expect(namesFit(size, 2, language)).toBe(true);
  });

  it.each(["en", "ru"] as const)("stands the nest and NEW VISITOR in the middle with no friends at 600 wide in %s", (language) => {
    const size: WindowSize = [600, 1000];
    openFriends(size, { language, friends: [] });
    const text = TEXTS[language];
    expect([gateShown(), document.querySelector(".friends-grid")]).toEqual([false, null]);
    const page = styleAt(part(".friends"), size);
    const width = 600 - page.px("padding-left") - page.px("padding-right");
    expect(styleAt(part(".no-friends-picture"), size).px("width")).toBeLessThanOrEqual(width);
    // The words wrap between words, the longest word inside the width.
    const words = styleAt(part(".no-friends-text"), size);
    expect([words.value("white-space") || "normal", words.value("min-width") || "auto"]).toEqual(["normal", "auto"]);
    const longest = Math.max(...text.noFriends.split(" ").map((word) => capitalsWidth(word, words)));
    expect(longest).toBeLessThanOrEqual(width);
    const button = styleAt(part(".no-friends-button"), size);
    expect(button.px("padding-left") + 30 + button.columnGap() + capitalsWidth(text.newVisitor, button) + button.px("padding-right")).toBeLessThanOrEqual(width);
  });

  it("keeps the landscape friends as they were", () => {
    openFriends([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    expect(getComputedStyle(part(".friends")).paddingLeft).toBe("56px");
    expect(getComputedStyle(part(".friends-grid")).gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(getComputedStyle(part(".friends-bar")).flexWrap || "nowrap").toBe("nowrap");
    for (const language of ["en", "ru"] as const) expect(namesFit([1180, 820], 4, language), language).toBe(true);
  });

  // jsdom does not lay out: the list as a browser lays it out, four
  // cards to a row in landscape and two upright.
  const ROW_GAP = 20;
  const geometry = () => {
    const tall = document.documentElement.dataset.size === "tall";
    const columns = tall ? 2 : 4;
    const row = tall ? 330 : 260;
    const rows = Math.ceil(SHIPPED_VISITORS.length / columns);
    return { row, height: tall ? 900 : 600, scrollHeight: rows * row + (rows - 1) * ROW_GAP + 48 };
  };
  const laidOut = () => {
    const grid = part(".friends-grid");
    Object.defineProperties(grid, {
      clientHeight: { configurable: true, get: () => geometry().height },
      scrollHeight: { configurable: true, get: () => geometry().scrollHeight }
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.classList.contains("friend-card") ? geometry().row : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect;
    });
    return grid;
  };

  it.each([
    ["its end", (scrollHeight: number, height: number) => scrollHeight - height, (scrollHeight: number, height: number) => scrollHeight - height],
    ["the row of the 21st friend", () => 5 * (260 + ROW_GAP), () => 10 * (330 + ROW_GAP)]
  ] as const)("keeps the friends and the list at %s as the device turns, each card a part a turn glides", (_, landscape, upright) => {
    const viewport = manualViewport("landscape");
    openFriends([1180, 820], { viewport, friends: SHIPPED_VISITORS.map(({ id }) => id) });
    const grid = laidOut();
    const cards = within(grid).getAllByRole("button");
    expect(cards.map((card) => card.dataset.turnPart)).toEqual(SHIPPED_VISITORS.map(({ id }) => `care-friend-${id}`));
    grid.scrollTop = landscape(geometry().scrollHeight, geometry().height);
    fireEvent.scroll(grid);
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(part(".friends-grid")).toBe(grid);
    expect(within(grid).getAllByRole("button")).toEqual(cards);
    expect(grid.scrollTop).toBe(upright(geometry().scrollHeight, geometry().height));
  });
});
