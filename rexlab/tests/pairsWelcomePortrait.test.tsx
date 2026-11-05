import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { endWave, openPairsApp, pairsRecord, PICKED_HATCHLING, playBoard } from "./pairsApp.tsx";
import { NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage, type ManualViewport } from "./support.ts";
import { openWindow, type WindowSize } from "./windowSizes.ts";

// find-the-pair-welcome-portrait.feature's behaviour upright. The turn
// between the layouts is pairsWelcomeTurn.test.tsx's; the look
// pairsDigSite.test.tsx's and the fit pairsDigSite.browser.cjs's.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = {
  home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"]
};
const NARROW_LAYOUTS: PortraitLayouts = { ...PORTRAIT_LAYOUTS, home: ["tall", "tall-narrow"], "pairs-welcome": ["tall", "tall-narrow"] };

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });

// Find the pair opened at Hatchling on its climb's second level, five
// stars earned.
async function openWelcome(size: WindowSize, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), layouts = PORTRAIT_LAYOUTS
}: { language?: Language; insets?: SafeArea; viewport?: ManualViewport; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 5, level: 2, boardsOnLevel: 0, best: {}, found: [] }) });
  const app = openPairsApp({ storage, viewport, portraitLayouts: layouts, deviceLanguage: DEVICES[language], ageLevel: PICKED_HATCHLING });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  return { ...app, viewport };
}

describe("find the pair's welcome upright", () => {
  it.each([[600, 700], [744, 1133], [820, 1180], [1024, 1366]] as const)("stands upright at %i by %i, asking nothing", async (width, height) => {
    await openWelcome([width, height]);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
  });

  it("moves the chosen level to EXPLORER, and folds the climb level away beside the stars", async () => {
    const { user } = await openWelcome([820, 1180]);
    const climb = part(".pairs-climb");
    expect([within(levelSwitch()).getByRole("button", { pressed: true }).textContent, climb.hasAttribute("data-shown")]).toEqual(["🥚HATCHLING", true]);
    await user.click(within(levelSwitch()).getByRole("button", { name: TEXTS.en.ageLevels.explorer.name }));
    expect(within(levelSwitch()).getByRole("button", { pressed: true }).textContent).toBe("🦖EXPLORER");
    expect([part(".pairs-climb"), climb.hasAttribute("data-shown"), climb.getAttribute("aria-hidden"), screen.getByLabelText(TEXTS.en.starsEarned).textContent, gateShown()]).toEqual([climb, false, "true", "5", false]);
  });

  it("keeps asking to turn over a board and its result", async () => {
    const viewport = manualViewport("portrait");
    const { user, clock } = await openWelcome([820, 1180], { viewport });
    expect(gateShown()).toBe(false);
    await user.click(screen.getByRole("button", { name: TEXTS.en.play }));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), screen.getAllByRole("img", { name: TEXTS.en.turnSideways }).length]).toEqual([true, true, 1]);
    // Played in landscape, the result asks to turn as the window does.
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));
    expect(gateShown()).toBe(false);
    await playBoard(user, clock);
    endWave(clock);
    expect(document.querySelector(".pairs-welcome")).toBeNull();
    expect(screen.getByRole("button", { name: TEXTS.en.playAgain })).toBeDefined();
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert"), screen.getAllByRole("img", { name: TEXTS.en.turnSideways }).length]).toEqual([true, true, 1]);
    // Back to the welcome, which stands upright again.
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));
    await user.click(screen.getByRole("button", { name: TEXTS.en.back }));
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([part(".pairs-welcome").isConnected, gateShown()]).toEqual([true, false]);
  });

  it("takes the phone's layout as a tall window narrows, the same welcome, asking nothing", async () => {
    const viewport = manualViewport("portrait");
    await openWelcome([820, 1180], { viewport, layouts: NARROW_LAYOUTS });
    const welcome = part(".pairs-welcome");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert"), part(".pairs-welcome")]).toEqual(["tall-narrow", false, false, welcome]);
  });
});
