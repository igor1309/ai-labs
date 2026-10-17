import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { boardState, type Sorting } from "../src/sorting/index.ts";
import { finishBoard, openSortingGame, sortCards, sortingRecord, storedRecord, tray } from "./sorting.tsx";
import { PALETTE, fakeBodyPicture, memoryStorage, sameColour, symbolOf, type MemoryStorage } from "./support.ts";

const QUIZ = { bestScore: 9, roundsPlayed: 3, achievements: ["first-round"] };
const CARE = { bestScore: 6, visitsFinished: 2, friends: ["triceratops"] };

const stored = (bestScore: number | null, roundsPlayed: number, games: Record<string, unknown> = {}) =>
  memoryStorage({ [PROGRESS_KEY]: sortingRecord({ bestScore, roundsPlayed }, games) });

const storedSorting = (storage: MemoryStorage) => storedRecord(storage)?.games["sort-dinosaurs"];

const score = () => screen.getByLabelText("SCORE").textContent;
const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
// What the one celebration shows a child who cannot read its label: its
// symbol and its words.
const shownCelebration = () => {
  const status = screen.getByRole("status");
  return [symbolOf(status), status.textContent];
};
const confetti = () => document.querySelectorAll(".festivity .confetti").length;
const shownBest = () => screen.queryByLabelText("BEST SCORE")?.querySelector(".best-score-value")?.textContent;
// The best a new best beat, shown before it with an arrow pointing on.
const shownBeaten = () => {
  const best = screen.queryByLabelText("BEST SCORE");
  return best && [best.querySelector(".best-score-beaten")?.textContent, symbolOf(best)];
};
const trayNames = () => within(tray()).queryAllByRole("button").map((card) => card.getAttribute("aria-label"));
const namesOf = (sorting: Sorting) => boardState(sorting).cards.map(({ dinosaur }) => dinosaur.name.en);

// The game on its first board, and that board.
function openGame(storage = memoryStorage()) {
  const game = openSortingGame({ storage });
  const board = game.nextBoard();
  expect(trayNames()).toEqual(namesOf(board));
  return { ...game, board };
}

describe("the sorting game's result", () => {
  it("ends a board of 4 right on the first drop with 4/6, six stars, four of them won one by one, the best score, Play again and Home", async () => {
    const { user, board } = openGame(stored(5, 2));
    await sortCards(user, board, 4);
    expect(screen.queryByLabelText("SCORE")).toBeNull();

    await user.click(screen.getByRole("button", { name: "SEE RESULT" }));

    expect(score()).toBe("4/6");
    const stars = [...screen.getByRole("img", { name: "4 OF 6 STARS" }).children] as HTMLElement[];
    expect(stars.map((star) => sameColour(getComputedStyle(star).color, PALETTE.light.amber ?? ""))).toEqual([true, true, true, true, false, false]);
    // Each won star's place in the stagger it pops in by.
    expect(stars.filter((star) => star.classList.contains("star-won")).map((star) => star.style.getPropertyValue("--star"))).toEqual(["0", "1", "2", "3"]);
    expect(shownBest()).toBe("5");
    expect(celebrations()).toEqual([]);
    expect(document.querySelector(".result-hero")?.getAttribute("src")).toBe(fakeBodyPicture("tyrannosaurus"));
    expect(["PLAY AGAIN", "HOME"].map((name) => screen.getByRole("button", { name })).map((button) => [symbolOf(button), button.textContent])).toEqual([
      ["rotate-ccw", "PLAY AGAIN"],
      ["house", "HOME"]
    ]);
  });

  it("starts a new board on Play again, sorting by another property", async () => {
    const { user, board, nextBoard } = openGame();
    await finishBoard(user, board, 6);

    await user.click(screen.getByRole("button", { name: "PLAY AGAIN" }));

    const again = nextBoard();
    expect(boardState(again).property).not.toBe(boardState(board).property);
    expect(trayNames()).toEqual(namesOf(again));
    expect(document.querySelectorAll('.step[data-step="done"]')).toHaveLength(0);
    expect(screen.queryByLabelText("SCORE")).toBeNull();
  });

  it("goes home from the result on Home", async () => {
    const { user, board, homes } = openGame();
    await finishBoard(user, board, 3);

    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(homes).toEqual([1]);
  });
});

describe("the sorting game's best score", () => {
  it("celebrates the first finished board as the first best", async () => {
    const storage = memoryStorage();
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 3);

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(shownCelebration()).toEqual(["star", "FIRST BEST!"]);
    expect(confetti()).toBeGreaterThan(0);
    expect(shownBest()).toBe("3");
    expect(shownBeaten()).toEqual([undefined, undefined]);
    expect(storedSorting(storage)).toEqual({ bestScore: 3, roundsPlayed: 1 });
  });

  it("celebrates a new best score and keeps it", async () => {
    const storage = stored(4, 2);
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 5);

    expect(celebrations()).toEqual(["NEW BEST SCORE"]);
    expect(shownCelebration()).toEqual(["trophy", "NEW BEST!"]);
    expect(confetti()).toBeGreaterThan(0);
    expect(shownBest()).toBe("5");
    expect(shownBeaten()).toEqual(["4", "arrow-right"]);
    expect(storedSorting(storage)).toEqual({ bestScore: 5, roundsPlayed: 3 });
  });

  it.each([5, 3])("does not celebrate %i against a best of 5, and the best stays 5", async (right) => {
    const storage = stored(5, 2);
    const { user, board } = openGame(storage);

    await finishBoard(user, board, right);

    expect(score()).toBe(`${right}/6`);
    expect(celebrations()).toEqual([]);
    expect(confetti()).toBe(0);
    expect(shownBest()).toBe("5");
    expect(shownBeaten()).toEqual([undefined, undefined]);
    expect(storedSorting(storage)).toEqual({ bestScore: 5, roundsPlayed: 3 });
  });

  it("does not celebrate a first board of 0, which shows six stars, none won, and still sets the best", async () => {
    const storage = memoryStorage();
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 0);

    expect(celebrations()).toEqual([]);
    expect(confetti()).toBe(0);
    const stars = screen.getByRole("img", { name: "0 OF 6 STARS" });
    expect([stars.children.length, stars.querySelectorAll(".star-won").length]).toEqual([6, 0]);
    expect(shownBest()).toBe("0");
    expect(storedSorting(storage)).toEqual({ bestScore: 0, roundsPlayed: 1 });
  });
});

describe("the sorting game's stored progress", () => {
  it("counts a finished board", async () => {
    const storage = stored(5, 3);
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 2);

    expect(storedSorting(storage)).toEqual({ bestScore: 5, roundsPlayed: 4 });
  });

  it("does not record a board left early", async () => {
    const kept = sortingRecord({ bestScore: 4, roundsPlayed: 3 });
    const storage = memoryStorage({ [PROGRESS_KEY]: kept });
    const { user, board, homes } = openGame(storage);
    await sortCards(user, board, 5, { count: 5 });

    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(homes).toEqual([1]);
    expect(storage.items.get(PROGRESS_KEY)).toBe(kept);
  });

  it("keeps its own best score beside the quiz's, and leaves the quiz's and care's as they were", async () => {
    const storage = memoryStorage({
      [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": QUIZ, "dinosaur-care": CARE } })
    });
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 2);

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(storedRecord(storage)).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": QUIZ, "dinosaur-care": CARE, "sort-dinosaurs": { bestScore: 2, roundsPlayed: 1 } }
    });
  });

  it.each([
    ["unreadable", "{not json"],
    ["from an unknown schema version", JSON.stringify({ schemaVersion: 2, games: { "sort-dinosaurs": { bestScore: 6, roundsPlayed: 3 } } })]
  ])("counts progress that is %s as none and replaces it with a readable record", async (_, bad) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: bad });
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 3);

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(shownBest()).toBe("3");
    expect(storedRecord(storage)).toEqual({ schemaVersion: 1, games: { "sort-dinosaurs": { bestScore: 3, roundsPlayed: 1 } } });
  });

  it("celebrates progress that cannot be saved against what was read", async () => {
    const kept = sortingRecord({ bestScore: 4, roundsPlayed: 2 });
    const storage = memoryStorage({ [PROGRESS_KEY]: kept }, { save: false });
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 5);

    expect(celebrations()).toEqual(["NEW BEST SCORE"]);
    expect(shownBest()).toBe("5");
    expect(storage.items.get(PROGRESS_KEY)).toBe(kept);
  });

  it("shows the score but no best and no celebration when storage cannot be read", async () => {
    const kept = sortingRecord({ bestScore: 2, roundsPlayed: 3 });
    const storage = memoryStorage({ [PROGRESS_KEY]: kept }, { read: false });
    const { user, board } = openGame(storage);

    await finishBoard(user, board, 4);

    expect(score()).toBe("4/6");
    expect(screen.queryByLabelText("BEST SCORE")).toBeNull();
    expect(celebrations()).toEqual([]);
    expect(confetti()).toBe(0);
    expect(storage.items.get(PROGRESS_KEY)).toBe(kept);
  });
});
