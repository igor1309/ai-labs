import { describe, expect, it } from "vitest";
import { beatBest } from "../src/bestScore.ts";
import { digUp, dugUpOf, mergeProgress, NO_DIG, type KeptDig } from "../src/dig/index.ts";

// The dinosaurs a test's game ships, as their ids.
const IDS = ["stegosaurus", "triceratops", "tyrannosaurus", "ankylosaurus", "diplodocus"];

const kept = (dug: string[], badges: string[] = [], readable = true): KeptDig => ({ progress: { dug, badges }, readable });

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
    expect(dugUpOf({ dug: ["stegosaurus", "a-dinosaur-no-longer-shipped", "triceratops"], badges: [] }, IDS)).toBe(2);
    expect(dugUpOf(NO_DIG, IDS)).toBe(0);
  });

  it("merge with those another tab saved meanwhile, each once", () => {
    expect(mergeProgress({ dug: ["stegosaurus", "triceratops"], badges: ["triceratops"] }, { dug: ["triceratops", "ankylosaurus"], badges: ["ankylosaurus"] })).toEqual({
      dug: ["stegosaurus", "triceratops", "ankylosaurus"],
      badges: ["triceratops", "ankylosaurus"]
    });
  });
});
