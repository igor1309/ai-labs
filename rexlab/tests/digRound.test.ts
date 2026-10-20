import { describe, expect, it } from "vitest";
import {
  asking,
  awaitsHelp,
  brushRound,
  CHOICES,
  GRID,
  GUST_SHARE,
  HELP_AFTER,
  likeness,
  lookAlikes,
  pickRound,
  QUESTION_SHARE,
  roundShare,
  spotCells,
  spotFound,
  startRound,
  strongRound,
  waitForHelp,
  type Cells,
  type DigDinosaur,
  type DigRound,
  type Spot
} from "../src/dig/index.ts";
import type { SpotKind } from "../src/dig/spots.ts";
import { SHIPPED_DIG } from "./support.ts";

const allCells: Cells = Array.from({ length: GRID.rows }, () => Array<boolean>(GRID.columns).fill(true));
const spots: Spot[] = [
  { kind: "eye", x: 110, y: 110, r: 30 },
  { kind: "foot", x: 410, y: 510, r: 30 },
  { kind: "tail", x: 690, y: 310, r: 30 }
];
const dinosaur: DigDinosaur = { id: "rex", traits: [], spots, cells: allCells };
const spotted = (id: string, kinds: SpotKind[], traits: SpotKind[] = []): DigDinosaur => ({
  id, traits, cells: allCells, spots: kinds.map((kind, at) => ({ kind, x: 100 + 200 * at, y: 300, r: 30 }))
});
const others = [spotted("raptor", ["eye", "foot", "claw"]), spotted("allo", ["eye", "foot", "tail"]), spotted("stego", ["plate", "tail"], ["plate"])];
const start = (level: DigRound["level"] = "explorer") => startRound([dinosaur, ...others], [], undefined, () => 0, level);
const find = (round: DigRound, spot: Spot) => brushRound(round, { from: spot, to: spot, radius: 50 });
const spotAt = (at: number) => spots[at] as Spot;

// Brushes rows of the frame, top down, and returns the round after each.
function rows(round: DigRound): DigRound[] {
  const after: DigRound[] = [];
  for (let y = 10; y < 600; y += 20) after.push((round = brushRound(round, { from: { x: 0, y }, to: { x: 800, y }, radius: 10 })));
  return after;
}

describe("the question's look-alikes", () => {
  it("offers every shipped dinosaur among its closest look-alikes at each level, each once", () => {
    for (const dinosaur of SHIPPED_DIG) for (const count of [CHOICES.explorer, CHOICES.paleontologist]) for (const draw of [0, 0.4, 0.999]) {
      const choices = lookAlikes(dinosaur, SHIPPED_DIG, count, () => draw);
      expect(new Set(choices).size).toBe(count);
      expect(choices).toContain(dinosaur.id);
      const alike = (id: string) => likeness(dinosaur, SHIPPED_DIG.find((each) => each.id === id)!);
      const least = Math.min(...choices.filter((id) => id !== dinosaur.id).map(alike));
      for (const other of SHIPPED_DIG) if (other.id !== dinosaur.id && !choices.includes(other.id)) expect(alike(other.id)).toBeLessThanOrEqual(least);
    }
  });

  it("counts the kinds both show of the kinds either shows, traits included", () => {
    const spino = spotted("spino", ["eye", "claw", "sail"], ["sail"]);
    expect(likeness(spino, spotted("same", ["sail", "eye", "claw"], ["sail"]))).toBe(1);
    expect(likeness(spino, spotted("half", ["eye", "claw", "foot"]))).toBe(0.5);
    expect(likeness(spino, spotted("none", ["horn", "frill"], ["horn", "frill"]))).toBe(0);
  });

  it("draws among equal look-alikes at random and offers them in a random order", () => {
    const spino = spotted("spino", ["eye", "claw", "sail"], ["sail"]);
    const pool = [spino, spotted("twin", ["eye", "claw", "sail"], ["sail"]), spotted("b", ["eye", "claw", "foot"]), spotted("c", ["eye", "claw", "tail"]), spotted("d", ["horn", "frill"], ["horn", "frill"])];
    expect(lookAlikes(spino, pool, 3, () => 0)).toEqual(["spino", "twin", "b"]);
    expect(lookAlikes(spino, pool, 3, () => 0.999)).toEqual(["c", "twin", "spino"]);
    expect(() => lookAlikes(spino, pool.slice(0, 2), 3, () => 0)).toThrow("Not enough look-alikes for spino");
  });

  it("gives Explorer three choices, Paleontologist four and Hatchling none", () => {
    expect(start("explorer").choices).toEqual(["rex", "allo", "raptor"]);
    expect(start("paleontologist").choices).toEqual(["rex", "allo", "raptor", "stego"]);
    expect(start("hatchling").choices).toEqual([]);
  });
});

describe("the question", () => {
  it.each(["explorer", "paleontologist"] as const)("asks at %s once three quarters of the dinosaur are clear, and brushing goes on", (level) => {
    const after = rows(start(level));
    const at = after.findIndex(asking);
    expect(roundShare(after[at]!)).toBeGreaterThanOrEqual(QUESTION_SHARE);
    expect(roundShare(after[at - 1]!)).toBeLessThan(QUESTION_SHARE);
    expect(after.slice(at).every(asking)).toBe(true);
    expect(roundShare(after.at(-1)!)).toBe(1);
    expect(after.some(({ blown }) => blown)).toBe(false);
  });

  it("ignores a pick before the question or of a dinosaur it does not offer", () => {
    const round = start();
    expect(pickRound(round, "rex")).toBe(round);
    const shown = rows(round).find(asking)!;
    expect(pickRound(shown, "stego")).toBe(shown);
  });

  it("keeps a wrong pick out and gusts at the right one, a strong round only at the first pick", () => {
    const shown = rows(start()).find(asking)!;
    expect(pickRound(shown, "rex")).toEqual({ ...shown, blown: true });
    expect(strongRound(pickRound(shown, "rex"))).toBe(true);
    const wrong = pickRound(shown, "raptor");
    expect([wrong.blown, wrong.rejected, asking(wrong)]).toEqual([false, ["raptor"], true]);
    expect(pickRound(wrong, "raptor")).toBe(wrong);
    const right = pickRound(wrong, "rex");
    expect([right.blown, right.rejected, asking(right), strongRound(right)]).toEqual([true, ["raptor"], false, false]);
    expect(pickRound(right, "allo")).toBe(right);
    expect(brushRound(right, { from: { x: 0, y: 0 }, to: { x: 800, y: 600 }, radius: 1000 })).toBe(right);
  });

  it("never asks at Hatchling, whose gust waits for 95% of the dinosaur", () => {
    const after = rows(start("hatchling"));
    expect(after.some(asking)).toBe(false);
    const at = after.findIndex(({ blown }) => blown);
    expect(roundShare(after[at]!)).toBeGreaterThanOrEqual(GUST_SHARE);
    expect(roundShare(after[at - 1]!)).toBeLessThan(GUST_SHARE);
    expect(strongRound(after[at]!)).toBe(true);
  });
});

describe("the spots", () => {
  it("keeps every shipped dinosaur's spots, in a random order, without changing the source", () => {
    for (const dinosaur of SHIPPED_DIG) {
      const original = [...dinosaur.spots];
      expect(startRound([dinosaur], [], undefined, () => 0, "hatchling").spots).toEqual(original);
      expect(startRound([dinosaur], [], undefined, () => 0.999, "hatchling").spots).toEqual([...original].reverse());
      expect(dinosaur.spots).toEqual(original);
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

  it("records finds in the order they are brushed, at every level", () => {
    for (const level of ["hatchling", "explorer", "paleontologist"] as const) {
      const round = [2, 0].map(spotAt).reduce(find, start(level));
      expect(round.found).toEqual(["tail", "eye"]);
    }
  });
});

describe("help", () => {
  it.each(["hatchling", "explorer", "paleontologist"] as const)("thins the next spot at %s after ten quiet seconds, without clearing or finding it", (level) => {
    let round = start(level);
    for (let at = 0; at < 3; at++) {
      const before = waitForHelp(round, HELP_AFTER - 1);
      expect(before.helped).toEqual(round.helped);
      round = waitForHelp(before, 1);
      expect(round.helped).toEqual(spots.slice(0, at + 1).map(({ kind }) => kind));
      expect([round.found, roundShare(round), round.quietMs]).toEqual([[], 0, 0]);
    }
    expect(awaitsHelp(round)).toBe(false);
    expect(waitForHelp(round, HELP_AFTER)).toBe(round);
  });

  it("waits again after brushing that clears more of the dinosaur, and skips found spots", () => {
    let round = waitForHelp(start(), 9000);
    round = find(round, spotAt(0));
    expect([round.quietMs, round.found]).toEqual([0, ["eye"]]);
    round = brushRound(waitForHelp(round, 9000), { from: { x: 300, y: 200 }, to: { x: 330, y: 200 }, radius: 18 });
    expect(round.quietMs).toBe(0);
    round = brushRound(waitForHelp(round, 9000), { from: { x: 300, y: 200 }, to: { x: 330, y: 200 }, radius: 18 });
    expect(round.quietMs).toBe(9000);
    round = waitForHelp(round, 1000);
    expect([round.helped, round.found]).toEqual([["foot"], ["eye"]]);
  });

  it("stops at the gust", () => {
    const shown = rows(start()).find(asking)!;
    expect([shown.found, awaitsHelp(shown)]).toEqual([["eye", "tail"], true]);
    const blown = pickRound(shown, "rex");
    expect(awaitsHelp(blown)).toBe(false);
    expect(waitForHelp(blown, HELP_AFTER)).toBe(blown);
  });
});
