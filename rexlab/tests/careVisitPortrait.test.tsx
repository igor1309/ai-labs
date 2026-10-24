import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// A new visitor's visit in a window of `size`.
function openVisit(size: WindowSize, language: "en" | "ru" = "en") {
  openWindow(...size);
  const app = openCareApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].care }));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].newVisitor }));
  return app;
}

// jsdom does not lay out: capitals at a conservative 0.8 em with their
// spacing.
const capitalsWidth = (words: string, style: ReturnType<typeof styleAt>) => words.length * (style.px("font-size") * 0.8 + style.px("letter-spacing"));

describe("a care visit upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, the five items in one row under the stage", (...size) => {
    openVisit(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const page = styleAt(part(".visit"), size);
    expect([page.value("flex-direction"), page.px("padding-left"), page.px("padding-right")]).toEqual(["column", 32, 32]);
    // The stage takes the column's whole width and the room left, the
    // tray after it.
    const stage = styleAt(part(".stage"), size);
    expect([stage.value("flex-grow"), stage.value("width") || "auto", stage.value("max-width") || "none", stage.value("order") || "0"]).toEqual(["1", "auto", "none", "0"]);
    expect(styleAt(part(".tray"), size).value("order") || "0").toBe("0");
    expect(part(".stage").compareDocumentPosition(part(".tray")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The visitor stands larger and lower on it, its picture inside.
    const visitor = styleAt(part(".stage > .visitor"), size);
    expect([visitor.value("left"), visitor.value("top"), visitor.value("width"), visitor.value("height")]).toEqual(["8%", "30%", "84%", "62%"]);
    expect(part(".visitor").querySelector(".visitor-picture")).not.toBeNull();
    const tray = styleAt(part(".tray"), size);
    expect([tray.value("flex-wrap") || "nowrap", tray.columnGap()]).toEqual(["nowrap", 10]);
    expect(document.querySelectorAll(".tray > .tray-item")).toHaveLength(CARE_ITEMS.length);
    // The items share the row the page leaves them, none held wider.
    const item = styleAt(part(".tray-item"), size);
    expect([item.value("flex-grow"), item.px("min-width")]).toEqual(["1", 0]);
  });

  it.each(["en", "ru"] as const)("keeps the bar on one row and every word on one line at 600 wide in %s", (language) => {
    const size: WindowSize = [600, 1000];
    openVisit(size, language);
    const text = TEXTS[language];
    const page = styleAt(part(".visit"), size);
    const width = 600 - page.px("padding-left") - page.px("padding-right");

    const home = screen.getByRole("button", { name: text.home });
    expect(styleAt(home, size).px("width")).toBe(56);
    expect(home.querySelector(".upright-hidden")?.textContent).toBe(text.home);
    // The bar's parts at their set sizes: HOME, the four needs in their
    // padded strip, and the hearts with a two-digit count.
    const bar = styleAt(part(".visit-bar"), size);
    expect(bar.value("flex-wrap") || "nowrap").toBe("nowrap");
    const needs = styleAt(part(".needs"), size);
    const need = styleAt(part(".need"), size);
    const hearts = styleAt(part(".hearts-counter"), size);
    const needsWidth = 4 * need.px("width") + 3 * needs.columnGap() + needs.px("padding-left") + needs.px("padding-right");
    const heartsWidth = hearts.px("padding-left") + hearts.px("padding-right") + 28 + hearts.columnGap() + 2 * hearts.px("font-size") * 0.7;
    expect(56 + needsWidth + heartsWidth + 2 * bar.columnGap()).toBeLessThanOrEqual(width);

    // Every visitor's name, on one line from its place on the stage.
    const name = styleAt(part(".visitor-name"), size);
    expect(name.value("white-space")).toBe("nowrap");
    const longest = Math.max(...SHIPPED_VISITORS.map((visitor) => capitalsWidth(visitor.name[language], name)));
    expect(longest).toBeLessThanOrEqual(width - 2 * name.px("left"));

    // The need's bubble under the name: its top, a share of the stage
    // the column leaves at this height, below the name's line.
    const bubble = styleAt(part(".stage > .need-bubble"), size);
    const tray = styleAt(part(".tray"), size);
    const item = styleAt(part(".tray-item"), size);
    const stageHeight = 1000 - page.px("padding-top") - page.px("padding-bottom") - 56 - item.px("height") - 2 * page.rowGap();
    expect((Number.parseFloat(bubble.value("top")) / 100) * stageHeight).toBeGreaterThanOrEqual(name.px("top") + name.px("font-size"));

    // Every item's word, inside its share of the row.
    const room = (width - (CARE_ITEMS.length - 1) * tray.columnGap()) / CARE_ITEMS.length - item.px("padding-left") - item.px("padding-right");
    const label = styleAt(part(".tray-label"), size);
    expect(label.value("white-space")).toBe("nowrap");
    for (const each of CARE_ITEMS) expect(capitalsWidth(text.items[each], label), text.items[each]).toBeLessThanOrEqual(room);
  });

  it("keeps the landscape visit as it was", () => {
    openWindow(1180, 820);
    const { user } = openCareApp({ portraitLayouts: PORTRAIT_LAYOUTS });
    return welcomeVisitor(user).then(() => {
      expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
      expect(getComputedStyle(part(".visit")).paddingLeft).toBe("56px");
      expect(getComputedStyle(part(".tray")).gap).toBe("20px");
      expect(getComputedStyle(part(".tray-item")).minWidth).toBe("120px");
      expect(getComputedStyle(part(".visitor-name")).fontSize).toBe("36px");
      expect(screen.getByRole("button", { name: TEXTS.en.home }).querySelector(".upright-hidden")).not.toBeNull();
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

  it("still asks to turn over the result", async () => {
    openWindow(1180, 820);
    const viewport = manualViewport("landscape");
    const { user, clock } = openCareApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS });
    await welcomeVisitor(user);
    await playVisit(user, clock);
    act(() => clock.settle());
    expect(screen.getByLabelText("SCORE")).toBeTruthy();
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
  });
});
