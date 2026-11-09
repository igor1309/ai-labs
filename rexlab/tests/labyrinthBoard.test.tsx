import { THEMES } from "../src/theme.ts";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { browserInput } from "../src/root.ts";
import { LabyrinthBoardScreen, type LabyrinthBoardScreenProps } from "../src/LabyrinthBoardScreen.tsx";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { adjacentPaths, hintInMaze, isPath, nextMaze, mazeSolved, moveInMaze, startMaze, type LabyrinthRound, type Maze } from "../src/labyrinth/index.ts";
import { useScreens } from "../src/screens.ts";
import { withPictures } from "./pictures.tsx";
import { filterTaps, tapAt } from "./taps.ts";
import { openWindow } from "./windowSizes.ts";
import triceratops from "../src/assets/dinos/triceratops/body.webp";
import { appStylesheet, NO_SAFE_AREA } from "./stylesheet.ts";

// The board brings its own sheet, as in the app.
const boardSheet = document.createElement("style");
boardSheet.textContent = appStylesheet(NO_SAFE_AREA, ["labyrinthBoard.css"]);
document.head.append(boardSheet);

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
  it("keeps moving and accepting keyboard controls after repeated native selection and menu attempts", async () => {
    const input = browserInput(window);
    onTestFinished(input.stop);
    render(<PlayableBoard />, withPictures);
    for (const element of [part(".labyrinth-bar h1"), part(".labyrinth-baby-picture"), maze(), cellAt(first)]) {
      expect(getComputedStyle(element).userSelect).toBe("none");
      for (const type of ["contextmenu", "selectstart", "contextmenu"]) expect(fireEvent(element, new Event(type, { bubbles: true, cancelable: true }))).toBe(false);
    }
    expect(getComputedStyle(maze()).touchAction).toBe("none");
    tapAt(cellAt(first), 0, { x: 100, y: 100 });
    tapAt(cellAt(defaultMaze.start), 250, { x: 36, y: 100 });
    expect(position()).toBe(`${labelFor(first)} · BABY`);
    const user = userEvent.setup({ delay: null });
    maze().focus();
    await user.keyboard(`{${arrow(first, defaultMaze.start)}}`);
    expect(position()).toBe(`${labelFor(defaultMaze.start)} · BABY`);
    tapAt(cellAt(first), 1000, { x: 100, y: 100 });
    expect(position()).toBe(`${labelFor(first)} · BABY`);
  });

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
    expect(document.querySelector(".labyrinth-mark") !== null).toBe(!compact);
    expect(document.querySelector(".labyrinth-level-picture") !== null).toBe(compact);
    // The parent waits beside the maze at every level, with the words and
    // the guidance; on the larger mazes it stands on home as well.
    expect(screen.getByRole("region", { name: words.goal }).textContent).toBe(words.bringHome);
    expect(part(".labyrinth-guidance").textContent).toBe(words.tapStep);
    expect(part("[data-goal]").querySelector(".labyrinth-goal-symbol")).not.toBeNull();
    const shown = (selector: string) => [...part("[data-goal]").querySelectorAll(selector)].some((element) => getComputedStyle(element).display !== "none");
    expect([shown(".labyrinth-goal-badge"), shown(".labyrinth-goal-picture"), shown(".labyrinth-goal-house")]).toEqual([compact, compact, !compact]);
    expect(part("[data-legal]").querySelector(".labyrinth-spot .labyrinth-footprint")).not.toBeNull();
    for (const button of document.querySelectorAll(".labyrinth-bar button")) expect(button.querySelector("svg")).not.toBeNull();
    const main = screen.getByRole("main");
    expect(main.textContent).toBe(main.textContent!.toLocaleUpperCase(language));
    for (const element of main.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).toBe(element.getAttribute("aria-label")!.toLocaleUpperCase(language));
    // Home always holds the parent's picture; the stylesheet shows it there
    // on the larger mazes and on a short phone.
    const pictures = [...main.querySelectorAll("img")];
    expect(pictures).toHaveLength(3);
    expect(pictures.every((picture) => picture.getAttribute("src") === triceratops && picture.classList.contains("picture"))).toBe(true);
    // One picture is named the parent: on home where it stands there,
    // otherwise beside the maze.
    const parent = screen.getByRole("img", { name: words.parent });
    expect(parent.closest(compact ? "[data-goal]" : ".labyrinth-side")).not.toBeNull();
  });

  it.each(AGE_LEVELS)("brings baby and parent together on home at %s, with nothing left to tap", (level) => {
    const layout = layoutFor(level);
    const props = propsFor({ ...startMaze(layout), position: layout.goal });
    render(<LabyrinthBoardScreen {...props} />, withPictures);
    expect(screen.getByRole("main").hasAttribute("data-finished")).toBe(true);
    expect(part("[data-goal]").querySelector(".labyrinth-goal-picture")).not.toBeNull();
    expect(part("[data-goal]").querySelector(".labyrinth-goal-badge")).toBeNull();
    expect(screen.getByRole("region", { name: TEXTS.en.labyrinthBoard.goal }).textContent).toBe(TEXTS.en.labyrinthResult.title);
    expect(getComputedStyle(part(".labyrinth-guidance")).visibility).toBe("hidden");
    expect(screen.getByRole("button", { name: "HINT" }).hasAttribute("disabled")).toBe(true);
  });

  it("turns HINT amber while its hint shows", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PlayableBoard />, withPictures);
    const hint = screen.getByRole("button", { name: "HINT" });
    expect(hint.hasAttribute("data-showing")).toBe(false);
    await user.click(hint);
    expect(hint.hasAttribute("data-showing")).toBe(true);
    expect(part("[data-hint] .labyrinth-spot").querySelector(".labyrinth-hint")).not.toBeNull();
    await user.click(part("[data-hint]"));
    expect(hint.hasAttribute("data-showing")).toBe(false);
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

  it.each(AGE_LEVELS.flatMap((level) => THEMES.map((theme) => ({ level, theme }))))("keeps paths, walls, hints and focus distinct in $theme at $level", ({ theme, level }) => {
    document.documentElement.dataset.theme = theme;
    try {
      const layout = layoutFor(level);
      const junction = Array.from({ length: layout.rows.length * layout.rows[0]!.length }, (_, at) => at).find((place) => adjacentPaths(layout, place).length >= 3)!;
      render(<LabyrinthBoardScreen {...propsFor(hintInMaze({ ...startMaze(layout), position: junction, from: junction }))} />, withPictures);
      const background = (selector: string) => getComputedStyle(part(selector)).backgroundColor;
      // Tunnels stay lighter than the earth; a footprint's spot differs
      // from its tunnel, and the hint's from every other spot.
      expect(background(".labyrinth-maze")).not.toBe(background(".labyrinth-cell"));
      expect(background("[data-legal]:not([data-hint]) .labyrinth-spot")).not.toBe(background(".labyrinth-cell"));
      expect(background("[data-hint] .labyrinth-spot")).not.toBe(background("[data-legal]:not([data-hint]) .labyrinth-spot"));
      expect(getComputedStyle(part("[data-goal]")).boxShadow).toMatch(/inset/);
      const outline = (selector: string) => [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
        .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.split(",").some((part) => part.trim() === selector))
        .map((rule) => rule.style.outline);
      expect(outline(".labyrinth-maze:focus-visible")).toContain("5px solid var(--ds-strong)");
      for (const selector of [".labyrinth-bar button:focus-visible", ".labyrinth-cell:focus-visible"]) expect(outline(selector)).toContain("3px solid var(--ds-strong)");
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

// Where each board fits, and that each cell is its level's own size on an
// iPad mini, is measured in a browser: tests/labyrinthLayout.browser.cjs.
describe.each(AGE_LEVELS)("the %s board", (level) => {
  const CELLS = { hatchling: "64px", explorer: "52px", paleontologist: "48px" };

  it("asks for its level's cell, never under 48, with the bar's controls at least 48 tall", () => {
    openWindow(1133, 744);
    render(<LabyrinthBoardScreen {...propsFor(startMaze(layoutFor(level)))} />, withPictures);
    const style = getComputedStyle(screen.getByRole("main"));
    expect(style.getPropertyValue("--cell-max").trim()).toBe(CELLS[level]);
    const grid = getComputedStyle(maze());
    expect(grid.getPropertyValue("--cell").replace(/\s/g, "")).toMatch(/^max\(48px,min\(var\(--cell-max\),/);
    expect([grid.gridTemplateColumns, grid.gridTemplateRows]).toEqual(["repeat(var(--columns), var(--cell))", "repeat(var(--rows), var(--cell))"]);
    for (const button of document.querySelectorAll(".labyrinth-bar button")) expect(getComputedStyle(button).minHeight).toBe("48px");
  });

  it("keeps its minimum size and scrollable overflow below the shared minimum", () => {
    openWindow(800, 500);
    render(<LabyrinthBoardScreen {...propsFor(startMaze(layoutFor(level)))} />, withPictures);
    const style = getComputedStyle(screen.getByRole("main"));
    expect([style.minWidth, style.minHeight, style.overflow || "visible"]).toEqual(["1024px", "670px", "visible"]);
  });
});
