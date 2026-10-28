import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NO_LEVEL_OFFER, type LevelOffer } from "../src/levelOffer.ts";
import { localWhoseJawProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { WhoseJawResultScreen, type JawResult } from "../src/WhoseJawResultScreen.tsx";
import { JAW_TIMING } from "../src/whoseJawGame.tsx";
import { homeTile, manualPictures, memoryStorage, type MemoryStorage } from "./support.ts";
import { withManualPictures } from "./pictures.tsx";
import { JAWS } from "./whoseJaw.ts";
import { openWhoseJawApp } from "./whoseJawApp.tsx";
import { filterTaps, tapAt } from "./taps.ts";

const button = (name: string) => screen.getByRole("button", { name });
const result = () => document.querySelector<HTMLElement>(".whose-jaw-result")!;
const saved = (app: { storage: MemoryStorage }) => localWhoseJawProgress(() => app.storage, JAWS.map(({ id }) => id)).load()!;
const record = (entry: unknown) => memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "whose-jaw": entry } }) });
const offerOf = (level: AgeLevel, strong: number, declined: AgeLevel[] = []): LevelOffer => ({ level, strong, declined });

function begin({ level = "explorer", language = "en", storage = memoryStorage(), reduced = false }:
  { level?: AgeLevel; language?: "en" | "ru"; storage?: MemoryStorage; reduced?: boolean } = {}) {
  const app = openWhoseJawApp({ setting: { level, revision: "parent" }, language, storage, reduced });
  fireEvent.click(homeTile(TEXTS[language].whoseJaw));
  fireEvent.click(button(TEXTS[language].play));
  return app;
}

function finish(app: ReturnType<typeof begin>, errors = 0, language: "en" | "ru" = "en", reduced = false) {
  const ids: string[] = [];
  for (let at = 0; at < 5; at++) {
    act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.entering));
    const id = /jaw-(.+)\.webp/.exec(document.querySelector(".jaw-loose-picture")!.getAttribute("src")!)![1]!;
    ids.push(id);
    const owner = JAWS.find((jaw) => jaw.id === id)!;
    const put = (target: Element) => { fireEvent.click(screen.getByLabelText(TEXTS[language].jawPick)); fireEvent.click(target); };
    // Distribute errors over different questions as well as repeated tries.
    const misses = Math.floor(errors / 5) + (at < errors % 5 ? 1 : 0);
    for (let miss = 0; miss < misses; miss++) {
      const wrong = within(screen.getByRole("group", { name: TEXTS[language].creatures })).getAllByRole("button")
        .find((choice) => choice.getAttribute("aria-label") !== owner.name[language].toLocaleUpperCase(language))!;
      put(wrong);
      act(() => app.timers.fire(reduced ? JAW_TIMING.reducedWrong : JAW_TIMING.wrong));
    }
    put(button(owner.name[language].toLocaleUpperCase(language)));
    act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.right));
  }
  act(() => app.timers.fire(reduced ? JAW_TIMING.reduced : JAW_TIMING.done));
  expect(result()).not.toBeNull();
  return ids;
}

function animationTimes() {
  // This browser spy supplies the remaining CSS reward/exit times to the injected timer.
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: function (this: Element) {
    const endTime = this.classList.contains("pairs-offer-scrim") ? 260
      : this.classList.contains("jaw-result-find") ? 1000
      : this.matches(".jaw-result-jaws li") ? 580
      : this.classList.contains("celebration") ? 700 : 500;
    return [{ currentTime: 100, effect: { getComputedTiming: () => ({ endTime }) } }];
  } });
  onTestFinished(() => { if (descriptor) Object.defineProperty(Element.prototype, "getAnimations", descriptor); else Reflect.deleteProperty(Element.prototype, "getAnimations"); });
}
const showOffer = (app: ReturnType<typeof begin>) => act(() => app.timers.settle());
const answer = (app: ReturnType<typeof begin>, name: string) => { fireEvent.click(button(name)); act(() => app.timers.fire(160)); };

describe("Whose Jaw result and rewards", () => {
  it.each(AGE_LEVELS.flatMap((level) => [0, 1, 2, 7].map((errors) => ({ level, errors }))))("awards the round's stars at $level with $errors errors", ({ level, errors }) => {
    const app = begin({ level });
    const placed = finish(app, errors);
    const stars = errors === 0 ? 3 : errors === 1 ? 2 : 1;
    expect(screen.getByRole("img", { name: TEXTS.en.stars(stars, 3) })).toBeDefined();
    expect(result().querySelectorAll(".star-won")).toHaveLength(stars);
    const pictures = within(screen.getByRole("list", { name: TEXTS.en.jawProgress })).getAllByRole("img");
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual(placed.map((id) => `jaw-${id}.webp`));
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["first-best"].label })).toBeDefined();
    expect(saved(app).best).toEqual(Object.fromEntries(AGE_LEVELS.map((each) => [each, each === level ? stars : null])));
    expect([...saved(app).earned].sort()).toEqual([...placed].sort());
    expect(saved(app).offer).toEqual(offerOf(level, errors <= 1 ? 1 : 0));
  });

  it.each(["en", "ru"] as const)("celebrates only newly collected jaws in %s and routes shelf and home", (language) => {
    const app = begin({ language, storage: record({ earned: [JAWS[0]!.id] }) });
    const placed = finish(app, 0, language);
    const collection = screen.getByRole("region", { name: TEXTS[language].jawCollection });
    expect(within(collection).getByRole("status").textContent).toBe(TEXTS[language].jawNewCollection);
    expect(within(collection).getAllByRole("img").map((image) => image.getAttribute("alt"))).toEqual(placed.slice(1).map((id) => JAWS.find((jaw) => jaw.id === id)!.name[language].toLocaleUpperCase(language)));
    for (const name of [TEXTS[language].playAgain, TEXTS[language].jawShelf, TEXTS[language].home]) expect(button(name).querySelector("svg")).not.toBeNull();
    fireEvent.click(button(TEXTS[language].jawShelf));
    expect(screen.getByRole("heading", { name: TEXTS[language].jawShelf })).toBeDefined();
    expect(document.querySelectorAll(".jaw-shelf-place")).toHaveLength(16);
    expect(Array.from(document.querySelectorAll(".jaw-shelf-place[data-unlocked]")).map((place) => place.getAttribute("aria-label")).sort()).toEqual(placed.map((id) => JAWS.find((jaw) => jaw.id === id)!.name[language].toLocaleUpperCase(language)).sort());
    fireEvent.click(button(TEXTS[language].back)); fireEvent.click(button(TEXTS[language].play));
    finish(app, 1, language);
    expect(screen.queryByRole("region", { name: TEXTS[language].jawCollection })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(saved(app).best.explorer).toBe(3);
    fireEvent.click(button(TEXTS[language].home));
    expect(homeTile(TEXTS[language].whoseJaw).textContent).toContain("5/16");
  });

  it("celebrates a higher best once, preserves other levels and reloads rewards", () => {
    const app = begin({ storage: record({ best: { hatchling: 3, explorer: 1, paleontologist: 2 } }) });
    finish(app, 1);
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label }).textContent).toBe("NEW BEST!");
    expect(result().querySelector(".best-score-beaten")?.textContent).toBe("1");
    expect(saved(app).best).toEqual({ hatchling: 3, explorer: 2, paleontologist: 2 });
    fireEvent.click(button(TEXTS.en.playAgain)); finish(app, 1);
    expect(screen.queryByRole("status")).toBeNull();
    app.unmount();
    openWhoseJawApp({ storage: app.storage });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(screen.getByLabelText(TEXTS.en.bestScore).textContent).toBe("🦷 2");
    expect(screen.getByLabelText(TEXTS.en.jawCollection).textContent).toContain("5 / 16");
  });

  it.each([{ read: false }, { save: false }])("keeps session rewards and first-find status when storage fails: %j", (failure) => {
    const app = begin({ storage: memoryStorage({}, failure) });
    finish(app, 2);
    fireEvent.click(button(TEXTS.en.playAgain)); finish(app);
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label })).toBeDefined();
    expect(screen.queryByRole("region", { name: TEXTS.en.jawCollection })).toBeNull();
  });

  it("saves a successful jaw before leaving an unfinished round without awarding stars", () => {
    const app = begin();
    act(() => app.timers.fire(JAW_TIMING.entering));
    fireEvent.click(screen.getByLabelText(TEXTS.en.jawPick));
    fireEvent.click(button(JAWS[0]!.name.en.toUpperCase()));
    fireEvent.click(button(TEXTS.en.home));
    expect(saved(app).earned).toEqual([JAWS[0]!.id]);
    expect(saved(app).best).toEqual({ hatchling: null, explorer: null, paleontologist: null });
    expect(saved(app).offer).toEqual(NO_LEVEL_OFFER);
  });

  it("starts replay once for a double tap, resets errors and keeps the played level", () => {
    filterTaps();
    const app = begin({ level: "hatchling" }); finish(app, 2);
    tapAt(button(TEXTS.en.playAgain), 1000, { x: 300, y: 300 });
    tapAt(document.querySelector(".whose-jaw-board")!, 1100, { x: 300, y: 300 });
    expect(app.featured.history().timesStarted.get("whoseJaw")).toBe(2);
    finish(app);
    expect(screen.getByRole("img", { name: TEXTS.en.stars(3, 3) })).toBeDefined();
    expect(saved(app).best.hatchling).toBe(3);
  });
});

describe("Whose Jaw next-level offer", () => {
  it.each(["hatchling", "explorer"] as const)("offers after three consecutive strong %s rounds and accepts for replay", (level) => {
    animationTimes();
    const app = begin({ level });
    for (let at = 1; at <= 3; at++) {
      finish(app, at % 2);
      expect(saved(app).offer).toEqual(offerOf(level, at));
      expect(screen.queryByRole("dialog")).toBeNull();
      if (at < 3) fireEvent.click(button(TEXTS.en.playAgain));
    }
    expect(app.timers.timers()).toContain(480);
    showOffer(app);
    const next = level === "hatchling" ? "explorer" : "paleontologist";
    expect(screen.getByRole("dialog", { name: TEXTS.en.levelOffer.question(TEXTS.en.ageLevels[next].name) })).toBeDefined();
    const again = screen.getByRole<HTMLButtonElement>("button", { name: TEXTS.en.playAgain, hidden: true });
    expect(again.disabled).toBe(true);
    fireEvent.click(button("YES"));
    expect(again.disabled).toBe(true);
    act(() => app.timers.fire(160));
    expect(document.activeElement).toBe(again);
    expect(saved(app).levelChoice).toEqual({ level: next, revision: "parent" });
    expect(saved(app).offer).toEqual(offerOf(level, 0));
    expect([...app.settings.items.values()]).toEqual([JSON.stringify({ level, revision: "parent" })]);
    fireEvent.click(again);
    act(() => app.timers.fire(JAW_TIMING.entering));
    expect(within(screen.getByRole("group", { name: TEXTS.en.creatures })).getAllByRole("button")).toHaveLength(next === "explorer" ? 3 : 4);
    fireEvent.click(button(TEXTS.en.home)); app.unmount();
    openWhoseJawApp({ storage: app.storage, setting: { level, revision: "parent" } });
    fireEvent.click(homeTile(TEXTS.en.whoseJaw));
    expect(button(TEXTS.en.ageLevels[next].name).getAttribute("aria-pressed")).toBe("true");
  });

  it("declines and then requires five strong rounds, persisting an unanswered shown offer", () => {
    animationTimes();
    const app = begin({ level: "hatchling", storage: record({ offer: offerOf("hatchling", 2) }) });
    finish(app); showOffer(app); answer(app, "NOT NOW");
    expect(saved(app).offer).toEqual(offerOf("hatchling", 0, ["hatchling"]));
    expect(saved(app).levelChoice).toBeUndefined();
    for (let at = 1; at <= 5; at++) {
      fireEvent.click(button(TEXTS.en.playAgain)); finish(app); showOffer(app);
      expect(screen.queryByRole("dialog") !== null).toBe(at === 5);
    }
    app.unmount();
    openWhoseJawApp({ storage: app.storage });
    expect(saved(app).offer).toEqual(offerOf("hatchling", 0, ["hatchling"]));
  });

  it.each(["errors", "other level", "top level"])("clears or suppresses offers for %s", (reason) => {
    animationTimes();
    const level = reason === "other level" ? "hatchling" : reason === "top level" ? "paleontologist" : "explorer";
    const app = begin({ level, storage: record({ offer: offerOf(reason === "top level" ? "paleontologist" : "explorer", 2) }) });
    finish(app, reason === "errors" ? 2 : 0); showOffer(app);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved(app).offer.strong).toBe(reason === "errors" ? 0 : reason === "other level" ? 1 : 3);
  });

  it("cancels a result wait on leaving, ignores its late callback and offers on the next strong round", () => {
    animationTimes();
    const app = begin({ storage: record({ offer: offerOf("explorer", 2) }) });
    finish(app);
    fireEvent.click(button(TEXTS.en.jawShelf));
    act(() => app.timers.deliverStopped(900));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved(app).offer).toEqual(offerOf("explorer", 3));
    fireEvent.click(button(TEXTS.en.back)); fireEvent.click(button(TEXTS.en.play)); finish(app); showOffer(app);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("pauses offer arrival and dismissal behind the orientation gate and blocks controls through exit", () => {
    animationTimes();
    const app = begin({ storage: record({ offer: offerOf("explorer", 2) }) });
    finish(app);
    expect(app.timers.timers()).toEqual([900]);
    act(() => app.viewport.turn("portrait"));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(900));
    expect(saved(app).offer).toEqual(offerOf("explorer", 3));
    act(() => app.viewport.turn("landscape")); showOffer(app);
    const again = screen.getByRole<HTMLButtonElement>("button", { name: TEXTS.en.playAgain, hidden: true });
    fireEvent.click(again);
    expect(app.featured.history().timesStarted.get("whoseJaw")).toBe(1);
    fireEvent.click(button("NOT NOW"));
    act(() => app.viewport.turn("portrait"));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.deliverStopped(160));
    act(() => app.viewport.turn("landscape"));
    expect(again.disabled).toBe(true);
    act(() => app.timers.fire(160));
    expect(again.disabled).toBe(false);
    expect(document.activeElement).toBe(again);
  });

  it("completes and rewards a reduced-motion round with the same scoring", () => {
    const app = begin({ reduced: true });
    finish(app, 1, "en", true);
    expect(screen.getByRole("img", { name: TEXTS.en.stars(2, 3) })).toBeDefined();
    expect(saved(app).best.explorer).toBe(2);
  });
});

it.each(["loading", "failed"])("keeps %s result pictures named and navigation usable", (state) => {
  const pictures = manualPictures();
  const finds: JawResult = { stars: 2, best: 2, beaten: undefined, celebration: null, jaws: JAWS.slice(0, 5).map((jaw) => ({ id: jaw.id, name: jaw.name, picture: `jaw-${jaw.id}.webp`, newly: false })) };
  let home = 0;
  render(<WhoseJawResultScreen language="ru" result={finds} onPlayAgain={() => {}} onShelf={() => {}} onHome={() => { home++; }} />, withManualPictures(pictures));
  if (state === "failed") act(() => { for (const jaw of finds.jaws) pictures.fail(jaw.picture); });
  expect(within(screen.getByRole("list")).getAllByRole("img").every((image) => image.getAttribute("data-picture") === state)).toBe(true);
  expect(screen.getByRole("img", { name: JAWS[0]!.name.ru.toUpperCase() })).toBeDefined();
  fireEvent.click(button(TEXTS.ru.home));
  expect(home).toBe(1);
});
