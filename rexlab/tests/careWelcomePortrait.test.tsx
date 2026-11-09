import "./careSheets.ts";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { playVisit } from "./care.ts";
import { openCareApp, welcomeVisitor } from "./careApp.tsx";
import { manualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dinosaur-care-welcome-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "care-welcome": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// Care's welcome in a window of `size`.
function openWelcome(size: WindowSize, language: "en" | "ru" = "en") {
  openWindow(...size);
  const app = openCareApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: language === "ru" ? "ru-RU" : "en-GB" });
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].care }));
  return app;
}

const THEME = {
  light: { label: "rgb(255, 253, 248)", strong: "rgb(31, 43, 77)", onStrong: "rgb(246, 242, 233)", action: "rgb(193, 80, 54)" },
  dark: { label: "rgb(28, 34, 56)", strong: "rgb(237, 229, 210)", onStrong: "rgb(29, 39, 66)", action: "rgb(229, 122, 93)" }
} as const;

describe("care's welcome on the dig site", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, NEW VISITOR over FRIENDS on the sand", (...size) => {
    openWelcome(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(part(".care-welcome").classList.contains("skeleton-dig")).toBe(true);
    expect(part(".care-welcome .dig-ground")).toBeTruthy();
    const choices = styleAt(part(".care-choices"), size);
    expect([choices.value("flex-direction"), choices.rowGap()]).toEqual(["column", 24]);
    expect(styleAt(part(".new-visitor-card"), size).value("flex-grow")).toBe("2.4");
    expect(styleAt(part(".friends-card"), size).value("flex-grow")).toBe("1");
    expect(styleAt(part(".care-faces"), size).value("grid-template-columns")).toBe("repeat(6, auto)");
  });

  it.each(["en", "ru"] as const)("keeps HOME a symbol upright and every pill on one line in %s", (language) => {
    openWelcome([600, 1000], language);
    const text = TEXTS[language];
    const home = screen.getByRole("button", { name: text.home });
    expect(styleAt(home, [600, 1000]).px("width")).toBe(48);
    expect(home.querySelector(".upright-hidden")?.textContent).toBe(text.home);
    expect(part(".skeleton-title-words").textContent).toBe(text.care);
    for (const pill of [".new-visitor-pill", ".friends-pill"]) expect(styleAt(part(pill), [600, 1000]).value("white-space")).toBe("nowrap");
    expect(part(".new-visitor-pill").textContent).toBe(text.newVisitor);
    expect(part(".friends-pill").textContent).toBe(text.friends);
  });

  it("lays NEW VISITOR beside FRIENDS in landscape, the wider of the two", () => {
    openWindow(1180, 820);
    openCareApp({ portraitLayouts: PORTRAIT_LAYOUTS });
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.care }));
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const choices = styleAt(part(".care-choices"), [1180, 820]);
    expect([choices.value("flex-direction") || "row", choices.columnGap()]).toEqual(["row", 24]);
    expect([getComputedStyle(part(".new-visitor-card")).flexGrow, getComputedStyle(part(".friends-card")).flexGrow]).toEqual(["1.75", "1"]);
    expect(screen.getByRole("button", { name: TEXTS.en.home }).querySelector(".upright-hidden")).not.toBeNull();
  });

  it("marks both cards as parts a turn glides", () => {
    openWelcome([820, 1180]);
    expect([part(".new-visitor-card").dataset.turnPart, part(".friends-card").dataset.turnPart]).toEqual(["care-new-visitor", "care-friends"]);
  });

  it.each(["light", "dark"] as const)("dresses the cards and pills in the %s theme's tokens", (theme) => {
    const colours = THEME[theme];
    openWelcome([820, 1180]);
    document.documentElement.dataset.theme = theme;
    onTestFinished(() => { delete document.documentElement.dataset.theme; });
    for (const card of [".new-visitor-card", ".friends-card"]) expect(getComputedStyle(part(card)).backgroundColor).toBe(colours.label);
    expect(getComputedStyle(part(".new-visitor-pill")).backgroundColor).toBe(colours.action);
    const friends = getComputedStyle(part(".friends-pill"));
    expect([friends.backgroundColor, friends.color]).toEqual([colours.strong, colours.onStrong]);
    expect(getComputedStyle(part(".knock-bubble")).color).toBe(colours.action);
  });
});
