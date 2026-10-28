import { useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import type { Language } from "./language/language.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice } from "./startLevel.ts";
import { WhoseJawDestination, WhoseJawWelcomeScreen } from "./WhoseJawWelcomeScreen.tsx";

export type WhoseJawSaved = {
  best: Readonly<Record<AgeLevel, number | null>>;
  earned: readonly string[];
  levelChoice: LevelChoice | undefined;
};
export type WhoseJawProgressStore = {
  load(): WhoseJawSaved | undefined;
  saveLevel(choice: LevelChoice): void;
};
export type WhoseJawGameProps = {
  progress: WhoseJawProgressStore;
  total: number;
  jawPicture: string;
  gummyPicture: string;
};
type WhoseJawScreen = { kind: "welcome" } | { kind: "board"; level: AgeLevel } | { kind: "shelf" };
export type WhoseJawPhase = WhoseJawScreen["kind"];
const LEVELS = ["hatchling", "explorer", "paleontologist"] as const;

export function transitionFor(from: WhoseJawScreen, to: WhoseJawScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

export function useWhoseJawGame(props: WhoseJawGameProps | undefined, setting: AgeLevelSetting, onHome: () => void, onStart: () => void) {
  const { screen, go, set } = useScreens<WhoseJawScreen>({ kind: "welcome" }, transitionFor);
  const [kept, setKept] = useState<WhoseJawSaved>(() => props?.progress.load() ?? {
    best: { hatchling: null, explorer: null, paleontologist: null }, earned: [], levelChoice: undefined
  });
  const latest = useRef(kept);
  const level = startLevel(setting, LEVELS, kept.levelChoice);
  const chooseLevel = (chosen: AgeLevel) => {
    if (!props || screen.kind !== "welcome" || chosen === startLevel(setting, LEVELS, latest.current.levelChoice)) return;
    const levelChoice = { level: chosen, revision: setting.revision };
    latest.current = { ...latest.current, levelChoice };
    setKept(latest.current);
    props.progress.saveLevel(levelChoice);
  };
  const welcome = () => go({ kind: "welcome" });
  const home = () => go({ kind: "welcome" }, { also: onHome });
  const play = () => go((current) => current.kind === "welcome"
    ? { kind: "board", level: startLevel(setting, LEVELS, latest.current.levelChoice) } : current, { also: onStart });
  const shelf = () => go((current) => current.kind === "welcome" ? { kind: "shelf" } : current);
  const content = (language: Language) => !props ? null : screen.kind === "welcome"
    ? <WhoseJawWelcomeScreen language={language} level={level} best={kept.best[level]} collected={kept.earned.length} total={props.total}
        jawPicture={props.jawPicture} gummyPicture={props.gummyPicture} onLevel={chooseLevel} onPlay={play} onShelf={shelf} onHome={home} />
    : <WhoseJawDestination key={screen.kind} language={language} shelf={screen.kind === "shelf"} jawPicture={props.jawPicture} onBack={welcome} onHome={home} />;
  return { content, phase: screen.kind, best: kept.best[level], collected: kept.earned.length, open: () => set({ kind: "welcome" }) };
}
