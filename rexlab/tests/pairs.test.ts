import { describe, expect, it } from "vitest";
import {
  dealBoard,
  finishBoard,
  foundOf,
  isFinished,
  isMiss,
  LARGE_LEVELS,
  NO_PAIRS,
  shapeOf,
  turn,
  turnBack,
  type Board,
  type BoardLevel,
  type KeptPairs,
  type Pal
} from "../src/pairs/index.ts";
import { seededRandom, SHIPPED_PALS } from "./support.ts";

const pal = (id: string, lookAlike = id): Pal => ({ id, name: { en: id, ru: id }, lookAlike });

const REX = pal("tyrannosaurus", "big-hunter");
const TRIKE = pal("triceratops", "horned-face");
const STEGO = pal("stegosaurus", "plated-back");

// A level 1 board of Rex, Trike and Stego, laid out in that order, each
// pair side by side.
const board = (pals: readonly Pal[] = [REX, TRIKE, STEGO], level: BoardLevel = { climbLevel: 1 }): Board => ({
  level,
  pals,
  cards: pals.flatMap((one) => [
    { pal: one, face: "picture" as const },
    { pal: one, face: shapeOf(level).silhouettes ? ("silhouette" as const) : ("picture" as const) }
  ]),
  open: [],
  found: [],
  tries: 0
});

// Turns the cards at `places` in turn, turning back each miss.
const turnAll = (from: Board, places: readonly number[]) => places.reduce((at, place) => turn(turnBack(at), place), from);

// A board with every pair found at the first try but `misses` misses first.
const finished = (from: Board = board(), misses = 0): Board => {
  const missed = Array.from({ length: misses }, () => [0, 2]).flat();
  return turnBack(turnAll(from, [...missed, ...from.cards.map((_, place) => place)]));
};

const ORDER = SHIPPED_PALS.map(({ id }) => id);

const readable = (progress = NO_PAIRS): KeptPairs => ({ progress, readable: true });

// Every level a board is dealt at, the climb's and the larger ones.
const LEVELS: readonly [string, BoardLevel][] = [
  ...([1, 2, 3, 4] as const).map((climbLevel): [string, BoardLevel] => [`climb level ${climbLevel}`, { climbLevel }]),
  ["Explorer", { large: "explorer" }],
  ["Paleontologist", { large: "paleontologist" }]
];

// Every k of `items`, in order.
function choices<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, at) => choices(items.slice(at + 1), k - 1).map((rest) => [item, ...rest]));
}

// The fewest of `before`'s dinosaurs any board of `level` dealt from `pals`
// can have, found by trying every way to deal it: on a board of pictures
// any dinosaurs, on a silhouette board one of each of some look-alike
// groups, each group's taken from the others if it has any.
function fewestRepeated(pals: readonly Pal[], level: BoardLevel, before: Board): number {
  const { pairs, silhouettes } = shapeOf(level);
  const repeated = (pal: Pal) => before.pals.some(({ id }) => id === pal.id);
  if (!silhouettes) return Math.max(0, pairs - pals.filter((pal) => !repeated(pal)).length);
  const groups = [...new Set(pals.map(({ lookAlike }) => lookAlike))];
  const onlyRepeated = (group: string) => pals.filter(({ lookAlike }) => lookAlike === group).every(repeated);
  return Math.min(...choices(groups, pairs).map((chosen) => chosen.filter(onlyRepeated).length));
}

const idsOf = (dealt: Board) => dealt.pals.map(({ id }) => id);

const repeatedOn = (dealt: Board, before: Board) => idsOf(dealt).filter((id) => idsOf(before).includes(id));

describe("dealing a board", () => {
  it.each(LEVELS)("deals %s's pairs of different dinosaurs from the shared list", (_, level) => {
    const dealt = dealBoard(SHIPPED_PALS, level, seededRandom(7));
    const ids = dealt.cards.map(({ pal: { id } }) => id);
    const { pairs, rows, columns } = shapeOf(level);

    expect(dealt.cards).toHaveLength(pairs * 2);
    expect(dealt.cards).toHaveLength(rows * columns);
    expect(new Set(ids).size).toBe(pairs);
    for (const id of ids) {
      expect(ids.filter((other) => other === id)).toHaveLength(2);
      expect(ORDER).toContain(id);
    }
    expect({ level: dealt.level, open: dealt.open, found: dealt.found, tries: dealt.tries }).toEqual({ level, open: [], found: [], tries: 0 });
  });

  it("deals Explorer 9 pairs in 3 rows of 6, and Paleontologist 12 in 4 rows of 6, each a picture to its silhouette", () => {
    expect(LARGE_LEVELS).toEqual({
      explorer: { pairs: 9, rows: 3, columns: 6, silhouettes: true },
      paleontologist: { pairs: 12, rows: 4, columns: 6, silhouettes: true }
    });
  });

  it.each([
    ["climb level 1", { climbLevel: 1 }, ["picture", "picture"]],
    ["climb level 2", { climbLevel: 2 }, ["picture", "picture"]],
    ["climb level 3", { climbLevel: 3 }, ["picture", "silhouette"]],
    ["climb level 4", { climbLevel: 4 }, ["picture", "silhouette"]],
    ["Explorer", { large: "explorer" }, ["picture", "silhouette"]],
    ["Paleontologist", { large: "paleontologist" }, ["picture", "silhouette"]]
  ] as const)("matches each %s picture to %j", (_, level, faces) => {
    const dealt = dealBoard(SHIPPED_PALS, level, seededRandom(7));

    for (const { id } of dealt.pals) {
      const pair = dealt.cards.filter(({ pal }) => pal.id === id).map(({ face }) => face);
      expect(pair.sort()).toEqual([...faces].sort());
    }
  });

  it("shuffles the cards: another random deals another order", () => {
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => dealBoard(SHIPPED_PALS, { climbLevel: 2 }, seededRandom(seed)).cards.map(({ pal }) => pal.id).join()));

    expect(orders.size).toBeGreaterThan(1);
  });

  it("puts every card anywhere on the board, as likely as any other place", () => {
    const random = seededRandom(11);
    const first = new Map<string, number>();
    for (let deal = 0; deal < 600; deal++) {
      const [card] = dealBoard([REX, TRIKE, STEGO], { climbLevel: 1 }, random).cards;
      first.set(card!.pal.id, (first.get(card!.pal.id) ?? 0) + 1);
    }

    for (const id of ["tyrannosaurus", "triceratops", "stegosaurus"]) {
      expect(first.get(id)).toBeGreaterThan(150);
    }
  });

  it.each(LEVELS.filter(([, level]) => shapeOf(level).silhouettes))("deals no two look-alikes on a %s board of silhouettes", (_, level) => {
    const random = seededRandom(5);
    for (let deal = 0; deal < 50; deal++) {
      const groups = dealBoard(SHIPPED_PALS, level, random).pals.map(({ lookAlike }) => lookAlike);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("deals look-alikes on a board of pictures, which tell them apart", () => {
    const raptors = ["velociraptor", "deinonychus", "utahraptor"].map((id) => pal(id, "raptor"));

    expect(dealBoard(raptors, { climbLevel: 1 }, seededRandom(1)).pals).toHaveLength(3);
    expect(() => dealBoard([...raptors, pal("troodon", "raptor")], { climbLevel: 3 }, seededRandom(1))).toThrow("Too few dinosaurs for a level 3 board");
    expect(() => dealBoard(SHIPPED_PALS.slice(0, 11), { large: "paleontologist" }, seededRandom(1))).toThrow("Too few dinosaurs for the paleontologist board");
  });

  it.each(LEVELS.flatMap(([before, beforeLevel]) => LEVELS.map(([next, nextLevel]) => [before, next, beforeLevel, nextLevel] as const)))(
    "deals as few of a %s board's dinosaurs on a %s board after it as the look-alike rule allows, over the shared list",
    (_, __, beforeLevel, nextLevel) => {
      const random = seededRandom(13);
      for (let deal = 0; deal < 20; deal++) {
        const before = dealBoard(SHIPPED_PALS, beforeLevel, random);
        const next = dealBoard(SHIPPED_PALS, nextLevel, random, before);
        const groups = next.pals.map(({ lookAlike }) => lookAlike);

        expect(new Set(idsOf(next)).size).toBe(shapeOf(nextLevel).pairs);
        if (shapeOf(nextLevel).silhouettes) expect(new Set(groups).size).toBe(groups.length);
        expect(repeatedOn(next, before)).toHaveLength(fewestRepeated(SHIPPED_PALS, nextLevel, before));
      }
    }
  );

  it("deals a Paleontologist board after a Paleontologist board, repeating only dinosaurs of groups the others are not in", () => {
    const random = seededRandom(17);
    for (let deal = 0; deal < 50; deal++) {
      const before = dealBoard(SHIPPED_PALS, { large: "paleontologist" }, random);
      const next = dealBoard(SHIPPED_PALS, { large: "paleontologist" }, random, before);
      const others = SHIPPED_PALS.filter(({ id }) => !idsOf(before).includes(id));

      for (const id of repeatedOn(next, before)) {
        const group = SHIPPED_PALS.find((each) => each.id === id)?.lookAlike;
        expect([id, others.some(({ lookAlike }) => lookAlike === group)]).toEqual([id, false]);
      }
    }
  });

  it("takes the board before's dinosaurs only for groups no other dinosaur is in", () => {
    const [a1, a2, b1, b2, c1, d1, e1] = [pal("a1", "a"), pal("a2", "a"), pal("b1", "b"), pal("b2", "b"), pal("c1", "c"), pal("d1", "d"), pal("e1", "e")];
    const before = board([a1, b1, c1, d1], { climbLevel: 3 });
    for (let seed = 1; seed <= 20; seed++) {
      const next = dealBoard([a1, a2, b1, b2, c1, d1, e1], { climbLevel: 3 }, seededRandom(seed), before);

      expect(idsOf(next).filter((id) => ["a2", "b2", "e1"].includes(id)).sort()).toEqual(["a2", "b2", "e1"]);
      expect(repeatedOn(next, before)).toHaveLength(1);
    }
  });

  it("deals the board before's dinosaurs again where no other can take their place", () => {
    const [a1, a2, b1, c1, d1] = [pal("a1", "a"), pal("a2", "a"), pal("b1", "b"), pal("c1", "c"), pal("d1", "d")];
    const silhouettes = dealBoard([a1, a2, b1, c1, d1], { climbLevel: 3 }, seededRandom(2), board([a1, b1, c1, d1], { climbLevel: 3 }));
    const pictures = dealBoard([REX, TRIKE, STEGO, pal("x")], { climbLevel: 1 }, seededRandom(2), board());

    expect(idsOf(silhouettes).sort()).toEqual(["a2", "b1", "c1", "d1"]);
    expect([idsOf(pictures).includes("x"), repeatedOn(pictures, board()).length]).toEqual([true, 2]);
  });
});

describe("turning cards", () => {
  it("turns one card over", () => {
    expect(turn(board(), 0)).toMatchObject({ open: [0], tries: 0 });
  });

  it("keeps an open card open, still the first of two, when tapped again", () => {
    const one = turn(board(), 0);

    expect(turn(one, 0)).toBe(one);
  });

  it("finds a matching pair at once: it stays found and counts a try", () => {
    expect(turnAll(board(), [0, 1])).toMatchObject({ open: [], found: ["tyrannosaurus"], tries: 1 });
  });

  it("leaves a miss open, counting a try, until it is turned back", () => {
    const missed = turnAll(board(), [0, 2]);

    expect(missed).toMatchObject({ open: [0, 2], found: [], tries: 1 });
    expect(isMiss(missed)).toBe(true);
    expect(turnBack(missed)).toMatchObject({ open: [], found: [], tries: 1 });
  });

  it("turns no third card while a miss shows", () => {
    const missed = turnAll(board(), [0, 2]);

    expect(turn(missed, 4)).toBe(missed);
    expect(turn(turnBack(missed), 4)).toMatchObject({ open: [4] });
  });

  it("turns no found card", () => {
    const found = turnAll(board(), [0, 1]);

    expect(turn(found, 1)).toBe(found);
  });

  it("turns back only a miss", () => {
    const one = turn(board(), 0);

    expect(turnBack(one)).toBe(one);
  });

  it("is finished once every pair is found, and only then", () => {
    expect(isFinished(turnAll(board(), [0, 1, 2, 3]))).toBe(false);
    expect(isFinished(finished())).toBe(true);
    expect(finished(board(), 2).tries).toBe(5);
  });
});

describe("finishing a board", () => {
  it("earns a star, sets the level's first best and finds the board's dinosaurs", () => {
    const { result, kept } = finishBoard(readable(), finished(board(), 2), ORDER);

    expect(result).toEqual({
      level: { climbLevel: 1 },
      pals: [REX, TRIKE, STEGO],
      tries: 5,
      stars: 1,
      best: 5,
      previousBest: undefined,
      celebration: "first-best",
      levelUp: null,
      newlyFound: ["tyrannosaurus", "triceratops", "stegosaurus"]
    });
    expect(kept).toEqual({
      readable: true,
      progress: { stars: 1, climbLevel: 1, boardsOnClimbLevel: 1, best: { 1: 5 }, found: ["tyrannosaurus", "triceratops", "stegosaurus"] }
    });
  });

  it("celebrates fewer tries than the best as a new best", () => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, best: { 1: 7 } }), finished(board(), 2), ORDER);

    expect(result).toMatchObject({ best: 5, previousBest: 7, celebration: "new-best" });
    expect(kept.progress.best).toEqual({ 1: 5 });
  });

  it.each([7, 9])("keeps the best of 7, uncelebrated, after %i tries", (tries) => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, best: { 1: 7, 2: 4 } }), finished(board(), tries - 3), ORDER);

    expect(result).toMatchObject({ tries, stars: 1, best: 7, celebration: null });
    expect(kept.progress.best).toEqual({ 1: 7, 2: 4 });
  });

  it("moves up a level after two boards on it", () => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, stars: 1, boardsOnClimbLevel: 1 }), finished(), ORDER);

    expect(result.levelUp).toBe(2);
    expect(kept.progress).toMatchObject({ stars: 2, climbLevel: 2, boardsOnClimbLevel: 0 });
  });

  it("stays on the top level, a star for each board", () => {
    const top = board([REX, TRIKE, STEGO, pal("a"), pal("b"), pal("c")], { climbLevel: 4 });
    const once = finishBoard(readable({ ...NO_PAIRS, climbLevel: 4 }), finished(top), ORDER);
    const twice = finishBoard(once.kept, finished(top), ORDER);

    expect([once.result.levelUp, twice.result.levelUp]).toEqual([null, null]);
    expect(twice.kept.progress).toMatchObject({ stars: 2, climbLevel: 4 });
  });

  it.each(["explorer", "paleontologist"] as const)("earns a star and finds the dinosaurs of a %s board, which neither climbs nor touches the climb's bests", (large) => {
    const pals = SHIPPED_PALS.slice(0, LARGE_LEVELS[large].pairs);
    const before = { ...NO_PAIRS, stars: 2, climbLevel: 2 as const, boardsOnClimbLevel: 1, best: { 1: 4, 2: 6 } };

    const { result, kept } = finishBoard(readable(before), finished(board(pals, { large }), 2), ORDER);

    expect(result).toMatchObject({ level: { large }, tries: pals.length + 2, stars: 3, celebration: null, levelUp: null, newlyFound: pals.map(({ id }) => id) });
    expect(kept.progress).toEqual({ stars: 3, climbLevel: 2, boardsOnClimbLevel: 1, best: { 1: 4, 2: 6 }, found: ORDER.filter((id) => pals.some((one) => one.id === id)) });
  });

  it("finds each dinosaur once, in the dinosaur list's order, keeping one no longer in it", () => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, found: ["stegosaurus", "gone"] }), finished(), ORDER);

    expect(result.newlyFound).toEqual(["tyrannosaurus", "triceratops"]);
    expect(kept.progress.found).toEqual(["tyrannosaurus", "triceratops", "stegosaurus", "gone"]);
    expect(foundOf(kept.progress.found, ORDER)).toEqual(["tyrannosaurus", "triceratops", "stegosaurus"]);
  });

  it("shows no best and no celebration when progress cannot be read, but counts the board", () => {
    const { result, kept } = finishBoard({ progress: NO_PAIRS, readable: false }, finished(board(), 3), ORDER);

    expect(result).toMatchObject({ tries: 6, stars: 1, best: undefined, previousBest: undefined, celebration: null });
    expect(kept).toEqual({ readable: false, progress: expect.objectContaining({ stars: 1, found: ["tyrannosaurus", "triceratops", "stegosaurus"] }) });
  });

  it("records only a finished board", () => {
    expect(() => finishBoard(readable(), turnAll(board(), [0, 1]), ORDER)).toThrow("A board is finished only once every pair is found");
  });
});
