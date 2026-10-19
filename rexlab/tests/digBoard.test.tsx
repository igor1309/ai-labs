import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { App, type SandContext } from "../src/App.tsx";
import { GUST } from "../src/digGame.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DIG,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  homeTile,
  lightDevice,
  manualOrientation,
  manualTimers,
  memoryStorage,
  symbolOf,
  unreadVersion,
  unsetAgeLevel
} from "./support.ts";
import { board, brushAll, cleared, clearCells, drag, placeBoard, roundDinosaur, sandOf } from "./digApp.tsx";
import { filterTaps, moveAt, pressAt, releaseAt, tapAt } from "./taps.ts";

type Options = { reducedMotion?: boolean; random?: () => number; language?: Language; sandContext?: SandContext };

// The app on its home page, every timer firing only when the test says,
// pictures loading at once, and random draws counted.
function openApp({ reducedMotion = false, random = () => 0, language = "en", sandContext = emptyDig().sandContext }: Options = {}) {
  const timers = manualTimers();
  const orientation = manualOrientation("landscape");
  const draws = { count: 0 };
  const counted = () => {
    draws.count++;
    return random();
  };
  const storage = memoryStorage();
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={counted}
      orientation={orientation}
      progress={emptyProgress()}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={localLanguage(() => storage)}
      nameVersion={unreadVersion}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      sandContext={sandContext}
      reducedMotion={() => reducedMotion}
      {...timers}
    />
  );
  return { timers, orientation, draws };
}

// The app with a round of the dig game started from its tile, on a board
// 800 CSS pixels wide, a pixel to each of the frame's.
function openRound(options: Options = {}) {
  const opened = openApp(options);
  fireEvent.click(homeTile(TEXTS[options.language ?? "en"].dig));
  placeBoard(800);
  return opened;
}

// The drawing on the sand's canvas: each time it is covered whole, and
// each round stamp taken off it, in canvas pixels.
function spySand() {
  const drawn = { covers: [] as Array<[number, number]>, stamps: [] as Array<{ x: number; y: number; r: number }> };
  const context = {
    globalCompositeOperation: "source-over",
    fillStyle: "",
    fillRect: (x: number, y: number, width: number, height: number) => {
      if (context.globalCompositeOperation === "source-over" && x === 0 && y === 0) drawn.covers.push([width, height]);
    },
    createRadialGradient: () => ({ addColorStop: () => {} }),
    beginPath: () => {},
    arc: (x: number, y: number, r: number) => {
      if (context.globalCompositeOperation === "destination-out") drawn.stamps.push({ x, y, r });
    },
    fill: () => {}
  };
  return { drawn, sandContext: () => context as unknown as CanvasRenderingContext2D };
}

const APP_CSS = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");

// A rule of app.css as written: jsdom's parser drops properties it does
// not know, as Safari's -webkit-touch-callout.
const ruleOf = (selector: string) => APP_CSS.match(new RegExp(`^${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "m"))?.[1] ?? "";

describe("the dig game's tile", () => {
  it("starts a Hatchling round at once: the sand board, HOME, the title DIG beside a brush and the dinosaurs dug up out of all of them", () => {
    openApp();

    const tile = homeTile("DIG");
    expect(symbolOf(tile.querySelector(".dig-tile-symbol") ?? tile)).toBe("brush");
    expect(tile.querySelector(".dig-tile-count")).toBeNull();
    fireEvent.click(tile);

    expect(board().getAttribute("data-blown")).toBeNull();
    const title = screen.getByRole("heading", { level: 1 });
    expect([title.textContent, symbolOf(title)]).toEqual(["DIG", "brush"]);
    expect(screen.getByRole("button", { name: "HOME" })).toBeDefined();
    expect(screen.getByLabelText("DUG UP").textContent).toBe(`0/${SHIPPED_DIG.length}`);
    expect(getComputedStyle(board()).aspectRatio).toBe("var(--frame-width) / var(--frame-height)");
  });

  it("starts one round for a quick double tap, and the second tap brushes no sand", () => {
    filterTaps();
    const { draws } = openApp();
    const before = draws.count;

    tapAt(homeTile("DIG"), 1000, { x: 400, y: 300 });
    placeBoard(800);
    tapAt(board(), 1300, { x: 410, y: 300 });

    expect(draws.count - before).toBe(1);
    expect(clearCells()).toEqual([]);
  });

  it("reads РАСКОПКИ in Russian, on the tile and over the board", () => {
    openApp({ language: "ru" });

    fireEvent.click(homeTile("РАСКОПКИ"));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("РАСКОПКИ");
    expect(screen.getByRole("button", { name: "ДОМОЙ" })).toBeDefined();
    expect(screen.getByLabelText("ОТКОПАНО").textContent).toBe(`0/${SHIPPED_DIG.length}`);
  });
});

describe("a round's start", () => {
  it("covers the whole picture with sand, fading the board in whole", () => {
    const { drawn, sandContext } = spySand();
    openRound({ sandContext });

    expect([clearCells(), cleared()]).toEqual([[], 0]);
    expect(board().getAttribute("data-clear")).toBe(Array.from({ length: 30 }, () => "0".repeat(40)).join(" "));
    expect(drawn.covers.at(-1)).toEqual([800, 600]);
    expect(drawn.stamps).toEqual([]);
    expect(getComputedStyle(board()).animation).toBe("fade-in var(--motion-screen) var(--ease-out) both");
  });

  it("digs up a dinosaur not dug up yet within this visit", () => {
    const { timers } = openRound();
    const first = roundDinosaur();
    brushAll();
    act(() => timers.fire(GUST.motion));

    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(within(homeTile("DIG")).getByText("1")).toBeDefined();
    fireEvent.click(homeTile("DIG"));
    placeBoard(800);

    // The same draw of 0 that dug up the first dinosaur.
    expect(roundDinosaur().id).not.toBe(first.id);
    expect(screen.getByLabelText("DUG UP").textContent).toBe(`1/${SHIPPED_DIG.length}`);
  });
});

describe("the brush", () => {
  it("clears a path along a drag, grains puffing from it as it moves", () => {
    openRound();

    drag([
      [200, 310],
      [300, 310],
      [400, 310],
      [600, 310]
    ]);

    const row = clearCells().filter((cell) => cell.startsWith("15:"));
    expect(row).toEqual(expect.arrayContaining(["15:10", "15:15", "15:20", "15:25", "15:29"]));
    expect(board().querySelectorAll(".dig-puff").length).toBeGreaterThan(1);
  });

  it("just clears the sand under reduced motion, with no grains", () => {
    openRound({ reducedMotion: true });

    drag([
      [200, 310],
      [600, 310]
    ]);

    expect(clearCells()).toContain("15:20");
    expect(board().querySelectorAll(".dig-puff, .dig-grain")).toHaveLength(0);
  });

  it("clears one round spot under a tap, a brush wide", () => {
    const { drawn, sandContext } = spySand();
    openRound({ sandContext });

    tapAt(board(), 0, { x: 410, y: 310 });

    expect(clearCells()).toEqual(["14:20", "15:19", "15:20", "15:21", "16:20"]);
    expect(drawn.stamps).toEqual([{ x: 410, y: 310, r: 24 }]);
  });

  it("takes taps through the double-tap filter: two taps 600 ms apart clear two spots, a press within 500 ms and 100 px clears nothing", () => {
    filterTaps();
    openRound();

    tapAt(board(), 1000, { x: 410, y: 310 });
    tapAt(board(), 1650, { x: 460, y: 310 });
    const two = clearCells();
    expect(two).toEqual(expect.arrayContaining(["15:20", "15:23"]));

    // Within the window of the second tap's release, the whole touch is
    // swallowed, its drag too.
    drag(
      [
        [500, 310],
        [700, 310]
      ],
      1900
    );
    expect(clearCells()).toEqual(two);
    // A stroke begun after a drag is never swallowed.
    drag(
      [
        [200, 110],
        [300, 110]
      ],
      3000
    );
    drag(
      [
        [300, 150],
        [400, 150]
      ],
      3100
    );
    expect(clearCells()).toEqual(expect.arrayContaining(["5:12", "7:17"]));
  });

  it.each([400, 800, 1000])("is 48 CSS pixels across at Hatchling on a board %i pixels wide", (width) => {
    const { drawn, sandContext } = spySand();
    openRound({ sandContext });
    placeBoard(width);

    tapAt(board(), 0, { x: width / 2, y: width * 0.375 });

    expect(drawn.stamps.at(-1)?.r).toBeCloseTo(24);
    expect(board().style.getPropertyValue("--brush")).toBe("48px");
    expect(clearCells()).toContain("15:20");
  });

  it("counts only the dinosaur's cells: the corners clear, but no cell of the dinosaur does, and no gust comes", () => {
    const { timers } = openRound();
    const { cells } = roundDinosaur();
    const corners: Array<[number, number, string]> = [
      [10, 10, "0:0"],
      [790, 10, "0:39"],
      [10, 590, "29:0"],
      [790, 590, "29:39"]
    ];
    expect(corners.map(([x, y]) => cells[Math.floor(y / 20)]?.[Math.floor(x / 20)])).toEqual([false, false, false, false]);

    corners.forEach(([x, y], at) => tapAt(board(), at * 1000, { x, y }));

    expect(clearCells()).toEqual(expect.arrayContaining(corners.map(([, , cell]) => cell)));
    expect([cleared(), board().getAttribute("data-blown"), timers.timers()]).toEqual([0, null, []]);
  });

  it("keeps brushed sand brushed, again over the same place or after lifting the finger, the share only growing", () => {
    openRound();
    const { cells } = roundDinosaur();
    const middle = cells.flatMap((row, rowAt) => row.flatMap((own, column) => (own ? [[column * 20 + 10, rowAt * 20 + 10] as [number, number]] : [])));
    const [x, y] = middle[Math.floor(middle.length / 2)] ?? [400, 300];

    drag([
      [x - 60, y],
      [x + 60, y]
    ]);
    const once = [clearCells(), cleared()] as const;
    expect(once[1]).toBeGreaterThan(0);
    drag(
      [
        [x + 60, y],
        [x - 60, y]
      ],
      1000
    );
    expect([clearCells(), cleared()]).toEqual(once);
    drag(
      [
        [x - 60, y + 40],
        [x + 60, y + 40]
      ],
      2000
    );

    expect(clearCells()).toEqual(expect.arrayContaining(once[0]));
    expect(cleared()).toBeGreaterThanOrEqual(once[1]);
  });

  it("blows the rest of the sand off to one side at 70% of the dinosaur's cells, then shows the dinosaur's name and HOME", () => {
    const { timers } = openRound();
    const { id } = roundDinosaur();

    brushAll();

    expect(cleared()).toBeGreaterThanOrEqual(0.7);
    expect(board().getAttribute("data-blown")).toBe("true");
    expect(getComputedStyle(sandOf()).animation).toBe("dig-gust calc(2 * var(--motion-screen)) var(--ease-out) both");
    expect(timers.timers()).toEqual([GUST.motion]);
    expect(GUST.motion).toBe(640);
    act(() => timers.fire(GUST.motion));

    const name = SHIPPED_DINOSAURS.find((each) => each.id === id)?.name.en.toLocaleUpperCase("en");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(name);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("DIG");
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(homeTile("DIG")).toBeDefined();
  });

  it("fades the rest of the sand away under reduced motion, on the shorter fade", () => {
    const { timers } = openRound({ reducedMotion: true });

    brushAll();

    expect(timers.timers()).toEqual([GUST.reduced]);
    expect(GUST.reduced).toBe(320);
    act(() => timers.fire(GUST.reduced));
    expect(screen.getByRole("heading", { level: 2 })).toBeDefined();
  });

  it("has no timer while brushing or waiting, so nothing counts down or ends the round", () => {
    const { timers } = openRound();

    expect(timers.timers()).toEqual([]);
    drag([
      [100, 100],
      [700, 500]
    ]);
    tapAt(board(), 5000, { x: 300, y: 300 });

    expect(timers.timers()).toEqual([]);
    expect(board().getAttribute("data-blown")).toBeNull();
  });

  it("brushes with the first finger only, and the page neither scrolls nor zooms under it", () => {
    openRound();

    pressAt(board(), 0, { x: 100, y: 110, pointer: 1 });
    pressAt(board(), 20, { x: 600, y: 410, pointer: 2 });
    moveAt(30, { x: 700, y: 410, pointer: 2 });
    moveAt(40, { x: 200, y: 110, pointer: 1 });
    releaseAt(window, 50, { x: 700, y: 410, pointer: 2 });
    moveAt(60, { x: 300, y: 110, pointer: 1 });
    releaseAt(window, 70, { x: 300, y: 110, pointer: 1 });

    expect(clearCells()).toEqual(expect.arrayContaining(["5:5", "5:10", "5:15"]));
    expect(clearCells().filter((cell) => cell.startsWith("20:"))).toEqual([]);
    expect(getComputedStyle(board()).touchAction).toBe("none");
  });

  it("brushes under a mouse's drag as under a finger", () => {
    openRound();
    const mouse = (type: string, target: EventTarget, x: number, y: number) =>
      act(() => {
        target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, button: 0, pointerType: "mouse", bubbles: true, cancelable: true }));
      });

    mouse("pointerdown", board(), 200, 310);
    mouse("pointermove", window, 600, 310);
    mouse("pointerup", window, 600, 310);

    expect(clearCells()).toEqual(expect.arrayContaining(["15:10", "15:20", "15:29"]));
  });

  it("opens no menu at a long press, selects nothing, and clears the spot under the finger", () => {
    openRound();

    pressAt(board(), 0, { x: 410, y: 310 });

    expect(fireEvent.contextMenu(board())).toBe(false);
    expect(clearCells()).toContain("15:20");
    const screenOf = board().closest(".dig-screen") ?? document.body;
    expect(getComputedStyle(screenOf).getPropertyValue("-webkit-user-select")).toBe("none");
    expect(ruleOf(".dig-screen").includes("-webkit-touch-callout: none;")).toBe(true);
    releaseAt(window, 2000, { x: 410, y: 310 });
  });

  it("keeps the same sand clear, scaled with the board, as the page changes size and the iPad turns", () => {
    const { drawn, sandContext } = spySand();
    const { orientation } = openRound({ sandContext });
    drag([
      [200, 310],
      [600, 310]
    ]);
    const brushed = clearCells();
    const stamps = drawn.stamps.length;

    placeBoard(400);
    expect(drawn.covers.at(-1)).toEqual([400, 300]);
    // Every stamp taken off again at half the size.
    expect(drawn.stamps.slice(stamps).map(({ r }) => r)).toEqual(drawn.stamps.slice(0, stamps).map(() => 12));
    expect(clearCells()).toEqual(brushed);

    act(() => orientation.turn("portrait"));
    act(() => orientation.turn("landscape"));
    placeBoard(800);
    expect(clearCells()).toEqual(brushed);
  });
});

describe("HOME", () => {
  it("leaves a half-brushed round unrecorded, and the next round starts under all its sand", () => {
    openRound();
    drag([
      [100, 310],
      [700, 310]
    ]);
    expect(clearCells().length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(homeTile("DIG").querySelector(".dig-tile-count")).toBeNull();
    fireEvent.click(homeTile("DIG"));
    placeBoard(800);

    expect([clearCells(), screen.getByLabelText("DUG UP").textContent]).toEqual([[], `0/${SHIPPED_DIG.length}`]);
  });
});
