import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Language } from "./language/language.ts";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
import { droppedPiece, presentPuzzle, presentSkeletonChoices, type SkeletonPicture } from "./presentation.ts";
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";
import { SkeletonChoiceScreen } from "./SkeletonChoiceScreen.tsx";
import { awaitsHelp, drop, PIECES, startPuzzle, wait, type Puzzle, type Skeleton } from "./skeletons/index.ts";
import { SkeletonPuzzleScreen, type FramePoint, type ShownPiece } from "./SkeletonPuzzleScreen.tsx";

export type { SkeletonPicture } from "./presentation.ts";

// Whether the child is away from the game, as when the app is hidden or
// the iPad is in portrait, and its changes.
export type Presence = {
  isAway(): boolean;
  subscribe(onChange: () => void): () => void;
};

export type SkeletonGameProps = {
  // Every skeleton that can be built, in the order the child chooses from.
  skeletons: readonly Skeleton[];
  skeletonPicture: SkeletonPicture;
  bodyPicture: (dinosaurId: string) => string;
  loadPicture: LoadPicture;
  startTimer: StartTimer;
  presence: Presence;
};

// The longest a puzzle waits for its pictures, in milliseconds, as a
// question does for its pictures.
const PICTURE_WAIT = 1000;

// How often the time spent at a puzzle is counted towards help, in
// milliseconds: a second away is lost at most, as the child leaves.
const HELP_TICK = 1000;

type SkeletonScreen = { kind: "choice" } | { kind: "puzzle"; puzzle: Puzzle };

// The skeleton game, kept by the app above its orientation gate, so
// turning the iPad pauses a puzzle without losing it. `onHome` takes the
// child back to the home page.
export function useSkeletonGame({ skeletons, skeletonPicture, bodyPicture, loadPicture, startTimer, presence }: SkeletonGameProps, onHome: () => void) {
  const [screen, setScreen] = useState<SkeletonScreen>({ kind: "choice" });
  const away = useSyncExternalStore(presence.subscribe, presence.isAway);
  const puzzle = screen.kind === "puzzle" ? screen.puzzle : undefined;
  // A puzzle being started while its pictures load: a second tap
  // meanwhile, on the same dinosaur or another, starts nothing more.
  const starting = useRef(false);
  // Counts each time the child leaves the game, so pictures that finish
  // loading after the child has left start no puzzle.
  const stay = useRef(0);

  const leave = () => {
    stay.current++;
    starting.current = false;
  };

  // A puzzle shows once its outline and pieces are ready, or the wait
  // runs out, so no bone pops in, and only if the child is still here.
  const choose = (id: string) => {
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
        changeScreen(SCREEN_CHANGE, () => setScreen({ kind: "puzzle", puzzle: startPuzzle(skeleton) }));
      }
    );
  };

  // A puzzle left is dropped with the screen it was on, so its wait for
  // help stops, and the game opens again on its choice of dinosaurs.
  const home = () => {
    leave();
    changeScreen(SCREEN_CHANGE, () => {
      setScreen({ kind: "choice" });
      onHome();
    });
  };

  // Each change moves from the puzzle as it is, not as last rendered, so a
  // drop or a tick that lands after the child has left changes nothing.
  const play = (move: (puzzle: Puzzle) => Puzzle) =>
    setScreen((current) => {
      if (current.kind !== "puzzle") return current;
      const moved = move(current.puzzle);
      return moved === current.puzzle ? current : { ...current, puzzle: moved };
    });

  // The board listens for drags with it, so it stays the same function.
  const onDrop = useCallback(
    (piece: ShownPiece, centre: FramePoint, reach: number) => play((current) => drop(current, droppedPiece(piece), centre, reach)),
    []
  );

  // Only time at the puzzle counts towards help: the count pauses while
  // the child is away, and starts again from nothing as a piece fits.
  useEffect(() => {
    if (puzzle === undefined || away || !awaitsHelp(puzzle)) return;
    return startTimer(HELP_TICK, () => play((current) => (current === puzzle ? wait(current, HELP_TICK) : current)));
  }, [puzzle, away, startTimer]);

  // The museum has no screen of its own yet, so MUSEUM keeps the child
  // where they are.
  const museum = () => {};

  const content = (language: Language) => {
    switch (screen.kind) {
      case "choice":
        return (
          <SkeletonChoiceScreen
            language={language}
            choices={presentSkeletonChoices(skeletons, language, bodyPicture)}
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
            onDrop={onDrop}
            onMuseum={museum}
            onHome={home}
          />
        );
    }
  };

  return { content };
}
