import { largerOf, type Question, type Round } from "./round.ts";

// A round being played: the question on screen and the dinosaur chosen for
// each question answered so far, in order.
export type Play = {
  round: Round;
  index: number;
  choices: readonly string[];
};

export function startPlay(round: Round): Play {
  return { round, index: 0, choices: [] };
}

export function currentQuestion(play: Play): Question {
  const question = play.round[play.index];
  if (!question) {
    throw new Error(`The round has no question ${play.index + 1}`);
  }
  return question;
}

export function currentChoice(play: Play): string | null {
  return play.choices[play.index] ?? null;
}

export function isLastQuestion(play: Play): boolean {
  return play.index === play.round.length - 1;
}

// Only the first tap on a question counts: the answer is shown at once, so
// a second tap must not change it.
export function choose(play: Play, dinosaurId: string): Play {
  if (currentChoice(play) !== null) {
    return play;
  }
  return { ...play, choices: [...play.choices, dinosaurId] };
}

// Next moves on only from an answered question and never past the last
// one, so a second tap that lands after the move skips nothing.
export function next(play: Play): Play {
  if (currentChoice(play) === null || isLastQuestion(play)) {
    return play;
  }
  return { ...play, index: play.index + 1 };
}

export function score(play: Play): number {
  return play.choices.filter((choice, index) => {
    const question = play.round[index];
    return question !== undefined && largerOf(question).id === choice;
  }).length;
}
