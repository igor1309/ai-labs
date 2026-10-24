import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { playVisit } from "./care.ts";
import { careRecord, openCareApp } from "./careApp.tsx";
import { SHIPPED_VISITORS, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// Care's screens in a tall-narrow window: an iPhone upright.

const NARROW_LAYOUTS: PortraitLayouts = {
  home: ["tall", "tall-narrow"], "care-welcome": ["tall", "tall-narrow"], "care-visit": ["tall", "tall-narrow"],
  "care-friends": ["tall", "tall-narrow"], "care-result": ["tall", "tall-narrow"]
};

const PHONES = [[320, 568], [375, 667], [393, 852], [430, 932]] as const;
const LANGUAGES = ["en", "ru"] as const;
const BOTH = PHONES.flatMap((size) => LANGUAGES.map((language) => [...size, language] as const));
const FRIENDS = SHIPPED_VISITORS.slice(0, 3).map(({ id }) => id);

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
// jsdom does not lay out: capitals at a conservative 0.8 em with their
// spacing.
const capitalsWidth = (words: string, style: ReturnType<typeof styleAt>) => words.length * (style.px("font-size") * 0.8 + style.px("letter-spacing"));

const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

function openCare(size: WindowSize, language: "en" | "ru", viewport = narrowViewport()) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 6, visitsFinished: FRIENDS.length, friends: FRIENDS }) });
  const app = openCareApp({ storage, viewport, portraitLayouts: NARROW_LAYOUTS, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].care }));
  return app;
}

// The screen stands upright with its 20-pixel sides, its parts 16 apart,
// HOME and BACK 48-pixel symbols with their words for screen readers.
function phoneScreen(selector: string, size: WindowSize, top = 24) {
  expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
  expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
  const page = styleAt(part(selector), size);
  expect([page.px("padding-top"), page.px("padding-left"), page.px("padding-right"), page.rowGap()]).toEqual([top, 20, 20, top === 24 ? 16 : 20]);
  for (const button of all(`${selector} header .home-button`)) {
    expect(styleAt(button, size).px("width")).toBe(48);
    expect(button.querySelector(".upright-hidden")?.textContent).toBe(button.textContent);
  }
}

describe("care upright on a phone", () => {
  it.each(BOTH)("stands the welcome upright at %i by %i in %s, NEW VISITOR over FRIENDS", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language);
    phoneScreen(".care-welcome", size);
    const text = TEXTS[language];
    expect([styleAt(part(".care-choices"), size).value("flex-direction"), styleAt(part(".care-choices"), size).rowGap()]).toEqual(["column", 16]);
    // The bar's HOME, the title's words and the best score in one row.
    const title = styleAt(part(".care-title"), size);
    const best = styleAt(part(".care-best"), size);
    expect(styleAt(part(".care-bar .care-mark"), size).value("display")).toBe("none");
    expect(48 + 8 + capitalsWidth(text.care, title) + 8 + best.px("padding-left") + best.px("padding-right") + 20 + best.columnGap() + 3 * 0.8 * best.px("font-size")).toBeLessThanOrEqual(width - 40);
    // NEW VISITOR beside its symbol, FRIENDS beside its own.
    const footer = styleAt(part(".new-visitor-footer"), size);
    const words = styleAt(part(".new-visitor-title"), size);
    expect(footer.px("padding-left") + footer.px("padding-right") + 48 + footer.columnGap() + capitalsWidth(text.newVisitor, words)).toBeLessThanOrEqual(width - 40);
    const card = styleAt(part(".friends-card"), size);
    const friends = styleAt(part(".friends-row .friends-title"), size);
    expect(card.px("padding-left") + card.px("padding-right") + 48 + 12 + capitalsWidth(text.friends, friends)).toBeLessThanOrEqual(width - 40);
  });

  it.each(BOTH)("stands a visit upright at %i by %i in %s, the needs under HOME and the hearts, the items in one row", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language);
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
    phoneScreen(".visit", size);
    const bar = styleAt(part(".visit-bar"), size);
    expect([bar.value("flex-wrap"), bar.rowGap()]).toEqual(["wrap", 12]);
    const needs = styleAt(part(".needs"), size);
    expect([needs.value("order"), needs.value("flex-basis"), needs.value("justify-content")]).toEqual(["1", "100%", "space-around"]);
    const needList = all(".need");
    expect(needList).toHaveLength(4);
    for (const need of needList) expect(styleAt(need, size).px("width")).toBe(48);
    expect(2 * 4 + 4 * 48).toBeLessThanOrEqual(width - 40);
    const hearts = styleAt(part(".hearts-counter"), size);
    expect(48 + 8 + hearts.px("padding-left") + hearts.px("padding-right") + 24 + hearts.columnGap() + 2 * 0.8 * hearts.px("font-size")).toBeLessThanOrEqual(width - 40);
    // Five items, 6 apart, each at least 44 wide and 72 tall, its word
    // kept for screen readers.
    const tray = styleAt(part(".tray"), size);
    const items = all(".tray-item");
    expect(items).toHaveLength(5);
    expect((width - 40 - 4 * tray.columnGap()) / 5).toBeGreaterThanOrEqual(44);
    for (const item of items) {
      expect([styleAt(item, size).px("height"), styleAt(item.querySelector<HTMLElement>(".tray-label")!, size).value("position")]).toEqual([72, "absolute"]);
      expect(item.textContent).not.toBe("");
    }
    const name = styleAt(part(".visitor-name"), size);
    expect([name.px("left"), name.px("font-size")]).toEqual([16, 22]);
    // The stage keeps at least 200 pixels of height for the visitor.
    expect(height - 24 - 32 - (48 + 12 + 56) - 72 - 2 * 16).toBeGreaterThanOrEqual(200);
  });

  it.each(BOTH)("stands FRIENDS upright at %i by %i in %s, the cards two to a row", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language);
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].friends }));
    phoneScreen(".friends", size);
    const text = TEXTS[language];
    const grid = styleAt(part(".friends-grid"), size);
    expect([grid.value("grid-template-columns"), grid.columnGap()]).toEqual(["repeat(2, minmax(0, 1fr))", 12]);
    // BACK, HOME and the title's words on the first row.
    const title = styleAt(part(".friends-bar .friends-title"), size);
    expect(styleAt(part(".friends-bar .friends-mark"), size).value("display")).toBe("none");
    expect(48 + 8 + 48 + 8 + capitalsWidth(text.friends, title)).toBeLessThanOrEqual(width - 40);
    // Every shipped name in its card's three lines.
    const footer = styleAt(part(".friend-footer"), size);
    const name = styleAt(part(".friend-name"), size);
    expect(footer.px("height")).toBe(footer.px("padding-top") + footer.px("padding-bottom") + 3 * name.px("line-height"));
    const line = (width - 40 - grid.columnGap()) / 2 - footer.px("padding-left") - footer.px("padding-right") - 20 - footer.columnGap();
    for (const visitor of SHIPPED_VISITORS) expect(capitalsWidth(visitor.name[language], name), visitor.name[language]).toBeLessThanOrEqual(3 * line);
  });

  it.each(BOTH)("stands the result upright at %i by %i in %s, its eight hearts on one row", async (width, height, language) => {
    const size: WindowSize = [width, height];
    const app = openCare(size, language);
    await app.user.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
    await playVisit(app.user, app.clock);
    act(() => app.clock.settle());
    phoneScreen(".care-result", size, 20);
    const text = TEXTS[language];
    expect(styleAt(part(".care-result .result-hero"), size).px("max-height")).toBe(Math.min(480, (width - 40) * 3 / 4));
    const hearts = styleAt(part(".result-hearts"), size);
    const heart = styleAt(part(".result-heart svg"), size);
    expect(all(".result-heart")).toHaveLength(8);
    expect([hearts.value("flex-wrap"), heart.px("width")]).toEqual(["nowrap", 28]);
    expect(8 * 28 + 7 * hearts.columnGap()).toBeLessThanOrEqual(width - 40);
    for (const name of [text.newVisitor, text.friends, text.home]) {
      const own = styleAt(screen.getByRole("button", { name }), size);
      expect([own.px("height"), own.value("white-space")]).toEqual([64, "nowrap"]);
      expect(own.px("padding-left") + own.px("padding-right") + 28 + own.columnGap() + capitalsWidth(name, own), name).toBeLessThanOrEqual(width - 40);
    }
    const chip = styleAt(part(".friend-chip"), size);
    const visitorName = part(".friend-chip").textContent ?? "";
    expect(chip.px("padding-left") + chip.px("padding-right") + 22 + chip.columnGap() + capitalsWidth(visitorName, chip), visitorName).toBeLessThanOrEqual(width - 40);
  });

  it("takes the phone's sizes as a tall window narrows over a visit, asking nothing", () => {
    const viewport = manualViewport("portrait");
    openCare([820, 1180], "en", viewport);
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.newVisitor }));
    const stage = part(".stage");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".stage")]).toEqual(["tall-narrow", false, stage]);
    phoneScreen(".visit", [393, 852]);
  });
});
