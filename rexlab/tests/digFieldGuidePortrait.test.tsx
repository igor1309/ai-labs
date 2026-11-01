import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { board, openDigApp } from "./digApp.tsx";
import { homeTile, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dig-field-guide-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "dig-board": ["tall"], "dig-question": ["tall"], "dig-reveal": ["tall"], "dig-guide": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const everyKind = { shell: 1, tooth: 2, amber: 1, "egg-nest": 1, "golden-fossil": 1 };

// The FIELD GUIDE opened from DIG's board at Hatchling, in a window of `size`.
function openGuide(size: WindowSize, language: "en" | "ru" = "en") {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], treasures: everyKind } } }) });
  const app = openDigApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, ageLevel: { level: "hatchling", revision: null }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].fieldGuide }));
  return app;
}

describe("DIG's field guide upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, its cards in rows of two", (...size) => {
    openGuide(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    const page = styleAt(part(".dig-field-guide-screen"), size);
    expect([page.px("padding-left"), page.px("padding-right")]).toEqual([32, 32]);
    const room = styleAt(part(".dig-guide-cards"), size);
    expect([room.value("flex-wrap"), room.value("justify-content"), room.value("align-content")]).toEqual(["wrap", "center", "stretch"]);
    const cards = [...document.querySelectorAll<HTMLElement>(".dig-guide-card")];
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      const style = styleAt(card, size);
      expect([style.value("flex-basis"), style.value("height"), style.value("max-height")]).toEqual(["calc(0.5*(100% - 16px))", "auto", "none"]);
    }
  });

  it.each(["en", "ru"] as const)("keeps the bar on one row at 600 wide in %s, HOME and BACK as their symbols", (language) => {
    openGuide([600, 1000], language);
    const text = TEXTS[language];
    expect(styleAt(part(".dig-bar"), [600, 1000]).columnGap()).toBe(16);
    for (const name of [text.home, text.back]) {
      const button = screen.getByRole("button", { name });
      expect(styleAt(button, [600, 1000]).px("width")).toBe(56);
      expect(button.querySelector(".upright-hidden")?.textContent).toBe(name);
    }
    expect(styleAt(part(".dig-field-guide-screen .dig-title-words"), [600, 1000]).value("font-size")).toBe("min(40px, (100cqi - 66px) / (var(--letters) * 0.75))");
    expect([...document.querySelectorAll(".dig-guide-name")].map((name) => name.textContent)).toEqual(Object.values(text.treasures));
  });

  it("goes back to the board upright", () => {
    openGuide([820, 1180]);
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.back }));
    expect(board()).toBeTruthy();
    expect(gateShown()).toBe(false);
  });
});
