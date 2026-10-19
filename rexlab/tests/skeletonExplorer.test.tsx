import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import type { Theme } from "../src/theme.ts";
import { AWAY, board, dragTo, fit, fittedPieces, homeOf, openPuzzle, reveal, revealNow, savedSkeletons, skeletonOf, slotOf, slots, spotOf, spotPieces, tray, trayPieces } from "./skeletonsApp.tsx";
import { PALETTE, contrast, memoryStorage, sameColour } from "./support.ts";

// skeleton-assembly-explorer.feature: Explorer's own cut, each piece and
// its empty slot coloured by its body area.

const levelOf = (level: AgeLevel) => memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: `picked-${level}` }) });

const openExplorer = (name: string, appearance: Theme = "light", storage = memoryStorage()) => openPuzzle(name, { ageLevels: levelOf("explorer"), appearance, storage });

// The body area each spot in the tray and each slot on the outline is
// coloured by, none for a plain one.
const spotAreas = () => spotPieces().map((piece) => spotOf(piece).getAttribute("data-area"));
const slotAreas = () => slots().map(([piece]) => slotOf(piece ?? "").getAttribute("data-area"));

// The bone's shape a coloured slot shows, if any.
const shapeOf = (piece: string) => slotOf(piece).querySelector<HTMLElement>(".skeleton-slot-area");

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

  it("tints each piece's spot and shapes its empty slot by its body area, the two legs alike and different areas apart", async () => {
    await openExplorer("TYRANNOSAURUS");

    const areas = (skeletonOf("tyrannosaurus").cuts.explorer ?? []).map((piece) => piece.area);
    expect(spotAreas()).toEqual(areas);
    expect(slotAreas()).toEqual(areas);
    expect(areas).toEqual(["head", "neck", "back", "hips", "legs", "legs", "tail"]);
    expect(spotPieces().map((piece) => shapeOf(piece)?.style.getPropertyValue("--piece-picture"))).toEqual(spotPieces().map((piece) => `url("/skeletons/tyrannosaurus/${piece}.webp")`));
    const tints = spotPieces().map((piece) => getComputedStyle(spotOf(piece)).backgroundColor);
    expect(tints[4]).toBe(tints[5]);
    expect(new Set(tints).size).toBe(6);
  });

  it("shows a fitted piece as itself, its spot empty and plain, every other piece keeping its colour", async () => {
    await openExplorer("TYRANNOSAURUS");

    fit(skeletonOf("tyrannosaurus"), "head");

    expect(fittedPieces()).toEqual(["head"]);
    expect([slotOf("head").getAttribute("data-area"), shapeOf("head"), slotOf("head").querySelector(".skeleton-fitted-picture")?.getAttribute("alt")]).toEqual([null, null, "SKULL"]);
    expect(spotOf("head").getAttribute("data-area")).toBeNull();
    expect(spotAreas().slice(1)).toEqual(["neck", "back", "hips", "legs", "legs", "tail"]);
    expect(slots().slice(1).map(([piece]) => shapeOf(piece ?? "") !== null)).toEqual([true, true, true, true, true, true]);
  });

  it.each<Theme>(["light", "dark"])("colours each area in the %s theme's own colours, its ring at least 3:1 with the tray", async (theme) => {
    await openExplorer("STEGOSAURUS", theme);

    const trayColour = getComputedStyle(tray()).backgroundColor;
    const seen = spotPieces().map((piece) => {
      const area = spotOf(piece).getAttribute("data-area") ?? "";
      const spot = getComputedStyle(spotOf(piece));
      return {
        piece,
        tint: sameColour(spot.backgroundColor, PALETTE[theme][`area-${area}-tint`] ?? ""),
        ring: sameColour(spot.outlineColor, PALETTE[theme][`area-${area}`] ?? "") && contrast(PALETTE[theme][`area-${area}`] ?? "", trayColour) >= 3,
        shape: sameColour(getComputedStyle(shapeOf(piece) ?? board()).backgroundColor, PALETTE[theme][`area-${area}`] ?? "")
      };
    });

    expect(seen).toEqual(spotPieces().map((piece) => ({ piece, tint: true, ring: true, shape: true })));
  });

  it("fits a piece dropped 40 CSS pixels from its home, and floats one dropped beside the board back to its tinted spot", async () => {
    await openExplorer("TRICERATOPS");
    const triceratops = skeletonOf("triceratops");

    dragTo("frill", homeOf(triceratops, "frill", 40, 0));
    dragTo("tail-bones", AWAY);

    expect(fittedPieces()).toEqual(["frill"]);
    expect([spotOf("tail-bones").getAttribute("data-area"), spotOf("tail-bones").querySelector(".skeleton-piece[data-returning]") !== null]).toEqual(["tail", true]);
  });

  it("fits a piece by its place alone, never on another slot of its colour", async () => {
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

describe("the other levels", () => {
  it.each<[AgeLevel, number]>([
    ["hatchling", 4],
    ["paleontologist", 10]
  ])("build %s's puzzle of %i plain pieces", async (level, count) => {
    await openPuzzle("TRICERATOPS", { ageLevels: levelOf(level) });

    expect(slots().map(([piece]) => piece)).toEqual((skeletonOf("triceratops").cuts[level] ?? []).map(({ id }) => id));
    expect(slotAreas()).toEqual(Array(count).fill(null));
    expect(spotAreas().filter((area) => area !== null)).toEqual([]);
    expect(document.querySelectorAll(".skeleton-slot-area")).toHaveLength(0);
  });
});
