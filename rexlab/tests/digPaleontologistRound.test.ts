import { describe, expect, it } from "vitest";
import { awaitsHelp, brushRound, choiceDinosaurs, choosing, clueIndex, GRID, HELP_AFTER, paleontologistSpots, pickRound, startRound, TELLING_KINDS, waitForHelp, type DigDinosaur, type DigRound, type Spot } from "../src/dig/index.ts";
import { SHIPPED_DIG } from "./support.ts";

const kinds = (spots: readonly Spot[]) => spots.map(({ kind }) => kind);
const shipped = (id: string) => SHIPPED_DIG.find((dinosaur) => dinosaur.id === id)!;
const allCells = Array.from({ length: GRID.rows }, () => Array<boolean>(GRID.columns).fill(true));
const spots: Spot[] = [{ kind: "sail", x: 110, y: 110, r: 30 }, { kind: "claw", x: 410, y: 510, r: 30 }, { kind: "eye", x: 690, y: 310, r: 30 }];
const dinosaur: DigDinosaur = { id: "spino", traits: ["sail"], spots, cells: allCells };
const dinosaurs = [dinosaur, { ...dinosaur, id: "rex", traits: [] }, { ...dinosaur, id: "raptor", traits: [] }];
const start = () => startRound(dinosaurs, [], undefined, () => 0, "paleontologist");
const find = (round: DigRound, at: number) => brushRound(round, { from: spots[at]!, to: spots[at]!, radius: 50 });
const uncovered = () => [0, 1, 2].reduce(find, start());

describe("Paleontologist's clue and distractor draws", () => {
  it("prioritises every shipped telling spot up to three, fills from others, and shuffles without changing data", () => {
    for (const dinosaur of SHIPPED_DIG) {
      const original = [...dinosaur.spots];
      for (const number of [0, 0.3, 0.7, 0.999]) {
        const clues = paleontologistSpots(dinosaur.spots, () => number);
        const telling = dinosaur.spots.filter(({ kind }) => TELLING_KINDS.includes(kind));
        expect(clues).toHaveLength(3);
        expect(new Set(kinds(clues)).size).toBe(3);
        expect(clues.every((spot) => dinosaur.spots.includes(spot))).toBe(true);
        expect(clues.filter(({ kind }) => TELLING_KINDS.includes(kind))).toHaveLength(Math.min(3, telling.length));
        const choices = choiceDinosaurs(dinosaur, clues, SHIPPED_DIG, () => number);
        expect(new Set(choices).size).toBe(3);
        expect(choices.filter((id) => id === dinosaur.id)).toHaveLength(1);
        const tellingClues = clues.filter(({ kind }) => TELLING_KINDS.includes(kind));
        for (const id of choices.filter((id) => id !== dinosaur.id)) {
          expect(tellingClues.length === 0 || tellingClues.some(({ kind }) => !shipped(id).traits.includes(kind))).toBe(true);
        }
      }
      expect(dinosaur.spots).toEqual(original);
    }
    const many = [...spots, { kind: "horn", x: 300, y: 300, r: 30 }, { kind: "frill", x: 400, y: 200, r: 30 }, { kind: "beak", x: 200, y: 200, r: 30 }] as Spot[];
    expect(kinds(paleontologistSpots(many, () => 0))).toEqual(["sail", "horn", "frill"]);
    expect(kinds(paleontologistSpots(many, () => 0.999))).toEqual(["horn", "frill", "beak"]);
    expect(kinds(paleontologistSpots(spots, () => 0))).toEqual(["sail", "claw", "eye"]);
    expect(kinds(paleontologistSpots(spots, () => 0.999))).toEqual(["claw", "eye", "sail"]);
    expect(choiceDinosaurs(dinosaur, spots, dinosaurs, () => 0)).toEqual(["spino", "rex", "raptor"]);
    expect(choiceDinosaurs(dinosaur, spots, dinosaurs, () => 0.999)).toEqual(["rex", "raptor", "spino"]);
  });

  it.each([
    ["spinosaurus", ["sail", "claw", "eye"], ["sail"]],
    ["triceratops", ["horn", "frill", "foot"], ["horn", "frill"]]
  ] as const)("uses the spec's %s example against traits, even traits outside a distractor's spots", (id, clueKinds, tells) => {
    const dinosaur = shipped(id);
    const clues = clueKinds.map((kind) => dinosaur.spots.find((spot) => spot.kind === kind)!);
    for (const number of [0, 0.5, 0.999]) {
      const choices = choiceDinosaurs(dinosaur, clues, SHIPPED_DIG, () => number);
      for (const other of choices.filter((choice) => choice !== id)) expect(tells.some((kind) => !shipped(other).traits.includes(kind))).toBe(true);
    }
    // A matching picture is ineligible even if its chosen spots omit the traits.
    const matching = { ...dinosaur, id: "matching", spots: shipped("tyrannosaurus").spots };
    expect(choiceDinosaurs(dinosaur, clues, [dinosaur, matching, ...SHIPPED_DIG.filter((d) => d.id !== id)], () => 0)).not.toContain("matching");
  });

  it("allows any two others when EYE, FOOT and TAIL tell nothing", () => {
    const dinosaur = shipped("tyrannosaurus");
    const clues = dinosaur.spots.filter(({ kind }) => kind !== "claw");
    for (const other of SHIPPED_DIG.filter(({ id }) => id !== dinosaur.id)) {
      const third = SHIPPED_DIG.find(({ id }) => id !== dinosaur.id && id !== other.id)!;
      expect(choiceDinosaurs(dinosaur, clues, [dinosaur, other, third], () => 0)).toEqual([dinosaur.id, other.id, third.id]);
    }
  });
});

describe("sequential finds and help", () => {
  it("remembers a later find, advances over it at once, and resets help only when the shown clue changes", () => {
    let round = waitForHelp(start(), 9000);
    round = find(round, 1);
    expect([clueIndex(round), round.found, round.quietMs]).toEqual([0, ["claw"], 9000]);
    round = waitForHelp(round, 1000);
    expect([round.helped, round.helpShown, round.sand.marks.length]).toEqual([["sail"], true, 1]);
    expect(awaitsHelp(round)).toBe(false);
    expect(waitForHelp(round, HELP_AFTER)).toBe(round);
    round = find(round, 0);
    expect([clueIndex(round), round.quietMs, round.blown]).toEqual([2, 0, false]);
    expect(awaitsHelp(round)).toBe(true);
    round = waitForHelp(round, HELP_AFTER - 1);
    expect(round.helped).toEqual(["sail"]);
    round = waitForHelp(round, 1);
    expect(round.helped).toEqual(["sail", "eye"]);
    const choice = find(round, 2);
    expect([clueIndex(choice), choosing(choice), choice.blown, awaitsHelp(choice)]).toEqual([3, true, false, false]);
    expect(brushRound(choice, { from: spots[0]!, to: spots[2]!, radius: 1000 })).toBe(choice);
  });

  it("never gusts at the free-brushing threshold or awards progress before the right pick", () => {
    const round = brushRound(start(), { from: { x: 0, y: 0 }, to: { x: 800, y: 600 }, radius: 1000 });
    expect([round.blown, choosing(round)]).toEqual([false, true]);
    expect(pickRound(start(), "spino")).toEqual(start());
    expect(pickRound(round, "unknown")).toBe(round);
    const wrong = pickRound(round, "rex");
    expect([wrong.blown, wrong.rejected]).toEqual([false, ["rex"]]);
    expect(pickRound(wrong, "rex")).toBe(wrong);
    const right = pickRound(wrong, "spino");
    expect([right.blown, right.rejected]).toEqual([true, ["rex"]]);
    expect(pickRound(right, "raptor")).toBe(right);
    expect(pickRound(uncovered(), "spino").rejected).toEqual([]);
  });
});
