import { useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
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
  type BoardLevel,
  type KeptPairs,
  type Pal,
  type PairsProgress,
  type PairsResult,
  type Random
} from "./pairs/index.ts";
import { PairsBoardScreen } from "./PairsBoardScreen.tsx";
import { PairsResultScreen } from "./PairsResultScreen.tsx";
import { PairsWelcomeScreen } from "./PairsWelcomeScreen.tsx";
import { LoadAhead } from "./Picture.tsx";
import { presentPairsBoard, presentPairsResult } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

// What find the pair keeps: its progress, and the child's last choice on
// its level switch, none until the switch is first used.
export type PairsSaved = { progress: PairsProgress; levelChoice: LevelChoice | undefined };

export type PairsProgressStore = {
  // What find the pair has kept so far, or undefined when it cannot be
  // read at all.
  load(): PairsSaved | undefined;
  save(saved: PairsSaved): void;
};

export type PairsGameProps = {
  // Every dinosaur that may be dealt, in the shared dinosaur list's order.
  pals: readonly Pal[];
  pairsProgress: PairsProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
  startTimer: StartTimer;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
};

// The dinosaur on the welcome screen's cards.
const HERO = "triceratops";

// Find the pair has a mode for every age level.
const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

// How long a miss stays open before it turns back, in milliseconds, the
// same with reduced motion: long enough to see both cards. And the motion
// tokens of app.css the cards' wave before the result is timed by: after
// the last flip (--motion-standard), staggered card by card
// (--motion-stagger), each for --motion-screen; with reduced motion only
// the fades the tokens leave.
const TIMINGS: Record<"motion" | "reduced", { miss: number; flip: number; stagger: number; wave: number }> = {
  motion: { miss: 1000, flip: 240, stagger: 40, wave: 320 },
  reduced: { miss: 1000, flip: 160, stagger: 0, wave: 160 }
};

// How long the cards of a board of `cards` wave before the result.
const waveOf = ({ flip, stagger, wave }: (typeof TIMINGS)["motion"], cards: number) => flip + (cards - 1) * stagger + wave;

// The progress the game goes by while the app is open, with the child's
// choice on the level switch, which holds while the app is open even when
// it cannot be saved.
type Kept = KeptPairs & { levelChoice: LevelChoice | undefined };

type PairsScreen = { kind: "welcome" } | { kind: "board"; board: Board; finished: boolean } | { kind: "result"; result: PairsResult };

// A card turned, or turned back, changes the board at once; every other
// change is the plain screen change.
export function transitionFor(from: PairsScreen, to: PairsScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

// Find the pair, kept by the app above its orientation gate, so turning
// the iPad pauses a board without losing it. `ageLevel` is the age level a
// parent picked, which the game starts at until the child chooses another
// level on its switch. `onHome` takes the child back to the home page;
// `onStart` is told as each board is dealt.
export function usePairsGame(
  { pals, pairsProgress, bodyPicture, random, startTimer, reducedMotion }: PairsGameProps,
  ageLevel: AgeLevelSetting,
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go, set } = useScreens<PairsScreen>({ kind: "welcome" }, transitionFor);
  // Progress is read once, as the app opens. When it cannot be read there
  // is no best to compare with, but stars, levels and dinosaurs found
  // meanwhile are still kept while the app is open, and so is progress
  // that cannot be saved.
  const [kept, setKept] = useState<Kept>(() => {
    const stored = pairsProgress.load();
    return { progress: stored?.progress ?? NO_PAIRS, levelChoice: stored?.levelChoice, readable: stored !== undefined };
  });
  const keptNow = useRef(kept);
  // The board in play, ahead of the screen: a second tap, or a timer, acts
  // on the board as it is, not as last rendered. Null once the child
  // leaves it.
  const live = useRef<Board | null>(null);
  // The miss and celebration timers of the board in play, all stopped as
  // the child leaves it, and null from then on.
  const boardTimers = useRef<OwnedTimers | null>(null);
  // The board dealt last, at whatever level, so the next one deals as few
  // of its dinosaurs as it can.
  const lastBoard = useRef<Board | undefined>(undefined);

  // The level the game is played at: the child's choice on the switch
  // while the age level is still the pick it was made under, otherwise the
  // age level.
  const level = startLevel(ageLevel, OFFERED, kept.levelChoice);

  // Kept, then saved; unreadable progress is not saved over.
  const keep = (next: Kept) => {
    keptNow.current = next;
    setKept(next);
    if (next.readable) pairsProgress.save({ progress: next.progress, levelChoice: next.levelChoice });
  };

  // A level chosen on the switch is kept under the age level it was chosen
  // at. The switch rests once PLAY has dealt a board, so the board is dealt
  // at the level shown then; the level already chosen, as on a double tap,
  // changes nothing.
  const chooseLevel = (chosen: AgeLevel) => {
    if (live.current !== null || chosen === startLevel(ageLevel, OFFERED, keptNow.current.levelChoice)) return;
    keep({ ...keptNow.current, levelChoice: { level: chosen, revision: ageLevel.revision } });
  };

  const timings = () => TIMINGS[reducedMotion() ? "reduced" : "motion"];

  const leave = () => {
    live.current = null;
    boardTimers.current?.stopAll();
    boardTimers.current = null;
  };

  // A board is dealt at the level shown, Hatchling's at the climb level
  // reached, and shows at once, its pictures loading while its cards lie
  // face down. A second PLAY in the same change deals nothing more.
  const play = () => {
    const shown = startLevel(ageLevel, OFFERED, keptNow.current.levelChoice);
    const boardLevel: BoardLevel = shown === "hatchling" ? { climbLevel: keptNow.current.progress.climbLevel } : { large: shown };
    const board = dealBoard(pals, boardLevel, random, lastBoard.current);
    go((current) => (current.kind === "board" ? current : { kind: "board", board, finished: false }), {
      also: () => {
        lastBoard.current = board;
        live.current = board;
        boardTimers.current = ownedTimers(startTimer);
        onStart();
      }
    });
  };

  // The board is recorded the moment its last pair is found, before the
  // cards wave: leaving, or reloading, during the wave cannot lose it or
  // record it twice.
  const record = (board: Board): PairsResult => {
    const finished = finishBoard(
      keptNow.current,
      board,
      pals.map(({ id }) => id)
    );
    keep({ ...keptNow.current, ...finished.kept });
    return finished.result;
  };

  // Each update moves from the board it is given, so a timer that ends
  // after the child has left, or after the board has moved on, changes
  // nothing.
  const showBoard = (from: Board, to: Board, finished = false) => {
    live.current = to;
    go((current) => (current.kind === "board" && current.board === from ? { kind: "board", board: to, finished } : current));
  };

  const turnCard = (place: number) => {
    const from = live.current;
    const timers = boardTimers.current;
    if (from === null || timers === null) return;
    const to = turn(from, place);
    if (to === from) return;
    const result = isFinished(to) ? record(to) : undefined;
    showBoard(from, to, result !== undefined);
    const timing = timings();
    if (isMiss(to)) {
      timers.start(timing.miss, () => {
        if (live.current === to) showBoard(to, turnBack(to));
      });
    }
    if (result !== undefined) {
      timers.start(waveOf(timing, to.cards.length), () => {
        if (live.current !== to) return;
        live.current = null;
        go({ kind: "result", result });
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
            level={level}
            climbLevel={kept.progress.climbLevel}
            stars={kept.progress.stars}
            heroPicture={bodyPicture(HERO)}
            onLevel={chooseLevel}
            onPlay={play}
            onHome={home}
          />
        );
      case "board":
        return (
          <>
            <LoadAhead urls={screen.board.pals.map(({ id }) => bodyPicture(id))} />
            <PairsBoardScreen
              language={language}
              {...presentPairsBoard(screen.board, language, bodyPicture)}
              finished={screen.finished}
              onTurn={turnCard}
              onHome={home}
            />
          </>
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
      set({ kind: "welcome" });
    },
    content
  };
}
