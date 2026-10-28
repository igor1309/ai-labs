import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import records from "../src/data/dinosaurs.json";
import { readPictureDinosaurs } from "../src/dinosaurs.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localPicturePuzzleChoice, localPicturePuzzleProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { usePicturePuzzleGame } from "../src/picturePuzzleGame.tsx";
import { NO_PICTURES, PICTURE_DINOSAURS } from "../src/picturePuzzle/index.ts";
import { PicturePuzzleResultScreen } from "../src/PicturePuzzleResultScreen.tsx";
import { withManualPictures, withPictures } from "./pictures.tsx";
import { fakeBodyPicture, manualVisibility, manualPictures, memoryStorage, seededRandom } from "./support.ts";
import { openWindow } from "./windowSizes.ts";

const DINOSAURS = readPictureDinosaurs(records);
const button = (name: string) => screen.getByRole("button", { name });

function openGame(storage: ReturnType<typeof memoryStorage>, language: Language, level: AgeLevel) {
  openWindow(1133, 744);
  const random = vi.fn(seededRandom(17));
  const onHome = vi.fn<() => void>();
  const presence = manualVisibility("visible");
  const progressStore = localPicturePuzzleProgress(() => storage);
  const save = vi.spyOn(progressStore, "save");
  let current: ReturnType<typeof usePicturePuzzleGame> | undefined;
  function Game() {
    current = usePicturePuzzleGame({ dinosaurs: DINOSAURS, bodyPicture: fakeBodyPicture,
      choiceStore: localPicturePuzzleChoice(() => storage), progressStore, random }, { level, revision: null }, presence, onHome);
    return <>{current.choice(language)}{current.board(language)}{current.result(language)}</>;
  }
  const view = render(<Game />, withPictures);
  return { ...view, onHome, save, random, game: () => {
    if (!current) throw new Error("Game has not rendered");
    return current;
  } };
}

// Integrates the game and persistence at the board's placement boundary;
// only the last piece needs a DOM interaction to reach the result.
function finish(view: ReturnType<typeof openGame>, language: Language): HTMLElement {
  const text = TEXTS[language];
  const puzzle = view.game().puzzle!;
  const onFit = view.game().board(language)!.props.onPlace;
  act(() => { for (const id of puzzle.order.slice(0, -1)) onFit(id, id); });
  const place = puzzle.order.at(-1)! + 1;
  const lastSlot = screen.getByRole("button", { name: text.pictureSlot(place) });
  fireEvent.click(button(text.picturePiece(place)), { detail: 0 });
  fireEvent.click(lastSlot, { detail: 0 });
  return lastSlot;
}

describe.each(LANGUAGES)("picture result in %s", (language) => {
  it.each(PICTURE_DINOSAURS)("reveals %s with a fact, round star, both scores and symbol actions while the picture loads", (id) => {
    const pictures = manualPictures();
    const text = TEXTS[language];
    const dinosaur = DINOSAURS.find((each) => each.id === id)!;
    const onReplay = vi.fn<() => void>();
    const onAnother = vi.fn<() => void>();
    const onHome = vi.fn<() => void>();
    const view = render(<div data-theme="dark"><PicturePuzzleResultScreen language={language} name={dinosaur.name[language]}
      fact={text.pictureFacts[id]} level="explorer" score={2} shared={3} best={2} beaten={1} celebration="new-best"
      picture={fakeBodyPicture(id)} onReplay={onReplay} onAnother={onAnother} onHome={onHome} /></div>, withManualPictures(pictures));
    const name = dinosaur.name[language].toLocaleUpperCase(language);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(name);
    expect(screen.getByText(text.pictureFacts[id]).textContent).toBe(text.pictureFacts[id].toLocaleUpperCase(language));
    expect(screen.getByRole("img", { name })).not.toBeNull();
    expect(screen.getByRole("img", { name: text.star })).not.toBeNull();
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.explorer.name} 2/3`);
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("3/3");
    expect(screen.getByLabelText(text.bestScore).textContent).toBe(`${text.best}12/3`);
    expect(screen.getByRole("status").textContent).toBe(text.celebrations["new-best"].text);
    expect(getComputedStyle(view.container.querySelector("main")!).backgroundColor).toBe("rgb(15, 19, 32)");
    const image = view.container.querySelector("img")!;
    expect(image.dataset.picture).toBe("loading");
    expect(image.hasAttribute("src")).toBe(false);
    expect(view.container.querySelector(".picture-puzzle-backdrop")).not.toBeNull();
    act(() => pictures.finish(fakeBodyPicture(id)));
    expect(image.dataset.picture).toBe("appearing");
    expect(image.getAttribute("src")).toBe(fakeBodyPicture(id));
    for (const [label, action] of [[text.playAgain, onReplay], [text.pictureAnother, onAnother], [text.home, onHome]] as const) {
      const target = button(label);
      expect(target.querySelector("svg")).not.toBeNull();
      expect([getComputedStyle(target).minWidth, getComputedStyle(target).minHeight]).toEqual(["48px", "48px"]);
      fireEvent.click(target);
      expect(action).toHaveBeenCalledTimes(1);
    }
  });

  it("records the final placement once, replays with a fresh shuffle, and restores the collection after reload", () => {
    const storage = memoryStorage();
    localPicturePuzzleProgress(() => storage).save(NO_PICTURES);
    const text = TEXTS[language];
    const view = openGame(storage, language, "hatchling");
    fireEvent.click(button(DINOSAURS[0]!.name[language].toLocaleUpperCase(language)));
    const original = view.game().puzzle!;
    const onFit = view.game().board(language)!.props.onPlace;
    const last = finish(view, language);
    expect(view.save).toHaveBeenCalledTimes(1);
    fireEvent.click(last, { detail: 0 });
    fireEvent.pointerUp(last);
    act(() => { onFit(original.order.at(-1)!, original.order.at(-1)!); onFit(original.order.at(-1)!, original.order.at(-1)!); });
    expect(view.save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: text.star })).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe(text.celebrations["first-best"].text);
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.hatchling.name} 1/3`);
    const beforeReplay = view.random.mock.calls.length;
    fireEvent.click(button(text.playAgain));
    expect(view.game().puzzle?.dinosaur).toEqual(original.dinosaur);
    expect(view.game().puzzle?.level).toBe("hatchling");
    expect(view.game().puzzle?.fitted).toEqual([]);
    expect(view.game().puzzle?.order).not.toEqual(original.order);
    expect(view.random.mock.calls.length - beforeReplay).toBe(11);
    finish(view, language);
    expect(view.save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img", { name: text.star })).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.hatchling.name} 1/3`);
    fireEvent.click(button(text.pictureAnother));
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("1/3");
    expect(within(button(DINOSAURS[0]!.name[language].toLocaleUpperCase(language))).getByRole("img", { name: text.star })).not.toBeNull();
    fireEvent.click(button(text.home));
    expect(view.onHome).toHaveBeenCalledTimes(1);
    view.unmount();
    const reloaded = openGame(storage, language, "explorer");
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("1/3");
    fireEvent.click(button(DINOSAURS[0]!.name[language].toLocaleUpperCase(language)));
    finish(reloaded, language);
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.explorer.name} 1/3`);
    expect(screen.getByRole("status").textContent).toBe(text.celebrations["first-best"].text);
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("1/3");
    reloaded.unmount();
  });
});

describe.each(LANGUAGES)("collection growth through the game in %s", (language) => {
  it.each([1, 2])("celebrates growing from %i completed dinosaurs to the next best", (previous) => {
    const storage = memoryStorage();
    const earned = PICTURE_DINOSAURS.slice(0, previous);
    localPicturePuzzleProgress(() => storage).save({ earned, completed: { ...NO_PICTURES.completed, explorer: earned } });
    const view = openGame(storage, language, "explorer");
    const text = TEXTS[language];
    const next = DINOSAURS.find(({ id }) => id === PICTURE_DINOSAURS[previous])!;
    fireEvent.click(button(next.name[language].toLocaleUpperCase(language)));
    finish(view, language);
    expect(screen.getByRole("status").textContent).toBe(text.celebrations["new-best"].text);
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.explorer.name} ${previous + 1}/3`);
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe(`${previous + 1}/3`);
    expect(screen.getByLabelText(text.bestScore).textContent).toBe(`${text.best}${previous}${previous + 1}/3`);
    expect(view.container.querySelector(".best-score-beaten")!.textContent).toBe(String(previous));
    view.unmount();
  });
});

it.each([
  undefined,
  JSON.stringify({ schemaVersion: 1, games: { "picture-puzzle": 7 } }),
  "{bad",
  JSON.stringify({ schemaVersion: 1, games: { "picture-puzzle": { completed: 7 } } })
])("keeps recovered history unverified for the session from %s", (raw) => {
  const storage = memoryStorage(raw === undefined ? {} : { [PROGRESS_KEY]: raw });
  const view = openGame(storage, "en", "hatchling");
  const text = TEXTS.en;
  for (const [at, dinosaur] of DINOSAURS.slice(0, 2).entries()) {
    fireEvent.click(button(dinosaur.name.en.toUpperCase()));
    finish(view, "en");
    expect(screen.getByRole("img", { name: text.star })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(dinosaur.name.en.toUpperCase());
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.hatchling.name} ${at + 1}/3`);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(text.celebrations["first-best"].text)).toBeNull();
    expect(screen.queryByText(text.celebrations["new-best"].text)).toBeNull();
    expect(screen.queryByLabelText(text.bestScore)).toBeNull();
    fireEvent.click(button(text.pictureAnother));
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe(`${at + 1}/3`);
  }
  expect(view.save).toHaveBeenCalledTimes(2);
  view.unmount();
});

it.each(["read", "write"])("keeps a round star and session collection with no best claims when storage fails on %s", (failure) => {
  const raw = JSON.stringify({ schemaVersion: 1, games: { "picture-puzzle": NO_PICTURES } });
  const storage = memoryStorage({ [PROGRESS_KEY]: raw }, { read: failure !== "read", save: failure !== "write" });
  const view = openGame(storage, "en", "hatchling");
  fireEvent.click(button(DINOSAURS[0]!.name.en.toUpperCase()));
  finish(view, "en");
  expect(screen.getByRole("img", { name: TEXTS.en.star })).not.toBeNull();
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(DINOSAURS[0]!.name.en.toUpperCase());
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByLabelText(TEXTS.en.bestScore)).toBeNull();
  expect(screen.getByLabelText(TEXTS.en.score).textContent).toBe(`${TEXTS.en.ageLevels.hatchling.name} 1/3`);
  fireEvent.click(button(TEXTS.en.pictureAnother));
  expect(screen.getByLabelText(TEXTS.en.pictureCollection).textContent).toBe("1/3");
  expect(storage.items.get(PROGRESS_KEY)).toBe(raw);
  view.unmount();
});

it.each(AGE_LEVELS)("shows %s's score even when there is no historical best", (level) => {
  const text = TEXTS.en;
  render(<PicturePuzzleResultScreen language="en" name="Stegosaurus" fact={text.pictureFacts.stegosaurus} level={level}
    score={1} shared={2} best={undefined} beaten={undefined} celebration={null} picture={fakeBodyPicture("stegosaurus")}
    onReplay={vi.fn()} onAnother={vi.fn()} onHome={vi.fn()} />, withPictures);
  expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels[level].name} 1/3`);
  expect(screen.queryByLabelText(text.bestScore)).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("compares with collections saved by another tab before the last piece", () => {
  const storage = memoryStorage();
  const view = openGame(storage, "en", "hatchling");
  fireEvent.click(button(DINOSAURS[0]!.name.en.toUpperCase()));
  localPicturePuzzleProgress(() => storage).save({
    earned: ["tyrannosaurus", "triceratops"],
    completed: { ...NO_PICTURES.completed, hatchling: ["tyrannosaurus"], explorer: ["triceratops"] }
  });
  finish(view, "en");
  expect(screen.getByLabelText(TEXTS.en.score).textContent).toBe(`${TEXTS.en.ageLevels.hatchling.name} 1/3`);
  expect(screen.getByLabelText(TEXTS.en.pictureCollection).textContent).toBe("2/3");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("img", { name: TEXTS.en.star })).not.toBeNull();
  fireEvent.click(button(TEXTS.en.pictureAnother));
  expect(within(button(DINOSAURS[1]!.name.en.toUpperCase())).getByRole("img", { name: TEXTS.en.star })).not.toBeNull();
  view.unmount();
});

it.each(["light", "dark"])("keeps the previous best legible in %s", (theme) => {
  const view = render(<div data-theme={theme}><PicturePuzzleResultScreen language="en" name="Stegosaurus" fact={TEXTS.en.pictureFacts.stegosaurus}
    level="explorer" score={2} shared={2} best={2} beaten={1} celebration="new-best" picture={fakeBodyPicture("stegosaurus")}
    onReplay={vi.fn()} onAnother={vi.fn()} onHome={vi.fn()} /></div>, withPictures);
  const previous = view.container.querySelector(".best-score-beaten")!;
  expect(previous.textContent).toBe("1");
  expect(getComputedStyle(previous).color).toBe(theme === "dark" ? "rgb(156, 163, 182)" : "rgb(92, 100, 122)");
});
