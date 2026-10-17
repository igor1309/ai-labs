import { describe, expect, it } from "vitest";
import {
  askedNeed,
  finishVisit,
  friendsOf,
  give,
  isFinished,
  ITEMS,
  MOST_HEARTS,
  NEEDS,
  NO_CARE,
  pickVisitor,
  settle,
  startVisit,
  suitableItems,
  type Celebration,
  type Diet,
  type Item,
  type KeptCare,
  type Need,
  type Visit,
  type Visitor
} from "../src/care/index.ts";
import { SHIPPED_VISITORS } from "./support.ts";

const visitor = (id: string, diet: Diet): Visitor => ({ id, name: { en: id, ru: id }, diet });

const REX = visitor("tyrannosaurus", "meat");
const TRIKE = visitor("triceratops", "plants");
const GALLI = visitor("gallimimus", "both");

const MEETS: Record<Exclude<Need, "hungry">, Item> = { thirsty: "water", dirty: "bath", tired: "nest" };

// Gives each item in turn, letting each reaction play out.
const giveAll = (visit: Visit, items: readonly Item[]) => items.reduce((at, item) => settle(give(at, item)), visit);

// A visit with each need met at the first try, but those in `retried`,
// where something else is given first.
const finished = (who: Visitor, retried: readonly Need[] = []): Visit =>
  NEEDS.reduce((visit, need) => {
    const food = who.diet === "meat" ? "meat" : "plants";
    const right = need === "hungry" ? food : MEETS[need];
    const wrong = need === "hungry" ? "water" : food;
    return giveAll(visit, retried.includes(need) ? [wrong, right] : [right]);
  }, startVisit(who));

describe("a visit", () => {
  it("asks for food, then water, then a bath, then rest, in that order", () => {
    const asked: Array<Need | undefined> = [];
    let visit = startVisit(REX);
    for (const item of ["meat", "water", "bath", "nest"] as const) {
      asked.push(askedNeed(visit));
      visit = giveAll(visit, [item]);
    }

    expect(asked).toEqual(["hungry", "thirsty", "dirty", "tired"]);
    expect(isFinished(visit)).toBe(true);
    expect(askedNeed(visit)).toBeUndefined();
  });

  it.each<[Visitor, readonly Item[], readonly Item[]]>([
    [REX, ["meat"], ["plants"]],
    [TRIKE, ["plants"], ["meat"]],
    [GALLI, ["plants", "meat"], []]
  ])("takes the food %s ate, and only that", (who, eaten, refused) => {
    for (const item of eaten) expect(give(startVisit(who), item).reacting?.reaction).toBe("happy");
    for (const item of [...refused, "water", "bath", "nest"] as const) expect(give(startVisit(who), item).reacting?.reaction).toBe("refusal");
  });

  it("meets thirst with water, dirt with a bath and tiredness with the nest, whatever the dinosaur ate", () => {
    for (const who of [REX, TRIKE, GALLI]) {
      const fed = giveAll(startVisit(who), [who.diet === "meat" ? "meat" : "plants"]);
      for (const need of ["thirsty", "dirty", "tired"] as const) {
        const visit = NEEDS.slice(1, NEEDS.indexOf(need)).reduce((at, before) => giveAll(at, [MEETS[before as Exclude<Need, "hungry">]]), fed);
        const wrong = ITEMS.filter((item) => item !== MEETS[need]);
        expect(wrong.map((item) => give(visit, item).reacting?.reaction)).toEqual(wrong.map(() => "refusal"));
        expect(give(visit, MEETS[need]).reacting?.reaction).toBe("happy");
      }
    }
  });

  it.each<[Visitor, readonly Item[]]>([
    [REX, ["meat"]],
    [TRIKE, ["plants"]],
    [GALLI, ["plants", "meat"]]
  ])("names what meets each need of %o: its food, water, a bath and the nest", (who, foods) => {
    expect(NEEDS.map((need) => suitableItems(who, need))).toEqual([foods, ["water"], ["bath"], ["nest"]]);
  });

  it("knows the food type of every shipped dinosaur", () => {
    expect(SHIPPED_VISITORS.length).toBeGreaterThan(0);
    expect(SHIPPED_VISITORS.filter(({ diet }) => !["meat", "plants", "both"].includes(diet))).toEqual([]);
  });

  it("earns two hearts for a need met at the first try and one after a refusal, never fewer", () => {
    expect(finished(REX).hearts).toBe(MOST_HEARTS);
    expect(finished(REX, ["hungry", "dirty"]).hearts).toBe(6);
    expect(finished(TRIKE, NEEDS).hearts).toBe(4);
    const twice = giveAll(startVisit(REX), ["plants", "water", "plants", "meat"]);
    expect(twice.hearts).toBe(1);
  });

  it("asks for the same need after a refusal, earns nothing for it, and remembers what was refused", () => {
    const refused = give(startVisit(REX), "plants");

    expect(refused.reacting).toEqual({ item: "plants", reaction: "refusal", earned: 0 });
    expect(refused.hearts).toBe(0);
    const settled = settle(refused);
    expect(askedNeed(settled)).toBe("hungry");
    expect(giveAll(settled, ["water", "plants"]).refused).toEqual(["plants", "water"]);
  });

  it("takes nothing while a reaction plays, or once every need is met", () => {
    const eating = give(startVisit(REX), "meat");

    expect(give(eating, "water")).toBe(eating);
    const refusing = give(startVisit(REX), "plants");
    expect(give(refusing, "meat")).toBe(refusing);
    const done = finished(REX);
    expect(give(done, "nest")).toBe(done);
  });

  it("asks the next need only once the happy reaction has played", () => {
    const eating = give(startVisit(REX), "meat");

    expect([askedNeed(eating), eating.met, eating.hearts]).toEqual([undefined, 1, 2]);
    expect(askedNeed(settle(eating))).toBe("thirsty");
  });
});

describe("a new visitor", () => {
  const ALL = [REX, TRIKE, GALLI];

  it("is picked at random", () => {
    expect([0, 0.4, 0.99].map((value) => pickVisitor(ALL, () => value).id)).toEqual(["tyrannosaurus", "triceratops", "gallimimus"]);
  });

  it("is never the last visitor", () => {
    for (const value of [0, 0.3, 0.6, 0.99]) expect(pickVisitor(ALL, () => value, "triceratops").id).not.toBe("triceratops");
  });

  it("is the only dinosaur when only one may visit, and none when none may", () => {
    expect(pickVisitor([REX], () => 0.5, "tyrannosaurus").id).toBe("tyrannosaurus");
    expect(() => pickVisitor([], () => 0.5)).toThrow("No dinosaur can visit");
  });
});

describe("finishing a visit", () => {
  const ORDER = ["tyrannosaurus", "triceratops", "gallimimus"];
  const keptWith = (bestScore: number | null, friends: string[] = [], readable = true): KeptCare => ({ progress: { bestScore, visitsFinished: 2, friends }, readable });

  it.each<[number | null, Need[], Celebration | null, number]>([
    [null, [], "first-best", 8],
    [null, ["hungry"], "first-best", 7],
    [6, ["hungry"], "new-best", 7],
    [7, ["hungry"], null, 7],
    [8, NEEDS.slice(), null, 8]
  ])("from a best of %s, with refusals at %o, celebrates %s and keeps a best of %i", (bestScore, retried, celebration, best) => {
    const { result, kept } = finishVisit(keptWith(bestScore), finished(REX, retried), ORDER);

    expect(result).toMatchObject({ celebration, best, previousBest: bestScore ?? undefined, total: 8 });
    expect(kept.progress).toMatchObject({ bestScore: best, visitsFinished: 3 });
  });

  it("makes the visitor a friend once, kept in the dinosaur list's order, with a friend no longer listed kept after", () => {
    const first = finishVisit(keptWith(4, ["gallimimus", "stegosaurus"]), finished(REX), ORDER);

    expect(first.result.newFriend).toBe(true);
    expect(first.kept.progress.friends).toEqual(["tyrannosaurus", "gallimimus", "stegosaurus"]);
    const again = finishVisit(first.kept, finished(REX), ORDER);
    expect(again.result.newFriend).toBe(false);
    expect(again.kept.progress.friends).toEqual(["tyrannosaurus", "gallimimus", "stegosaurus"]);
  });

  it("shows no best and celebrates nothing when progress cannot be read, but still makes a friend", () => {
    const { result, kept } = finishVisit({ progress: NO_CARE, readable: false }, finished(TRIKE), ORDER);

    expect(result).toMatchObject({ score: 8, best: undefined, previousBest: undefined, celebration: null, newFriend: true });
    expect(kept).toEqual({ progress: { bestScore: 8, visitsFinished: 1, friends: ["triceratops"] }, readable: false });
  });

  it("lists friends by the dinosaurs still known, in the list's order", () => {
    expect(friendsOf(["gallimimus", "stegosaurus", "tyrannosaurus"], [REX, TRIKE, GALLI]).map(({ id }) => id)).toEqual(["tyrannosaurus", "gallimimus"]);
  });
});
