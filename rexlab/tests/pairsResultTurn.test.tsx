import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppProps, PortraitLayouts, SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { pairsResultGeometry } from "../src/pairsResultLayout.ts";
import { drawnOpacity, extendPart, turnFrame } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import { endWave, openPairsApp, playBoard } from "./pairsApp.tsx";
import { gameDoor, manualViewport } from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// find-the-pair-result-portrait.feature's turn of the result, with
// LAB-375's engine.
const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Window = readonly [width: number, height: number, size: SizeClass];
type Recorded = TurnAnimation & { element: Element; name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };

const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"], "pairs-result": ["tall"] };

const LANDSCAPE: Window = [1180, 820, "wide"];
const UPRIGHT: Window = [820, 1180, "tall"];

// An Explorer board's nine dinosaurs, each found for the first time, and
// a first best.
const COUNT = 9;

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const FOUND = Array.from({ length: COUNT }, (_, index) => `pairs-found-${index}`);

// The rewards and the actions, from the top of the column down, each with
// the width and height it stands at in either layout.
const COLUMN_PARTS = ["pairs-celebration", "pairs-tries", "pairs-stars", "pairs-title", "pairs-best", "pairs-actions"];
const SIZES: Record<string, [number, number]> = {
  "pairs-celebration": [240, 60], "pairs-tries": [300, 96], "pairs-stars": [120, 48], "pairs-title": [300, 48], "pairs-best": [220, 48], "pairs-actions": [560, 72]
};

// The result's parts as a browser would lay them out, landscape or
// upright, from the window. Landscape, the dinosaurs stand three across
// on the left, each 162 tall, and the column on the right, each part
// centred in the height; upright, the dinosaurs on top of the column, as
// the geometry sizes them.
function resultBox(element: Element): Box {
  const [width, height] = [window.innerWidth, window.innerHeight];
  const name = nameOf(element);
  const column = (left: number, columnWidth: number, top: number) => {
    const at = COLUMN_PARTS.indexOf(name);
    const [partWidth, partHeight] = SIZES[name]!;
    return { left: left + (columnWidth - partWidth) / 2, top: top + COLUMN_PARTS.slice(0, at).reduce((sum, each) => sum + SIZES[each]![1] + 16, 0), width: partWidth, height: partHeight };
  };
  const columnHeight = COLUMN_PARTS.reduce((sum, each) => sum + SIZES[each]![1], 0) + 5 * 16;
  const index = FOUND.indexOf(name);
  if (document.documentElement.dataset.size === "tall") {
    const geometry = pairsResultGeometry({ count: COUNT, badgeRows: 1 }, width, height, 0, 0);
    const cards = geometry.rows * geometry.card.height + (geometry.rows - 1) * 16;
    const top = 32 + Math.max(0, height - 84 - cards - geometry.column) / 2;
    if (index >= 0) return { left: 32 + Math.floor(index % 3) * (geometry.card.width + 16), top: top + Math.floor(index / 3) * (geometry.card.height + 16), width: geometry.card.width, height: geometry.card.height };
    return column(32, geometry.width, top + cards + 20);
  }
  const left = ((width - 100 - 20) * 640) / 1320;
  const card = { width: (left - 32) / 3, height: 162 };
  if (index >= 0) return { left: 40 + (index % 3) * (card.width + 16), top: (height - 3 * 162 - 32) / 2 + Math.floor(index / 3) * (card.height + 16), ...card };
  return column(40 + left + 20, width - 100 - 20 - left, (height - columnHeight) / 2);
}

const measure = (element: Element): Box => (element.closest(".pairs-result") ? resultBox(element) : { left: 0, top: 0, width: 1, height: 1 });

// An Explorer board played to its result in a window of `from`, the
// engine's animations and fades recorded.
async function openResult(from: Window, { reduced = false }: { reduced?: boolean } = {}) {
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
      const animation: Recorded = {
        element, name: element.hasAttribute("data-fitted-picture") ? "fitted-picture" : nameOf(element), keyframes, options, cancelled: false,
        cancel: () => void (animation.cancelled = true), effect: { getComputedTiming: () => ({ progress: 0 }) }
      };
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
  await playBoard(app.user, app.clock);
  endWave(app.clock);
  const boxes = () => new Map([...document.querySelectorAll(".pairs-result [data-turn-part]")].map((element) => [nameOf(element), measure(element)]));
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

// What the result shows, and how each card rises in and each NEW, the
// star and the celebration pop in: none is mounted or set moving again by
// a turn.
const shown = () => {
  const own = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => !element.closest("[data-fitted-picture]"));
  const cards = own(".pairs-found-card");
  const popping = own(".pairs-new-badge, .pairs-result-star, .celebration");
  return {
    cards,
    rising: cards.map((card) => [getComputedStyle(card).animation, card.style.getPropertyValue("--card")]),
    popping,
    pops: popping.map((each) => getComputedStyle(each).animation),
    tries: screen.getByLabelText(TEXTS.en.tries).textContent,
    actions: [TEXTS.en.playAgain, TEXTS.en.back, TEXTS.en.home].map((name) => screen.getByRole("button", { name }))
  };
};

const bounds = (box: Box) => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
const px = (value: unknown) => Number.parseFloat(String(value));

describe("find the pair's result turning", () => {
  it("glides the dinosaurs, the rewards and the actions to the upright layout and back, together", async () => {
    const app = await openResult(LANDSCAPE);
    const was = shown();
    expect([was.cards.length, document.querySelectorAll(".pairs-new-badge").length, was.popping.length]).toEqual([COUNT, COUNT, COUNT + 2]);
    for (const to of [UPRIGHT, LANDSCAPE]) {
      const before = app.boxes();
      app.animations.length = 0;
      app.resize(to);
      expect([document.documentElement.dataset.size, document.querySelector(".orientation-gate")?.hasAttribute("data-shown")]).toEqual([to[2], false]);
      const after = app.boxes();
      const live = app.animations.filter(({ cancelled }) => !cancelled);
      // Each dinosaur travels as a copy in a box that goes from its old
      // box to its new one, all over the glide.
      const copies = live.filter(({ name }) => name === "fitted-picture");
      expect(copies.map(({ element, keyframes, options }) => ({ card: element.querySelector(".pairs-found-name")?.textContent, keyframes, options }))).toEqual(
        was.cards.map((card, index) => ({ card: card.querySelector(".pairs-found-name")?.textContent, keyframes: [bounds(before.get(FOUND[index]!)!), bounds(after.get(FOUND[index]!)!)], options: { duration: GLIDE, easing: EASE_OUT } }))
      );
      expect(before.get(FOUND[0]!)).not.toEqual(after.get(FOUND[0]!));
      // The copies are drawn as the cards stand: none rises in, and no NEW
      // pops in, again.
      const drawn = [...document.querySelectorAll<HTMLElement>("[data-fitted-picture]")];
      expect(drawn.map((copy) => [copy.classList.contains("pairs-found-card"), copy.style.animation])).toEqual(was.cards.map(() => [true, "none"]));
      expect(drawn.flatMap((copy) => [...copy.querySelectorAll<HTMLElement>("*")]).filter((inner) => inner.style.animation !== "none")).toEqual([]);
      expect(was.cards.map((card) => card.style.visibility)).toEqual(was.cards.map(() => "hidden"));
      // Every part of the column moves from its old place to its new one,
      // only translated.
      const glides = live.filter(({ name }) => COLUMN_PARTS.includes(name));
      expect(glides.map(({ name, keyframes, options }) => ({ name, from: String(keyframes[0]?.translate).split(" ").map(px), to: keyframes[1]?.translate, options }))).toEqual(
        COLUMN_PARTS.map((name) => {
          const [old, now] = [before.get(name)!, after.get(name)!];
          return { name, from: [old.left - now.left, old.top - now.top], to: "0px 0px", options: { duration: GLIDE, easing: EASE_OUT } };
        })
      );
      expect(glides.flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => property !== "translate")).toEqual([]);
      expect(live.map(({ name }) => name).sort()).toEqual([...COLUMN_PARTS, ...FOUND.map(() => "fitted-picture")].sort());
      expect([app.turning(), app.fades]).toEqual([true, []]);
      // The same result: nothing mounted or set moving anew.
      expect(shown()).toEqual(was);
      app.settle();
      expect([app.turning(), document.querySelectorAll("[data-fitted-picture]").length]).toEqual([false, 0]);
      expect(was.cards.map((card) => card.style.visibility)).toEqual(was.cards.map(() => ""));
    }
  });

  it("only fades the landscape result into the upright one under reduced motion, nothing moving", async () => {
    const app = await openResult(LANDSCAPE, { reduced: true });
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
