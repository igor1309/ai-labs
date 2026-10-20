import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { GUST, STAR_LANDS } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { NO_LEVEL_OFFER, type LevelOffer } from "../src/levelOffer.ts";
import { localDigProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { board, brushAll, openDigApp, placeBoard, roundDinosaur } from "./digApp.tsx";
import { homeTile, memoryStorage } from "./support.ts";
import { filterTaps, tapAt } from "./taps.ts";

// jsdom has no animation engine. Tests set the remaining reward and
// dismissal durations at the browser boundary and drive their timers.
let remaining: number;
beforeEach(() => {
  remaining = 0;
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: function (this: Element) {
    return [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: this.classList.contains("pairs-offer-scrim") ? 160 : remaining }) } }];
  } });
});
afterEach(() => { Reflect.deleteProperty(Element.prototype, "getAnimations"); });

const button = (name: string) => screen.getByRole("button", { name });
const offerOf = (level: AgeLevel | null, strong: number, declined: AgeLevel[] = []): LevelOffer => ({ level, strong, declined });
const saved = (app: ReturnType<typeof openDigApp>) => localDigProgress(() => app.storage).load()!;
const chosen = (level: AgeLevel) => within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels[level].name });

function begin(level: AgeLevel = "hatchling", levelOffer = NO_LEVEL_OFFER) {
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], levelOffer } } }) });
  const app = openDigApp({ ageLevel: { level, revision: "parent" }, storage });
  fireEvent.click(homeTile("DIG"));
  return app;
}

// Integrates brushing, round completion, the gust, reveal and stored offer.
function finish(app: ReturnType<typeof openDigApp>, help = false) {
  placeBoard(800);
  if (help) for (let second = 0; second < 10; second++) act(() => app.timers.fire(1000));
  const level = board().getAttribute("data-level");
  const id = roundDinosaur().id;
  brushAll();
  if (level === "paleontologist") fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-choice="${id}"]`)!);
  act(() => app.timers.fire(GUST.motion));
  act(() => app.timers.fire(STAR_LANDS.motion));
}
const show = (app: ReturnType<typeof openDigApp>) => act(() => app.timers.fire(remaining));
const dismiss = (app: ReturnType<typeof openDigApp>, answer: string) => {
  fireEvent.click(button(answer));
  act(() => app.timers.fire(160));
};

it.each(["hatchling", "explorer"] as const)("offers the next level after three strong %s reveals, with its picture, words and answer symbols", (level) => {
  const app = begin(level);
  for (let round = 1; round <= 3; round++) {
    finish(app);
    show(app);
    if (round < 3) {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(saved(app).levelOffer).toEqual(offerOf(level, round));
      fireEvent.click(button("DIG AGAIN"));
    }
  }
  const next = level === "hatchling" ? "explorer" : "paleontologist";
  const dialog = screen.getByRole("dialog", { name: TEXTS.en.levelOffer.question(TEXTS.en.ageLevels[next].name) });
  expect(dialog.querySelector(".pairs-offer-picture")?.textContent).toBe(next === "explorer" ? "🦖" : "🦴");
  expect(within(dialog).getAllByRole("button").map((b) => [b.textContent, b.querySelector("svg")?.getAttribute("class")])).toEqual([
    ["YES", expect.stringContaining("lucide-check")], ["NOT NOW", expect.stringContaining("lucide-x")]
  ]);
  expect(saved(app).levelOffer).toEqual(offerOf(level, 0, [level]));
});

it.each(["help", "other level"])("restarts Explorer's run after %s, and needs three fresh strong rounds", (reason) => {
  const app = begin(reason === "help" ? "explorer" : "hatchling", offerOf("explorer", 2));
  finish(app, reason === "help");
  show(app);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(saved(app).levelOffer).toEqual(offerOf(reason === "help" ? "explorer" : "hatchling", reason === "help" ? 0 : 1));
  fireEvent.click(chosen("explorer"));
  for (let round = 1; round <= 3; round++) {
    fireEvent.click(button("DIG AGAIN"));
    finish(app);
    show(app);
    expect(screen.queryByRole("dialog") !== null).toBe(round === 3);
  }
});

it("YES keeps the next level for DIG AGAIN, the tile and a reopened app", () => {
  const app = begin("hatchling", offerOf("hatchling", 2));
  finish(app); show(app); dismiss(app, "YES");
  expect(chosen("explorer").getAttribute("aria-pressed")).toBe("true");
  expect(saved(app).levelOffer).toEqual(offerOf("hatchling", 0));
  fireEvent.click(button("DIG AGAIN"));
  expect(board().getAttribute("data-level")).toBe("explorer");
  fireEvent.click(button("HOME"));
  fireEvent.click(homeTile("DIG"));
  expect(board().getAttribute("data-level")).toBe("explorer");
  app.unmount();
  openDigApp({ storage: app.storage, settingsStorage: app.settingsStorage });
  fireEvent.click(homeTile("DIG"));
  expect(board().getAttribute("data-level")).toBe("explorer");
});

it("NOT NOW waits for five at Hatchling, while Explorer still needs three", () => {
  const app = begin("hatchling", offerOf("hatchling", 2));
  finish(app); show(app); dismiss(app, "NOT NOW");
  expect(chosen("hatchling").getAttribute("aria-pressed")).toBe("true");
  for (let round = 1; round <= 5; round++) {
    fireEvent.click(button("DIG AGAIN")); finish(app); show(app);
    expect(screen.queryByRole("dialog") !== null).toBe(round === 5);
  }
  dismiss(app, "NOT NOW");
  fireEvent.click(chosen("explorer"));
  for (let round = 1; round <= 3; round++) {
    fireEvent.click(button("DIG AGAIN")); finish(app); show(app);
    expect(screen.queryByRole("dialog") !== null).toBe(round === 3);
  }
});

it("never offers beyond Paleontologist, even after ten strong rounds", () => {
  const app = begin("paleontologist", offerOf("paleontologist", 9));
  finish(app); show(app);
  expect(saved(app).levelOffer).toEqual(offerOf("paleontologist", 10));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("waits for the star to land and every remaining celebration before showing the offer", () => {
  const app = begin("hatchling", offerOf("hatchling", 2));
  remaining = 900;
  placeBoard(800); brushAll();
  expect(saved(app).levelOffer).toEqual(offerOf("hatchling", 2));
  act(() => app.timers.fire(GUST.motion));
  expect(saved(app).levelOffer).toEqual(offerOf("hatchling", 3));
  act(() => app.timers.fire(900));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => app.timers.fire(STAR_LANDS.motion));
  act(() => app.timers.fire(0));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("status", { name: "FIRST BEST SCORE" })).toBeDefined();
  show(app);
  expect(screen.getByRole("dialog")).toBeDefined();
});

it.each(["reload", "close"])("treats an offer left by %s as declined, persisting its five-round threshold", () => {
  const app = begin("hatchling", offerOf("hatchling", 2));
  finish(app); show(app); app.unmount();
  const reopened = openDigApp({ storage: app.storage, settingsStorage: app.settingsStorage });
  expect(saved(reopened).levelOffer).toEqual(offerOf("hatchling", 0, ["hatchling"]));
  for (let round = 1; round <= 5; round++) {
    fireEvent.click(button(round === 1 ? "DIG" : "DIG AGAIN")); finish(reopened); show(reopened);
    expect(screen.queryByRole("dialog") !== null).toBe(round === 5);
  }
});

it.each(["YES", "NOT NOW"])("answers a quick double tap on %s once, blocking the reveal through dismissal", (answer) => {
  const app = begin("hatchling", offerOf("hatchling", 2));
  finish(app); show(app);
  expect(screen.getByRole("main").hasAttribute("inert")).toBe(true);
  const again = button("DIG AGAIN");
  filterTaps(); tapAt(button(answer), 0, { x: 400, y: 300 });
  fireEvent.click(again);
  fireEvent.click(button("HOME"));
  expect(document.querySelector(".dig-board")).toBeNull();
  expect(screen.getByRole("dialog")).toBeDefined();
  act(() => app.timers.fire(160));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(again);
  tapAt(again, 250, { x: 400, y: 300 });
  expect(document.querySelector(".dig-board")).toBeNull();
  expect(saved(app).levelChoice?.level).toBe(answer === "YES" ? "explorer" : undefined);
  expect(saved(app).levelOffer).toEqual(offerOf("hatchling", 0, answer === "YES" ? [] : ["hatchling"]));
});

it.each(["DIG AGAIN", "HOME", "reload"])("keeps an unshown offer due when leaving by %s", (leave) => {
  const app = begin("hatchling", offerOf("hatchling", 2));
  remaining = 500; finish(app);
  if (leave === "reload") {
    app.unmount();
    const reopened = openDigApp({ storage: app.storage, settingsStorage: app.settingsStorage });
    fireEvent.click(homeTile("DIG")); finish(reopened); show(reopened);
  } else {
    fireEvent.click(button(leave));
    act(() => app.timers.deliverStopped(500));
    expect(saved(app).levelOffer).toEqual(offerOf("hatchling", 3));
    if (leave === "HOME") fireEvent.click(homeTile("DIG"));
    finish(app); show(app);
  }
  expect(screen.getByRole("dialog")).toBeDefined();
  expect(saved(app).levelOffer).toEqual(offerOf("hatchling", 0, ["hatchling"]));
});

it.each([false, true])("leaving early with help shown %s keeps the count as it was, including during the gust", (help) => {
  const app = begin("explorer", offerOf("explorer", 2));
  placeBoard(800);
  if (help) for (let second = 0; second < 10; second++) act(() => app.timers.fire(1000));
  fireEvent.click(button("HOME"));
  expect(saved(app).levelOffer).toEqual(offerOf("explorer", 2));
  fireEvent.click(homeTile("DIG")); placeBoard(800); brushAll();
  fireEvent.click(button("HOME"));
  act(() => app.timers.deliverStopped(GUST.motion));
  expect(saved(app).levelOffer).toEqual(offerOf("explorer", 2));
  expect(document.querySelector(".dig-reveal")).toBeNull();
});
