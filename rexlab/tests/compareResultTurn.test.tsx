import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { compareResultGeometry } from "../src/compareResultLayout.ts";
import { TEXTS } from "../src/language/texts.ts";
import { correctOf } from "../src/quiz/round.ts";
import type { ProgressStore } from "../src/quizGame.tsx";
import { drawnOpacity, extendPart, turnFrame } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptySkeletons, emptySorting, fakeBodyPicture, featuring, gameDoor,
  lightDevice, manualPictures, manualViewport, pageAtRest, seededRandom,
  shownQuestion, unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// compare-dinosaurs-result-portrait.feature's turn of the result, with
// LAB-375's engine.
const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Window = readonly [width: number, height: number, size: SizeClass];
type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) =>
  element.hasAttribute("data-fitted-picture") ? "fitted-picture" : element.hasAttribute("data-turn-frame") ? `frame of ${nameOf(element.nextElementSibling!)}` : nameOf(element);
const px = (value: unknown) => Number.parseFloat(String(value));

// The rewards, the level switch and the actions, from the top of the
// column down, with the width each stands at in either layout.
const COLUMN_PARTS = ["result-celebration", "result-score", "result-stars", "result-title", "result-best", "result-levels", "result-actions"];
const WIDTHS: Record<string, number> = { "result-celebration": 240, "result-score": 260, "result-title": 300, "result-best": 220, "result-actions": 420 };

// The result's parts as a browser would lay them out, landscape or
// upright, from the window. Landscape, the dinosaur stands on the left
// and the column on the right, 648 wide, each centred in the height;
// upright, the dinosaur on top of the column, as the geometry sizes them.
function resultBox(element: Element): Box {
  const [width, height] = [window.innerWidth, window.innerHeight];
  const name = nameOf(element);
  const stack = (left: number, columnWidth: number, top: number, heights: number[], star: number, levelSwitch: number) => {
    const widths: Record<string, number> = { ...WIDTHS, "result-stars": 10 * star + 72, "result-levels": levelSwitch };
    const at = COLUMN_PARTS.indexOf(name);
    const partWidth = widths[name]!;
    return { left: left + (columnWidth - partWidth) / 2, top: top + heights.slice(0, at).reduce((sum, each) => sum + each + 16, 0), width: partWidth, height: heights[at]! };
  };
  if (document.documentElement.dataset.size === "tall") {
    const geometry = compareResultGeometry(width, height, 0, 0);
    const top = 32 + Math.max(0, height - 84 - geometry.hero.height - geometry.column) / 2;
    if (name === "result-hero") return { left: 32, top, width: geometry.width, height: geometry.hero.height };
    const heights = [52, geometry.score, geometry.type.star, 48, 48, 76, 80];
    return stack(32, geometry.width, top + geometry.hero.height + 20, heights, geometry.type.star, geometry.levelSwitch.width);
  }
  const heroWidth = width - 64 - 20 - 648;
  const heroHeight = Math.min(480, heroWidth * 0.75);
  if (name === "result-hero") return { left: 32, top: 32 + (height - 64 - heroHeight) / 2, width: heroWidth, height: heroHeight };
  const heights = [52, Math.min(180, 0.2 * height), 48, 48, 48, 72, 80];
  const column = heights.reduce((sum, each) => sum + each, 0) + 6 * 16;
  return stack(32 + heroWidth + 20, 648, 32 + (height - 64 - column) / 2, heights, 48, 648);
}

const measure = (element: Element): Box => (element.closest(".result") ? resultBox(element) : { left: 0, top: 0, width: 1, height: 1 });

// An earlier best, so the round won whole is celebrated.
const EARLIER_BEST: ProgressStore = {
  load: () => ({ progress: { best: { hatchling: 7, explorer: 7, paleontologist: 7 }, roundsPlayed: 3 }, levelChoice: undefined }),
  save: () => {}
};

async function openResult(from: Window, { reduced = false }: { reduced?: boolean } = {}) {
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
      portraitLayouts={{ home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"] }}
      viewport={viewport}
      progress={EARLIER_BEST}
      deviceLanguage="en-GB"
      languageStore={{ load: () => undefined, save: () => {} }}
      nameVersion={unreadVersion}
      {...lightDevice()} {...unsetAgeLevel()}
      {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
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
  const user = userEvent.setup();
  await user.click(gameDoor(TEXTS.en.quizCard));
  while (screen.queryByRole("group", { name: TEXTS.en.creatures })) {
    act(() => pictures.finishAll());
    const right = correctOf(shownQuestion());
    await user.click(within(screen.getByRole("group", { name: TEXTS.en.creatures })).getByRole("button", { name: right.name.en }));
    await user.click(screen.queryByRole("button", { name: TEXTS.en.next }) ?? screen.getByRole("button", { name: TEXTS.en.seeResult }));
  }
  act(() => pictures.finishAll());
  const boxes = () => new Map([...document.querySelectorAll(".result [data-turn-part]")].map((element) => [nameOf(element), measure(element)]));
  return {
    animations, fades, boxes,
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

// What the result shows, each reward that counts up or pops in, and how
// it is animated: none is mounted or started again by a turn.
const shown = () => {
  const value = document.querySelector<HTMLElement>(".result-score-value")!;
  const stars = [...document.querySelectorAll<HTMLElement>(".result-stars .star")];
  return {
    score: screen.getByLabelText(TEXTS.en.score),
    value,
    counting: getComputedStyle(value).animation,
    stars,
    popping: stars.map((star) => [getComputedStyle(star).animation, star.style.getPropertyValue("--star")]),
    celebration: screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label }),
    switcher: screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch }),
    actions: [TEXTS.en.playAgain, TEXTS.en.home].map((name) => screen.getByRole("button", { name }))
  };
};

const LANDSCAPE: Window = [1180, 820, "wide"];
const UPRIGHT: Window = [820, 1180, "tall"];

describe("the compare quiz's result turning", () => {
  it("glides the dinosaur, the rewards, the level switch and the actions to the upright layout and back, together", async () => {
    const app = await openResult(LANDSCAPE);
    const was = shown();
    expect([was.stars.filter((star) => star.classList.contains("star-won")).length, was.score.textContent]).toEqual([10, "10/10"]);
    for (const to of [UPRIGHT, LANDSCAPE]) {
      const before = app.boxes();
      app.animations.length = 0;
      app.resize(to);
      expect(document.documentElement.dataset.size).toBe(to[2]);
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
      // The dinosaur's picture travels from its old box to its new one,
      // fitted whole as it changes size.
      const bounds = (box: Box) => ({ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      expect(live.filter(({ name }) => name === "fitted-picture").map(({ keyframes, options }) => ({ keyframes, options }))).toEqual([
        { keyframes: [bounds(before.get("result-hero")!), bounds(after.get("result-hero")!)], options: { duration: GLIDE, easing: EASE_OUT } }
      ]);
      expect(getComputedStyle(document.querySelector("[data-fitted-picture]")!).objectFit).toBe("contain");
      // The level switch changes height, its own background drawn under it.
      const frames = live.filter(({ name }) => name.startsWith("frame of "));
      expect(frames.map(({ name, keyframes }) => [name, px(keyframes[0]?.height), px(keyframes[1]?.height)])).toEqual([
        ["frame of result-levels", before.get("result-levels")!.height, after.get("result-levels")!.height]
      ]);
      expect(live.map(({ name }) => name).sort()).toEqual([...COLUMN_PARTS, "fitted-picture", "frame of result-levels"].sort());
      expect([app.turning(), app.fades]).toEqual([true, []]);
      // The same result: the score does not count up again and no star
      // pops in again, nothing mounted or animated anew.
      expect(shown()).toEqual(was);
      app.settle();
      expect(app.turning()).toBe(false);
      expect([document.querySelectorAll("[data-turn-frame]").length, document.querySelectorAll("[data-fitted-picture]").length]).toEqual([0, 0]);
      expect(document.querySelector<HTMLElement>(".result-hero")!.style.visibility).toBe("");
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
