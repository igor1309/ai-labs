import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computedStyleWithVariables } from "./stylesheet.ts";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { careRecord, openCareApp } from "./careApp.tsx";
import { SHIPPED_VISITORS, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dinosaur-care-friends-portrait.feature in the app.

const browserStyle = computedStyleWithVariables(window.getComputedStyle.bind(window));

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "care-welcome": ["tall"], "care-friends": ["tall"] };
const NARROW_LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "care-welcome": ["tall", "tall-narrow"], "care-friends": ["tall", "tall-narrow"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const FRIENDS = SHIPPED_VISITORS.slice(0, 3).map(({ id }) => id);

// FRIENDS with `friends` in a window of `size`.
function openFriends(size: WindowSize, { language = "en", friends = FRIENDS, viewport = manualViewport("portrait"), layouts = PORTRAIT_LAYOUTS }: { language?: "en" | "ru"; friends?: string[]; viewport?: ReturnType<typeof manualViewport>; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 6, visitsFinished: friends.length, friends }) });
  openCareApp({ storage, viewport, portraitLayouts: layouts, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].care }));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].friends }));
}

describe("care's friends upright", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(browserStyle);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j with two columns and its own action row", (...size) => {
    openFriends(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(part(".friends").style.getPropertyValue("--friends-columns")).toBe("2");
    expect(within(screen.getByRole("group", { name: TEXTS.en.friends })).getAllByRole("button")).toHaveLength(FRIENDS.length);
    expect(styleAt(part(".friends-invite"), size).value("grid-column")).toBe("1 / -1");
    expect([...part(".friends-bar").children].at(-1)?.contains(screen.getByRole("button", { name: TEXTS.en.newVisitor }))).toBe(true);
    expect(styleAt(part(".friends-grid"), size).value("overflow-y")).toBe("auto");
  });

  it.each(["en", "ru"] as const)("names HOME and BACK, shows the title, zero count and nest invite in %s", (language) => {
    openFriends([600, 1000], { language, friends: [] });
    const text = TEXTS[language];
    expect([gateShown(), document.querySelector(".friends-grid")]).toEqual([false, null]);
    expect(screen.getByRole("button", { name: text.home }).querySelector("svg.lucide-house")).not.toBeNull();
    expect(screen.getByRole("button", { name: text.back }).querySelector("svg.lucide-arrow-left")).not.toBeNull();
    expect(screen.getByRole("heading").textContent).toBe(text.friends);
    expect(part(".friend-count").textContent).toBe("0");
    expect(part(".no-friends-nest")).toBeDefined();
    expect(part(".no-friends-text").textContent).toBe(text.noFriends);
    fireEvent.click(screen.getByRole("button", { name: text.home }));
    expect(document.querySelector(".home")).not.toBeNull();
  });

  // jsdom does not lay out: the list as a browser lays it out, five
  // cards to a row in landscape and two upright, on a phone too.
  const ROW_GAP = 16;
  const ROWS = { tall: 330, "tall-narrow": 250 } as Record<string, number>;
  const geometry = () => {
    const upright = ROWS[document.documentElement.dataset.size ?? ""];
    const columns = Number(part(".friends").style.getPropertyValue("--friends-columns"));
    const row = upright ?? 260;
    const rows = Math.ceil(SHIPPED_VISITORS.length / columns);
    const height = { tall: 900, "tall-narrow": 400 }[document.documentElement.dataset.size ?? ""] ?? 600;
    return { row, height, scrollHeight: rows * row + (rows - 1) * ROW_GAP + 48 };
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
    ["the row of the 21st friend", () => 4 * (260 + ROW_GAP), () => 10 * (330 + ROW_GAP)]
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

  it("keeps the anchored friend when a landscape window grows from five columns to seven", () => {
    const viewport = manualViewport("landscape");
    openFriends([1133, 744], { viewport, friends: SHIPPED_VISITORS.map(({ id }) => id) });
    const grid = laidOut();
    grid.scrollTop = 4 * (260 + ROW_GAP);
    fireEvent.scroll(grid);
    openWindow(1440, 900);
    act(() => viewport.resize("wide", false));
    expect(part(".friends").style.getPropertyValue("--friends-columns")).toBe("7");
    expect(part(".friends-grid")).toBe(grid);
    expect(grid.scrollTop).toBe(2 * (260 + ROW_GAP));
  });

  it.each([
    ["landscape", "wide", [1180, 820], 4 * (260 + ROW_GAP)],
    ["a tall window", "tall", [820, 1180], 10 * (330 + ROW_GAP)]
  ] as const)("keeps the list at the row of the 21st friend as %s narrows to a phone, two cards to a row", (_, from, size, scrolled) => {
    const viewport = manualViewport(from === "wide" ? "landscape" : "portrait");
    openFriends(size, { viewport, friends: SHIPPED_VISITORS.map(({ id }) => id), layouts: NARROW_LAYOUTS });
    expect(document.documentElement.dataset.size).toBe(from);
    const grid = laidOut();
    grid.scrollTop = scrolled;
    fireEvent.scroll(grid);
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".friends-grid")]).toEqual(["tall-narrow", false, grid]);
    // The 21st friend's row, the tenth, its rows the phone's 12 apart.
    expect(grid.scrollTop).toBe(10 * (250 + 12));
  });
});
