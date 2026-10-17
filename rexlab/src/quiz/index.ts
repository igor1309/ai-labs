// The quiz's API: its use cases and the types the app speaks with it.
// Everything else under quiz/ is reached only through this file.
import { choose, currentChoice, currentQuestion, isLastQuestion, next, score, startPlay, type Play } from "./play.ts";
import { finishRound, type Celebration, type GameProgress } from "./progress.ts";
import { generateRound, largerOf, type Attribute, type Dinosaur, type Random } from "./round.ts";

export type { Attribute, Celebration, Dinosaur, GameProgress, Play, Random };
export { NO_PROGRESS } from "./progress.ts";
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
  // The question's place in the round, from 1.
  number: number;
  total: number;
  last: boolean;
  answered: boolean;
  left: Option;
  right: Option;
};

export type RoundResult = {
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to
  // compare with, so the round is neither celebrated nor saved over it.
  progress: { bestScore: number; roundsPlayed: number } | undefined;
  // The best score before this round, undefined when there was none or it
  // cannot be read.
  previousBest: number | undefined;
  celebration: Celebration | null;
};

// A new round, asking none of the previous round's questions while other
// fair pairs are left.
export function startRound(dinosaurs: readonly Dinosaur[], random: Random, previous?: Play): Play {
  return startPlay(generateRound(dinosaurs, random, previous?.round));
}

export function questionState(play: Play): QuestionState {
  const question = currentQuestion(play);
  const choice = currentChoice(play);
  const answer = largerOf(question);
  const option = (dinosaur: Dinosaur): Option => ({
    dinosaur,
    value: dinosaur.measures[question.attribute],
    correct: dinosaur.id === answer.id,
    chosen: dinosaur.id === choice
  });
  return {
    attribute: question.attribute,
    number: play.index + 1,
    total: play.round.length,
    last: isLastQuestion(play),
    answered: choice !== null,
    left: option(question.left),
    right: option(question.right)
  };
}

// The round's score, set against the progress kept so far.
export function finishPlay(play: Play, stored: GameProgress | undefined): RoundResult {
  const correct = score(play);
  const outcome = stored === undefined ? undefined : finishRound(stored, correct);
  return {
    score: correct,
    total: play.round.length,
    progress: outcome?.progress,
    previousBest: stored?.bestScore ?? undefined,
    celebration: outcome?.celebration ?? null
  };
}
