import { useRef, useState } from "react";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import type { QuestionType } from "./compareQuestionLayout.ts";
import type { ResultType } from "./compareResultLayout.ts";
import type { Language } from "./language/language.ts";
import { LevelResultScreen } from "./LevelResultScreen.tsx";
import { LoadAhead } from "./Picture.tsx";
import { presentQuestion, presentResult } from "./presentation.ts";
import { NEXT_QUESTION, QuestionScreen } from "./QuestionScreen.tsx";
import { bestForLevel, choose, finishPlay, mergeProgress, next, questionState, startRound, type Dinosaur, type Play, type QuizProgress, type Random, type RoundResult } from "./quiz/index.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice } from "./startLevel.ts";

export type QuizSaved = { progress: QuizProgress; levelChoice: LevelChoice | undefined };

export type ProgressStore = {
  // The quiz's progress kept so far, or undefined when it cannot be read
  // at all.
  load(): QuizSaved | undefined;
  save(saved: QuizSaved): void;
};

export type QuizGameProps = {
  dinosaurs: readonly Dinosaur[];
  progress: ProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
};

// The dinosaur cheering the child on at the end of a round.
const HERO = "tyrannosaurus";
const OFFERED = ["hatchling", "explorer", "paleontologist"] as const;

type Kept = { progress: QuizProgress | undefined; levelChoice: LevelChoice | undefined };

type QuizScreen = { kind: "question"; play: Play } | { kind: "result"; result: RoundResult };

// The screen the quiz shows, each with layouts of its own.
export type QuizPhase = QuizScreen["kind"];

// A round started, even over one left on HOME and still kept, or its
// result, is the plain screen change. A new question animates only its
// pair of cards, and an answer chosen changes the screen at once.
export function transitionFor(from: QuizScreen | undefined, to: QuizScreen | undefined, intent: "start" | undefined): string | undefined {
  if (intent === "start") return SCREEN_CHANGE;
  if (from?.kind === "question" && to?.kind === "question") return from.play.index === to.play.index ? undefined : NEXT_QUESTION;
  return from?.kind === to?.kind ? undefined : SCREEN_CHANGE;
}

// The compare quiz, kept by its owner above the orientation gate. It
// shows nothing until a round is started. `onHome` takes the child back
// to the home page; `onStart` is told as each round begins.
export function useQuizGame({ dinosaurs, progress, bodyPicture, random }: QuizGameProps, ageLevel: AgeLevelSetting, onHome: () => void, onStart: () => void) {
  const { screen, go } = useScreens<QuizScreen | undefined, "start">(undefined, transitionFor);
  // Keep this visit's choice and scores even when a save fails.
  const [kept, setKept] = useState<Kept>(() => {
    const stored = progress.load();
    return { progress: stored?.progress, levelChoice: stored?.levelChoice };
  });
  const keptNow = useRef(kept);
  const level = startLevel(ageLevel, OFFERED, kept.levelChoice);
  const refreshedProgress = (held: QuizProgress | undefined) => {
    const stored = progress.load()?.progress;
    return stored === undefined ? undefined : held === undefined ? stored : mergeProgress(held, stored);
  };
  const keep = (next: Kept) => {
    const refreshed = refreshedProgress(next.progress);
    const merged = { ...next, progress: refreshed ?? next.progress };
    keptNow.current = merged;
    setKept(merged);
    if (refreshed !== undefined) progress.save({ progress: refreshed, levelChoice: next.levelChoice });
  };
  const chooseLevel = (chosen: AgeLevel) => {
    if (chosen === startLevel(ageLevel, OFFERED, keptNow.current.levelChoice)) return;
    const levelChoice = { level: chosen, revision: ageLevel.revision };
    keep({ ...keptNow.current, levelChoice });
  };
  // The round last played, so the next one asks other questions. It is
  // kept only while the app is open.
  const last = useRef<Play | undefined>(undefined);

  // A round opens at once, its pictures shimmering until they load, and
  // only over the screen it was asked from, so a second COMPARE or PLAY
  // AGAIN before the question shows starts nothing. `shown` runs in the
  // same screen change, so the owner can bring the quiz on screen with it.
  const start = (shown?: () => void) => {
    const from = screen;
    const play = startRound(dinosaurs, startLevel(ageLevel, OFFERED, keptNow.current.levelChoice), random, last.current);
    go((current) => (current === from ? { kind: "question", play } : current), {
      intent: "start",
      also: () => {
        last.current = play;
        onStart();
        shown?.();
      }
    });
  };

  // Each update moves from the state it is given, not the one last
  // rendered, so a tap that lands after the screen has already moved on
  // changes nothing.
  const answer = (id: string) => go((current) => (current?.kind === "question" ? { ...current, play: choose(current.play, id) } : current));

  // The next question shows at once, and only if the round is still where
  // Next was tapped: a second tap changes nothing more.
  const goOn = (from: Play) => {
    const to = next(from);
    go((current) => (current?.kind === "question" && current.play === from ? { ...current, play: to } : current));
  };

  // A round is recorded only here, when its result is shown, so a round
  // left early changes nothing. Unreadable progress is not saved over.
  const seeResult = (finished: Play) => {
    const result = finishPlay(finished, refreshedProgress(keptNow.current.progress), beatBest);
    if (result.progress) keep({ ...keptNow.current, progress: result.progress });
    go({ kind: "result", result });
  };

  // `type` is the question's upright type in the window, and `resultType`
  // the result's upright sizes.
  const content = (language: Language, type: QuestionType, resultType: ResultType) => {
    switch (screen?.kind) {
      case undefined:
        return null;
      case "question": {
        const current = screen.play;
        const question = questionState(current);
        // The next question's pictures load while this one is answered.
        const coming = current.round[current.index + 1];
        return (
          <>
            {coming && <LoadAhead urls={[bodyPicture(coming.left.id), bodyPicture(coming.right.id)]} />}
            <QuestionScreen
              language={language}
              {...presentQuestion(question, language, bodyPicture)}
              onChoose={answer}
              onNext={question.last ? () => seeResult(current) : () => goOn(current)}
              onHome={onHome}
              type={type}
            />
          </>
        );
      }
      case "result":
        return (
          <LevelResultScreen
            language={language}
            {...presentResult(screen.result)}
            hero={bodyPicture(HERO)}
            level={level}
            onLevel={chooseLevel}
            onPlayAgain={() => start()}
            onHome={onHome}
            type={resultType}
          />
        );
    }
  };

  const phase: QuizPhase | undefined = screen?.kind;

  return { start, content, phase, best: kept.progress === undefined ? undefined : bestForLevel(kept.progress, level) ?? undefined };
}
