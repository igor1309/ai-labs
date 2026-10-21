import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { App } from "../src/App.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { correctOf } from "../src/quiz/round.ts";
import { chooseFrom } from "./menus.ts";
import { storedRecord } from "./sorting.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuring,
  gameDoor,
  lightDevice,
  loadedPictures,
  manualViewport,
  memoryStorage,
  pageAtRest,
  seededRandom,
  type MemoryStorage
} from "./support.ts";

// The quiz's stored entry, its Hatchling best under the name it had
// before the quiz had levels.
const EMPTY_ENTRY = { bestScore: null, explorerBest: null, paleontologistBest: null, roundsPlayed: 0 };
const recordAt = (level: AgeLevel, entry: unknown = EMPTY_ENTRY) => memoryStorage({
  [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: "parent-pick" }),
  [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": entry } })
});
const storedQuiz = (storage: MemoryStorage) => storedRecord(storage)?.games["compare-dinosaurs"];

// The app on its home page with COMPARE as a tile, the age level and
// progress kept in `storage`.
function openApp(storage: MemoryStorage) {
  const view = render(
    <App
      {...featuring("sort")}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(21)}
      portraitLayouts={{}}
      viewport={manualViewport("landscape")}
      progress={localProgress(() => storage)}
      {...englishDevice()}
      {...lightDevice()}
      ageLevelStore={localAgeLevel(() => storage)}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      {...pageAtRest()}
      {...loadedPictures()}
    />
  );
  return { user: userEvent.setup(), unmount: view.unmount };
}

const button = (name: string) => screen.getByRole("button", { name });
const group = () => screen.getByRole("group", { name: "ANIMALS" });
const switchGroup = () => screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch });
const switchButton = (level: AgeLevel) => within(switchGroup()).getByRole("button", { name: TEXTS.en.ageLevels[level].name });
const chosen = () => AGE_LEVELS.filter((level) => switchButton(level).getAttribute("aria-pressed") === "true");
const shownBest = () => screen.queryByLabelText("BEST SCORE")?.querySelector(".best-score-value")?.textContent;
const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
const tileBest = () => gameDoor("COMPARE").querySelector(".compare-tile-best")?.textContent;
const onQuestion = () => screen.queryByRole("group", { name: "ANIMALS" }) !== null;
const byName = (name: string | null) => SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.name.en === name);

// Plays the round on screen to its result, the first `right` answers
// correct and the rest wrong, checking each asks a question for its level.
async function finishWith(user: UserEvent, right: number) {
  const kinds = new Set<string>();
  for (let number = 1; number <= 10; number++) {
    const heading = screen.getByRole("heading").textContent ?? "";
    kinds.add(heading);
    expect(["WHO IS HEAVIER?", "WHO IS TALLER?", "WHO IS LIGHTER?", "WHO IS SHORTER?"]).toContain(heading);
    const [left, right_] = within(group()).getAllByRole("button").map((card) => byName(card.getAttribute("aria-label")));
    if (!left || !right_) throw new Error("Expected two shipped dinosaurs");
    const kind = heading.includes("LIGHTER") ? "lighter" : heading.includes("SHORTER") ? "shorter" : heading.includes("HEAVIER") ? "heavier" : "taller";
    const correct = correctOf({ kind, attribute: kind === "taller" || kind === "shorter" ? "height" : "mass", left, right: right_ });
    const tapped = number <= right ? correct : correct === left ? right_ : left;
    await user.click(within(group()).getByRole("button", { name: tapped.name.en }));
    await user.click(button(number < 10 ? "NEXT" : "SEE RESULT"));
  }
  return kinds;
}

describe("the compare quiz's levels across the app", () => {
  it.each(AGE_LEVELS)("plays a first round at the age level %s, asks its level's questions, and saves its best there", async (level) => {
    const storage = recordAt(level);
    const { user } = openApp(storage);
    await user.click(gameDoor("COMPARE"));
    await finishWith(user, 3);
    expect(chosen()).toEqual([level]);
    const names = { hatchling: "bestScore", explorer: "explorerBest", paleontologist: "paleontologistBest" };
    expect(storedQuiz(storage)).toEqual({ ...EMPTY_ENTRY, [names[level]]: 3, roundsPlayed: 1 });
  });

  it("can ask lighter at Paleontologist and scores the lighter dinosaur right", async () => {
    const { user } = openApp(recordAt("paleontologist"));
    await user.click(gameDoor("COMPARE"));
    const kinds = await finishWith(user, 10);

    expect(kinds).toContain("WHO IS LIGHTER?");
    expect(screen.getByLabelText("SCORE").textContent).toBe("10/10");
  });

  it("can ask shorter at Paleontologist and scores the shorter dinosaur right", async () => {
    const { user } = openApp(recordAt("paleontologist"));
    await user.click(gameDoor("COMPARE"));
    const kinds = await finishWith(user, 10);

    expect(kinds).toContain("WHO IS SHORTER?");
    expect(screen.getByLabelText("SCORE").textContent).toBe("10/10");
  });

  it.each(["hatchling", "explorer"] as const)("never asks lighter at %s", async (level) => {
    const { user } = openApp(recordAt(level));
    await user.click(gameDoor("COMPARE"));
    const kinds = await finishWith(user, 10);

    expect(kinds).not.toContain("WHO IS LIGHTER?");
    expect(kinds).not.toContain("WHO IS SHORTER?");
  });

  it("shows the switch above PLAY AGAIN, youngest level first", async () => {
    const { user } = openApp(recordAt("explorer"));
    await user.click(gameDoor("COMPARE"));
    await finishWith(user, 7);
    const names = within(switchGroup()).getAllByRole("button").map((level) => level.getAttribute("aria-label") ?? level.textContent);
    expect(names.map((name) => name?.replace(/[^A-Z]/g, ""))).toEqual(["HATCHLING", "EXPLORER", "PALEONTOLOGIST"]);
    expect(switchGroup().compareDocumentPosition(button("PLAY AGAIN")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the result while a level is chosen, then plays it on PLAY AGAIN, from the tile and after reopening", async () => {
    const storage = recordAt("explorer", { ...EMPTY_ENTRY, explorerBest: 7, roundsPlayed: 2 });
    const app = openApp(storage);
    await app.user.click(gameDoor("COMPARE"));
    await finishWith(app.user, 5);
    const result = screen.getByRole("main");
    await app.user.click(switchButton("paleontologist"));
    expect([screen.getByRole("main") === result, screen.getByLabelText("SCORE").textContent, shownBest(), onQuestion()]).toEqual([true, "5/10", "7", false]);
    expect(storedQuiz(storage)).toEqual({ ...EMPTY_ENTRY, explorerBest: 7, roundsPlayed: 3, levelChoice: { level: "paleontologist", revision: "parent-pick" } });
    await app.user.click(button("PLAY AGAIN"));
    await finishWith(app.user, 2);
    expect(storedQuiz(storage)).toMatchObject({ explorerBest: 7, paleontologistBest: 2 });
    await app.user.click(button("HOME"));
    await app.user.click(gameDoor("COMPARE"));
    await finishWith(app.user, 4);
    expect([chosen(), storedQuiz(storage)]).toEqual([["paleontologist"], expect.objectContaining({ paleontologistBest: 4, roundsPlayed: 5 })]);
    app.unmount();
    const reopened = openApp(storage);
    await reopened.user.click(gameDoor("COMPARE"));
    await finishWith(reopened.user, 1);
    expect(chosen()).toEqual(["paleontologist"]);
  });

  it("celebrates a level's first best, keeps the other levels' bests, and shows it on the COMPARE tile", async () => {
    const storage = recordAt("paleontologist", { ...EMPTY_ENTRY, explorerBest: 6, roundsPlayed: 3 });
    const { user } = openApp(storage);
    await user.click(gameDoor("COMPARE"));
    await finishWith(user, 4);
    expect([celebrations(), shownBest()]).toEqual([["FIRST BEST SCORE"], "4"]);
    expect(storedQuiz(storage)).toEqual({ ...EMPTY_ENTRY, explorerBest: 6, paleontologistBest: 4, roundsPlayed: 4 });
    await user.click(button("HOME"));
    expect(tileBest()).toBe("4");
  });

  it("reads a best saved before the quiz had levels as Hatchling's", async () => {
    const storage = recordAt("explorer", { bestScore: 8, roundsPlayed: 2 });
    const { user } = openApp(storage);
    expect(tileBest()).toBeUndefined();
    await user.click(gameDoor("COMPARE"));
    await finishWith(user, 3);
    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    await user.click(switchButton("hatchling"));
    await user.click(button("HOME"));
    expect(tileBest()).toBe("8");
    expect(storedQuiz(storage)).toEqual({ bestScore: 8, explorerBest: 3, paleontologistBest: null, roundsPlayed: 3, levelChoice: { level: "hatchling", revision: "parent-pick" } });
  });

  it("drops the child's choice when a parent changes the age level", async () => {
    const storage = recordAt("explorer", { ...EMPTY_ENTRY, levelChoice: { level: "hatchling", revision: "parent-pick" } });
    const { user } = openApp(storage);
    await user.click(gameDoor("COMPARE"));
    await finishWith(user, 5);
    expect(chosen()).toEqual(["hatchling"]);
    await user.click(button("HOME"));
    await chooseFrom(user, TEXTS.en.ageLevelMenu, `${TEXTS.en.ageLevels.paleontologist.name} ${TEXTS.en.ageLevels.paleontologist.age}`);
    await user.click(gameDoor("COMPARE"));
    await finishWith(user, 5);
    expect(chosen()).toEqual(["paleontologist"]);
  });

  it.each([undefined, "hatchling"] as const)("holds an unsavable choice for the visit over a saved choice of %s, then reloads the stored level", async (saved) => {
    const entry = { ...EMPTY_ENTRY, ...(saved && { levelChoice: { level: saved, revision: "parent-pick" } }) };
    const storage = memoryStorage(Object.fromEntries(recordAt("explorer", entry).items), { save: false });
    const before = storage.items.get(PROGRESS_KEY);
    const app = openApp(storage);
    await app.user.click(gameDoor("COMPARE"));
    await finishWith(app.user, 5);
    await app.user.click(switchButton("paleontologist"));
    await app.user.click(button("HOME"));
    await app.user.click(gameDoor("COMPARE"));
    await finishWith(app.user, 5);
    expect([chosen(), storage.items.get(PROGRESS_KEY)]).toEqual([["paleontologist"], before]);
    app.unmount();
    const reopened = openApp(storage);
    await reopened.user.click(gameDoor("COMPARE"));
    await finishWith(reopened.user, 5);
    expect(chosen()).toEqual([saved ?? "explorer"]);
  });
});
