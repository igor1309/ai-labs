import { act, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import type { PortraitLayouts } from "../src/App.tsx";
import { compareResultType, compareResultWidth, NARROW_RESULT } from "../src/compareResultLayout.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { openPairsApp } from "./pairsApp.tsx";
import { gameDoor, manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, type WindowSize } from "./windowSizes.ts";

// sort-dinosaurs-result-portrait.feature. The shared result parts' sums
// and turn are compareResult*.test.tsx's: sort's result is the same
// screen, so here it is shown to take their sizes for the window.

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "sorting-board": ["tall"], "sorting-result": ["tall"] };
const NARROW_LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "sorting-board": ["tall", "tall-narrow"], "sorting-result": ["tall", "tall-narrow"] };
const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const trayCards = () => [...document.querySelectorAll<HTMLElement>(".sort-card")];
const baskets = () => [...document.querySelectorAll<HTMLElement>(".basket")];

// Each card tapped into the baskets in turn until it lands, so a board
// is played whole, the first basket tried first.
async function playBoard(user: UserEvent, language: Language) {
  while (trayCards().length > 0) {
    const name = trayCards()[0]!.getAttribute("aria-label");
    for (const basket of baskets()) {
      const card = trayCards().find((each) => each.getAttribute("aria-label") === name);
      if (!card) break;
      await user.click(card);
      await user.click(basket);
    }
  }
  await user.click(screen.getByRole("button", { name: TEXTS[language].seeResult }));
}

async function openResult(size: WindowSize, level: AgeLevel, { language = "en", viewport = manualViewport("portrait"), layouts = PORTRAIT_LAYOUTS }: { language?: Language; viewport?: ManualViewport; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const app = openPairsApp({ viewport, portraitLayouts: layouts, deviceLanguage: DEVICES[language], ageLevel: { level, revision: `picked-${level}` } });
  await app.user.click(gameDoor(TEXTS[language].sort));
  await playBoard(app.user, language);
  return { ...app, viewport };
}

// The sizes the screen gives the stylesheet, and those the width sets.
const shownType = () => {
  const { style } = part(".result");
  return [style.getPropertyValue("--star-size"), style.getPropertyValue("--level-name-size"), style.getPropertyValue("--hero-maximum")];
};
const typeFor = (width: number) => {
  const type = compareResultType(compareResultWidth(width, 0, 0));
  return [`${type.star}px`, `${type.levelName}px`, `${type.heroMaximum}px`];
};

const narrowTypeFor = (width: number) => {
  const type = compareResultType(compareResultWidth(width, 0, 0, 0, NARROW_RESULT), NARROW_RESULT);
  return [`${type.star}px`, `${type.levelName}px`, `${type.heroMaximum}px`];
};

describe("sort's result upright on a phone", () => {
  it.each([
    [[320, 568], "hatchling", "en"],
    [[320, 568], "paleontologist", "ru"],
    [[393, 852], "explorer", "en"],
    [[430, 932], "paleontologist", "ru"]
  ] as const)("stands upright at %j after a %s board in %s, at the compare result's phone sizes", async (size, level, language) => {
    const viewport = manualViewport("portrait");
    viewport.resize("tall-narrow", true);
    await openResult(size, level, { language, viewport, layouts: NARROW_LAYOUTS });
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    expect(shownType()).toEqual(narrowTypeFor(size[0]));
    // The level switch shows its pictures alone, as the compare result's.
    for (const name of document.querySelectorAll(".level-switch-name")) expect(name.classList.contains("narrow-hidden")).toBe(true);
  });
});

describe("sort's result upright", () => {
  it.each([
    [[744, 1133], "hatchling", "en"],
    [[820, 1180], "explorer", "en"],
    [[600, 1000], "paleontologist", "en"],
    [[600, 1000], "paleontologist", "ru"]
  ] as const)("stands upright at %j after a %s board in %s, at the shared parts' sizes for the width", async (size, level, language) => {
    await openResult(size, level, { language });
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS[language].turnSideways })).toBeNull();
    expect(shownType()).toEqual(typeFor(size[0]));
    expect([...part(".result").children].map((element) => element.className)).toEqual(["festivity", "stratum result-stratum", "picture result-hero", "result-content"]);
    // A first board has no celebration; any other part is the compare result's.
    const parts = [...part(".result-content").children].map((element) => element.className).filter((name) => name !== "celebration");
    expect(parts).toEqual(["result-score", "result-stars", "result-title", "best-score", "level-switch", "result-actions"]);
    // The parts the compare result's turn glides are marked here too.
    expect(document.querySelectorAll(".result [data-turn-part]").length).toBeGreaterThan(0);
  });

  it("takes the phone's sizes as a tall window narrows, asking nothing", async () => {
    const viewport = manualViewport("portrait");
    await openResult([820, 1180], "hatchling", { viewport, layouts: NARROW_LAYOUTS });
    const result = part(".result");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert"), part(".result")]).toEqual(["tall-narrow", false, false, result]);
    expect(shownType()).toEqual(narrowTypeFor(393));
  });

  it("comes upright from landscape as the window turns, and PLAY AGAIN starts a new board", async () => {
    const viewport = manualViewport("landscape");
    const { user, clock } = await openResult([1180, 820], "hatchling", { viewport });
    const result = part(".result");
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".result")]).toEqual(["tall", false, result]);
    expect(shownType()).toEqual(typeFor(820));
    // The glide settles, and play goes on.
    expect([clock.timers(), document.documentElement.hasAttribute("data-turning")]).toEqual([[240], true]);
    act(() => clock.fire(240));
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
    await user.click(screen.getByRole("button", { name: TEXTS.en.playAgain }));
    expect([trayCards().length, gateShown()]).toEqual([6, false]);
  });
});
