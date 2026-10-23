import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, brushAll, choiceCard, finishBoard, openDigApp, placeBoard } from "./digApp.tsx";
import { homeTile, manualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dig-question-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "dig-board": ["tall"], "dig-question": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const slots = () => [...document.querySelectorAll<HTMLElement>(".dig-choice-slot")];

// DIG's board at `level`, in a window of `size`.
function openBoard(size: WindowSize, level: "explorer" | "paleontologist", language: "en" | "ru" = "en") {
  openWindow(...size);
  const opened = openDigApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, ageLevel: { level, revision: null }, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  return opened;
}

describe("WHO IS IT? upright", () => {
  it.each([[744, 1133, "explorer", 3], [820, 1180, "explorer", 3], [600, 1000, "paleontologist", 4]] as const)("stands upright at %i by %i at %s, %i card places in a row under the sand", (width, height, level, count) => {
    const size: WindowSize = [width, height];
    openBoard(size, level);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(styleAt(part(".dig-body"), size).value("flex-direction")).toBe("column");
    const sand = styleAt(board(), size);
    expect([sand.value("width"), sand.value("height"), sand.value("max-height")]).toEqual(["min(100cqw, (100cqh - 198px) * var(--frame-width) / var(--frame-height))", "auto", "none"]);
    const row = styleAt(part(".dig-choice-cards"), size);
    expect([row.value("flex-direction"), row.value("flex-basis"), row.columnGap()]).toEqual(["row", "170px", 16]);
    expect(slots()).toHaveLength(count);
    for (const slot of slots()) expect([styleAt(slot, size).value("max-height"), styleAt(slot, size).value("min-width")]).toEqual(["none", "0px"]);
  });

  it.each(["en", "ru"] as const)("keeps every card's name on one line at 600 wide in %s", (language) => {
    openBoard([600, 1000], "paleontologist", language);
    brushAll();
    const cards = [...document.querySelectorAll<HTMLElement>(".dig-choice-card")];
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      const name = styleAt(part(`.dig-choice-card[data-choice="${card.dataset.choice}"] .dig-choice-name`), [600, 1000]);
      expect([name.value("white-space"), name.value("font-size")]).toEqual(["nowrap", "min(14px, calc(100cqi / (var(--letters) * 0.75)))"]);
    }
  });

  it("goes on to the reveal, which asks to turn, once the dinosaur is picked upright", () => {
    const { timers } = openBoard([820, 1180], "explorer");
    placeBoard(800);
    brushAll();
    expect(gateShown()).toBe(false);
    fireEvent.click(choiceCard());
    finishBoard(timers);
    expect(document.querySelector(".dig-reveal-screen")).not.toBeNull();
    expect(gateShown()).toBe(true);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeTruthy();
  });
});
