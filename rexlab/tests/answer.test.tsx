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
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuring,
  lightDevice,
  loadedPictures,
  manualPictures,
  manualOrientation,
  questionView,
  sameColour,
  seededRandom,
  surfaceOf,
  symbolOf,
  type ManualPictures,
  gameDoor,
  unsetAgeLevel
} from "./support.ts";
import { withPictures } from "./pictures.tsx";

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
  render(<App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(seed)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...pictures} />);
  const user = userEvent.setup();
  // Taps COMPARE and, with manual pictures, lets the first question's
  // pictures finish loading.
  const start = async () => {
    await user.click(gameDoor("COMPARE"));
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
const looks = () => cards().map((card) => within(card).getByRole("img").dataset.picture);

describe("answering a question", () => {
  const examples: Array<[string, Attribute, string, string, string, string]> = [
    ["WHO IS HEAVIER?", "mass", "Triceratops", "Velociraptor", "7 T", "15 KG"],
    ["WHO IS TALLER?", "height", "Brachiosaurus", "Stegosaurus", "3.4 M", "1.5 M"]
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
      const { rerender } = render(<QuestionScreen language="en" {...questionView(question, "en")} {...handlers} />, withPictures);
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
      />,
      withPictures
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

  it("loads question 4's pictures ahead on question 3, so question 4 shows them at once", async () => {
    const pictures = manualPictures();
    const { user, start } = startRound(14, pictures);
    await start();
    await answerUpTo(user, 3, pictures);

    await user.click(screen.getByRole("button", { name: "NEXT" }));

    expect(progress()).toBe("4/10");
    expect(looks()).toEqual(["shown", "shown"]);
    expect(picturesShown()).toEqual(cards().map((card) => fakeBodyPicture(byName(card.getAttribute("aria-label") ?? "").id)));
  });

  it.each([14, 15, 21])("loads each next question's pictures ahead from question 1, and none on question 10 (round %i)", async (seed) => {
    const pictures = manualPictures();
    const { user, start } = startRound(seed, pictures);
    await start();
    const shown: Array<Array<string | undefined>> = [];
    for (let number = 1; number < 10; number++) {
      await user.click(cardOf(largerOf(shownQuestion())));
      await user.click(screen.getByRole("button", { name: "NEXT" }));
      // A question's pictures show at once only if they were asked for
      // before it opened.
      shown.push(looks());
      if (number < 9) act(() => pictures.loading().forEach(pictures.finish));
    }

    expect([progress(), shown, pictures.loading()]).toEqual(["10/10", Array.from({ length: 9 }, () => ["shown", "shown"]), []]);
  });

  it("opens question 4 at once while its pictures still load, and fades them in as they arrive", async () => {
    const pictures = manualPictures();
    const { user, start } = startRound(14, pictures);
    await start();
    await answerUpTo(user, 2, pictures);
    // Question 3 opens and asks for question 4's pictures, which stay
    // loading.
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    await user.click(cardOf(largerOf(shownQuestion())));

    await user.click(screen.getByRole("button", { name: "NEXT" }));

    expect(progress()).toBe("4/10");
    // A dinosaur already shown earlier in the round shows at once.
    const fourth = cards().map((card) => fakeBodyPicture(byName(card.getAttribute("aria-label") ?? "").id));
    const loading = fourth.map((url) => pictures.loading().includes(url));
    expect(loading).toContain(true);
    expect([looks(), picturesShown()]).toEqual([loading.map((still) => (still ? "loading" : "shown")), fourth.map((url, at) => (loading[at] ? null : url))]);
    act(() => pictures.finishAll());
    expect([looks(), picturesShown()]).toEqual([loading.map((still) => (still ? "appearing" : "shown")), fourth]);
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
