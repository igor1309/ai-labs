import { useCallback, useRef } from "react";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
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
  loadPicture: LoadPicture;
  startTimer: StartTimer;
};

// The dinosaur cheering the child on at the end of a board, as on the
// quiz's result.
const HERO = "tyrannosaurus";

// The longest a board waits for its pictures, in milliseconds, as a
// question does for its pictures.
const PICTURE_WAIT = 1000;

type SortingScreen = { kind: "board"; sorting: Sorting } | { kind: "result"; result: SortingResult };

// A drop changes the board at once; a board shown, or its result, is the
// plain screen change.
export function transitionFor(from: SortingScreen | undefined, to: SortingScreen | undefined): string | undefined {
  return from?.kind === to?.kind ? undefined : SCREEN_CHANGE;
}

// The sorting game, kept by its owner above the orientation gate, so
// turning the iPad pauses a board without losing it. It shows nothing
// until a board is started. `onHome` takes the child back to the home
// page; `onStart` is told as each board begins.
export function useSortingGame(
  { sortables, sortingProgress, bodyPicture, random, loadPicture, startTimer }: SortingGameProps,
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go } = useScreens<SortingScreen | undefined>(undefined, transitionFor);
  // The board last shown, so the next one sorts by another property. It
  // is kept only while the app is open.
  const last = useRef<Sorting | undefined>(undefined);
  // A board being started while its pictures load: a second tap meanwhile
  // starts nothing more.
  const starting = useRef(false);
  // Counts each time the child leaves the game or a board being started is
  // cancelled, so pictures that finish loading after the child has gone
  // elsewhere show no board.
  const stay = useRef(0);

  // A new board shows once its six pictures are ready, or the wait runs
  // out, so none pops in. `shown` runs in the same screen change, so the
  // owner can bring the game on screen with its board.
  const start = (shown?: () => void) => {
    if (starting.current) return;
    starting.current = true;
    const visiting = stay.current;
    const sorting = startBoard(sortables, random, last.current);
    const pictures = boardState(sorting).cards.map(({ dinosaur }) => bodyPicture(dinosaur.id));
    waitForPictures(pictures, { loadPicture, startTimer, limit: PICTURE_WAIT }, () => {
      if (stay.current !== visiting) return;
      starting.current = false;
      last.current = sorting;
      onStart();
      go({ kind: "board", sorting }, { also: shown });
    });
  };

  // Drops the board being started, if any: its pictures, once ready, show
  // nothing, and the next start waits for its own.
  const cancel = () => {
    stay.current++;
    starting.current = false;
  };

  const home = () => {
    cancel();
    onHome();
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
            onHome={home}
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
            onHome={home}
          />
        );
    }
  };

  return { start, cancel, content };
}
