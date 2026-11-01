import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppProps, PortraitLayouts, SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { LARGE_LEVELS } from "../src/pairs/index.ts";
import { pairsBoardGeometry } from "../src/pairsBoardLayout.ts";
import { drawnOpacity, extendPart, turnFrame } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import { board, dealt, MISS, namesOf, openPairsApp, placesOf, triesShown, turnCard } from "./pairsApp.tsx";
import { gameDoor, manualViewport } from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// find-the-pair-board-portrait.feature's turn of the board, with LAB-375's
// engine.
const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Window = readonly [width: number, height: number, size: SizeClass];
type Recorded = TurnAnimation & { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"] };
const EXPLORER = { ...LARGE_LEVELS.explorer, floor: 130 };

const LANDSCAPE: Window = [1180, 820, "wide"];
const UPRIGHT: Window = [820, 1180, "tall"];

// The board's cards in their places, found while a turn hides them.
const pairCards = () => [...board().querySelectorAll<HTMLElement>(".pair-card")];
const stateAt = (place: number) => pairCards()[place]?.getAttribute("data-state");

// A card's place, or the place of the card its copy was drawn for.
const placeOf = (element: Element) => Number((element as HTMLElement).style.getPropertyValue("--card"));

// An Explorer board's card as a browser would lay it out, landscape or
// upright, from the window. Landscape, the board is as wide as the room
// under the bar, or as its height allows at the board's shape, centred,
// its cards 20 apart row by row; upright, the grid on its side as the
// geometry sizes it, centred under the bar, its cards 16 apart down each
// column.
function cardBox(element: Element): Box {
  const [width, height] = [window.innerWidth, window.innerHeight];
  const place = placeOf(element);
  if (document.documentElement.dataset.size === "tall") {
    const board = pairsBoardGeometry(EXPLORER, width, height, 0, 0);
    const across = board.columns * board.card.width + (board.columns - 1) * 16;
    const down = board.rows * board.card.height + (board.rows - 1) * 16;
    const [left, top] = [32 + (board.width - across) / 2, 124 + Math.max(0, height - 172 - down) / 2];
    const [row, column] = [place % board.rows, Math.floor(place / board.rows)];
    return { left: left + column * (board.card.width + 16), top: top + row * (board.card.height + 16), width: board.card.width, height: board.card.height };
  }
  const { rows, columns } = EXPLORER;
  const room = { width: width - 112, height: height - 172 };
  const shape = (columns * 3) / (rows * 3.2);
  const boardWidth = Math.min(room.width, room.height * shape);
  const card = { width: (boardWidth - (columns - 1) * 20) / columns, height: (boardWidth / shape - (rows - 1) * 20) / rows };
  const [row, column] = [Math.floor(place / columns), place % columns];
  return {
    left: 56 + (room.width - boardWidth) / 2 + column * (card.width + 20),
    top: 124 + (room.height - boardWidth / shape) / 2 + row * (card.height + 20),
    width: card.width,
    height: card.height
  };
}

const measure = (element: Element): Box => (element.matches(".pair-board .pair-card") ? cardBox(element) : { left: 0, top: 0, width: 1, height: 1 });

// An Explorer board in a window of `from`, the engine's animations and
// fades recorded.
async function openBoard(from: Window, { reduced = false }: { reduced?: boolean } = {}) {
  openWindow(from[0], from[1]);
  const viewport = manualViewport(from[2] === "tall" ? "portrait" : "landscape");
  const animations: Recorded[] = [];
  const fades: Array<{ update: () => void; finished: () => void; size: string | undefined }> = [];
  const layoutMotion: AppProps["layoutMotion"] = {
    parts: document,
    measure,
    frame: turnFrame,
    extend: extendPart,
    animate: (element, keyframes, options) => {
      const animation: Recorded = { element, keyframes, options, cancelled: false, cancel: () => void (animation.cancelled = true), effect: { getComputedTiming: () => ({ progress: 0 }) } };
      animations.push(animation);
      return animation;
    },
    animations: () => [],
    opacity: drawnOpacity,
    nextFrame: () => () => {},
    startViewTransition: (update, finished) => void fades.push({ update, finished, size: document.documentElement.dataset.size }),
    timing: { glide: GLIDE, easing: EASE_OUT }
  };
  const app = openPairsApp({ viewport, portraitLayouts: PORTRAIT_LAYOUTS, reducedMotion: reduced, layoutMotion, ageLevel: { level: "explorer", revision: "picked-explorer" } });
  await app.user.click(gameDoor(TEXTS.en.pairs));
  await app.user.click(screen.getByRole("button", { name: TEXTS.en.play }));
  const boxes = () => new Map(pairCards().map((card) => [placeOf(card), measure(card)]));
  return {
    ...app, animations, fades, boxes,
    resize: (to: Window) => {
      openWindow(to[0], to[1]);
      act(() => viewport.resize(to[2], to[2] === "tall"));
    },
    settle: () => act(() => app.clock.fire(GLIDE)),
    updateFade: () => act(() => fades.at(-1)?.update()),
    endFade: () => act(() => fades.at(-1)?.finished()),
    turning: () => document.documentElement.hasAttribute("data-turning")
  };
}

// The board as dealt: one pair, a second pair's first card, and a card of
// a third dinosaur, each by its places.
const NAMES = namesOf(dealt({ large: "explorer" }));
const [FIRST, SECOND, THIRD] = [...new Set(NAMES)].map((name) => placesOf(NAMES, name)) as [number[], number[], number[]];

// What the board shows, card by card, and how each rises in and flips: no
// card is mounted, or set rising in or flipping, again by a turn.
const shown = () => ({
  cards: pairCards(),
  states: pairCards().map((card) => card.getAttribute("data-state")),
  labels: pairCards().map((card) => card.getAttribute("aria-label")),
  rising: pairCards().map((card) => getComputedStyle(card).animation),
  faces: pairCards().map((card) => card.firstElementChild),
  tries: triesShown()
});

const bounds = (box: Box) => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });

describe("find the pair's board turning", () => {
  it("glides every card from its old place and size to its new one, together, to the upright layout and back, and play goes on", async () => {
    const app = await openBoard(LANDSCAPE);
    for (const place of [...FIRST, SECOND[0]!]) await turnCard(app.user, place);
    const was = shown();
    expect([was.states.filter((state) => state === "found").length, was.states.filter((state) => state === "open").length, was.tries]).toEqual([2, 1, "1"]);
    for (const to of [UPRIGHT, LANDSCAPE]) {
      const before = app.boxes();
      app.animations.length = 0;
      app.resize(to);
      expect([document.documentElement.dataset.size, document.querySelector(".orientation-gate")?.hasAttribute("data-shown")]).toEqual([to[2], false]);
      const after = app.boxes();
      // Each card travels as a copy in a box that goes from its old box to
      // its new one, all over the glide; nothing else moves.
      const live = app.animations.filter(({ cancelled }) => !cancelled);
      expect(live.map(({ element, keyframes, options }) => ({ place: placeOf(element), fitted: element.hasAttribute("data-fitted-picture"), keyframes, options }))).toEqual(
        was.cards.map((_, place) => ({ place, fitted: true, keyframes: [bounds(before.get(place)!), bounds(after.get(place)!)], options: { duration: GLIDE, easing: EASE_OUT } }))
      );
      expect(before.get(0)).not.toEqual(after.get(0));
      // The copies are drawn as the cards stand, none rising in or flipping.
      const copies = [...document.querySelectorAll<HTMLElement>("[data-fitted-picture]")];
      expect(copies.map((copy) => [copy.classList.contains("pair-card"), copy.getAttribute("data-state"), copy.style.animation])).toEqual(was.states.map((state) => [true, state, "none"]));
      expect(copies.flatMap((copy) => [...copy.querySelectorAll<HTMLElement>("*")]).filter((inner) => inner.style.animation !== "none")).toEqual([]);
      expect(pairCards().map((card) => card.style.visibility)).toEqual(was.cards.map(() => "hidden"));
      expect([app.turning(), app.fades]).toEqual([true, []]);
      // The same board: no card mounted, turned or set moving anew.
      expect(shown()).toEqual(was);
      app.settle();
      expect([app.turning(), document.querySelectorAll("[data-fitted-picture]").length]).toEqual([false, 0]);
      expect(pairCards().map((card) => card.style.visibility)).toEqual(was.cards.map(() => ""));
    }
    await turnCard(app.user, SECOND[1]!);
    expect([stateAt(SECOND[0]!), stateAt(SECOND[1]!), triesShown()]).toEqual(["found", "found", "2"]);
  });

  it("keeps a miss open through the turn, and turns it back when its time is up", async () => {
    const app = await openBoard(LANDSCAPE);
    await turnCard(app.user, SECOND[0]!);
    await turnCard(app.user, THIRD[0]!);
    expect(app.clock.timers()).toEqual([MISS]);
    app.resize(UPRIGHT);
    expect([stateAt(SECOND[0]!), stateAt(THIRD[0]!), app.clock.timers()]).toEqual(["open", "open", [MISS, GLIDE]]);
    app.settle();
    expect([stateAt(SECOND[0]!), stateAt(THIRD[0]!), app.clock.timers()]).toEqual(["open", "open", [MISS]]);
    act(() => app.clock.fire(MISS));
    expect([stateAt(SECOND[0]!), stateAt(THIRD[0]!), triesShown()]).toEqual(["down", "down", "1"]);
    await turnCard(app.user, FIRST[0]!);
    expect(stateAt(FIRST[0]!)).toBe("open");
  });

  it("only fades the landscape board into the upright one under reduced motion, nothing moving", async () => {
    const app = await openBoard(LANDSCAPE, { reduced: true });
    for (const place of [...FIRST, SECOND[0]!]) await turnCard(app.user, place);
    const was = shown();
    app.resize(UPRIGHT);
    expect([app.animations, app.fades.map(({ size }) => size), app.turning()]).toEqual([[], ["wide"], true]);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--motion-small")).toBe("160ms");
    app.updateFade();
    expect([document.documentElement.dataset.size, app.animations]).toEqual(["tall", []]);
    app.endFade();
    expect([app.turning(), shown()]).toEqual([false, was]);
  });
});
