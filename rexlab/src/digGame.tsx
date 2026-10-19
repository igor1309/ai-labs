import { useRef, useState } from "react";
import { BRUSH_SIZES, brushRound, startRound, type DigDinosaur, type DigLevel, type DigRound, type Random } from "./dig/index.ts";
import { DigBoardScreen, type SandContext, type SandMark } from "./DigBoardScreen.tsx";
import { DigRevealScreen } from "./DigRevealScreen.tsx";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
import { presentDigBoard } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";

export type { SandContext } from "./DigBoardScreen.tsx";

export type DigGameProps = {
  // Every dinosaur a round may dig up, with its cells.
  digDinosaurs: readonly DigDinosaur[];
  // The name of the dinosaur with this id, in `language`.
  dinosaurName: (dinosaurId: string, language: Language) => string;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
  startTimer: StartTimer;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
  sandContext: SandContext;
};

// Every age level plays Hatchling's free brushing until Explorer's and
// Paleontologist's tasks are built.
const LEVEL: DigLevel = "hatchling";

// How long the gust blows the sand away before the reveal, in
// milliseconds: the gust's animation of twice --motion-screen, and its
// fade with reduced motion.
export const GUST: Record<"motion" | "reduced", number> = { motion: 640, reduced: 320 };

type DigScreen = { kind: "board"; round: DigRound } | { kind: "reveal"; round: DigRound };

// A round started, even over one left on HOME and still kept, or its
// reveal, is the plain screen change; a stroke of the brush changes the
// board at once.
export function transitionFor(from: DigScreen | undefined, to: DigScreen | undefined, intent: "start" | undefined): string | undefined {
  return intent === "start" || from?.kind !== to?.kind ? SCREEN_CHANGE : undefined;
}

// The dig game, kept by its owner above the orientation gate, so turning
// the iPad pauses a round without losing its sand. It shows nothing until
// a round is started. `onHome` takes the child back to the home page.
export function useDigGame(
  { digDinosaurs, dinosaurName, bodyPicture, random, startTimer, reducedMotion, sandContext }: DigGameProps,
  onHome: () => void
) {
  const { screen, go } = useScreens<DigScreen | undefined, "start">(undefined, transitionFor);
  // The ids of the dinosaurs dug up while the app is open.
  const [dug, setDug] = useState<readonly string[]>([]);
  const dugNow = useRef<readonly string[]>([]);
  // The round being brushed, ahead of the screen: a stroke, or the gust's
  // timer, acts on the round as it is, not as last rendered. Null once
  // the child leaves it or the gust has blown.
  const live = useRef<DigRound | null>(null);
  // The gust's timer of the round being brushed, stopped as the child
  // leaves it.
  const roundTimers = useRef<OwnedTimers | null>(null);
  // The dinosaur of the last round finished, so a round once every
  // dinosaur is dug up digs up another.
  const last = useRef<string | undefined>(undefined);

  const leave = () => {
    live.current = null;
    roundTimers.current?.stopAll();
    roundTimers.current = null;
  };

  // A new round shows at once, and only over the screen it was asked
  // from, so a second tap in the same moment starts nothing more. `shown`
  // runs in the same screen change, so the owner can bring the game on
  // screen with its board.
  const start = (shown?: () => void) => {
    const from = screen;
    const round = startRound(digDinosaurs, dugNow.current, last.current, random);
    go((current) => (current === from ? { kind: "board", round } : current), {
      intent: "start",
      also: () => {
        leave();
        live.current = round;
        roundTimers.current = ownedTimers(startTimer);
        shown?.();
      }
    });
  };

  // Each stroke moves from the round as it is. The dinosaur is dug up the
  // moment the gust begins, so leaving during it cannot lose it, and the
  // reveal follows once the gust has blown.
  const brush = (mark: SandMark) => {
    const from = live.current;
    const timers = roundTimers.current;
    if (from === null || timers === null) return;
    const to = brushRound(from, mark);
    if (to === from) return;
    live.current = to;
    go((current) => (current?.kind === "board" && current.round === from ? { kind: "board", round: to } : current));
    if (!to.blown) return;
    last.current = to.dinosaur.id;
    if (!dugNow.current.includes(to.dinosaur.id)) {
      dugNow.current = [...dugNow.current, to.dinosaur.id];
      setDug(dugNow.current);
    }
    timers.start(GUST[reducedMotion() ? "reduced" : "motion"], () => {
      if (live.current !== to) return;
      live.current = null;
      go({ kind: "reveal", round: to });
    });
  };

  const home = () => {
    leave();
    onHome();
  };

  const content = (language: Language) => {
    switch (screen?.kind) {
      case undefined:
        return null;
      case "board":
        return (
          <DigBoardScreen
            language={language}
            {...presentDigBoard(screen.round, bodyPicture)}
            brush={BRUSH_SIZES[LEVEL]}
            grains={!reducedMotion()}
            dugUp={dug.length}
            total={digDinosaurs.length}
            sandContext={sandContext}
            onBrush={brush}
            onHome={home}
          />
        );
      case "reveal": {
        const { id } = screen.round.dinosaur;
        return <DigRevealScreen language={language} name={dinosaurName(id, language)} picture={bodyPicture(id)} onHome={home} />;
      }
    }
  };

  // The count on the game's home tile, undefined until a dinosaur is dug
  // up.
  return { start, content, dugUp: dug.length > 0 ? dug.length : undefined };
}
