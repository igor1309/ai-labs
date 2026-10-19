import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { AWAY, finishLoading, fit, fittedPieces, homeOf, layOutPuzzle, lifted, moveTo, openSkeletonsApp, press, release, skeletonOf, spotOf, spotPieces, tap, tray } from "./skeletonsApp.tsx";
import { memoryStorage } from "./support.ts";

// skeleton-assembly-turning.feature: Paleontologist's pieces arriving
// turned, and a tap turning one a quarter.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

// Opens `name`'s puzzle at `level`, its pieces drawn from `draws` in the
// cut's order, every draw after them 0, which turns nothing.
async function openDrawn(name: string, draws: readonly number[], level: AgeLevel = "paleontologist") {
  const left: number[] = [];
  const opened = openSkeletonsApp({ ageLevels: levelOf(level), random: () => left.shift() ?? 0 });
  left.push(...draws);
  await opened.user.click(screen.getByRole("button", { name }));
  act(() => finishLoading(opened.pictures));
  layOutPuzzle();
  return opened;
}

// Tyrannosaurus's Paleontologist cut, drawn with its skull turned a
// quarter and its tail tip half: the skull is first in the cut, the tail
// tip last of eleven.
const SKULL_AND_TAIL_TIP = [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8];

const pieceIn = (piece: string) => spotOf(piece).querySelector<HTMLElement>(".skeleton-piece");

// How a piece lies in its spot: its turn as drawn, and whether it carries
// the mark that it turns.
const lying = (piece: string) => [pieceIn(piece)?.style.rotate ?? "", spotOf(piece).querySelector(".skeleton-turn-mark") !== null];

describe("Paleontologist's turned pieces", () => {
  it("arrive turned as drawn, each with a mark that it turns, every other piece the right way up", async () => {
    await openDrawn("TYRANNOSAURUS", SKULL_AND_TAIL_TIP);

    expect([lying("head"), lying("tail-tip")]).toEqual([
      ["90deg", true],
      ["180deg", true]
    ]);
    expect(spotPieces().filter((piece) => !["head", "tail-tip"].includes(piece)).filter((piece) => lying(piece).join() !== ",false")).toEqual([]);
    expect(tray().hasAttribute("data-turning")).toBe(true);
  });

  it("turn a quarter at a tap, in their spots, the mark gone once the right way up", async () => {
    await openDrawn("TYRANNOSAURUS", SKULL_AND_TAIL_TIP);

    tap("head");
    expect([lying("head"), pieceIn("head")?.hasAttribute("data-returning"), lifted()]).toEqual([["180deg", true], false, null]);

    tap("head");
    tap("head");
    expect([lying("head"), pieceIn("head")?.hasAttribute("data-turns")]).toEqual([["360deg", false], false]);
  });

  it("keep turning on clockwise past the right way up", async () => {
    await openDrawn("TYRANNOSAURUS", []);

    tap("arms");
    expect(lying("arms")).toEqual(["90deg", true]);
    for (const _ of [1, 2, 3, 4]) tap("arms");
    expect(lying("arms")).toEqual(["450deg", true]);
  });

  it("are picked up by a drag turned as they lie, and do not turn", async () => {
    await openDrawn("TYRANNOSAURUS", SKULL_AND_TAIL_TIP);
    const spot = spotOf("head");
    const { left, top } = spot.getBoundingClientRect();

    press(spot, { clientX: left + 40, clientY: top + 40 });
    moveTo(homeOf(skeletonOf("tyrannosaurus"), "hips"));
    expect(lifted()?.style.rotate).toBe("90deg");
    release(AWAY);

    expect(lying("head")).toEqual(["90deg", true]);
  });

  it("fit only the right way up: dropped turned on their home they float back, still turned", async () => {
    await openDrawn("TYRANNOSAURUS", SKULL_AND_TAIL_TIP);
    const tyrannosaurus = skeletonOf("tyrannosaurus");

    fit(tyrannosaurus, "head");
    expect([fittedPieces(), pieceIn("head")?.hasAttribute("data-returning"), lying("head")]).toEqual([[], true, ["90deg", true]]);

    for (const _ of [1, 2, 3]) tap("head");
    fit(tyrannosaurus, "head");
    expect(fittedPieces()).toEqual(["head"]);
  });
});

describe("the other levels", () => {
  it.each<AgeLevel>(["hatchling", "explorer"])("never turn a piece at %s, whatever the draw, and a tap drops it where it lies", async (level) => {
    await openDrawn("TRICERATOPS", Array.from({ length: 12 }, () => 0.99), level);
    const [first = ""] = spotPieces();

    expect([spotPieces().filter((piece) => lying(piece).join() !== ",false"), tray().hasAttribute("data-turning")]).toEqual([[], false]);
    tap(first);
    expect([lying(first), pieceIn(first)?.hasAttribute("data-returning")]).toEqual([["", false], true]);
  });
});
