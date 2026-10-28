import { useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import type { Language } from "./language/language.ts";
import { PicturePuzzleChoiceScreen } from "./PicturePuzzleChoiceScreen.tsx";
import { startPicturePuzzle, type PictureDinosaur, type PicturePuzzle } from "./picturePuzzle/index.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

export type PicturePuzzleChoiceSaved = { earned: readonly string[]; levelChoice: LevelChoice | undefined };
export type PicturePuzzleChoiceStore = {
  load(): PicturePuzzleChoiceSaved | undefined;
  saveLevel(choice: LevelChoice): void;
};
export type PicturePuzzleGameProps = {
  dinosaurs: readonly PictureDinosaur[];
  bodyPicture: (id: string) => string;
  choiceStore: PicturePuzzleChoiceStore;
  random: () => number;
};

type PicturePuzzleScreen = { kind: "choice" } | { kind: "puzzle"; puzzle: PicturePuzzle };
type KeptChoice = PicturePuzzleChoiceSaved & { readable: boolean };
const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

export function transitionFor(from: PicturePuzzleScreen, to: PicturePuzzleScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

export function usePicturePuzzleGame({ dinosaurs, bodyPicture, choiceStore, random }: PicturePuzzleGameProps, setting: AgeLevelSetting, onHome: () => void) {
  const { screen, go } = useScreens<PicturePuzzleScreen>({ kind: "choice" }, transitionFor);
  const [kept, setKept] = useState<KeptChoice>(() => {
    const saved = choiceStore.load();
    return { earned: saved?.earned ?? [], levelChoice: saved?.levelChoice, readable: saved !== undefined };
  });
  const keptNow = useRef<KeptChoice>(kept);
  const live = useRef<PicturePuzzle | undefined>(undefined);
  const level = startLevel(setting, OFFERED, kept.levelChoice);

  const chooseLevel = (chosen: AgeLevel) => {
    if (live.current !== undefined || chosen === startLevel(setting, OFFERED, keptNow.current.levelChoice)) return;
    const levelChoice = { level: chosen, revision: setting.revision };
    const next = { ...keptNow.current, levelChoice };
    keptNow.current = next;
    setKept(next);
    if (next.readable) choiceStore.saveLevel(levelChoice);
  };

  const choose = (id: string) => {
    if (live.current !== undefined) return;
    const dinosaur = dinosaurs.find((each) => each.id === id);
    if (!dinosaur) return;
    const puzzle = startPicturePuzzle(dinosaur, startLevel(setting, OFFERED, keptNow.current.levelChoice), random);
    go((current) => current.kind === "choice"
      ? { kind: "puzzle", puzzle }
      : current, { also: () => { live.current = puzzle; } });
  };
  const back = () => {
    live.current = undefined;
    go({ kind: "choice" });
  };
  const home = () => {
    live.current = undefined;
    go({ kind: "choice" }, { also: onHome });
  };

  // Board and result rendering are supplied as those screens land; the
  // choice already hands its caller a fresh puzzle at the chosen level.
  const choice = (language: Language) => screen.kind === "choice" ? (
    <PicturePuzzleChoiceScreen language={language} level={level} onLevel={chooseLevel} onChoose={choose} onHome={home}
      choices={dinosaurs.map(({ id, name }) => ({ id, name: name[language], picture: bodyPicture(id), earned: kept.earned.includes(id) }))} />
  ) : null;

  return { choice, puzzle: screen.kind === "puzzle" ? screen.puzzle : undefined, level, back, home };
}
