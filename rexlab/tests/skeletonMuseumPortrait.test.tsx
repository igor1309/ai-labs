import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { refitPicture } from "../src/closingPicture.ts";
import { TEXTS } from "../src/language/texts.ts";
import { keptSkeletons, openSkeletonsApp, shownTexts } from "./skeletonsApp.tsx";
import { manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// skeleton-museum-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "skeletons-choice": ["tall"], "skeletons-museum": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const kept = () => keptSkeletons({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: ["triceratops"] });
const stands = () => within(screen.getByRole("group", { name: shownTexts().stands })).getAllByRole("region");

// The museum in a window of `size`.
async function openMuseum(size: WindowSize, { viewport = manualViewport("portrait"), deviceLanguage = "en-GB" }: { viewport?: ManualViewport; deviceLanguage?: string } = {}) {
  openWindow(...size);
  const app = openSkeletonsApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS, storage: kept(), deviceLanguage });
  await app.user.click(screen.getByRole("button", { name: shownTexts().museum }));
  return { ...app, viewport };
}

describe("the museum upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, its stands in rows of two", async (...size) => {
    await openMuseum(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const hall = styleAt(part(".skeleton-hall"), size);
    expect([hall.px("padding-left"), hall.px("padding-top"), hall.rowGap(), hall.columnGap()]).toEqual([24, 24, 16, 24]);
    expect(stands()).toHaveLength(5);
    for (const stand of stands()) expect(styleAt(stand, size).value("flex-basis")).toBe("calc(0.5 * (100% - 24px))");
    // The hall under the 40 + 48 padding, a 56 bar and a 28 gap, less its
    // own padding and two row gaps, in three rows: each stand's exhibit
    // keeps at least 96 under its 40 top and 56 button and their gaps.
    const row = (size[1] - 88 - 56 - 28 - 48 - 2 * 16) / 3;
    expect(row - 40 - 56 - 2 * 8).toBeGreaterThanOrEqual(96);
  });

  it.each(["en-GB", "ru-RU"])("keeps the bar on one row at 600 wide in %s, HOME and BUILD ANOTHER as their symbols named for screen readers", async (deviceLanguage) => {
    await openMuseum([600, 1000], { deviceLanguage });
    const text = shownTexts();
    for (const name of [text.home, text.buildAnother]) {
      const button = screen.getByRole("button", { name });
      expect(styleAt(button, [600, 1000]).px("width")).toBe(56);
      expect(button.querySelector(".upright-hidden")?.textContent).toBe(name);
    }
    // The narrowest stand, (536 - 48 - 24) / 2, keeps its name and button
    // words at their type's floors.
    const stand = (600 - 64 - 48 - 24) / 2;
    expect([(stand - 50) / 9.4, (stand - 54) / 9.8].map((type) => type >= 18)).toEqual([true, true]);
  });

  it("keeps the landscape hall as it was", async () => {
    await openMuseum([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    expect(getComputedStyle(stands()[0]!).flexBasis).toBe("calc(0.3333333333333333*(100% - 64px))");
  });

  it("marks every stand as a part a turn glides, travelling as a fitted copy", async () => {
    await openMuseum([820, 1180]);
    expect(stands().map((stand) => stand.getAttribute("data-turn-part"))).toEqual(["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "spinosaurus"].map((id) => `skeleton-stand-${id}`));
    const copy = refitPicture(stands()[0]!, { left: 0, top: 0, width: 100, height: 100 });
    expect(copy).toBeDefined();
    copy!.remove();
  });
});
