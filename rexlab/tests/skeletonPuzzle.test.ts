import { describe, expect, it } from "vitest";
import { awaitsHelp, drop, help, HELP_AFTER, isComplete, startPuzzle, wait, type Cut, type Place, type Puzzle, type Skeleton } from "../src/skeletons/index.ts";
import { PIECES, type Piece } from "./skeletonsApp.tsx";
import { SHIPPED_SKELETONS } from "./support.ts";

const place = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

// A cut of these pieces, each at its place, named by its id.
const cutOf = (places: Readonly<Record<string, Place>>): Cut => Object.entries(places).map(([id, at]) => ({ id, name: { en: id.toUpperCase(), ru: id.toUpperCase() }, area: "back", place: at }));

// Homes whose centres are (50, 40), (230, 110), (240, 275) and (390, 150).
const SKELETON: Skeleton = {
  id: "triceratops",
  name: { en: "Triceratops", ru: "Трицератопс" },
  fact: { en: "TRICERATOPS HAD THREE HORNS.", ru: "У ТРИЦЕРАТОПСА БЫЛО ТРИ РОГА." },
  frame: { width: 400, height: 400 },
  cuts: { hatchling: cutOf({ skull: place(0, 0, 100, 80), spine: place(80, 10, 300, 200), legs: place(90, 150, 300, 250), tail: place(380, 120, 20, 60) }) }
};

// A new puzzle of SKELETON's Hatchling cut.
const start = () => startPuzzle(SKELETON, SKELETON.cuts.hatchling);

const CENTRES: Record<Piece, { x: number; y: number }> = { skull: { x: 50, y: 40 }, spine: { x: 230, y: 110 }, legs: { x: 240, y: 275 }, tail: { x: 390, y: 150 } };

// The puzzle with every piece in `pieces` fitted, in that order.
const fitted = (pieces: readonly Piece[], from: Puzzle = start()) => pieces.reduce((puzzle, piece) => drop(puzzle, piece, CENTRES[piece], 1), from);

describe("dropping a piece", () => {
  it.each(PIECES)("fits the %s in its home from anywhere within the reach of its centre, the reach's edge too", (piece) => {
    const { x, y } = CENTRES[piece];
    const near = [
      { x, y },
      { x: x + 30, y },
      { x, y: y - 30 },
      { x: x - 18, y: y + 24 }
    ];

    expect(near.map((centre) => drop(start(), piece, centre, 30).fitted)).toEqual(near.map(() => [piece]));
  });

  it.each(PIECES)("leaves the %s in the tray when dropped beyond the reach of its home's centre", (piece) => {
    const { x, y } = CENTRES[piece];
    const puzzle = start();
    const far = [
      { x: x + 30.5, y },
      { x: x - 19, y: y - 24 }
    ];

    expect(far.map((centre) => drop(puzzle, piece, centre, 30))).toEqual(far.map(() => puzzle));
  });

  it.each(SHIPPED_SKELETONS.map((skeleton) => [skeleton.name.en, skeleton] as const))("fits no %s piece in another's home, dropped right on it", (_, skeleton) => {
    const puzzle = startPuzzle(skeleton, skeleton.cuts.hatchling);
    const homeOf = (piece: Piece) => {
      const { x, y, width, height } = skeleton.cuts.hatchling.find(({ id }) => id === piece)?.place ?? place(0, 0, 0, 0);
      return { x: x + width / 2, y: y + height / 2 };
    };
    // The board's reach on the narrowest iPad, 1024 pixels wide, where the
    // board draws the frame about 626 pixels wide.
    const reach = 62;
    const misses = PIECES.flatMap((piece) => PIECES.filter((other) => other !== piece).map((other) => drop(puzzle, piece, homeOf(other), reach)));

    expect(misses.filter((after) => after !== puzzle)).toEqual([]);
  });

  it("fits the pieces in any order, keeping the order they were fitted in, and the skeleton is complete only with all four", () => {
    const steps = (["tail", "skull", "legs", "spine"] as const).reduce<Puzzle[]>((seen, piece) => [...seen, drop(seen.at(-1) ?? start(), piece, CENTRES[piece], 1)], []);

    expect(steps.map(({ fitted }) => fitted)).toEqual([["tail"], ["tail", "skull"], ["tail", "skull", "legs"], ["tail", "skull", "legs", "spine"]]);
    expect(steps.map(isComplete)).toEqual([false, false, false, true]);
  });

  it("keeps a fitted piece fitted once, dropped again anywhere", () => {
    const puzzle = fitted(["skull"]);

    expect([drop(puzzle, "skull", CENTRES.skull, 30), drop(puzzle, "skull", { x: 390, y: 390 }, 30)]).toEqual([puzzle, puzzle]);
  });
});

describe("help", () => {
  it("is due once the child has been at the puzzle for its whole wait, and not a moment before", () => {
    const almost = wait(start(), HELP_AFTER - 1);

    expect([help(almost), help(wait(almost, 1))]).toEqual([undefined, "skull"]);
  });

  it("counts every moment at the puzzle, however it is split", () => {
    const split = [1000, 2500, 500, 6000].reduce(wait, start());

    expect([split.waited, help(split)]).toEqual([HELP_AFTER, "skull"]);
  });

  it("points at the first piece in the tray still to fit, and never fits it", () => {
    const puzzle = wait(fitted(["skull", "legs"]), HELP_AFTER);

    expect([help(puzzle), puzzle.fitted]).toEqual(["spine", ["skull", "legs"]]);
  });

  it("is put off by no drop that misses", () => {
    const misses = [CENTRES.legs, CENTRES.tail, { x: 0, y: 399 }];
    const waited = wait(start(), HELP_AFTER - 2000);
    const tried = misses.reduce((puzzle, centre) => drop(puzzle, "skull", centre, 30), waited);

    expect(help(wait(tried, 2000))).toBe("skull");
  });

  it("starts its wait again as any piece fits, and then points only at a piece still to fit", () => {
    const due = wait(start(), HELP_AFTER);
    const after = drop(due, "skull", CENTRES.skull, 1);

    expect([help(after), help(wait(after, HELP_AFTER - 1)), help(wait(after, HELP_AFTER))]).toEqual([undefined, undefined, "spine"]);
  });

  it("stops counting once it is due, and for a complete skeleton, which it points at nothing of", () => {
    const due = wait(start(), HELP_AFTER + 5000);
    const complete = fitted(PIECES);

    expect([due.waited, awaitsHelp(due), wait(due, 1000)]).toEqual([HELP_AFTER, false, due]);
    expect([awaitsHelp(complete), wait(complete, 1000), help({ ...complete, waited: HELP_AFTER })]).toEqual([false, complete, undefined]);
  });

  it("awaits the child's time on a puzzle in progress before it is due", () => {
    expect([awaitsHelp(start()), awaitsHelp(wait(fitted(["tail"]), HELP_AFTER - 1))]).toEqual([true, true]);
  });
});

describe("a cut of other than four pieces", () => {
  // Three pieces whose centres are (50, 50), (150, 50) and (250, 50), and
  // five whose centres are 60 pixels apart along the frame.
  const THREE = cutOf({ head: place(0, 0, 100, 100), body: place(100, 0, 100, 100), tail: place(200, 0, 100, 100) });
  const FIVE = cutOf(Object.fromEntries(["a", "b", "c", "d", "e"].map((id, at) => [id, place(at * 60, 0, 60, 60)])));
  const centreOf = ({ place: { x, y, width, height } }: Cut[number]) => ({ x: x + width / 2, y: y + height / 2 });

  it.each([
    ["three", THREE],
    ["five", FIVE]
  ] as const)("is complete only once each of its %s pieces fits, help pointing at the first still to fit", (_, cut) => {
    const steps = cut.reduce<Puzzle[]>((seen, piece) => [...seen, drop(seen.at(-1) ?? startPuzzle(SKELETON, cut), piece.id, centreOf(piece), 1)], []);

    expect(steps.map(isComplete)).toEqual(cut.map((_, at) => at === cut.length - 1));
    expect(steps.map((step) => help(wait(step, HELP_AFTER)))).toEqual([...cut.slice(1).map(({ id }) => id), undefined]);
  });

  it("fits no piece the cut does not have, dropped anywhere", () => {
    const puzzle = startPuzzle(SKELETON, THREE);

    expect([drop(puzzle, "skull", { x: 50, y: 40 }, 30), drop(puzzle, "legs", { x: 150, y: 50 }, 30)]).toEqual([puzzle, puzzle]);
  });
});
