import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import { NO_LABYRINTH } from "../src/labyrinth/index.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NO_LEVEL_OFFER, type LevelOffer } from "../src/levelOffer.ts";
import { localLabyrinthProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { mazeBoard, openLabyrinthApp, solveMaze } from "./labyrinthApp.tsx";
import { homeTile, memoryStorage } from "./support.ts";

const button = (name: string) => screen.getByRole("button", { name });
const offerOf = (level: AgeLevel | null, strong: number, declined: AgeLevel[] = []): LevelOffer => ({ level, strong, declined });
const saved = (app: ReturnType<typeof openLabyrinthApp>) => localLabyrinthProgress(() => app.storage).load()!;

function begin(level: AgeLevel = "hatchling", offer = NO_LEVEL_OFFER) {
  // jsdom supplies no animation engine; remaining times belong to this
  // browser instance and advance only through its injected timer.
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: function (this: Element) {
    return [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: this.classList.contains("pairs-offer-scrim") ? 160 : 900 }) } }];
  } });
  onTestFinished(() => { if (descriptor) Object.defineProperty(Element.prototype, "getAnimations", descriptor); else Reflect.deleteProperty(Element.prototype, "getAnimations"); });
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { labyrinth: { progress: NO_LABYRINTH, offer } } }) });
  const app = openLabyrinthApp({ storage, ageLevel: { level, revision: "parent" } });
  fireEvent.click(homeTile("LABYRINTH"));
  return app;
}
const show = (app: ReturnType<typeof begin>) => act(() => app.timers.fire(900));
const dismiss = (app: ReturnType<typeof begin>, answer: string) => {
  fireEvent.click(button(answer));
  act(() => app.timers.fire(160));
};
const choose = (level: AgeLevel) => fireEvent.click(within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels[level].name }));

describe("labyrinth's shared next-level offer", () => {
  it.each(["hatchling", "explorer"] as const)("offers the next level after three hint-free %s rounds", (level) => {
    const app = begin(level);
    for (let round = 1; round <= 3; round++) {
      solveMaze({ backtrack: true });
      expect(saved(app).offer).toEqual(offerOf(level, round));
      expect(screen.queryByRole("dialog")).toBeNull();
      show(app);
      if (round < 3) {
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(button("AGAIN"));
      }
    }
    const next = level === "hatchling" ? "explorer" : "paleontologist";
    expect(screen.getByRole("dialog", { name: TEXTS.en.levelOffer.question(TEXTS.en.ageLevels[next].name) })).toBeDefined();
    expect(saved(app).offer).toEqual(offerOf(level, 0, [level]));
    expect(saved(app).progress.stars).toBe(9);
  });

  it.each(["hint", "other level"])("resets the strong streak for a round with %s", (reason) => {
    const app = begin(reason === "hint" ? "explorer" : "hatchling", offerOf("explorer", 2));
    solveMaze({ hint: reason === "hint" }); show(app);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved(app).offer).toEqual(offerOf(reason === "hint" ? "explorer" : "hatchling", reason === "hint" ? 0 : 1));
    expect(saved(app).progress.stars).toBe(3);
    choose("explorer"); fireEvent.click(button("AGAIN")); solveMaze(); show(app);
    expect(saved(app).offer).toEqual(offerOf("explorer", 1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("accepts the offered level for replay, the home tile and reload, leaving the parent's setting alone", () => {
    const app = begin("hatchling", offerOf("hatchling", 2));
    solveMaze(); show(app); dismiss(app, "YES");
    expect(saved(app).offer).toEqual(offerOf("hatchling", 0));
    expect(saved(app).levelChoice).toEqual({ level: "explorer", revision: "parent" });
    expect([...app.settings.items.values()]).toEqual([JSON.stringify({ level: "hatchling", revision: "parent" })]);
    fireEvent.click(button("AGAIN"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("15");
    fireEvent.click(button("HOME")); fireEvent.click(homeTile("LABYRINTH"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("15");
    app.unmount();
    openLabyrinthApp({ storage: app.storage, settings: app.settings });
    fireEvent.click(homeTile("LABYRINTH"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("15");
  });

  it("declines without changing the level, then requires five consecutive strong rounds", () => {
    const app = begin("hatchling", offerOf("hatchling", 2));
    solveMaze(); show(app); dismiss(app, "NOT NOW");
    expect(saved(app).offer).toEqual(offerOf("hatchling", 0, ["hatchling"]));
    expect(saved(app).levelChoice).toBeUndefined();
    for (let round = 1; round <= 5; round++) {
      fireEvent.click(button("AGAIN")); solveMaze(); show(app);
      expect(screen.queryByRole("dialog") !== null).toBe(round === 5);
      expect(saved(app).offer).toEqual(offerOf("hatchling", round === 5 ? 0 : round, ["hatchling"]));
    }
  });

  it("persists an unanswered shown offer as a decline on reload", () => {
    const app = begin("hatchling", offerOf("hatchling", 2));
    solveMaze(); show(app); app.unmount();
    const reopened = openLabyrinthApp({ storage: app.storage, settings: app.settings });
    expect(saved(reopened).offer).toEqual(offerOf("hatchling", 0, ["hatchling"]));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(homeTile("LABYRINTH")); solveMaze(); show(reopened);
    expect(saved(reopened).offer).toEqual(offerOf("hatchling", 1, ["hatchling"]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("carries an offer left before it rises to the next strong round", () => {
    const app = begin("hatchling", offerOf("hatchling", 2));
    solveMaze();
    fireEvent.click(button("HOME"));
    expect(app.timers.timers()).toEqual([]);
    expect(saved(app).offer).toEqual(offerOf("hatchling", 3));
    fireEvent.click(homeTile("LABYRINTH")); solveMaze(); show(app);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("pauses offer arrival and dismissal behind the orientation gate and blocks result actions through its exit", () => {
    const app = begin("hatchling", offerOf("hatchling", 2));
    solveMaze();
    expect(app.timers.timers()).toEqual([900]);
    act(() => app.viewport.turn("portrait"));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(900));
    expect(saved(app).offer).toEqual(offerOf("hatchling", 3));
    act(() => app.viewport.turn("landscape")); show(app);
    const again = screen.getByRole<HTMLButtonElement>("button", { name: "AGAIN", hidden: true });
    expect(again.disabled).toBe(true);
    fireEvent.click(again);
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(1);
    fireEvent.click(button("NOT NOW"));
    expect(again.disabled).toBe(true);
    act(() => app.viewport.turn("portrait"));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(160));
    act(() => app.viewport.turn("landscape"));
    expect(again.disabled).toBe(true);
    act(() => app.timers.fire(160));
    expect(again.disabled).toBe(false);
    expect(document.activeElement).toBe(again);
    fireEvent.click(again);
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(2);
  });

  it("never offers past Paleontologist", () => {
    const app = begin("paleontologist", offerOf("paleontologist", 9));
    solveMaze(); show(app);
    expect(saved(app).offer).toEqual(offerOf("paleontologist", 10));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
