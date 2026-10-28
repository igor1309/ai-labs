import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/App.tsx";
import type { AgeLevelSetting } from "../src/ageLevel.ts";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { localAgeLevel, AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localFeatured, localLabyrinthProgress, localProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import {
  emptyCare, emptyDig, emptyPairs, emptySkeletons, emptySorting, fakeBodyPicture,
  manualAppearance, manualTimers, manualViewport, memoryStorage, pageAtRest,
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, unreadVersion, type MemoryStorage
} from "./support.ts";

// Integrates the real game, screens, level setting and shared storage adapters.
export function openLabyrinthApp({ storage = memoryStorage(), ageLevel = { level: "explorer", revision: null }, settings = memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify(ageLevel) }), language = "en", timers = manualTimers() }:
  { storage?: MemoryStorage; ageLevel?: AgeLevelSetting; settings?: MemoryStorage; language?: "en" | "ru"; timers?: ReturnType<typeof manualTimers> } = {}) {
  const local = () => storage;
  const featured = localFeatured(local, HOME_GAMES);
  const viewport = manualViewport("landscape");
  const view = render(<App
    now={() => new Date(2026, 9, 28, 12)} featuredStore={featured} startCounter={featured}
    dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture}
    random={() => 0} portraitLayouts={{ home: ["tall"] }} viewport={viewport}
    progress={localProgress(local)} labyrinthProgress={localLabyrinthProgress(local)}
    deviceLanguage={language} languageStore={localLanguage(local)}
    appearance={manualAppearance("light")} themeStore={localTheme(local)}
    ageLevelStore={localAgeLevel(() => settings)} nameVersion={unreadVersion}
    {...emptyCare()} {...emptyPairs()} {...emptySkeletons()} {...emptySorting()} {...emptyDig()}
    {...pageAtRest()} {...timers}
  />);
  return { ...view, storage, settings, timers, featured, viewport };
}

export const mazeBoard = () => document.querySelector<HTMLElement>(".labyrinth-maze")!;
export const mazeLayout = () => [...mazeBoard().children].filter((cell) => !cell.classList.contains("labyrinth-baby")).map((cell) => cell.classList.contains("labyrinth-wall") ? "#" : ".").join("");
export const mazePosition = () => [...mazeBoard().children].findIndex((cell) => cell.hasAttribute("aria-current"));
export const clickTwice = (element: Element) => act(() => { fireEvent.click(element); fireEvent.click(element); });

// Find the route independently from rendered wall cells, without using help
// or the product's pathfinding to solve rounds intended to be hint-free.
export function mazeRoute(): number[] {
  const board = mazeBoard();
  const columns = Number(board.style.getPropertyValue("--columns"));
  const cells = [...board.children];
  const start = mazePosition();
  const goal = cells.findIndex((cell) => cell.hasAttribute("data-goal"));
  const routes = new Map([[start, [start]]]);
  const queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const place = queue[at]!;
    if (place === goal) return routes.get(place)!;
    for (const next of [place - columns, place + columns, place - 1, place + 1]) {
      if (!cells[next]?.classList.contains("labyrinth-cell") || routes.has(next) ||
        Math.abs(next % columns - place % columns) + Math.abs(Math.floor(next / columns) - Math.floor(place / columns)) !== 1) continue;
      routes.set(next, [...routes.get(place)!, next]);
      queue.push(next);
    }
  }
  throw new Error("The displayed maze has no route home");
}

export function solveMaze({ hint = false, backtrack = false } = {}) {
  const route = mazeRoute();
  if (hint) fireEvent.click(screen.getByRole("button", { name: "HINT" }));
  if (backtrack) {
    fireEvent.click(mazeBoard().children[route[1]!]!);
    fireEvent.click(mazeBoard().children[route[0]!]!);
  }
  for (const place of route.slice(1, -1)) fireEvent.click(mazeBoard().children[place]!);
  clickTwice(mazeBoard().children[route.at(-1)!]!);
}
