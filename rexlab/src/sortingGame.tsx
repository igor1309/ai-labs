import { useCallback, useRef, useState } from "react";
import type { Language } from "./language/language.ts";
import { droppedOn, presentBoard, presentSortingResult } from "./presentation.ts";
import { ResultScreen } from "./ResultScreen.tsx";
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";
import { boardState, drop, finishBoard, startBoard, type Dinosaur, type Random, type Sorting, type SortingProgress, type SortingResult } from "./sorting/index.ts";
import { SortScreen, type Basket } from "./SortScreen.tsx";

export type SortingProgressStore = {
  // The sorting game's progress kept so far, or undefined when it cannot
  // be read at all.
  load(): SortingProgress | undefined;
  save(progress: SortingProgress): void;
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

type SortingScreen = { kind: "board"; sorting: Sorting } | { kind: "result"; result: SortingResult };

// The sorting game, kept by its owner above the orientation gate, so
// turning the iPad pauses a board without losing it. It shows nothing
// until a board is started. `onHome` takes the child back to the home
// page.
export function useSortingGame({ sortables, sortingProgress, bodyPicture, random }: SortingGameProps, onHome: () => void) {
  const [screen, setScreen] = useState<SortingScreen>();
  // The board last started, so the next one sorts by another property.
  const last = useRef<Sorting | undefined>(undefined);

  const show = (next: SortingScreen) => changeScreen(SCREEN_CHANGE, () => setScreen(next));

  const start = () => {
    const sorting = startBoard(sortables, random, last.current);
    last.current = sorting;
    show({ kind: "board", sorting });
  };

  // Each drop moves from the board as it is, not as last rendered, so a
  // drop that lands after the board has moved on changes nothing. The
  // board listens for drags with it, so it stays the same function.
  const onDrop = useCallback(
    (id: string, basket: Basket) =>
      setScreen((current) => (current?.kind === "board" ? { ...current, sorting: drop(current.sorting, id, droppedOn(basket)) } : current)),
    []
  );

  // A board is recorded only here, as its result is shown, so a board
  // left early changes nothing. Unreadable progress is not saved over.
  const seeResult = (finished: Sorting) => {
    const result = finishBoard(finished, sortingProgress.load());
    if (result.progress) sortingProgress.save(result.progress);
    show({ kind: "result", result });
  };

  const content = (language: Language) => {
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
          />
        );
      }
      case "result":
        return (
          <ResultScreen
            language={language}
            {...presentSortingResult(screen.result)}
            hero={bodyPicture(HERO)}
            onPlayAgain={start}
            onHome={onHome}
          />
        );
    }
  };

  return { start, content };
}
