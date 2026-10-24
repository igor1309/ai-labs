import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

describe("care's friends upright", () => {
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

    // Every friend's name wraps inside its card, half the row.
    expect(styleAt(part(".friend-name"), size).value("overflow-wrap")).toBe("anywhere");
  });

  it.each(["en", "ru"] as const)("stands the nest and NEW VISITOR in the middle with no friends at 600 wide in %s", (language) => {
    const size: WindowSize = [600, 1000];
    openFriends(size, { language, friends: [] });
    const text = TEXTS[language];
    expect([gateShown(), document.querySelector(".friends-grid")]).toEqual([false, null]);
    const page = styleAt(part(".friends"), size);
    const width = 600 - page.px("padding-left") - page.px("padding-right");
    expect(styleAt(part(".no-friends-picture"), size).px("width")).toBeLessThanOrEqual(width);
    expect(styleAt(part(".no-friends-text"), size).value("white-space") || "normal").toBe("normal");
    const button = styleAt(part(".no-friends-button"), size);
    expect(button.px("padding-left") + 30 + button.columnGap() + capitalsWidth(text.newVisitor, button) + button.px("padding-right")).toBeLessThanOrEqual(width);
  });

  it("keeps the landscape friends as they were", () => {
    openFriends([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    expect(getComputedStyle(part(".friends")).paddingLeft).toBe("56px");
    expect(getComputedStyle(part(".friends-grid")).gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(getComputedStyle(part(".friends-bar")).flexWrap || "nowrap").toBe("nowrap");
  });

  it("keeps the friends and the scroll as the device turns, the cards a part a turn glides", () => {
    const viewport = manualViewport("landscape");
    openFriends([1180, 820], { viewport, friends: SHIPPED_VISITORS.map(({ id }) => id) });
    const grid = part(".friends-grid");
    const cards = within(grid).getAllByRole("button");
    grid.scrollTop = 400;
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(part(".friends-grid")).toBe(grid);
    expect(within(grid).getAllByRole("button")).toEqual(cards);
    expect(grid.scrollTop).toBe(400);
    expect(grid.dataset.turnPart).toBe("care-friends-grid");
  });
});
