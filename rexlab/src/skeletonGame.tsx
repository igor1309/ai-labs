import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AgeLevel, AgeLevelSetting, Random } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
import { presentPuzzle, presentSkeletonChoices, presentSkeletonGuess, presentSkeletonMuseum, presentSkeletonResult, type SkeletonPicture } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { SkeletonChoiceScreen } from "./SkeletonChoiceScreen.tsx";
import { SkeletonGuessScreen } from "./SkeletonGuessScreen.tsx";
import { SkeletonMuseumScreen } from "./SkeletonMuseumScreen.tsx";
import {
  awaitsHelp,
  cutAt,
  drop,
  finishSkeleton,
  isComplete,
  knockDown,
  museumOf,
  mysteryChoices,
  openCollection,
  pickMystery,
  showLastStep,
  startPuzzle,
  touch,
  wait,
  type Badge,
  type KeptSkeletons,
  type Kin,
  type Puzzle,
  type Skeleton,
  type SkeletonProgress,
  type SkeletonResult
} from "./skeletons/index.ts";
import { SkeletonPuzzleScreen, type FramePoint, type ShownPiece } from "./SkeletonPuzzleScreen.tsx";
import { SkeletonResultScreen } from "./SkeletonResultScreen.tsx";
import type { SkeletonSounds } from "./skeletonSounds.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

export type { SkeletonPicture } from "./presentation.ts";

// Whether the child is away from the game on a screen, as when the app is
// hidden or the window shows that screen no layout, and its changes.
export type Presence = {
  isAway(phase: SkeletonPhase): boolean;
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
  // Shuffles the tray.
  random: Random;
  // Answers each pick-up, fit and miss, and the finished skeleton.
  sounds: SkeletonSounds;
  // Every dinosaur a mystery skeleton may be guessed as, with its
  // look-alike group.
  kin: readonly Kin[];
};

// The skeleton game has a mode for every age level; a level without a cut
// of its own plays Hatchling's.
const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

// How a puzzle looks: whether its outline is the skeleton's silhouette
// alone, Paleontologist's partial outline, and whether a held piece's home
// is outlined, Hatchling's alone.
type Look = { silhouette: boolean; homeShown: boolean };

// How each level plays its puzzle: its look, whether help climbs the
// ladder of steps rather than Hatchling's one glow, whether other
// skeletons' bones wait in the tray, whether the tray shuffles them rather
// than keep the cut's order, the badge a skeleton built there without
// help's last step earns, and whether a mystery skeleton is guessed from
// among its look-alikes rather than dinosaurs unlike it alone.
const MODES: Record<AgeLevel, { look: Look; ladder: boolean; distractors: boolean; shuffling: boolean; badge: Badge | undefined; lookAlike: boolean }> = {
  hatchling: { look: { silhouette: false, homeShown: true }, ladder: false, distractors: false, shuffling: false, badge: undefined, lookAlike: false },
  explorer: { look: { silhouette: false, homeShown: false }, ladder: true, distractors: false, shuffling: true, badge: "explorer", lookAlike: true },
  paleontologist: { look: { silhouette: true, homeShown: false }, ladder: true, distractors: true, shuffling: true, badge: "paleontologist", lookAlike: true }
};

// The progress the game goes by while the app is open, with the child's
// choice on the level switch, which holds while the app is open even when
// it cannot be saved.
type Kept = KeptSkeletons & { levelChoice: LevelChoice | undefined };

// How often the time spent at a puzzle is counted towards help, in
// milliseconds: a second away is lost at most, as the child leaves.
const HELP_TICK = 1000;

// How long the finished skeleton shows on its board before the reveal, in
// milliseconds, as app.css times it: the skeleton stomps twice as the last
// piece slides into its slot, its skull snaps (--motion-alive each), and
// it holds a moment as the roar ends; with reduced motion only the
// piece's fade.
export const REVEAL: Record<"motion" | "reduced", number> = { motion: 1500, reduced: 160 };

// A puzzle of a skeleton knocked down from its stand starts with its
// bones scattering from the outline to the tray; each keeps its level's
// look until it is left. A mystery skeleton's puzzle holds the dinosaurs
// it is guessed from once finished, and its guess the dinosaurs guessed
// wrong so far.
// The game's screens, each named as the gate reads it.
export type SkeletonPhase = SkeletonScreen["kind"];

type SkeletonScreen =
  | { kind: "choice" }
  | { kind: "puzzle"; puzzle: Puzzle; scatter: boolean; look: Look; mystery: readonly Kin[] | undefined }
  | { kind: "guess"; puzzle: Puzzle; result: SkeletonResult; choices: readonly Kin[]; wrong: readonly string[] }
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
  { skeletons, skeletonPicture, skeletonProgress, bodyPicture, startTimer, presence, reducedMotion, random, sounds, kin }: SkeletonGameProps,
  ageLevel: AgeLevelSetting,
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go, set } = useScreens<SkeletonScreen>({ kind: "choice" }, transitionFor);
  const away = useSyncExternalStore(presence.subscribe, () => presence.isAway(screen.kind));
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
  // level the switch shows, and a mystery's dinosaurs to guess from chosen
  // for it as it starts.
  const start = (id: string, rebuild: boolean, mystery = false) => {
    const skeleton = skeletons.find((each) => each.id === id);
    if (skeleton === undefined) return;
    const from = screen;
    const at = startLevel(ageLevel, OFFERED, keptNow.current.levelChoice);
    const { look, ladder, distractors, shuffling, badge, lookAlike } = MODES[at];
    const started = startPuzzle(skeleton, cutAt(skeleton, at), { ladder, distractors, shuffling: shuffling ? random : undefined, badge });
    const choices = mystery ? mysteryChoices(id, skeletons, kin, lookAlike, random).flatMap((each) => kin.filter((one) => one.id === each)) : undefined;
    go((current) => (current === from ? { kind: "puzzle", puzzle: started, scatter: rebuild, look, mystery: choices } : current), {
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

  // The mystery is one of the skeletons with a star, built at the level
  // the switch shows like any other.
  const mystery = () => {
    const picked = pickMystery(skeletons, keptNow.current.progress.earned, random);
    if (picked !== undefined) start(picked.id, false, true);
  };

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
  // revealed, its body picture fading in once loaded, or a mystery asks
  // whose skeleton it is; only if the child is still here. The pause is
  // the puzzle's timer, so leaving stops it.
  const reveal = (finished: Puzzle, result: SkeletonResult, timers: OwnedTimers) => {
    timers.start(REVEAL[reducedMotion() ? "reduced" : "motion"], () => {
      if (live.current !== finished) return;
      live.current = null;
      go((current) =>
        current.kind === "puzzle" && current.mystery !== undefined ? { kind: "guess", puzzle: finished, result, choices: current.mystery, wrong: [] } : { kind: "result", result }
      );
    });
  };

  // The right guess reveals the dinosaur as any finished skeleton does; a
  // wrong one boings, rests aside and brings the clue.
  const guess = (id: string) => {
    if (screen.kind !== "guess" || screen.wrong.includes(id)) return;
    const from = screen;
    if (id === from.puzzle.skeleton.id) {
      go((current) => (current === from ? { kind: "result", result: from.result } : current));
      return;
    }
    sounds.play("boing");
    go((current) => (current === from ? { ...from, wrong: [...from.wrong, id] } : current));
  };

  // The board listens for drags anew on each render, so it always drops
  // through this one. Every drop is heard: a piece that fits clicks home,
  // a skull snapping its jaw, the last one with a stomp and a roar; any
  // other drop boings back to the tray.
  const onDrop = (piece: ShownPiece, centre: FramePoint, reach: number) => {
    const from = live.current;
    const timers = puzzleTimers.current;
    if (from === null || timers === null) return;
    const to = drop(from, piece, centre, reach);
    if (to.fitted.length === from.fitted.length) sounds.play("boing");
    else sounds.play(from.cut.find(({ id }) => id === piece)?.area === "head" ? "jaw" : "click");
    if (to === from) return;
    showPuzzle(from, to);
    if (isComplete(to)) {
      sounds.play("roar");
      reveal(to, record(to), timers);
    }
  };

  // A piece touched in the tray, picked up with a sound.
  const onTouch = (piece: ShownPiece) => {
    const from = live.current;
    if (from === null) return;
    sounds.play("lift");
    const to = touch(from, piece);
    if (to !== from) showPuzzle(from, to);
  };

  // Help's last step has shown, so the puzzle earns no badge.
  const onLastStep = () => {
    const from = live.current;
    if (from === null) return;
    const to = showLastStep(from);
    if (to !== from) showPuzzle(from, to);
  };

  // Only time at the puzzle counts towards help: the count pauses while
  // the child is away, and starts again from nothing as a piece fits, or
  // on the ladder as a piece is touched. Nothing else restarts it: another
  // dinosaur's bone dropped changes the puzzle, and the tick
  // counts on the puzzle as it is then. Its timer is the puzzle's, so
  // leaving stops it at once, not once the screen it left has rendered.
  const counting = puzzle !== undefined && awaitsHelp(puzzle);
  const since = puzzle?.fitted;
  const touches = puzzle?.touches;
  useEffect(() => {
    const timers = puzzleTimers.current;
    if (!counting || away || timers === null) return;
    let stop = () => {};
    const tick = () => {
      stop = timers.start(HELP_TICK, () => {
        const now = live.current;
        if (now === null || now.fitted !== since || now.touches !== touches) return;
        showPuzzle(now, wait(now, HELP_TICK));
        tick();
      });
    };
    tick();
    return () => stop();
  }, [since, touches, counting, away]);

  // BACK leaves a puzzle for the choice of dinosaurs: unfinished, it is
  // dropped, earning nothing, and its wait for help stops.
  const back = () => {
    leave();
    go({ kind: "choice" });
  };

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

  const content = (language: Language, onJawShelf?: () => void) => {
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
            onMystery={skeletons.some(({ id }) => kept.progress.earned.includes(id)) ? mystery : undefined}
            onMuseum={museum}
            onHome={home}
          />
        );
      case "puzzle":
        return (
          <SkeletonPuzzleScreen
            language={language}
            {...presentPuzzle(screen.puzzle, language, skeletonPicture, screen.look)}
            {...(screen.mystery && { name: "?" })}
            scatter={screen.scatter}
            onDrop={onDrop}
            onTouch={onTouch}
            onLastStep={onLastStep}
            onMuseum={museum}
            onBack={back}
            onHome={home}
          />
        );
      case "guess":
        return (
          <SkeletonGuessScreen
            language={language}
            {...presentSkeletonGuess(screen.puzzle.skeleton, screen.choices, screen.wrong, language, skeletonPicture, bodyPicture)}
            onGuess={guess}
            onBack={back}
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
            onJawShelf={onJawShelf}
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

  return { content, best, openMuseum, phase: screen.kind };
}
