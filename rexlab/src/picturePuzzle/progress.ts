import type { AgeLevel } from "../ageLevel.ts";
import { PICTURE_DINOSAURS, pictureComplete, type PictureDinosaur, type PictureDinosaurId, type PicturePuzzle } from "./puzzle.ts";

export type PictureProgress = {
  earned: readonly PictureDinosaurId[];
  completed: Record<AgeLevel, readonly PictureDinosaurId[]>;
};

export const NO_PICTURES: PictureProgress = {
  earned: [], completed: { hatchling: [], explorer: [], paleontologist: [] }
};

export type KeptPictures = { progress: PictureProgress; readable: boolean };
export type BeatBest = (previous: number | null, score: number) => {
  best: number;
  celebration: "first-best" | "new-best" | null;
};
export type PictureResult = {
  dinosaur: PictureDinosaur;
  level: AgeLevel;
  score: number;
  shared: number;
  best: number | undefined;
  previousBest: number | undefined;
  celebration: "first-best" | "new-best" | null;
};

// Collections only grow. The fixed picture order removes duplicates and
// prevents retired or malformed ids from inflating a collection score.
export function collectedPictures(ids: readonly string[]): PictureDinosaurId[] {
  return PICTURE_DINOSAURS.filter((id) => ids.includes(id));
}

export function mergePictures(one: PictureProgress, other: PictureProgress): PictureProgress {
  const completed = {
    hatchling: collectedPictures([...one.completed.hatchling, ...other.completed.hatchling]),
    explorer: collectedPictures([...one.completed.explorer, ...other.completed.explorer]),
    paleontologist: collectedPictures([...one.completed.paleontologist, ...other.completed.paleontologist])
  };
  return {
    earned: collectedPictures([...one.earned, ...other.earned, ...Object.values(completed).flat()]),
    completed
  };
}

export function finishPicture(kept: KeptPictures, puzzle: PicturePuzzle, beatBest: BeatBest): { kept: KeptPictures; result: PictureResult } {
  if (!pictureComplete(puzzle)) throw new Error("A picture is finished only once every piece fits");
  const previous = kept.progress.completed[puzzle.level].length;
  const progress = mergePictures(kept.progress, {
    earned: [puzzle.dinosaur.id],
    completed: { ...NO_PICTURES.completed, [puzzle.level]: [puzzle.dinosaur.id] }
  });
  const score = progress.completed[puzzle.level].length;
  const beaten = beatBest(previous === 0 ? null : previous, score);
  return {
    kept: { progress, readable: kept.readable },
    result: {
      dinosaur: puzzle.dinosaur, level: puzzle.level, score, shared: progress.earned.length,
      best: kept.readable ? beaten.best : undefined,
      previousBest: kept.readable && previous > 0 ? previous : undefined,
      celebration: kept.readable ? beaten.celebration : null
    }
  };
}
