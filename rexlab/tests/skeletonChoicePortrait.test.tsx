import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { refitPicture } from "../src/closingPicture.ts";
import { TEXTS } from "../src/language/texts.ts";
import { choices, keptSkeletons, openSkeletonsApp, shownTexts } from "./skeletonsApp.tsx";
import { manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// skeleton-choice-portrait.feature in the app.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "skeletons-choice": ["tall"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const starred = keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });

// The choice, its mystery open, in a window of `size`.
function openChoice(size: WindowSize, { viewport = manualViewport("portrait"), deviceLanguage = "en-GB" }: { viewport?: ManualViewport; deviceLanguage?: string } = {}) {
  openWindow(...size);
  return { ...openSkeletonsApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS, storage: starred, deviceLanguage }), viewport };
}

describe("the skeleton choice upright", () => {
  it.each([[744, 1133], [820, 1180], [600, 1000]] as const)("stands upright at %j, its skeletons in rows of two", (...size) => {
    openChoice(size);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const page = styleAt(part(".skeleton-screen"), size);
    expect([page.px("padding-left"), page.px("padding-right"), page.value("height")]).toEqual([32, 32, `${size[1]}px`]);
    const room = styleAt(part(".skeleton-choices"), size);
    expect([room.value("flex-wrap"), room.rowGap(), room.columnGap()]).toEqual(["wrap", 20, 20]);
    expect(choices()).toHaveLength(6);
    for (const card of choices()) expect(styleAt(card, size).value("flex-basis")).toBe("calc(0.5 * (100% - 20px))");
  });

  it.each(["en-GB", "ru-RU"])("keeps the bar on one row at 600 wide in %s, HOME and MUSEUM as their symbols named for screen readers", (deviceLanguage) => {
    openChoice([600, 1000], { deviceLanguage });
    const text = shownTexts();
    const bar = styleAt(part(".skeleton-bar"), [600, 1000]);
    expect([bar.value("flex-wrap") || "nowrap", bar.columnGap()]).toEqual(["nowrap", 16]);
    for (const name of [text.home, text.museum]) {
      const button = screen.getByRole("button", { name });
      expect(styleAt(button, [600, 1000]).px("width")).toBe(56);
      expect(button.querySelector(".upright-hidden")?.textContent).toBe(name);
    }
    const words = styleAt(part(".skeleton-title-words"), [600, 1000]);
    expect(words.value("font-size")).toBe("min(40px, (100cqi - 66px) / (var(--letters) * 0.75))");
    for (const name of document.querySelectorAll<HTMLElement>(".skeleton-choice-name")) expect(styleAt(name, [600, 1000]).value("white-space")).toBe("nowrap");
  });

  it("keeps the puzzle behind the gate upright when no layout is given for it", async () => {
    const { user } = openChoice([820, 1180]);
    await user.click(choices()[0]!);
    expect(gateShown()).toBe(true);
  });

  it("keeps the landscape choice as it was", () => {
    openChoice([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    expect(getComputedStyle(part(".skeleton-screen")).paddingLeft).toBe("56px");
    expect(getComputedStyle(choices()[0]!).flexBasis).toBe("calc(0.3333333333333333*(100% - 56px))");
  });

  it("marks every card as a part a turn glides, travelling as a fitted copy", () => {
    openChoice([820, 1180]);
    const parts = choices().map((card) => card.getAttribute("data-turn-part"));
    expect(parts).toEqual(["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "spinosaurus"].map((id) => `skeleton-choice-${id}`).concat("skeleton-mystery"));
    const copy = refitPicture(choices()[0]!, { left: 0, top: 0, width: 100, height: 100 });
    expect(copy).toBeDefined();
    copy!.remove();
  });
});
