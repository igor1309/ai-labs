import { act, screen } from "@testing-library/react";
import { TEXTS } from "../src/language/texts.ts";
import { SHIPPED_DIG } from "./support.ts";
import { moveAt, pressAt, releaseAt } from "./taps.ts";

// The dig game's board, read and brushed as a test sees it.

export const board = () => screen.getByRole("group", { name: TEXTS[document.documentElement.lang === "ru" ? "ru" : "en"].sand });
export const sandOf = () => board().querySelector("canvas") ?? board();

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

// Brushes the whole board, a row of the frame at a time, until the gust.
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
