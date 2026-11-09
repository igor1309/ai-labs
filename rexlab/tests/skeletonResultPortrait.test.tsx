import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { fitAll, openPuzzle, revealNow, shownTexts, skeletonOf } from "./skeletonsApp.tsx";
import { manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// skeleton-result-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "skeletons-choice": ["tall"], "skeletons-puzzle": ["tall"], "skeletons-result": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// Tyrannosaurus finished and revealed in a window of `size`.
async function openResult(size: WindowSize, { viewport = manualViewport("portrait"), deviceLanguage = "en-GB" }: { viewport?: ManualViewport; deviceLanguage?: string } = {}) {
  openWindow(...size);
  const name = deviceLanguage === "ru-RU" ? "ТИРАННОЗАВР" : "TYRANNOSAURUS";
  const opened = await openPuzzle(name, { viewport, portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage });
  fitAll(skeletonOf("tyrannosaurus"));
  revealNow(opened.pictures, "tyrannosaurus");
  return { ...opened, viewport };
}

describe("the skeleton's result upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, the skeleton over its reward", async (...size) => {
    await openResult(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(styleAt(part(".skeleton-reveal"), size).value("flex-direction")).toBe("column");
    expect(styleAt(part(".skeleton-reveal-board"), size).value("width")).toBe("min(100cqw, (100cqh - 16px - 480px) * var(--frame-width) / var(--frame-height))");
    const reward = styleAt(part(".skeleton-reward"), size);
    expect([reward.px("padding-top"), reward.rowGap(), reward.px("min-width")]).toEqual([0, 14, 0]);
    expect(styleAt(part(".skeleton-actions"), size).value("flex-direction")).toBe("column");
    // The reveal under the 108 top and the 44 foot: the board keeps a
    // skeleton large enough to see above the reward's 480.
    const room = { width: size[0] - 96, height: size[1] - 108 - 44 };
    expect(Math.min(room.width, (room.height - 16 - 480) * 800 / 600)).toBeGreaterThanOrEqual(300);
  });

  it.each(["en-GB", "ru-RU"])("fits the name and both ways on at 600 wide in %s", async (deviceLanguage) => {
    await openResult([600, 1000], { deviceLanguage });
    const text = shownTexts();
    // The reward's content, the 600 less the screen's 2 × 48 sides; a way on
    // spends its 2 × 12 padding, its 28 symbol and 12 gap beside its words
    // at 22px, each at most 0.75 of its size wide, 1px apart.
    const content = 600 - 96;
    for (const words of [text.buildAnother, text.museum]) {
      const button = screen.getByRole("button", { name: words });
      expect(styleAt(button, [600, 1000]).value("white-space")).toBe("nowrap");
      expect(24 + 28 + 12 + words.length * (22 * 0.75 + 1), words).toBeLessThanOrEqual(content);
    }
    expect(styleAt(part(".skeleton-reveal-name"), [600, 1000]).value("font-size")).toBe("min(34px, 100cqi/9.4)");
  });

  it("opens the choice from BUILD ANOTHER upright", async () => {
    const { user } = await openResult([820, 1180]);
    await user.click(screen.getByRole("button", { name: shownTexts().buildAnother }));
    expect(screen.getByRole("group", { name: shownTexts().creatures })).toBeDefined();
  });

  it("marks the skeleton and its reward as parts a turn glides", async () => {
    await openResult([820, 1180]);
    expect([part(".skeleton-reveal-board").getAttribute("data-turn-part"), part(".skeleton-reward").getAttribute("data-turn-part")]).toEqual(["skeleton-result-board", "skeleton-reward"]);
  });

  it("keeps the landscape result as it was", async () => {
    await openResult([1180, 820], { viewport: manualViewport("landscape") });
    expect(gateShown()).toBe(false);
    expect(getComputedStyle(part(".skeleton-actions")).position).toBe("absolute");
  });
});
