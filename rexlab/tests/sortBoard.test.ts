import { describe, expect, it } from "vitest";
import { boardState, drop, score, startBoard, type Basket, type Dinosaur, type Property } from "../src/sorting/index.ts";
import { SHIPPED_SORTABLES, seededRandom, sortingBy } from "./support.ts";

const PROPERTIES: readonly Property[] = ["legs", "diet", "size", "horns", "feathers"];

// The basket each dinosaur belongs in by its shipped facts, or undefined
// where they give no clear answer.
function clearBasket(dinosaur: Dinosaur, property: Property): Basket | undefined {
  switch (property) {
    case "legs":
      return dinosaur.legs === 2 ? "two-legs" : dinosaur.legs === 4 ? "four-legs" : undefined;
    case "diet":
      return dinosaur.diet === "both" ? undefined : dinosaur.diet;
    case "size":
      return dinosaur.size ?? undefined;
    case "horns":
      return dinosaur.horns === null ? undefined : dinosaur.horns ? "horns" : "no-horns";
    case "feathers":
      return dinosaur.feathers === null ? undefined : dinosaur.feathers ? "feathers" : "no-feathers";
  }
}

let made = 0;

// A dinosaur with every fact clear, but for those given.
function dinosaur(facts: Partial<Omit<Dinosaur, "id" | "name">> = {}): Dinosaur {
  made++;
  return {
    id: `dinosaur-${made}`,
    name: { en: `Dinosaur ${made}`, ru: `Динозавр ${made}` },
    legs: 2,
    diet: "meat",
    size: "big",
    horns: false,
    feathers: true,
    ...facts
  };
}

const SEEDS = Array.from({ length: 200 }, (_, seed) => seed);

describe("a new board", () => {
  it("holds six different dinosaurs of the shipped list, at least two for each basket, each in the basket its facts give", () => {
    for (const seed of SEEDS) {
      const board = boardState(startBoard(SHIPPED_SORTABLES, seededRandom(seed)));
      const ids = board.cards.map(({ dinosaur }) => dinosaur.id);

      expect(new Set(ids).size).toBe(6);
      expect(board.cards.every(({ dinosaur }) => SHIPPED_SORTABLES.includes(dinosaur))).toBe(true);
      expect(board.cards.map(({ dinosaur }) => clearBasket(dinosaur, board.property))).toEqual(board.cards.map(({ basket }) => basket));
      for (const basket of board.baskets) {
        expect(board.cards.filter((card) => card.basket === basket).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it.each([
    ["legs", ["two-legs", "four-legs"]],
    ["diet", ["plants", "meat"]],
    ["size", ["big", "small"]],
    ["horns", ["horns", "no-horns"]],
    ["feathers", ["feathers", "no-feathers"]]
  ] as const)("sorting by %s has the baskets %j", (property, baskets) => {
    expect(boardState(sortingBy(property)).baskets).toEqual(baskets);
  });

  it("sorts by every property, over many boards", () => {
    const properties = new Set(SEEDS.map((seed) => boardState(startBoard(SHIPPED_SORTABLES, seededRandom(seed))).property));

    expect([...properties].sort()).toEqual([...PROPERTIES].sort());
  });

  it.each([
    ["legs", { legs: null }],
    ["diet", { diet: "both" }],
    ["size", { size: null }],
    ["horns", { horns: null }],
    ["feathers", { feathers: null }]
  ] as const)("never puts a dinosaur with no clear %s on a board sorting by it", (property, unclear) => {
    const other = { legs: 4, diet: "plants", size: "small", horns: true, feathers: false } as const;
    const firsts = Array.from({ length: 6 }, () => dinosaur());
    const seconds = Array.from({ length: 6 }, () => dinosaur(other));
    const unclears = Array.from({ length: 6 }, () => dinosaur(unclear));

    for (const seed of SEEDS.slice(0, 20)) {
      const board = boardState(sortingBy(property, [...firsts, ...unclears, ...seconds], seed));

      expect(board.cards.filter(({ dinosaur }) => unclears.includes(dinosaur))).toEqual([]);
    }
  });

  it("fails on a list that cannot fill a board, rather than hand out an unfair one", () => {
    const onlyTwoLegs = [
      ...Array.from({ length: 6 }, () => dinosaur()),
      ...Array.from({ length: 6 }, () => dinosaur({ diet: "plants", size: "small", horns: true, feathers: false }))
    ];

    expect(() => sortingBy("legs", onlyTwoLegs)).toThrow("The dinosaur list cannot fill a board sorting by legs");
  });
});

describe("the next board", () => {
  it("sorts by another property than the board before it, finished or left early", () => {
    for (const seed of SEEDS) {
      const random = seededRandom(seed);
      const first = startBoard(SHIPPED_SORTABLES, random);
      const left = drop(first, boardState(first).cards[0]?.dinosaur.id ?? "", "big");
      const second = startBoard(SHIPPED_SORTABLES, random, left);

      expect(boardState(second).property).not.toBe(boardState(first).property);
    }
  });
});

describe("sorting a board", () => {
  const sorting = sortingBy("legs");
  const cards = boardState(sorting).cards;
  const [first, second] = cards;
  if (!first || !second) throw new Error("A board has six cards");
  const id = first.dinosaur.id;
  const wrong = first.basket === "two-legs" ? "four-legs" : "two-legs";

  it("lands a card dropped on its right basket, counted as right", () => {
    const after = drop(sorting, id, first.basket);
    const board = boardState(after);

    expect(board.landed.map(({ dinosaur }) => dinosaur.id)).toEqual([id]);
    expect(board.cards[0]).toMatchObject({ landed: true, missed: false });
    expect(board.lastMiss).toBeUndefined();
    expect(score(after)).toBe(1);
  });

  it("keeps a card dropped on the wrong basket on the tray, with its right basket to glow and hint at", () => {
    const board = boardState(drop(sorting, id, wrong));

    expect(board.landed).toEqual([]);
    expect(board.cards[0]).toMatchObject({ landed: false, missed: true });
    expect(board.lastMiss).toEqual({ basket: first.basket, misses: 1 });
  });

  it("tells each wrong drop from the one before, even of the same card", () => {
    const twice = drop(drop(sorting, id, wrong), id, wrong);

    expect(boardState(twice).lastMiss).toEqual({ basket: first.basket, misses: 2 });
    expect(boardState(drop(twice, id, first.basket)).cards[0]).toMatchObject({ landed: true });
  });

  it("counts a card dropped wrong as wrong, even once it lands", () => {
    const landed = drop(drop(sorting, id, wrong), id, first.basket);

    expect(boardState(landed).cards[0]).toMatchObject({ landed: true, missed: true });
    expect(score(landed)).toBe(0);
  });

  it("does not move a card already in its basket, nor count it again", () => {
    const landed = drop(sorting, id, first.basket);

    expect(drop(landed, id, wrong)).toBe(landed);
    expect(drop(landed, id, first.basket)).toBe(landed);
  });

  it("ignores a card not on the board", () => {
    expect(drop(sorting, "no-such-dinosaur", "two-legs")).toBe(sorting);
  });

  it("is finished when every card has landed, in the order they landed", () => {
    const reversed = [...cards].reverse();
    const done = reversed.reduce((each, card) => drop(each, card.dinosaur.id, card.basket), sorting);
    const board = boardState(done);

    expect(boardState(drop(sorting, id, first.basket)).finished).toBe(false);
    expect(board.finished).toBe(true);
    expect(board.landed.map(({ dinosaur }) => dinosaur.id)).toEqual(reversed.map(({ dinosaur }) => dinosaur.id));
    expect(score(done)).toBe(6);
  });
});
