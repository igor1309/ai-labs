import "./careSheets.ts";
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
// A count of friends with its 20-pixel heart, as many as two digits.
const countWidth = (count: ReturnType<typeof styleAt>) => count.px("padding-left") + count.px("padding-right") + 20 + count.columnGap() + 2 * 0.8 * count.px("font-size");

const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

function openCare(size: WindowSize, language: "en" | "ru", viewport = narrowViewport(), friends = FRIENDS) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 6, visitsFinished: friends.length, friends }) });
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

// A visit upright on the dig site, 20 from the sides, HOME a 48-pixel
// symbol with its word for screen readers.
function visitScreen(size: WindowSize) {
  expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
  expect(part(".visit").classList.contains("skeleton-dig")).toBe(true);
  const page = styleAt(part(".visit"), size);
  expect([page.px("padding-left"), page.px("padding-right")]).toEqual([20, 20]);
  const home = part(".visit .home-button");
  expect(styleAt(home, size).px("width")).toBe(48);
  expect(home.querySelector(".upright-hidden")?.textContent).toBe(home.textContent);
}

describe("care upright on a phone", () => {
  it.each(BOTH)("stands the welcome upright at %i by %i in %s on the dig site, NEW VISITOR over FRIENDS", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    // The cards on the sand under the sky, 20 from the sides.
    const page = styleAt(part(".care-welcome"), size);
    expect([page.px("padding-left"), page.px("padding-right")]).toEqual([20, 20]);
    const home = screen.getByRole("button", { name: TEXTS[language].home });
    expect(styleAt(home, size).px("width")).toBe(48);
    expect(home.querySelector(".upright-hidden")?.textContent).toBe(TEXTS[language].home);
    const text = TEXTS[language];
    expect([styleAt(part(".care-choices"), size).value("flex-direction"), styleAt(part(".care-choices"), size).rowGap()]).toEqual(["column", 16]);
    // HOME, the title without its mark, and the best in the one row.
    expect(styleAt(part(".care-welcome .skeleton-mark"), size).value("display")).toBe("none");
    expect(part(".care-welcome .skeleton-title-words").textContent).toBe(text.care);
    expect(part(".care-best").getAttribute("aria-label")).toBe(text.bestScore);
    expect(styleAt(part(".care-faces"), size).value("grid-template-columns")).toBe("repeat(3, auto)");
    for (const pill of [".new-visitor-pill", ".friends-pill"]) expect(styleAt(part(pill), size).value("white-space")).toBe("nowrap");
  });

  it.each(BOTH)("stands a visit upright at %i by %i in %s, the needs under HOME and the hearts, the items in one row", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language);
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
    visitScreen(size);
    const bar = styleAt(part(".visit-bar"), size);
    expect([bar.value("flex-wrap"), bar.rowGap()]).toEqual(["wrap", 12]);
    const needs = styleAt(part(".needs"), size);
    expect([needs.value("position"), needs.value("order"), needs.value("flex-basis"), needs.value("justify-content")]).toEqual(["static", "1", "100%", "center"]);
    expect(all(".need")).toHaveLength(4);
    // Five items in their pockets, at least 48 square, each word hidden
    // from sight and naming it for screen readers.
    expect(all(".tray-item")).toHaveLength(5);
    for (const label of Object.values(TEXTS[language].items)) {
      const button = screen.getByRole("button", { name: label });
      expect([styleAt(button, size).px("min-width"), styleAt(button, size).px("min-height")]).toEqual([48, 48]);
      const words = styleAt(button.querySelector<HTMLElement>(".tray-label")!, size);
      expect([words.value("position"), words.value("overflow"), words.value("clip-path")]).toEqual(["absolute", "hidden", "inset(50%)"]);
    }
    expect(styleAt(part(".visitor-name"), size).value("white-space")).toBe("nowrap");
    // The stage keeps at least 200 pixels for the visitor, the screen
    // scrolling where the window is too short.
    expect(styleAt(part(".stage"), size).value("flex-basis")).toBe("200px");
    expect(styleAt(part(".visit"), size).value("height")).toBe("auto");
  });

  it.each(LANGUAGES)("keeps a visit's stage 200 tall in a short window in %s, the screen scrolling", (language) => {
    const size: WindowSize = [320, 420];
    openCare(size, language);
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
    visitScreen(size);
    expect(styleAt(part(".stage"), size).value("flex-basis")).toBe("200px");
    expect(styleAt(part(".stage"), size).value("flex-shrink")).toBe("0");
    expect([styleAt(part(".visit"), size).value("height"), styleAt(part(".visit"), size).value("overflow")]).toEqual(["auto", "visible"]);
  });

  it.each(BOTH)("stands FRIENDS upright at %i by %i in %s, the cards two to a row", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language);
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].friends }));
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["tall-narrow", false]);
    const text = TEXTS[language];
    expect(part(".friends").style.getPropertyValue("--friends-columns")).toBe("2");
    expect(styleAt(part(".friends-grid"), size).columnGap()).toBe(12);
    expect(styleAt(part(".friends-title"), size).value("position")).not.toBe("absolute");
    expect(screen.getByRole("heading").textContent).toBe(text.friends);
    expect(screen.getByRole("button", { name: text.home })).toBeDefined();
    expect(screen.getByRole("button", { name: text.back })).toBeDefined();
    expect(styleAt(part(".friend-name"), size).value("white-space")).toBe("nowrap");
    expect(part(".friend-footer").querySelector("svg")).toBeNull();
  });

  it.each(BOTH)("stands FRIENDS upright at %i by %i in %s with its nest in a round pit", (width, height, language) => {
    const size: WindowSize = [width, height];
    openCare(size, language, narrowViewport(), []);
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].friends }));
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["tall-narrow", false]);
    const text = TEXTS[language];
    const picture = styleAt(part(".no-friends-picture"), size);
    expect([picture.px("width"), picture.px("height"), picture.value("border-radius")]).toEqual([150, 150, "50%"]);
    expect(part(".no-friends-text").textContent).toBe(text.noFriends);
    expect(part(".friend-count").textContent).toBe("0");
    expect(screen.getByRole("button", { name: text.newVisitor }).querySelector("svg.lucide-footprints")).not.toBeNull();
    expect(screen.getByRole("button", { name: text.home })).toBeDefined();
    expect(screen.getByRole("button", { name: text.back })).toBeDefined();
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
    visitScreen([393, 852]);
  });
});
