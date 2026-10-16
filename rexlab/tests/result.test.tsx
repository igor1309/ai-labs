import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { largerOf, type Question } from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, englishDevice, manualOrientation, memoryStorage, seededRandom, type MemoryStorage } from "./support.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const byName = (name: string) => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name.en === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

const group = () => screen.getByRole("group", { name: "Dinosaurs" });
const cardOf = (name: string) => within(group()).getByRole("button", { name });
const progress = () => screen.getByLabelText("Progress").textContent;

function shownQuestion(): Question {
  const attribute = screen.getByRole("heading").textContent?.includes("heavier") ? "mass" : "height";
  const [left, right] = within(group())
    .getAllByRole("button")
    .map((card) => byName(card.getAttribute("aria-label") ?? ""));
  if (!left || !right) throw new Error("Expected two dinosaur cards");
  return { attribute, left, right };
}

// A stored record in the section 5 format of docs/mvp-infrastructure.md.
const record = (bestScore: number | null, roundsPlayed: number) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed } } });

const stored = (storage: MemoryStorage) => {
  const raw = storage.items.get(PROGRESS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
};
const storedGame = (storage: MemoryStorage) => stored(storage)?.games["compare-dinosaurs"];

function openApp(storage: MemoryStorage, seed = 21) {
  render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      random={seededRandom(seed)}
      orientation={manualOrientation("landscape")}
      progress={localProgress(() => storage)}
      {...englishDevice()}
    />
  );
  return userEvent.setup();
}

// Starts a round and answers its first `count` questions, the first
// `correct` of them right and the rest wrong, moving on after each but the
// last question of the round.
async function answer(user: UserEvent, correct: number, count = 10) {
  await user.click(screen.getByRole("button", { name: "COMPARE" }));
  for (let number = 1; number <= count; number++) {
    const question = shownQuestion();
    const larger = largerOf(question);
    const tapped = number <= correct ? larger : larger === question.left ? question.right : question.left;
    await user.click(cardOf(tapped.name.en));
    if (number < 10) await user.click(screen.getByRole("button", { name: "Next" }));
  }
}

async function finishRound(user: UserEvent, correct: number) {
  await answer(user, correct);
  await user.click(screen.getByRole("button", { name: "See result" }));
}

const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
// What the one celebration shows a child who cannot read its label: each
// visible part's text, its symbol and then its words.
const shownCelebration = () =>
  [...screen.getByRole("status").children]
    .filter((part) => getComputedStyle(part).display !== "none" && getComputedStyle(part).visibility !== "hidden")
    .map((part) => part.textContent);
const shownBest = () => {
  const best = screen.queryByLabelText("Best score");
  return best && within(best).getByText(/^\d+$/).textContent;
};

describe("the result", () => {
  it("ends the round with its score, the best score, Play again and Home", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(9, 2) });
    const user = openApp(storage);
    await answer(user, 7);

    await user.click(screen.getByRole("button", { name: "See result" }));

    expect(screen.getByText("7/10")).toBeDefined();
    expect(screen.getByRole("img", { name: "7 of 10 stars" })).toBeDefined();
    expect(shownBest()).toBe("9");
    expect(screen.getByRole("button", { name: "Play again" }).textContent).toBe("🔄 Play again");
    expect(screen.getByRole("button", { name: "Home" }).textContent).toBe("🏠 Home");
  });

  it("starts a new round of 10 questions on Play again", async () => {
    const user = openApp(memoryStorage());
    await finishRound(user, 5);

    await user.click(screen.getByRole("button", { name: "Play again" }));

    expect(progress()).toBe("1/10");
    expect(within(group()).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByLabelText("Score")).toBeNull();
  });

  it("returns to the home page on Home", async () => {
    const user = openApp(memoryStorage());
    await finishRound(user, 5);

    await user.click(screen.getByRole("button", { name: "Home" }));

    expect(screen.getByRole("button", { name: "COMPARE" })).toBeDefined();
    expect(screen.queryByLabelText("Score")).toBeNull();
  });
});

describe("stored progress", () => {
  it("counts a finished round", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(9, 3) });
    const user = openApp(storage);

    await finishRound(user, 5);

    expect(storedGame(storage)).toEqual({ bestScore: 9, roundsPlayed: 4 });
  });

  it("celebrates a new best score and keeps it", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(6, 3) });
    const user = openApp(storage);

    await finishRound(user, 7);

    expect(celebrations()).toEqual(["New best score"]);
    expect(shownCelebration()).toEqual(["🎉🏆🎉", "NEW BEST!"]);
    expect(shownBest()).toBe("7");
    expect(storedGame(storage)).toEqual({ bestScore: 7, roundsPlayed: 4 });
  });

  it.each([7, 5])("does not celebrate %i against a best of 7, and the best stays 7", async (score) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(7, 3) });
    const user = openApp(storage);

    await finishRound(user, score);

    expect(screen.getByText(`${score}/10`)).toBeDefined();
    expect(celebrations()).toEqual([]);
    expect(shownBest()).toBe("7");
    expect(storedGame(storage)).toEqual({ bestScore: 7, roundsPlayed: 4 });
  });

  it("celebrates the first finished round as the first best", async () => {
    const storage = memoryStorage();
    const user = openApp(storage);

    await finishRound(user, 4);

    expect(celebrations()).toEqual(["First best score"]);
    expect(shownCelebration()).toEqual(["🎉⭐🎉", "FIRST BEST!"]);
    expect(shownBest()).toBe("4");
    expect(storedGame(storage)).toEqual({ bestScore: 4, roundsPlayed: 1 });
  });

  it("does not celebrate a first round of 0, which still sets the best", async () => {
    const storage = memoryStorage();
    const user = openApp(storage);

    await finishRound(user, 0);

    expect(celebrations()).toEqual([]);
    expect(shownBest()).toBe("0");
    expect(storedGame(storage)).toEqual({ bestScore: 0, roundsPlayed: 1 });
  });

  it("does not record a round left early, and goes home without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const kept = record(6, 3);
    const storage = memoryStorage({ [PROGRESS_KEY]: kept });
    const user = openApp(storage);
    await answer(user, 4, 4);
    expect(progress()).toBe("5/10");

    await user.click(screen.getByRole("button", { name: "Home" }));

    expect(screen.getByRole("button", { name: "COMPARE" })).toBeDefined();
    expect(confirm).not.toHaveBeenCalled();
    expect(storage.items.get(PROGRESS_KEY)).toBe(kept);
  });

  it.each([
    ["unreadable", "{not json"],
    ["from an unknown schema version", JSON.stringify({ schemaVersion: 2, games: { "compare-dinosaurs": { bestScore: 9, roundsPlayed: 3 } } })]
  ])("counts progress that is %s as none and replaces it", async (_, bad) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: bad });
    const user = openApp(storage);

    await finishRound(user, 4);

    expect(celebrations()).toEqual(["First best score"]);
    expect(shownBest()).toBe("4");
    expect(stored(storage)).toEqual({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 4, roundsPlayed: 1 } } });
  });

  it("shows the score but no best and no celebration when storage cannot be read", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(2, 3) }, { read: false });
    const user = openApp(storage);

    await finishRound(user, 4);

    expect(screen.getByText("4/10")).toBeDefined();
    expect(screen.queryByLabelText("Best score")).toBeNull();
    expect(celebrations()).toEqual([]);
    expect(storage.items.get(PROGRESS_KEY)).toBe(record(2, 3));
  });

  it("celebrates progress that cannot be saved against what was read", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(6, 3) }, { save: false });
    const user = openApp(storage);

    await finishRound(user, 7);

    expect(celebrations()).toEqual(["New best score"]);
    expect(shownBest()).toBe("7");
    expect(storedGame(storage)).toEqual({ bestScore: 6, roundsPlayed: 3 });
  });
});
