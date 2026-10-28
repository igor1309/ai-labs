import { useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { PicturePuzzleChoiceScreen } from "./PicturePuzzleChoiceScreen.tsx";
import { PicturePuzzleBoardScreen } from "./PicturePuzzleBoardScreen.tsx";
import { PicturePuzzleResultScreen } from "./PicturePuzzleResultScreen.tsx";
import { collectedPictures, finishPicture, fitPicturePiece, mergePictures, NO_PICTURES, pictureComplete, startPicturePuzzle, type PictureDinosaur, type PictureProgress, type PicturePuzzle, type PictureResult } from "./picturePuzzle/index.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

export type PicturePuzzleChoiceSaved = { earned: readonly string[]; levelChoice: LevelChoice | undefined };
export type PicturePuzzleChoiceStore = {
  load(): PicturePuzzleChoiceSaved | undefined;
  saveLevel(choice: LevelChoice): void;
};
export type PicturePuzzleProgressStore = {
  load(): PictureProgress | undefined;
  save(progress: PictureProgress): boolean;
};
export type PicturePuzzleGameProps = {
  dinosaurs: readonly PictureDinosaur[];
  bodyPicture: (id: string) => string;
  choiceStore: PicturePuzzleChoiceStore;
  progressStore: PicturePuzzleProgressStore;
  random: () => number;
};

type PicturePuzzleScreen = { kind: "choice" } | { kind: "puzzle"; puzzle: PicturePuzzle } | { kind: "result"; result: PictureResult };
export type PicturePuzzlePhase = PicturePuzzleScreen["kind"];
type KeptChoice = PicturePuzzleChoiceSaved & { readable: boolean; progress: PictureProgress; historyReadable: boolean };
const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

export function transitionFor(from: PicturePuzzleScreen, to: PicturePuzzleScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

export function usePicturePuzzleGame(props: PicturePuzzleGameProps | undefined, setting: AgeLevelSetting, onHome: () => void, onStart?: () => void) {
  const { screen, go } = useScreens<PicturePuzzleScreen>({ kind: "choice" }, transitionFor);
  const [kept, setKept] = useState<KeptChoice>(() => {
    const saved = props?.choiceStore.load();
    const progress = props?.progressStore.load();
    const earned = progress?.earned ?? collectedPictures(saved?.earned ?? []);
    return { earned, levelChoice: saved?.levelChoice, readable: saved !== undefined,
      progress: progress ?? { ...NO_PICTURES, earned }, historyReadable: progress !== undefined };
  });
  const keptNow = useRef<KeptChoice>(kept);
  const live = useRef<PicturePuzzle | undefined>(undefined);
  const level = startLevel(setting, OFFERED, kept.levelChoice);

  const chooseLevel = (chosen: AgeLevel) => {
    if (!props || live.current !== undefined || chosen === startLevel(setting, OFFERED, keptNow.current.levelChoice)) return;
    const levelChoice = { level: chosen, revision: setting.revision };
    const next = { ...keptNow.current, levelChoice };
    keptNow.current = next;
    setKept(next);
    if (next.readable) props.choiceStore.saveLevel(levelChoice);
  };

  const choose = (id: string) => {
    if (!props || live.current !== undefined) return;
    const dinosaur = props.dinosaurs.find((each) => each.id === id);
    if (!dinosaur) return;
    const puzzle = startPicturePuzzle(dinosaur, startLevel(setting, OFFERED, keptNow.current.levelChoice), props.random);
    go((current) => current.kind === "choice"
      ? { kind: "puzzle", puzzle }
      : current, { also: () => { live.current = puzzle; onStart?.(); } });
  };
  const back = () => {
    live.current = undefined;
    go({ kind: "choice" });
  };
  const home = () => {
    live.current = undefined;
    go({ kind: "choice" }, { also: onHome });
  };

  const replay = () => {
    const previous = live.current;
    if (!props || !previous || !pictureComplete(previous)) return;
    const puzzle = startPicturePuzzle(previous.dinosaur, previous.level, props.random);
    go((current) => current.kind === "result" ? { kind: "puzzle", puzzle } : current,
      { also: () => { live.current = puzzle; onStart?.(); } });
  };

  const fit = (piece: number) => {
    const current = live.current;
    if (!props || !current || pictureComplete(current)) return;
    const puzzle = fitPicturePiece(current, piece, piece);
    if (puzzle === current) return;
    live.current = puzzle;
    if (pictureComplete(puzzle)) {
      const stored = props.progressStore.load();
      const progress = mergePictures(keptNow.current.progress, stored ?? NO_PICTURES);
      const finished = finishPicture({ progress, readable: keptNow.current.historyReadable && stored !== undefined }, puzzle);
      const saved = props.progressStore.save(finished.kept.progress);
      const readable = finished.kept.readable && saved;
      const result = readable ? finished.result : { ...finished.result, best: undefined, previousBest: undefined, celebration: null };
      const next = { ...keptNow.current, progress: finished.kept.progress, earned: finished.kept.progress.earned, historyReadable: readable };
      keptNow.current = next;
      go({ kind: "result", result }, { also: () => setKept(next) });
      return;
    }
    go((shown) => shown.kind === "puzzle" ? { kind: "puzzle", puzzle } : shown);
  };

  const choice = (language: Language) => props && screen.kind === "choice" ? (
    <PicturePuzzleChoiceScreen language={language} level={level} onLevel={chooseLevel} onChoose={choose} onHome={home}
      choices={props.dinosaurs.map(({ id, name }) => ({ id, name: name[language], picture: props.bodyPicture(id), earned: kept.earned.includes(id) }))} />
  ) : null;

  const board = (language: Language) => props && screen.kind === "puzzle" ? (
    <PicturePuzzleBoardScreen language={language} puzzle={screen.puzzle} picture={props.bodyPicture(screen.puzzle.dinosaur.id)}
      onFit={fit} onBack={back} onHome={home} />
  ) : null;

  const result = (language: Language) => props && screen.kind === "result" ? (
    <PicturePuzzleResultScreen language={language} name={screen.result.dinosaur.name[language]} fact={TEXTS[language].pictureFacts[screen.result.dinosaur.id]}
      level={screen.result.level} score={screen.result.score} shared={screen.result.shared} best={screen.result.best}
      beaten={screen.result.celebration === "new-best" ? screen.result.previousBest : undefined} celebration={screen.result.celebration}
      picture={props.bodyPicture(screen.result.dinosaur.id)}
      onReplay={replay} onAnother={back} onHome={home} />
  ) : null;

  const content = (language: Language) => choice(language) ?? board(language) ?? result(language);

  return { choice, board, result, content, phase: screen.kind, collected: kept.earned.length, puzzle: screen.kind === "puzzle" ? screen.puzzle : undefined, level, back, home };
}
