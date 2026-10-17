import { useRef, useState } from "react";
import type { Language } from "./language/language.ts";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
import { presentPuzzle, presentSkeletonChoices, type SkeletonPicture } from "./presentation.ts";
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";
import { SkeletonChoiceScreen } from "./SkeletonChoiceScreen.tsx";
import { PIECES, startPuzzle, type Puzzle, type Skeleton } from "./skeletons/index.ts";
import { SkeletonPuzzleScreen } from "./SkeletonPuzzleScreen.tsx";

export type { SkeletonPicture } from "./presentation.ts";

export type SkeletonGameProps = {
  // Every skeleton that can be built, in the order the child chooses from.
  skeletons: readonly Skeleton[];
  skeletonPicture: SkeletonPicture;
  bodyPicture: (dinosaurId: string) => string;
  loadPicture: LoadPicture;
  startTimer: StartTimer;
};

// The longest a puzzle waits for its pictures, in milliseconds, as a
// question does for its pictures.
const PICTURE_WAIT = 1000;

type SkeletonScreen = { kind: "choice" } | { kind: "puzzle"; puzzle: Puzzle };

// The skeleton game, kept by the app above its orientation gate, so
// turning the iPad pauses a puzzle without losing it. `onHome` takes the
// child back to the home page.
export function useSkeletonGame({ skeletons, skeletonPicture, bodyPicture, loadPicture, startTimer }: SkeletonGameProps, onHome: () => void) {
  const [screen, setScreen] = useState<SkeletonScreen>({ kind: "choice" });
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

  const home = () => {
    leave();
    onHome();
  };

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
        return <SkeletonPuzzleScreen language={language} {...presentPuzzle(screen.puzzle, language, skeletonPicture)} onMuseum={museum} onHome={home} />;
    }
  };

  return { content };
}
