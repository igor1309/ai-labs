import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LabyrinthBoardScreen, type LabyrinthBoardScreenProps } from "../src/LabyrinthBoardScreen.tsx";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { adjacentPaths, hintInMaze, isPath, nextMaze, mazeSolved, moveInMaze, startMaze, type LabyrinthRound, type Maze } from "../src/labyrinth/index.ts";
import { useScreens } from "../src/screens.ts";
import { withPictures } from "./pictures.tsx";
import { filterTaps, tapAt } from "./taps.ts";
import { openWindow, styleAt, windowsAnd } from "./windowSizes.ts";
import triceratops from "../src/assets/dinos/triceratops/body.webp";

const layoutFor = (level: AgeLevel) => nextMaze(level, undefined, 0.25);
const defaultMaze = layoutFor("hatchling");
const first = hintInMaze(startMaze(defaultMaze)).hint!;
const second = hintInMaze(moveInMaze(startMaze(defaultMaze), first)).hint!;
const labelFor = (place: number, layout: Maze = defaultMaze) => TEXTS.en.labyrinthBoard.cell(place % layout.rows[0]!.length + 1, Math.floor(place / layout.rows[0]!.length) + 1);
const arrow = (from: number, to: number, columns: number = defaultMaze.rows[0]!.length) =>
  to === from + 1 ? "ArrowRight" : to === from - 1 ? "ArrowLeft" : to > from ? "ArrowDown" : "ArrowUp";

function propsFor(round = startMaze(defaultMaze)): LabyrinthBoardScreenProps {
  const { maze } = round;
  const legal = adjacentPaths(maze, round.position);
  return {
    language: "en", level: maze.level, columns: maze.rows[0]!.length, rows: maze.rows.length,
    cells: Array.from({ length: maze.rows.length * maze.rows[0]!.length }, (_, place) => ({ open: isPath(maze, place), legal: legal.includes(place) })),
    baby: round.position, from: round.from, goal: maze.goal, hint: round.hint, finished: mazeSolved(round), picture: triceratops,
    onMove: vi.fn(), onHint: vi.fn(), onHome: vi.fn()
  };
}

function PlayableBoard({ initial = startMaze(defaultMaze) }: { initial?: LabyrinthRound }) {
  const { screen: round, go } = useScreens<LabyrinthRound>(initial, () => undefined);
  return <LabyrinthBoardScreen {...propsFor(round)} onMove={(place) => go((current) => moveInMaze(current, place))} onHint={() => go(hintInMaze)} />;
}

const maze = () => screen.getByRole("group", { name: "MAZE" });
const cell = (column: number, row: number) => screen.getByRole("button", { name: new RegExp(`^PATH ${column}, ${row}(?: ·|$)`) });
const cellAt = (place: number) => cell(place % defaultMaze.rows[0]!.length + 1, Math.floor(place / defaultMaze.rows[0]!.length) + 1);
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
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
    await user.click(cellAt(first));
    expect(position()).toBe(`${labelFor(first)} · BABY`);
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(0);
    expect(cellAt(defaultMaze.start).getAttribute("data-legal")).toBe("true");
    await user.click(cellAt(defaultMaze.start));
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
  });

  it("ignores walls and distant destinations without automatic movement", () => {
    const props = propsFor();
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    fireEvent.click(cellAt(second));
    fireEvent.click(cellAt(defaultMaze.goal));
    fireEvent.click(part(".labyrinth-wall"));
    expect(props.onMove).not.toHaveBeenCalled();
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
    fireEvent.click(cellAt(first));
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith(first);
  });

  it("uses the root double-tap filter and accepts a later backtrack", () => {
    render(<PlayableBoard />, withPictures);
    filterTaps();
    tapAt(cellAt(first), 0, { x: 100, y: 100 });
    tapAt(cellAt(second), 250, { x: 164, y: 100 });
    expect(position()).toBe(`${labelFor(first)} · BABY`);
    tapAt(cellAt(defaultMaze.start), 1000, { x: 36, y: 100 });
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
  });

  it("moves with arrows only inside the focused board and keeps controls keyboard accessible", async () => {
    const user = userEvent.setup({ delay: null });
    const onHome = vi.fn();
    render(<><PlayableBoard /><button onClick={onHome}>OUTSIDE</button></>, withPictures);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "HOME" }));
    await user.keyboard("{ArrowRight}");
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "HINT" }));
    await user.keyboard("{Enter}");
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(1);
    await user.tab();
    expect(document.activeElement).toBe(maze());
    const columns = defaultMaze.rows[0]!.length;
    const legal = adjacentPaths(defaultMaze, defaultMaze.start);
    for (const [key, offset] of [["ArrowUp", -columns], ["ArrowRight", 1], ["ArrowDown", columns], ["ArrowLeft", -1]] as const) {
      if (!legal.includes(defaultMaze.start + offset)) await user.keyboard(`{${key}}`);
    }
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
    await user.keyboard(`{${arrow(defaultMaze.start, first)}}{${arrow(first, second)}}`);
    expect(position()).toBe(`${labelFor(second)} · BABY`);
    await user.keyboard(`{${arrow(second, first)}}`);
    expect(position()).toBe(`${labelFor(first)} · BABY`);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "OUTSIDE" }));
    await user.keyboard("{Enter}");
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("does not wrap an arrow from the end of a row to the next row", () => {
    const columns = defaultMaze.rows[0]!.length;
    const boundary = Array.from({ length: columns * defaultMaze.rows.length }, (_, at) => at).find((place) =>
      place % columns === columns - 1 && isPath(defaultMaze, place + 1) && adjacentPaths(defaultMaze, place).some((next) => next % columns === columns - 1)
    )!;
    expect(boundary).toBeDefined();
    const vertical = adjacentPaths(defaultMaze, boundary).find((next) => next % columns === columns - 1)!;
    const props = propsFor({ ...startMaze(defaultMaze), position: boundary });
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    fireEvent.keyDown(maze(), { key: "ArrowRight" });
    expect(props.onMove).not.toHaveBeenCalled();
    fireEvent.keyDown(maze(), { key: arrow(boundary, vertical) });
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith(vertical);
  });

  it.each(AGE_LEVELS)("moves and backtracks by one arrow step at %s", async (level) => {
    const layout = layoutFor(level);
    const columns = layout.rows[0]!.length;
    const destination = adjacentPaths(layout, layout.start)[0]!;
    const outward = arrow(layout.start, destination, columns);
    const back = arrow(destination, layout.start, columns);
    const user = userEvent.setup({ delay: null });
    render(<PlayableBoard initial={startMaze(layout)} />, withPictures);
    maze().focus();
    await user.keyboard(`{${outward}}`);
    expect(position()).toBe(`${TEXTS.en.labyrinthBoard.cell(destination % columns + 1, Math.floor(destination / columns) + 1)} · BABY`);
    expect(part(".labyrinth-baby").style.getPropertyValue("--baby-x")).toBe(String(destination % columns));
    expect(part(".labyrinth-baby").style.getPropertyValue("--baby-y")).toBe(String(Math.floor(destination / columns)));
    await user.keyboard(`{${back}}`);
    expect(position()).toBe(`${labelFor(layout.start, layout)} · BABY`);
  });

  it("hands home to its caller and stops moves and help on a solved board", () => {
    const props = propsFor({ ...startMaze(defaultMaze), position: defaultMaze.goal });
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    fireEvent.click(cellAt(adjacentPaths(defaultMaze, defaultMaze.goal)[0]!));
    fireEvent.keyDown(maze(), { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: "HINT" }));
    expect(props.onMove).not.toHaveBeenCalled();
    expect(props.onHint).not.toHaveBeenCalled();
    expect(document.querySelectorAll("[data-legal]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(props.onHome).toHaveBeenCalledOnce();
  });

  it.each(AGE_LEVELS.flatMap((level) => (["en", "ru"] as const).map((language) => ({ level, language }))))("shows uppercase words, symbols and the same family picture at two sizes in $language at $level", ({ language, level }) => {
    const layout = layoutFor(level);
    const props = { ...propsFor(startMaze(layout)), language };
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    const words = TEXTS[language].labyrinthBoard;
    const compact = level !== "hatchling";
    expect(screen.getByRole("heading", { name: compact ? new RegExp(TEXTS[language].ageLevels[level].name) : words.title })).toBeDefined();
    expect(screen.queryByRole("complementary", { name: words.goal }) !== null).toBe(!compact);
    expect(part("[data-goal]").querySelector(".labyrinth-goal-symbol")).not.toBeNull();
    expect(part("[data-legal]").querySelector(".labyrinth-footprint")).not.toBeNull();
    for (const button of document.querySelectorAll(".labyrinth-bar button")) expect(button.querySelector("svg")).not.toBeNull();
    const main = screen.getByRole("main");
    expect(main.textContent).toBe(main.textContent!.toLocaleUpperCase(language));
    for (const element of main.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).toBe(element.getAttribute("aria-label")!.toLocaleUpperCase(language));
    const pictures = [...main.querySelectorAll("img")];
    expect(pictures).toHaveLength(2);
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([triceratops, triceratops]);
    expect(pictures.every((picture) => picture.classList.contains("picture"))).toBe(true);
    const parent = screen.getByRole("img", { name: words.parent });
    const baby = part(".labyrinth-baby-picture");
    const cellSize = Number.parseFloat(getComputedStyle(part(".labyrinth-maze")).getPropertyValue("--cell"));
    const babyWidth = compact ? Number.parseFloat(getComputedStyle(baby).width) : cellSize;
    const babyHeight = compact ? Number.parseFloat(getComputedStyle(baby).height) : cellSize;
    expect(Number.parseFloat(getComputedStyle(parent).width)).toBeGreaterThan(babyWidth);
    expect(Number.parseFloat(getComputedStyle(parent).height)).toBeGreaterThan(babyHeight);
    if (compact) expect(parent.closest("[data-goal]")).toBe(part("[data-goal]"));
    else expect(getComputedStyle(parent).width).toBe("250px");
  });

  it.each(AGE_LEVELS.map(layoutFor))("indicates all legal turns equally, including the goal, without revealing a route in $id", (layout) => {
    const position = adjacentPaths(layout, layout.goal)[0]!;
    const props = propsFor({ ...startMaze(layout), position });
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    const legal = adjacentPaths(layout, position);
    const marked = [...document.querySelectorAll<HTMLElement>("[data-legal]")];
    expect(marked.map((element) => element.getAttribute("aria-label"))).toEqual(legal.sort((a, b) => a - b).map((place) =>
      `${TEXTS.en.labyrinthBoard.cell(place % props.columns + 1, Math.floor(place / props.columns) + 1)}${place === layout.goal ? " · HOME" : ""}`));
    expect(marked.every((element) => element.querySelector(".labyrinth-footprint") !== null)).toBe(true);
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(0);
    expect(part("[data-goal]").hasAttribute("data-legal")).toBe(true);
  });

  it.each(AGE_LEVELS)("accepts wrong turns and highlights only the requested next step at %s", async (level) => {
    const layout = layoutFor(level);
    const junction = Array.from({ length: layout.rows.length * layout.rows[0]!.length }, (_, at) => at).find((place) => adjacentPaths(layout, place).length >= 3)!;
    const initial = { ...startMaze(layout), position: junction, from: junction };
    const correct = hintInMaze(initial).hint!;
    const wrong = adjacentPaths(layout, junction).find((place) => place !== correct)!;
    const user = userEvent.setup({ delay: null });
    render(<PlayableBoard initial={initial} />, withPictures);
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(0);
    const label = (place: number) => TEXTS.en.labyrinthBoard.cell(place % layout.rows[0]!.length + 1, Math.floor(place / layout.rows[0]!.length) + 1);
    await user.click(screen.getByRole("button", { name: label(wrong) }));
    expect(position()).toBe(`${label(wrong)} · BABY`);
    await user.click(screen.getByRole("button", { name: "HINT" }));
    const helped = hintInMaze({ ...initial, position: wrong });
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(1);
    expect(part("[data-hint]").getAttribute("aria-label")).toBe(label(helped.hint!));
    expect(position()).toBe(`${label(wrong)} · BABY`);
    await user.click(screen.getByRole("button", { name: label(helped.hint!) }));
    expect(position()).toBe(`${label(helped.hint!)} · BABY`);
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(0);
    expect(maze().style.getPropertyValue("--columns")).toBe(String(layout.rows[0]!.length));
  });

  it.each(AGE_LEVELS.flatMap((level) => (["light", "dark"] as const).map((theme) => ({ level, theme }))))("keeps paths, walls, hints and focus distinct in $theme at $level", ({ theme, level }) => {
    document.documentElement.dataset.theme = theme;
    try {
      const initial = startMaze(layoutFor(level));
      render(<LabyrinthBoardScreen {...propsFor(hintInMaze(initial))} />, withPictures);
      const background = (selector: string) => getComputedStyle(part(selector)).backgroundColor;
      expect(background(".labyrinth-maze")).not.toBe(background(".labyrinth-cell"));
      expect(background("[data-hint]")).not.toBe(background(".labyrinth-cell:not([data-hint])"));
      expect(getComputedStyle(part("[data-goal]")).borderTopStyle).toBe("solid");
      for (const selector of [".labyrinth-maze:focus-visible", ".labyrinth-bar button:focus-visible", ".labyrinth-cell:focus-visible"]) {
        const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.split(",").some((part) => part.trim() === selector));
        expect(rules.some((rule) => rule.style.outline === "3px solid #c9583d")).toBe(true);
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

describe.each(AGE_LEVELS)("the whole %s board fits", (level) => {
  it.each(windowsAnd([1024, 670]))("keeps the maze, parent and controls visible at %i by %i", (width, height) => {
    openWindow(width, height);
    const props = propsFor(startMaze(layoutFor(level)));
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    const size = [width, height] as const;
    const at = (selector: string) => styleAt(part(selector), size);
    const screenStyle = at(".labyrinth-board-screen");
    expect([screenStyle.value("box-sizing"), screenStyle.value("height"), screenStyle.value("min-height"), screenStyle.value("min-width")]).toEqual(["border-box", `${height}px`, "670px", "1024px"]);
    const compact = level !== "hatchling";
    const padding = compact ? 16 : 24;
    const gap = compact ? 12 : 16;
    expect([screenStyle.px("padding-top"), screenStyle.px("padding-bottom"), screenStyle.rowGap()]).toEqual([padding, padding, gap]);
    const grid = at(".labyrinth-maze");
    const side = Number.parseFloat(grid.value("--cell"));
    expect(side).toBeGreaterThanOrEqual(48);
    expect([grid.value("grid-template-columns"), grid.value("grid-template-rows")]).toEqual(["repeat(var(--columns), var(--cell))", "repeat(var(--rows), var(--cell))"]);
    expect([maze().style.getPropertyValue("--columns"), maze().style.getPropertyValue("--rows")]).toEqual([String(props.columns), String(props.rows)]);
    // styleAt resolves the inherited cell variable to CSS pixels.
    expect([at(".labyrinth-cell").px("width"), at(".labyrinth-cell").px("height")]).toEqual([side, side]);
    const mazeWidth = side * props.columns + grid.px("padding-left") + grid.px("padding-right");
    const mazeHeight = side * props.rows + grid.px("padding-top") + grid.px("padding-bottom");
    const barHeight = 56;
    expect(at(".labyrinth-bar").value("flex")).toBe(`0 0 ${barHeight}px`);
    const aside = compact ? 0 : at(".labyrinth-room").columnGap() + 270;
    expect(mazeWidth + aside + 2 * padding).toBeLessThanOrEqual(width);
    const guidance = Math.max(at(".labyrinth-guidance").px("line-height"), at(".labyrinth-guidance > svg").px("height"));
    expect(mazeHeight + barHeight + guidance + 2 * gap + 2 * padding).toBeLessThanOrEqual(height);
    expect(at(".labyrinth-bar button").px("height")).toBeGreaterThanOrEqual(48);
    expect(compact).toBe(document.querySelector(".labyrinth-parent") === null);
  });

  it("keeps its minimum size and scrollable overflow below the shared minimum", () => {
    openWindow(800, 500);
    render(<LabyrinthBoardScreen {...propsFor(startMaze(layoutFor(level)))} />, withPictures);
    const style = getComputedStyle(screen.getByRole("main"));
    expect([style.minWidth, style.minHeight, style.overflow || "visible"]).toEqual(["1024px", "670px", "visible"]);
    expect(Number.parseFloat(getComputedStyle(maze()).getPropertyValue("--cell"))).toBeGreaterThanOrEqual(48);
  });
});
