import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
import { presentPuzzle, presentSkeletonChoices, presentSkeletonMuseum, presentSkeletonResult, type SkeletonPicture } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { SkeletonChoiceScreen } from "./SkeletonChoiceScreen.tsx";
import { SkeletonMuseumScreen } from "./SkeletonMuseumScreen.tsx";
import {
  awaitsHelp,
  cutAt,
  drop,
  finishSkeleton,
  isComplete,
  knockDown,
  museumOf,
  openCollection,
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
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

export type { SkeletonPicture } from "./presentation.ts";

// Whether the child is away from the game, as when the app is hidden or
// the iPad is in portrait, and its changes.
export type Presence = {
  isAway(): boolean;
  subscribe(onChange: () => void): () => void;
};

// The skeleton game's progress, and the child's last choice on its level
// switch, none until the switch is first used.
export type SkeletonSaved = { progress: SkeletonProgress; levelChoice: LevelChoice | undefined };

export type SkeletonProgressStore = {
  // What is kept so far, or undefined when it cannot be read at all.
  load(): SkeletonSaved | undefined;
  save(saved: SkeletonSaved): void;
};

export type SkeletonGameProps = {
  // Every skeleton that can be built, in the order the child chooses from.
  skeletons: readonly Skeleton[];
  skeletonPicture: SkeletonPicture;
  skeletonProgress: SkeletonProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  startTimer: StartTimer;
  presence: Presence;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
};

// The skeleton game has a mode for every age level; a level without a cut
// of its own plays Hatchling's.
const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

// The levels whose puzzle colours each piece and its slot by body area:
// Explorer's, as a cue to where a bone goes.
const COLOURED: Record<AgeLevel, boolean> = { hatchling: false, explorer: true, paleontologist: false };

// The progress the game goes by while the app is open, with the child's
// choice on the level switch, which holds while the app is open even when
// it cannot be saved.
type Kept = KeptSkeletons & { levelChoice: LevelChoice | undefined };

// How often the time spent at a puzzle is counted towards help, in
// milliseconds: a second away is lost at most, as the child leaves.
const HELP_TICK = 1000;

// How long the finished skeleton shows on its board before the reveal, in
// milliseconds, as app.css times it: the last piece slides into its slot
// (--motion-standard), then the whole skeleton holds as long again; with
// reduced motion only the piece's fade.
export const REVEAL: Record<"motion" | "reduced", number> = { motion: 480, reduced: 160 };

// A puzzle of a skeleton knocked down from its stand starts with its
// bones scattering from the outline to the tray; one coloured by body
// area keeps its colours until it is left.
type SkeletonScreen =
  | { kind: "choice" }
  | { kind: "puzzle"; puzzle: Puzzle; scatter: boolean; coloured: boolean }
  | { kind: "result"; result: SkeletonResult }
  | { kind: "museum" };

// A piece fitted, or time towards help, changes the puzzle at once; every
// other change is the plain screen change.
export function transitionFor(from: SkeletonScreen, to: SkeletonScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

// The skeleton game, kept by the app above its orientation gate, so
// turning the iPad pauses a puzzle without losing it. `ageLevel` is the
// age level a parent picked, which the game starts at until the child
// chooses another level on its switch. `onHome` takes the child back to
// the home page; `onStart` is told as each puzzle begins, a rebuild's too.
export function useSkeletonGame(
  { skeletons, skeletonPicture, skeletonProgress, bodyPicture, startTimer, presence, reducedMotion }: SkeletonGameProps,
  ageLevel: AgeLevelSetting,
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go, set } = useScreens<SkeletonScreen>({ kind: "choice" }, transitionFor);
  const away = useSyncExternalStore(presence.subscribe, presence.isAway);
  const puzzle = screen.kind === "puzzle" ? screen.puzzle : undefined;
  // Progress is read once, as the app opens. When it cannot be read there
  // is no best to compare with, but stars earned meanwhile are still kept
  // while the app is open, and so is progress that cannot be saved.
  const [kept, setKept] = useState<Kept>(() => {
    const stored = skeletonProgress.load();
    return { ...openCollection(stored?.progress, skeletons.map(({ id }) => id)), levelChoice: stored?.levelChoice };
  });
  const keptNow = useRef(kept);
  // The puzzle in play, ahead of the screen: a drop, or a tick, acts on the
  // puzzle as it is, not as last rendered. Null once the child leaves it.
  const live = useRef<Puzzle | null>(null);
  // The reveal and help timers of the puzzle in play, all stopped as the
  // child leaves it, and null from then on.
  const puzzleTimers = useRef<OwnedTimers | null>(null);

  const order = skeletons.map(({ id }) => id);

  // The level the game is played at: the child's choice on the switch
  // while the age level is still the pick it was made under, otherwise the
  // age level.
  const level = startLevel(ageLevel, OFFERED, kept.levelChoice);

  // The best collection score, undefined while there is none or stored
  // progress cannot be read.
  const best = kept.readable ? (kept.progress.bestScore ?? undefined) : undefined;

  const leave = () => {
    live.current = null;
    puzzleTimers.current?.stopAll();
    puzzleTimers.current = null;
  };

  // Each change is saved as it is made, the level choice with it;
  // unreadable progress is not saved over.
  const keep = (next: KeptSkeletons, levelChoice = keptNow.current.levelChoice) => {
    if (next === keptNow.current && levelChoice === keptNow.current.levelChoice) return;
    const both = { ...next, levelChoice };
    keptNow.current = both;
    setKept(both);
    if (both.readable) skeletonProgress.save({ progress: both.progress, levelChoice });
  };

  // A level chosen on the switch is kept under the age level it was chosen
  // at. The switch rests once a puzzle is asked for, so the puzzle starts
  // at the level shown then; the level already chosen, as on a double tap,
  // changes nothing.
  const chooseLevel = (chosen: AgeLevel) => {
    if (live.current !== null || chosen === startLevel(ageLevel, OFFERED, keptNow.current.levelChoice)) return;
    keep(keptNow.current, { level: chosen, revision: ageLevel.revision });
  };

  // A puzzle shows at once, its pictures shimmering until they load, and
  // only over the screen it was asked from, so a second tap in the same
  // moment, on the same dinosaur or another, starts nothing more. A
  // skeleton rebuilt is knocked down from its stand only as its puzzle
  // starts, its bones scattering from the outline, and its stand awaits
  // it from then on, however the rebuild is left. The puzzle is cut for the
  // level the switch shows.
  const start = (id: string, rebuild: boolean) => {
    const skeleton = skeletons.find((each) => each.id === id);
    if (skeleton === undefined) return;
    const from = screen;
    const at = startLevel(ageLevel, OFFERED, keptNow.current.levelChoice);
    const started = startPuzzle(skeleton, cutAt(skeleton, at));
    go((current) => (current === from ? { kind: "puzzle", puzzle: started, scatter: rebuild, coloured: COLOURED[at] } : current), {
      also: () => {
        if (rebuild) keep(knockDown(keptNow.current, id));
        live.current = started;
        puzzleTimers.current = ownedTimers(startTimer);
        onStart();
      }
    });
  };

  const choose = (id: string) => start(id, false);

  const rebuild = (id: string) => start(id, true);

  // A puzzle left is dropped with the screen it was on, so its wait for
  // help stops, and the game opens again on its choice of dinosaurs.
  const home = () => {
    leave();
    go({ kind: "choice" }, { also: onHome });
  };

  // Each update moves from the puzzle it is given, so a drop or a tick
  // that lands after the child has left, or after the puzzle has moved
  // on, changes nothing.
  const showPuzzle = (from: Puzzle, to: Puzzle) => {
    live.current = to;
    go((current) => (current.kind === "puzzle" && current.puzzle === from ? { ...current, puzzle: to } : current));
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
  // revealed, its body picture fading in once loaded; only if the child
  // is still here. The pause is the puzzle's timer, so leaving stops it.
  const reveal = (finished: Puzzle, result: SkeletonResult, timers: OwnedTimers) => {
    timers.start(REVEAL[reducedMotion() ? "reduced" : "motion"], () => {
      if (live.current !== finished) return;
      live.current = null;
      go({ kind: "result", result });
    });
  };

  // The board listens for drags anew on each render, so it always drops
  // through this one.
  const onDrop = (piece: ShownPiece, centre: FramePoint, reach: number) => {
    const from = live.current;
    const timers = puzzleTimers.current;
    if (from === null || timers === null) return;
    const to = drop(from, piece, centre, reach);
    if (to === from) return;
    showPuzzle(from, to);
    if (isComplete(to)) reveal(to, record(to), timers);
  };

  // Only time at the puzzle counts towards help: the count pauses while
  // the child is away, and starts again from nothing as a piece fits. Its
  // timer is the puzzle's, so leaving stops it at once, not once the
  // screen it left has rendered.
  useEffect(() => {
    const timers = puzzleTimers.current;
    if (puzzle === undefined || away || !awaitsHelp(puzzle) || timers === null) return;
    return timers.start(HELP_TICK, () => {
      if (live.current === puzzle) showPuzzle(puzzle, wait(puzzle, HELP_TICK));
    });
  }, [puzzle, away]);

  // BUILD ANOTHER goes back to the choice of dinosaurs; a second tap
  // meanwhile, or a tap after a puzzle was asked for, changes nothing
  // more, and leaves that puzzle in play.
  const buildAnother = () => {
    go((current) => (current.kind === "result" || current.kind === "museum" ? { kind: "choice" } : current), { also: leave });
  };

  // MUSEUM leaves whatever the child was doing: an unfinished puzzle is
  // dropped, earning nothing.
  const museum = () => {
    leave();
    go({ kind: "museum" });
  };

  // The museum opened from the home page, as the app changes to the game:
  // the game shows it, not its choice of dinosaurs.
  const openMuseum = () => {
    leave();
    set({ kind: "museum" });
  };

  const content = (language: Language) => {
    switch (screen.kind) {
      case "choice":
        return (
          <SkeletonChoiceScreen
            language={language}
            choices={presentSkeletonChoices(skeletons, language, bodyPicture, kept.progress.earned)}
            best={best}
            level={level}
            onLevel={chooseLevel}
            onChoose={choose}
            onMuseum={museum}
            onHome={home}
          />
        );
      case "puzzle":
        return (
          <SkeletonPuzzleScreen
            language={language}
            {...presentPuzzle(screen.puzzle, language, skeletonPicture, { coloured: screen.coloured })}
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

  return { content, best, openMuseum };
}
