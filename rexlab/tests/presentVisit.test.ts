import { describe, expect, it } from "vitest";
import { give, settle, startVisit, type Diet, type Item, type Visit, type Visitor } from "../src/care/index.ts";
import { presentVisit } from "../src/presentation.ts";
import { fakeBodyPicture } from "./support.ts";

const visitor = (id: string, diet: Diet): Visitor => ({ id, name: { en: id, ru: `${id}-ru` }, diet });

const REX = visitor("tyrannosaurus", "meat");
const TRIKE = visitor("triceratops", "plants");
const GALLI = visitor("gallimimus", "both");

// Gives each item in turn, letting each reaction play out.
const giveAll = (visit: Visit, items: readonly Item[]) => items.reduce((at, item) => settle(give(at, item)), visit);

const present = (visit: Visit, leaving = false) => presentVisit(visit, leaving, "en", fakeBodyPicture);

describe("the visit screen's view", () => {
  it("shows the visitor by its name in the language, its picture, its hearts and whether it is leaving", () => {
    const fed = giveAll(startVisit(REX), ["meat"]);

    expect(present(fed)).toMatchObject({ id: "tyrannosaurus", name: "tyrannosaurus", picture: fakeBodyPicture("tyrannosaurus"), hearts: 2, leaving: false });
    expect(presentVisit(fed, true, "ru", fakeBodyPicture)).toMatchObject({ name: "tyrannosaurus-ru", leaving: true });
  });

  it("marks each need, in the order asked, met, asked now or still to come", () => {
    const visit = giveAll(startVisit(REX), ["meat", "water"]);

    expect(present(visit).needs).toEqual([
      { need: "hungry", state: "met" },
      { need: "thirsty", state: "met" },
      { need: "dirty", state: "current" },
      { need: "tired", state: "pending" }
    ]);
  });

  it("asks the next need only once the happy reaction has played", () => {
    const eating = give(startVisit(REX), "meat");

    expect(present(eating)).toMatchObject({ need: undefined, bubble: [], suggested: [], hearts: 2 });
    expect(present(eating).needs.map(({ state }) => state)).toEqual(["met", "pending", "pending", "pending"]);
    expect(present(settle(eating)).needs.map(({ state }) => state)).toEqual(["met", "current", "pending", "pending"]);
  });

  it("shows the reaction playing and the items refused for the need asked now", () => {
    const refusing = give(giveAll(startVisit(REX), ["plants"]), "water");

    expect(present(refusing)).toMatchObject({ reacting: { item: "water", reaction: "refusal", earned: 0 }, refused: ["plants", "water"] });
  });

  it("asks for nothing once every need is met", () => {
    const done = giveAll(startVisit(REX), ["meat", "water", "bath", "nest"]);

    expect(present(done, true)).toMatchObject({ need: undefined, bubble: [], suggested: [], refused: [], leaving: true });
    expect(present(done).needs.map(({ state }) => state)).toEqual(["met", "met", "met", "met"]);
  });
});

describe("the need's bubble", () => {
  it.each([REX, TRIKE, GALLI])("shows the same empty bowl for hunger, for %o", (who) => {
    expect(present(startVisit(who))).toMatchObject({ need: "hungry", bubble: ["bowl"], suggested: [] });
  });

  it.each<[Visitor, readonly Item[]]>([
    [REX, ["meat"]],
    [TRIKE, ["plants"]],
    [GALLI, ["plants", "meat"]]
  ])("shows, after a refusal, the food that would do and suggests it, for %o", (who, foods) => {
    expect(present(settle(give(startVisit(who), "water")))).toMatchObject({ bubble: foods, suggested: foods, refused: ["water"] });
  });

  it("shows the item each other need asks for, and suggests it only after a refusal", () => {
    const thirsty = giveAll(startVisit(REX), ["meat"]);

    expect(present(thirsty)).toMatchObject({ need: "thirsty", bubble: ["water"], suggested: [] });
    expect(present(giveAll(thirsty, ["nest"]))).toMatchObject({ bubble: ["water"], suggested: ["water"] });
    const tired = giveAll(thirsty, ["water", "bath"]);
    expect(present(tired)).toMatchObject({ need: "tired", bubble: ["nest"] });
  });
});
