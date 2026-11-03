import { join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { HomeGame } from "../src/HomePage.tsx";
import { HOME_TILE_PICTURES } from "../src/homeTilePictures.ts";

const root = join(import.meta.dirname, "..");
const design = JSON.parse(readFileSync(join(root, "design/dig-site.pen"), "utf8"));
const GAME_BY_LABEL: Record<string, HomeGame> = {
  EXPLORE: "compare", PAIRS: "pairs", BONES: "skeletons", DIG: "dig", SORT: "sort", CARE: "care",
  DRAW: "sandWriting", MAZE: "labyrinth", PUZZLE: "picturePuzzle", TEETH: "whoseJaw", COLOR: "coloring"
};

// Each game's tile picture in the design, by game, from every Home frame.
function designTilePictures() {
  const pictures = new Map<HomeGame, Set<string>>();
  const walk = (node: { name?: string; descendants?: Record<string, { fill?: { url?: string } }>; children?: unknown[] }) => {
    const label = node.name?.match(/^Tile · (\w+)$/)?.[1];
    const game = label && GAME_BY_LABEL[label];
    const url = Object.values(node.descendants ?? {}).find((part) => part.fill?.url?.startsWith("images/home-tile-"))?.fill?.url;
    if (game && url) pictures.set(game, (pictures.get(game) ?? new Set()).add(url));
    for (const child of (node.children ?? []) as (typeof node)[]) walk(child);
  };
  for (const child of design.children) walk(child);
  return pictures;
}

const bytes = (path: string) => readFileSync(path).toString("base64");

test("Home's tiles show the pictures the design draws in them", () => {
  const drawn = designTilePictures();
  expect([...drawn.keys()].sort()).toEqual(Object.keys(HOME_TILE_PICTURES).sort());
  for (const [game, urls] of drawn) {
    expect([...urls], game).toHaveLength(1);
    const shipped = HOME_TILE_PICTURES[game]!;
    expect(bytes(join(root, shipped.replace(/^\//, "").replace(/\?.*$/, ""))), game).toBe(bytes(join(root, "design", [...urls][0]!)));
  }
});
