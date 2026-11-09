import "./careSheets.ts";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { CARE_ITEMS } from "../src/VisitScreen.tsx";
import { meetNeed, needAsked, playVisit, visitorShown } from "./care.ts";
import { heartsShown, needStates, openCareApp, welcomeVisitor } from "./careApp.tsx";
import { SHIPPED_VISITORS, manualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dinosaur-care-visit-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "care-welcome": ["tall"], "care-visit": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// A new visitor's visit in a window of `size`.
function openVisit(size: WindowSize, language: "en" | "ru" = "en") {
  openWindow(...size);
  const app = openCareApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].care }));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
  return app;
}

const THEME = {
  light: { label: "rgb(255, 253, 248)", strong: "rgb(31, 43, 77)", onStrong: "rgb(246, 242, 233)", action: "rgb(193, 80, 54)" },
  dark: { label: "rgb(28, 34, 56)", strong: "rgb(237, 229, 210)", onStrong: "rgb(29, 39, 66)", action: "rgb(229, 122, 93)" }
} as const;

describe("a care visit upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j on the dig site, the five items in one row on the sand under the stage", (...size) => {
    openVisit(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(part(".visit").classList.contains("skeleton-dig")).toBe(true);
    expect(part(".visit > .dig-ground")).toBeDefined();
    const page = styleAt(part(".visit"), size);
    expect([page.value("flex-direction"), page.value("overflow")]).toEqual(["column", "hidden"]);
    const stage = styleAt(part(".stage"), size);
    expect([stage.value("flex-grow"), stage.value("order") || "0"]).toEqual(["1", "0"]);
    expect(part(".stage").compareDocumentPosition(part(".tray")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The visitor stands large where the sky meets the sand.
    const visitor = styleAt(part(".stage > .visitor"), size);
    expect([visitor.value("left"), visitor.value("top"), visitor.value("width"), visitor.value("height")]).toEqual(["6%", "34%", "88%", "66%"]);
    expect(part(".visitor").querySelector(".visitor-picture")).not.toBeNull();
    const tray = styleAt(part(".tray"), size);
    expect([tray.value("flex-wrap") || "nowrap", tray.columnGap()]).toEqual(["nowrap", 12]);
    expect(document.querySelectorAll(".tray > .tray-item")).toHaveLength(CARE_ITEMS.length);
    expect(styleAt(part(".tray-item"), size).px("min-height")).toBe(48);
  });

  it.each(["en", "ru"] as const)("keeps HOME, the needs and the hearts in the sky and every word on one line at 600 wide in %s", (language) => {
    const size: WindowSize = [600, 1000];
    openVisit(size, language);
    const text = TEXTS[language];
    const home = screen.getByRole("button", { name: text.home });
    expect(styleAt(home, size).px("height")).toBe(48);
    expect(styleAt(part(".visit-bar"), size).value("flex-wrap") || "nowrap").toBe("nowrap");
    const needs = styleAt(part(".needs"), size);
    expect([needs.value("position"), needs.value("left")]).toEqual(["absolute", "50%"]);
    expect(all(".need")).toHaveLength(4);
    expect(styleAt(part(".visitor-name"), size).value("white-space")).toBe("nowrap");
    expect(styleAt(part(".tray-label"), size).value("white-space")).toBe("nowrap");
    for (const each of CARE_ITEMS) expect(screen.getByRole("button", { name: text.items[each] })).toBeDefined();
  });

  it("stands the landscape visit on the dig site", () => {
    openWindow(1180, 820);
    const { user } = openCareApp({ portraitLayouts: PORTRAIT_LAYOUTS });
    return welcomeVisitor(user).then(() => {
      expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
      expect(part(".visit").classList.contains("skeleton-dig")).toBe(true);
      expect(styleAt(part(".tray"), [1180, 820]).columnGap()).toBe(12);
      expect(getComputedStyle(part(".visitor-name")).fontSize).toBe("34px");
      const visitor = getComputedStyle(part(".stage > .visitor"));
      expect([visitor.left, visitor.top, visitor.width, visitor.height]).toEqual(["30%", "16%", "42%", "84%"]);
    });
  });

  it("keeps the visitor, the hearts and the needs as the device turns mid-visit, the stage and items parts a turn glides", async () => {
    openWindow(1180, 820);
    const viewport = manualViewport("landscape");
    const { user, clock } = openCareApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS });
    await welcomeVisitor(user);
    await meetNeed(user, clock);
    const before = { visitor: visitorShown().id, hearts: heartsShown(), needs: needStates(), asked: needAsked() };
    expect(before.needs).toContain("met");
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect({ visitor: visitorShown().id, hearts: heartsShown(), needs: needStates(), asked: needAsked() }).toEqual(before);
    expect([part(".stage").dataset.turnPart, part(".tray").dataset.turnPart]).toEqual(["care-stage", "care-tray"]);
  });

  it.each(["light", "dark"] as const)("dresses the hearts, the asked need and the bubble in the %s theme's tokens", (theme) => {
    const colours = THEME[theme];
    openVisit([820, 1180]);
    document.documentElement.dataset.theme = theme;
    onTestFinished(() => { delete document.documentElement.dataset.theme; });
    expect(getComputedStyle(part(".hearts-counter")).backgroundColor).toBe(colours.label);
    expect(getComputedStyle(part('.need[data-state="current"]')).backgroundColor).toBe(colours.action);
    expect(getComputedStyle(part(".need-bubble")).backgroundColor).toBe(colours.label);
  });
});
