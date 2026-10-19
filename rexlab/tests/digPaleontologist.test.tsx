import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GUST, STAR_LANDS } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { board, brushAll, drag, openDigApp, placeBoard } from "./digApp.tsx";
import { SHIPPED_DIG, homeTile, manualPictures, memoryStorage } from "./support.ts";
import { moveAt, pressAt, releaseAt } from "./taps.ts";

const rex = SHIPPED_DIG.find(({ id }) => id === "tyrannosaurus")!;
const cards = () => [...document.querySelectorAll<HTMLElement>(".dig-find-card")];
const choices = () => [...document.querySelectorAll<HTMLButtonElement>(".dig-choice-card")];
const correct = () => choices().find((card) => card.dataset.choice === rex.id)!;
const wrong = () => choices().find((card) => card.dataset.choice !== rex.id)!;
const ageLevel = { level: "paleontologist", revision: null } as const;

function openRound(options: Parameters<typeof openDigApp>[0] = {}) {
  const app = openDigApp({ ageLevel, ...options });
  fireEvent.click(homeTile(TEXTS[options.language ?? "en"].dig));
  placeBoard(800);
  return app;
}

function find(kind: string, time = 1000) {
  const spot = rex.spots.find((spot) => spot.kind === kind)!;
  for (let y = spot.y - spot.r; y <= spot.y + spot.r; y += 20) {
    drag([[spot.x - spot.r, y], [spot.x + spot.r, y]], time);
    time += 1000;
  }
}

function spend(app: ReturnType<typeof openRound>, seconds: number) {
  for (let at = 0; at < seconds; at++) act(() => app.timers.fire(1000));
}

const saved = (storage: ReturnType<typeof memoryStorage>) => JSON.parse(storage.items.get(PROGRESS_KEY)!).games.dig;
const badge = () => screen.queryByRole("img", { name: TEXTS.en.badges.paleontologist });
const reward = () => screen.getByRole("region", { name: TEXTS.en.dugUp });

describe("Paleontologist's board", () => {
  it.each(["en", "ru"] as const)("shows one unnamed %s clue, its sand disc and a closed card, with the finer brush", (language) => {
    openRound({ language });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(TEXTS[language].whoIsIt);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(document.querySelector("main")?.textContent).not.toMatch(/TYRANNOSAURUS|ТИРАННОЗАВР/);
    expect(board().style.getPropertyValue("--brush")).toBe("36px");
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.textContent).toContain(TEXTS[language].spotKinds.eye);
    expect(cards()[0]?.textContent).toContain("1 / 3");
    expect(cards()[0]?.querySelector(".dig-clue-sand")?.textContent).toBe("🔍");
    expect(cards()[0]?.querySelector("img")).toBeNull();
    expect(document.querySelector(".dig-clue-closed")).not.toBeNull();
    expect(choices()).toEqual([]);
  });

  it.each([false, true])("ticks early finds only when their clue arrives, showing close-ups and stars once, reduced motion %s", (reducedMotion) => {
    const app = openRound({ reducedMotion });
    find("claw");
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.hasAttribute("data-found")).toBe(false);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    find("eye", 20_000);
    expect(cards().map((card) => [card.dataset.spot, card.hasAttribute("data-found")])).toEqual([["eye", true], ["claw", true], ["foot", false]]);
    for (const card of cards().slice(0, 2)) {
      expect(card.querySelector(".dig-find-tick")).not.toBeNull();
      expect(card.querySelector("img")?.getAttribute("src")).toBe("/pictures/tyrannosaurus.webp");
      expect(getComputedStyle(card).flexDirection).toBe("row");
    }
    expect(cards()[2]?.textContent).toContain("3 / 3");
    expect(cards()[2]?.querySelector("img")).toBeNull();
    expect(document.querySelector(".dig-clue-closed")).toBeNull();
    const pops = [...board().querySelectorAll(".dig-find-pop")];
    expect(pops).toHaveLength(2);
    for (const pop of pops) {
      expect(pop.querySelector(".dig-detail-star")).not.toBeNull();
      expect(pop.querySelector(".dig-detail-sparkle") !== null).toBe(!reducedMotion);
      fireEvent(pop, new Event("webkitAnimationEnd", { bubbles: true }));
    }
    find("eye", 30_000);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    placeBoard(800);
    expect(board().querySelector(".dig-find-pop")).toBeNull();
    expect(cards()[2]?.textContent).toContain("3 / 3");
  });

  it.each(["hidden", "portrait"] as const)("helps only the shown clue after ten visible seconds, pausing in %s", (pause) => {
    const app = openRound();
    spend(app, 4);
    act(() => pause === "hidden" ? app.visibility.switchTo("hidden") : app.orientation.turn("portrait"));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(1000));
    act(() => pause === "hidden" ? app.visibility.switchTo("visible") : app.orientation.turn("landscape"));
    placeBoard(800);
    spend(app, 5);
    expect(board().getAttribute("data-helped")).toBe("");
    spend(app, 1);
    expect(board().getAttribute("data-helped")).toBe("eye");
    expect(app.timers.timers()).toEqual([]);
    expect(board().querySelector(".dig-help-window[data-spot='eye']")).not.toBeNull();
    expect(getComputedStyle(cards()[0]!).animation).toContain("dig-card-pulse");
    expect(board().getAttribute("data-cleared")).toBe("0");
    find("eye");
    expect(board().querySelector(".dig-help-window")).toBeNull();
    spend(app, 9);
    expect(board().getAttribute("data-helped")).toBe("eye");
    spend(app, 1);
    expect(board().getAttribute("data-helped")).toBe("eye claw");
    app.unmount();
    expect(app.timers.timers()).toEqual([]);
  });

  it("stops help on HOME and ignores a previous round's callback", () => {
    const app = openRound();
    spend(app, 9);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(app.timers.timers()).toEqual([]);
    fireEvent.click(homeTile("DIG"));
    act(() => app.timers.deliverStopped(1000));
    spend(app, 9);
    expect(board().getAttribute("data-helped")).toBe("");
    spend(app, 1);
    expect(board().getAttribute("data-helped")).toBe("eye");
  });
});

describe("the choice and its badge", () => {
  it.each([false, true])("locks an ongoing stroke and further brushing, fades wrong picks permanently, then gusts on the right pick, reduced motion %s", (reducedMotion) => {
    const app = openRound({ reducedMotion });
    find("eye");
    find("claw", 20_000);
    // The third find happens with the pointer still held down.
    const foot = rex.spots.find(({ kind }) => kind === "foot")!;
    pressAt(board(), 40_000, { x: foot.x - foot.r, y: foot.y - foot.r, pointer: 9 });
    let time = 40_000;
    for (let y = foot.y - foot.r; y <= foot.y + foot.r && choices().length === 0; y += 20) {
      moveAt(time += 10, { x: foot.x + foot.r, y, pointer: 9 });
      moveAt(time += 10, { x: foot.x - foot.r, y: y + 20, pointer: 9 });
    }
    expect(cards().every((card) => card.hasAttribute("data-found"))).toBe(true);
    expect(choices()).toHaveLength(3);
    expect(new Set(choices().map((card) => card.dataset.choice)).size).toBe(3);
    expect(choices().every((card) => card.querySelector("img") && card.textContent === "")).toBe(true);
    expect(board().hasAttribute("data-blown")).toBe(false);
    const before = board().getAttribute("data-clear");
    moveAt(50_000, { x: 0, y: 0, pointer: 9 });
    expect(board().getAttribute("data-clear")).toBe(before);
    expect(board().querySelector(".dig-brush")).toBeNull();
    releaseAt(window, 50_010, { x: 0, y: 0, pointer: 9 });
    drag([[0, 0], [800, 600]], 60_000);
    expect(board().getAttribute("data-clear")).toBe(before);
    expect(app.timers.timers()).toEqual([]);
    expect(getComputedStyle(document.querySelector(".dig-choice-cards")!).animation).toContain(reducedMotion ? "fade-in" : "rise-in");
    // Starting is recorded immediately; digging is recorded only at the gust.
    expect(JSON.parse(app.storage.items.get(PROGRESS_KEY)!).games).toEqual({
      "home-featured": { starts: { dig: 1 }, featured: { day: "2026-10-18", game: "compare" } }
    });
    const rejected = wrong();
    fireEvent.click(rejected);
    expect([rejected.disabled, getComputedStyle(rejected).opacity]).toEqual([true, "0.25"]);
    fireEvent.click(rejected);
    expect(choices().filter((card) => card.hasAttribute("data-rejected"))).toEqual([rejected]);
    act(() => app.orientation.turn("portrait"));
    act(() => app.orientation.turn("landscape"));
    expect(choices().find((card) => card.dataset.choice === rejected.dataset.choice)?.disabled).toBe(true);
    fireEvent.click(correct());
    expect(board().hasAttribute("data-blown")).toBe(true);
    expect(choices().every((card) => card.disabled)).toBe(true);
    expect(saved(app.storage).badges).toEqual([]);
    const timing = reducedMotion ? "reduced" : "motion";
    expect(app.timers.timers()).toEqual([GUST[timing]]);
    act(() => app.timers.fire(GUST[timing]));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(reward().textContent).toContain(`1/${SHIPPED_DIG.length}`);
    expect(badge()).toBeNull();
  });

  it.each(["hatchling", "explorer", "paleontologist"] as const)("keeps a first-pick badge across reload and a later %s reveal, including a later wrong pick", (level) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: SHIPPED_DIG.map(({ id }) => id), badges: [] } } }) });
    const first = openRound({ storage });
    brushAll();
    fireEvent.click(correct());
    expect(saved(storage).badges).toEqual([rex.id]);
    act(() => first.timers.fire(GUST.motion));
    expect(badge()).not.toBeNull();
    expect(reward().querySelector(".level-badge")).not.toBeNull();
    first.unmount();
    const later = openRound({ storage, ageLevel: { level, revision: null } });
    brushAll();
    if (level === "paleontologist") {
      fireEvent.click(wrong());
      fireEvent.click(correct());
    }
    act(() => later.timers.fire(GUST.motion));
    expect(badge()).not.toBeNull();
    expect(saved(storage).badges).toEqual([rex.id]);
    act(() => later.timers.fire(STAR_LANDS.motion));
  });

  it.each(["loaded", "failed", "late"] as const)("plays while pictures load, gives found clues their %s look and still accepts choice cards", (outcome) => {
    const pictures = manualPictures();
    const app = openRound({ timers: pictures });
    expect(board().querySelector("img")?.getAttribute("data-picture")).toBe("loading");
    find("eye");
    expect(cards()[0]?.querySelector("img")?.getAttribute("data-picture")).toBe("loading");
    brushAll();
    expect(choices().map((card) => card.querySelector("img")?.getAttribute("data-picture"))).toEqual(["loading", "loading", "loading"]);
    const urls = choices().map((card) => `/pictures/${card.dataset.choice}.webp`);
    act(() => {
      if (outcome === "late") pictures.fire(PICTURE_LIMIT);
      else for (const url of urls) outcome === "loaded" ? pictures.finish(url) : pictures.fail(url);
    });
    const look = outcome === "loaded" ? "appearing" : "failed";
    expect(choices().map((card) => card.querySelector("img")?.getAttribute("data-picture"))).toEqual([look, look, look]);
    expect(cards().every((card) => card.querySelector("img")?.getAttribute("data-picture") === look)).toBe(true);
    fireEvent.click(wrong());
    expect(wrong().disabled).toBe(true);
    fireEvent.click(correct());
    expect(board().hasAttribute("data-blown")).toBe(true);
    act(() => app.timers.fire(GUST.motion));
    expect(reward().textContent).toContain(`1/${SHIPPED_DIG.length}`);
  });
});
