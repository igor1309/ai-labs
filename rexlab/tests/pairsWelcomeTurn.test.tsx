import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { pairsWelcomeGeometry } from "../src/pairsWelcomeLayout.ts";
import { drawnOpacity, extendPart, turnFrame } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, englishDevice, fakeBodyPicture,
  featuring, gameDoor, lightDevice, manualPictures, manualViewport,
  seededRandom, unsetAgeLevel
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// find-the-pair-welcome-portrait.feature's turn of the welcome, with
// LAB-375's engine.
const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Window = readonly [width: number, height: number, size: SizeClass];
type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) =>
  element.hasAttribute("data-fitted-picture") ? "fitted-picture" : element.hasAttribute("data-turn-frame") ? `frame of ${nameOf(element.nextElementSibling!)}` : nameOf(element);
const px = (value: unknown) => Number.parseFloat(String(value));

// The column under the cards, from its top down, with the width each part
// stands at in either layout.
const COLUMN_PARTS = ["pairs-title", "pairs-chips", "pairs-levels", "pairs-play"];
const WIDTHS: Record<string, number> = { "pairs-title": 540, "pairs-chips": 260, "pairs-play": 280 };

// The welcome's parts as a browser would lay them out, landscape or
// upright, from the window. Landscape, the cards stand on the left and
// the column on the right, 648 wide, its parts at its left; upright, the
// cards on top of the column, its parts centred, as the geometry sizes
// them, the whole centred under the bar.
function welcomeBox(element: Element): Box {
  const [width, height] = [window.innerWidth, window.innerHeight];
  const name = nameOf(element);
  const stack = (left: number, columnWidth: number, top: number, heights: number[], levels: number, centred: boolean) => {
    const at = COLUMN_PARTS.indexOf(name);
    const partWidth = name === "pairs-levels" ? levels : WIDTHS[name]!;
    return { left: left + (centred ? (columnWidth - partWidth) / 2 : 0), top: top + heights.slice(0, at).reduce((sum, each) => sum + each + 28, 0), width: partWidth, height: heights[at]! };
  };
  if (document.documentElement.dataset.size === "tall") {
    const geometry = pairsWelcomeGeometry(width, height, 0, 0);
    const top = 40 + 56 + 28 + Math.max(0, height - 172 - geometry.card.height - 32 - geometry.stack) / 2;
    if (name === "pairs-cards") return { left: 32, top, width: geometry.width, height: geometry.card.height };
    return stack(32 + (geometry.width - geometry.column) / 2, geometry.column, top + geometry.card.height + 32, [88, 64, 76, 104], geometry.levelSwitch.width, true);
  }
  const heroWidth = width - 112 - 40 - 648;
  const heroHeight = Math.min(0.6 * height, 0.32 * heroWidth * 4 / 3);
  const body = height - 88 - 56 - 28;
  if (name === "pairs-cards") return { left: 56, top: 124 + (body - heroHeight) / 2, width: heroWidth, height: heroHeight };
  const heights = [88, 64, 72, 104];
  const column = heights.reduce((sum, each) => sum + each, 0) + 3 * 28;
  return stack(56 + heroWidth + 40, 648, 124 + (body - column) / 2, heights, 648, false);
}

const measure = (element: Element): Box => (element.closest(".pairs-welcome") ? welcomeBox(element) : { left: 0, top: 0, width: 1, height: 1 });

function openWelcome(from: Window, { reduced = false }: { reduced?: boolean } = {}) {
  openWindow(from[0], from[1]);
  const viewport = manualViewport(from[2] === "tall" ? "portrait" : "landscape");
  const pictures = manualPictures();
  const animations: Recorded[] = [];
  const fades: Array<{ update: () => void; finished: () => void; size: string | undefined }> = [];
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={{ home: ["tall"], "pairs-welcome": ["tall"] }}
      viewport={viewport}
      progress={emptyProgress()}
      {...englishDevice()}
      {...lightDevice()} {...unsetAgeLevel()}
      {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()}
      chipWidths={{ width: () => 0, subscribe: () => () => {} }}
      reducedMotion={() => reduced}
      layoutMotion={{
        parts: document,
        measure,
        frame: turnFrame,
        extend: extendPart,
        animate: (element, keyframes, options) => {
          const animation: Recorded = { name: recordedName(element), keyframes, options, cancelled: false, cancel: () => void (animation.cancelled = true), effect: { getComputedTiming: () => ({ progress: 0 }) } };
          animations.push(animation);
          return animation;
        },
        animations: () => [],
        opacity: drawnOpacity,
        nextFrame: () => () => {},
        startViewTransition: (update, finished) => void fades.push({ update, finished, size: document.documentElement.dataset.size }),
        timing: { glide: GLIDE, easing: EASE_OUT }
      }}
      {...pictures}
    />
  );
  act(() => pictures.finishAll());
  const boxes = () => new Map([...document.querySelectorAll(".pairs-welcome [data-turn-part]")].map((element) => [nameOf(element), measure(element)]));
  return {
    animations, fades, boxes,
    open: async () => {
      await userEvent.setup({ delay: null }).click(gameDoor(TEXTS.en.pairs));
      act(() => pictures.finishAll());
    },
    resize: (to: Window) => {
      openWindow(to[0], to[1]);
      act(() => viewport.resize(to[2], to[2] === "tall"));
    },
    settle: () => act(() => pictures.fire(GLIDE)),
    updateFade: () => act(() => fades.at(-1)?.update()),
    endFade: () => act(() => fades.at(-1)?.finished()),
    turning: () => document.documentElement.hasAttribute("data-turning")
  };
}

// What the welcome shows, and how its cards rise in: none is mounted or
// started again by a turn.
const shown = () => {
  const cards = [...document.querySelectorAll<HTMLElement>(".pairs-welcome .pairs-hero-card")];
  return {
    cards,
    rising: cards.map((card) => getComputedStyle(card).animation),
    title: screen.getByRole("heading", { name: TEXTS.en.pairs }),
    chips: [screen.getByLabelText(TEXTS.en.level), screen.getByLabelText(TEXTS.en.starsEarned)],
    switcher: screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch }),
    play: screen.getByRole("button", { name: TEXTS.en.play })
  };
};

const LANDSCAPE: Window = [1180, 820, "wide"];
const UPRIGHT: Window = [820, 1180, "tall"];

describe("find the pair's welcome turning", () => {
  it("glides the cards, the title, the chips, the level switch and PLAY to the upright layout and back, together", async () => {
    const app = openWelcome(LANDSCAPE);
    await app.open();
    const was = shown();
    expect(was.rising.map((animation) => animation.split(" ")[0])).toEqual(["rise-in", "rise-in", "rise-in"]);
    for (const to of [UPRIGHT, LANDSCAPE]) {
      const before = app.boxes();
      app.animations.length = 0;
      app.resize(to);
      expect([document.documentElement.dataset.size, document.querySelector(".orientation-gate")?.hasAttribute("data-shown")]).toEqual([to[2], false]);
      const after = app.boxes();
      const live = app.animations.filter(({ cancelled }) => !cancelled);
      // Every part of the column moves from its old place to its new one.
      const glides = live.filter(({ name }) => COLUMN_PARTS.includes(name));
      expect(glides.map(({ name, keyframes, options }) => ({ name, from: String(keyframes[0]?.translate).split(" ").map(px), to: keyframes[1]?.translate, options }))).toEqual(
        COLUMN_PARTS.map((name) => {
          const [old, now] = [before.get(name)!, after.get(name)!];
          return { name, from: [old.left - now.left, old.top - now.top], to: "0px 0px", options: { duration: GLIDE, easing: EASE_OUT } };
        })
      );
      // Translation and clip only: nothing is scaled, squashed or faded.
      expect(glides.flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
      // The cards travel from their old box to their new one, each sized
      // by it as it changes, none rising in again.
      const bounds = (box: Box) => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      expect(live.filter(({ name }) => name === "fitted-picture").map(({ keyframes, options }) => ({ keyframes, options }))).toEqual([
        { keyframes: [bounds(before.get("pairs-cards")!), bounds(after.get("pairs-cards")!)], options: { duration: GLIDE, easing: EASE_OUT } }
      ]);
      const copy = document.querySelector<HTMLElement>("[data-fitted-picture]")!;
      expect([copy.classList.contains("pairs-hero"), copy.style.animation, copy.querySelectorAll(".pairs-hero-card").length]).toEqual([true, "none", 3]);
      expect([...copy.querySelectorAll<HTMLElement>("*")].filter((inner) => inner.style.animation !== "none")).toEqual([]);
      expect(document.querySelector<HTMLElement>(".pairs-welcome .pairs-hero")!.style.visibility).toBe("hidden");
      // The level switch changes height, its own background drawn under it.
      const frames = live.filter(({ name }) => name.startsWith("frame of "));
      expect(frames.map(({ name, keyframes }) => [name, px(keyframes[0]?.height), px(keyframes[1]?.height)])).toEqual([
        ["frame of pairs-levels", before.get("pairs-levels")!.height, after.get("pairs-levels")!.height]
      ]);
      expect(live.map(({ name }) => name).sort()).toEqual([...COLUMN_PARTS, "fitted-picture", "frame of pairs-levels"].sort());
      expect([app.turning(), app.fades]).toEqual([true, []]);
      // The same welcome: no card mounted or set rising in anew.
      expect(shown()).toEqual(was);
      app.settle();
      expect(app.turning()).toBe(false);
      expect([document.querySelectorAll("[data-turn-frame]").length, document.querySelectorAll("[data-fitted-picture]").length]).toEqual([0, 0]);
      expect(document.querySelector<HTMLElement>(".pairs-welcome .pairs-hero")!.style.visibility).toBe("");
    }
  });

  it("only fades the landscape welcome into the upright one under reduced motion, nothing moving", async () => {
    const app = openWelcome(LANDSCAPE, { reduced: true });
    await app.open();
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
