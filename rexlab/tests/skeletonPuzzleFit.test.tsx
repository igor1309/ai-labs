import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import type { Theme } from "../src/theme.ts";
import { board, finishLoading, openSkeletonsApp, skeletonOf, spotOf, spots, tray } from "./skeletonsApp.tsx";
import { SHIPPED_SKELETONS, contrast, memoryStorage, seenOn, surfaceOf } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

// skeleton-assembly-tray.feature: the board in its frame's shape beside a
// tray of square spots that all fit in it, at any window in landscape;
// skeleton-assembly-turning.feature: the mark of a turned piece.

// Windows in landscape, in CSS pixels: the shared ones, and more iPads and
// Mac windows, wide and short as the puzzle was seen in, to wide screens.
const WINDOWS = windowsAnd([1180, 820], [1366, 1024], [1280, 720], [1508, 594], [1440, 520], [2560, 1080]);

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded.
const gapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

const styleOf = (selector: string) => getComputedStyle(document.querySelector(selector) ?? document.body);

async function openPuzzle(id: string, level: AgeLevel, { appearance = "light", draws = [] }: { appearance?: Theme; draws?: readonly number[] } = {}) {
  const left: number[] = [];
  const opened = openSkeletonsApp({ ageLevels: levelOf(level), appearance, random: () => left.shift() ?? 0 });
  left.push(...draws);
  await opened.user.click(screen.getByRole("button", { name: skeletonOf(id).name.en.toUpperCase() }));
  act(() => finishLoading(opened.pictures));
  return opened;
}

// jsdom lays nothing out, so the puzzle is laid out here as app.css gives
// it: the room the screen leaves under its bar, as tall as its HOME
// button, the tallest part of it.
function puzzleRoom(width: number, height: number) {
  const page = styleOf(".skeleton-screen");
  const home = px(getComputedStyle(screen.getByRole("button", { name: "HOME" })).height);
  expect(px(styleOf(".skeleton-mark").height)).toBeLessThanOrEqual(home);
  return {
    width: width - px(page.paddingLeft) - px(page.paddingRight),
    height: height - px(page.paddingTop) - px(page.paddingBottom) - home - gapOf(page)
  };
}

const BOARD_WIDTH = /^min\(\(100cqw - ([\d.]+)px\) \* (\d+) \/ (\d+), 100cqh \* var\(--frame-width\) \/ var\(--frame-height\)\)$/;

// The board in the puzzle's room: its share of the room's width beside the
// tray, or the width the room's height allows at the frame's shape.
function boardIn(room: { width: number; height: number }) {
  const puzzle = styleOf(".skeleton-puzzle");
  expect([puzzle.display, puzzle.flexGrow, puzzle.minHeight, puzzle.getPropertyValue("container-type")]).toEqual(["flex", "1", "0px", "size"]);
  const style = getComputedStyle(board());
  const width = BOARD_WIDTH.exec(style.width);
  expect([style.flexGrow, style.flexShrink, style.aspectRatio, width?.[1]]).toEqual(["0", "0", "var(--frame-width) / var(--frame-height)", String(gapOf(puzzle))]);
  const frame = { width: Number(board().style.getPropertyValue("--frame-width")), height: Number(board().style.getPropertyValue("--frame-height")) };
  const share = ((room.width - gapOf(puzzle)) * Number(width?.[2])) / Number(width?.[3]);
  const shown = Math.min(share, (room.height * frame.width) / frame.height);
  return { frame, share, width: shown, height: (shown * frame.height) / frame.width, gap: gapOf(puzzle) };
}

const SIDE_TERM = /min\(\(100cqw - (\d+) \* var\(--spot-gap\)\) \/ (\d+), \(100cqh - (\d+) \* var\(--spot-gap\)\) \/ (\d+)\)/g;

// The tray's spots, laid out in the room the board leaves: the side the
// tray gives them, the largest of its layouts of so many columns in so
// many rows in whole pixels, and the rows they wrap into at that side.
function spotsIn(room: { width: number; height: number }, beside: number) {
  const style = getComputedStyle(tray());
  expect([style.display, style.flexGrow, style.flexBasis, style.flexWrap, style.gap, style.getPropertyValue("container-type")]).toEqual(["flex", "1", "0px", "wrap", "var(--spot-gap)", "size"]);
  const gap = px(style.getPropertyValue("--spot-gap"));
  const inside = {
    width: room.width - beside - px(style.paddingLeft) - px(style.paddingRight),
    height: room.height - px(style.paddingTop) - px(style.paddingBottom)
  };
  const count = spots().length;
  const written = tray().style.getPropertyValue("--spot-side");
  const layouts = [...written.matchAll(SIDE_TERM)].map(([, columnGaps, columns, rowGaps, rows]) => ({ columnGaps: Number(columnGaps), columns: Number(columns), rowGaps: Number(rowGaps), rows: Number(rows) }));
  expect(written).toBe(`round(down, max(${written.match(SIDE_TERM)?.join(", ")}), 1px)`);
  // Each layout is its columns, the rows they need and the gaps between
  // them; every number of columns has one as good, no wider and no
  // taller, so the largest of their sides is the largest of any.
  expect(layouts).toEqual(layouts.map(({ columns }) => ({ columnGaps: columns - 1, columns, rowGaps: Math.ceil(count / columns) - 1, rows: Math.ceil(count / columns) })));
  const columnCounts = Array.from({ length: count }, (_, at) => at + 1);
  expect(columnCounts.filter((columns) => !layouts.some((layout) => layout.columns <= columns && layout.rows <= Math.ceil(count / columns)))).toEqual([]);
  const side = Math.floor(Math.max(...layouts.map(({ columns, rows }) => Math.min((inside.width - (columns - 1) * gap) / columns, (inside.height - (rows - 1) * gap) / rows))));
  const perRow = Math.min(count, Math.floor((inside.width + gap) / (side + gap)));
  const rows = Math.ceil(count / perRow);
  return { count, side, inside, used: { width: perRow * side + (perRow - 1) * gap, height: rows * side + (rows - 1) * gap } };
}

describe.each(SHIPPED_SKELETONS.flatMap(({ id }) => AGE_LEVELS.map((level) => [id, level] as const)))("the %s puzzle at %s", (id, level) => {
  it.each(WINDOWS)("keeps its board in its frame's shape, as large as fits beside the tray, in a %i by %i window", async (width, height) => {
    openWindow(width, height);
    await openPuzzle(id, level);

    const room = puzzleRoom(width, height);
    const shown = boardIn(room);
    expect(shown.frame).toEqual(skeletonOf(id).frame);
    expect([shown.width <= shown.share + 0.01, shown.height <= room.height + 0.01]).toEqual([true, true]);
    // The largest: as wide as its share or as tall as the room.
    expect(Math.min(shown.share - shown.width, room.height - shown.height)).toBeCloseTo(0);
  });

  it.each(WINDOWS)("fits every spot of its tray in it, square and at least 48 pixels a side, its piece large in it, in a %i by %i window", async (width, height) => {
    openWindow(width, height);
    await openPuzzle(id, level);

    const room = puzzleRoom(width, height);
    const shown = boardIn(room);
    const laid = spotsIn(room, shown.width + shown.gap);
    for (const spot of spots()) {
      const style = getComputedStyle(spot);
      const piece = getComputedStyle(spot.querySelector(".skeleton-piece") ?? spot);
      expect([style.width, style.height, style.minWidth, style.minHeight, style.flexGrow, style.flexShrink, px(style.paddingTop), px(style.paddingLeft)]).toEqual([
        "var(--spot-side)",
        "var(--spot-side)",
        "48px",
        "48px",
        "0",
        "0",
        0,
        0
      ]);
      expect([piece.width, piece.height, piece.margin]).toEqual(["75%", "75%", "auto"]);
    }
    expect(laid.side).toBeGreaterThanOrEqual(48);
    expect([laid.used.width <= laid.inside.width + 0.01, laid.used.height <= laid.inside.height + 0.01]).toEqual([true, true]);
  });
});

it("has a tray of as many spots as the most any puzzle gives, Paleontologist's pieces with other dinosaurs' bones", async () => {
  await openPuzzle("tyrannosaurus", "paleontologist");

  const most = Math.max(...SHIPPED_SKELETONS.map((skeleton) => (skeleton.cuts.paleontologist?.length ?? 0) + (skeleton.distractors?.length ?? 0)));
  expect([spots().length, most]).toEqual([14, 14]);
});

// Tyrannosaurus's Paleontologist cut, drawn with its skull turned a
// quarter: the skull is first in the cut.
const SKULL_TURNED = [0.7];

describe.each<Theme>(["light", "dark"])("a turned piece's mark in the %s theme", (appearance) => {
  it("is dimmer than any words a child reads, and as clear as a symbol needs", async () => {
    await openPuzzle("tyrannosaurus", "paleontologist", { appearance, draws: SKULL_TURNED });

    const mark = spotOf("head").querySelector(".skeleton-turn-mark");
    if (!mark) throw new Error("The turned skull has no mark");
    const surface = surfaceOf(mark);
    const seen = contrast(seenOn(getComputedStyle(mark).color, surface), surface);
    expect([seen >= 3, seen < 4.5]).toEqual([true, true]);
  });
});
