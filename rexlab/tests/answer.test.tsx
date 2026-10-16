import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { formatHeight, formatMass } from "../src/formatValue.ts";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { choose, score, startPlay } from "../src/quiz/play.ts";
import { largerOf, type Attribute, type Dinosaur, type Question } from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, emptyProgress, englishDevice, manualOrientation, questionView, seededRandom } from "./support.ts";

const ENGLISH_VALUES: Record<Attribute, (value: number) => string> = {
  mass: (value) => formatMass(value, "en"),
  height: (value) => formatHeight(value, "en")
};

const byName = (name: string): Dinosaur => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name.en === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

const group = () => screen.getByRole("group", { name: "Dinosaurs" });
const cards = () => within(group()).getAllByRole("button");
const cardOf = (dinosaur: Dinosaur) => within(group()).getByRole("button", { name: dinosaur.name.en });
const marksOn = (card: HTMLElement) =>
  within(card)
    .queryAllByRole("img", { name: /^(Correct|Wrong)$/ })
    .map((mark) => `${mark.getAttribute("aria-label")} ${mark.textContent}`);
const progress = () => screen.getByLabelText("Progress").textContent;

// The question on screen, read back from the shipped list by its prompt
// and the names on its cards.
function shownQuestion(): Question {
  const attribute: Attribute = screen.getByRole("heading").textContent?.includes("heavier") ? "mass" : "height";
  const [left, right] = cards().map((card) => byName(card.getAttribute("aria-label") ?? ""));
  if (!left || !right) throw new Error("Expected two dinosaur cards");
  return { attribute, left, right };
}

const smallerOf = (question: Question) => (largerOf(question) === question.left ? question.right : question.left);

function startRound(seed: number) {
  render(<App dinosaurs={SHIPPED_DINOSAURS} random={seededRandom(seed)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} />);
  const user = userEvent.setup();
  return { user, start: () => user.click(screen.getByRole("button", { name: "COMPARE" })) };
}

// Answers questions until `number` is answered and on screen.
async function answerUpTo(user: UserEvent, number: number) {
  for (;;) {
    await user.click(cardOf(largerOf(shownQuestion())));
    if (progress() === `${number}/10`) return;
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
}

function srgb(color: string): [number, number, number] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  const parts = hex ? hex.slice(1).map((part) => parseInt(part, 16)) : rgb?.slice(1).map(Number);
  const [r, g, b] = parts ?? [];
  if (r === undefined || g === undefined || b === undefined) throw new Error(`Cannot read the colour ${color}`);
  return [r, g, b];
}

// The WCAG 2 contrast ratio of two colours.
function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = srgb(color).map((channel) => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("answering a question", () => {
  const examples: Array<[string, Attribute, string, string, string, string]> = [
    ["Who is heavier?", "mass", "Triceratops", "Velociraptor", "7 t", "15 kg"],
    ["Who is taller?", "height", "Brachiosaurus", "Triceratops", "12.5 m", "3 m"]
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

      expect(marksOn(cardOf(big))).toEqual(["Correct ✓"]);
      expect(marksOn(cardOf(small))).toEqual(answer === "right answer" ? [] : ["Wrong ✗"]);
      expect(within(cardOf(big)).getByText(largerValue)).toBeDefined();
      expect(within(cardOf(small)).getByText(smallerValue)).toBeDefined();
      expect(score(choose(startPlay([question]), tapped.id))).toBe(answer === "right answer" ? 1 : 0);
      expect(screen.getByRole("button", { name: "Next" }).textContent).toBe("▶ Next");
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

      expect(marksOn(cardOf(right))).toEqual(["Correct ✓"]);
      expect(marksOn(cardOf(wrong))).toEqual(tapped === wrong ? ["Wrong ✗"] : []);
      for (const dinosaur of [right, wrong]) {
        expect(within(cardOf(dinosaur)).getByText(ENGLISH_VALUES[question.attribute](dinosaur.measures[question.attribute]))).toBeDefined();
      }
      if (number < 10) await user.click(screen.getByRole("button", { name: "Next" }));
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

  it("makes each mark a symbol in its own colour, at least 3:1 against its card", async () => {
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
      const mark = within(card).getByRole("img", { name: /^(Correct|Wrong)$/ });
      return { symbol: mark.textContent, color: getComputedStyle(mark).color, card: getComputedStyle(card) };
    });

    expect(marks.map(({ symbol }) => symbol)).toEqual(["✓", "✗"]);
    expect(new Set(marks.map(({ color }) => color)).size).toBe(2);
    for (const { color, card } of marks) {
      expect(color).not.toBe(card.color);
      expect(contrast(color, card.backgroundColor)).toBeGreaterThanOrEqual(3);
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

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(progress()).toBe("4/10");
    for (const card of cards()) {
      expect(card.textContent).not.toMatch(/\d/);
      expect(marksOn(card)).toEqual([]);
    }
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("skips nothing on a quick double tap", async () => {
    const { user, start } = startRound(15);
    await start();
    await answerUpTo(user, 3);

    await user.dblClick(screen.getByRole("button", { name: "Next" }));

    expect(progress()).toBe("4/10");
  });

  it('reads "See result" with a 🏆 on the last question', async () => {
    const { user, start } = startRound(16);
    await start();

    await answerUpTo(user, 10);

    expect(screen.getByRole("button", { name: "See result" }).textContent).toBe("🏆 See result");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});
