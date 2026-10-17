import { useRef, useState } from "react";
import type { Language } from "./language/language.ts";
import {
  dealBoard,
  finishBoard,
  foundOf,
  isFinished,
  isMiss,
  NO_PAIRS,
  turn,
  turnBack,
  type Board,
  type KeptPairs,
  type Pal,
  type PairsProgress,
  type PairsResult,
  type Random
} from "./pairs/index.ts";
import { PairsBoardScreen } from "./PairsBoardScreen.tsx";
import { PairsResultScreen } from "./PairsResultScreen.tsx";
import { PairsWelcomeScreen } from "./PairsWelcomeScreen.tsx";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
import { presentPairsBoard, presentPairsResult } from "./presentation.ts";
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";

export type PairsProgressStore = {
  // The find-the-pair progress kept so far, or undefined when it cannot be
  // read at all.
  load(): PairsProgress | undefined;
  save(progress: PairsProgress): void;
};

export type PairsGameProps = {
  // Every dinosaur that may be dealt, in the shared dinosaur list's order.
  pals: readonly Pal[];
  pairsProgress: PairsProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
  loadPicture: LoadPicture;
  startTimer: StartTimer;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
};

// The dinosaur on the welcome screen's cards.
const HERO = "triceratops";

// The longest a board waits for its pictures, in milliseconds, as a
// question does for its pictures.
const PICTURE_WAIT = 1000;

// How long a miss stays open before it turns back, in milliseconds, the
// same with reduced motion: long enough to see both cards. And how long
// the cards wave before the result, as app.css times them: after the last
// flip (--motion-standard), staggered over up to 12 cards (11 ×
// --motion-stagger), each for --motion-screen; with reduced motion only
// the fades the tokens leave.
const TIMINGS: Record<"motion" | "reduced", { miss: number; finish: number }> = {
  motion: { miss: 1000, finish: 1000 },
  reduced: { miss: 1000, finish: 320 }
};

type PairsScreen = { kind: "welcome" } | { kind: "board"; board: Board; finished: boolean } | { kind: "result"; result: PairsResult };

// Find the pair, kept by the app above its orientation gate, so turning
// the iPad pauses a board without losing it. `onHome` takes the child
// back to the home page.
export function usePairsGame({ pals, pairsProgress, bodyPicture, random, loadPicture, startTimer, reducedMotion }: PairsGameProps, onHome: () => void) {
  const [screen, setScreen] = useState<PairsScreen>({ kind: "welcome" });
  // Progress is read once, as the app opens. When it cannot be read there
  // is no best to compare with, but stars, levels and dinosaurs found
  // meanwhile are still kept while the app is open, and so is progress
  // that cannot be saved.
  const [kept, setKept] = useState<KeptPairs>(() => {
    const stored = pairsProgress.load();
    return { progress: stored ?? NO_PAIRS, readable: stored !== undefined };
  });
  const keptNow = useRef(kept);
  // The board in play, ahead of the screen: a second tap, or a timer, acts
  // on the board as it is, not as last rendered. Null once the child
  // leaves it.
  const live = useRef<Board | null>(null);
  // A board being dealt while its pictures load: a second tap meanwhile
  // deals nothing more.
  const starting = useRef(false);
  // Counts each time the child leaves the game, so pictures that finish
  // loading after the child has left deal no board.
  const stay = useRef(0);
  // The board dealt last, so the next one deals other dinosaurs.
  const lastBoard = useRef<Board | undefined>(undefined);

  const show = (next: PairsScreen) => changeScreen(SCREEN_CHANGE, () => setScreen(next));

  const timings = () => TIMINGS[reducedMotion() ? "reduced" : "motion"];

  const leave = () => {
    stay.current++;
    live.current = null;
    starting.current = false;
  };

  // A board is dealt at the level reached, and shows once its pictures
  // are ready, or the wait runs out, only if the child is still here.
  const play = () => {
    if (starting.current) return;
    starting.current = true;
    const board = dealBoard(pals, keptNow.current.progress.level, random, lastBoard.current);
    const dealing = stay.current;
    waitForPictures(
      board.pals.map(({ id }) => bodyPicture(id)),
      { loadPicture, startTimer, limit: PICTURE_WAIT },
      () => {
        if (stay.current !== dealing) return;
        starting.current = false;
        lastBoard.current = board;
        live.current = board;
        show({ kind: "board", board, finished: false });
      }
    );
  };

  // The board is recorded the moment its last pair is found, before the
  // cards wave: leaving, or reloading, during the wave cannot lose it or
  // record it twice. Unreadable progress is not saved over.
  const record = (board: Board): PairsResult => {
    const finished = finishBoard(
      keptNow.current,
      board,
      pals.map(({ id }) => id)
    );
    keptNow.current = finished.kept;
    setKept(finished.kept);
    if (finished.kept.readable) pairsProgress.save(finished.kept.progress);
    return finished.result;
  };

  // Each update moves from the board it is given, so a timer that ends
  // after the child has left, or after the board has moved on, changes
  // nothing.
  const showBoard = (from: Board, to: Board, finished = false) => {
    live.current = to;
    setScreen((current) => (current.kind === "board" && current.board === from ? { kind: "board", board: to, finished } : current));
  };

  const turnCard = (place: number) => {
    const from = live.current;
    if (from === null) return;
    const to = turn(from, place);
    if (to === from) return;
    const result = isFinished(to) ? record(to) : undefined;
    showBoard(from, to, result !== undefined);
    const timing = timings();
    if (isMiss(to)) {
      startTimer(timing.miss, () => {
        if (live.current === to) showBoard(to, turnBack(to));
      });
    }
    if (result !== undefined) {
      startTimer(timing.finish, () => {
        if (live.current !== to) return;
        live.current = null;
        show({ kind: "result", result });
      });
    }
  };

  const home = () => {
    leave();
    onHome();
  };

  const content = (language: Language) => {
    switch (screen.kind) {
      case "welcome":
        return (
          <PairsWelcomeScreen
            language={language}
            level={kept.progress.level}
            stars={kept.progress.stars}
            heroPicture={bodyPicture(HERO)}
            onPlay={play}
            onHome={home}
          />
        );
      case "board":
        return (
          <PairsBoardScreen
            language={language}
            {...presentPairsBoard(screen.board, language, bodyPicture)}
            finished={screen.finished}
            onTurn={turnCard}
            onHome={home}
          />
        );
      case "result":
        return <PairsResultScreen language={language} {...presentPairsResult(screen.result, language, bodyPicture)} onPlayAgain={play} onHome={home} />;
    }
  };

  return {
    // The stars on the game's home tile, undefined until a board is
    // finished.
    stars: kept.progress.stars > 0 ? kept.progress.stars : undefined,
    // The ids of the dinosaurs found, in the dinosaur list's order; one no
    // longer in it is not counted.
    found: foundOf(
      kept.progress.found,
      pals.map(({ id }) => id)
    ),
    // The game opens on its welcome screen, whatever screen it was left on.
    open: () => {
      leave();
      setScreen({ kind: "welcome" });
    },
    content
  };
}
