import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import type { Language } from "../src/language/language.ts";
import type { Attribute, Dinosaur } from "../src/quiz/round.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
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
  manualOrientation,
  questionView,
  seededRandom,
  symbolOf,
  words,
  homeTile
} from "./support.ts";

const byName = (name: string): Dinosaur => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name.en === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

const cards = () => within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button");
const progress = () => screen.getByLabelText("PROGRESS").textContent;
const shownQuestion = () => ({
  prompt: screen.getByRole("heading").textContent,
  names: cards().map((card) => card.getAttribute("aria-label"))
});

async function answerAndGoOn(user: UserEvent) {
  const [first] = cards();
  if (!first) throw new Error("No dinosaur card to tap");
  await user.click(first);
  await user.click(screen.getByRole("button", { name: "NEXT" }));
}

describe("a question", () => {
  it.each<[Attribute, string, string]>([
    ["mass", "scale", "WHO IS HEAVIER?"],
    ["height", "ruler", "WHO IS TALLER?"]
  ])("comparing %s shows the %s symbol, its prompt and two dinosaur cards", (attribute, symbol, prompt) => {
    const nothing = () => {};
    render(
      <QuestionScreen
        language="en"
        {...questionView({ attribute, left: byName("Triceratops"), right: byName("Velociraptor") }, "en")}
        onChoose={nothing}
        onNext={nothing}
        onHome={nothing}
      />
    );

    const heading = screen.getByRole("heading", { name: prompt });
    expect([symbolOf(heading), words(heading)]).toEqual([symbol, prompt]);

    const [left, right] = cards();
    if (!left || !right) throw new Error("Expected two dinosaur cards");
    const pictures = [left, right].map((card) => within(card).getByRole("img"));
    for (const [card, name] of [
      [left, "Triceratops"],
      [right, "Velociraptor"]
    ] as const) {
      expect(within(card).getByRole("img", { name }).getAttribute("src")).toBe(fakeBodyPicture(byName(name).id));
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

    const home = screen.getByRole("button", { name: "HOME" });
    expect([symbolOf(home), home.textContent]).toEqual(["house", "HOME"]);
    expect(screen.getByRole("group", { name: "DINOSAURS" }).contains(home)).toBe(false);
  });
});

describe("a dinosaur card's picture", () => {
  // Each shipped dinosaur once on the left and once on the right, so none
  // is shown with another's picture on either side.
  const pairs = SHIPPED_DINOSAURS.map((left, index) => [left, SHIPPED_DINOSAURS[(index + 1) % SHIPPED_DINOSAURS.length] ?? left] as const);

  it.each<Language>(["en", "ru"])("is the dinosaur's own, named in %s", (language) => {
    const nothing = () => {};
    for (const [left, right] of pairs) {
      const { unmount } = render(
        <QuestionScreen language={language} {...questionView({ attribute: "mass", left, right }, language)} onChoose={nothing} onNext={nothing} onHome={nothing} />
      );

      const shown = within(screen.getByRole("group")).getAllByRole("button").map((card) => {
        const picture = within(card).getByRole("img");
        return { src: picture.getAttribute("src"), name: picture.getAttribute("alt") };
      });
      expect(shown).toEqual([left, right].map((dinosaur) => ({ src: fakeBodyPicture(dinosaur.id), name: dinosaur.name[language] })));
      unmount();
    }
  });
});

describe("a round", () => {
  it("asks to turn the iPad sideways in portrait and resumes the same question", async () => {
    const orientation = manualOrientation("landscape");
    render(<App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(3)} orientation={orientation} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...loadedPictures()} />);
    const user = userEvent.setup();
    await user.click(homeTile("COMPARE"));
    await answerAndGoOn(user);
    await answerAndGoOn(user);
    expect(progress()).toBe("3/10");
    const third = shownQuestion();

    act(() => orientation.turn("portrait"));

    expect(screen.getByRole("img", { name: "TURN THE IPAD SIDEWAYS" })).toBeDefined();
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    act(() => orientation.turn("landscape"));

    expect(progress()).toBe("3/10");
    expect(shownQuestion()).toEqual(third);
  });

  it("marks the questions done, the one on screen and those to come on its steps", async () => {
    render(<App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(3)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...loadedPictures()} />);
    const user = userEvent.setup();
    await user.click(homeTile("COMPARE"));
    await answerAndGoOn(user);
    await answerAndGoOn(user);

    const steps = [...document.querySelectorAll<HTMLElement>(".step")].map((step) => step.dataset.step ?? "to come");
    expect(progress()).toBe("3/10");
    expect(steps).toEqual(["done", "done", "current", ...Array<string>(7).fill("to come")]);
  });

  // The generator's own tests cover the class of random draws; this one
  // proves the app hands each new round the one played before it.
  it("does not repeat the previous round's questions", async () => {
    render(<App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(5)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...loadedPictures()} />);
    const user = userEvent.setup();

    async function playRound() {
      await user.click(homeTile("COMPARE"));
      const asked = [];
      for (let number = 1; number <= 10; number++) {
        expect(progress()).toBe(`${number}/10`);
        asked.push([...shownQuestion().names].sort().join(" & "));
        if (number < 10) await answerAndGoOn(user);
      }
      await user.click(screen.getByRole("button", { name: "HOME" }));
      return asked;
    }

    const first = await playRound();
    const second = await playRound();

    expect(new Set(first).size).toBe(10);
    expect(second.filter((pair) => first.includes(pair))).toEqual([]);
  });
});
