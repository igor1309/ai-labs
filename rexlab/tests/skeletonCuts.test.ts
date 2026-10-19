import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import skeletonPlaces from "../src/data/skeletons.json";

const ROOT = resolve(import.meta.dirname, "..");

const LEVELS = ["hatchling", "explorer", "paleontologist"] as const;

type Point = [number, number];
type CutPiece = { id: string; from: string; area: string; name: { en: string; ru: string }; region?: Point[][] };
type CutLines = Record<string, Record<(typeof LEVELS)[number], CutPiece[]>>;

// The cut lines scripts/cut-skeleton.py cuts the pieces by (art/skeletons.md).
const CUT_LINES = JSON.parse(readFileSync(resolve(ROOT, "art/skeleton-cuts.json"), "utf8")) as CutLines;

const places = skeletonPlaces as { dinosaurs: Record<string, { cuts: Record<string, { id: string; area: string; name: unknown }[]> }> };

describe("the skeletons' cut lines", () => {
  it("give every skeleton in the game its cut lines, and none of a skeleton not in it", () => {
    expect(Object.keys(CUT_LINES)).toEqual(Object.keys(places.dinosaurs));
  });

  it("describe each level's pieces as the game has them: the same ids, in order, with their areas and names", () => {
    for (const [id, entry] of Object.entries(places.dinosaurs)) {
      for (const level of LEVELS) {
        const described = CUT_LINES[id]?.[level].map(({ id, area, name }) => ({ id, area, name }));
        expect(described, `${id} ${level}`).toEqual(entry.cuts[level]?.map(({ id, area, name }) => ({ id, area, name })));
      }
    }
  });

  it("cut every bone: each piece of a level, or the whole skeleton for Hatchling, is the source of the next level's pieces, one of them taking its rest", () => {
    for (const [id, levels] of Object.entries(CUT_LINES)) {
      let sources = ["skeleton"];
      for (const level of LEVELS) {
        const pieces = levels[level];
        for (const source of sources) {
          const from = pieces.filter((piece) => piece.from === source);
          expect(from.length, `${id} ${level}: pieces cut from ${source}`).toBeGreaterThan(0);
          expect(from.filter((piece) => piece.region === undefined).length, `${id} ${level}: pieces taking the rest of ${source}`).toBe(1);
        }
        for (const piece of pieces) expect(sources, `${id} ${level} ${piece.id}'s source`).toContain(piece.from);
        sources = pieces.map((piece) => piece.id);
      }
    }
  });

  it("draw each region as polygons of at least three points within the 800x600 frame", () => {
    for (const [id, levels] of Object.entries(CUT_LINES)) {
      for (const level of LEVELS) {
        for (const { id: piece, region } of levels[level]) {
          for (const polygon of region ?? []) {
            expect(polygon.length, `${id} ${level} ${piece}`).toBeGreaterThanOrEqual(3);
            for (const [x, y] of polygon) expect(x >= 0 && x <= 800 && y >= 0 && y <= 600, `${id} ${level} ${piece} at ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });
});
