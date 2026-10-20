import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import {
  BRUSH_SIZES,
  awaitsHelp,
  brushRound,
  digUp,
  dugUpOf,
  keepTreasure,
  mergeProgress,
  NO_DIG,
  pickRound,
  roundTreasureFound,
  startRound,
  strongRound,
  TREASURE_KINDS,
  treasuresFound,
  waitForHelp,
  type DigDinosaur,
  type DigProgress,
  type DigReward,
  type DigRound,
  type KeptDig,
  type Random,
  type Treasure
} from "./dig/index.ts";
import { BOARD_DROP, COUNT_SETTLE, GUST, LIFT, TREASURE_FLIGHT, DigBoardScreen, type BoardFinish, type SandContext, type SandMark, type TreasureFlight } from "./DigBoardScreen.tsx";
import { DigFieldGuideScreen } from "./DigFieldGuideScreen.tsx";
import { DigRevealScreen, STAR_LANDS } from "./DigRevealScreen.tsx";
import { acceptOffer, countBoard, NO_LEVEL_OFFER, offeredLevel, showOffer, type LevelOffer } from "./levelOffer.ts";
import { usePicture, type PictureLook } from "./Picture.tsx";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
import { presentDigBoard } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";
import { TREASURE_PICTURES } from "./treasurePictures.ts";

export { BOARD_DROP, COUNT_SETTLE, GUST, LIFT, TREASURE_FLIGHT } from "./DigBoardScreen.tsx";
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
export const DIG_REVEAL = "dig-reveal";

// The progress the game goes by while the app is open, with the child's
// choice on the level switch; both hold while the app is open even when
// they cannot be saved.
type Kept = KeptDig & { levelChoice: LevelChoice | undefined; levelOffer: LevelOffer };

// The board shows the round, its finish once the gust begins, and its
// treasure's flight once found; `dropped` once it has dropped in and comes
// back from the FIELD GUIDE. The reveal shows the round dug up and its
// reward; it takes taps once its last item has arrived (`landed`). The
// FIELD GUIDE keeps the board or reveal it was opened from `under` it,
// where the round goes on as it does while the iPad is turned.
type BoardScreen = { kind: "board"; round: DigRound; finish?: BoardFinish; treasure?: TreasureFlight; dropped?: true };
type RevealScreen = { kind: "reveal"; round: DigRound; reward: DigReward; landed: boolean; offer: AgeLevel | undefined };
type DigScreen = BoardScreen | RevealScreen | { kind: "guide"; under: BoardScreen | RevealScreen };

// A round started, even over one left on HOME and still kept, or its
// reveal, is the plain screen change; a stroke of the brush changes the
// board at once.
export function transitionFor(from: DigScreen | undefined, to: DigScreen | undefined, intent: "start" | undefined): string | undefined {
  if (from?.kind === "board" && to?.kind === "reveal") return DIG_REVEAL;
  return intent === "start" || from?.kind !== to?.kind ? SCREEN_CHANGE : undefined;
}

// The screen with the board changed, shown or under the FIELD GUIDE,
// while its round is still `of` it; any other screen as it is.
function changeBoard(screen: DigScreen | undefined, of: (round: DigRound) => boolean, change: (board: BoardScreen) => BoardScreen): DigScreen | undefined {
  if (screen?.kind === "board" && of(screen.round)) return change(screen);
  if (screen?.kind === "guide" && screen.under.kind === "board" && of(screen.under.round)) return { ...screen, under: change(screen.under) };
  return screen;
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
  // `next` with the progress another tab may have saved meanwhile;
  // unreadable progress is not read.
  const withStored = (next: Kept): Kept => {
    const stored = next.readable ? digProgress.load() : undefined;
    return stored === undefined ? next : { ...next, progress: mergeProgress(next.progress, stored.progress) };
  };
  // Kept, and saved where the progress could be read.
  const store = (merged: Kept) => {
    keptNow.current = merged;
    setKept(merged);
    if (merged.readable) digProgress.save({ progress: merged.progress, levelChoice: merged.levelChoice, levelOffer: merged.levelOffer });
  };
  // Kept, then saved over the progress another tab may have saved
  // meanwhile.
  const keep = (next: Kept) => store(withStored(next));
  // A level chosen on the switch is kept under the age level it was
  // chosen at; the level already chosen, as on a double tap, changes
  // nothing.
  const chooseLevel = (chosen: AgeLevel) => {
    // The reveal owns the switch until its last item arrives. The screen
    // also disables the buttons, but keeping the boundary here protects
    // against a queued or programmatic click crossing it.
    if (screen?.kind === "reveal" && !screen.landed) return;
    if (chosen === startLevel(ageLevel, OFFERED, keptNow.current.levelChoice)) return;
    keep({ ...keptNow.current, levelChoice: { level: chosen, revision: ageLevel.revision } });
  };
  // The live round, ahead of the screen: strokes and reward timers act
  // on the round as it is, not as last rendered. Null once the child
  // leaves it or the reveal starts.
  const live = useRef<DigRound | null>(null);
  // The round's help, gust and reward timers, stopped as the child
  // leaves it.
  const roundTimers = useRef<OwnedTimers | null>(null);
  // The dinosaur of the last round finished, so a round once every
  // dinosaur is dug up digs up another.
  const last = useRef<string | undefined>(undefined);
  // Lands the treasure in flight, as the board's flight ends, the FIELD
  // GUIDE opens or the reveal comes, whichever is first; null once it has
  // landed or the round is left.
  const landing = useRef<(() => void) | null>(null);

  const leave = () => {
    live.current = null;
    landing.current = null;
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
        go((current) => changeBoard(current, (round) => round === from, (board) => ({ ...board, round: to })));
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

  // A found treasure flies into the FIELD GUIDE and is kept as it lands,
  // even when the gust has begun meanwhile; a round left before then
  // stops its flight and keeps nothing. The board shown owns the flight's
  // wait, as a turn of the iPad starts the flight again. It lands one more
  // of its kind on the count stored last, as another tab may have found
  // one meanwhile.
  const fly = (treasure: Treasure, timers: OwnedTimers) => {
    const show = (shown: TreasureFlight) => go((current) => changeBoard(current, (round) => round.treasure === treasure, (board) => ({ ...board, treasure: shown })));
    const land = () => {
      if (landing.current !== land || roundTimers.current !== timers) return;
      landing.current = null;
      const latest = withStored(keptNow.current);
      store({ ...latest, progress: keepTreasure(latest.progress, treasure.kind) });
      show({ phase: "landed", fresh: (latest.progress.treasures[treasure.kind] ?? 0) === 0 });
    };
    landing.current = land;
    show({ phase: "flying", startTimer: timers.start, onLanded: land });
  };

  // Each stroke moves from the round as it is. The dinosaur is dug up,
  // and recorded, the moment the gust begins, so leaving during it cannot
  // lose it, and the reveal follows the lift and reward; a round left
  // before its gust is never recorded. The reveal takes taps once its
  // last item has arrived.
  const advance = (update: (round: DigRound) => DigRound) => {
    const from = live.current;
    const timers = roundTimers.current;
    if (from === null || timers === null) return;
    const to = update(from);
    if (to === from) return;
    live.current = to;
    go((current) => changeBoard(current, (round) => round === from, (board) => ({ ...board, round: to })));
    if (to.treasure && !roundTreasureFound(from) && roundTreasureFound(to)) fly(to.treasure, timers);
    if (!to.blown) return;
    last.current = to.dinosaur.id;
    const dug = digUp(keptNow.current, to.dinosaur.id, ids, beatBest, to.level !== "hatchling" && to.rejected.length === 0);
    keep({ ...keptNow.current, ...dug.kept });
    const timing = reducedMotion() ? "reduced" : "motion";
    const showPhase = (phase: "gust" | "lift" | "counted") => go((current) =>
      changeBoard(current, (round) => round === to, (board) => ({ ...board, finish: { newStar: dug.reward.newStar, phase, startTimer: timers.start, onLifted } })));
    // A reveal due while the FIELD GUIDE is open waits under it. A
    // treasure still in flight, its flight started again by a turn of the
    // iPad, lands as the board goes.
    const reveal = () => {
      if (live.current !== to || roundTimers.current !== timers) return;
      landing.current?.();
      live.current = null;
      const levelOffer = countBoard(keptNow.current.levelOffer, to.level, strongRound(to));
      keep({ ...keptNow.current, levelOffer });
      const shown: RevealScreen = { kind: "reveal", round: to, reward: dug.reward, landed: false, offer: offeredLevel(levelOffer) };
      go((current) => (current?.kind === "guide" ? { ...current, under: shown } : shown));
    };
    const onLifted = () => {
      if (live.current !== to || roundTimers.current !== timers) return;
      if (!dug.reward.newStar || dug.reward.dugUp === undefined || timing === "reduced") return reveal();
      showPhase("counted");
      timers.start(COUNT_SETTLE[timing], reveal);
    };
    showPhase("gust");
    timers.start(GUST[timing], () => {
      if (live.current !== to || roundTimers.current !== timers) return;
      showPhase("lift");
    });
  };

  const brush = (mark: SandMark) => advance((round) => brushRound(round, mark));
  const pick = (id: string) => advance((round) => pickRound(round, id));

  const home = () => {
    leave();
    onHome();
  };

  // The FIELD GUIDE opens over the round, a treasure in flight landing
  // there and then, or over the reveal once it takes taps; it is no
  // start. BACK gives back the round with no drop, or the reveal as it
  // was.
  const openGuide = () => {
    landing.current?.();
    go((current) => (current?.kind === "board" || (current?.kind === "reveal" && current.landed) ? { kind: "guide", under: current } : current));
  };
  const back = () => go((current) => (current?.kind !== "guide" ? current : current.under.kind === "board" ? { ...current.under, dropped: true } : current.under));

  const draw = (language: Language, pictureLook: PictureLook) => {
    switch (screen?.kind) {
      case undefined:
        return null;
      case "board":
        return (
          <DigBoardScreen
            key={screen.round.dinosaur.id}
            dropped={screen.dropped}
            language={language}
            pictureLook={pictureLook}
            arrivalWait={BOARD_DROP[reducedMotion() ? "reduced" : "motion"]}
            gustWait={GUST[reducedMotion() ? "reduced" : "motion"]}
            liftWait={LIFT[reducedMotion() ? "reduced" : "motion"]}
            flightWait={TREASURE_FLIGHT[reducedMotion() ? "reduced" : "motion"]}
            finish={screen.finish}
            treasureFlight={screen.treasure}
            {...presentDigBoard(screen.round, bodyPicture, (kind) => TREASURE_PICTURES[kind])}
            choiceCount={screen.round.choices.length}
            level={screen.round.level}
            brush={BRUSH_SIZES[screen.round.level]}
            grains={!reducedMotion()}
            dugUp={kept.readable ? dugUpOf(kept.progress, ids) : undefined}
            total={ids.length}
            treasures={treasuresFound(kept.progress)}
            sandContext={sandContext}
            onBrush={brush}
            onPick={pick}
            onHome={home}
            onFieldGuide={openGuide}
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
            treasures={treasuresFound(kept.progress)}
            landed={screen.landed}
            reducedMotion={reducedMotion()}
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
            onFieldGuide={openGuide}
          />
        );
      }
      case "guide":
        return (
          <DigFieldGuideScreen
            language={language}
            cards={TREASURE_KINDS.map((kind) => ({ kind, picture: TREASURE_PICTURES[kind], count: kept.progress.treasures[kind] ?? 0 }))}
            onBack={back}
            onHome={home}
          />
        );
    }
  };

  // One picture subscription spans the board, the reveal and the FIELD
  // GUIDE between them, preserving a failed or timed-out picture's look
  // through the gust.
  const content = (language: Language) => screen === undefined ? null : (
    <RoundPicture src={bodyPicture((screen.kind === "guide" ? screen.under : screen).round.dinosaur.id)}>{(look) => draw(language, look)}</RoundPicture>
  );

  const dugUp = kept.readable ? dugUpOf(kept.progress, ids) : 0;
  // The count on the game's home tile, undefined until a dinosaur is dug
  // up, or when stored progress cannot be read.
  return { start, content, dugUp: dugUp > 0 ? dugUp : undefined };
}

function RoundPicture({ src, children }: { src: string; children: (look: PictureLook) => ReactNode }) {
  return children(usePicture(src));
}
