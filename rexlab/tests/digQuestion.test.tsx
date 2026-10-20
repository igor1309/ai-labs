import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GUST, LIFT, STAR_LANDS } from "../src/digGame.tsx";
import { DigBoardScreen, type SandMark } from "../src/DigBoardScreen.tsx";
import { BRUSH_SIZES, brushRound, startRound } from "../src/dig/index.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { presentDigBoard } from "../src/presentation.ts";
import { finishBoard, board, brushAll, choiceCard, cleared, digUp, drag, landTreasure, openDigApp, placeBoard, wrongCards } from "./digApp.tsx";
import { PALETTE, SHIPPED_DIG, fakeBodyPicture, fakeTreasurePicture, homeTile, manualPictures, memoryStorage, sameColour } from "./support.ts";
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

function openRound(level: Level, options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp({ ageLevel: { level, revision: null }, ...options });
  fireEvent.click(homeTile(TEXTS[options.language ?? "en"].dig));
  placeBoard(800);
  return app;
}

// Brushes rows of the frame, top down, until the question shows, and
// returns the time the next stroke may start at.
function brushUntilAsked() {
  let time = 0;
  for (let y = 10; y < 600 && choices().length === 0; y += 20) drag([[0, y], [800, y]], (time += 1000));
  return time + 1000;
}

describe.each(["explorer", "paleontologist"] as const)("the question at %s", (level) => {
  it.each(["en", "ru"] as const)("waits for three quarters of the dinosaur, then asks in %s beside the board, with no name shown", (language) => {
    openRound(level, { language });
    expect([title(), choices(), column()?.getAttribute("aria-hidden")]).toEqual([TEXTS[language].dig, [], "true"]);
    expect(document.querySelector(".dig-body")?.hasAttribute("data-asks")).toBe(true);
    expect(board().style.getPropertyValue("--brush")).toBe("36px");
    drag([[0, 10], [800, 10]]);
    expect(choices()).toEqual([]);
    brushUntilAsked();
    expect(cleared()).toBeGreaterThanOrEqual(0.75);
    expect(title()).toBe(TEXTS[language].whoIsIt);
    expect(column()?.getAttribute("aria-hidden")).toBeNull();
    expect(choices().map((card) => card.dataset.choice)).toEqual(offered[level]);
    expect(choices().map((card) => card.getAttribute("aria-label"))).toEqual(offered[level].map((_, at) => `${TEXTS[language].whoIsIt} ${at + 1} / ${offered[level].length}`));
    for (const card of choices()) {
      expect([pictureOf(card), card.textContent, getComputedStyle(card.querySelector("img")!).filter]).toEqual([fakeBodyPicture(card.dataset.choice!), "", "grayscale(1)"]);
      expect(card.hasAttribute("data-correct")).toBe(false);
    }
    expect(document.querySelector("main")?.textContent).not.toMatch(/TYRANNOSAURUS|ТИРАННОЗАВР/);
    expect(board().hasAttribute("data-blown")).toBe(false);
  });

  it.each(["light", "dark"] as const)("shows an empty card for each choice from the start, in the %s theme, that no tap or screen reader takes", (theme) => {
    openRound(level, { theme });
    const colours = PALETTE[theme];
    expect([column()?.getAttribute("aria-hidden"), column()?.querySelectorAll("button, [tabindex]").length, choices()]).toEqual(["true", 0, []]);
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
    expect([title(), board().hasAttribute("data-blown"), choices()]).toEqual([TEXTS.en.dig, false, []]);
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
    // The choice card fills the slot its empty card filled.
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

  it.each([false, true])("turns each empty card into its choice card in place, 60 ms apart, reduced motion %s", (reducedMotion) => {
    openRound(level, { reducedMotion });
    expect(emptyCards().map((card) => getComputedStyle(card).animationName)).toEqual(offered[level].map(() => "none"));
    brushUntilAsked();
    const stagger = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion-stagger")) * 1.5;
    expect(stagger).toBe(60);
    expect(choices()).toHaveLength(offered[level].length);
    for (const [at, slot] of slots().entries()) {
      expect(slot.style.getPropertyValue("--choice")).toBe(String(at));
      const [empty, card] = [slot.querySelector(".dig-empty-card")!, slot.querySelector(".dig-choice-card")!];
      expect([getComputedStyle(empty).animation, getComputedStyle(card).animation]).toEqual(reducedMotion
        ? ["fade-out var(--motion-small) var(--ease-out) both", "fade-in var(--motion-small) var(--ease-out) both"]
        : ["dig-turn-away var(--motion-small) var(--ease-out) calc(var(--choice) * var(--motion-stagger) * 1.5) both",
          "dig-turn-in var(--motion-small) var(--ease-out) calc(var(--choice) * var(--motion-stagger) * 1.5 + var(--motion-small)) both"]);
      if (!reducedMotion) expect(Number(slot.style.getPropertyValue("--choice")) * stagger).toBe(at * 60);
    }
  });

  it.each([false, true])("keeps clearing under a held finger as the question comes, reduced motion %s", (reducedMotion) => {
    const started = startRound(SHIPPED_DIG, [], undefined, () => 0, level);
    const asked = brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 });
    const marks: SandMark[] = [];
    const draw = (round: typeof started) => <DigBoardScreen language="en" {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture)}
      choiceCount={round.choices.length} level={level} brush={BRUSH_SIZES[level]} grains={!reducedMotion}
      dugUp={0} total={SHIPPED_DIG.length} treasures={0} sandContext={() => null}
      onBrush={(mark) => marks.push(mark)} onHome={() => {}} />;
    const view = render(draw(started), withPictures);
    placeBoard(800);
    pressAt(board(), 0, { x: 286, y: 300, pointer: 9 });
    view.rerender(draw(asked));
    expect(choices()).toHaveLength(offered[level].length);
    moveAt(10, { x: 306, y: 310, pointer: 9 });
    expect(board().querySelector<HTMLElement>(".dig-brush")!.style.left).toBe("38.25%");
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
    let time = 0;
    pressAt(board(), time, { x: 0, y: 10, pointer: 9 });
    for (let y = 10; y < 600 && choices().length === 0; y += 20) {
      moveAt((time += 10), { x: 800, y, pointer: 9 });
      moveAt((time += 10), { x: 0, y: y + 20, pointer: 9 });
    }
    expect(choices()).toHaveLength(offered[level].length);
    expect(getComputedStyle(choices()[0]!).animation).toContain(reducedMotion ? "fade-in" : "dig-turn-in");
    const before = cleared();
    moveAt((time += 10), { x: 800, y: 590, pointer: 9 });
    expect(cleared()).toBeGreaterThan(before);
    expect(board().querySelector<HTMLElement>(".dig-brush")!.style.left).toBe("100%");
    releaseAt(window, (time += 10), { x: 800, y: 590, pointer: 9 });
    brushAll();
    expect([cleared(), board().hasAttribute("data-blown"), choices().length]).toEqual([1, false, offered[level].length]);
    // Digging is recorded only at the gust.
    expect(JSON.parse(app.storage.items.get(PROGRESS_KEY)!).games.dig).toBeUndefined();
  });

  it.each([false, true])("keeps a wrong pick out, then gusts on the right one with no badge, reduced motion %s", (reducedMotion) => {
    const app = openRound(level, { reducedMotion });
    brushUntilAsked();
    const [rejected, other] = wrongCards();
    fireEvent.click(rejected!);
    expect([rejected!.disabled, rejected!.hasAttribute("data-rejected"), getComputedStyle(rejected!).opacity,
      getComputedStyle(rejected!.querySelector("img")!).opacity, rejected!.textContent, rejected!.getAttribute("aria-label")])
      .toEqual([true, true, "1", "0.45", `↻ ${TEXTS.en.digChoice.tryAnother}`, `${TEXTS.en.whoIsIt} ${choices().indexOf(rejected!) + 1} / ${choices().length}: ${TEXTS.en.digChoice.tryAnother}`]);
    fireEvent.click(rejected!);
    expect(choices().filter((card) => card.hasAttribute("data-rejected"))).toEqual([rejected]);
    expect([other!.disabled, board().hasAttribute("data-blown")]).toEqual([false, false]);
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    placeBoard(800);
    expect(choiceCard(rejected!.dataset.choice).disabled).toBe(true);
    fireEvent.click(choiceCard());
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect(choiceCard().hasAttribute("data-correct")).toBe(true);
    expect(getComputedStyle(choiceCard().querySelector("img")!).filter).toBe("grayscale(0)");
    expect(choiceCard().textContent).toBe("✓");
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
        .toEqual([false, false, "grayscale(1)", ""]);
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
    brushAll();
    const looks = () => choices().map((card) => card.querySelector("img")?.getAttribute("data-picture"));
    expect(looks()).toEqual(offered[level].map(() => "loading"));
    act(() => {
      if (outcome === "late") pictures.fire(PICTURE_LIMIT);
      else for (const id of offered[level]) outcome === "loaded" ? pictures.finish(fakeBodyPicture(id)) : pictures.fail(fakeBodyPicture(id));
    });
    expect(looks()).toEqual(offered[level].map(() => (outcome === "loaded" ? "appearing" : "failed")));
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
    render(<DigBoardScreen language="en" {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture)}
      choiceCount={round.choices.length} level={round.level} brush={BRUSH_SIZES[round.level]} grains={false}
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
    expect(board().style.getPropertyValue("--brush")).toBe("48px");
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
