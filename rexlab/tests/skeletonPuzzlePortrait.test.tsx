import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { fitAll, openPuzzle, skeletonOf, slots } from "./skeletonsApp.tsx";
import { manualViewport, memoryStorage, type ManualViewport } from "./support.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// skeleton-puzzle-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "skeletons-choice": ["tall"], "skeletons-puzzle": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// The Tyrannosaurus puzzle at `level` in a window of `size`.
async function openUpright(size: WindowSize, level: AgeLevel = "hatchling", viewport: ManualViewport = manualViewport("portrait")) {
  openWindow(...size);
  const ageLevels = memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });
  return { ...(await openPuzzle("TYRANNOSAURUS", { viewport, portraitLayouts: PORTRAIT_LAYOUTS, ageLevels })), viewport };
}

describe("the puzzle upright", () => {
  it.each([
    [[744, 1133], "hatchling"],
    [[820, 1180], "explorer"],
    [[600, 1000], "paleontologist"]
  ] as const)("stands upright at %j at %s, the board over the tray", async (size, level) => {
    await openUpright(size, level);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(styleAt(part(".skeleton-puzzle"), size).value("flex-direction")).toBe("column");
    expect(styleAt(part(".skeleton-puzzle .skeleton-board"), size).value("width")).toBe("min(100cqw, (100cqh - 28px) * 0.6 * var(--frame-width) / var(--frame-height))");
    // The puzzle under the 40 + 48 padding, a 56 bar and a 28 gap; the
    // board, at most the puzzle's width, leaves the tray at least a third
    // of the puzzle for its spots.
    const puzzle = { width: size[0] - 64, height: size[1] - 88 - 56 - 28 };
    const board = Math.min(puzzle.width, (puzzle.height - 28) * 0.6 * 800 / 600);
    expect(board).toBe(puzzle.width);
    expect(puzzle.height - 28 - board * 600 / 800).toBeGreaterThan(puzzle.height / 3);
  });

  it("fits every bone upright and completes the board", async () => {
    await openUpright([820, 1180]);
    fitAll(skeletonOf("tyrannosaurus"));
    expect(slots().map(([, state]) => state)).toEqual(["fitted", "fitted", "fitted", "fitted"]);
    expect(part(".skeleton-board").hasAttribute("data-complete")).toBe(true);
  });

  it("marks the board and the tray as parts a turn glides", async () => {
    await openUpright([820, 1180]);
    expect([part(".skeleton-board").getAttribute("data-turn-part"), part(".skeleton-tray").getAttribute("data-turn-part")]).toEqual(["skeleton-board", "skeleton-tray"]);
  });

  it("keeps the landscape puzzle as it was", async () => {
    await openUpright([1180, 820], "hatchling", manualViewport("landscape"));
    expect(gateShown()).toBe(false);
    expect(getComputedStyle(part(".skeleton-puzzle")).flexDirection || "row").toBe("row");
  });
});
