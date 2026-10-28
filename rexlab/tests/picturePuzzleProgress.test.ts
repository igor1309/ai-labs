import { describe, expect, it } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { NO_PICTURES, PICTURE_DINOSAURS, finishPicture, mergePictures, startPicturePuzzle, type BeatBest, type PictureDinosaurId, type PicturePuzzle } from "../src/picturePuzzle/index.ts";
import { scoringSpy } from "./support.ts";

function finished(id: PictureDinosaurId, level: PicturePuzzle["level"]): PicturePuzzle {
  const puzzle = startPicturePuzzle({ id, name: { en: id, ru: id } }, level, () => 0);
  return { ...puzzle, fitted: puzzle.order };
}

describe("picture collection rewards", () => {
  it.each(AGE_LEVELS)("awards distinct dinosaurs at %s, keeping independent level bests and a shared union", (level) => {
    let kept = { progress: NO_PICTURES, readable: true };
    for (const [index, id] of PICTURE_DINOSAURS.entries()) {
      const scoring = scoringSpy<ReturnType<BeatBest>>({ best: index + 1, celebration: index === 0 ? "first-best" : "new-best" });
      const outcome = finishPicture(kept, finished(id, level), scoring.beatBest);
      expect(scoring.asked).toEqual([[index === 0 ? null : index, index + 1]]);
      expect(outcome.result).toMatchObject({ level, score: index + 1, shared: index + 1, best: index + 1,
        previousBest: index === 0 ? undefined : index, celebration: index === 0 ? "first-best" : "new-best" });
      expect(outcome.kept.progress.earned).toEqual(PICTURE_DINOSAURS.slice(0, index + 1));
      expect(outcome.kept.progress.completed).toEqual({ ...NO_PICTURES.completed, [level]: PICTURE_DINOSAURS.slice(0, index + 1) });
      const replayScoring = scoringSpy({ best: index + 1, celebration: null });
      const replay = finishPicture(outcome.kept, finished(id, level), replayScoring.beatBest);
      expect(replayScoring.asked).toEqual([[index + 1, index + 1]]);
      expect(replay.result).toMatchObject({ score: index + 1, best: index + 1, celebration: null });
      expect(replay.kept.progress).toEqual(outcome.kept.progress);
      kept = replay.kept;
    }
    for (const other of AGE_LEVELS.filter((each) => each !== level)) {
      const scoring = scoringSpy({ best: 1, celebration: "first-best" as const });
      const next = finishPicture(kept, finished("tyrannosaurus", other), scoring.beatBest);
      expect(scoring.asked).toEqual([[null, 1]]);
      expect(next.result).toMatchObject({ level: other, score: 1, shared: 3, best: 1, celebration: "first-best" });
      expect(next.kept.progress.completed[level]).toEqual(PICTURE_DINOSAURS);
    }
  });

  it.each(AGE_LEVELS)("keeps session rewards at %s without claiming an unreadable historical best", (level) => {
    let kept = { progress: NO_PICTURES, readable: false };
    for (const id of PICTURE_DINOSAURS) {
      const scoring = scoringSpy({ best: 3, celebration: "new-best" as const });
      const outcome = finishPicture(kept, finished(id, level), scoring.beatBest);
      expect(outcome.result).toMatchObject({ best: undefined, previousBest: undefined, celebration: null });
      expect(outcome.result.score).toBe(outcome.kept.progress.completed[level].length);
      expect(outcome.kept.progress.earned).toContain(id);
      kept = outcome.kept;
    }
    expect(kept.progress.earned).toEqual(PICTURE_DINOSAURS);
  });

  it("rejects an unfinished picture without changing progress", () => {
    const puzzle = finished("tyrannosaurus", "hatchling");
    const scoring = scoringSpy({ best: 1, celebration: null });
    expect(() => finishPicture({ progress: NO_PICTURES, readable: true }, { ...puzzle, fitted: puzzle.fitted.slice(1) }, scoring.beatBest)).toThrow("every piece fits");
    expect(scoring.asked).toEqual([]);
    expect(NO_PICTURES.earned).toEqual([]);
  });

  it("merges collections monotonically and repairs their shared union", () => {
    const scoring = scoringSpy({ best: 1, celebration: null });
    const first = finishPicture({ progress: NO_PICTURES, readable: true }, finished("tyrannosaurus", "hatchling"), scoring.beatBest).kept.progress;
    const second = finishPicture({ progress: NO_PICTURES, readable: true }, finished("triceratops", "explorer"), scoring.beatBest).kept.progress;
    const merged = mergePictures(first, second);
    expect(merged).toEqual({ earned: ["tyrannosaurus", "triceratops"], completed: { hatchling: ["tyrannosaurus"], explorer: ["triceratops"], paleontologist: [] } });
    expect(mergePictures(merged, first)).toEqual(merged);
    expect(mergePictures(merged, second)).toEqual(merged);
  });

  it.each(["tyrannosaurus", "triceratops"] as const)("uses the supplied best and celebration when finishing %s", (id) => {
    const progress = { earned: ["tyrannosaurus"] as const,
      completed: { ...NO_PICTURES.completed, explorer: ["tyrannosaurus"] as const } };
    const scoring = scoringSpy({ best: 3, celebration: "first-best" as const });
    const { result } = finishPicture({ progress, readable: true }, finished(id, "explorer"), scoring.beatBest);
    const score = id === "tyrannosaurus" ? 1 : 2;
    expect(scoring.asked).toEqual([[1, score]]);
    expect(result).toMatchObject({ score, shared: score, previousBest: 1, best: 3, celebration: "first-best" });
  });
});
