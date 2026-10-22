import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { brushWidth } from "../src/dig/index.ts";
import { STAR_LANDS } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, clearCells, digUp, finishBoard, openDigApp, placeBoard } from "./digApp.tsx";
import { SHIPPED_DIG, homeTile } from "./support.ts";
import { tapAt } from "./taps.ts";

// dig-brush-picker.feature: DIG's bar picks the brush or the wide brush,
// twice as big, and the pick stays while DIG is open. Every test round,
// drawn at 0, digs up a Tyrannosaurus.

type Level = "hatchling" | "explorer" | "paleontologist";

const rex = SHIPPED_DIG.find(({ id }) => id === "tyrannosaurus")!;
const helped = () => board().getAttribute("data-helped")?.split(" ").filter(Boolean);
const brushButton = (language: "en" | "ru" = "en") => screen.getByRole<HTMLButtonElement>("button", { name: TEXTS[language].brush });
const wideButton = (language: "en" | "ru" = "en") => screen.getByRole<HTMLButtonElement>("button", { name: TEXTS[language].wideBrush });
const pressed = () => [brushButton(), wideButton()].map((button) => button.getAttribute("aria-pressed"));

function openRound(level: Level = "hatchling", options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp({ ageLevel: { level, revision: null }, ...options });
  fireEvent.click(homeTile(TEXTS[options.language ?? "en"].dig));
  placeBoard(800);
  return app;
}

// The round dug up and its reveal taking taps.
function reveal(app: ReturnType<typeof openRound>) {
  digUp();
  finishBoard(app.timers);
  act(() => app.timers.fire(STAR_LANDS.motion));
}

describe("the two brushes", () => {
  it.each([
    ["hatchling", 48, 96],
    ["explorer", 36, 72],
    ["paleontologist", 36, 72]
  ] as const)("are %s's %i and %i CSS pixels across", (level, size, wide) => {
    expect([brushWidth(level, false), brushWidth(level, true)]).toEqual([size, wide]);
  });

  it.each(["hatchling", "explorer"] as const)("clear a spot twice as wide under a tap at %s, the board at any size", (level) => {
    openRound(level);
    placeBoard(400);
    tapAt(board(), 0, { x: 100, y: 75 });
    const narrow = clearCells();
    fireEvent.click(wideButton());
    tapAt(board(), 1000, { x: 300, y: 225 });
    const rows = (cells: string[]) => new Set(cells.map((cell) => cell.split(":")[0])).size;
    const wide = clearCells().filter((cell) => !narrow.includes(cell));

    // Each frame pixel is half a CSS pixel: the brush covers twice the
    // frame's width, and the wide one twice that again.
    expect(rows(narrow)).toBe(level === "hatchling" ? 5 : 3);
    expect(rows(wide)).toBe(level === "hatchling" ? 9 : 7);
  });
});

describe("the bar's picker", () => {
  it.each(["en", "ru"] as const)("stands before the FIELD GUIDE with the brush picked, read out in %s", (language) => {
    openRound("hatchling", { language });
    const bar = screen.getByRole("banner");
    const buttons = within(bar).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);

    expect(buttons.slice(1)).toEqual([TEXTS[language].brush, TEXTS[language].wideBrush, TEXTS[language].fieldGuide]);
    expect([brushButton(language), wideButton(language)].map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("picks the wide brush and back, clearing no sand", () => {
    openRound();
    fireEvent.click(wideButton());
    expect(pressed()).toEqual(["false", "true"]);
    fireEvent.click(brushButton());
    expect(pressed()).toEqual(["true", "false"]);
    expect(clearCells()).toEqual([]);
  });

  it("is no brushing for help's wait", () => {
    const app = openRound("explorer");
    for (let second = 0; second < 9; second++) act(() => app.timers.fire(1000));
    fireEvent.click(wideButton());
    act(() => app.timers.fire(1000));
    expect(helped()).toEqual([rex.spots[0]!.kind]);
  });

  it("rests once the gust has come", () => {
    const app = openRound();
    fireEvent.click(wideButton());
    digUp();
    expect(board().getAttribute("data-blown")).toBe("true");
    expect([brushButton().disabled, wideButton().disabled]).toEqual([true, true]);
    finishBoard(app.timers);
  });
});

describe("the picked brush", () => {
  it("stays through DIG AGAIN and a level changed on the reveal", () => {
    const app = openRound();
    fireEvent.click(wideButton());
    reveal(app);
    fireEvent.click(within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels.explorer.name }));
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.digAgain }));
    placeBoard(800);

    expect(board().getAttribute("data-level")).toBe("explorer");
    expect(pressed()).toEqual(["false", "true"]);
  });

  it("stays through the FIELD GUIDE and BACK", () => {
    openRound();
    fireEvent.click(wideButton());
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.fieldGuide }));
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.back }));
    expect(pressed()).toEqual(["false", "true"]);
  });

  it.each(["board", "reveal"] as const)("is the brush again once the child goes home from the %s", (from) => {
    const app = openRound();
    fireEvent.click(wideButton());
    if (from === "reveal") reveal(app);
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.home }));
    fireEvent.click(homeTile(TEXTS.en.dig));
    placeBoard(800);
    expect(pressed()).toEqual(["true", "false"]);
  });
});
