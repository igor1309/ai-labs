import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GUST, STAR_LANDS } from "../src/digGame.tsx";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { BRUSH_SIZES, brushRound, startRound } from "../src/dig/index.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { presentDigBoard } from "../src/presentation.ts";
import { board, brushAll, choiceCard, cleared, digUp, drag, openDigApp, placeBoard, wrongCards } from "./digApp.tsx";
import { SHIPPED_DIG, fakeBodyPicture, homeTile, manualPictures, memoryStorage } from "./support.ts";
import { moveAt, pressAt, releaseAt } from "./taps.ts";
import { withPictures } from "./pictures.tsx";

type Level = "hatchling" | "explorer" | "paleontologist";

const choices = () => [...document.querySelectorAll<HTMLButtonElement>(".dig-choice-card")];
const pictureOf = (card: HTMLButtonElement) => card.querySelector("img")?.getAttribute("src");
const title = () => screen.getByRole("heading", { level: 1 }).textContent;
const column = () => document.querySelector(".dig-choice-cards");
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
    for (const card of choices()) expect([pictureOf(card), card.textContent]).toEqual([fakeBodyPicture(card.dataset.choice!), ""]);
    expect(document.querySelector("main")?.textContent).not.toMatch(/TYRANNOSAURUS|ТИРАННОЗАВР/);
    expect(board().hasAttribute("data-blown")).toBe(false);
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
    expect(getComputedStyle(column()!).animation).toContain(reducedMotion ? "fade-in" : "rise-in");
    const before = cleared();
    moveAt((time += 10), { x: 800, y: 590, pointer: 9 });
    expect(cleared()).toBeGreaterThan(before);
    expect(board().querySelector(".dig-brush")).not.toBeNull();
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
    expect([rejected!.disabled, rejected!.hasAttribute("data-rejected"), getComputedStyle(rejected!).opacity]).toEqual([true, true, "0.25"]);
    fireEvent.click(rejected!);
    expect(choices().filter((card) => card.hasAttribute("data-rejected"))).toEqual([rejected]);
    expect([other!.disabled, board().hasAttribute("data-blown")]).toEqual([false, false]);
    act(() => app.viewport.turn("portrait"));
    act(() => app.viewport.turn("landscape"));
    placeBoard(800);
    expect(choiceCard(rejected!.dataset.choice).disabled).toBe(true);
    fireEvent.click(choiceCard());
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect([title(), choices().length, choices().every((card) => card.disabled)]).toEqual([TEXTS.en.whoIsIt, offered[level].length, true]);
    const before = board().getAttribute("data-clear");
    drag([[0, 590], [800, 590]], 90_000);
    expect(board().getAttribute("data-clear")).toBe(before);
    expect(saved(app.storage).badges).toEqual([]);
    const timing = reducedMotion ? "reduced" : "motion";
    expect(app.timers.timers()).toEqual([GUST[timing]]);
    act(() => app.timers.fire(GUST[timing]));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(reward().textContent).toContain(`1/${SHIPPED_DIG.length}`);
    expect(badge()).toBeNull();
  });

  it("earns the badge for the right first pick, and keeps it across a reload and a later wrong pick", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: SHIPPED_DIG.map(({ id }) => id), badges: [] } } }) });
    const first = openRound(level, { storage });
    digUp();
    expect(saved(storage).badges).toEqual(["tyrannosaurus"]);
    act(() => first.timers.fire(GUST.motion));
    expect(badge()).not.toBeNull();
    expect(reward().querySelector(".level-badge")).not.toBeNull();
    first.unmount();
    const later = openRound(level, { storage });
    brushAll();
    fireEvent.click(wrongCards()[0]!);
    fireEvent.click(choiceCard());
    act(() => later.timers.fire(GUST.motion));
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
    act(() => app.timers.fire(GUST.motion));
    expect(reward().textContent).toContain(`1/${SHIPPED_DIG.length}`);
  });
});

describe("the question's cards", () => {
  it("submit the dinosaur each one shows", () => {
    const started = startRound(SHIPPED_DIG, [], undefined, () => 0, "paleontologist");
    const round = brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 });
    const submitted: string[] = [];
    render(<DigBoardScreen language="en" {...presentDigBoard(round, fakeBodyPicture)}
      level={round.level} brush={BRUSH_SIZES[round.level]} grains={false}
      dugUp={0} total={SHIPPED_DIG.length} sandContext={() => null}
      onBrush={() => {}} onPick={(id) => submitted.push(id)} onHome={() => {}} />, withPictures);
    for (const card of choices()) fireEvent.click(card);
    expect(submitted).toEqual(offered.paleontologist);
    expect(choices().map(pictureOf)).toEqual(submitted.map(fakeBodyPicture));
  });
});

describe("Hatchling", () => {
  it("never asks, keeps no room for the question and gusts at 95% of the dinosaur", () => {
    const app = openRound("hatchling");
    expect([document.querySelector(".dig-body")?.hasAttribute("data-asks"), column()]).toEqual([false, null]);
    expect(board().style.getPropertyValue("--brush")).toBe("48px");
    let last = 0;
    for (let y = 10; y < 600 && !board().hasAttribute("data-blown"); y += 20) {
      last = cleared();
      drag([[0, y], [800, y]], y * 100);
      expect(choices()).toEqual([]);
    }
    expect([last < 0.95, cleared() >= 0.95, title()]).toEqual([true, true, "DIG"]);
    act(() => app.timers.fire(GUST.motion));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
  });
});
