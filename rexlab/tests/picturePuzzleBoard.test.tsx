import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { OrientationGate } from "../src/OrientationGate.tsx";
import { PicturePuzzleBoardScreen, type PictureBoard, type BoardBounds, type BoardPoint } from "../src/PicturePuzzleBoardScreen.tsx";
import { withManualPictures, withPictures } from "./pictures.tsx";
import { fakeBodyPicture, manualPictures, manualVisibility } from "./support.ts";
import { openWindow } from "./windowSizes.ts";

const DINOSAUR = { id: "tyrannosaurus", name: { en: "Tyrannosaurus", ru: "Тираннозавр" } } as const;
const SOURCE = fakeBodyPicture(DINOSAUR.id);
const button = (name: string) => screen.getByRole("button", { name });
const piece = (id: number, language: Language = "en") => screen.getByLabelText(TEXTS[language].picturePiece(id + 1));
const slot = (id: number, language: Language = "en") => screen.getByLabelText(TEXTS[language].pictureSlot(id + 1));
const BOARD = { x: 40, y: 90, left: 40, top: 90, width: 768, height: 576, right: 808, bottom: 666, toJSON: () => ({}) };

function pointer(target: EventTarget, type: string, x: number, y: number, id = 7) {
  act(() => { target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, button: 0, pointerType: "touch", isPrimary: id === 7, bubbles: true, cancelable: true })); });
}

function displayBoard(level: AgeLevel, language: Language): PictureBoard {
  const [columns, rows] = level === "hatchling" ? [4, 3] : level === "explorer" ? [6, 4] : [6, 6];
  const tiles = Array.from({ length: columns * rows }, (_, id) => ({ id,
    crop: { x: id % columns * 1200 / columns, y: Math.floor(id / columns) * 900 / rows, width: 1200 / columns, height: 900 / rows }
  }));
  return { name: DINOSAUR.name[language], columns, rows, guide: level === "hatchling",
    slots: tiles.map((tile) => ({ ...tile, filled: false })), tray: tiles };
}

function openBoard(level: AgeLevel = "explorer", language: Language = "en", initial?: PictureBoard, pictures?: ReturnType<typeof manualPictures>, size: readonly [number, number] = [1133, 744]) {
  openWindow(...size);
  const onFit = vi.fn<(id: number) => void>();
  const onHome = vi.fn<() => void>();
  const onBack = vi.fn<() => void>();
  const presence = manualVisibility("visible");
  const dropFits = vi.fn<(id: number, bounds: BoardBounds, point: BoardPoint) => boolean>(() => true);
  let current = initial ?? displayBoard(level, language);
  function Board({ gate = false }: { gate?: boolean }) {
    const [puzzle, setPuzzle] = useState<PictureBoard>(current);
    current = puzzle;
    return <div data-theme="dark"><OrientationGate shown={gate} screenUpright={false} language={language}>
      <PicturePuzzleBoardScreen language={language} scene={puzzle} presence={presence} dropFits={dropFits} picture={SOURCE} onHome={onHome} onBack={onBack}
        onPlace={(id, slot) => {
          if (id !== slot || !current.tray.some((tile) => tile.id === id)) return false;
          onFit(id);
          current = { ...current, slots: current.slots.map((tile) => tile.id === slot ? { ...tile, filled: true } : tile),
            tray: current.tray.filter((tile) => tile.id !== id) };
          setPuzzle(current);
          return true;
        }} />
    </OrientationGate></div>;
  }
  const view = render(<Board />, pictures ? withManualPictures(pictures) : withPictures);
  const board = screen.getByRole("group", { name: TEXTS[language].pictureBoard });
  board.getBoundingClientRect = () => BOARD;
  return { ...view, onFit, onHome, onBack, board, presence, dropFits, puzzle: () => current,
    gate: () => view.rerender(<Board gate />), user: userEvent.setup({ delay: null }) };
}

const center = (puzzle: PictureBoard, id: number) => {
  const at = puzzle.slots.findIndex((slot) => slot.id === id);
  return { x: BOARD.left + (at % puzzle.columns + 0.5) * BOARD.width / puzzle.columns,
    y: BOARD.top + (Math.floor(at / puzzle.columns) + 0.5) * BOARD.height / puzzle.rows };
};
const fitted = (puzzle: PictureBoard) => puzzle.slots.filter((slot) => slot.filled).map((slot) => slot.id);
const complete = (puzzle: PictureBoard) => puzzle.tray.length === 0;

const drag = (id: number, x: number, y: number, pointerId = 7) => {
  pointer(piece(id), "pointerdown", 950, 250, pointerId);
  pointer(window, "pointermove", x, y, pointerId);
};
const place = (id: number, language: Language = "en") => {
  fireEvent.click(piece(id, language), { detail: 0 });
  fireEvent.click(slot(id, language), { detail: 0 });
};

afterEach(() => { vi.restoreAllMocks(); });

describe.each(LANGUAGES)("picture board in %s", (language) => {
  it.each(AGE_LEVELS)("shows the %s cut, localized controls, four pieces, dark theme and shared loading", (level) => {
    const pictures = manualPictures();
    const view = openBoard(level, language, undefined, pictures);
    const text = TEXTS[language];
    expect(screen.getByRole("heading").textContent).toBe(DINOSAUR.name[language].toLocaleUpperCase(language));
    const slots = within(view.board).getAllByRole("button");
    expect(slots).toHaveLength(view.puzzle().slots.length);
    expect(Boolean(view.container.querySelector(".picture-puzzle-guide"))).toBe(level === "hatchling");
    expect(within(screen.getByRole("group", { name: text.picturePieces })).getAllByRole("button")).toHaveLength(4);
    for (const target of [...slots, piece(0, language), button(text.pictureHint), button(text.picturePreview), button(text.back), button(text.home)]) {
      const style = getComputedStyle(target);
      expect([style.minWidth, style.minHeight]).toEqual(["48px", "48px"]);
      expect(target.querySelector("svg") !== null || target.classList.contains("picture-puzzle-slot")).toBe(true);
    }
    expect(getComputedStyle(piece(0, language)).backgroundColor).toBe("rgb(24, 30, 46)");
    const images = [...view.container.querySelectorAll<HTMLImageElement>("img")];
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((image) => image.dataset.picture === "loading" && !image.hasAttribute("src"))).toBe(true);
    act(() => pictures.finish(SOURCE));
    expect(images.every((image) => image.src.endsWith(SOURCE) && image.dataset.picture === "appearing")).toBe(true);
    expect(fitted(view.puzzle())).toEqual([]);
    expect(view.board.getAttribute("style")).toContain("repeat");
    expect(getComputedStyle(view.board).gap).toBe("0px");
  });
});

it.each(AGE_LEVELS)("keeps every %s piece reachable through removals and the last shrinking page", (level) => {
  const view = openBoard(level);
  const all = view.puzzle().slots.map((slot) => slot.id);
  const reached: number[] = [];
  const tray = screen.getByRole("group", { name: TEXTS.en.picturePieces });
  const next = button(TEXTS.en.pictureNext);
  const previous = button(TEXTS.en.picturePrevious);
  const slots = view.board.querySelectorAll("button");
  while (!next.hasAttribute("disabled")) {
    const pieces = [...tray.querySelectorAll("button")];
    reached.push(...pieces.map((item) => Number(item.getAttribute("aria-label")!.split(" ")[1]) - 1));
    fireEvent.click(next);
  }
  const last = [...tray.querySelectorAll("button")];
  reached.push(...last.map((item) => Number(item.getAttribute("aria-label")!.split(" ")[1]) - 1));
  expect(reached).toEqual(all);
  fireEvent.click(previous);
  expect([...tray.querySelectorAll("button")].map((item) => item.getAttribute("aria-label"))).toEqual(
    all.slice(-8, -4).map((id) => TEXTS.en.picturePiece(id + 1))
  );
  fireEvent.click(next);
  while (!complete(view.puzzle())) {
    const visible = [...tray.querySelectorAll("button")];
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThanOrEqual(4);
    const id = Number(visible[0]!.getAttribute("aria-label")!.split(" ")[1]) - 1;
    fireEvent.click(visible[0]!);
    fireEvent.click(slots[id]!);
    expect(fitted(view.puzzle())).toContain(id);
  }
  expect(view.onFit.mock.calls.map(([id]) => id).sort((a, b) => a - b)).toEqual(all);
  expect(screen.getByLabelText(TEXTS.en.pictureFitted).textContent).toBe(`${all.length}/${all.length}`);
  expect(button(TEXTS.en.pictureHint).hasAttribute("disabled")).toBe(true);
});

it("allows native keyboard buttons, keeps a wrong tap selected, and fits exactly once", async () => {
  const view = openBoard();
  piece(0).focus();
  await view.user.keyboard("{Enter}");
  slot(1).focus();
  await view.user.keyboard(" ");
  expect(fitted(view.puzzle())).toEqual([]);
  expect(piece(0).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(TEXTS.en.pictureRetry)).toBeDefined();
  slot(0).focus();
  await view.user.keyboard("{Enter}{Enter}");
  expect(fitted(view.puzzle())).toEqual([0]);
  expect(view.onFit).toHaveBeenCalledTimes(1);
});

it("selects by touch, rejects wrong taps and accepts only a slot's own touch release", () => {
  const view = openBoard();
  pointer(piece(0), "pointerdown", 950, 250);
  pointer(window, "pointerup", 950, 250);
  pointer(slot(1), "pointerdown", 250, 120);
  pointer(slot(1), "pointerup", 250, 120);
  expect(fitted(view.puzzle())).toEqual([]);
  expect(piece(0).getAttribute("aria-pressed")).toBe("true");
  pointer(slot(0), "pointerdown", 100, 120);
  view.dropFits.mockReturnValueOnce(false);
  pointer(slot(0), "pointerup", 300, 500);
  expect(fitted(view.puzzle())).toEqual([]);
  pointer(slot(0), "pointerdown", 100, 120);
  pointer(slot(0), "pointerup", 100, 120);
  expect(fitted(view.puzzle())).toEqual([0]);
});

it("moves the complete matching tile under the owning finger, rejects a neighbor and visibly returns before fitting", () => {
  const view = openBoard();
  const wrong = center(view.puzzle(), 1);
  view.dropFits.mockReturnValueOnce(false);
  drag(0, wrong.x, wrong.y);
  const lifted = view.container.querySelector<HTMLElement>(".picture-puzzle-lifted")!;
  expect([lifted.style.left, lifted.style.top, lifted.style.width, lifted.style.height]).toEqual(["168px", "90px", "128px", "144px"]);
  expect(lifted.querySelector("svg.picture-puzzle-backdrop")).not.toBeNull();
  expect(lifted.querySelector("img")!.getAttribute("src")).toBe(SOURCE);
  pointer(window, "pointerup", wrong.x, wrong.y);
  expect(fitted(view.puzzle())).toEqual([]);
  expect(view.dropFits).toHaveBeenLastCalledWith(0, { x: BOARD.left, y: BOARD.top, width: BOARD.width, height: BOARD.height }, wrong);
  expect(view.container.querySelector("[data-retry]")).not.toBeNull();
  expect(view.container.querySelector(".picture-puzzle-lifted")).toBeNull();
  drag(0, BOARD.left - 24, BOARD.top - 24);
  pointer(window, "pointerup", BOARD.left - 24, BOARD.top - 24);
  pointer(window, "pointerup", BOARD.left - 24, BOARD.top - 24);
  expect(fitted(view.puzzle())).toEqual([0]);
  expect(slot(0).getAttribute("data-fitted")).toBe("true");
  expect(view.onFit).toHaveBeenCalledTimes(1);
});

it("ignores every second-pointer move, release and tap while one piece is owned", () => {
  const view = openBoard();
  const target = center(view.puzzle(), 0);
  drag(0, target.x, target.y);
  const lifted = view.container.querySelector<HTMLElement>(".picture-puzzle-lifted")!;
  const left = lifted.style.left;
  pointer(piece(1), "pointerdown", 900, 220, 8);
  pointer(window, "pointermove", 1, 1, 8);
  pointer(slot(0), "pointerup", target.x, target.y, 8);
  fireEvent.click(slot(0), { detail: 1 });
  fireEvent.click(button(TEXTS.en.pictureHint), { detail: 1 });
  expect([lifted.style.left, fitted(view.puzzle())]).toEqual([left, []]);
  pointer(window, "pointerup", target.x, target.y);
  pointer(window, "pointerup", target.x, target.y, 8);
  expect(fitted(view.puzzle())).toEqual([0]);
});

it("hints select the first visible piece or keep the chosen one, and preview changes neither placement nor score", () => {
  const view = openBoard();
  fireEvent.click(button(TEXTS.en.pictureNext));
  fireEvent.click(button(TEXTS.en.pictureHint));
  expect(piece(4).getAttribute("aria-pressed")).toBe("true");
  expect(slot(4).getAttribute("data-hint")).toBe("true");
  fireEvent.click(piece(6));
  fireEvent.click(button(TEXTS.en.pictureHint));
  expect(slot(6).getAttribute("data-hint")).toBe("true");
  expect(slot(4).hasAttribute("data-hint")).toBe(false);
  fireEvent.click(button(TEXTS.en.picturePreview));
  const preview = view.container.querySelector(".picture-puzzle-preview")!;
  expect(preview.getAttribute("aria-hidden")).toBe("false");
  expect(preview.querySelector(".picture-puzzle-crop")!.getAttribute("style")).toContain("1200 / 900");
  fireEvent.click(button(TEXTS.en.picturePreview));
  expect(preview.getAttribute("aria-hidden")).toBe("true");
  expect(fitted(view.puzzle())).toEqual([]);
  expect(view.onFit).not.toHaveBeenCalled();
});

it.each(["pointercancel", "lostpointercapture", "hidden", "resize", "blur", "gate", "back", "home", "unmount"])("cancels on %s, preserves fitted pieces and rejects stale releases", (ending) => {
  const view = openBoard();
  place(0); place(1);
  const source = piece(2);
  const captured = new Set<number>();
  source.setPointerCapture = (id) => { captured.add(id); };
  source.hasPointerCapture = (id) => captured.has(id);
  source.releasePointerCapture = (id) => { captured.delete(id); };
  const target = center(view.puzzle(), 2);
  drag(2, target.x, target.y);
  expect(captured.has(7)).toBe(true);
  if (ending === "pointercancel") pointer(window, "pointercancel", target.x, target.y);
  if (ending === "lostpointercapture") pointer(source, "lostpointercapture", target.x, target.y);
  if (ending === "hidden") {
    act(() => view.presence.switchTo("hidden"));
    act(() => view.presence.switchTo("visible"));
  }
  if (ending === "resize") {
    Object.assign(window, { innerWidth: 450, innerHeight: 744 });
    fireEvent(window, new Event("resize"));
    expect(view.container.querySelector('.orientation-gate[data-shown]')).not.toBeNull();
    expect(view.container.querySelector('.gated-screen[inert]')).not.toBeNull();
    fireEvent.click(screen.getByLabelText(TEXTS.en.pictureSlot(3)));
    expect(fitted(view.puzzle())).toEqual([0, 1]);
    Object.assign(window, { innerWidth: 1133, innerHeight: 744 });
    fireEvent(window, new Event("resize"));
  }
  if (ending === "blur") fireEvent(window, new Event("blur"));
  if (ending === "gate") view.gate();
  if (ending === "back" || ending === "home") {
    // A keyboard activation cannot leave while a pointer owns a piece.
    fireEvent.click(button(TEXTS.en[ending]));
    expect(ending === "home" ? view.onHome : view.onBack).not.toHaveBeenCalled();
    fireEvent(window, new Event("blur"));
    fireEvent.click(button(TEXTS.en[ending]));
    expect(ending === "home" ? view.onHome : view.onBack).toHaveBeenCalledTimes(1);
  }
  if (ending === "unmount") view.unmount();
  pointer(window, "pointerup", target.x, target.y);
  expect(fitted(view.puzzle())).toEqual([0, 1]);
  expect(view.onFit).toHaveBeenCalledTimes(2);
  expect(captured.size).toBe(0);
  expect(view.container.querySelector(".picture-puzzle-lifted")).toBeNull();
  if (ending !== "unmount") expect(view.container.querySelector("[data-retry]")).not.toBeNull();
});

it("cannot complete from the last piece's stale release after a layout interruption", () => {
  const initial = displayBoard("hatchling", "en");
  const puzzle = { ...initial, slots: initial.slots.map((slot) => ({ ...slot, filled: slot.id !== 11 })), tray: initial.tray.slice(-1) };
  const view = openBoard("hatchling", "en", puzzle);
  const target = center(puzzle, 11);
  drag(11, target.x, target.y);
  fireEvent(window, new Event("resize"));
  pointer(window, "pointerup", target.x, target.y);
  expect(complete(view.puzzle())).toBe(false);
  expect(view.onFit).not.toHaveBeenCalled();
});

it.each([
  { name: "capped desktop", window: [1920, 1080] as const,
    first: { x: 264, y: 88, width: 1392, height: 944 }, next: { x: 264, y: 88, width: 1192, height: 764 } },
  { name: "inset tablet", window: [1133, 744] as const,
    first: { x: 68, y: 100, width: 997, height: 560 }, next: { x: 80, y: 100, width: 936, height: 480 } }
])("fits the board, tray and controls in measured $name bounds before and after resize", ({ window: size, first, next }) => {
  let stageBounds = first;
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains("picture-puzzle-stage")) return original.call(this);
    return DOMRect.fromRect(stageBounds);
  });
  const view = openBoard("paleontologist", "en", undefined, undefined, size);
  const stage = view.container.querySelector<HTMLElement>(".picture-puzzle-stage")!;
  const tools = view.container.querySelector<HTMLElement>(".picture-puzzle-tools")!;
  const tray = view.container.querySelector<HTMLElement>(".picture-puzzle-tray")!;
  const assertFit = () => {
    const room = stage.getBoundingClientRect();
    const board = getComputedStyle(view.board);
    const width = parseFloat(board.width);
    const height = parseFloat(board.height);
    const toolsWidth = parseFloat(getComputedStyle(tools).flexBasis);
    const gap = parseFloat(getComputedStyle(stage).gap);
    expect(width + toolsWidth + gap).toBeLessThanOrEqual(room.width);
    expect(height).toBeLessThanOrEqual(room.height);
    expect(width / height).toBeCloseTo(4 / 3);
    expect(Math.min(width / 6, height / 6)).toBeGreaterThanOrEqual(48);
    const controls = [...tools.children].filter((child) => child !== tray);
    const controlsHeight = controls.reduce((sum, child) => {
      const style = getComputedStyle(child);
      const height = child.classList.contains("picture-puzzle-pages")
        ? Math.max(...[...child.querySelectorAll("button")].map((button) => parseFloat(getComputedStyle(button).height)))
        : parseFloat(style.height) || parseFloat(style.minHeight);
      return sum + height;
    }, 0);
    const trayHeight = room.height - controlsHeight - controls.length * parseFloat(getComputedStyle(tools).gap);
    expect((trayHeight - parseFloat(getComputedStyle(tray).gap)) / 2).toBeGreaterThanOrEqual(48);
    expect((toolsWidth - parseFloat(getComputedStyle(tray).gap)) / 2).toBeGreaterThanOrEqual(48);
    expect(view.container.querySelector('.orientation-gate[data-shown]')).toBeNull();
  };
  assertFit();
  const originalWidth = view.board.style.width;
  stageBounds = next;
  Object.assign(window, { innerWidth: size[0] - 100, innerHeight: size[1] - 80 });
  fireEvent(window, new Event("resize"));
  assertFit();
  expect(view.board.style.width).not.toBe(originalWidth);
});

it("blocks selection and keyboard placement while its supplied presence is hidden", () => {
  const view = openBoard();
  fireEvent.click(piece(0));
  act(() => view.presence.switchTo("hidden"));
  fireEvent.click(piece(1));
  fireEvent.click(slot(0));
  expect(piece(0).getAttribute("aria-pressed")).toBe("true");
  expect(fitted(view.puzzle())).toEqual([]);
  expect(view.onFit).not.toHaveBeenCalled();
  act(() => view.presence.switchTo("visible"));
  fireEvent.click(slot(0));
  expect(fitted(view.puzzle())).toEqual([0]);
});
