import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import type { Attribute, Dinosaur } from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, manualOrientation, seededRandom } from "./support.ts";

const byName = (name: string): Dinosaur => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

const cards = () => within(screen.getByRole("group", { name: "Dinosaurs" })).getAllByRole("button");
const progress = () => screen.getByLabelText("Progress").textContent;
const shownQuestion = () => ({
  prompt: screen.getByRole("heading").textContent,
  names: cards().map((card) => card.getAttribute("aria-label"))
});

async function answerAndGoOn(user: UserEvent) {
  const [first] = cards();
  if (!first) throw new Error("No dinosaur card to tap");
  await user.click(first);
  await user.click(screen.getByRole("button", { name: "Next" }));
}

describe("a question", () => {
  it.each<[Attribute, string, string]>([
    ["mass", "⚖️", "Who is heavier?"],
    ["height", "📏", "Who is taller?"]
  ])("comparing %s shows %s, its prompt and two dinosaur cards", (attribute, symbol, prompt) => {
    const nothing = () => {};
    render(
      <QuestionScreen
        question={{ attribute, left: byName("Triceratops"), right: byName("Velociraptor") }}
        number={1}
        total={10}
        choice={null}
        last={false}
        onChoose={nothing}
        onNext={nothing}
        onHome={nothing}
      />
    );

    const heading = screen.getByRole("heading", { name: prompt });
    expect(heading.textContent).toBe(`${symbol} ${prompt}`);

    const [left, right] = cards();
    if (!left || !right) throw new Error("Expected two dinosaur cards");
    const pictures = [left, right].map((card) => within(card).getByRole("img"));
    for (const [card, name] of [
      [left, "Triceratops"],
      [right, "Velociraptor"]
    ] as const) {
      expect(within(card).getByRole("img", { name })).toBeDefined();
      const label = within(card).getByText(name.toUpperCase());
      expect(parseFloat(getComputedStyle(label).fontSize)).toBeGreaterThanOrEqual(32);
      expect(card.textContent).not.toMatch(/\d/);
    }
    const [leftSize, rightSize] = pictures.map((picture) => {
      const { width, height } = getComputedStyle(picture);
      return { width, height };
    });
    expect(leftSize?.width).toMatch(/^[\d.]+px$/);
    expect(leftSize?.height).toMatch(/^[\d.]+px$/);
    expect(rightSize).toEqual(leftSize);

    const home = screen.getByRole("button", { name: "Home" });
    expect(home.textContent).toBe("🏠 Home");
    expect(screen.getByRole("group", { name: "Dinosaurs" }).contains(home)).toBe(false);
  });
});

describe("a round", () => {
  it("asks to turn the iPad sideways in portrait and resumes the same question", async () => {
    const orientation = manualOrientation("landscape");
    render(<App dinosaurs={SHIPPED_DINOSAURS} random={seededRandom(3)} orientation={orientation} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "COMPARE" }));
    await answerAndGoOn(user);
    await answerAndGoOn(user);
    expect(progress()).toBe("3/10");
    const third = shownQuestion();

    act(() => orientation.turn("portrait"));

    expect(screen.getByRole("img", { name: "Turn the iPad sideways" })).toBeDefined();
    expect(screen.queryByLabelText("Progress")).toBeNull();

    act(() => orientation.turn("landscape"));

    expect(progress()).toBe("3/10");
    expect(shownQuestion()).toEqual(third);
  });

  // The generator's own tests cover the class of random draws; this one
  // proves the app hands each new round the one played before it.
  it("does not repeat the previous round's questions", async () => {
    render(<App dinosaurs={SHIPPED_DINOSAURS} random={seededRandom(5)} orientation={manualOrientation("landscape")} />);
    const user = userEvent.setup();

    async function playRound() {
      await user.click(screen.getByRole("button", { name: "COMPARE" }));
      const asked = [];
      for (let number = 1; number <= 10; number++) {
        expect(progress()).toBe(`${number}/10`);
        asked.push([...shownQuestion().names].sort().join(" & "));
        if (number < 10) await answerAndGoOn(user);
      }
      await user.click(screen.getByRole("button", { name: "Home" }));
      return asked;
    }

    const first = await playRound();
    const second = await playRound();

    expect(new Set(first).size).toBe(10);
    expect(second.filter((pair) => first.includes(pair))).toEqual([]);
  });
});
