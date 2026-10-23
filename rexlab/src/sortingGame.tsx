import { useCallback, useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { droppedOn, presentBoard, presentSortingResult } from "./presentation.ts";
import { startLevel, type LevelChoice } from "./startLevel.ts";
import { LevelResultScreen } from "./LevelResultScreen.tsx";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { bestForLevel, boardState, drop, finishBoard, mergeProgress, startBoard, type Dinosaur, type Random, type Sorting, type SortingProgress, type SortingResult } from "./sorting/index.ts";
import { SortScreen, type Basket } from "./SortScreen.tsx";

export type SortingSaved = { progress: SortingProgress; levelChoice: LevelChoice | undefined };

export type SortingProgressStore = {
  // The sorting game's progress kept so far, or undefined when it cannot
  // be read at all.
  load(): SortingSaved | undefined;
  save(saved: SortingSaved): void;
};

export type SortingGameProps = {
  // Every dinosaur a board may sort, with the facts it sorts by.
  sortables: readonly Dinosaur[];
  sortingProgress: SortingProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
};

// The dinosaur cheering the child on at the end of a board, as on the
// quiz's result.
const HERO = "tyrannosaurus";
const OFFERED = ["hatchling", "explorer", "paleontologist"] as const;

type Kept = { progress: SortingProgress | undefined; levelChoice: LevelChoice | undefined };

type SortingScreen = { kind: "board"; sorting: Sorting } | { kind: "result"; result: SortingResult };

// The screen the game shows, as the gate and the turns read it.
export type SortingPhase = SortingScreen["kind"];

// A board started, even over one left on HOME and still kept, or its
// result, is the plain screen change; a drop changes the board at once.
export function transitionFor(from: SortingScreen | undefined, to: SortingScreen | undefined, intent: "start" | undefined): string | undefined {
  return intent === "start" || from?.kind !== to?.kind ? SCREEN_CHANGE : undefined;
}

// The sorting game, kept by its owner above the orientation gate, so
// turning the iPad pauses a board without losing it. It shows nothing
// until a board is started. `onHome` takes the child back to the home
// page; `onStart` is told as each board begins.
export function useSortingGame(
  { sortables, sortingProgress, bodyPicture, random }: SortingGameProps,
  ageLevel: AgeLevelSetting,
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go } = useScreens<SortingScreen | undefined, "start">(undefined, transitionFor);
  // Keep this visit's choice and scores even when a save fails.
  const [kept, setKept] = useState<Kept>(() => {
    const stored = sortingProgress.load();
    return { progress: stored?.progress, levelChoice: stored?.levelChoice };
  });
  const keptNow = useRef(kept);
  const level = startLevel(ageLevel, OFFERED, kept.levelChoice);
  const refreshedProgress = (progress: SortingProgress | undefined) => {
    const stored = sortingProgress.load()?.progress;
    return stored === undefined ? undefined : progress === undefined ? stored : mergeProgress(progress, stored);
  };
  const keep = (next: Kept) => {
    const progress = refreshedProgress(next.progress);
    const merged = { ...next, progress: progress ?? next.progress };
    keptNow.current = merged;
    setKept(merged);
    if (progress !== undefined) sortingProgress.save({ progress, levelChoice: next.levelChoice });
  };
  const chooseLevel = (chosen: AgeLevel) => {
    if (chosen === startLevel(ageLevel, OFFERED, keptNow.current.levelChoice)) return;
    const levelChoice = { level: chosen, revision: ageLevel.revision };
    keep({ ...keptNow.current, levelChoice });
  };
  // The board last shown, so the next one sorts by another property. It
  // is kept only while the app is open.
  const last = useRef<Sorting | undefined>(undefined);

  // A new board shows at once, its pictures shimmering until they load,
  // and only over the screen it was asked from, so a second tap in the
  // same moment starts nothing more. `shown` runs in the same screen
  // change, so the owner can bring the game on screen with its board.
  const start = (shown?: () => void) => {
    const from = screen;
    const sorting = startBoard(sortables, startLevel(ageLevel, OFFERED, keptNow.current.levelChoice), random, last.current);
    go((current) => (current === from ? { kind: "board", sorting } : current), {
      intent: "start",
      also: () => {
        last.current = sorting;
        onStart();
        shown?.();
      }
    });
  };

  // Each drop moves from the board as it is, not as last rendered, so a
  // drop that lands after the board has moved on changes nothing. The
  // board listens for drags with it, so it stays the same function.
  const onDrop = useCallback(
    (id: string, basket: Basket) =>
      go((current) => (current?.kind === "board" ? { ...current, sorting: drop(current.sorting, id, droppedOn(basket)) } : current)),
    [go]
  );

  // A board is recorded only here, as its result is shown, so a board
  // left early changes nothing. Unreadable progress is not saved over.
  const seeResult = (finished: Sorting) => {
    const result = finishBoard(finished, refreshedProgress(keptNow.current.progress), beatBest);
    if (result.progress) keep({ ...keptNow.current, progress: result.progress });
    go({ kind: "result", result });
  };

  // `boardWidth` is the width a board stands in upright.
  const content = (language: Language, boardWidth: number) => {
    switch (screen?.kind) {
      case undefined:
        return null;
      case "board": {
        const { sorting } = screen;
        return (
          <SortScreen
            language={language}
            {...presentBoard(boardState(sorting), language, bodyPicture)}
            onDrop={onDrop}
            onHome={onHome}
            onSeeResult={() => seeResult(sorting)}
            width={boardWidth}
          />
        );
      }
      case "result":
        return (
          <LevelResultScreen
            language={language}
            {...presentSortingResult(screen.result)}
            hero={bodyPicture(HERO)}
            level={level}
            onLevel={chooseLevel}
            onPlayAgain={() => start()}
            onHome={onHome}
          />
        );
    }
  };

  const phase: SortingPhase | undefined = screen?.kind;

  return { start, content, phase, best: kept.progress === undefined ? undefined : bestForLevel(kept.progress, level) ?? undefined };
}
