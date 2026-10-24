import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import { choices, finishLoading, fitAll, keptSkeletons, layOutPuzzle, openPuzzle, openSkeletonsApp, revealNow, shownTexts, skeletonOf } from "./skeletonsApp.tsx";
import { manualViewport, type ManualViewport } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// Every skeleton screen in a tall-narrow window: an iPhone upright.

const NARROW_LAYOUTS: PortraitLayouts = {
  home: ["tall", "tall-narrow"], "skeletons-choice": ["tall", "tall-narrow"], "skeletons-museum": ["tall", "tall-narrow"],
  "skeletons-puzzle": ["tall", "tall-narrow"], "skeletons-guess": ["tall", "tall-narrow"], "skeletons-result": ["tall", "tall-narrow"]
};

const PHONES = [[320, 568], [375, 667], [393, 852], [430, 932]] as const;

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

// The screen stands upright on a phone with its 24, 32 and 20 padding and
// its parts 16 apart, the bar one row of 48-pixel symbols 8 apart.
function phoneScreen(size: WindowSize) {
  expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
  expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
  const page = styleAt(part(".skeleton-screen"), size);
  expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right"), page.rowGap()]).toEqual([24, 32, 20, 20, 16]);
  const bar = styleAt(part(".skeleton-bar"), size);
  expect([bar.value("flex-wrap") || "nowrap", bar.columnGap()]).toEqual(["nowrap", 8]);
  for (const button of part(".skeleton-bar").querySelectorAll<HTMLElement>(".home-button")) {
    expect([styleAt(button, size).px("width"), styleAt(button, size).value("flex-shrink")]).toEqual([48, "0"]);
    expect(button.querySelector(".upright-hidden")?.textContent).toBe(button.textContent);
  }
  // The title takes what the buttons leave of the width, its type from
  // its letters, as in a tall window.
  expect(styleAt(part(".skeleton-title-words"), size).value("font-size")).toBe("min(40px, (100cqi - 66px) / (var(--letters) * 0.75))");
}

const starred = (rebuilding: string[] = []) => keptSkeletons({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding });

describe("the skeleton screens upright on a phone", () => {
  it.each(PHONES)("stands the choice upright at %i by %i, its skeletons in rows of two", (...size) => {
    openWindow(...size);
    openSkeletonsApp({ viewport: narrowViewport(), portraitLayouts: NARROW_LAYOUTS, storage: starred() });
    phoneScreen(size);
    const room = styleAt(part(".skeleton-choices"), size);
    expect([room.value("flex-wrap"), room.rowGap(), room.columnGap()]).toEqual(["wrap", 12, 12]);
    for (const card of choices()) expect(styleAt(card, size).value("flex-basis")).toBe("calc(0.5 * (100% - 12px))");
  });

  it.each(PHONES)("stands the museum upright at %i by %i, its stands in rows of two", async (...size) => {
    openWindow(...size);
    const app = openSkeletonsApp({ viewport: narrowViewport(), portraitLayouts: NARROW_LAYOUTS, storage: starred(["triceratops"]) });
    await app.user.click(screen.getByRole("button", { name: shownTexts().museum }));
    phoneScreen(size);
    const hall = styleAt(part(".skeleton-hall"), size);
    expect([hall.px("padding-top"), hall.rowGap(), hall.columnGap()]).toEqual([12, 12, 12]);
    const stands = within(screen.getByRole("group", { name: shownTexts().stands })).getAllByRole("region");
    for (const stand of stands) expect(styleAt(stand, size).value("flex-basis")).toBe("calc(0.5 * (100% - 12px))");
    // The bar's two buttons and two chips, the title out of the way, fit
    // inside the 20-pixel sides: each chip its padding, a 20 symbol, a gap
    // and "n/n" in letters at most 0.75 of the type wide.
    const title = styleAt(part(".skeleton-museum-screen .skeleton-title"), size);
    expect([title.value("position"), title.px("width")]).toEqual(["absolute", 1]);
    const chips = [...part(".skeleton-museum-screen .skeleton-bar").querySelectorAll(".skeleton-chip")];
    expect(chips).toHaveLength(2);
    const widths = chips.map((chip) => {
      const style = styleAt(chip, size);
      return style.px("padding-left") + style.px("padding-right") + 20 + style.columnGap() + chip.textContent!.length * 0.75 * style.px("font-size");
    });
    const bar = styleAt(part(".skeleton-museum-screen .skeleton-bar"), size);
    expect(2 * 48 + widths.reduce((sum, width) => sum + width, 0) + 3 * bar.columnGap()).toBeLessThanOrEqual(size[0] - 40);
  });

  it.each(PHONES)("stands the puzzle upright at %i by %i, the board as wide as the screen over a tray of at least a third", async (...size) => {
    openWindow(...size);
    await openPuzzle("TYRANNOSAURUS", { viewport: narrowViewport(), portraitLayouts: NARROW_LAYOUTS });
    phoneScreen(size);
    expect([styleAt(part(".skeleton-puzzle"), size).value("flex-direction"), styleAt(part(".skeleton-puzzle"), size).columnGap()]).toEqual(["column", 16]);
    expect(styleAt(part(".skeleton-puzzle .skeleton-board"), size).value("width")).toBe("min(100cqw, (100cqh - 16px) * 0.6 * var(--frame-width) / var(--frame-height))");
    const tray = styleAt(part(".skeleton-tray"), size);
    expect([tray.px("padding-top"), tray.value("--spot-gap")]).toEqual([12, "8px"]);
    // The puzzle under the padding, a 56 bar and a 16 gap: the board as
    // wide as it leaves the tray at least a third of it for its spots,
    // each at least 48 a side.
    const puzzle = { width: size[0] - 40, height: size[1] - 56 - 56 - 16 };
    const board = Math.min(puzzle.width, (puzzle.height - 16) * 0.6 * 800 / 600);
    expect(board).toBe(puzzle.width);
    expect(puzzle.height - 16 - board * 600 / 800).toBeGreaterThan(puzzle.height / 3);
    for (const spot of part(".skeleton-tray").querySelectorAll(".skeleton-tray-spot")) expect([styleAt(spot, size).px("min-width"), styleAt(spot, size).value("touch-action")]).toEqual([48, "none"]);
  });

  it.each(PHONES)("stands the guess upright at %i by %i, its cards one over another, the board at least 160 wide", async (...size) => {
    openWindow(...size);
    const opened = openSkeletonsApp({ viewport: narrowViewport(), portraitLayouts: NARROW_LAYOUTS, storage: starred(), random: () => 0.6 });
    await opened.user.click(screen.getByRole("button", { name: shownTexts().mystery }));
    act(() => finishLoading(opened.pictures));
    layOutPuzzle();
    fitAll(skeletonOf("triceratops"));
    act(() => opened.pictures.fire(REVEAL.motion));
    phoneScreen(size);
    expect(styleAt(part(".skeleton-reveal-board"), size).value("width")).toBe("min(100cqw, (100cqh - 16px - 300px) * var(--frame-width) / var(--frame-height))");
    expect(styleAt(part(".skeleton-reveal"), size).value("height")).toBe(`max(436px, -(128px) + ${size[1]}px)`);
    expect([styleAt(part(".skeleton-guess-screen"), size).value("height"), styleAt(part(".skeleton-guess-screen"), size).px("min-height")]).toEqual(["auto", size[1]]);
    expect(styleAt(part(".skeleton-guess-choices"), size).value("flex-direction")).toBe("column");
    const reveal = Math.max(436, size[1] - 128);
    expect(Math.min(size[0] - 40, (reveal - 16 - 300) * 800 / 600)).toBeGreaterThanOrEqual(160);
    // Each name beside its 80-wide picture keeps at least 12 pixels: the
    // card's content is the width less the guess's 2 × 16 padding, its own
    // 2 × 12 padding and 2 × 2 border.
    const content = size[0] - 40 - 32 - 24 - 4;
    for (const name of document.querySelectorAll<HTMLElement>(".skeleton-guess-name")) {
      const letters = Number(name.style.getPropertyValue("--letters"));
      expect(styleAt(name, size).value("font-size")).toBe("min(20px, calc((100cqi - 88px) / (var(--letters) * 0.75)))");
      expect(Math.min(20, (content - 88) / (letters * 0.75)), name.textContent ?? "").toBeGreaterThanOrEqual(12);
    }
    expect(styleAt(part(".skeleton-guess-picture"), size).px("width")).toBe(80);
  });

  it.each(PHONES.flatMap((size) => ["en-GB", "ru-RU"].map((language) => [...size, language] as const)))("stands the result upright at %i by %i in %s, both ways on one line", async (width, height, deviceLanguage) => {
    const size: WindowSize = [width, height];
    openWindow(...size);
    const name = deviceLanguage === "ru-RU" ? "ТИРАННОЗАВР" : "TYRANNOSAURUS";
    const opened = await openPuzzle(name, { viewport: narrowViewport(), portraitLayouts: NARROW_LAYOUTS, deviceLanguage });
    fitAll(skeletonOf("tyrannosaurus"));
    revealNow(opened.pictures, "tyrannosaurus");
    phoneScreen(size);
    expect(styleAt(part(".skeleton-reveal-board"), size).value("width")).toBe("min(100cqw, (100cqh - 16px - 440px) * var(--frame-width) / var(--frame-height))");
    expect(styleAt(part(".skeleton-reveal"), size).value("height")).toBe(`max(576px, -(128px) + ${height}px)`);
    const reward = styleAt(part(".skeleton-reward"), size);
    expect([reward.px("padding-top"), reward.rowGap(), styleAt(part(".skeleton-fact"), size).px("font-size")]).toEqual([16, 12, 18]);
    const reveal = Math.max(576, height - 128);
    expect(Math.min(width - 40, (reveal - 16 - 440) * 800 / 600)).toBeGreaterThanOrEqual(160);
    // A way on spends its 2 × 8 padding, its 28 symbol and 8 gap beside its
    // words at 17px, each at most 0.75 of its size wide, 1px apart.
    const content = width - 40 - 32;
    const text = shownTexts();
    for (const words of [text.buildAnother, text.museum]) {
      const button = screen.getByRole("button", { name: words });
      const own = styleAt(button, size);
      expect([own.px("height"), own.px("font-size"), own.px("padding-left"), own.columnGap(), own.value("white-space")]).toEqual([56, 17, 8, 8, "nowrap"]);
      expect(16 + 28 + 8 + words.length * (17 * 0.75 + 1), words).toBeLessThanOrEqual(content);
    }
  });

  it("takes the phone's sizes as a tall window narrows over the puzzle, asking nothing", async () => {
    openWindow(820, 1180);
    const viewport: ManualViewport = manualViewport("portrait");
    await openPuzzle("TYRANNOSAURUS", { viewport, portraitLayouts: NARROW_LAYOUTS });
    const shown = part(".skeleton-board");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".skeleton-board")]).toEqual(["tall-narrow", false, shown]);
    phoneScreen([393, 852]);
  });
});
