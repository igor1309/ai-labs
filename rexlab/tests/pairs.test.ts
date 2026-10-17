import { describe, expect, it } from "vitest";
import {
  dealBoard,
  finishBoard,
  foundOf,
  isFinished,
  isMiss,
  LEVELS,
  NO_PAIRS,
  turn,
  turnBack,
  type Board,
  type KeptPairs,
  type Level,
  type Pal
} from "../src/pairs/index.ts";
import { seededRandom, SHIPPED_PALS } from "./support.ts";

const pal = (id: string, lookAlike = id): Pal => ({ id, name: { en: id, ru: id }, lookAlike });

const REX = pal("tyrannosaurus", "big-hunter");
const TRIKE = pal("triceratops", "horned-face");
const STEGO = pal("stegosaurus", "plated-back");

// A level 1 board of Rex, Trike and Stego, laid out in that order, each
// pair side by side.
const board = (pals: readonly Pal[] = [REX, TRIKE, STEGO], level: Level = 1): Board => ({
  level,
  pals,
  cards: pals.flatMap((one) => [
    { pal: one, face: "picture" as const },
    { pal: one, face: LEVELS[level].silhouettes ? ("silhouette" as const) : ("picture" as const) }
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

describe("dealing a board", () => {
  it.each([1, 2, 3, 4] as const)("deals level %i's pairs of different dinosaurs from the shared list", (level) => {
    const dealt = dealBoard(SHIPPED_PALS, level, seededRandom(level));
    const ids = dealt.cards.map(({ pal: { id } }) => id);

    expect(dealt.cards).toHaveLength(LEVELS[level].pairs * 2);
    expect(dealt.cards).toHaveLength(LEVELS[level].rows * LEVELS[level].columns);
    expect(new Set(ids).size).toBe(LEVELS[level].pairs);
    for (const id of ids) {
      expect(ids.filter((other) => other === id)).toHaveLength(2);
      expect(ORDER).toContain(id);
    }
    expect({ level: dealt.level, open: dealt.open, found: dealt.found, tries: dealt.tries }).toEqual({ level, open: [], found: [], tries: 0 });
  });

  it.each([
    [1, ["picture", "picture"]],
    [2, ["picture", "picture"]],
    [3, ["picture", "silhouette"]],
    [4, ["picture", "silhouette"]]
  ] as const)("matches each level %i picture to %j", (level, faces) => {
    const dealt = dealBoard(SHIPPED_PALS, level, seededRandom(7));

    for (const { id } of dealt.pals) {
      const pair = dealt.cards.filter(({ pal }) => pal.id === id).map(({ face }) => face);
      expect(pair.sort()).toEqual([...faces].sort());
    }
  });

  it("shuffles the cards: another random deals another order", () => {
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => dealBoard(SHIPPED_PALS, 2, seededRandom(seed)).cards.map(({ pal }) => pal.id).join()));

    expect(orders.size).toBeGreaterThan(1);
  });

  it("puts every card anywhere on the board, as likely as any other place", () => {
    const random = seededRandom(11);
    const first = new Map<string, number>();
    for (let deal = 0; deal < 600; deal++) {
      const [card] = dealBoard([REX, TRIKE, STEGO], 1, random).cards;
      first.set(card!.pal.id, (first.get(card!.pal.id) ?? 0) + 1);
    }

    for (const id of ["tyrannosaurus", "triceratops", "stegosaurus"]) {
      expect(first.get(id)).toBeGreaterThan(150);
    }
  });

  it("never deals a dinosaur of the board before", () => {
    const random = seededRandom(3);
    let last = dealBoard(SHIPPED_PALS, 4, random);
    for (let deal = 0; deal < 50; deal++) {
      const next = dealBoard(SHIPPED_PALS, 4, random, last);
      expect(next.pals.filter(({ id }) => last.pals.some((before) => before.id === id))).toEqual([]);
      last = next;
    }
  });

  it.each([3, 4] as const)("deals no two look-alikes on a level %i board of silhouettes", (level) => {
    const random = seededRandom(5);
    for (let deal = 0; deal < 50; deal++) {
      const groups = dealBoard(SHIPPED_PALS, level, random).pals.map(({ lookAlike }) => lookAlike);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("deals look-alikes on a board of pictures, which tell them apart", () => {
    const raptors = ["velociraptor", "deinonychus", "utahraptor"].map((id) => pal(id, "raptor"));

    expect(dealBoard(raptors, 1, seededRandom(1)).pals).toHaveLength(3);
    expect(() => dealBoard([...raptors, pal("troodon", "raptor")], 3, seededRandom(1))).toThrow("Too few dinosaurs for a level 3 board");
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
      level: 1,
      pals: [REX, TRIKE, STEGO],
      tries: 5,
      stars: 1,
      best: 5,
      celebration: "first-best",
      levelUp: null,
      newlyFound: ["tyrannosaurus", "triceratops", "stegosaurus"]
    });
    expect(kept).toEqual({
      readable: true,
      progress: { stars: 1, level: 1, boardsOnLevel: 1, best: { 1: 5 }, found: ["tyrannosaurus", "triceratops", "stegosaurus"] }
    });
  });

  it("celebrates fewer tries than the best as a new best", () => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, best: { 1: 7 } }), finished(board(), 2), ORDER);

    expect(result).toMatchObject({ best: 5, celebration: "new-best" });
    expect(kept.progress.best).toEqual({ 1: 5 });
  });

  it.each([7, 9])("keeps the best of 7, uncelebrated, after %i tries", (tries) => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, best: { 1: 7, 2: 4 } }), finished(board(), tries - 3), ORDER);

    expect(result).toMatchObject({ tries, stars: 1, best: 7, celebration: null });
    expect(kept.progress.best).toEqual({ 1: 7, 2: 4 });
  });

  it("moves up a level after two boards on it", () => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, stars: 1, boardsOnLevel: 1 }), finished(), ORDER);

    expect(result.levelUp).toBe(2);
    expect(kept.progress).toMatchObject({ stars: 2, level: 2, boardsOnLevel: 0 });
  });

  it("stays on the top level, a star for each board", () => {
    const top = board([REX, TRIKE, STEGO, pal("a"), pal("b"), pal("c")], 4);
    const once = finishBoard(readable({ ...NO_PAIRS, level: 4 }), finished(top), ORDER);
    const twice = finishBoard(once.kept, finished(top), ORDER);

    expect([once.result.levelUp, twice.result.levelUp]).toEqual([null, null]);
    expect(twice.kept.progress).toMatchObject({ stars: 2, level: 4 });
  });

  it("finds each dinosaur once, in the dinosaur list's order, keeping one no longer in it", () => {
    const { result, kept } = finishBoard(readable({ ...NO_PAIRS, found: ["stegosaurus", "gone"] }), finished(), ORDER);

    expect(result.newlyFound).toEqual(["tyrannosaurus", "triceratops"]);
    expect(kept.progress.found).toEqual(["tyrannosaurus", "triceratops", "stegosaurus", "gone"]);
    expect(foundOf(kept.progress.found, ORDER)).toEqual(["tyrannosaurus", "triceratops", "stegosaurus"]);
  });

  it("shows no best and no celebration when progress cannot be read, but counts the board", () => {
    const { result, kept } = finishBoard({ progress: NO_PAIRS, readable: false }, finished(board(), 3), ORDER);

    expect(result).toMatchObject({ tries: 6, stars: 1, best: undefined, celebration: null });
    expect(kept).toEqual({ readable: false, progress: expect.objectContaining({ stars: 1, found: ["tyrannosaurus", "triceratops", "stegosaurus"] }) });
  });

  it("records only a finished board", () => {
    expect(() => finishBoard(readable(), turnAll(board(), [0, 1]), ORDER)).toThrow("A board is finished only once every pair is found");
  });
});
