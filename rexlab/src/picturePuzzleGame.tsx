import { useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { PicturePuzzleChoiceScreen } from "./PicturePuzzleChoiceScreen.tsx";
import { PicturePuzzleBoardScreen, type BoardPresence, type BoardBounds, type BoardPoint } from "./PicturePuzzleBoardScreen.tsx";
import { PicturePuzzleResultScreen } from "./PicturePuzzleResultScreen.tsx";
import { collectedPictures, finishPicture, fitPicturePiece, mergePictures, NO_PICTURES, pictureComplete, pictureDropFits, startPicturePuzzle, type PictureDinosaur, type PictureProgress, type PicturePuzzle, type PictureResult } from "./picturePuzzle/index.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "./startLevel.ts";

export type PicturePuzzleChoiceSaved = { earned: readonly string[]; levelChoice: LevelChoice | undefined };
export type PicturePuzzleChoiceStore = {
  load(): PicturePuzzleChoiceSaved | undefined;
  saveLevel(choice: LevelChoice): void;
};
export type PicturePuzzleProgressStore = {
  load(): PictureHistory | undefined;
  save(progress: PictureProgress): boolean;
};
type PictureHistory = { progress: PictureProgress; historyReadable: boolean; entryPresent: boolean };
export type PicturePuzzleGameProps = {
  dinosaurs: readonly PictureDinosaur[];
  bodyPicture: (id: string) => string;
  choiceStore: PicturePuzzleChoiceStore;
  progressStore: PicturePuzzleProgressStore;
  random: () => number;
};

type PicturePuzzleScreen = { kind: "choice" } | { kind: "puzzle"; puzzle: PicturePuzzle } | { kind: "result"; result: PictureResult };
export type PicturePuzzlePhase = PicturePuzzleScreen["kind"];
type KeptChoice = PicturePuzzleChoiceSaved & { readable: boolean; history: PictureHistory };
const OFFERED: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

function completePicture(history: PictureHistory, puzzle: PicturePuzzle, store: PicturePuzzleProgressStore) {
  const stored = store.load();
  const progress = mergePictures(history.progress, stored?.progress ?? NO_PICTURES);
  const finished = finishPicture({ progress, readable: true }, puzzle, beatBest);
  const saved = store.save(finished.kept.progress);
  // An absent entry is a fresh start only until a saved entry is known.
  // A successful save establishes the baseline for the next round, even after recovery.
  const canClaimBest = history.historyReadable && stored?.historyReadable === true
    && (!history.entryPresent || stored.entryPresent) && saved;
  return {
    history: { progress: finished.kept.progress, historyReadable: saved, entryPresent: saved || history.entryPresent },
    result: canClaimBest ? finished.result : { ...finished.result, best: undefined, previousBest: undefined, celebration: null }
  };
}

export function transitionFor(from: PicturePuzzleScreen, to: PicturePuzzleScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

export function usePicturePuzzleGame(props: PicturePuzzleGameProps | undefined, setting: AgeLevelSetting, presence: BoardPresence, onHome: () => void, onStart?: () => void) {
  const { screen, go } = useScreens<PicturePuzzleScreen>({ kind: "choice" }, transitionFor);
  const [kept, setKept] = useState<KeptChoice>(() => {
    const saved = props?.choiceStore.load();
    const stored = props?.progressStore.load();
    const progress = stored?.progress;
    const earned = progress?.earned ?? collectedPictures(saved?.earned ?? []);
    return { earned, levelChoice: saved?.levelChoice, readable: saved !== undefined,
      history: stored ?? { progress: { ...NO_PICTURES, earned }, historyReadable: false, entryPresent: false } };
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

  const fit = (piece: number, slot: number): boolean => {
    const current = live.current;
    if (!props || !current || pictureComplete(current)) return false;
    const puzzle = fitPicturePiece(current, piece, slot);
    if (puzzle === current) return false;
    live.current = puzzle;
    if (pictureComplete(puzzle)) {
      const { history, result } = completePicture(keptNow.current.history, puzzle, props.progressStore);
      const next = { ...keptNow.current, history, earned: history.progress.earned };
      keptNow.current = next;
      go({ kind: "result", result }, { also: () => setKept(next) });
      return true;
    }
    go((shown) => shown.kind === "puzzle" ? { kind: "puzzle", puzzle } : shown);
    return true;
  };

  const dropFits = (id: number, bounds: BoardBounds, point: BoardPoint): boolean => {
    const current = live.current;
    const piece = current?.cut.pieces.find((piece) => piece.id === id);
    return Boolean(current && piece && pictureDropFits(piece, current.cut, bounds, point));
  };

  const choice = (language: Language) => props && screen.kind === "choice" ? (
    <PicturePuzzleChoiceScreen language={language} level={level} onLevel={chooseLevel} onChoose={choose} onHome={home}
      choices={props.dinosaurs.map(({ id, name }) => ({ id, name: name[language], picture: props.bodyPicture(id), earned: kept.earned.includes(id) }))} />
  ) : null;

  const board = (language: Language) => props && screen.kind === "puzzle" ? (
    <PicturePuzzleBoardScreen language={language} scene={{
      name: screen.puzzle.dinosaur.name[language], columns: screen.puzzle.cut.columns, rows: screen.puzzle.cut.rows,
      guide: screen.puzzle.level === "hatchling",
      slots: screen.puzzle.cut.pieces.map(({ id, home }) => ({ id, crop: home, filled: screen.puzzle.fitted.includes(id) })),
      tray: screen.puzzle.order.filter((id) => !screen.puzzle.fitted.includes(id)).map((id) => ({ id, crop: screen.puzzle.cut.pieces[id]!.home }))
    }} picture={props.bodyPicture(screen.puzzle.dinosaur.id)}
      presence={presence} onPlace={fit} dropFits={dropFits} onBack={back} onHome={home} />
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
