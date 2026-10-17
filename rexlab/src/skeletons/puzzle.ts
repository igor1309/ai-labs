import type { Language } from "../language/language.ts";

// The pieces every skeleton is built from, in the order the tray shows
// them: at the first level the spine carries the neck and ribs, and the
// legs piece all four or both legs.
export const PIECES = ["skull", "spine", "legs", "tail"] as const;

export type Piece = (typeof PIECES)[number];

// A piece's home on the outline, in pixels of the skeleton's frame.
export type Place = { x: number; y: number; width: number; height: number };

export type Skeleton = {
  id: string;
  name: Record<Language, string>;
  // The frame the outline is drawn in, which the dinosaur's body picture
  // shares, and each piece's home in it.
  frame: { width: number; height: number };
  places: Record<Piece, Place>;
};

export type Puzzle = {
  skeleton: Skeleton;
  // The pieces fitted on the outline, in the order they were fitted.
  fitted: readonly Piece[];
};

// A puzzle starts with every piece in the tray, the right way up.
export function startPuzzle(skeleton: Skeleton): Puzzle {
  return { skeleton, fitted: [] };
}
