import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COUNT_SETTLE, GUST, LIFT, TREASURE_FLIGHT } from "../src/digGame.tsx";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { App } from "../src/App.tsx";
import { localDigProgress, localFeatured, localProgress } from "../src/localProgress.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localTheme } from "../src/localTheme.ts";
import { TEXTS } from "../src/language/texts.ts";
import type { Random } from "../src/dig/index.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DIG,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyPairs,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  lightDevice,
  manualViewport,
  manualVisibility,
  manualTimers,
  memoryStorage,
  pageAtRest,
  unreadVersion,
  type MemoryStorage,
  type ManualViewport,
  type ManualVisibility,
  type ManualPictures,
  type ManualTimers
} from "./support.ts";
import { moveAt, pressAt, releaseAt } from "./taps.ts";

export function openDigApp({
  storage = memoryStorage(),
  ageLevel = { level: "explorer" as const, revision: null },
  reducedMotion = false,
  language = "en" as const,
  theme = "light" as const,
  timers = manualTimers(),
  viewport = manualViewport("landscape"),
  visibility = manualVisibility("visible"),
  random = () => 0,
  settingsStorage
}: {
  storage?: MemoryStorage;
  ageLevel?: { level: "hatchling" | "explorer" | "paleontologist"; revision: string | null };
  reducedMotion?: boolean | (() => boolean);
  language?: "en" | "ru";
  theme?: "light" | "dark";
  timers?: ManualPictures | ManualTimers;
  viewport?: ManualViewport;
  visibility?: ManualVisibility;
  // The app's draws, the featured game's and each round's.
  random?: Random;
  settingsStorage?: MemoryStorage;
} = {}) {
  const local = () => storage;
  const settings = settingsStorage ?? memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify(ageLevel) });
  const ageLevels = localAgeLevel(() => settings);
  const featured = localFeatured(local, HOME_GAMES);
  const view = render(
    <App
      now={() => new Date(2026, 9, 18, 9, 30)}
      featuredStore={featured}
      startCounter={featured}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      portraitLayouts={{}}
      viewport={viewport}
      progress={localProgress(local)}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={localLanguage(local)}
      nameVersion={unreadVersion}
      appearance={lightDevice().appearance}
      themeStore={localTheme(local)}
      ageLevelStore={{ load: () => settingsStorage ? ageLevels.load() : ageLevel, save: ageLevels.save }}
      {...emptyCare()}
      {...emptyPairs()}
      {...emptySkeletons()}
      pageVisibility={visibility}
      {...emptySorting()}
      digDinosaurs={SHIPPED_DIG}
      digProgress={localDigProgress(local)}
      sandContext={() => null}
      {...pageAtRest()}
      reducedMotion={typeof reducedMotion === "function" ? reducedMotion : () => reducedMotion}
      {...timers}
    />
  );
  document.documentElement.dataset.theme = theme;
  return { user: userEvent.setup(), timers, storage, settingsStorage: settings, featured, viewport, visibility, unmount: view.unmount };
}

// The dig game's board, read and brushed as a test sees it.

export const board = () => screen.getByRole("group", { name: TEXTS[document.documentElement.lang === "ru" ? "ru" : "en"].sand });
export const sandOf = () => board().querySelector(".dig-sand") ?? board();

// The board laid out `width` CSS pixels wide at the page's top left, in
// the frame's 4:3 shape, and the page told it changed size.
export function placeBoard(width: number) {
  const rect = { left: 0, top: 0, x: 0, y: 0, width, height: width * 0.75, right: width, bottom: width * 0.75, toJSON: () => ({}) };
  for (const element of [board(), sandOf()]) element.getBoundingClientRect = () => rect as DOMRect;
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

// The clear cells the board reports, as "row:column".
export const clearCells = () =>
  (board().getAttribute("data-clear") ?? "").split(" ").flatMap((row, rowAt) => [...row].flatMap((cell, column) => (cell === "1" ? [`${rowAt}:${column}`] : [])));

export const cleared = () => Number(board().getAttribute("data-cleared"));

// The dinosaur under the sand, by its picture.
export const roundDinosaur = () => {
  const id = /\/pictures\/(.+)\.webp$/.exec(board().querySelector("img")?.getAttribute("src") ?? "")?.[1];
  const dug = SHIPPED_DIG.find((each) => each.id === id);
  if (!dug) throw new Error("No dinosaur under the sand");
  return dug;
};

// A finger's drag along `points`, from `time`, 10 ms a step.
export function drag(points: Array<[number, number]>, time = 0, pointer = 1) {
  const [first, ...rest] = points;
  if (!first) return;
  pressAt(board(), time, { x: first[0], y: first[1], pointer });
  rest.forEach(([x, y], step) => moveAt(time + 10 * (step + 1), { x, y, pointer }));
  const [x, y] = points.at(-1) ?? first;
  releaseAt(window, time + 10 * points.length, { x, y, pointer });
}

// Brushes the whole board, a row of the frame at a time, until the gust
// or, at Explorer and Paleontologist, until it is all clear.
export function brushAll() {
  for (let y = 20; y < 600 && board().getAttribute("data-blown") === null; y += 40)
    drag(
      [
        [0, y],
        [800, y]
      ],
      y * 100
    );
}

// The question's card of the dinosaur `id`, or of the one under the sand.
export const choiceCard = (id = roundDinosaur().id) => {
  const card = document.querySelector<HTMLButtonElement>(`.dig-choice-card[data-choice="${id}"]`);
  if (!card) throw new Error(`No choice of ${id}`);
  return card;
};

// The question's cards of the dinosaurs not under the sand.
export const wrongCards = () => [...document.querySelectorAll<HTMLButtonElement>(".dig-choice-card")].filter((card) => card.dataset.choice !== roundDinosaur().id);

// Digs the dinosaur up whole: brushes the board and, where the round
// asks who it is, names it at the first pick.
export function digUp() {
  brushAll();
  if (board().getAttribute("data-blown") === null) fireEvent.click(choiceCard());
}

// Lands a found treasure's flight. A round with no treasure in flight has
// no such timer; firing that wait has no effect there.
export function landTreasure(timers: Pick<ManualTimers, "fire">, timing: "motion" | "reduced" = "motion") {
  act(() => timers.fire(TREASURE_FLIGHT[timing]));
}

// Finishes the gust and lift, including a new star's count tick, landing
// a treasure in flight as it would land, during the lift. Repeated finds
// have no count timer; firing that wait has no effect there.
export function finishBoard(timers: Pick<ManualTimers, "fire">, timing: "motion" | "reduced" = "motion") {
  act(() => timers.fire(GUST[timing]));
  landTreasure(timers, timing);
  act(() => timers.fire(LIFT[timing]));
  if (COUNT_SETTLE[timing] > 0) act(() => timers.fire(COUNT_SETTLE[timing]));
}
