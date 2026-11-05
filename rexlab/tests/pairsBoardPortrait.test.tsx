import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import type { BoardLevel } from "../src/pairs/index.ts";
import { NARROW_BOARD, pairsBoardCardWidth, pairsBoardWidth } from "../src/pairsBoardLayout.ts";
import { board, dealt, endWave, labelAt, namesOf, openPairsApp, pairsRecord, PICKED_HATCHLING, playBoard, stateAt, triesShown, turnCard } from "./pairsApp.tsx";
import { NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage, type ManualViewport } from "./support.ts";
import { openWindow, type WindowSize } from "./windowSizes.ts";

// find-the-pair-board-portrait.feature. The turn between the layouts is
// pairsBoardTurn.test.tsx's; the layout's fit pairsDigSite.browser.cjs's.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = {
  home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"]
};

// Each board the feature names.
const BOARDS = {
  "climb 1": { climbLevel: 1 },
  "climb 2": { climbLevel: 2 },
  "climb 4": { climbLevel: 4 },
  explorer: { large: "explorer" },
  paleontologist: { large: "paleontologist" }
} as const satisfies Record<string, BoardLevel>;

type BoardName = keyof typeof BOARDS;

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// A board dealt at `name` in a window of `size`, a climb's at its climb
// level, a larger level's at that age level.
async function openBoard(size: WindowSize, name: BoardName, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), layouts = PORTRAIT_LAYOUTS
}: { language?: Language; insets?: SafeArea; viewport?: ManualViewport; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const level: BoardLevel = BOARDS[name];
  const climbing = "climbLevel" in level;
  const storage = memoryStorage(climbing ? { [PROGRESS_KEY]: pairsRecord({ stars: 0, level: level.climbLevel, boardsOnLevel: 0, best: {}, found: [] }) } : {});
  const ageLevel = climbing ? PICKED_HATCHLING : { level: level.large, revision: `picked-${level.large}` };
  const app = openPairsApp({ storage, viewport, portraitLayouts: layouts, deviceLanguage: DEVICES[language], ageLevel });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].play }));
  return { ...app, viewport, level };
}

describe("find the pair's board upright", () => {
  it("turns the card dealt in each place, as in landscape", async () => {
    const { user } = await openBoard([744, 1133], "explorer");
    const names = namesOf(dealt({ large: "explorer" }));
    await turnCard(user, 4);
    await turnCard(user, 13);
    expect([labelAt(4), labelAt(13), stateAt(4), stateAt(13), triesShown()]).toEqual([names[4], names[13], names[4] === names[13] ? "found" : "open", names[4] === names[13] ? "found" : "open", "1"]);
  });

  it("takes the side insets and the scrollbar from the viewport for the cards' width", async () => {
    const viewport = { ...manualViewport("portrait", { left: 19, right: 13 }), scrollbarWidth: () => 16 };
    await openBoard([744, 1133], "paleontologist", { viewport });
    expect(board().style.getPropertyValue("--card-by-width")).toBe(`${pairsBoardCardWidth(744 - 19 - 13 - 112 - 16, 4)}px`);
  });

  it("takes the phone's sizes as a tall window narrows, and plays on to the result, asking nothing", async () => {
    const viewport = manualViewport("portrait");
    const { user, clock } = await openBoard([820, 1180], "climb 1", { viewport, layouts: NARROW_LAYOUTS });
    const shown = board();
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert"), board()]).toEqual(["tall-narrow", false, false, shown]);
    expect(board().style.getPropertyValue("--card-by-width")).toBe(`${pairsBoardCardWidth(pairsBoardWidth(393, 0, 0, 0, NARROW_BOARD), 2, NARROW_BOARD)}px`);
    await playBoard(user, clock);
    endWave(clock);
    expect([part(".pairs-result").isConnected, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, false, false]);
  });
});

// find-the-pair-board-narrow-portrait.feature: an iPhone upright.
const NARROW_LAYOUTS: PortraitLayouts = { ...PORTRAIT_LAYOUTS, home: ["tall", "tall-narrow"], "pairs-welcome": ["tall", "tall-narrow"], "pairs-board": ["tall", "tall-narrow"], "pairs-result": ["tall", "tall-narrow"] };
