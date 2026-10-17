import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { formatHeight, formatMass } from "../src/formatValue.ts";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { choose, score, startPlay } from "../src/quiz/play.ts";
import { largerOf, type Attribute, type Dinosaur, type Question } from "../src/quiz/round.ts";
import {
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  contrast,
  emptyCare,
  emptyPairs,
  emptyProgress,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  lightDevice,
  loadedPictures,
  manualPictures,
  manualOrientation,
  questionView,
  sameColour,
  seededRandom,
  surfaceOf,
  symbolOf,
  type ManualPictures
} from "./support.ts";

const ENGLISH_VALUES: Record<Attribute, (value: number) => string> = {
  mass: (value) => formatMass(value, "en"),
  height: (value) => formatHeight(value, "en")
};

const byName = (name: string): Dinosaur => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name.en === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

const group = () => screen.getByRole("group", { name: "DINOSAURS" });
const cards = () => within(group()).getAllByRole("button");
const cardOf = (dinosaur: Dinosaur) => within(group()).getByRole("button", { name: dinosaur.name.en });
// Each mark on a card, as its symbol and its word.
const marksOn = (card: HTMLElement) =>
  within(card)
    .queryAllByRole("img", { name: /^(RIGHT|WRONG)$/ })
    .map((mark) => `${symbolOf(mark)} ${mark.textContent}`);
// How a card is outlined: thick in the colour of its mark, or thin.
// jsdom keeps the outline shorthand as written, unexpanded.
const outlineOf = (card: HTMLElement) => {
  const [outlineWidth, , outlineColor = ""] = getComputedStyle(card).outline.split(" ");
  const colour = Object.entries(PALETTE.light).find(([, value]) => sameColour(outlineColor, value))?.[0];
  return `${outlineWidth} ${colour}`;
};
const opacityOf = (card: HTMLElement) => Number(getComputedStyle(card).opacity || 1);
const progress = () => screen.getByLabelText("PROGRESS").textContent;

// The question on screen, read back from the shipped list by its prompt
// and the names on its cards.
function shownQuestion(): Question {
  const attribute: Attribute = screen.getByRole("heading").textContent?.includes("HEAVIER") ? "mass" : "height";
  const [left, right] = cards().map((card) => byName(card.getAttribute("aria-label") ?? ""));
  if (!left || !right) throw new Error("Expected two dinosaur cards");
  return { attribute, left, right };
}

const smallerOf = (question: Question) => (largerOf(question) === question.left ? question.right : question.left);

function startRound(seed: number, pictures: ManualPictures | ReturnType<typeof loadedPictures> = loadedPictures()) {
  render(<App dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(seed)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...pictures} />);
  const user = userEvent.setup();
  // Taps COMPARE and, with manual pictures, lets the first question's
  // pictures finish loading.
  const start = async () => {
    await user.click(screen.getByRole("button", { name: "COMPARE" }));
    if ("finish" in pictures) act(() => pictures.loading().forEach(pictures.finish));
  };
  return { user, start };
}

// Answers questions until `number` is answered and on screen, letting the
// pictures each Next asks for finish loading.
async function answerUpTo(user: UserEvent, number: number, pictures?: ManualPictures) {
  for (;;) {
    await user.click(cardOf(largerOf(shownQuestion())));
    if (progress() === `${number}/10`) return;
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    if (pictures) act(() => pictures.loading().forEach(pictures.finish));
  }
}

const picturesShown = () => cards().map((card) => within(card).getByRole("img").getAttribute("src"));

describe("answering a question", () => {
  const examples: Array<[string, Attribute, string, string, string, string]> = [
    ["WHO IS HEAVIER?", "mass", "Triceratops", "Velociraptor", "7 T", "15 KG"],
    ["WHO IS TALLER?", "height", "Brachiosaurus", "Triceratops", "12.5 M", "3 M"]
  ];
  const cases = examples.flatMap(([prompt, attribute, larger, smaller, largerValue, smallerValue]) =>
    (["right answer", "wrong answer"] as const).flatMap((answer) =>
      (["left", "right"] as const).map((side) => ({ prompt, attribute, larger, smaller, largerValue, smallerValue, answer, side }))
    )
  );

  it.each(cases)(
    '"$prompt" about $larger and $smaller, $larger on the $side: a $answer',
    async ({ prompt, attribute, larger, smaller, largerValue, smallerValue, answer, side }) => {
      const [big, small] = [byName(larger), byName(smaller)];
      const question: Question = side === "left" ? { attribute, left: big, right: small } : { attribute, left: small, right: big };
      const tapped = answer === "right answer" ? big : small;
      const chosen: string[] = [];
      const nothing = () => {};
      const handlers = { onChoose: (id: string) => chosen.push(id), onNext: nothing, onHome: nothing };
      const { rerender } = render(<QuestionScreen language="en" {...questionView(question, "en")} {...handlers} />);
      expect(screen.getByRole("heading").textContent).toContain(prompt);

      await userEvent.setup().click(cardOf(tapped));
      expect(chosen).toEqual([tapped.id]);
      rerender(<QuestionScreen language="en" {...questionView(question, "en", tapped.id)} {...handlers} />);

      expect(marksOn(cardOf(big))).toEqual(["check RIGHT"]);
      expect(marksOn(cardOf(small))).toEqual(answer === "right answer" ? [] : ["x WRONG"]);
      // The tapped card is outlined in its mark's colour; a right answer
      // dims the other card, a wrong one leaves the right card bright.
      expect([big, small].map((dinosaur) => outlineOf(cardOf(dinosaur)))).toEqual(
        answer === "right answer" ? ["4px good", "1px line"] : ["1px line", "4px bad"]
      );
      expect([big, small].map((dinosaur) => opacityOf(cardOf(dinosaur)))).toEqual(answer === "right answer" ? [1, 0.7] : [1, 1]);
      expect(within(cardOf(big)).getByText(largerValue)).toBeDefined();
      expect(within(cardOf(small)).getByText(smallerValue)).toBeDefined();
      expect(symbolOf(within(cardOf(big)).getByText(largerValue).parentElement ?? cardOf(big))).toBe(attribute === "mass" ? "weight" : "ruler");
      expect(score(choose(startPlay([question]), tapped.id))).toBe(answer === "right answer" ? 1 : 0);
      const next = screen.getByRole("button", { name: "NEXT" });
      expect([next.textContent, symbolOf(next)]).toEqual(["NEXT", "arrow-right"]);
    }
  );

  it("marks the right answer and shows both values in every question of a round", async () => {
    const { user, start } = startRound(11);
    await start();

    for (let number = 1; number <= 10; number++) {
      const question = shownQuestion();
      const [right, wrong] = [largerOf(question), smallerOf(question)];
      const tapped = number % 2 === 0 ? right : wrong;
      await user.click(cardOf(tapped));

      expect(marksOn(cardOf(right))).toEqual(["check RIGHT"]);
      expect(marksOn(cardOf(wrong))).toEqual(tapped === wrong ? ["x WRONG"] : []);
      for (const dinosaur of [right, wrong]) {
        expect(within(cardOf(dinosaur)).getByText(ENGLISH_VALUES[question.attribute](dinosaur.measures[question.attribute]))).toBeDefined();
      }
      if (number < 10) await user.click(screen.getByRole("button", { name: "NEXT" }));
    }
  });

  it("shows a dinosaur card pressed before its mark appears", async () => {
    const { user, start } = startRound(12);
    await start();
    const [card] = cards();
    if (!card) throw new Error("No dinosaur card to press");

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(cards().flatMap(marksOn)).toEqual([]);

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(cards().flatMap(marksOn)).not.toEqual([]);
    expect(getComputedStyle(card).transform).not.toMatch(/scale/);
  });

  it("makes each mark a symbol and a word on its own colour, at least 3:1 against its card", async () => {
    const [big, small] = [byName("Triceratops"), byName("Velociraptor")];
    const nothing = () => {};
    render(
      <QuestionScreen
        language="en"
        {...questionView({ attribute: "mass", left: big, right: small }, "en", small.id)}
        onChoose={nothing}
        onNext={nothing}
        onHome={nothing}
      />
    );

    const marks = [cardOf(big), cardOf(small)].map((card) => {
      const mark = within(card).getByRole("img", { name: /^(RIGHT|WRONG)$/ });
      return { symbol: symbolOf(mark), colour: getComputedStyle(mark).backgroundColor, card: surfaceOf(mark.parentElement ?? card) };
    });

    expect(marks.map(({ symbol }) => symbol)).toEqual(["check", "x"]);
    expect(new Set(marks.map(({ colour }) => colour)).size).toBe(2);
    for (const { colour, card } of marks) {
      expect(contrast(colour, card)).toBeGreaterThanOrEqual(3);
    }
  });

  it("counts only the first tap on a question", async () => {
    const { user, start } = startRound(13);
    await start();
    const question = shownQuestion();
    await user.click(cardOf(smallerOf(question)));
    const answered = document.body.innerHTML;

    await user.click(cardOf(largerOf(question)));
    await user.click(cardOf(smallerOf(question)));

    expect(document.body.innerHTML).toBe(answered);
  });
});

describe("Next", () => {
  it("moves to the following question, with no values yet", async () => {
    const { user, start } = startRound(14);
    await start();
    await answerUpTo(user, 3);

    await user.click(screen.getByRole("button", { name: "NEXT" }));

    expect(progress()).toBe("4/10");
    for (const card of cards()) {
      expect(card.textContent).not.toMatch(/\d/);
      expect(marksOn(card)).toEqual([]);
    }
    expect(screen.queryByRole("button", { name: "NEXT" })).toBeNull();
  });

  it("skips nothing on a quick double tap", async () => {
    const { user, start } = startRound(15);
    await start();
    await answerUpTo(user, 3);

    await user.dblClick(screen.getByRole("button", { name: "NEXT" }));

    expect(progress()).toBe("4/10");
  });

  it("waits for the next question's pictures, with question 3 on screen until both have loaded", async () => {
    const pictures = manualPictures();
    const { user, start } = startRound(14, pictures);
    await start();
    await answerUpTo(user, 3, pictures);
    const third = { question: shownQuestion(), html: document.body.innerHTML };

    await user.click(screen.getByRole("button", { name: "NEXT" }));

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    const [first, second] = asked;
    act(() => pictures.finish(first ?? ""));
    expect([shownQuestion(), document.body.innerHTML]).toEqual([third.question, third.html]);

    act(() => pictures.finish(second ?? ""));

    expect(progress()).toBe("4/10");
    expect(picturesShown()).toEqual(asked);
    expect(pictures.timers()).toEqual([]);
  });

  it("goes on to question 4 when its pictures take a second, and not again when they arrive", async () => {
    const pictures = manualPictures();
    const { user, start } = startRound(14, pictures);
    await start();
    await answerUpTo(user, 3, pictures);
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    const asked = pictures.loading();

    act(() => pictures.fire(1000));

    expect(progress()).toBe("4/10");
    expect(picturesShown()).toEqual(asked);
    const fourth = document.body.innerHTML;
    act(() => asked.forEach(pictures.finish));
    expect(document.body.innerHTML).toBe(fourth);
  });

  it("skips nothing on a quick double tap while the pictures load", async () => {
    const pictures = manualPictures();
    const { user, start } = startRound(15, pictures);
    await start();
    await answerUpTo(user, 3, pictures);

    await user.dblClick(screen.getByRole("button", { name: "NEXT" }));
    act(() => pictures.loading().forEach(pictures.finish));

    expect(progress()).toBe("4/10");
    expect(pictures.timers()).toEqual([]);
  });

  it("moves nothing on once the round is left while the pictures load", async () => {
    const pictures = manualPictures();
    const { user, start } = startRound(15, pictures);
    await start();
    await answerUpTo(user, 3, pictures);
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    const asked = pictures.loading();

    await user.click(screen.getByRole("button", { name: "HOME" }));
    await start();
    act(() => asked.forEach(pictures.finish));
    act(() => pictures.fire(1000));

    expect(progress()).toBe("1/10");
  });

  it('reads "See result" with a 🏆 on the last question', async () => {
    const { user, start } = startRound(16);
    await start();

    await answerUpTo(user, 10);

    const seeResult = screen.getByRole("button", { name: "SEE RESULT" });
    expect([seeResult.textContent, symbolOf(seeResult)]).toEqual(["SEE RESULT", "trophy"]);
    expect(screen.queryByRole("button", { name: "NEXT" })).toBeNull();
  });
});
