import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { correctOf } from "../src/quiz/round.ts";
import {
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptySorting,
  emptyPairs,
  englishDevice,
  emptySkeletons,
  fakeBodyPicture,
  featuring,
  lightDevice,
  loadedPictures,
  manualViewport,
  memoryStorage,
  pageAtRest,
  sameColour,
  seededRandom,
  symbolOf,
  type MemoryStorage,
  gameDoor,
  shownQuestion,
  wrongOf
} from "./support.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const group = () => screen.getByRole("group", { name: "ANIMALS" });
const cardOf = (name: string) => within(group()).getByRole("button", { name });
const progress = () => screen.getByLabelText("PROGRESS").textContent;

// A stored record in the section 5 format of docs/mvp-infrastructure.md.
const record = (bestScore: number | null, roundsPlayed: number) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed } } });

const stored = (storage: MemoryStorage) => {
  const raw = storage.items.get(PROGRESS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
};
const storedGame = (storage: MemoryStorage) => stored(storage)?.games["compare-dinosaurs"];
// The quiz's entry as a round saves it, its best at Hatchling.
const savedGame = (bestScore: number, roundsPlayed: number) => ({ bestScore, explorerBest: null, paleontologistBest: null, roundsPlayed });

// The age level picked, Hatchling, whose best a record saved before the
// quiz had levels holds.
const HATCHLING = { load: () => ({ level: "hatchling" as const, revision: null }), save: () => {} };

function openApp(storage: MemoryStorage, seed = 21) {
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(seed)}
      portraitLayouts={{}}
      viewport={manualViewport("landscape")}
      progress={localProgress(() => storage)}
      {...englishDevice()}
      {...lightDevice()}
      ageLevelStore={HATCHLING}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      {...pageAtRest()}
      {...loadedPictures()}
    />
  );
  return userEvent.setup({ delay: null });
}

// Starts a round and answers its first `count` questions, the first
// `correct` of them right and the rest wrong, moving on after each but the
// last question of the round.
async function answer(user: UserEvent, correct: number, count = 10) {
  await user.click(gameDoor("COMPARE"));
  for (let number = 1; number <= count; number++) {
    const question = shownQuestion();
    const tapped = number <= correct ? correctOf(question) : wrongOf(question);
    await user.click(cardOf(tapped.name.en));
    if (number < 10) await user.click(screen.getByRole("button", { name: "NEXT" }));
  }
}

async function finishRound(user: UserEvent, correct: number) {
  await answer(user, correct);
  await user.click(screen.getByRole("button", { name: "SEE RESULT" }));
}

const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
// What the one celebration shows a child who cannot read its label: its
// symbol and its words.
const shownCelebration = () => {
  const status = screen.getByRole("status");
  return [symbolOf(status), status.textContent];
};
// The confetti thrown over the screen, none without a celebration.
const confetti = () => document.querySelectorAll(".festivity .confetti").length;
const score = () => screen.getByLabelText("SCORE").textContent;
const shownBest = () => screen.queryByLabelText("BEST SCORE")?.querySelector(".best-score-value")?.textContent;
// The best a new best beat, shown before it with an arrow pointing on.
const shownBeaten = () => {
  const best = screen.queryByLabelText("BEST SCORE");
  return best && [best.querySelector(".best-score-beaten")?.textContent, symbolOf(best)];
};

describe("the result", () => {
  it("ends the round with its score, the best score, Play again and Home", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(9, 2) });
    const user = openApp(storage);
    await answer(user, 7);

    await user.click(screen.getByRole("button", { name: "SEE RESULT" }));

    expect(score()).toBe("7/10");
    // One star per question, those scored in amber.
    const stars = [...screen.getByRole("img", { name: "7 OF 10 STARS" }).children];
    expect(stars.map((star) => sameColour(getComputedStyle(star).color, PALETTE.light.amber ?? ""))).toEqual([
      ...Array<boolean>(7).fill(true),
      ...Array<boolean>(3).fill(false)
    ]);
    expect(shownBest()).toBe("9");
    expect(shownBeaten()).toEqual([undefined, undefined]);
    expect(document.querySelector<HTMLImageElement>(".result-hero")?.getAttribute("src")).toBe(fakeBodyPicture("tyrannosaurus"));
    const [playAgain, home] = ["PLAY AGAIN", "HOME"].map((name) => screen.getByRole("button", { name }));
    expect([playAgain, home].map((button) => button && [symbolOf(button), button.textContent])).toEqual([
      ["rotate-ccw", "PLAY AGAIN"],
      ["house", "HOME"]
    ]);
  });

  it("starts a new round of 10 questions on Play again", async () => {
    const user = openApp(memoryStorage());
    await finishRound(user, 5);

    await user.click(screen.getByRole("button", { name: "PLAY AGAIN" }));

    expect(progress()).toBe("1/10");
    expect(within(group()).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByLabelText("SCORE")).toBeNull();
  });

  it("returns to the home page on Home", async () => {
    const user = openApp(memoryStorage());
    await finishRound(user, 5);

    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(gameDoor("COMPARE")).toBeDefined();
    expect(screen.queryByLabelText("SCORE")).toBeNull();
  });
});

describe("stored progress", () => {
  it("counts a finished round", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(9, 3) });
    const user = openApp(storage);

    await finishRound(user, 5);

    expect(storedGame(storage)).toEqual(savedGame(9, 4));
  });

  it("celebrates a new best score and keeps it", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(6, 3) });
    const user = openApp(storage);

    await finishRound(user, 7);

    expect(celebrations()).toEqual(["NEW BEST SCORE"]);
    expect(shownCelebration()).toEqual(["trophy", "NEW BEST!"]);
    expect(confetti()).toBeGreaterThan(0);
    expect(shownBest()).toBe("7");
    expect(shownBeaten()).toEqual(["6", "arrow-right"]);
    expect(storedGame(storage)).toEqual(savedGame(7, 4));
  });

  it.each([7, 5])("does not celebrate %i against a best of 7, and the best stays 7", async (points) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(7, 3) });
    const user = openApp(storage);

    await finishRound(user, points);

    expect(score()).toBe(`${points}/10`);
    expect(celebrations()).toEqual([]);
    expect(confetti()).toBe(0);
    expect(shownBest()).toBe("7");
    expect(shownBeaten()).toEqual([undefined, undefined]);
    expect(storedGame(storage)).toEqual(savedGame(7, 4));
  });

  it("celebrates the first finished round as the first best", async () => {
    const storage = memoryStorage();
    const user = openApp(storage);

    await finishRound(user, 4);

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(shownCelebration()).toEqual(["star", "FIRST BEST!"]);
    expect(confetti()).toBeGreaterThan(0);
    expect(shownBest()).toBe("4");
    expect(shownBeaten()).toEqual([undefined, undefined]);
    expect(storedGame(storage)).toEqual(savedGame(4, 1));
  });

  it("does not celebrate a first round of 0, which still sets the best", async () => {
    const storage = memoryStorage();
    const user = openApp(storage);

    await finishRound(user, 0);

    expect(celebrations()).toEqual([]);
    expect(confetti()).toBe(0);
    expect(shownBest()).toBe("0");
    expect(storedGame(storage)).toEqual(savedGame(0, 1));
  });

  it("does not record a round left early, and goes home without asking", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const kept = record(6, 3);
    const storage = memoryStorage({ [PROGRESS_KEY]: kept });
    const user = openApp(storage);
    await answer(user, 4, 4);
    expect(progress()).toBe("5/10");

    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(gameDoor("COMPARE")).toBeDefined();
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

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(shownBest()).toBe("4");
    expect(stored(storage)).toEqual({ schemaVersion: 1, games: { "compare-dinosaurs": savedGame(4, 1) } });
  });

  it("shows the score but no best and no celebration when storage cannot be read", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(2, 3) }, { read: false });
    const user = openApp(storage);

    await finishRound(user, 4);

    expect(score()).toBe("4/10");
    expect(screen.queryByLabelText("BEST SCORE")).toBeNull();
    expect(celebrations()).toEqual([]);
    expect(storage.items.get(PROGRESS_KEY)).toBe(record(2, 3));
  });

  it("celebrates progress that cannot be saved against what was read", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record(6, 3) }, { save: false });
    const user = openApp(storage);

    await finishRound(user, 7);

    expect(celebrations()).toEqual(["NEW BEST SCORE"]);
    expect(shownBest()).toBe("7");
    expect(shownBeaten()).toEqual(["6", "arrow-right"]);
    expect(storedGame(storage)).toEqual({ bestScore: 6, roundsPlayed: 3 });
  });
});
