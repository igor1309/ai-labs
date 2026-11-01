import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { describe, expect, it } from "vitest";
import { boardState, drop, score, startBoard, type Basket, type Dinosaur, type Property, type Sorting } from "../src/sorting/index.ts";
import { SHIPPED_SORTABLES, seededRandom, sortingBy } from "./support.ts";

const PROPERTIES: readonly Property[] = ["legs", "diet", "size", "horns", "feathers"];

// The basket each dinosaur belongs in by its shipped facts, or undefined
// where they give no clear answer.
function clearBasket(dinosaur: Dinosaur, property: Property, level: AgeLevel = "hatchling"): Basket | undefined {
  switch (property) {
    case "legs":
      if (dinosaur.legs === "either") return level === "paleontologist" ? "two-or-four" : undefined;
      return dinosaur.legs === 2 ? "two-legs" : dinosaur.legs === 4 ? "four-legs" : undefined;
    case "diet":
      return dinosaur.diet === "both" ? (level === "explorer" ? "both" : undefined) : dinosaur.diet;
    case "size":
      return dinosaur.size ?? undefined;
    case "horns":
      return dinosaur.horns === null ? undefined : dinosaur.horns ? "horns" : "no-horns";
    case "feathers":
      if (dinosaur.feathers === "unknown") return level === "paleontologist" ? "not-known-yet" : undefined;
      if (level === "paleontologist" && dinosaur.diet === "plants" && !dinosaur.feathers) return undefined;
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
      const board = boardState(startBoard(SHIPPED_SORTABLES, "hatchling", seededRandom(seed)));
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
    const properties = new Set(SEEDS.map((seed) => boardState(startBoard(SHIPPED_SORTABLES, "hatchling", seededRandom(seed))).property));

    expect([...properties].sort()).toEqual([...PROPERTIES].sort());
  });

  it.each([
    ["legs", { legs: null }],
    ["legs", { legs: "either" }],
    ["diet", { diet: "both" }],
    ["size", { size: null }],
    ["horns", { horns: null }],
    ["feathers", { feathers: null }],
    ["feathers", { feathers: "unknown" }]
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
      const first = startBoard(SHIPPED_SORTABLES, "hatchling", random);
      const left = drop(first, boardState(first).cards[0]?.dinosaur.id ?? "", "big");
      const second = startBoard(SHIPPED_SORTABLES, "hatchling", random, left);

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

const LEVEL_RULES = [
  ["hatchling", 6, PROPERTIES],
  ["explorer", 8, PROPERTIES],
  ["paleontologist", 10, ["legs", "feathers"]]
] as const;

describe.each(LEVEL_RULES)("%s generation", (level, size, properties) => {
  it("fills every property's baskets with distinct eligible dinosaurs, at least two per basket, and never repeats a property", () => {
    const seen = new Set<Property>();
    for (const seed of SEEDS) {
      const random = seededRandom(seed);
      let previous: Sorting | undefined;
      for (let round = 0; round < 3; round++) {
        const sorting = startBoard(SHIPPED_SORTABLES, level, random, previous);
        const board = boardState(sorting);
        seen.add(board.property);
        expect(properties).toContain(board.property);
        expect(board.property).not.toBe(previous?.board.property);
        expect(sorting.board.level).toBe(level);
        expect(board.cards).toHaveLength(size);
        expect(new Set(board.cards.map(({ dinosaur }) => dinosaur.id)).size).toBe(size);
        expect(board.cards.map(({ dinosaur }) => clearBasket(dinosaur, board.property, level))).toEqual(board.cards.map(({ basket }) => basket));
        const third = level === "explorer" && board.property === "diet" ? "both" : level === "paleontologist" ? (board.property === "legs" ? "two-or-four" : "not-known-yet") : undefined;
        expect(board.baskets).toEqual([...({ legs: ["two-legs", "four-legs"], diet: ["plants", "meat"], size: ["big", "small"], horns: ["horns", "no-horns"], feathers: ["feathers", "no-feathers"] }[board.property]), ...(third ? [third] : [])]);
        for (const basket of board.baskets) {
          expect(board.cards.filter((card) => card.basket === basket).length).toBeGreaterThanOrEqual(2);
        }
        if (level === "explorer" && board.property === "diet") {
          expect(board.cards.filter(({ basket }) => basket === "both").length).toBeLessThanOrEqual(3);
        }
        if (level === "paleontologist" && board.property === "feathers") {
          expect(board.cards.filter(({ basket }) => basket === "no-feathers").map(({ dinosaur }) => dinosaur.id).sort()).toEqual(["allosaurus", "carnotaurus"]);
        }
        previous = sorting;
      }
    }
    expect([...seen].sort()).toEqual([...properties].sort());
  });

  it("has enough shipped facts to fill every property and every basket", () => {
    for (const property of properties) {
      const counts = new Map<Basket, number>();
      for (const dinosaur of SHIPPED_SORTABLES) {
        const basket = clearBasket(dinosaur, property, level);
        if (basket) counts.set(basket, (counts.get(basket) ?? 0) + 1);
      }
      expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(size);
      expect([...counts.values()].every((count) => count >= 2)).toBe(true);
      expect(counts.size).toBe(level === "paleontologist" || (level === "explorer" && property === "diet") ? 3 : 2);
    }
  });
});

it.each(AGE_LEVELS.flatMap((from) => AGE_LEVELS.map((to) => [from, to] as const)))("does not repeat a property when moving from %s to %s", (from, to) => {
  for (const seed of SEEDS.slice(0, 30)) {
    const random = seededRandom(seed);
    const first = startBoard(SHIPPED_SORTABLES, from, random);
    expect(startBoard(SHIPPED_SORTABLES, to, random, first).board.property).not.toBe(first.board.property);
  }
});

it("rejects a list with only one dinosaur for a third basket", () => {
  const either = SHIPPED_SORTABLES.find(({ legs }) => legs === "either");
  const list = SHIPPED_SORTABLES.filter((dinosaur) => dinosaur.legs !== "either" || dinosaur === either);
  expect(() => startBoard(list, "paleontologist", () => 0)).toThrow("The dinosaur list cannot fill a board sorting by legs");
});
