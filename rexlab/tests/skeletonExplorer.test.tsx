import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import type { Theme } from "../src/theme.ts";
import { AWAY, dragTo, fit, fittedPieces, homeOf, openPuzzle, reveal, revealNow, savedSkeletons, skeletonOf, slotOf, spotOf, spotPieces, trayPieces } from "./skeletonsApp.tsx";
import { memoryStorage } from "./support.ts";

// skeleton-assembly-explorer.feature: Explorer's own cut, its pieces and
// slots plain, each placed by its shape.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

const openExplorer = (name: string, appearance: Theme = "light", storage = memoryStorage()) => openPuzzle(name, { ageLevels: levelOf("explorer"), appearance, storage });

const counter = () => screen.getByLabelText(TEXTS.en.fitted).textContent;

describe("Explorer's puzzle", () => {
  it.each([
    ["TYRANNOSAURUS", "tyrannosaurus", 7],
    ["TRICERATOPS", "triceratops", 6],
    ["STEGOSAURUS", "stegosaurus", 7]
  ] as const)("is %s's own cut, its pieces in the tray in its order", async (name, id, count) => {
    await openExplorer(name);

    const cut = skeletonOf(id).cuts.explorer ?? [];
    expect(cut).toHaveLength(count);
    expect(spotPieces()).toEqual(cut.map((piece) => piece.id));
    expect(trayPieces()).toEqual(cut.map((piece) => piece.name.en));
    expect(counter()).toBe(`0/${count}`);
  });

  it.each<Theme>(["light", "dark"])("shows every spot and slot plain in the %s theme, nothing tinted by body area", async (theme) => {
    await openExplorer("TYRANNOSAURUS", theme);

    const tints = spotPieces().map((piece) => getComputedStyle(spotOf(piece)).backgroundColor);
    expect(new Set(tints).size).toBe(1);
    expect(document.querySelectorAll(".skeleton-slot-area, .skeleton-tray-spot[data-area]")).toHaveLength(0);
  });

  it("fits a piece dropped 40 CSS pixels from its home, and floats one dropped beside the board back to its spot", async () => {
    await openExplorer("TRICERATOPS");
    const triceratops = skeletonOf("triceratops");

    dragTo("frill", homeOf(triceratops, "frill", 40, 0));
    dragTo("tail-bones", AWAY);

    expect(fittedPieces()).toEqual(["frill"]);
    expect(spotOf("tail-bones").querySelector(".skeleton-piece[data-returning]")).not.toBeNull();
  });

  it("fits a piece by its place alone, never on another slot of its body area", async () => {
    await openExplorer("TRICERATOPS");

    dragTo("front-legs", homeOf(skeletonOf("triceratops"), "hind-legs"));

    expect(fittedPieces()).toEqual([]);
    expect(slotOf("hind-legs").getAttribute("data-state")).toBe("empty");
  });

  it("earns the star once its last piece fits, as at Hatchling", async () => {
    const storage = memoryStorage();
    const { pictures } = await openExplorer("STEGOSAURUS", "light", storage);
    const stegosaurus = skeletonOf("stegosaurus");
    const [last = "", ...others] = [...spotPieces()].reverse();
    for (const piece of others.reverse()) fit(stegosaurus, piece);
    expect(counter()).toBe("6/7");

    fit(stegosaurus, last);
    expect(counter()).toBe("7/7");
    revealNow(pictures, "stegosaurus");

    expect(reveal()).not.toBeNull();
    expect(savedSkeletons(storage)).toEqual({ earned: ["stegosaurus"], bestScore: 1, rebuilding: [], badges: { stegosaurus: ["explorer"] } });
  });
});
