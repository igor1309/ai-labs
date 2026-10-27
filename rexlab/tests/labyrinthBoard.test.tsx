import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LabyrinthBoardScreen, type LabyrinthBoardScreenProps } from "../src/LabyrinthBoardScreen.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { adjacentPaths, hintInMaze, isPath, MAZES, mazeSolved, moveInMaze, startMaze, type LabyrinthRound } from "../src/labyrinth/index.ts";
import { useScreens } from "../src/screens.ts";
import { withPictures } from "./pictures.tsx";
import { filterTaps, tapAt } from "./taps.ts";
import { openWindow, styleAt, windowsAnd } from "./windowSizes.ts";
import triceratops from "../src/assets/dinos/triceratops/body.webp";

function propsFor(round = startMaze(MAZES[0]!)): LabyrinthBoardScreenProps {
  const { maze } = round;
  const legal = adjacentPaths(maze, round.position);
  return {
    language: "en", columns: maze.rows[0]!.length, rows: maze.rows.length,
    cells: Array.from({ length: maze.rows.length * maze.rows[0]!.length }, (_, place) => ({ open: isPath(maze, place), legal: legal.includes(place) })),
    baby: round.position, from: round.from, goal: maze.goal, hint: round.hint, finished: mazeSolved(round), picture: triceratops,
    onMove: vi.fn(), onHint: vi.fn(), onHome: vi.fn()
  };
}

function PlayableBoard() {
  const { screen: round, go } = useScreens<LabyrinthRound>(startMaze(MAZES[0]!), () => undefined);
  return <LabyrinthBoardScreen {...propsFor(round)} onMove={(place) => go((current) => moveInMaze(current, place))} onHint={() => go(hintInMaze)} />;
}

const maze = () => screen.getByRole("group", { name: "MAZE" });
const cell = (column: number, row: number) => screen.getByRole("button", { name: new RegExp(`^PATH ${column}, ${row}(?: ·|$)`) });
const position = () => document.querySelector('[aria-current="location"]')?.getAttribute("aria-label");
const part = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element;
};

describe("a playable labyrinth board", () => {
  it("moves one step, clears help, and leaves the old space available", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PlayableBoard />, withPictures);
    await user.click(screen.getByRole("button", { name: "HINT" }));
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(1);
    expect(position()).toBe("PATH 1, 1 · BABY");
    await user.click(cell(2, 1));
    expect(position()).toBe("PATH 2, 1 · BABY");
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(0);
    expect(cell(1, 1).getAttribute("data-legal")).toBe("true");
    await user.click(cell(1, 1));
    expect(position()).toBe("PATH 1, 1 · BABY");
  });

  it("ignores walls and distant destinations without automatic movement", () => {
    const props = propsFor();
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    fireEvent.click(cell(3, 1));
    fireEvent.click(cell(9, 7));
    fireEvent.click(part(".labyrinth-wall"));
    expect(props.onMove).not.toHaveBeenCalled();
    expect(position()).toBe("PATH 1, 1 · BABY");
    fireEvent.click(cell(2, 1));
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("uses the root double-tap filter and accepts a later backtrack", () => {
    render(<PlayableBoard />, withPictures);
    filterTaps();
    tapAt(cell(2, 1), 0, { x: 100, y: 100 });
    tapAt(cell(3, 1), 250, { x: 164, y: 100 });
    expect(position()).toBe("PATH 2, 1 · BABY");
    tapAt(cell(1, 1), 1000, { x: 36, y: 100 });
    expect(position()).toBe("PATH 1, 1 · BABY");
  });

  it("moves with arrows only inside the focused board and keeps controls keyboard accessible", async () => {
    const user = userEvent.setup({ delay: null });
    const onHome = vi.fn();
    render(<><PlayableBoard /><button onClick={onHome}>OUTSIDE</button></>, withPictures);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "HOME" }));
    await user.keyboard("{ArrowRight}");
    expect(position()).toBe("PATH 1, 1 · BABY");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "HINT" }));
    await user.keyboard("{Enter}");
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(1);
    await user.tab();
    expect(document.activeElement).toBe(maze());
    await user.keyboard("{ArrowUp}{ArrowLeft}{ArrowDown}");
    expect(position()).toBe("PATH 1, 1 · BABY");
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
    expect(position()).toBe("PATH 3, 2 · BABY");
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(position()).toBe("PATH 2, 1 · BABY");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "OUTSIDE" }));
    await user.keyboard("{Enter}");
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("does not wrap an arrow from the end of a row to the next row", () => {
    const props = propsFor({ ...startMaze(MAZES[0]!), position: 8 });
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    fireEvent.keyDown(maze(), { key: "ArrowRight" });
    expect(props.onMove).not.toHaveBeenCalled();
    fireEvent.keyDown(maze(), { key: "ArrowDown" });
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith(17);
  });

  it("hands home to its caller and stops moves and help on a solved board", () => {
    const props = propsFor({ ...startMaze(MAZES[0]!), position: 62 });
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    fireEvent.click(cell(8, 7));
    fireEvent.keyDown(maze(), { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: "HINT" }));
    expect(props.onMove).not.toHaveBeenCalled();
    expect(props.onHint).not.toHaveBeenCalled();
    expect(document.querySelectorAll("[data-legal]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(props.onHome).toHaveBeenCalledOnce();
  });

  it.each(["en", "ru"] as const)("shows uppercase words, symbols, a marked goal and the same picture at two sizes in %s", (language: Language) => {
    const props = { ...propsFor(), language };
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    const words = TEXTS[language].labyrinthBoard;
    expect(screen.getByRole("heading", { name: words.title })).toBeDefined();
    expect(screen.getByRole("complementary", { name: words.goal })).toBeDefined();
    expect(part("[data-goal]").querySelector("svg")).not.toBeNull();
    expect(part("[data-legal]").querySelector("svg")).not.toBeNull();
    for (const button of document.querySelectorAll(".labyrinth-bar button")) expect(button.querySelector("svg")).not.toBeNull();
    const main = screen.getByRole("main");
    expect(main.textContent).toBe(main.textContent!.toLocaleUpperCase(language));
    for (const element of main.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).toBe(element.getAttribute("aria-label")!.toLocaleUpperCase(language));
    const pictures = [...main.querySelectorAll("img")];
    expect(pictures).toHaveLength(2);
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([triceratops, triceratops]);
    expect(pictures.every((picture) => picture.classList.contains("picture"))).toBe(true);
    expect(getComputedStyle(pictures[1]!).width).toBe("250px");
    expect(getComputedStyle(part(".labyrinth-baby")).width).toBe("var(--cell)");
  });
});

describe("the whole board fits", () => {
  it.each(windowsAnd([1024, 670]))("keeps the maze, parent and controls visible at %i by %i", (width, height) => {
    openWindow(width, height);
    render(<LabyrinthBoardScreen {...propsFor()} />, withPictures);
    const size = [width, height] as const;
    const at = (selector: string) => styleAt(part(selector), size);
    const screenStyle = at(".labyrinth-board-screen");
    expect([screenStyle.value("box-sizing"), screenStyle.value("height"), screenStyle.value("min-height"), screenStyle.value("min-width")]).toEqual(["border-box", `${height}px`, "670px", "1024px"]);
    expect([screenStyle.px("padding-top"), screenStyle.px("padding-bottom"), screenStyle.rowGap()]).toEqual([24, 24, 16]);
    const grid = at(".labyrinth-maze");
    const side = Number.parseFloat(grid.value("--cell"));
    expect(side).toBeGreaterThanOrEqual(48);
    expect([grid.value("grid-template-columns"), grid.value("grid-template-rows")]).toEqual(["repeat(var(--columns), var(--cell))", "repeat(var(--rows), var(--cell))"]);
    expect([maze().style.getPropertyValue("--columns"), maze().style.getPropertyValue("--rows")]).toEqual(["9", "7"]);
    expect([at(".labyrinth-cell").value("width"), at(".labyrinth-cell").value("height")]).toEqual(["var(--cell)", "var(--cell)"]);
    const mazeWidth = side * 9 + 2 * grid.px("padding-left");
    const mazeHeight = side * 7 + 2 * grid.px("padding-top");
    const barHeight = 56;
    expect(at(".labyrinth-bar").value("flex")).toBe(`0 0 ${barHeight}px`);
    expect(mazeWidth + at(".labyrinth-room").columnGap() + 270 + 2 * 24).toBeLessThanOrEqual(width);
    expect(mazeHeight + barHeight + at(".labyrinth-guidance").px("line-height") + 2 * 16 + 2 * 24).toBeLessThanOrEqual(height);
    expect(at(".labyrinth-bar button").px("height")).toBeGreaterThanOrEqual(48);
  });

  it("keeps its minimum size and scrollable overflow below the shared minimum", () => {
    openWindow(800, 500);
    render(<LabyrinthBoardScreen {...propsFor()} />, withPictures);
    const style = getComputedStyle(screen.getByRole("main"));
    expect([style.minWidth, style.minHeight, style.overflow || "visible"]).toEqual(["1024px", "670px", "visible"]);
    expect(getComputedStyle(maze()).getPropertyValue("--cell")).toBe("64px");
  });
});
