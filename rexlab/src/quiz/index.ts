// The quiz's API: its use cases and the types the app speaks with it.
// Everything else under quiz/ is reached only through this file.
import { choose, currentChoice, currentQuestion, isLastQuestion, next, score, startPlay, type Play } from "./play.ts";
import { bestForLevel, finishRound, type BeatBest, type Celebration, type QuizLevel, type QuizProgress } from "./progress.ts";
import { correctOf, generateRound, measureOf, questionKind, type Attribute, type Dinosaur, type QuestionKind, type Random } from "./round.ts";

export type { Attribute, BeatBest, Celebration, Dinosaur, Play, QuizLevel, QuizProgress, QuestionKind, Random };
export type { Beaten } from "./progress.ts";
export { bestForLevel, mergeProgress, NO_PROGRESS } from "./progress.ts";
export { choose, next };

// One dinosaur of the question on screen, with its value of the compared
// attribute.
export type Option = {
  dinosaur: Dinosaur;
  value: number;
  // This dinosaur is the right answer.
  correct: boolean;
  chosen: boolean;
};

export type QuestionState = {
  attribute: Attribute;
  kind: QuestionKind;
  // The question's place in the round, from 1.
  number: number;
  total: number;
  last: boolean;
  answered: boolean;
  left: Option;
  right: Option;
};

export type RoundResult = {
  level: QuizLevel;
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to
  // compare with, so the round is neither celebrated nor saved over it.
  progress: QuizProgress | undefined;
  // The level's best score before this round, undefined when there was
  // none or it cannot be read.
  previousBest: number | undefined;
  celebration: Celebration | null;
};

// A new round at `level`, asking none of the previous round's questions
// while other fair pairs are left. Paleontologist adds LIGHTER and SHORTER
// questions.
export function startRound(dinosaurs: readonly Dinosaur[], level: QuizLevel, random: Random, previous?: Play): Play {
  return startPlay(generateRound(dinosaurs, random, previous?.round, level), level);
}

export function questionState(play: Play): QuestionState {
  const question = currentQuestion(play);
  const choice = currentChoice(play);
  const answer = correctOf(question);
  const option = (dinosaur: Dinosaur): Option => ({
    dinosaur,
    value: measureOf(dinosaur, question.attribute),
    correct: dinosaur.id === answer.id,
    chosen: dinosaur.id === choice
  });
  return {
    attribute: question.attribute,
    kind: questionKind(question),
    number: play.index + 1,
    total: play.round.length,
    last: isLastQuestion(play),
    answered: choice !== null,
    left: option(question.left),
    right: option(question.right)
  };
}

// The round's score, set against its level's best in the progress kept
// so far by the best-score rule.
export function finishPlay(play: Play, stored: QuizProgress | undefined, beatBest: BeatBest): RoundResult {
  const correct = score(play);
  const outcome = stored === undefined ? undefined : finishRound(stored, play.level, correct, beatBest);
  return {
    level: play.level,
    score: correct,
    total: play.round.length,
    progress: outcome?.progress,
    previousBest: stored === undefined ? undefined : bestForLevel(stored, play.level) ?? undefined,
    celebration: outcome?.celebration ?? null
  };
}
