import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GUST, LIFT, STAR_LANDS } from "../src/digGame.tsx";
import { DigBoardScreen, type SandMark } from "../src/DigBoardScreen.tsx";
import { BRUSH_SIZES, brushRound, GRID, startRound } from "../src/dig/index.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { presentDigBoard } from "../src/presentation.ts";
import { finishBoard, board, brushAll, choiceCard, cleared, digUp, drag, landTreasure, openDigApp, placeBoard, roundDinosaur, wrongCards } from "./digApp.tsx";
import { PALETTE, SHIPPED_DIG, SHIPPED_DINOSAURS, fakeBodyPicture, fakeTreasurePicture, homeTile, manualPictures, manualTimers, memoryStorage, sameColour } from "./support.ts";
import { moveAt, pressAt, releaseAt } from "./taps.ts";
import { withPictures } from "./pictures.tsx";

type Level = "hatchling" | "explorer" | "paleontologist";

const choices = () => [...document.querySelectorAll<HTMLButtonElement>(".dig-choice-card")];
const pictureOf = (card: HTMLButtonElement) => card.querySelector("img")?.getAttribute("src");
const title = () => screen.getByRole("heading", { level: 1 }).textContent;
const column = () => document.querySelector(".dig-choice-cards");
const slots = () => [...document.querySelectorAll<HTMLElement>(".dig-choice-slot")];
const emptyCards = () => [...document.querySelectorAll<HTMLElement>(".dig-empty-card")];
// What places the board on the screen and sizes it, as its rules give it.
const boardPlace = () => {
  const style = getComputedStyle(board());
  const body = getComputedStyle(document.querySelector(".dig-body")!);
  return [style.width, style.height, style.aspectRatio, style.transform, style.translate, style.transition, style.margin, style.position, style.order,
    body.justifyContent, body.alignItems, body.gap, getComputedStyle(column()!).flexBasis];
};
const saved = (storage: ReturnType<typeof memoryStorage>) => JSON.parse(storage.items.get(PROGRESS_KEY)!).games.dig;
const badge = () => screen.queryByRole("img", { name: TEXTS.en.badges.paleontologist });
const reward = () => screen.getByRole("region", { name: TEXTS.en.dugUp });
// Tyrannosaurus is under the sand, and its closest look-alikes offered.
const offered = { explorer: ["tyrannosaurus", "velociraptor", "compsognathus"], paleontologist: ["tyrannosaurus", "velociraptor", "compsognathus", "giganotosaurus"] };

it("marks only the dinosaur under the sand correct in every answer position", () => {
  const round = startRound(SHIPPED_DIG, [], undefined, () => 0.42, "explorer");
  const correct = round.dinosaur.id;
  const distractors = round.choices.filter((id) => id !== correct);

  for (let position = 0; position <= distractors.length; position++) {
    const choices = [...distractors];
    choices.splice(position, 0, correct);
    const presented = presentDigBoard({ ...round, blown: true, choices }, fakeBodyPicture, fakeTreasurePicture, (id) => id);
    expect(presented.choices.filter((choice) => choice.correct).map((choice) => choice.id)).toEqual([correct]);
  }
});

function openRound(level: Level, options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp({ ageLevel: { level, revision: null }, ...options });
  fireEvent.click(homeTile(TEXTS[options.language ?? "en"].dig));
  placeBoard(800);
  return app;
}

// Brushes rows of the frame, top down, to the given share (the question
// by default), returning the time the next stroke may start at.
function brushUntilAsked(share = 0.75) {
  let time = 0;
  for (let y = 10; y < 600 && cleared() < share; y += 20) drag([[0, y], [800, y]], (time += 1000));
  return time + 1000;
}

describe.each(["explorer", "paleontologist"] as const)("the question at %s", (level) => {
  it.each(["en", "ru"] as const)("waits for three quarters of the dinosaur, then asks in %s beside the board, naming each choice", (language) => {
    openRound(level, { language });
    expect([title(), choices().length, choices().every((card) => card.disabled), column()?.getAttribute("aria-hidden")])
      .toEqual([TEXTS[language].dig, offered[level].length, true, "true"]);
    expect(document.querySelector(".dig-body")?.hasAttribute("data-asks")).toBe(true);
    drag([[0, 10], [800, 10]]);
    expect(choices().every((card) => card.disabled)).toBe(true);
    brushUntilAsked();
    expect(cleared()).toBeGreaterThanOrEqual(0.75);
    expect(title()).toBe(TEXTS[language].whoIsIt);
    expect(column()?.getAttribute("aria-hidden")).toBeNull();
    expect(choices().map((card) => card.dataset.choice)).toEqual(offered[level]);
    const names = offered[level].map((id) => SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === id)!.name[language].toLocaleUpperCase(language));
    expect(choices().map((card) => card.getAttribute("aria-label"))).toEqual(names.map((name) => `${TEXTS[language].whoIsIt}: ${name}`));
    for (const card of choices()) {
      const name = SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === card.dataset.choice)!.name[language].toLocaleUpperCase(language);
      expect([pictureOf(card), card.textContent, getComputedStyle(card.querySelector("img")!).filter]).toEqual([fakeBodyPicture(card.dataset.choice!), name, "grayscale(1)"]);
      // The name shrinks by its letters only as much as the card needs.
      expect(card.querySelector<HTMLElement>(".dig-choice-name")!.style.getPropertyValue("--letters")).toBe(String(name.length));
      expect(card.hasAttribute("data-correct")).toBe(false);
    }
    expect(board().textContent).not.toMatch(/TYRANNOSAURUS|ТИРАННОЗАВР/);
    expect(board().hasAttribute("data-blown")).toBe(false);
  });

  it.each(["light", "dark"] as const)("shows an empty card for each choice from the start, in the %s theme, that no tap or screen reader takes", (theme) => {
    openRound(level, { theme });
    const colours = PALETTE[theme];
    expect([column()?.getAttribute("aria-hidden"), choices().length, choices().every((card) => card.disabled && card.tabIndex === -1)])
      .toEqual(["true", offered[level].length, true]);
    expect(screen.queryByRole("group", { name: TEXTS.en.whoIsIt })).toBeNull();
    expect(emptyCards()).toHaveLength(offered[level].length);
    for (const card of emptyCards()) {
      const style = getComputedStyle(card);
      expect([card.textContent, card.getAttribute("aria-hidden"), style.borderTopWidth, style.borderTopStyle, style.borderRadius, style.fontSize, style.fontWeight, style.placeItems])
        .toEqual(["?", "true", "2px", "solid", "24px", "64px", "700", "center"]);
      expect([style.backgroundColor, style.borderTopColor, style.color].map((colour, at) => sameColour(colour, [colours["surface-2"], colours.line, colours.line][at]!)))
        .toEqual([true, true, true]);
    }
    fireEvent.click(emptyCards()[0]!);
    expect([title(), board().hasAttribute("data-blown"), choices().every((card) => card.disabled)]).toEqual([TEXTS.en.dig, false, true]);
  });

  it.each([false, true])("keeps the board in its place and size, and each card's slot, as the question comes, a pick, the gust and the lift, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    const timing = reducedMotion ? "reduced" : "motion";
    const place = boardPlace();
    expect([place[3], place[4], place[5]]).toEqual(["none", "none", ""]);
    const before = slots();
    const slotSizes = () => slots().map((slot) => {
      const style = getComputedStyle(slot);
      return [style.flex, style.minHeight, style.maxHeight, style.display, style.gridTemplate];
    });
    const sizes = slotSizes();
    expect(sizes).toHaveLength(offered[level].length);
    brushUntilAsked();
    expect([boardPlace(), slots(), slotSizes()]).toEqual([place, before, sizes]);
    // Both cards fill the same slot.
    for (const [at, slot] of slots().entries()) {
      const [empty, card] = [slot.querySelector(".dig-empty-card")!, slot.querySelector(".dig-choice-card")!];
      expect(card).toBe(choices()[at]);
      const fill = (element: Element) => {
        const style = getComputedStyle(element);
        return [style.gridArea, style.boxSizing, style.width, style.height, style.minHeight, style.borderTopWidth];
      };
      expect(fill(card)).toEqual(fill(empty));
      expect(fill(card)).toEqual(["1 / 1", "border-box", "100%", "100%", "0px", "2px"]);
    }
    fireEvent.click(wrongCards()[0]!);
    expect(boardPlace()).toEqual(place);
    fireEvent.click(choiceCard());
    expect([board().hasAttribute("data-blown"), boardPlace()]).toEqual([true, place]);
    act(() => app.timers.fire(GUST[timing]));
    expect([board().hasAttribute("data-lifting"), boardPlace()]).toEqual([true, place]);
    act(() => app.timers.fire(LIFT[timing]));
  });

  it.each([false, true])("crossfades the same cards directly from the unrounded clear-cell fraction, reduced motion %s", (reducedMotion) => {
    const started = startRound(SHIPPED_DIG, [], undefined, () => 0, level);
    // Four hundred dinosaur cells allow exact boundaries and fractions
    // between whole percentages; the rest of the board is empty sand.
    const dinosaur = { ...started.dinosaur, cells: Array.from({ length: GRID.rows }, (_, row) => Array.from({ length: GRID.columns }, () => row < 10)) };
    const roundAt = (count: number) => ({ ...started, dinosaur, sand: { ...started.sand, counts: new Uint8Array(GRID.columns * GRID.rows).fill(25, 0, count) } });
    const submitted: string[] = [];
    const draw = (count: number) => <DigBoardScreen language="en" {...presentDigBoard(roundAt(count), fakeBodyPicture, fakeTreasurePicture, (id) => id)}
      choiceCount={started.choices.length} level={level} brush={BRUSH_SIZES[level]} wide={false} onWide={() => {}} menuTimer={manualTimers().startTimer} grains={!reducedMotion}
      dugUp={0} total={SHIPPED_DIG.length} treasures={0} sandContext={() => null}
      onBrush={() => {}} onPick={(id) => submitted.push(id)} onHome={() => {}} />;
    const view = render(draw(0), withPictures);
    const original = choices();
    const pictures = original.map((card) => card.querySelector("img"));
    for (const [count, opacity] of [[0, 0], [40, 0], [41, (0.0025 / 0.65) ** 2], [100, (0.15 / 0.65) ** 2], [160, (0.3 / 0.65) ** 2], [200, (0.4 / 0.65) ** 2], [240, (0.5 / 0.65) ** 2], [299, (0.6475 / 0.65) ** 2], [300, 1], [360, 1], [400, 1]] as const) {
      view.rerender(draw(count));
      const unlocked = count >= 300;
      expect(title()).toBe(unlocked ? TEXTS.en.whoIsIt : TEXTS.en.dig);
      expect(column()?.getAttribute("aria-hidden")).toBe(unlocked ? null : "true");
      expect(screen.queryByRole("group", { name: TEXTS.en.whoIsIt }) !== null).toBe(unlocked);
      for (const [at, card] of choices().entries()) {
        expect(card).toBe(original[at]);
        expect(card.querySelector("img")).toBe(pictures[at]);
        expect(Number(getComputedStyle(card).opacity)).toBeCloseTo(opacity, 12);
        expect(Number(getComputedStyle(emptyCards()[at]!).opacity)).toBeCloseTo(1 - opacity, 12);
        expect([card.disabled, card.tabIndex]).toEqual(unlocked ? [false, 0] : [true, -1]);
        expect(getComputedStyle(card.querySelector("img")!).filter).toBe("grayscale(1)");
        if (!unlocked) {
          fireEvent.click(card);
          card.focus();
          expect(document.activeElement).not.toBe(card);
        }
        for (const surface of [card, emptyCards()[at]!]) {
          const style = getComputedStyle(surface);
          expect(style.animationName).toBe("none");
          expect(style.transition).not.toMatch(/\b(?:opacity|all)\b/);
          expect(style.transform).toBe("none");
        }
        expect(getComputedStyle(emptyCards()[at]!).pointerEvents).toBe("none");
      }
      expect(submitted).toEqual([]);
    }
    for (const card of choices()) fireEvent.click(card);
    expect(submitted).toEqual(started.choices);
  });

  it.each([false, true])("keeps clearing under a held finger as the question comes, reduced motion %s", (reducedMotion) => {
    const started = startRound(SHIPPED_DIG, [], undefined, () => 0, level);
    const asked = brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 });
    const marks: SandMark[] = [];
    const draw = (round: typeof started) => <DigBoardScreen language="en" {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture, (id) => id)}
      choiceCount={round.choices.length} level={level} brush={BRUSH_SIZES[level]} wide={false} onWide={() => {}} menuTimer={manualTimers().startTimer} grains={!reducedMotion}
      dugUp={0} total={SHIPPED_DIG.length} treasures={0} sandContext={() => null}
      onBrush={(mark) => marks.push(mark)} onHome={() => {}} />;
    const view = render(draw(started), withPictures);
    placeBoard(800);
    pressAt(board(), 0, { x: 286, y: 300, pointer: 9 });
    view.rerender(draw(asked));
    expect(choices()).toHaveLength(offered[level].length);
    moveAt(10, { x: 306, y: 310, pointer: 9 });
    moveAt(20, { x: 326, y: 310, pointer: 9 });
    expect(marks).toEqual([
      { from: { x: 286, y: 300 }, to: { x: 286, y: 300 }, radius: 18 },
      { from: { x: 286, y: 300 }, to: { x: 306, y: 310 }, radius: 18 },
      { from: { x: 306, y: 310 }, to: { x: 326, y: 310 }, radius: 18 }
    ]);
    releaseAt(window, 30, { x: 326, y: 310, pointer: 9 });
  });

  it.each([false, true])("goes on brushing while it asks, even the stroke held down as it came, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    const original = choices();
    const opacities: number[] = [];
    const checkFade = () => {
      const clear = board().getAttribute("data-clear")!.split(" ");
      const cells = roundDinosaur().cells.flatMap((row, y) => row.flatMap((over, x) => over ? [clear[y]![x] === "1"] : []));
      const share = cells.filter(Boolean).length / cells.length;
      const opacity = Math.max(0, Math.min(1, (share - 0.1) / 0.65)) ** 2;
      expect(cleared()).toBe(share);
      expect(title()).toBe(share >= 0.75 ? TEXTS.en.whoIsIt : TEXTS.en.dig);
      for (const [at, card] of choices().entries()) {
        expect(card).toBe(original[at]);
        expect(Number(getComputedStyle(card).opacity)).toBeCloseTo(opacity, 12);
        expect(Number(getComputedStyle(emptyCards()[at]!).opacity)).toBeCloseTo(1 - opacity, 12);
        expect(card.disabled).toBe(share < 0.75);
      }
      if (opacities.length) expect(opacity).toBeGreaterThanOrEqual(opacities.at(-1)!);
      opacities.push(opacity);
    };
    checkFade();
    let time = 0;
    pressAt(board(), time, { x: 0, y: 10, pointer: 9 });
    checkFade();
    for (let y = 10; y < 600 && cleared() < 0.75; y += 20) {
      moveAt((time += 10), { x: 800, y, pointer: 9 });
      checkFade();
      moveAt((time += 10), { x: 0, y: y + 20, pointer: 9 });
      checkFade();
    }
    expect(new Set(opacities.filter((opacity) => opacity > 0 && opacity < 1)).size).toBeGreaterThan(5);
    expect(opacities.some((opacity) => opacity > 0 && opacity < 1 && Math.abs(opacity * 50 - Math.round(opacity * 50)) > 0.0001)).toBe(true);
    expect(choices()).toHaveLength(offered[level].length);
    expect(getComputedStyle(choices()[0]!).animationName).toBe("none");
    const before = cleared();
    moveAt((time += 10), { x: 800, y: 590, pointer: 9 });
    expect(cleared()).toBeGreaterThan(before);
    releaseAt(window, (time += 10), { x: 800, y: 590, pointer: 9 });
    brushAll();
    expect([cleared(), board().hasAttribute("data-blown"), choices().length]).toEqual([1, false, offered[level].length]);
    // Digging is recorded only at the gust.
    expect(JSON.parse(app.storage.items.get(PROGRESS_KEY)!).games.dig).toBeUndefined();
  });

  it.each([false, true])("restores the current fade and rejected choices after rotation and the FIELD GUIDE, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    brushUntilAsked(0.5);
    expect(cleared()).toBeGreaterThanOrEqual(0.5);
    expect(cleared()).toBeLessThan(0.75);
    const state = () => ({
      clear: board().getAttribute("data-clear"), title: title(),
      cards: choices().map((card, at) => [card.dataset.choice, card.disabled, card.tabIndex, card.dataset.rejected,
        getComputedStyle(card).opacity, getComputedStyle(card.querySelector("img")!).opacity, getComputedStyle(emptyCards()[at]!).opacity]),
      hidden: column()?.getAttribute("aria-hidden")
    });
    for (const phase of ["partial", "rejected"]) {
      if (phase === "rejected") {
        brushUntilAsked();
        fireEvent.click(wrongCards()[0]!);
      }
      const before = state();
      const original = choices();
      act(() => app.viewport.turn("portrait"));
      act(() => app.viewport.turn("landscape"));
      placeBoard(800);
      expect(state()).toEqual(before);
      choices().forEach((card, at) => expect(card).toBe(original[at]));
      fireEvent.click(screen.getByRole("button", { name: TEXTS.en.fieldGuide }));
      fireEvent.click(screen.getByRole("button", { name: "BACK" }));
      placeBoard(800);
      expect(state()).toEqual(before);
    }
    fireEvent.click(choiceCard());
    expect(board().hasAttribute("data-blown")).toBe(true);
  });

  it.each([false, true])("starts choices at zero again after HOME and DIG AGAIN, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    const fresh = () => {
      expect([cleared(), title(), column()?.getAttribute("aria-hidden")]).toEqual([0, TEXTS.en.dig, "true"]);
      expect(choices()).toHaveLength(offered[level].length);
      for (const [at, card] of choices().entries()) {
        expect([card.disabled, card.tabIndex, card.hasAttribute("data-rejected"), card.hasAttribute("data-correct"), getComputedStyle(card).opacity,
          getComputedStyle(emptyCards()[at]!).opacity]).toEqual([true, -1, false, false, "0", "1"]);
      }
    };
    brushUntilAsked(0.5);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    fireEvent.click(homeTile("DIG"));
    placeBoard(800);
    fresh();
    brushUntilAsked();
    fireEvent.click(wrongCards()[0]!);
    fireEvent.click(choiceCard());
    finishBoard(app.timers, reducedMotion ? "reduced" : "motion");
    act(() => app.timers.fire(STAR_LANDS[reducedMotion ? "reduced" : "motion"]));
    fireEvent.click(screen.getByRole("button", { name: "DIG AGAIN" }));
    placeBoard(800);
    fresh();
  });

  it.each([false, true])("keeps a wrong pick out, then gusts on the right one with no badge, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    brushUntilAsked();
    const [rejected, other] = wrongCards();
    fireEvent.click(rejected!);
    expect([rejected!.disabled, rejected!.hasAttribute("data-rejected"), getComputedStyle(rejected!).opacity,
      getComputedStyle(rejected!.querySelector("img")!).opacity, rejected!.textContent, rejected!.getAttribute("aria-label")])
      .toEqual([true, true, "1", "0.45", `${SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === rejected!.dataset.choice)!.name.en.toLocaleUpperCase("en")}↻ ${TEXTS.en.digChoice.tryAnother}`, `${TEXTS.en.whoIsIt}: ${SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === rejected!.dataset.choice)!.name.en.toLocaleUpperCase("en")}: ${TEXTS.en.digChoice.tryAnother}`]);
    fireEvent.click(rejected!);
    expect(choices().filter((card) => card.hasAttribute("data-rejected"))).toEqual([rejected]);
    expect([other!.disabled, board().hasAttribute("data-blown")]).toEqual([false, false]);
    act(() => app.viewport.turn("portrait"));
    act(() => app.viewport.turn("landscape"));
    placeBoard(800);
    expect(choiceCard(rejected!.dataset.choice).disabled).toBe(true);
    fireEvent.click(choiceCard());
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect(choiceCard().hasAttribute("data-correct")).toBe(true);
    expect(getComputedStyle(choiceCard().querySelector("img")!).filter).toBe("grayscale(0)");
    expect(choiceCard().textContent).toBe(`${SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === choiceCard().dataset.choice)!.name.en.toLocaleUpperCase("en")}✓`);
    expect(choiceCard().getAttribute("aria-label")).toContain(TEXTS.en.digChoice.right);
    const correctChoice = choiceCard();
    const currentRejected = choices().find((card) => card.dataset.choice === rejected!.dataset.choice)!;
    const correctChoices = choices().filter((card) => card.hasAttribute("data-correct"));
    const rejectedChoices = choices().filter((card) => card.hasAttribute("data-rejected"));
    const remainingChoices = choices().filter((card) => card.dataset.choice !== correctChoice.dataset.choice && card.dataset.choice !== currentRejected.dataset.choice);
    expect(correctChoices.map((card) => card.dataset.choice)).toEqual([correctChoice.dataset.choice]);
    expect(rejectedChoices.map((card) => card.dataset.choice)).toEqual([currentRejected.dataset.choice]);
    expect(getComputedStyle(correctChoice.querySelector(".dig-choice-mark")!).animation).toBe("pop-in var(--motion-small) var(--ease-overshoot) both");
    for (const card of remainingChoices) {
      expect([card.hasAttribute("data-correct"), card.hasAttribute("data-rejected"), getComputedStyle(card.querySelector("img")!).filter, card.textContent])
        .toEqual([false, false, "grayscale(1)", SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === card.dataset.choice)!.name.en.toLocaleUpperCase("en")]);
    }
    expect([title(), choices().length, choices().every((card) => card.disabled)]).toEqual([TEXTS.en.whoIsIt, offered[level].length, true]);
    const before = board().getAttribute("data-clear");
    drag([[0, 590], [800, 590]], 90_000);
    expect(board().getAttribute("data-clear")).toBe(before);
    expect(saved(app.storage).badges).toEqual([]);
    const timing = reducedMotion ? "reduced" : "motion";
    landTreasure(app.timers, timing);
    expect(app.timers.timers()).toEqual([GUST[timing]]);
    finishBoard(app.timers, timing);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(reward().textContent).toContain(`1/${SHIPPED_DIG.length}`);
    expect(badge()).toBeNull();
  });

  it("earns the badge for the right first pick, and keeps it across a reload and a later wrong pick", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: SHIPPED_DIG.map(({ id }) => id), badges: [] } } }) });
    const first = openRound(level, { storage });
    digUp();
    expect(saved(storage).badges).toEqual(["tyrannosaurus"]);
    finishBoard(first.timers);
    expect(badge()).not.toBeNull();
    expect(reward().querySelector(".level-badge")).not.toBeNull();
    first.unmount();
    const later = openRound(level, { storage });
    brushAll();
    fireEvent.click(wrongCards()[0]!);
    fireEvent.click(choiceCard());
    finishBoard(later.timers);
    expect(badge()).not.toBeNull();
    expect(saved(storage).badges).toEqual(["tyrannosaurus"]);
    act(() => later.timers.fire(STAR_LANDS.motion));
  });

  it.each(["loaded", "failed", "late"] as const)("asks while the pictures load, shows the %s look and still takes picks", (outcome) => {
    const pictures = manualPictures();
    const app = openRound(level, { timers: pictures });
    brushUntilAsked(0.5);
    const opacity = Number(getComputedStyle(choices()[0]!).opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    const original = choices();
    const looks = () => choices().map((card) => card.querySelector("img")?.getAttribute("data-picture"));
    expect(looks()).toEqual(offered[level].map(() => "loading"));
    act(() => {
      if (outcome === "late") pictures.fire(PICTURE_LIMIT);
      else for (const id of offered[level]) outcome === "loaded" ? pictures.finish(fakeBodyPicture(id)) : pictures.fail(fakeBodyPicture(id));
    });
    expect(looks()).toEqual(offered[level].map(() => (outcome === "loaded" ? "appearing" : "failed")));
    for (const [at, card] of choices().entries()) {
      expect(card).toBe(original[at]);
      expect(Number(getComputedStyle(card).opacity)).toBe(opacity);
      expect(card.disabled).toBe(true);
      fireEvent.click(card);
    }
    expect(board().hasAttribute("data-blown")).toBe(false);
    brushAll();
    // A failed picture has no source to tell the dinosaur under the sand by.
    fireEvent.click(choiceCard("velociraptor"));
    expect(choiceCard("velociraptor").disabled).toBe(true);
    fireEvent.click(choiceCard("tyrannosaurus"));
    expect(board().hasAttribute("data-blown")).toBe(true);
    finishBoard(app.timers);
    expect(reward().textContent).toContain(`1/${SHIPPED_DIG.length}`);
  });
});

describe("the question's cards", () => {
  it("submit the dinosaur each one shows", () => {
    const started = startRound(SHIPPED_DIG, [], undefined, () => 0, "paleontologist");
    const round = brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 });
    const submitted: string[] = [];
    render(<DigBoardScreen language="en" {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture, (id) => id)}
      choiceCount={round.choices.length} level={round.level} brush={BRUSH_SIZES[round.level]} wide={false} onWide={() => {}} menuTimer={manualTimers().startTimer} grains={false}
      dugUp={0} total={SHIPPED_DIG.length} treasures={0} sandContext={() => null}
      onBrush={() => {}} onPick={(id) => submitted.push(id)} onHome={() => {}} />, withPictures);
    for (const card of choices()) fireEvent.click(card);
    expect(submitted).toEqual(offered.paleontologist);
    expect(choices().map(pictureOf)).toEqual(submitted.map(fakeBodyPicture));
  });
});

describe("Hatchling", () => {
  it("never asks, keeps no room for the question and gusts at 95% of the dinosaur", () => {
    const app = openRound("hatchling");
    expect([document.querySelector(".dig-body")?.hasAttribute("data-asks"), column(), emptyCards()]).toEqual([false, null, []]);
    let last = 0;
    for (let y = 10; y < 600 && !board().hasAttribute("data-blown"); y += 20) {
      last = cleared();
      drag([[0, y], [800, y]], y * 100);
      expect(choices()).toEqual([]);
    }
    expect([last < 0.95, cleared() >= 0.95, title()]).toEqual([true, true, "DIG"]);
    finishBoard(app.timers);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
  });
});
