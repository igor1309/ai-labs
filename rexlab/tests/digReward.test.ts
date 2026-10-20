import { describe, expect, it } from "vitest";
import { beatBest } from "../src/bestScore.ts";
import { digUp, dugUpOf, keepTreasure, mergeProgress, NO_DIG, treasuresFound, type KeptDig } from "../src/dig/index.ts";

// The dinosaurs a test's game ships, as their ids.
const IDS = ["stegosaurus", "triceratops", "tyrannosaurus", "ankylosaurus", "diplodocus"];

const kept = (dug: string[], badges: string[] = [], readable = true): KeptDig => ({ progress: { dug, badges, treasures: {} }, readable });

describe("a dinosaur dug up", () => {
  it("is kept with its star, the first one a first best", () => {
    expect(digUp(kept([]), "stegosaurus", IDS, beatBest)).toEqual({
      kept: kept(["stegosaurus"]),
      reward: { dugUp: 1, total: 5, newStar: true, celebration: "first-best", badge: false }
    });
  });

  it("for the first time grows the count, a new best", () => {
    const { kept: after, reward } = digUp(kept(["stegosaurus", "tyrannosaurus"]), "triceratops", IDS, beatBest);

    expect(after.progress.dug).toEqual(["stegosaurus", "tyrannosaurus", "triceratops"]);
    expect(reward).toEqual({ dugUp: 3, total: 5, newStar: true, celebration: "new-best", badge: false });
  });

  it("again earns no star and no celebration, and changes nothing kept", () => {
    const before = kept(["stegosaurus", "triceratops"], ["triceratops"]);
    const { kept: after, reward } = digUp(before, "triceratops", IDS, beatBest);

    expect(after).toEqual(before);
    expect(reward).toEqual({ dugUp: 2, total: 5, newStar: false, celebration: null, badge: true });
  });

  it.each([false, true])("keeps a first-pick badge once, including for an already dug dinosaur: %s", (alreadyDug) => {
    const before = kept(alreadyDug ? ["triceratops"] : []);
    const first = digUp(before, "triceratops", IDS, beatBest, true);
    expect(first.kept.progress).toEqual({ dug: ["triceratops"], badges: ["triceratops"], treasures: {} });
    expect(first.reward.badge).toBe(true);
    const again = digUp(first.kept, "triceratops", IDS, beatBest, true);
    expect(again.kept.progress.badges).toEqual(["triceratops"]);
    const wrongFirst = digUp(again.kept, "triceratops", IDS, beatBest, false);
    expect(wrongFirst.kept.progress.badges).toEqual(["triceratops"]);
    expect(wrongFirst.reward.badge).toBe(true);
    expect(before).toEqual(kept(alreadyDug ? ["triceratops"] : []));
  });

  it("is counted only among the dinosaurs still shipped", () => {
    const { reward } = digUp(kept(["stegosaurus", "a-dinosaur-no-longer-shipped"]), "triceratops", IDS, beatBest);

    expect([reward.dugUp, reward.celebration]).toEqual([2, "new-best"]);
  });

  it("as the last one completes the count", () => {
    expect(digUp(kept(IDS.slice(0, 4)), "diplodocus", IDS, beatBest).reward).toEqual({ dugUp: 5, total: 5, newStar: true, celebration: "new-best", badge: false });
  });

  it("is kept when stored progress cannot be read, with no count and no celebration", () => {
    const { kept: after, reward } = digUp(kept(["stegosaurus"], [], false), "triceratops", IDS, beatBest);

    expect(after).toEqual(kept(["stegosaurus", "triceratops"], [], false));
    expect(reward).toEqual({ dugUp: undefined, total: 5, newStar: true, celebration: null, badge: false });
  });
});

describe("the dinosaurs dug up", () => {
  it("count only those the app still ships", () => {
    expect(dugUpOf({ dug: ["stegosaurus", "a-dinosaur-no-longer-shipped", "triceratops"], badges: [], treasures: {} }, IDS)).toBe(2);
    expect(dugUpOf(NO_DIG, IDS)).toBe(0);
  });

  it("merge with those another tab saved meanwhile, each once", () => {
    expect(mergeProgress({ dug: ["stegosaurus", "triceratops"], badges: ["triceratops"], treasures: {} }, { dug: ["triceratops", "ankylosaurus"], badges: ["ankylosaurus"], treasures: {} })).toEqual({
      dug: ["stegosaurus", "triceratops", "ankylosaurus"],
      badges: ["triceratops", "ankylosaurus"],
      treasures: {}
    });
  });
});

describe("the treasures found", () => {
  it("are kept per kind with their counts, and counted over every kind", () => {
    const shell = keepTreasure(NO_DIG, "shell");
    const twice = keepTreasure(keepTreasure(shell, "golden-fossil"), "shell");

    expect([NO_DIG.treasures, shell.treasures, twice.treasures]).toEqual([{}, { shell: 1 }, { shell: 2, "golden-fossil": 1 }]);
    expect([treasuresFound(NO_DIG), treasuresFound(shell), treasuresFound(twice)]).toEqual([0, 1, 3]);
    expect([twice.dug, twice.badges]).toEqual([[], []]);
  });

  it("stay kept as a dinosaur is dug up", () => {
    const before: KeptDig = { progress: { dug: [], badges: [], treasures: { amber: 2 } }, readable: true };

    expect(digUp(before, "stegosaurus", IDS, beatBest, true).kept.progress).toEqual({ dug: ["stegosaurus"], badges: ["stegosaurus"], treasures: { amber: 2 } });
  });

  it("merge with those another tab saved meanwhile, each kind at the larger count", () => {
    expect(mergeProgress(
      { dug: [], badges: [], treasures: { shell: 3, tooth: 1 } },
      { dug: [], badges: [], treasures: { shell: 2, "egg-nest": 1 } }
    ).treasures).toEqual({ shell: 3, tooth: 1, "egg-nest": 1 });
  });
});
