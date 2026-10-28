import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevelSetting } from "../src/ageLevel.ts";
import records from "../src/data/dinosaurs.json";
import { readPictureDinosaurs } from "../src/dinosaurs.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localPicturePuzzleChoice, localPicturePuzzleProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { usePicturePuzzleGame } from "../src/picturePuzzleGame.tsx";
import type { Theme } from "../src/theme.ts";
import { withPictures } from "./pictures.tsx";
import { fakeBodyPicture, manualVisibility, memoryStorage, seededRandom, type MemoryStorage } from "./support.ts";

const DINOSAURS = readPictureDinosaurs(records);
const INITIAL: AgeLevelSetting = { level: "explorer", revision: null };
const button = (name: string) => screen.getByRole("button", { name });

function openChoice(storage: MemoryStorage, setting: AgeLevelSetting, language: Language, theme: Theme, random: () => number) {
  let current: ReturnType<typeof usePicturePuzzleGame> | undefined;
  const onHome = vi.fn<() => void>();
  const presence = manualVisibility("visible");
  const props = { dinosaurs: DINOSAURS, bodyPicture: fakeBodyPicture, choiceStore: localPicturePuzzleChoice(() => storage), progressStore: localPicturePuzzleProgress(() => storage), random };
  function Choice({ setting }: { setting: AgeLevelSetting }) {
    current = usePicturePuzzleGame(props, setting, presence, onHome);
    return <div data-theme={theme}>{current.choice(language)}</div>;
  }
  const view = render(<Choice setting={setting} />, withPictures);
  return {
    ...view, onHome,
    setting: (next: AgeLevelSetting) => view.rerender(<Choice setting={next} />),
    game: () => {
      if (!current) throw new Error("Choice has not rendered");
      return current;
    }
  };
}

describe.each(LANGUAGES)("picture choice in %s", (language) => {
  it.each(["light", "dark"] as const)("shows three named pictures, shared collection stars and usable controls in %s", (theme) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: {
      "picture-puzzle": { earned: ["tyrannosaurus", "tyrannosaurus", "obsolete-id", "stegosaurus"] }
    } }) });
    const view = openChoice(storage, INITIAL, language, theme, seededRandom(17));
    const text = TEXTS[language];
    expect(screen.getByRole("heading").textContent).toBe(text.picturePuzzle);
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("2/3");
    const cards = within(screen.getByRole("group", { name: text.creatures })).getAllByRole("button");
    expect(cards.map((card) => card.textContent)).toEqual(DINOSAURS.map(({ name }) => name[language].toLocaleUpperCase(language)));
    expect(cards.map((card) => card.querySelector("img")?.getAttribute("src"))).toEqual(DINOSAURS.map(({ id }) => fakeBodyPicture(id)));
    expect(cards.map((card) => card.querySelector("[role=img]")?.getAttribute("aria-label"))).toEqual([text.star, text.pictureNotCollected, text.star]);
    for (const card of cards) {
      const style = getComputedStyle(card);
      expect([style.minWidth, style.minHeight]).toEqual(["48px", "48px"]);
      expect(card.hasAttribute("disabled")).toBe(false);
      expect(card.querySelector("svg")).not.toBeNull();
    }
    expect(getComputedStyle(cards[0]!).backgroundColor).toBe(theme === "dark" ? "rgb(24, 30, 46)" : "rgb(255, 253, 248)");
    expect(view.game().puzzle).toBeUndefined();
    fireEvent.click(button(text.ageLevels.hatchling.name));
    expect(view.game().puzzle).toBeUndefined();
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("2/3");
    expect(cards.map((card) => card.querySelector("[data-earned]")?.getAttribute("data-earned"))).toEqual(["true", "false", "true"]);
    fireEvent.click(button(text.home));
    expect(view.onHome).toHaveBeenCalledTimes(1);
  });
});

describe("picture choice's level and puzzle boundary", () => {
  it.each(AGE_LEVELS)("starts at the global %s level without starting or saving a puzzle", (level) => {
    const random = vi.fn(() => 0);
    const storage = memoryStorage();
    const view = openChoice(storage, { level, revision: `pick-${level}` }, "en", "light", random);
    expect(view.game().level).toBe(level);
    expect(button(TEXTS.en.ageLevels[level].name).getAttribute("aria-pressed")).toBe("true");
    expect(view.game().puzzle).toBeUndefined();
    expect(random).not.toHaveBeenCalled();
    expect(storage.items.size).toBe(0);
  });

  it("keeps the child's choice on reload until the parent's revision changes, even back to the same global level", () => {
    const storage = memoryStorage();
    const view = openChoice(storage, INITIAL, "en", "light", seededRandom(17));
    fireEvent.click(button(TEXTS.en.ageLevels.paleontologist.name));
    expect(view.game().level).toBe("paleontologist");
    expect(localPicturePuzzleChoice(() => storage).load()?.levelChoice).toEqual({ level: "paleontologist", revision: null });
    view.unmount();

    const reloaded = openChoice(storage, INITIAL, "en", "light", seededRandom(17));
    expect(reloaded.game().level).toBe("paleontologist");
    reloaded.setting({ level: "hatchling", revision: "parent-1" });
    expect(reloaded.game().level).toBe("hatchling");
    reloaded.setting({ level: "explorer", revision: "parent-2" });
    expect(reloaded.game().level).toBe("explorer");
    fireEvent.click(button(TEXTS.en.ageLevels.hatchling.name));
    reloaded.unmount();
    const again = openChoice(storage, { level: "explorer", revision: "parent-2" }, "en", "light", seededRandom(17));
    expect(again.game().level).toBe("hatchling");
  });

  it.each(["read", "write"])("keeps choices for this session when storage fails on %s", (failure) => {
    const storage = memoryStorage({}, { read: failure !== "read", save: failure !== "write" });
    const view = openChoice(storage, INITIAL, "en", "light", seededRandom(17));
    fireEvent.click(button(TEXTS.en.ageLevels.hatchling.name));
    expect(view.game().level).toBe("hatchling");
    fireEvent.click(button("TRICERATOPS"));
    expect(view.game().puzzle).toMatchObject({ dinosaur: { id: "triceratops" }, level: "hatchling" });
    act(() => view.game().back());
    expect(view.game().level).toBe("hatchling");
    expect(storage.items.size).toBe(0);
    view.unmount();
    expect(openChoice(storage, INITIAL, "en", "light", seededRandom(17)).game().level).toBe("explorer");
  });

  it.each(DINOSAURS)("chooses a fresh $id puzzle at the displayed level, and leaving earns nothing", (dinosaur) => {
    const storage = memoryStorage();
    const view = openChoice(storage, INITIAL, "en", "light", seededRandom(17));
    fireEvent.click(button(TEXTS.en.ageLevels.hatchling.name));
    const saved = storage.items.get(PROGRESS_KEY);
    fireEvent.click(button(dinosaur.name.en.toUpperCase()));
    const first = view.game().puzzle;
    expect(first).toMatchObject({ dinosaur, level: "hatchling", cut: { columns: 4, rows: 3 }, fitted: [] });
    expect(first?.order).toHaveLength(12);
    act(() => view.game().back());
    expect(view.game().puzzle).toBeUndefined();
    expect(screen.getByLabelText(TEXTS.en.pictureCollection).textContent).toBe("0/3");
    fireEvent.click(button(dinosaur.name.en.toUpperCase()));
    const replay = view.game().puzzle;
    expect(replay).not.toBe(first);
    expect(replay?.order).not.toEqual(first?.order);
    expect(replay?.fitted).toEqual([]);
    act(() => view.game().home());
    expect(view.game().puzzle).toBeUndefined();
    expect(view.onHome).toHaveBeenCalledTimes(1);
    expect(storage.items.get(PROGRESS_KEY)).toBe(saved);
    expect(localPicturePuzzleChoice(() => storage).load()?.earned).toEqual([]);
  });

  it("uses a level chosen immediately before the dinosaur, and accepts only the first start while a screen change is pending", () => {
    const random = vi.fn(() => 0);
    const view = openChoice(memoryStorage(), INITIAL, "en", "light", random);
    const level = button(TEXTS.en.ageLevels.paleontologist.name);
    const dinosaurs = [button("TYRANNOSAURUS"), button("TRICERATOPS")];
    act(() => {
      fireEvent.click(level);
      for (const dinosaur of dinosaurs) fireEvent.click(dinosaur, { detail: 0 });
      fireEvent.click(level);
    });
    expect(view.game().puzzle).toMatchObject({ dinosaur: { id: "tyrannosaurus" }, level: "paleontologist" });
    expect(random).toHaveBeenCalledTimes(35);
  });
});

it("renders the board from the choice, keeps placements through hints and preview, and leaves without rewards", () => {
  const storage = memoryStorage();
  let current: ReturnType<typeof usePicturePuzzleGame> | undefined;
  const onHome = vi.fn<() => void>();
  const presence = manualVisibility("visible");
  function Game() {
    const game = usePicturePuzzleGame({ dinosaurs: DINOSAURS, bodyPicture: fakeBodyPicture,
      choiceStore: localPicturePuzzleChoice(() => storage), progressStore: localPicturePuzzleProgress(() => storage), random: seededRandom(17) }, INITIAL, presence, onHome);
    current = game;
    return <>{game.choice("en")}{game.board("en")}</>;
  }
  render(<Game />, withPictures);
  fireEvent.click(button("TYRANNOSAURUS"));
  const id = current!.puzzle!.order[0]!;
  fireEvent.click(screen.getByLabelText(TEXTS.en.picturePiece(id + 1)));
  fireEvent.click(screen.getByLabelText(TEXTS.en.pictureSlot((id + 1) % 24 + 1)));
  expect(current!.puzzle!.fitted).toEqual([]);
  expect(screen.getByLabelText(TEXTS.en.picturePiece(id + 1)).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByLabelText(TEXTS.en.pictureSlot(id + 1)));
  expect(current!.puzzle!.fitted).toEqual([id]);
  fireEvent.click(button(TEXTS.en.pictureHint));
  fireEvent.click(button(TEXTS.en.picturePreview));
  expect(current!.puzzle!.fitted).toEqual([id]);
  expect(localPicturePuzzleChoice(() => storage).load()?.earned).toEqual([]);
  fireEvent.click(button(TEXTS.en.back));
  expect(current!.puzzle).toBeUndefined();
  expect(screen.getByLabelText(TEXTS.en.pictureCollection).textContent).toBe("0/3");
  fireEvent.click(button("TYRANNOSAURUS"));
  expect(current!.puzzle!.fitted).toEqual([]);
  fireEvent.click(button(TEXTS.en.home));
  expect(onHome).toHaveBeenCalledTimes(1);
  expect(storage.items.size).toBe(0);
});
