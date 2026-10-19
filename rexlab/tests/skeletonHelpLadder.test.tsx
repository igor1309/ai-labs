import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import type { StartTimer } from "../src/ownedTimers.ts";
import {
  AWAY,
  BOARD_AT,
  board,
  cancel,
  dragTo,
  finishLoading,
  fit,
  fittedPieces,
  hints,
  homeOf,
  keptSkeletons,
  layOutPuzzle,
  moveTo,
  openPuzzle,
  openSkeletonsApp,
  press,
  release,
  skeletonOf,
  slotOf,
  spotOf,
  spotPieces,
  tap
} from "./skeletonsApp.tsx";
import { manualPictures, memoryStorage, type ManualPictures } from "./support.ts";

// skeleton-assembly-help-ladder.feature: Explorer's and Paleontologist's
// help in steps, each ten seconds without a fit.

const TYRANNOSAURUS = skeletonOf("tyrannosaurus");

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

// `seconds` seconds at the puzzle, counted by the game's timer of a
// second.
function spend(pictures: ManualPictures, seconds: number) {
  for (let second = 0; second < seconds; second++) act(() => pictures.fire(1000));
}

const region = () => board().querySelector<HTMLElement>(".skeleton-region");
const ghostOf = (piece: string) => slotOf(piece).querySelector<HTMLElement>(".skeleton-ghost");
const nudged = () => document.querySelector<HTMLElement>(".skeleton-piece[data-nudge]");

// What help shows: the glows, whether the region, the ghost and the move
// show, and what is fitted.
const shown = (piece = "skull") => ({ hints: hints(), region: region() !== null, ghost: ghostOf(piece) !== null, move: nudged() !== null, fitted: fittedPieces() });

const NONE = { hints: [], region: false, ghost: false, move: false, fitted: [] };

const px = (value: string) => Number.parseFloat(value);

// The nudge's offsets on the moving piece, and those from the centre of
// `piece`'s spot to its home, which they should be.
function nudgeOf(piece: string) {
  const spot = spotOf(piece).getBoundingClientRect();
  const home = homeOf(TYRANNOSAURUS, piece);
  const style = nudged()?.style;
  return {
    shown: [px(style?.getPropertyValue("--nudge-x") ?? ""), px(style?.getPropertyValue("--nudge-y") ?? "")],
    towards: [expect.closeTo(home.clientX - (spot.left + spot.width / 2), 5), expect.closeTo(home.clientY - (spot.top + spot.height / 2), 5)]
  };
}

describe("Explorer's help in steps", () => {
  const openExplorer = () => openPuzzle("TYRANNOSAURUS", { ageLevels: levelOf("explorer") });

  it("shows nothing for nine seconds, then the skull's spot and the head's region, no slot glowing and nothing fitted", async () => {
    const { pictures } = await openExplorer();

    spend(pictures, 9);
    expect(shown()).toEqual(NONE);

    spend(pictures, 1);

    expect(shown()).toEqual({ ...NONE, hints: ["spot skull"], region: true });
    expect(slotOf("skull").querySelector(".skeleton-glow")).toBeNull();
    expect(spotOf("skull").querySelector(".skeleton-glow")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("rings the head's region around the skull's slot, 12 CSS pixels beyond it", async () => {
    const { pictures } = await openExplorer();
    spend(pictures, 10);

    // Each side as its percentage of the board and its CSS pixels beyond.
    const sides = ({ left, top, width, height }: CSSStyleDeclaration) =>
      [left, top, width, height].map((side) => {
        const [, percent = "", pixels = "0"] = /^(?:calc\()?([\d.]+)%(?: ([-+] \d+)px\))?$/.exec(side) ?? [];
        return [px(percent), px(pixels.replace(" ", ""))] as const;
      });
    const skull = sides(slotOf("skull").style).map(([percent]) => expect.closeTo(percent, 4));
    expect(sides(region()?.style ?? board().style)).toEqual([
      [skull[0], -12],
      [skull[1], -12],
      [skull[2], 24],
      [skull[3], 24]
    ]);
    expect(region()?.getAttribute("aria-hidden")).toBe("true");
  });

  it("adds a faint ghost of the skull in its empty slot after twenty seconds, which nothing picks up", async () => {
    const { pictures } = await openExplorer();

    spend(pictures, 20);

    expect(shown()).toEqual({ ...NONE, hints: ["spot skull"], region: true, ghost: true });
    const ghost = ghostOf("skull");
    expect([ghost?.getAttribute("aria-hidden"), getComputedStyle(ghost ?? document.body).opacity, getComputedStyle(ghost ?? document.body).pointerEvents]).toEqual(["true", "0.35", "none"]);
    expect(slotOf("skull").getAttribute("data-state")).toBe("empty");
  });

  it("moves the skull from its spot towards its home and back after thirty seconds, every other step still showing, and counts no more time", async () => {
    const { pictures } = await openExplorer();

    spend(pictures, 30);

    expect(shown()).toEqual({ hints: ["spot skull"], region: true, ghost: true, move: true, fitted: [] });
    const { shown: offsets, towards } = nudgeOf("skull");
    expect(offsets).toEqual(towards);
    expect(nudged()?.closest(".skeleton-tray-spot")).toBe(spotOf("skull"));
    expect(pictures.timers()).toEqual([]);
  });

  it("clears every step as a piece fits, and starts again from the first after ten more seconds", async () => {
    const { pictures } = await openExplorer();
    spend(pictures, 30);

    fit(TYRANNOSAURUS, "neck");
    expect(shown()).toEqual({ ...NONE, fitted: ["neck"] });

    spend(pictures, 10);
    expect(shown()).toEqual({ ...NONE, hints: ["spot skull"], region: true, fitted: ["neck"] });
  });

  it("helps the next piece once the helped one fits", async () => {
    const { pictures } = await openExplorer();
    spend(pictures, 20);

    fit(TYRANNOSAURUS, "skull");
    spend(pictures, 10);

    expect(shown("neck")).toEqual({ ...NONE, hints: ["spot neck"], region: true, fitted: ["skull"] });
  });

  it("holds a step that falls due while a piece is held until it is let go", async () => {
    const { pictures } = await openExplorer();
    spend(pictures, 19);
    const spot = spotOf("tail");
    const { left, top } = spot.getBoundingClientRect();

    press(spot, { clientX: left + 40, clientY: top + 40 });
    moveTo({ clientX: BOARD_AT.left + 10, clientY: BOARD_AT.top + 10 });
    spend(pictures, 2);
    expect(shown()).toEqual({ ...NONE, hints: ["spot skull"], region: true });

    release(AWAY);
    expect(shown()).toEqual({ ...NONE, hints: ["spot skull"], region: true, ghost: true });
  });
});

// What the child did with the skull before help's last step: a drop
// that missed, a touch cancelled as the iPad turned, or nothing, the
// skeleton knocked down from its stand in the museum to be built again,
// its bones scattering.
const BEFORE: Array<[string, (level: AgeLevel) => Promise<{ pictures: ManualPictures }>]> = [
  [
    "a drop of it that missed",
    async (level) => {
      const opened = await openPuzzle("TYRANNOSAURUS", { ageLevels: levelOf(level) });
      dragTo("skull", AWAY);
      return opened;
    }
  ],
  [
    "a touch on it that was cancelled",
    async (level) => {
      const opened = await openPuzzle("TYRANNOSAURUS", { ageLevels: levelOf(level) });
      const { left, top } = spotOf("skull").getBoundingClientRect();
      press(spotOf("skull"), { clientX: left + 40, clientY: top + 40 });
      moveTo(homeOf(TYRANNOSAURUS, "spine"));
      cancel(homeOf(TYRANNOSAURUS, "spine"));
      return opened;
    }
  ],
  [
    "its skeleton knocked down in the museum",
    async (level) => {
      const opened = openSkeletonsApp({ ageLevels: levelOf(level), storage: keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }) });
      await opened.user.click(screen.getByRole("button", { name: "MUSEUM" }));
      act(() => finishLoading(opened.pictures));
      await opened.user.click(within(screen.getByRole("region", { name: "TYRANNOSAURUS" })).getByRole("button", { name: "REBUILD" }));
      act(() => finishLoading(opened.pictures));
      layOutPuzzle();
      return opened;
    }
  ]
];

describe("help's last step after a piece has moved", () => {
  it.each((["explorer", "paleontologist"] as const).flatMap((level) => BEFORE.map(([before, open]) => [level, before, open] as const)))("moves the skull towards its home at %s after %s, the skull still in the tray", async (level, _, open) => {
    const { pictures } = await open(level);

    spend(pictures, 30);

    const { shown: offsets, towards } = nudgeOf("skull");
    expect([nudged()?.closest(".skeleton-tray-spot"), offsets, fittedPieces()]).toEqual([spotOf("skull"), towards, []]);
  });
});

// A clock the test moves on, which fires each timer once its time has
// passed, so a timer stopped and started again starts its time again.
function clockOn(pictures: ManualPictures) {
  let now = 0;
  const running = new Set<{ at: number; fire: () => void }>();
  const startTimer: StartTimer = (ms, fire) => {
    const timer = { at: now + ms, fire };
    running.add(timer);
    return () => {
      running.delete(timer);
    };
  };
  const pass = (ms: number) =>
    act(() => {
      now += ms;
      for (let due = [...running].find(({ at }) => at <= now); due !== undefined; due = [...running].find(({ at }) => at <= now)) {
        running.delete(due);
        due.fire();
      }
    });
  return { pictures: { ...pictures, startTimer }, pass };
}

describe("help's time at Paleontologist", () => {
  it("keeps counting while the child turns pieces and drops other dinosaurs' bones, never fitting one", async () => {
    const { pictures, pass } = clockOn(manualPictures());
    await openPuzzle("TYRANNOSAURUS", { ageLevels: levelOf("paleontologist"), pictures });
    const [stray = ""] = spotPieces().filter((piece) => piece.includes("/"));

    for (let quarter = 0; quarter < 40; quarter++) {
      pass(250);
      if (quarter % 2 === 0) tap("arms");
      else dragTo(stray, AWAY);
    }

    expect(shown()).toEqual({ ...NONE, hints: ["spot skull"], region: true });
  });
});

describe("help at the other levels", () => {
  it("climbs the same steps at Paleontologist", async () => {
    const { pictures } = await openPuzzle("TRICERATOPS", { ageLevels: levelOf("paleontologist") });

    spend(pictures, 10);

    expect(shown("beak")).toEqual({ ...NONE, hints: ["spot beak"], region: true });
  });

  it("keeps Hatchling's one glow on the skull's slot and spot, however long the child waits", async () => {
    const { pictures } = await openPuzzle("TRICERATOPS", { ageLevels: levelOf("hatchling") });

    spend(pictures, 30);

    expect(shown()).toEqual({ ...NONE, hints: ["slot skull", "spot skull"] });
  });
});
