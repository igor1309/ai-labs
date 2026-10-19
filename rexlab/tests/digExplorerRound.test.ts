import { describe, expect, it } from "vitest";
import { awaitsHelp, brushRound, explorerSpots, GRID, HELP_AFTER, roundShare, spotCells, spotFound, startRound, waitForHelp, type Cells, type DigDinosaur, type DigRound, type Spot } from "../src/dig/index.ts";
import { SHIPPED_DIG } from "./support.ts";

const allCells: Cells = Array.from({ length: GRID.rows }, () => Array<boolean>(GRID.columns).fill(true));
const spots: Spot[] = [
  { kind: "eye", x: 110, y: 110, r: 30 },
  { kind: "foot", x: 410, y: 510, r: 30 },
  { kind: "tail", x: 690, y: 310, r: 30 }
];
const dinosaur: DigDinosaur = { id: "rex", traits: [], spots, cells: allCells };
const start = () => startRound([dinosaur], [], undefined, () => 0, "explorer");
const find = (round: DigRound, spot: Spot) => brushRound(round, { from: spot, to: spot, radius: 50 });
const spotAt = (at: number) => spots[at] as Spot;

describe("Explorer's spots", () => {
  it("draws three of every shipped dinosaur's spots, each kind once, without changing the source", () => {
    for (const dinosaur of SHIPPED_DIG) {
      const original = [...dinosaur.spots];
      for (const draw of [0, 0.4, 0.999]) {
        const round = startRound([dinosaur], [], undefined, () => draw, "explorer");
        expect(round.spots).toHaveLength(3);
        expect(new Set(round.spots.map(({ kind }) => kind)).size).toBe(3);
        expect(round.spots.every((spot) => dinosaur.spots.includes(spot))).toBe(true);
      }
      expect(dinosaur.spots).toEqual(original);
      expect(explorerSpots(dinosaur.spots, () => 0)).toEqual(original.slice(0, 3));
      expect(explorerSpots(dinosaur.spots, () => 0.999)).toEqual(original.slice(-3).reverse());
    }
  });

  it("finds every shipped spot strictly past half of its own cells, ignoring clear cells elsewhere", () => {
    for (const dinosaur of SHIPPED_DIG) for (const spot of dinosaur.spots) {
      const own = spotCells(spot, dinosaur.cells);
      expect(own.length).toBeGreaterThan(0);
      const clearWith = (count: number): Cells => allCells.map((row, y) => row.map((_, x) => {
        const at = own.findIndex(([column, line]) => column === x && line === y);
        return at < 0 || at < count;
      }));
      const half = Math.floor(own.length / 2);
      expect(spotFound(spot, dinosaur.cells, clearWith(half))).toBe(false);
      expect(spotFound(spot, dinosaur.cells, clearWith(half + 1))).toBe(true);
    }
    expect(spotFound(spotAt(0), allCells.map((row) => row.map(() => false)), allCells)).toBe(false);
  });

  it.each([[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]])("finds in order %s, %s, %s and gusts only after the third, with most sand still covered", (...order) => {
    let round = start();
    for (const [at, index] of order.entries()) {
      round = find(round, spotAt(index));
      expect(round.found).toEqual(order.slice(0, at + 1).map((index) => spotAt(index).kind));
      expect(round.blown).toBe(at === 2);
    }
    expect(roundShare(round)).toBeLessThan(0.2);
    expect(find(round, spotAt(0))).toBe(round);
  });

  it("keeps the gust waiting past 70% when an unfound spot remains", () => {
    const round = brushRound(start(), { from: { x: 0, y: 0 }, to: { x: 0, y: 600 }, radius: 650 });
    expect(roundShare(round)).toBeGreaterThan(0.7);
    expect(round.found).toEqual(["eye", "foot"]);
    expect(round.blown).toBe(false);
  });
});

describe("Explorer's help", () => {
  it("shows consecutive unhelped spots at ten-second intervals without clearing or finding them", () => {
    let round = start();
    for (let at = 0; at < 3; at++) {
      const before = waitForHelp(round, HELP_AFTER - 1);
      expect(before.helped).toEqual(round.helped);
      round = waitForHelp(before, 1);
      expect(round.helped).toEqual(spots.slice(0, at + 1).map(({ kind }) => kind));
      expect([round.helpShown, round.found, roundShare(round), round.quietMs]).toEqual([true, [], 0, 0]);
    }
    expect(awaitsHelp(round)).toBe(false);
    expect(waitForHelp(round, HELP_AFTER)).toBe(round);
  });

  it("resets on a find, keeps earlier help and skips found or already helped cards", () => {
    let round = waitForHelp(start(), HELP_AFTER);
    round = waitForHelp(round, 9000);
    round = find(round, spotAt(1));
    expect([round.quietMs, round.helped, round.found]).toEqual([0, ["eye"], ["foot"]]);
    round = waitForHelp(round, 9000);
    round = brushRound(round, { from: { x: 300, y: 200 }, to: { x: 330, y: 200 }, radius: 18 });
    expect(round.quietMs).toBe(9000);
    round = waitForHelp(round, 1000);
    expect(round.helped).toEqual(["eye", "tail"]);
    round = spots.reduce(find, round);
    expect([round.blown, round.helpShown, round.helped]).toEqual([true, true, ["eye", "tail"]]);
    expect(waitForHelp(round, HELP_AFTER)).toBe(round);
  });

  // Paleontologist has sequential clue help; only Hatchling brushes freely.
  it("never offers detail help in Hatchling", () => {
    const round = startRound([dinosaur], [], undefined, () => 0, "hatchling");
    expect(awaitsHelp(round)).toBe(false);
    expect(waitForHelp(round, HELP_AFTER)).toBe(round);
    expect(round.spots).toEqual([]);
  });
});
