import { describe, expect, it } from "vitest";
import { presentQuestion } from "../src/presentation.ts";
import { choose, next, questionState, startRound } from "../src/quiz/index.ts";
import { correctOf } from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, fakeBodyPicture, seededRandom, wrongOf } from "./support.ts";

describe("the question's answer history", () => {
  it.each(["hatchling", "explorer", "paleontologist"] as const)("presents existing choices at %s, keeping correctness in the quiz", (level) => {
    let play = startRound(SHIPPED_DINOSAURS, level, seededRandom(37));
    const answers: boolean[] = [];
    for (let index = 0; index < 10; index++) {
      const question = play.round[index]!;
      const right = index % 3 !== 1;
      const earlier = answers.map((right) => right ? "right" : "wrong");
      const upcoming = Array<string>(9 - index).fill("to-come");
      expect(questionState(play).answers).toEqual(answers);
      expect(presentQuestion(questionState(play), "en", fakeBodyPicture, 0).steps).toEqual([...earlier, "current", ...upcoming]);
      play = choose(play, (right ? correctOf(question) : wrongOf(question)).id);
      answers.push(right);
      expect(questionState(play).answers).toEqual(answers);
      const presented = presentQuestion(questionState(play), "ru", fakeBodyPicture, 0);
      expect(presented.steps).toEqual([...earlier, right ? "just-right" : "wrong", ...upcoming]);
      expect(presented.best).toBe(0);
      expect(presented.last).toBe(index === 9);
      if (index < 9) play = next(play);
    }
  });

  it.each([undefined, 0, 7])("passes an available best of %s through without inventing one", (best) => {
    const play = startRound(SHIPPED_DINOSAURS, "explorer", seededRandom(9));
    expect(presentQuestion(questionState(play), "en", fakeBodyPicture, best).best).toBe(best);
  });
});
