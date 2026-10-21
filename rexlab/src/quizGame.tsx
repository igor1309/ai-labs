import { useRef } from "react";
import { beatBest } from "./bestScore.ts";
import type { Language } from "./language/language.ts";
import { LoadAhead } from "./Picture.tsx";
import { presentQuestion, presentResult } from "./presentation.ts";
import { NEXT_QUESTION, QuestionScreen } from "./QuestionScreen.tsx";
import { choose, finishPlay, next, questionState, startRound, type Dinosaur, type GameProgress, type Play, type Random, type RoundResult } from "./quiz/index.ts";
import { ResultScreen } from "./ResultScreen.tsx";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";

export type ProgressStore = {
  // The progress kept so far, or undefined when it cannot be read at all.
  load(): GameProgress | undefined;
  save(progress: GameProgress): void;
};

export type QuizGameProps = {
  dinosaurs: readonly Dinosaur[];
  progress: ProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  random: Random;
};

// The dinosaur cheering the child on at the end of a round.
const HERO = "tyrannosaurus";

type QuizScreen = { kind: "question"; play: Play } | { kind: "result"; result: RoundResult };

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
export function useQuizGame({ dinosaurs, progress, bodyPicture, random }: QuizGameProps, onHome: () => void, onStart: () => void) {
  const { screen, go } = useScreens<QuizScreen | undefined, "start">(undefined, transitionFor);
  // The round last played, so the next one asks other questions. It is
  // kept only while the app is open.
  const last = useRef<Play | undefined>(undefined);

  // A round opens at once, its pictures shimmering until they load, and
  // only over the screen it was asked from, so a second COMPARE or PLAY
  // AGAIN before the question shows starts nothing. `shown` runs in the
  // same screen change, so the owner can bring the quiz on screen with it.
  const start = (shown?: () => void) => {
    const from = screen;
    const play = startRound(dinosaurs, random, last.current);
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
  // left early changes nothing.
  const seeResult = (finished: Play) => {
    const result = finishPlay(finished, progress.load(), beatBest);
    if (result.progress) {
      progress.save(result.progress);
    }
    go({ kind: "result", result });
  };

  const content = (language: Language) => {
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
            />
          </>
        );
      }
      case "result":
        return (
          <ResultScreen
            language={language}
            {...presentResult(screen.result)}
            hero={bodyPicture(HERO)}
            onPlayAgain={() => start()}
            onHome={onHome}
          />
        );
    }
  };

  return { start, content, best: progress.load()?.bestScore ?? undefined };
}
