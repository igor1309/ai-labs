import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import { finishLoading, fitAll, keptSkeletons, layOutPuzzle, openSkeletonsApp, shownTexts, skeletonOf } from "./skeletonsApp.tsx";
import { manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// skeleton-guess-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "skeletons-choice": ["tall"], "skeletons-puzzle": ["tall"], "skeletons-guess": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const guesses = () => within(screen.getByRole("group", { name: shownTexts().whoseSkeleton })).getAllByRole("button");

// The mystery Triceratops finished in a window of `size`, asking whose
// skeleton it is.
async function openGuess(size: WindowSize, { viewport = manualViewport("portrait"), deviceLanguage = "en-GB" }: { viewport?: ManualViewport; deviceLanguage?: string } = {}) {
  openWindow(...size);
  const opened = openSkeletonsApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage, storage: keptSkeletons({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [] }), random: () => 0.6 });
  await opened.user.click(screen.getByRole("button", { name: shownTexts().mystery }));
  act(() => finishLoading(opened.pictures));
  layOutPuzzle();
  fitAll(skeletonOf("triceratops"));
  act(() => opened.pictures.fire(REVEAL.motion));
  return { ...opened, viewport };
}

describe("the mystery's guess upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, the skeleton over three cards side by side", async (...size) => {
    await openGuess(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(styleAt(part(".skeleton-reveal"), size).value("flex-direction")).toBe("column");
    expect(styleAt(part(".skeleton-reveal-board"), size).value("width")).toBe("min(100cqw - 80px, (100cqh - 36px - 340px) * var(--frame-width) / var(--frame-height))");
    expect(styleAt(part(".skeleton-guess"), size).px("min-height")).toBe(340);
    expect(styleAt(part(".skeleton-guess-choices"), size).value("flex-direction")).toBe("row");
    expect(guesses()).toHaveLength(3);
    // The room under the sky, its 172 + 8, the 28 + 32 at the foot and the
    // 32 sides: the board at its widest leaves the cards at least their 340.
    const room = { width: size[0] - 64 - 80, height: size[1] - 180 - 60 };
    expect(Math.min(room.width, (room.height - 36 - 340) * 800 / 600) * 600 / 800).toBeLessThanOrEqual(room.height - 36 - 340);
  });

  it.each(["en-GB", "ru-RU"])("fits every card's name on one line at 600 wide in %s", async (deviceLanguage) => {
    await openGuess([600, 1000], { deviceLanguage });
    // A card's content: a third of the 536 less two 16 gaps, less its own
    // 2 × 12 padding.
    const content = (600 - 64 - 32) / 3 - 24;
    for (const name of document.querySelectorAll<HTMLElement>(".skeleton-guess-name")) {
      const letters = Number(name.style.getPropertyValue("--letters"));
      expect(styleAt(name, [600, 1000]).value("white-space")).toBe("nowrap");
      expect(Math.min(20, content / (letters * 0.75)), name.textContent ?? "").toBeGreaterThanOrEqual(12);
    }
  });

  it("names the skeleton with the right card upright", async () => {
    const { user } = await openGuess([820, 1180]);
    await user.click(screen.getByRole("button", { name: "TRICERATOPS" }));
    expect(document.querySelector(".skeleton-guess")).toBeNull();
  });

  it("marks the skeleton and every card as parts a turn glides", async () => {
    await openGuess([820, 1180]);
    expect(part(".skeleton-reveal-board").getAttribute("data-turn-part")).toBe("skeleton-guess-board");
    for (const card of guesses()) expect(card.getAttribute("data-turn-part")).toMatch(/^skeleton-guess-./);
  });

  it("keeps the landscape guess as it was", async () => {
    await openGuess([1180, 820], { viewport: manualViewport("landscape") });
    expect(gateShown()).toBe(false);
    expect(getComputedStyle(part(".skeleton-guess-choices")).flexDirection).toBe("column");
  });
});
