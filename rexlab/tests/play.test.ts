import { describe, expect, it } from "vitest";
import { choose, currentChoice, currentQuestion, isLastQuestion, next, score, startPlay, type Play } from "../src/quiz/play.ts";
import { generateRound, largerOf, type Question } from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, seededRandom } from "./support.ts";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const smallerOf = (question: Question) => (largerOf(question) === question.left ? question.right : question.left);

// Answers every question of the play, each with the dinosaur `pick` names.
function answerAll(play: Play, pick: (question: Question, index: number) => string): Play {
  let current = play;
  for (;;) {
    current = choose(current, pick(currentQuestion(current), current.index));
    if (isLastQuestion(current)) return current;
    current = next(current);
  }
}

describe("a play", () => {
  it.each(SEEDS)("counts the larger dinosaur as correct and the smaller as wrong (seed %i)", (seed) => {
    const play = startPlay(generateRound(SHIPPED_DINOSAURS, seededRandom(seed)), "hatchling");

    expect(score(answerAll(play, (question) => largerOf(question).id))).toBe(10);
    expect(score(answerAll(play, (question) => smallerOf(question).id))).toBe(0);
    expect(score(answerAll(play, (question, index) => (index < 7 ? largerOf(question) : smallerOf(question)).id))).toBe(7);
  });

  it("keeps only the first choice of a question", () => {
    const play = startPlay(generateRound(SHIPPED_DINOSAURS, seededRandom(1)), "hatchling");
    const question = currentQuestion(play);

    const answered = choose(play, smallerOf(question).id);

    expect(choose(answered, largerOf(question).id)).toBe(answered);
    expect(currentChoice(answered)).toBe(smallerOf(question).id);
    expect(score(answered)).toBe(0);
  });

  it("moves on only from an answered question", () => {
    const play = startPlay(generateRound(SHIPPED_DINOSAURS, seededRandom(2)), "hatchling");

    expect(next(play)).toBe(play);

    const moved = next(choose(play, largerOf(currentQuestion(play)).id));
    expect(moved.index).toBe(1);
    expect(currentChoice(moved)).toBeNull();
    expect(next(moved)).toBe(moved);
  });

  it("never moves past the last question", () => {
    const finished = answerAll(startPlay(generateRound(SHIPPED_DINOSAURS, seededRandom(3)), "hatchling"), (question) => question.left.id);

    expect(finished.index).toBe(9);
    expect(isLastQuestion(finished)).toBe(true);
    expect(next(finished)).toBe(finished);
  });
});
