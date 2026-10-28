import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App, type AppProps } from "../src/App.tsx";
import type { AgeLevel } from "../src/ageLevel.ts";
import records from "../src/data/dinosaurs.json";
import { readPictureDinosaurs } from "../src/dinosaurs.ts";
import type { HomeGame } from "../src/HomePage.tsx";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localAgeLevel } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localPicturePuzzleChoice, localPicturePuzzleProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import type { Theme } from "../src/theme.ts";
import { SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs, emptyProgress, emptySkeletons, emptySorting,
  fakeBodyPicture, featuring, manualPictures, manualVisibility, manualViewport, memoryStorage, pageAtRest, seededRandom, type MemoryStorage } from "./support.ts";
import { filterTaps, tapAt } from "./taps.ts";
import { openWindow } from "./windowSizes.ts";

const button = (name: string) => screen.getByRole("button", { name });

function openApp(storage: MemoryStorage, language: Language, theme: Theme, featured: HomeGame = "compare", reduced = false) {
  openWindow(1180, 820);
  localLanguage(() => storage).save(language);
  localTheme(() => storage).save(theme);
  const viewport = manualViewport("landscape");
  const pictures = manualPictures();
  const pageVisibility = manualVisibility("visible");
  const countStart = vi.fn<(game: HomeGame) => void>();
  const props: AppProps = {
    dinosaurs: SHIPPED_DINOSAURS, catalogue: SHIPPED_CATALOGUE, bodyPicture: fakeBodyPicture, random: seededRandom(17),
    picturePuzzle: { dinosaurs: readPictureDinosaurs(records), bodyPicture: fakeBodyPicture, random: seededRandom(29),
      choiceStore: localPicturePuzzleChoice(() => storage), progressStore: localPicturePuzzleProgress(() => storage) },
    viewport, portraitLayouts: { home: ["tall", "tall-narrow"] },
    progress: emptyProgress(), deviceLanguage: "en-GB", languageStore: localLanguage(() => storage), nameVersion: () => {},
    appearance: { isDark: () => false, subscribe: () => () => {} }, themeStore: localTheme(() => storage), ageLevelStore: localAgeLevel(() => storage),
    ...emptyCare(), ...emptyDig(), ...emptyPairs(), ...emptySkeletons(), ...emptySorting(), ...pageAtRest(), ...featuring(featured),
    ...pictures, pageVisibility, startCounter: { countStart }, reducedMotion: () => reduced
  };
  return { ...render(<App {...props} />), viewport, pictures, pageVisibility, countStart };
}

function firstPiece(language: Language): number {
  const label = document.querySelector(".picture-puzzle-tray-piece")!.getAttribute("aria-label");
  const piece = Array.from({ length: 36 }, (_, at) => at + 1).find((id) => TEXTS[language].picturePiece(id) === label);
  if (piece === undefined) throw new Error("No piece in the tray");
  return piece;
}

function place(language: Language, piece: number) {
  const text = TEXTS[language];
  fireEvent.click(screen.getByLabelText(text.picturePiece(piece)), { detail: 0 });
  fireEvent.click(screen.getByLabelText(text.pictureSlot(piece)), { detail: 0 });
}

function finish(language: Language, remaining: number) {
  for (let at = 0; at < remaining; at++) place(language, firstPiece(language));
}

function touch(target: EventTarget, type: string, time: number, point: { x: number; y: number }) {
  const event = new PointerEvent(type, { pointerId: 1, isPrimary: true, pointerType: "touch", button: 0,
    clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
  Object.defineProperty(event, "timeStamp", { value: time });
  act(() => { target.dispatchEvent(event); });
}

describe.each(LANGUAGES)("the picture puzzle full flow in %s", (language) => {
  it.each(["light", "dark"] as const)("completes from home, replays and reloads its collection in %s", (theme) => {
    const text = TEXTS[language];
    const storage = memoryStorage();
    const featured = theme === "dark" ? "picturePuzzle" : "compare";
    const app = openApp(storage, language, theme, featured);
    expect(document.documentElement.dataset.theme).toBe(theme);
    const door = button(text.picturePuzzle);
    expect(getComputedStyle(door).backgroundColor).toBe(theme === "dark" ? "rgb(37, 59, 55)" : "rgb(220, 234, 222)");
    expect(door.querySelector(".picture-puzzle-backdrop")).not.toBeNull();
    expect(door.querySelector(".picture-puzzle-tile-count, .featured-card-badge")!.textContent).toBe("0/3");
    fireEvent.click(door);
    expect(app.countStart).not.toHaveBeenCalled();
    fireEvent.click(button(text.ageLevels.hatchling.name));
    fireEvent.click(button(readPictureDinosaurs(records)[0]!.name[language].toLocaleUpperCase(language)));
    expect(screen.getByLabelText(text.pictureFitted).textContent).toBe("0/12");
    expect(app.countStart.mock.calls).toEqual([["picturePuzzle"]]);
    const board = screen.getByRole("group", { name: text.pictureBoard });
    expect(board.querySelector("img")!.dataset.picture).toBe("loading");
    act(() => app.pictures.finish(fakeBodyPicture("tyrannosaurus")));
    expect(board.querySelector("img")!.dataset.picture).toBe("appearing");
    const first = firstPiece(language);
    board.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) });
    const home = { x: ((first - 1) % 4 + 0.5) * 200, y: (Math.floor((first - 1) / 4) + 0.5) * 200 };
    const neighbor = { x: ((first % 4) + 0.5) * 200, y: home.y };
    touch(button(text.picturePiece(first)), "pointerdown", 0, { x: 1000, y: 200 });
    touch(window, "pointermove", 10, neighbor);
    touch(window, "pointerup", 20, neighbor);
    expect(screen.getByLabelText(text.pictureFitted).textContent).toBe("0/12");
    expect(app.container.querySelector("[data-retry]")).not.toBeNull();
    touch(button(text.picturePiece(first)), "pointerdown", 25, { x: 1000, y: 200 });
    touch(window, "pointermove", 30, home);
    touch(window, "pointerup", 50, home);
    expect(screen.getByLabelText(text.pictureFitted).textContent).toBe("1/12");
    finish(language, 11);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(readPictureDinosaurs(records)[0]!.name[language].toLocaleUpperCase(language));
    expect(screen.getByRole("img", { name: text.star })).not.toBeNull();
    expect(screen.getByLabelText(text.score).textContent).toBe(`${text.ageLevels.hatchling.name} 1/3`);
    expect(screen.getByText(text.pictureFacts.tyrannosaurus)).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe(text.celebrations["first-best"].text);
    expect(screen.getByLabelText(text.bestScore).textContent).toBe(`${text.best}1/3`);
    fireEvent.click(button(text.playAgain));
    expect(screen.getByLabelText(text.pictureFitted).textContent).toBe("0/12");
    expect(app.countStart.mock.calls).toEqual([["picturePuzzle"], ["picturePuzzle"]]);
    finish(language, 12);
    expect(screen.queryByText(text.celebrations["new-best"].text)).toBeNull();
    fireEvent.click(button(text.pictureAnother));
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("1/3");
    expect(within(button(readPictureDinosaurs(records)[0]!.name[language].toLocaleUpperCase(language))).getByRole("img", { name: text.star })).not.toBeNull();
    fireEvent.click(button(text.home));
    expect(button(text.picturePuzzle).querySelector(".picture-puzzle-tile-count, .featured-card-badge")!.textContent).toBe("1/3");
    fireEvent.click(button(text.catalogueTile));
    expect(screen.getByRole("main", { name: text.catalogue })).not.toBeNull();
    expect(screen.queryByLabelText(text.pictureCollection)).toBeNull();
    fireEvent.click(button(text.home));
    app.unmount();
    const reloaded = openApp(storage, language, theme, featured);
    expect(button(text.picturePuzzle).querySelector(".picture-puzzle-tile-count, .featured-card-badge")!.textContent).toBe("1/3");
    fireEvent.click(button(text.picturePuzzle));
    expect(button(text.ageLevels.hatchling.name).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("1/3");
    reloaded.unmount();
  });
});

it.each([false, true])("uses the root double-tap filter across choice, final drop and replay (reduced motion %s)", (reduced) => {
  filterTaps();
  const app = openApp(memoryStorage(), "en", "light", "compare", reduced);
  const text = TEXTS.en;
  tapAt(button(text.picturePuzzle), 0);
  tapAt(button(text.ageLevels.hatchling.name), 200);
  expect(button(text.ageLevels.explorer.name).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button(text.ageLevels.hatchling.name));
  const choice = button("TYRANNOSAURUS");
  tapAt(choice, 1000);
  tapAt(choice, 1200);
  expect(app.countStart).toHaveBeenCalledTimes(1);
  finish("en", 11);
  const last = firstPiece("en");
  fireEvent.click(button(text.picturePiece(last)));
  const board = screen.getByRole("group", { name: text.pictureBoard });
  const rect = { x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) };
  board.getBoundingClientRect = () => rect;
  const point = { x: ((last - 1) % 4 + 0.5) * 200, y: (Math.floor((last - 1) / 4) + 0.5) * 200 };
  const slot = button(text.pictureSlot(last));
  touch(slot, "pointerdown", 2000, point);
  touch(slot, "pointerup", 2050, point);
  expect(screen.getByRole("heading", { name: text.wellDone })).not.toBeNull();
  tapAt(button(text.playAgain), 2200, point);
  expect(screen.getByRole("heading", { name: text.wellDone })).not.toBeNull();
  expect(app.countStart).toHaveBeenCalledTimes(1);
  tapAt(button(text.playAgain), 3000, point);
  expect(screen.getByLabelText(text.pictureFitted).textContent).toBe("0/12");
  expect(app.countStart).toHaveBeenCalledTimes(2);
});

it.each(["hatchling", "explorer", "paleontologist"] as const)("keeps a %s board behind the orientation guard and abandons it without rewards", (level: AgeLevel) => {
  const storage = memoryStorage();
  localAgeLevel(() => storage).save({ level, revision: "parent" });
  const app = openApp(storage, "en", "dark");
  fireEvent.click(button(TEXTS.en.picturePuzzle));
  fireEvent.click(button("TRICERATOPS"));
  place("en", firstPiece("en"));
  const fitted = screen.getByLabelText(TEXTS.en.pictureFitted).textContent;
  act(() => app.viewport.turn("portrait"));
  expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).not.toBeNull();
  expect(screen.queryByRole("group", { name: TEXTS.en.pictureBoard })).toBeNull();
  act(() => app.viewport.turn("landscape"));
  expect(screen.getByLabelText(TEXTS.en.pictureFitted).textContent).toBe(fitted);
  fireEvent.click(button(TEXTS.en.home));
  expect(button(TEXTS.en.picturePuzzle).querySelector(".picture-puzzle-tile-count")!.textContent).toBe("0/3");
  expect(storage.items.get(PROGRESS_KEY)).toBeUndefined();
  fireEvent.click(button(TEXTS.en.picturePuzzle));
  fireEvent.click(button("TRICERATOPS"));
  expect(screen.getByLabelText(TEXTS.en.pictureFitted).textContent).toBe(`0/${level === "hatchling" ? 12 : level === "explorer" ? 24 : 36}`);
});

it.each(["compare", "picturePuzzle"] as const)("shows the collection across levels on home with %s featured", (featured) => {
  const storage = memoryStorage();
  localPicturePuzzleProgress(() => storage).save({ earned: ["tyrannosaurus", "stegosaurus"],
    completed: { hatchling: ["tyrannosaurus"], explorer: ["stegosaurus"], paleontologist: [] } });
  const app = openApp(storage, "en", "dark", featured);
  const text = TEXTS.en;
  const door = button(text.picturePuzzle);
  expect(door.querySelector(".picture-puzzle-tile-count, .featured-card-badge")!.textContent).toBe("2/3");
  fireEvent.click(door);
  fireEvent.click(button(text.ageLevels.paleontologist.name));
  expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("2/3");
  fireEvent.click(button(text.home));
  fireEvent.click(button(text.ageLevelMenu));
  fireEvent.click(screen.getByRole("menuitemradio", { name: new RegExp(text.ageLevels.hatchling.name) }));
  app.unmount();
  const reloaded = openApp(storage, "en", "dark", featured);
  fireEvent.click(button(text.picturePuzzle));
  expect(button(text.ageLevels.hatchling.name).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText(text.pictureCollection).textContent).toBe("2/3");
  reloaded.unmount();
});

it.each(["drag", "slot"])("cancels a %s through App's supplied visibility and rejects its stale release", (input) => {
  const storage = memoryStorage();
  localAgeLevel(() => storage).save({ level: "hatchling", revision: "parent" });
  const app = openApp(storage, "en", "light");
  fireEvent.click(button(TEXTS.en.picturePuzzle));
  fireEvent.click(button("TYRANNOSAURUS"));
  const id = firstPiece("en");
  const board = screen.getByRole("group", { name: TEXTS.en.pictureBoard });
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 80, y: 100, width: 768, height: 576 }));
  const source = button(TEXTS.en.picturePiece(id));
  const slot = button(TEXTS.en.pictureSlot(id));
  const point = { x: 80 + ((id - 1) % 4 + 0.5) * 192, y: 100 + (Math.floor((id - 1) / 4) + 0.5) * 192 };
  if (input === "drag") {
    touch(source, "pointerdown", 1000, { x: 1000, y: 200 });
    touch(window, "pointermove", 1100, point);
    expect(app.container.querySelector(".picture-puzzle-lifted")).not.toBeNull();
  } else {
    fireEvent.click(source);
    touch(slot, "pointerdown", 1000, point);
  }
  act(() => app.pageVisibility.switchTo("hidden"));
  expect(app.container.querySelector(".picture-puzzle-lifted")).toBeNull();
  act(() => app.pageVisibility.switchTo("visible"));
  touch(input === "drag" ? window : slot, "pointerup", 1200, point);
  expect(screen.getByLabelText(TEXTS.en.pictureFitted).textContent).toBe("0/12");
  expect(slot.hasAttribute("data-fitted")).toBe(false);
  place("en", id);
  expect(screen.getByLabelText(TEXTS.en.pictureFitted).textContent).toBe("1/12");
  expect(storage.items.get(PROGRESS_KEY)).toBeUndefined();
});
