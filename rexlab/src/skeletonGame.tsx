import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
import { droppedPiece, presentPuzzle, presentSkeletonChoices, presentSkeletonMuseum, presentSkeletonResult, type SkeletonPicture } from "./presentation.ts";
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";
import { SkeletonChoiceScreen } from "./SkeletonChoiceScreen.tsx";
import { SkeletonMuseumScreen } from "./SkeletonMuseumScreen.tsx";
import {
  awaitsHelp,
  drop,
  finishSkeleton,
  isComplete,
  knockDown,
  museumOf,
  openCollection,
  PIECES,
  startPuzzle,
  wait,
  type KeptSkeletons,
  type Puzzle,
  type Skeleton,
  type SkeletonProgress,
  type SkeletonResult
} from "./skeletons/index.ts";
import { SkeletonPuzzleScreen, type FramePoint, type ShownPiece } from "./SkeletonPuzzleScreen.tsx";
import { SkeletonResultScreen } from "./SkeletonResultScreen.tsx";

export type { SkeletonPicture } from "./presentation.ts";

// Whether the child is away from the game, as when the app is hidden or
// the iPad is in portrait, and its changes.
export type Presence = {
  isAway(): boolean;
  subscribe(onChange: () => void): () => void;
};

export type SkeletonProgressStore = {
  // The skeleton game's progress kept so far, or undefined when it cannot
  // be read at all.
  load(): SkeletonProgress | undefined;
  save(progress: SkeletonProgress): void;
};

export type SkeletonGameProps = {
  // Every skeleton that can be built, in the order the child chooses from.
  skeletons: readonly Skeleton[];
  skeletonPicture: SkeletonPicture;
  skeletonProgress: SkeletonProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  loadPicture: LoadPicture;
  startTimer: StartTimer;
  presence: Presence;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
};

// The longest a puzzle waits for its pictures, in milliseconds, as a
// question does for its pictures.
const PICTURE_WAIT = 1000;

// How often the time spent at a puzzle is counted towards help, in
// milliseconds: a second away is lost at most, as the child leaves.
const HELP_TICK = 1000;

// How long the finished skeleton shows on its board before the reveal, in
// milliseconds, as app.css times it: the last piece slides into its slot
// (--motion-standard), then the whole skeleton holds as long again; with
// reduced motion only the piece's fade. The body picture is waited for
// meanwhile, never longer than PICTURE_WAIT.
export const REVEAL: Record<"motion" | "reduced", number> = { motion: 480, reduced: 160 };

// A puzzle of a skeleton knocked down from its stand starts with its
// bones scattering from the outline to the tray.
type SkeletonScreen =
  | { kind: "choice" }
  | { kind: "puzzle"; puzzle: Puzzle; scatter: boolean }
  | { kind: "result"; result: SkeletonResult }
  | { kind: "museum" };

// The skeleton game, kept by the app above its orientation gate, so
// turning the iPad pauses a puzzle without losing it. `onHome` takes the
// child back to the home page.
export function useSkeletonGame(
  { skeletons, skeletonPicture, skeletonProgress, bodyPicture, loadPicture, startTimer, presence, reducedMotion }: SkeletonGameProps,
  onHome: () => void
) {
  const [screen, setScreen] = useState<SkeletonScreen>({ kind: "choice" });
  const away = useSyncExternalStore(presence.subscribe, presence.isAway);
  const puzzle = screen.kind === "puzzle" ? screen.puzzle : undefined;
  // Progress is read once, as the app opens. When it cannot be read there
  // is no best to compare with, but stars earned meanwhile are still kept
  // while the app is open, and so is progress that cannot be saved.
  const [kept, setKept] = useState<KeptSkeletons>(() => openCollection(skeletonProgress.load(), skeletons.map(({ id }) => id)));
  const keptNow = useRef(kept);
  // The puzzle in play, ahead of the screen: a drop, or a tick, acts on the
  // puzzle as it is, not as last rendered. Null once the child leaves it.
  const live = useRef<Puzzle | null>(null);
  // A puzzle being started while its pictures load: a second tap
  // meanwhile, on the same dinosaur or another, starts nothing more.
  const starting = useRef(false);
  // Counts each time the child leaves the game, so pictures that finish
  // loading after the child has left start no puzzle.
  const stay = useRef(0);

  const order = skeletons.map(({ id }) => id);

  // The best collection score, undefined while there is none or stored
  // progress cannot be read.
  const best = kept.readable ? (kept.progress.bestScore ?? undefined) : undefined;

  const show = (next: SkeletonScreen) => changeScreen(SCREEN_CHANGE, () => setScreen(next));

  const leave = () => {
    stay.current++;
    live.current = null;
    starting.current = false;
  };

  // Each change is saved as it is made; unreadable progress is not saved
  // over.
  const keep = (next: KeptSkeletons) => {
    if (next === keptNow.current) return;
    keptNow.current = next;
    setKept(next);
    if (next.readable) skeletonProgress.save(next.progress);
  };

  // A puzzle shows once its outline and pieces are ready, or the wait
  // runs out, so no bone pops in, and only if the child is still here. A
  // skeleton rebuilt is knocked down from its stand only as its puzzle
  // starts, its bones scattering from the outline, and its stand awaits
  // it from then on, however the rebuild is left.
  const start = (id: string, rebuild: boolean) => {
    const skeleton = skeletons.find((each) => each.id === id);
    if (skeleton === undefined || starting.current) return;
    starting.current = true;
    const choosing = stay.current;
    waitForPictures(
      [skeletonPicture(id, "skeleton"), ...PIECES.map((piece) => skeletonPicture(id, piece))],
      { loadPicture, startTimer, limit: PICTURE_WAIT },
      () => {
        if (stay.current !== choosing) return;
        starting.current = false;
        if (rebuild) keep(knockDown(keptNow.current, id));
        const started = startPuzzle(skeleton);
        live.current = started;
        show({ kind: "puzzle", puzzle: started, scatter: rebuild });
      }
    );
  };

  const choose = (id: string) => start(id, false);

  const rebuild = (id: string) => start(id, true);

  // A puzzle left is dropped with the screen it was on, so its wait for
  // help stops, and the game opens again on its choice of dinosaurs.
  const home = () => {
    leave();
    changeScreen(SCREEN_CHANGE, () => {
      setScreen({ kind: "choice" });
      onHome();
    });
  };

  // Each update moves from the puzzle it is given, so a drop or a tick
  // that lands after the child has left, or after the puzzle has moved
  // on, changes nothing.
  const showPuzzle = (from: Puzzle, to: Puzzle) => {
    live.current = to;
    setScreen((current) => (current.kind === "puzzle" && current.puzzle === from ? { ...current, puzzle: to } : current));
  };

  // A skeleton is recorded the moment its last piece fits, before the
  // reveal: leaving, or reloading, during the reveal cannot lose its star
  // or record it twice.
  const record = (finished: Puzzle): SkeletonResult => {
    const { result, kept: next } = finishSkeleton(keptNow.current, finished, order, beatBest);
    keep(next);
    return result;
  };

  // The finished skeleton shows whole for a moment, then the dinosaur is
  // revealed once its body picture is ready, or the wait runs out, so a
  // missing picture holds nothing back; only if the child is still here.
  const reveal = (finished: Puzzle, result: SkeletonResult) => {
    const revealing = stay.current;
    let pictured = false;
    let held = false;
    const go = () => {
      if (!pictured || !held || stay.current !== revealing || live.current !== finished) return;
      live.current = null;
      show({ kind: "result", result });
    };
    waitForPictures([bodyPicture(finished.skeleton.id)], { loadPicture, startTimer, limit: PICTURE_WAIT }, () => {
      pictured = true;
      go();
    });
    startTimer(REVEAL[reducedMotion() ? "reduced" : "motion"], () => {
      held = true;
      go();
    });
  };

  // The board listens for drags anew on each render, so it always drops
  // through this one.
  const onDrop = (piece: ShownPiece, centre: FramePoint, reach: number) => {
    const from = live.current;
    if (from === null) return;
    const to = drop(from, droppedPiece(piece), centre, reach);
    if (to === from) return;
    showPuzzle(from, to);
    if (isComplete(to)) reveal(to, record(to));
  };

  // Only time at the puzzle counts towards help: the count pauses while
  // the child is away, and starts again from nothing as a piece fits.
  useEffect(() => {
    if (puzzle === undefined || away || !awaitsHelp(puzzle)) return;
    return startTimer(HELP_TICK, () => {
      if (live.current === puzzle) showPuzzle(puzzle, wait(puzzle, HELP_TICK));
    });
  }, [puzzle, away, startTimer]);

  // BUILD ANOTHER goes back to the choice of dinosaurs, leaving a rebuild
  // still loading unstarted and its skeleton on its stand; a second tap
  // meanwhile changes nothing more.
  const buildAnother = () => {
    leave();
    changeScreen(SCREEN_CHANGE, () => setScreen((current) => (current.kind === "result" || current.kind === "museum" ? { kind: "choice" } : current)));
  };

  // MUSEUM leaves whatever the child was doing: an unfinished puzzle is
  // dropped, earning nothing, and a puzzle still loading never starts.
  const museum = () => {
    leave();
    show({ kind: "museum" });
  };

  const content = (language: Language) => {
    switch (screen.kind) {
      case "choice":
        return (
          <SkeletonChoiceScreen
            language={language}
            choices={presentSkeletonChoices(skeletons, language, bodyPicture, kept.progress.earned)}
            best={best}
            onChoose={choose}
            onMuseum={museum}
            onHome={home}
          />
        );
      case "puzzle":
        return (
          <SkeletonPuzzleScreen
            language={language}
            {...presentPuzzle(screen.puzzle, language, skeletonPicture)}
            scatter={screen.scatter}
            onDrop={onDrop}
            onMuseum={museum}
            onHome={home}
          />
        );
      case "result":
        return (
          <SkeletonResultScreen
            language={language}
            {...presentSkeletonResult(screen.result, language, skeletonPicture, bodyPicture)}
            onBuildAnother={buildAnother}
            onMuseum={museum}
            onHome={home}
          />
        );
      case "museum":
        return (
          <SkeletonMuseumScreen
            language={language}
            {...presentSkeletonMuseum(museumOf(kept, skeletons), language, skeletonPicture)}
            onBuild={choose}
            onRebuild={rebuild}
            onBuildAnother={buildAnother}
            onHome={home}
          />
        );
    }
  };

  return { content, best };
}
