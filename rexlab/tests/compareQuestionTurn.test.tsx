import { emptyLabyrinth } from "./support.ts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App, type SizeClass } from "../src/App.tsx";
import { compareQuestionGeometry } from "../src/compareQuestionLayout.ts";
import { TEXTS } from "../src/language/texts.ts";
import { correctOf } from "../src/quiz/round.ts";
import { drawnOpacity, extendPart, turnFrame } from "../src/root.ts";
import type { Box, TurnAnimation } from "../src/turnMotion.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  gameDoor, lightDevice, manualPictures, manualViewport, pageAtRest,
  seededRandom, shownQuestion, unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";

vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, addTransitionType: vi.fn(react.addTransitionType) };
});

// compare-dinosaurs-portrait.feature's turn of the question, with
// LAB-375's engine.
const GLIDE = 240;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Window = readonly [width: number, height: number, size: SizeClass];
type Recorded = TurnAnimation & { name: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean };

const nameOf = (element: Element) => element.getAttribute("data-turn-part") ?? "";
const recordedName = (element: Element) => (element.hasAttribute("data-turn-frame") ? `frame of ${nameOf(element.nextElementSibling!)}` : nameOf(element));
const px = (value: unknown) => Number.parseFloat(String(value));

// Every part of the question, from the bar to the row for NEXT.
const QUESTION_PARTS = ["question-bar", "question-prompt", "question-left", "question-versus", "question-right", "question-next"];

// The question's parts as a browser would lay them out, landscape or
// upright, from the window. Landscape, the cards stand side by side with
// "VS" between them; upright, one above the other, as the geometry sizes
// them, with "VS" on their seam.
function questionBox(element: Element): Box {
  const [width, height] = [window.innerWidth, window.innerHeight];
  const inner = width - 112;
  if (document.documentElement.dataset.size === "tall") {
    const geometry = compareQuestionGeometry(width, height, 0, 0);
    const cardsTop = 128 + 56 + 32;
    const seam = cardsTop + geometry.cardHeight + 12;
    const boxes: Record<string, Box> = {
      "question-bar": { left: 56, top: 40, width: inner, height: 56 },
      "question-prompt": { left: 56, top: 128, width: inner, height: 56 },
      "question-left": { left: 56, top: cardsTop, width: inner, height: geometry.cardHeight },
      "question-versus": { left: 56 + (inner - 64) / 2, top: seam - 32, width: 64, height: 64 },
      "question-right": { left: 56, top: seam + 12, width: inner, height: geometry.cardHeight },
      "question-next": { left: 56, top: seam + 12 + geometry.cardHeight + 32, width: inner, height: 72 }
    };
    return boxes[nameOf(element)]!;
  }
  const card = (inner - 64 - 48) / 2;
  const cardsHeight = height - 40 - 48 - 56 - 56 - 72 - 3 * 32;
  const boxes: Record<string, Box> = {
    "question-bar": { left: 56, top: 40, width: inner, height: 56 },
    "question-prompt": { left: 56, top: 128, width: inner, height: 56 },
    "question-left": { left: 56, top: 216, width: card, height: cardsHeight },
    "question-versus": { left: 56 + card + 24, top: 216 + (cardsHeight - 64) / 2, width: 64, height: 64 },
    "question-right": { left: 56 + card + 112, top: 216, width: card, height: cardsHeight },
    "question-next": { left: 56, top: 216 + cardsHeight + 32, width: inner, height: 72 }
  };
  return boxes[nameOf(element)]!;
}

const measure = (element: Element): Box => (element.closest(".question") ? questionBox(element) : { left: 0, top: 0, width: 1, height: 1 });

async function openAnswered(from: Window, { reduced = false }: { reduced?: boolean } = {}) {
  openWindow(from[0], from[1]);
  const viewport = manualViewport(from[2] === "tall" ? "portrait" : "landscape");
  const pictures = manualPictures();
  const animations: Recorded[] = [];
  const fades: Array<{ update: () => void; finished: () => void; size: string | undefined }> = [];
  render(
    <App {...emptyLabyrinth()}
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={{ home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"] }}
      viewport={viewport}
      progress={emptyProgress()}
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
  const user = userEvent.setup({ delay: null });
  await user.click(gameDoor(TEXTS.en.quizCard));
  act(() => pictures.finishAll());
  const right = correctOf(shownQuestion());
  await user.click(within(screen.getByRole("group", { name: TEXTS.en.creatures })).getByRole("button", { name: right.name.en }));
  const boxes = () => new Map([...document.querySelectorAll(".question [data-turn-part]")].map((element) => [nameOf(element), measure(element)]));
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

// What the question shows: each card, its mark and its value, and NEXT.
const shown = () => {
  const cards = within(screen.getByRole("group", { name: TEXTS.en.creatures })).getAllByRole("button");
  return {
    cards,
    marks: cards.map((card) => card.querySelector("[role=img]")?.getAttribute("aria-label") ?? null),
    values: cards.map((card) => card.querySelector(".dinosaur-value-chip")?.textContent ?? null),
    next: screen.getByRole("button", { name: TEXTS.en.next })
  };
};

const LANDSCAPE: Window = [1180, 820, "wide"];
const UPRIGHT: Window = [820, 1180, "tall"];

describe("the compare quiz's question turning", () => {
  it("glides the bar, the prompt, the cards, VS and NEXT of an answered question to the upright layout and back", async () => {
    const app = await openAnswered(LANDSCAPE);
    const was = shown();
    for (const to of [UPRIGHT, LANDSCAPE]) {
      const before = app.boxes();
      app.animations.length = 0;
      app.resize(to);
      expect(document.documentElement.dataset.size).toBe(to[2]);
      const after = app.boxes();
      const glides = app.animations.filter(({ name, cancelled }) => !cancelled && !name.startsWith("frame of "));
      expect(glides.map(({ name, keyframes, options }) => ({ name, from: String(keyframes[0]?.translate).split(" ").map(px), to: keyframes[1]?.translate, options }))).toEqual(
        // The bar and the prompt stay where they stood, only narrowing or
        // widening; every other part moves.
        QUESTION_PARTS.filter((name) => name !== "question-bar" && name !== "question-prompt").map((name) => {
          const [old, now] = [before.get(name)!, after.get(name)!];
          return { name, from: [old.left - now.left, old.top - now.top], to: "0px 0px", options: { duration: GLIDE, easing: EASE_OUT } };
        })
      );
      // Translation and clip only: nothing is scaled, squashed or faded.
      expect(glides.flatMap(({ keyframes }) => keyframes.flatMap(Object.keys)).filter((property) => property !== "translate" && property !== "clipPath")).toEqual([]);
      // Each card changes size, its own background drawn under it.
      const frames = app.animations.filter(({ name, cancelled }) => !cancelled && name.startsWith("frame of "));
      expect(frames.map(({ name, keyframes }) => [name, px(keyframes[0]?.width), px(keyframes[1]?.width)])).toEqual(
        ["question-left", "question-right"].map((name) => [`frame of ${name}`, before.get(name)!.width, after.get(name)!.width])
      );
      expect([app.turning(), app.fades]).toEqual([true, []]);
      // The same question, answered as it was, nothing mounted again.
      expect(shown()).toEqual(was);
      app.settle();
      expect(app.turning()).toBe(false);
      expect(document.querySelectorAll("[data-turn-frame]")).toHaveLength(0);
    }
  });

  it("only fades the landscape question into the upright one under reduced motion, nothing moving", async () => {
    const app = await openAnswered(LANDSCAPE, { reduced: true });
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
