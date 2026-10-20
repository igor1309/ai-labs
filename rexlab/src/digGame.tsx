import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import {
  BRUSH_SIZES,
  awaitsHelp,
  brushRound,
  digUp,
  dugUpOf,
  mergeProgress,
  NO_DIG,
  pickRound,
  startRound,
  strongRound,
  waitForHelp,
  type DigDinosaur,
  type DigProgress,
  type DigReward,
  type DigRound,
  type KeptDig,
  type Random
} from "./dig/index.ts";
import { DigBoardScreen, type SandContext, type SandMark } from "./DigBoardScreen.tsx";
import { DigRevealScreen, STAR_LANDS } from "./DigRevealScreen.tsx";
import { acceptOffer, countBoard, NO_LEVEL_OFFER, offeredLevel, showOffer, type LevelOffer } from "./levelOffer.ts";
import { usePicture, type PictureLook } from "./Picture.tsx";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
import { presentDigBoard } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

export type { SandContext } from "./DigBoardScreen.tsx";
export { STAR_LANDS } from "./DigRevealScreen.tsx";

// What the dig game keeps: its collection, the child's level choice
// and the run of strong rounds for its next level offer.
export type DigSaved = { progress: DigProgress; levelChoice: LevelChoice | undefined; levelOffer: LevelOffer };

export type DigProgressStore = {
  // What the dig game has kept so far, or undefined when it cannot be
  // read at all.
  load(): DigSaved | undefined;
  save(saved: DigSaved): void;
};

export type DigGameProps = {
  // Every dinosaur a round may dig up, with its cells.
  digDinosaurs: readonly DigDinosaur[];
  digProgress: DigProgressStore;
  // The name of the dinosaur with this id, in `language`.
  dinosaurName: (dinosaurId: string, language: Language) => string;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
  startTimer: StartTimer;
  presence: { isAway(): boolean; subscribe(onChange: () => void): () => void };
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
  sandContext: SandContext;
};

const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];
const HELP_TICK = 1000;

// How long the gust blows the sand away before the reveal, in
// milliseconds: the gust's animation of twice --motion-screen, and its
// fade with reduced motion.
export const GUST: Record<"motion" | "reduced", number> = { motion: 640, reduced: 320 };

// The progress the game goes by while the app is open, with the child's
// choice on the level switch; both hold while the app is open even when
// they cannot be saved.
type Kept = KeptDig & { levelChoice: LevelChoice | undefined; levelOffer: LevelOffer };

// The reveal shows the round dug up and its reward; it takes taps once
// its star has `landed`.
type DigScreen = { kind: "board"; round: DigRound } | { kind: "reveal"; round: DigRound; reward: DigReward; landed: boolean; offer: AgeLevel | undefined };

// A round started, even over one left on HOME and still kept, or its
// reveal, is the plain screen change; a stroke of the brush changes the
// board at once.
export function transitionFor(from: DigScreen | undefined, to: DigScreen | undefined, intent: "start" | undefined): string | undefined {
  return intent === "start" || from?.kind !== to?.kind ? SCREEN_CHANGE : undefined;
}

// The dig game, kept by its owner above the orientation gate, so turning
// the iPad pauses a round without losing its sand. It shows nothing until
// a round is started. `ageLevel` is the age level a parent picked, which
// the game starts at until the child chooses another level on its
// switch. `onHome` takes the child back to the home page.
export function useDigGame(
  { digDinosaurs, digProgress, dinosaurName, bodyPicture, random, startTimer, presence, reducedMotion, sandContext }: DigGameProps,
  ageLevel: AgeLevelSetting,
  onHome: () => void,
  onStart: () => void
) {
  const { screen, go } = useScreens<DigScreen | undefined, "start">(undefined, transitionFor);
  const revealRound = screen?.kind === "reveal" ? screen.round : undefined;
  const onLanded = useCallback((landed: boolean) => {
    go((current) => current?.kind === "reveal" && current.round === revealRound && current.landed !== landed ? { ...current, landed } : current);
  }, [go, revealRound]);
  const away = useSyncExternalStore(presence.subscribe, presence.isAway);
  const ids = digDinosaurs.map(({ id }) => id);
  // Progress is read once, as the app opens, and kept from then on, so a
  // dinosaur dug up counts while the app is open even when it cannot be
  // saved.
  const [kept, setKept] = useState<Kept>(() => {
    const stored = digProgress.load();
    return { progress: stored?.progress ?? NO_DIG, levelChoice: stored?.levelChoice, levelOffer: stored?.levelOffer ?? NO_LEVEL_OFFER, readable: stored !== undefined };
  });
  const keptNow = useRef(kept);
  // The level the next round plays: the child's choice on the switch
  // while the age level is still the pick it was made under, otherwise
  // the age level.
  const level = startLevel(ageLevel, OFFERED, kept.levelChoice);
  // Kept, then saved over the progress another tab may have saved
  // meanwhile; unreadable progress is not saved over.
  const keep = (next: Kept) => {
    const stored = next.readable ? digProgress.load() : undefined;
    const merged = stored === undefined ? next : { ...next, progress: mergeProgress(next.progress, stored.progress) };
    keptNow.current = merged;
    setKept(merged);
    if (merged.readable) digProgress.save({ progress: merged.progress, levelChoice: merged.levelChoice, levelOffer: merged.levelOffer });
  };
  // A level chosen on the switch is kept under the age level it was
  // chosen at; the level already chosen, as on a double tap, changes
  // nothing.
  const chooseLevel = (chosen: AgeLevel) => {
    // The reveal owns the switch until its reward has landed. The screen
    // also disables the buttons, but keeping the boundary here protects
    // against a queued or programmatic click crossing it.
    if (screen?.kind === "reveal" && !screen.landed) return;
    if (chosen === startLevel(ageLevel, OFFERED, keptNow.current.levelChoice)) return;
    keep({ ...keptNow.current, levelChoice: { level: chosen, revision: ageLevel.revision } });
  };
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

  useEffect(() => {
    return () => {
      live.current = null;
      roundTimers.current?.stopAll();
    };
  }, []);

  const round = screen?.kind === "board" ? screen.round : undefined;
  const counting = round !== undefined && awaitsHelp(round);
  const found = round?.found;
  const helped = round?.helped;
  useEffect(() => {
    const timers = roundTimers.current;
    if (!counting || away || timers === null) return;
    let active = true;
    let stop = () => {};
    const tick = () => {
      stop = timers.start(HELP_TICK, () => {
        const from = live.current;
        // A stopped callback may still arrive after a find, pause or leave.
        if (!active || presence.isAway() || roundTimers.current !== timers || from === null || from.found !== found || from.helped !== helped || !awaitsHelp(from)) return;
        const to = waitForHelp(from, HELP_TICK);
        live.current = to;
        go((current) => (current?.kind === "board" && current.round === from ? { kind: "board", round: to } : current));
        if (awaitsHelp(to)) tick();
      });
    };
    tick();
    return () => {
      active = false;
      stop();
    };
  }, [counting, away, found, helped, presence, go]);

  // A new round shows at once, and only over the screen it was asked
  // from, so a second tap in the same moment starts nothing more. `shown`
  // runs in the same screen change, so the owner can bring the game on
  // screen with its board.
  const start = (shown?: () => void) => {
    const from = screen;
    const round = startRound(digDinosaurs, keptNow.current.progress.dug, last.current, random, startLevel(ageLevel, OFFERED, keptNow.current.levelChoice));
    go((current) => (current === from ? { kind: "board", round } : current), {
      intent: "start",
      also: () => {
        leave();
        live.current = round;
        roundTimers.current = ownedTimers(startTimer);
        onStart();
        shown?.();
      }
    });
  };

  // Each stroke moves from the round as it is. The dinosaur is dug up,
  // and recorded, the moment the gust begins, so leaving during it cannot
  // lose it, and the reveal follows once the gust has blown; a round left
  // before its gust is never recorded. The reveal takes taps once its
  // star has landed.
  const advance = (update: (round: DigRound) => DigRound) => {
    const from = live.current;
    const timers = roundTimers.current;
    if (from === null || timers === null) return;
    const to = update(from);
    if (to === from) return;
    live.current = to;
    go((current) => (current?.kind === "board" && current.round === from ? { kind: "board", round: to } : current));
    if (!to.blown) return;
    last.current = to.dinosaur.id;
    const dug = digUp(keptNow.current, to.dinosaur.id, ids, beatBest, to.level !== "hatchling" && to.rejected.length === 0);
    keep({ ...keptNow.current, ...dug.kept });
    const timing = reducedMotion() ? "reduced" : "motion";
    timers.start(GUST[timing], () => {
      if (live.current !== to) return;
      live.current = null;
      const levelOffer = countBoard(keptNow.current.levelOffer, to.level, strongRound(to));
      keep({ ...keptNow.current, levelOffer });
      go({ kind: "reveal", round: to, reward: dug.reward, landed: false, offer: offeredLevel(levelOffer) });
    });
  };

  const brush = (mark: SandMark) => advance((round) => brushRound(round, mark));
  const pick = (id: string) => advance((round) => pickRound(round, id));

  const home = () => {
    leave();
    onHome();
  };

  const draw = (language: Language, pictureLook: PictureLook) => {
    switch (screen?.kind) {
      case undefined:
        return null;
      case "board":
        return (
          <DigBoardScreen
            language={language}
            pictureLook={pictureLook}
            {...presentDigBoard(screen.round, bodyPicture)}
            level={screen.round.level}
            brush={BRUSH_SIZES[screen.round.level]}
            grains={!reducedMotion()}
            dugUp={kept.readable ? dugUpOf(kept.progress, ids) : undefined}
            total={ids.length}
            sandContext={sandContext}
            onBrush={brush}
            onPick={pick}
            onHome={home}
          />
        );
      case "reveal": {
        const { id } = screen.round.dinosaur;
        return (
          <DigRevealScreen
            language={language}
            pictureLook={pictureLook}
            name={dinosaurName(id, language)}
            picture={bodyPicture(id)}
            {...screen.reward}
            landed={screen.landed}
            startTimer={startTimer}
            landingWait={STAR_LANDS[reducedMotion() ? "reduced" : "motion"]}
            onLanded={onLanded}
            level={level}
            onLevel={chooseLevel}
            offer={screen.offer ? {
              level: screen.offer,
              startTimer,
              onShown: () => keep({ ...keptNow.current, levelOffer: showOffer(keptNow.current.levelOffer) }),
              onYes: () => {
                const nextLevel = screen.offer;
                if (!nextLevel) return;
                keep({ ...keptNow.current, levelOffer: acceptOffer(keptNow.current.levelOffer), levelChoice: { level: nextLevel, revision: ageLevel.revision } });
                go((current) => current?.kind === "reveal" ? { ...current, offer: undefined } : current);
              },
              onNotNow: () => go((current) => current?.kind === "reveal" ? { ...current, offer: undefined } : current)
            } : null}
            onDigAgain={() => start()}
            onHome={home}
          />
        );
      }
    }
  };

  // One picture subscription spans the board and reveal, preserving a
  // failed or timed-out picture's look through the gust.
  const content = (language: Language) => screen === undefined ? null : (
    <RoundPicture src={bodyPicture(screen.round.dinosaur.id)}>{(look) => draw(language, look)}</RoundPicture>
  );

  const dugUp = kept.readable ? dugUpOf(kept.progress, ids) : 0;
  // The count on the game's home tile, undefined until a dinosaur is dug
  // up, or when stored progress cannot be read.
  return { start, content, dugUp: dugUp > 0 ? dugUp : undefined };
}

function RoundPicture({ src, children }: { src: string; children: (look: PictureLook) => ReactNode }) {
  return children(usePicture(src));
}
