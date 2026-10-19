import { useCallback, useRef } from "react";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { droppedOn, presentBoard, presentSortingResult } from "./presentation.ts";
import { ResultScreen } from "./ResultScreen.tsx";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
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
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go } = useScreens<SortingScreen | undefined, "start">(undefined, transitionFor);
  // The board last shown, so the next one sorts by another property. It
  // is kept only while the app is open.
  const last = useRef<Sorting | undefined>(undefined);

  // A new board shows at once, its pictures shimmering until they load,
  // and only over the screen it was asked from, so a second tap in the
  // same moment starts nothing more. `shown` runs in the same screen
  // change, so the owner can bring the game on screen with its board.
  const start = (shown?: () => void) => {
    const from = screen;
    const sorting = startBoard(sortables, random, last.current);
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
    const result = finishBoard(finished, sortingProgress.load(), beatBest);
    if (result.progress) sortingProgress.save(result.progress);
    go({ kind: "result", result });
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
            onPlayAgain={() => start()}
            onHome={onHome}
          />
        );
    }
  };

  return { start, content };
}
