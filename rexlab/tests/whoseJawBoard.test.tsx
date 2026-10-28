import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { JAW_TIMING } from "../src/whoseJawGame.tsx";
import { WhoseJawBoardScreen, type WhoseJawBoardScreenProps } from "../src/WhoseJawBoardScreen.tsx";
import { OrientationGate } from "../src/OrientationGate.tsx";
import { homeTile, manualPictures } from "./support.ts";
import { withManualPictures } from "./pictures.tsx";
import { openWhoseJawApp } from "./whoseJawApp.tsx";
import { JAWS } from "./whoseJaw.ts";
import { clickOf, filterTaps, moveAt, pressAt, releaseAt, tapAt } from "./taps.ts";

const board = () => document.querySelector<HTMLElement>(".whose-jaw-board")!;
const jaw = (language: "en" | "ru" = "en") => screen.getByLabelText(TEXTS[language].jawPick);
const dinosaur = (id: string, language: "en" | "ru" = "en") => screen.getByRole("button", { name: JAWS.find((jaw) => jaw.id === id)!.name[language].toLocaleUpperCase(language) });
const ownerId = () => /jaw-(.+)\.webp/.exec(document.querySelector(".jaw-loose-picture")!.getAttribute("src")!)![1]!;
const choices = () => within(screen.getByRole("group", { name: TEXTS.en.creatures })).getAllByRole("button");
const toothCount = () => document.querySelectorAll(".jaw-socket[data-filled]").length;
const put = (id: string, language: "en" | "ru" = "en") => { fireEvent.click(jaw(language)); fireEvent.click(dinosaur(id, language)); };
function openBoard(level: AgeLevel = "explorer", language: "en" | "ru" = "en", reduced = false) {
  const app = openWhoseJawApp({ setting: { level, revision: "board-setting" }, language, reduced });
  fireEvent.click(homeTile(TEXTS[language].whoseJaw));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].play }));
  expect(board().dataset.phase).toBe("entering");
  act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.entering));
  expect(board().dataset.phase).toBe("waiting");
  return app;
}

function layoutChoices() {
  choices().forEach((element, at) => {
    const left = 100 + at * 300;
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left, right: left + 120, top: 100, bottom: 200, width: 120, height: 100 } as DOMRect);
  });
}

describe("Whose Jaw board", () => {
  it.each(AGE_LEVELS)("shows gummy choices, tooth sockets and the %s help", (level) => {
    openBoard(level);
    expect(choices()).toHaveLength(level === "hatchling" ? 2 : level === "explorer" ? 3 : 4);
    expect(document.querySelectorAll(".jaw-gummy")).toHaveLength(choices().length);
    expect(document.querySelectorAll(".jaw-gummy")).toSatisfy((pictures: NodeListOf<Element>) => [...pictures].every((picture) => picture.getAttribute("src")?.startsWith("gummy-")));
    expect([document.querySelectorAll(".jaw-socket").length, toothCount()]).toEqual([5, 0]);
    expect(document.querySelectorAll(".jaw-food").length).toBe(level === "hatchling" ? 2 : 0);
    expect(document.querySelectorAll(".jaw-name").length).toBe(level === "paleontologist" ? 4 : 0);
    expect(document.querySelector(".jaw-diet-hint")).toBeNull();
    expect(Number.parseFloat(getComputedStyle(jaw()).width)).toBeGreaterThanOrEqual(160);
  });

  it.each(["en", "ru"] as const)("speaks unselected names in %s and cancels a tap pickup without a try", async (language) => {
    const app = openBoard("explorer", language);
    const owner = ownerId();
    fireEvent.click(dinosaur(owner, language));
    expect(app.parts.spoken).toEqual([{ words: JAWS.find(({ id }) => id === owner)!.name[language], language }]);
    const user = userEvent.setup({ delay: null });
    await user.click(jaw(language));
    expect(jaw(language).getAttribute("aria-pressed")).toBe("true");
    await user.click(jaw(language));
    expect(jaw(language).getAttribute("aria-pressed")).toBe("false");
    await user.click(jaw(language));
    fireEvent.click(board());
    expect([jaw(language).getAttribute("aria-pressed"), toothCount(), board().dataset.phase]).toEqual(["false", 0, "waiting"]);
    expect(app.parts.played).toEqual([]);
  });

  it.each(["en", "ru"] as const)("locks wrong feedback, hints after two errors, then resets the hint in %s", (language) => {
    const app = openBoard("hatchling", language);
    const owner = ownerId();
    const wrong = JAWS.find((each) => each.diet !== JAWS.find(({ id }) => id === owner)!.diet && screen.queryByRole("button", { name: each.name[language].toLocaleUpperCase(language) }))!;
    for (let attempt = 1; attempt <= 2; attempt++) {
      put(wrong.id, language);
      expect(board().dataset.phase).toBe("wrong");
      expect(board().textContent).toContain(TEXTS[language].jawOw);
      expect(app.parts.spoken.at(-1)).toEqual({ words: TEXTS[language].jawOw, language });
      put(owner, language);
      fireEvent.click(dinosaur(wrong.id, language));
      expect([toothCount(), app.parts.played.filter((sound) => sound === "ow").length]).toEqual([0, attempt]);
      act(() => app.timers.fire(JAW_TIMING.wrong));
      expect(board().dataset.phase).toBe("waiting");
      expect(dinosaur(owner, language).hasAttribute("data-hint")).toBe(attempt === 2);
    }
    expect(document.querySelector(".jaw-diet-hint")?.getAttribute("aria-label")).toBe(TEXTS[language].jawFoods.meat);
    put(owner, language);
    expect(board().dataset.phase).toBe("right");
    act(() => app.timers.fire(150));
    act(() => app.timers.fire(850));
    expect(app.parts.played.slice(-3)).toEqual(["snap", "chomp", "steps"]);
    act(() => app.timers.fire(JAW_TIMING.right));
    expect(toothCount()).toBe(1);
    expect(document.querySelector(".jaw-socket[data-shining]")).toBeNull();
    act(() => app.timers.fire(JAW_TIMING.entering));
    expect(document.querySelector("[data-hint]")).toBeNull();
    expect(document.querySelector(".jaw-diet-hint")).toBeNull();
  });

  it("shows plant-on-meat feedback and same-diet shape feedback with their spoken cues", () => {
    const app = openBoard("paleontologist");
    const owner = JAWS.find(({ id }) => id === ownerId())!;
    const partner = JAWS.find((each) => each.id !== owner.id && each.pair === owner.pair)!;
    put(partner.id);
    expect(board().textContent).toContain(partner.hint.en);
    expect(app.parts.spoken.at(-1)).toEqual({ words: partner.hint.en, language: "en" });
    expect(document.querySelector(".jaw-feedback p")?.textContent).toContain("📏");
    act(() => app.timers.fire(JAW_TIMING.wrong));
    for (const other of JAWS.filter((jaw) => jaw.diet !== owner.diet && screen.queryByRole("button", { name: jaw.name.en.toUpperCase() }))) {
      put(other.id);
      expect(board().textContent).toContain(other.hint.en);
      expect(app.parts.played.at(-1)).toBe("slide");
      act(() => app.timers.fire(JAW_TIMING.wrong));
    }
    put(owner.id);
    expect(board().textContent).toContain(owner.fact.en);
    expect(app.parts.spoken.at(-1)?.words).toBe(owner.fact.en);
    app.unmount();
    const plants = openBoard("explorer");
    // The third owner in the fixed round eats plants.
    for (let at = 0; at < 2; at++) {
      put(ownerId());
      act(() => plants.timers.fire(JAW_TIMING.right));
      act(() => plants.timers.fire(JAW_TIMING.entering));
    }
    const meat = JAWS.find((each) => each.diet === "meat" && screen.queryByRole("button", { name: each.name.en.toUpperCase() }))!;
    put(meat.id);
    expect(board().textContent).toContain(TEXTS.en.jawHmm);
    expect(plants.parts.played.at(-1)).toBe("hmm");
  });

  it("plays all five distinct jaws, keeps rapid feedback clicks from counting, then leaves the board", () => {
    const app = openBoard();
    const seen: string[] = [];
    for (let index = 0; index < 5; index++) {
      const id = ownerId();
      seen.push(id);
      act(() => { put(id); fireEvent.click(dinosaur(id)); put(id); put(id); });
      expect(board().dataset.phase).toBe("right");
      expect(app.parts.spoken).toEqual([]);
      expect(app.parts.played.filter((sound) => sound === "snap")).toHaveLength(index + 1);
      act(() => app.timers.fire(JAW_TIMING.right));
      expect(toothCount()).toBe(index + 1);
      if (index < 4) act(() => app.timers.fire(JAW_TIMING.entering));
    }
    expect(new Set(seen).size).toBe(5);
    expect(board().dataset.phase).toBe("done");
    expect(document.querySelectorAll(".jaw-socket[data-shining]")).toHaveLength(5);
    act(() => app.timers.fire(JAW_TIMING.done));
    expect(document.querySelector(".whose-jaw-board")).toBeNull();
    expect(document.querySelector(".whose-jaw-result")).not.toBeNull();
  });

  it("supports keyboard pickup, arrows, wrap, placement and Escape", async () => {
    const app = openBoard();
    const user = userEvent.setup({ delay: null });
    jaw().focus();
    await user.keyboard(" ");
    expect(jaw().getAttribute("aria-pressed")).toBe("true");
    await user.keyboard("{Escape}");
    expect(jaw().getAttribute("aria-pressed")).toBe("false");
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(choices().at(-1));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(choices()[0]);
    await user.keyboard("{Enter}");
    expect(jaw().getAttribute("aria-pressed")).toBe("true");
    expect(app.parts.spoken).toEqual([]);
    fireEvent.keyDown(document.activeElement!, { key: "Enter", repeat: true });
    expect(board().dataset.phase).toBe("waiting");
    dinosaur(ownerId()).focus();
    await user.keyboard(" ");
    expect(board().dataset.phase).toBe("right");
    expect(app.parts.played).toEqual(["snap"]);
  });

  it.each(["home", "back", "unmount"])("stops feedback on %s and ignores stopped callbacks delivered into a new board", (exit) => {
    const app = openBoard();
    put(ownerId());
    expect(app.timers.timers()).toContain(JAW_TIMING.right);
    if (exit === "unmount") app.unmount();
    else {
      fireEvent.click(screen.getByRole("button", { name: TEXTS.en[exit as "home" | "back"] }));
      if (exit === "home") fireEvent.click(homeTile(TEXTS.en.whoseJaw));
      fireEvent.click(screen.getByRole("button", { name: TEXTS.en.play }));
    }
    const played = [...app.parts.played];
    act(() => { app.timers.deliverStopped(150); app.timers.deliverStopped(850); app.timers.deliverStopped(JAW_TIMING.right); });
    expect(app.parts.played).toEqual(played);
    expect(app.parts.stopped.voice).toBeGreaterThan(0);
    expect(app.parts.stopped.sound).toBeGreaterThan(0);
    if (exit !== "unmount") expect([board().dataset.phase, toothCount()]).toEqual(["entering", 0]);
  });

  it("uses 800ms wrong feedback and short entrances with reduced motion", () => {
    const app = openBoard("explorer", "en", true);
    const wrong = choices().find((element) => element !== dinosaur(ownerId()))!;
    fireEvent.click(jaw()); fireEvent.click(wrong);
    expect(app.timers.timers()).toContain(800);
    expect(app.timers.timers()).not.toContain(1200);
    act(() => app.timers.fire(800));
    put(ownerId());
    act(() => app.timers.fire(80));
    expect(app.parts.played.slice(-2)).toEqual(["snap", "chomp"]);
    act(() => app.timers.fire(160));
    expect(toothCount()).toBe(1);
  });
});

describe("jaw pointer input", () => {
  it("drops within the expanded 200px zone and suppresses the release click", () => {
    const app = openBoard();
    layoutChoices();
    pressAt(jaw(), 0, { x: 500, y: 500 });
    moveAt(40, { x: 255, y: 235 });
    expect(dinosaur(ownerId()).hasAttribute("data-over")).toBe(true);
    expect(jaw().style.translate).toBe("-245px -265px");
    releaseAt(window, 80, { x: 255, y: 235 });
    clickOf(jaw());
    expect(board().dataset.phase).toBe("right");
    expect(app.parts.played).toEqual(["snap"]);
  });

  it.each(["outside", "cancel", "blur"])("returns on %s without a try and permits the next deliberate pickup", (method) => {
    const app = openBoard();
    layoutChoices();
    pressAt(jaw(), 0, { x: 500, y: 500 });
    moveAt(40, { x: 900, y: 900 });
    if (method === "outside") releaseAt(window, 80, { x: 900, y: 900 });
    else if (method === "cancel") fireEvent(window, new PointerEvent("pointercancel", { pointerId: 1 }));
    else fireEvent.blur(window);
    expect([board().dataset.phase, toothCount(), jaw().getAttribute("aria-pressed")]).toEqual(["waiting", 0, "false"]);
    expect(app.parts.played).not.toContain("snap");
    tapAt(jaw(), 1000, { x: 500, y: 500 });
    expect(jaw().getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores a second finger's movement, release and tap, leaving the first in control", () => {
    const app = openBoard();
    layoutChoices();
    const owner = ownerId();
    pressAt(jaw(), 0, { x: 500, y: 500 });
    moveAt(40, { x: 600, y: 500 });
    pressAt(dinosaur(owner), 50, { x: 160, y: 150, pointer: 2 });
    moveAt(60, { x: 160, y: 150, pointer: 2 });
    releaseAt(dinosaur(owner), 70, { x: 160, y: 150, pointer: 2 });
    clickOf(dinosaur(owner));
    expect([jaw().style.translate, board().dataset.phase]).toEqual(["100px 0px", "waiting"]);
    expect(app.parts.spoken).toEqual([]);
    releaseAt(window, 80, { x: 160, y: 150 });
    expect(board().dataset.phase).toBe("right");
  });

  it("keeps the shared double-tap filter around tray and navigation taps", () => {
    filterTaps();
    const app = openBoard();
    tapAt(jaw(), 1000, { x: 500, y: 500 });
    tapAt(jaw(), 1100, { x: 500, y: 500 });
    expect(jaw().getAttribute("aria-pressed")).toBe("true");
    tapAt(dinosaur(ownerId()), 1700, { x: 160, y: 150 });
    expect(board().dataset.phase).toBe("right");
    expect(app.parts.played).toEqual(["snap"]);
  });
});

function viewProps(): WhoseJawBoardScreenProps {
  return {
    language: "en", phase: "waiting", choices: JAWS.slice(0, 2).map((jaw) => ({ id: jaw.id, name: jaw.name.en.toUpperCase(), picture: `gummy-${jaw.id}.webp`, food: "meat.webp", diet: jaw.diet })),
    jawPicture: "loose.webp", placed: [], target: undefined, hint: undefined, jawDiet: "meat", foodShown: false, namesShown: false, feedback: undefined,
    onPlace: vi.fn(), onName: vi.fn(), onSlide: vi.fn(), onBack: vi.fn(), onHome: vi.fn()
  };
}

describe("pictures and gate", () => {
  it.each(["loading", "failed"])("keeps %s pictures playable with shared placeholders", (state) => {
    const pictures = manualPictures();
    const props = viewProps();
    render(<WhoseJawBoardScreen {...props} />, withManualPictures(pictures));
    if (state === "failed") act(() => { pictures.fail("loose.webp"); pictures.fail("gummy-tyrannosaurus.webp"); });
    expect(document.querySelector(".jaw-loose-picture")?.getAttribute("data-picture")).toBe(state);
    expect(document.querySelector(".jaw-gummy")?.getAttribute("data-picture")).toBe(state);
    expect(jaw().hasAttribute("data-inviting")).toBe(false);
    put("tyrannosaurus");
    expect(props.onPlace).toHaveBeenCalledWith("tyrannosaurus");
  });

  it("invites only a decoded untouched jaw", () => {
    const pictures = manualPictures();
    render(<WhoseJawBoardScreen {...viewProps()} />, withManualPictures(pictures));
    expect(jaw().hasAttribute("data-inviting")).toBe(false);
    act(() => pictures.finish("loose.webp"));
    expect(jaw().hasAttribute("data-inviting")).toBe(true);
    fireEvent.click(jaw()); fireEvent.click(jaw());
    expect(jaw().hasAttribute("data-inviting")).toBe(false);
  });

  it("cancels a drag behind the orientation gate and ignores its late release", () => {
    const props = viewProps();
    const pictures = manualPictures();
    const show = (shown: boolean) => <OrientationGate shown={shown} screenUpright={true} language="en"><WhoseJawBoardScreen {...props} /></OrientationGate>;
    const view = render(show(false), withManualPictures(pictures));
    layoutChoices();
    pressAt(jaw(), 0, { x: 500, y: 500 });
    moveAt(40, { x: 160, y: 150 });
    view.rerender(show(true));
    releaseAt(window, 80, { x: 160, y: 150 });
    view.rerender(show(false));
    expect([jaw().hasAttribute("data-dragging"), jaw().getAttribute("aria-pressed")]).toEqual([false, "false"]);
    expect(props.onPlace).not.toHaveBeenCalled();
    expect(props.onName).not.toHaveBeenCalled();
  });
});
