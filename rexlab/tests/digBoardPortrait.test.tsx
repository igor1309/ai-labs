import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, cleared, drag, openDigApp, placeBoard } from "./digApp.tsx";
import { homeTile, manualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// dig-board-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "dig-board": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// DIG's board at `level`, in a window of `size`.
function openBoard(size: WindowSize, level: "hatchling" | "explorer" = "hatchling") {
  openWindow(...size);
  const opened = openDigApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, ageLevel: { level, revision: null } });
  fireEvent.click(homeTile("DIG"));
  return opened;
}

describe("DIG's board upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, the sand as wide as the window leaves it", (...size) => {
    openBoard(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const page = styleAt(part(".dig-board-screen"), size);
    expect([page.px("padding-left"), page.px("padding-right")]).toEqual([32, 32]);
    expect(styleAt(part(".dig-body"), size).value("container-type")).toBe("size");
    const sand = styleAt(board(), size);
    expect([sand.value("width"), sand.value("height"), sand.value("touch-action")]).toEqual(["min(100cqw, 100cqh * var(--frame-width) / var(--frame-height))", "auto", "none"]);
  });

  it("keeps the bar on one row at 600 wide, HOME as its symbol named for screen readers", () => {
    openBoard([600, 1000]);
    expect(styleAt(part(".dig-bar"), [600, 1000]).columnGap()).toBe(16);
    const home = screen.getByRole("button", { name: TEXTS.en.home });
    expect(styleAt(home, [600, 1000]).px("width")).toBe(56);
    expect(home.querySelector(".upright-hidden")?.textContent).toBe(TEXTS.en.home);
    for (const name of [TEXTS.en.brush, TEXTS.en.wideBrush, TEXTS.en.fieldGuide]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("brushes the sand along a stroke upright", () => {
    openBoard([820, 1180]);
    placeBoard(756);
    drag([[0, 200], [700, 200]]);
    expect(cleared()).toBeGreaterThan(0);
    expect(gateShown()).toBe(false);
  });

  it("still asks to turn over a board that asks WHO IS IT?", () => {
    openBoard([820, 1180], "explorer");
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
  });
});
