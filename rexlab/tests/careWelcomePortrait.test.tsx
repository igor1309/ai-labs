import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { openCareApp } from "./careApp.tsx";
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

describe("care's welcome upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, NEW VISITOR over FRIENDS", (...size) => {
    openWelcome(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const page = styleAt(part(".care-welcome"), size);
    expect([page.px("padding-left"), page.px("padding-right")]).toEqual([32, 32]);
    const choices = styleAt(part(".care-choices"), size);
    expect([choices.value("flex-direction"), choices.rowGap()]).toEqual(["column", 24]);
    expect(styleAt(part(".new-visitor-card"), size).value("flex-grow")).toBe("3");
    expect(styleAt(part(".friends-card"), size).value("flex-grow")).toBe("2");
  });

  it.each(["en", "ru"] as const)("keeps every word on one line at 600 wide in %s, HOME as its symbol", (language) => {
    openWelcome([600, 1000], language);
    const text = TEXTS[language];
    expect(styleAt(part(".care-bar"), [600, 1000]).columnGap()).toBe(16);
    const home = screen.getByRole("button", { name: text.home });
    expect(styleAt(home, [600, 1000]).px("width")).toBe(56);
    expect(home.querySelector(".upright-hidden")?.textContent).toBe(text.home);
    const title = styleAt(part(".new-visitor-title"), [600, 1000]);
    expect([title.px("font-size"), title.value("white-space")]).toEqual([40, "nowrap"]);
    // 600 less the margins, the footer's padding, symbol and gap leaves
    // 372 pixels; the eleven capitals take at most 0.8 em each.
    expect(text.newVisitor.length * 40 * 0.8).toBeLessThanOrEqual(600 - 64 - 80 - 64 - 20);
  });

  it("still asks to turn over a new visitor", () => {
    openWelcome([820, 1180]);
    act(() => { fireEvent.click(screen.getByRole("button", { name: TEXTS.en.newVisitor })); });
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
  });
});
