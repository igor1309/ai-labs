import { useEffect, useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import { LabyrinthBoardScreen } from "./LabyrinthBoardScreen.tsx";
import { LabyrinthResultScreen, type LabyrinthResultScreenProps } from "./LabyrinthResultScreen.tsx";
import { adjacentPaths, hintInMaze, isPath, moveInMaze, nextMaze, NO_LABYRINTH, rewardMaze, startMaze, type LabyrinthProgress, type LabyrinthReward, type LabyrinthRound } from "./labyrinth/index.ts";
import type { Language } from "./language/language.ts";
import { LevelOfferDialog, type LevelOfferProps } from "./LevelOfferDialog.tsx";
import { acceptOffer, countBoard, NO_LEVEL_OFFER, offeredLevel, showOffer, type LevelOffer } from "./levelOffer.ts";
import { useGateShown } from "./OrientationGate.tsx";
import type { StartTimer } from "./ownedTimers.ts";
import { afterResultAnimations } from "./resultAnimation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice } from "./startLevel.ts";

export type LabyrinthSaved = { progress: LabyrinthProgress; levelChoice: LevelChoice | undefined; offer: LevelOffer };
export type LabyrinthProgressStore = {
  load(): LabyrinthSaved | undefined;
  save(saved: LabyrinthSaved): void;
};
export type LabyrinthGameProps = {
  labyrinthProgress: LabyrinthProgressStore;
  bodyPicture: (id: string) => string;
  random: () => number;
  startTimer: StartTimer;
};

type LabyrinthScreen =
  | { kind: "board"; round: LabyrinthRound }
  | { kind: "result"; reward: LabyrinthReward; offer: AgeLevel | undefined };
export type LabyrinthPhase = LabyrinthScreen["kind"];
const LEVELS = ["hatchling", "explorer", "paleontologist"] as const;

export function transitionFor(from: LabyrinthScreen | undefined, to: LabyrinthScreen | undefined, intent: "start" | undefined): string | undefined {
  return intent === "start" || from?.kind !== to?.kind ? SCREEN_CHANGE : undefined;
}

export function useLabyrinthGame({ labyrinthProgress, bodyPicture, random, startTimer }: LabyrinthGameProps, ageLevel: AgeLevelSetting, onHome: () => void, onStart: () => void) {
  const { screen, go } = useScreens<LabyrinthScreen | undefined, "start">(undefined, transitionFor);
  // Session rewards remain usable even when browser storage is blocked.
  const [kept, setKept] = useState<LabyrinthSaved>(() => labyrinthProgress.load() ?? { progress: NO_LABYRINTH, levelChoice: undefined, offer: NO_LEVEL_OFFER });
  const latest = useRef(kept);
  const lastMaze = useRef<string | undefined>(undefined);
  const level = startLevel(ageLevel, LEVELS, kept.levelChoice);
  const keep = (next: LabyrinthSaved) => {
    latest.current = next;
    setKept(next);
    labyrinthProgress.save(next);
  };
  const chooseLevel = (chosen: AgeLevel) => {
    if (chosen !== startLevel(ageLevel, LEVELS, latest.current.levelChoice)) keep({ ...latest.current, levelChoice: { level: chosen, revision: ageLevel.revision } });
  };
  const home = () => go(undefined, { also: onHome });
  const start = (shown?: () => void) => {
    const from = screen;
    const maze = nextMaze(startLevel(ageLevel, LEVELS, latest.current.levelChoice), lastMaze.current, random());
    go((current) => current === from ? { kind: "board", round: startMaze(maze) } : current, {
      intent: "start",
      also: () => { lastMaze.current = maze.id; onStart(); shown?.(); }
    });
  };
  const move = (destination: number) => {
    if (screen?.kind !== "board") return;
    const from = screen;
    const round = moveInMaze(from.round, destination);
    if (round === from.round) return;
    const reward = rewardMaze(round, latest.current.progress, beatBest);
    const offer = reward ? countBoard(latest.current.offer, round.maze.level, !round.hinted) : latest.current.offer;
    const next: LabyrinthScreen = reward ? { kind: "result", reward, offer: offeredLevel(offer) } : { kind: "board", round };
    go((current) => current === from ? next : current, {
      also: () => { if (reward) keep({ ...latest.current, progress: reward.progress, offer }); }
    });
  };
  const hint = () => go((current) => current?.kind === "board" ? { ...current, round: hintInMaze(current.round) } : current);
  const content = (language: Language) => {
    const picture = bodyPicture("triceratops");
    if (screen?.kind === "board") {
      const { round } = screen;
      const { maze } = round;
      const columns = maze.rows[0]!.length;
      const legal = adjacentPaths(maze, round.position);
      return <LabyrinthBoardScreen language={language} level={maze.level} columns={columns} rows={maze.rows.length}
        cells={Array.from({ length: columns * maze.rows.length }, (_, place) => ({ open: isPath(maze, place), legal: legal.includes(place) }))}
        baby={round.position} from={round.from} goal={maze.goal} hint={round.hint} finished={false} picture={picture}
        onMove={move} onHint={hint} onHome={home} />;
    }
    if (screen?.kind === "result") {
      const nextLevel = screen.offer;
      return <Reunion language={language} picture={picture} level={level} onLevel={chooseLevel}
        totalStars={kept.progress.stars} best={screen.reward.best} beaten={screen.reward.beaten} celebration={screen.reward.celebration}
        onPlayAgain={() => start()} onHome={home}
        offer={nextLevel ? {
          level: nextLevel, startTimer,
          onShown: () => keep({ ...latest.current, offer: showOffer(latest.current.offer) }),
          onYes: () => keep({ ...latest.current, offer: acceptOffer(latest.current.offer), levelChoice: { level: nextLevel, revision: ageLevel.revision } }),
          onNotNow: () => {}
        } : undefined} />;
    }
    return null;
  };
  return { start, content, phase: screen?.kind, stars: kept.progress.stars > 0 ? kept.progress.stars : undefined };
}

// The offer waits for the visible reward and keeps controls blocked until
// its exit ends. The gate pauses both waits when the result is covered.
function Reunion({ offer, ...props }: LabyrinthResultScreenProps & { offer: LevelOfferProps | undefined }) {
  const gateShown = useGateShown();
  const result = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"waiting" | "shown" | "leaving" | "gone">("waiting");
  const latestOffer = useRef(offer);
  latestOffer.current = offer;
  const startTimer = offer?.startTimer;
  useEffect(() => {
    if (gateShown || phase !== "waiting" || !startTimer || !result.current) return;
    return afterResultAnimations([...result.current.querySelectorAll(".star-won, .celebration")], startTimer, () => setPhase("shown"));
  }, [gateShown, phase, startTimer]);
  useEffect(() => {
    if (!gateShown && phase === "gone") result.current?.querySelector<HTMLButtonElement>(".labyrinth-reunion-actions button")?.focus();
  }, [gateShown, phase]);
  const shown = latestOffer.current;
  return <LabyrinthResultScreen {...props} ref={result} levelOffer={shown && (phase === "shown" || phase === "leaving") ?
    <LevelOfferDialog language={props.language} offer={shown} leaving={phase === "leaving"} onShown={shown.onShown}
      onAnswer={(answer) => { setPhase("leaving"); if (answer === "yes") shown.onYes(); else shown.onNotNow(); }}
      onGone={() => setPhase("gone")} /> : undefined} />;
}
