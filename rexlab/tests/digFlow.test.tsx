import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { GUST, STAR_LANDS } from "../src/digGame.tsx";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { TEXTS } from "../src/language/texts.ts";
import { brushAll, openDigApp, placeBoard } from "./digApp.tsx";
import { SHIPPED_DIG, homeTile, memoryStorage } from "./support.ts";

function reveal({ reducedMotion = false, storage = memoryStorage(), ageLevel }: { reducedMotion?: boolean; storage?: ReturnType<typeof memoryStorage>; ageLevel?: AgeLevel } = {}) {
  const app = openDigApp({ storage, reducedMotion, ...(ageLevel && { ageLevel: { level: ageLevel, revision: "parent" } }) });
  fireEvent.click(homeTile("DIG"));
  placeBoard(800);
  const startedLevel = document.querySelector(".dig-board")?.getAttribute("data-level");
  brushAll();
  // Paleontologist finishes by naming the dinosaur after uncovering its clues.
  if (ageLevel === "paleontologist") {
    const picture = document.querySelector(".dig-board img")?.getAttribute("src");
    const choice = [...document.querySelectorAll<HTMLButtonElement>(".dig-choice-card")].find((card) => card.querySelector("img")?.getAttribute("src") === picture);
    if (!choice) throw new Error("No matching dinosaur choice");
    fireEvent.click(choice);
  }
  act(() => app.timers.fire(reducedMotion ? GUST.reduced : GUST.motion));
  return { ...app, storage, startedLevel };
}

function land(app: ReturnType<typeof reveal>, reducedMotion = false) {
  act(() => app.timers.fire(reducedMotion ? STAR_LANDS.reduced : STAR_LANDS.motion));
}

const card = () => screen.getByRole("region", { name: TEXTS.en.dugUp });
const levelButton = (level: AgeLevel) => within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels[level].name });

describe("dig reveals through the app", () => {
  it("shows the dinosaur, first best reward, flying-star timing, and the DIG title", () => {
    const app = reveal();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("DIG");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(card().textContent).toContain(`1/${SHIPPED_DIG.length}`);
    expect(screen.getByRole("status", { name: "FIRST BEST SCORE" })).toBeDefined();
    expect(card().querySelector(".dig-card-new")?.textContent).toBe("NEW!");
    expect(app.timers.timers()).toEqual([STAR_LANDS.motion]);
    expect((screen.getByRole("button", { name: "DIG AGAIN" }) as HTMLButtonElement).disabled).toBe(true);

    land(app);
    expect((screen.getByRole("button", { name: "DIG AGAIN" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not award a second star or celebration for a dinosaur already dug up", () => {
    const dug = SHIPPED_DIG.map(({ id }) => id);
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug, badges: [] } } }) });
    const app = reveal({ storage });

    expect(card().textContent).toContain(`${SHIPPED_DIG.length}/${SHIPPED_DIG.length}`);
    expect(card().querySelector(".dig-card-new")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    land(app);
  });

  it("shows the trophy at a complete collection and keeps it on a later reveal", () => {
    const allButLast = SHIPPED_DIG.slice(0, -1).map(({ id }) => id);
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: allButLast, badges: [] } } }) });
    const app = reveal({ storage });

    expect(card().textContent).toContain(`${SHIPPED_DIG.length}/${SHIPPED_DIG.length}`);
    expect(screen.getByRole("img", { name: TEXTS.en.allDugUp })).toBeDefined();
    land(app);
    fireEvent.click(screen.getByRole("button", { name: "DIG AGAIN" }));
    placeBoard(800);
    brushAll();
    act(() => app.timers.fire(GUST.motion));
    act(() => app.timers.fire(STAR_LANDS.motion));
    expect(screen.getByRole("img", { name: TEXTS.en.allDugUp })).toBeDefined();
    expect(screen.getByRole("region", { name: TEXTS.en.dugUp }).textContent).toContain(`${SHIPPED_DIG.length}/${SHIPPED_DIG.length}`);
  });

  it("keeps reveal controls inert until the star lands, then HOME returns to the count tile", () => {
    const app = reveal();
    fireEvent.click(levelButton("paleontologist"));
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(screen.getByRole("region", { name: TEXTS.en.dugUp })).toBeDefined();
    expect(levelButton("paleontologist").getAttribute("aria-pressed")).toBe("false");

    land(app);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(screen.getByRole("button", { name: "DIG" }).querySelector(".dig-tile-count")?.textContent).toBe("1");
  });

  it.each(
    (["gust", "flight", "landed"] as const).flatMap((rotation) =>
      [false, true].flatMap((reducedMotion) => ["DIG AGAIN", "HOME"].map((action) => ({ rotation, reducedMotion, action })))
    )
  )("waits for the displayed star after rotating during $rotation, reduced motion $reducedMotion, then accepts $action", ({ rotation, reducedMotion, action }) => {
    const app = openDigApp({ reducedMotion });
    const timing = reducedMotion ? "reduced" : "motion";
    fireEvent.click(homeTile("DIG"));
    placeBoard(800);
    brushAll();
    if (rotation !== "gust") act(() => app.timers.fire(GUST[timing]));
    if (rotation === "landed") act(() => app.timers.fire(STAR_LANDS[timing]));

    act(() => app.orientation.turn("portrait"));
    if (rotation === "gust") act(() => app.timers.fire(GUST[timing]));
    expect(app.timers.timers()).toEqual([]);
    act(() => app.timers.fire(STAR_LANDS[timing]));
    act(() => app.orientation.turn("landscape"));
    expect(app.timers.timers()).toEqual([STAR_LANDS[timing]]);
    act(() => app.timers.deliverStopped(STAR_LANDS[timing]));

    fireEvent.click(levelButton("paleontologist"));
    fireEvent.click(screen.getByRole("button", { name: "DIG AGAIN" }));
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(levelButton("explorer").getAttribute("aria-pressed")).toBe("true");
    expect(app.featured.history().timesStarted.get("dig")).toBe(1);

    act(() => app.timers.fire(STAR_LANDS[timing]));
    fireEvent.click(levelButton("paleontologist"));
    expect(levelButton("paleontologist").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: action }));
    if (action === "DIG AGAIN") {
      expect(document.querySelector(".dig-board")?.getAttribute("data-level")).toBe("paleontologist");
      expect(app.featured.history().timesStarted.get("dig")).toBe(2);
    } else {
      expect(homeTile("DIG").querySelector(".dig-tile-count")?.textContent).toBe("1");
    }
  });

  it.each(AGE_LEVELS)("starts the first round at the parent age level %s and marks it on the reveal", (level) => {
    const app = reveal({ ageLevel: level });
    expect(app.startedLevel).toBe(level);
    land(app);
    expect(levelButton(level).getAttribute("aria-pressed")).toBe("true");
  });

  it("starts DIG AGAIN at the level chosen on the reveal and keeps that choice for the tile", () => {
    const app = reveal({ ageLevel: "hatchling" });
    land(app);
    fireEvent.click(levelButton("explorer"));
    expect(screen.getByRole("button", { name: TEXTS.en.ageLevels.explorer.name }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.digAgain }));
    expect(document.querySelector(".dig-board")?.getAttribute("data-level")).toBe("explorer");
  });

  it.each([
    ["never used the switch", {}, "explorer"],
    [
      "a saved choice of Hatchling",
      { [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], levelChoice: { level: "hatchling", revision: null } } } }) },
      "hatchling"
    ]
  ] as const)("holds a choice that cannot be saved while the app is open, having %s, and reloads to the saved level", (_, items, reloadedLevel) => {
    const storage = memoryStorage({ ...items }, { save: false });
    const app = reveal({ storage });
    land(app);
    fireEvent.click(levelButton("paleontologist"));
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    fireEvent.click(homeTile("DIG"));
    expect(document.querySelector(".dig-board")?.getAttribute("data-level")).toBe("paleontologist");
    app.unmount();

    const reloaded = openDigApp({ storage });
    fireEvent.click(homeTile("DIG"));
    expect(document.querySelector(".dig-board")?.getAttribute("data-level")).toBe(reloadedLevel);
    reloaded.unmount();
  });

  it("uses reduced-motion fade timings for the gust and reward", () => {
    const app = reveal({ reducedMotion: true });
    expect(app.timers.timers()).toEqual([STAR_LANDS.reduced]);
    const star = card().querySelector(".dig-card-star");
    expect(star && getComputedStyle(star).animation).toContain("dig-star-flies");
    land(app, true);
  });
});

const stored = (storage: ReturnType<typeof memoryStorage>) => JSON.parse(storage.items.get(PROGRESS_KEY) ?? "null");
const record = (dig: object, others: object = {}) => ({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { ...others, dig } }) });
const fourOthers = SHIPPED_DIG.map(({ id }) => id).filter((id) => id !== "tyrannosaurus").slice(0, 4);
const boardLevel = () => document.querySelector(".dig-board")?.getAttribute("data-level");
const tileCount = () => homeTile("DIG").querySelector(".dig-tile-count")?.textContent;

describe("dig progress through the app", () => {
  it("records a finished round, and a new dinosaur is a new best", () => {
    const storage = memoryStorage(record({ dug: fourOthers, badges: [] }));
    const app = reveal({ storage });

    expect(card().textContent).toContain(`5/${SHIPPED_DIG.length}`);
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label })).toBeDefined();
    expect(stored(storage).games.dig.dug).toEqual(expect.arrayContaining([...fourOthers, "tyrannosaurus"]));
    expect(stored(storage).games.dig.dug).toHaveLength(5);
    land(app);
  });

  it("keeps every other game's progress as it was", () => {
    const others = {
      "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 },
      "dinosaur-care": { bestScore: 8, visitsFinished: 2, friends: ["stegosaurus"] },
      "find-the-pair": { stars: 20, level: 1, boardsOnLevel: 1, best: {}, found: ["stegosaurus"] },
      "sort-dinosaurs": { bestScore: 5, roundsPlayed: 2 },
      "skeleton-assembly": { bestScore: 1, earned: ["stegosaurus"], rebuilding: [] }
    };
    const storage = memoryStorage(record({ dug: [], badges: [] }, others));
    reveal({ storage });

    const { dig, "home-featured": featured, ...rest } = stored(storage).games;
    // Starting a round saves its start beside the game progress.
    expect([rest, dig.dug, featured.starts]).toEqual([others, ["tyrannosaurus"], { dig: 1 }]);
  });

  it.each([
    ["unreadable", "{"],
    ["from an unknown schema version", JSON.stringify({ schemaVersion: 99, games: { dig: { dug: fourOthers, badges: [] } } })]
  ])("counts stored progress %s as none, and replaces it with a readable record", (_, raw) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: raw });
    reveal({ storage });

    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["first-best"].label })).toBeDefined();
    expect(card().textContent).toContain(`1/${SHIPPED_DIG.length}`);
    expect(stored(storage)).toEqual(expect.objectContaining({ schemaVersion: 1, games: expect.objectContaining({ dig: expect.objectContaining({ dug: ["tyrannosaurus"] }) }) }));
  });

  it("celebrates a dinosaur it cannot save and counts it while the app is open, but not after reloading", () => {
    const storage = memoryStorage(record({ dug: fourOthers, badges: [] }), { save: false });
    const app = reveal({ storage });
    expect(card().textContent).toContain(`5/${SHIPPED_DIG.length}`);
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label })).toBeDefined();
    land(app);
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    expect(tileCount()).toBe("5");
    app.unmount();

    openDigApp({ storage });
    expect(tileCount()).toBe("4");
  });

  it("names the dinosaur with no count and no celebration when storage cannot be read", () => {
    reveal({ storage: memoryStorage({}, { read: false }) });

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(screen.queryByRole("region", { name: TEXTS.en.dugUp })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the dig reveal's level switch", () => {
  it("shows the three levels youngest first, with their pictures, the chosen one marked", () => {
    land(reveal({ ageLevel: "explorer" }));

    const levels = within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getAllByRole("button");
    expect(levels.map((level) => level.textContent)).toEqual(["🥚HATCHLING", "🦖EXPLORER", "🦴PALEONTOLOGIST"]);
    expect(levels.map((level) => level.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(document.querySelector(".level-switch-mark")).not.toBeNull();
  });

  it("stays on the reveal when a level is chosen, and starts nothing until DIG AGAIN", () => {
    const app = reveal();
    land(app);
    fireEvent.click(levelButton("paleontologist"));

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("TYRANNOSAURUS");
    expect(card().textContent).toContain(`1/${SHIPPED_DIG.length}`);
    expect(document.querySelector(".dig-board")).toBeNull();
    expect(levelButton("paleontologist").getAttribute("aria-pressed")).toBe("true");
  });

  it("plays the chosen level from the tile too", () => {
    const app = reveal({ ageLevel: "hatchling" });
    land(app);
    fireEvent.click(levelButton("explorer"));
    fireEvent.click(screen.getByRole("button", { name: "HOME" }));
    fireEvent.click(homeTile("DIG"));
    expect(boardLevel()).toBe("explorer");
  });

  it("remembers the child's choice across a reload until a parent picks a level", () => {
    const storage = memoryStorage();
    const first = openDigApp({ storage, ageLevel: { level: "explorer", revision: "a" } });
    fireEvent.click(homeTile("DIG"));
    placeBoard(800);
    brushAll();
    act(() => first.timers.fire(GUST.motion));
    act(() => first.timers.fire(STAR_LANDS.motion));
    fireEvent.click(levelButton("hatchling"));
    first.unmount();

    const reopened = openDigApp({ storage, ageLevel: { level: "explorer", revision: "a" } });
    fireEvent.click(homeTile("DIG"));
    expect(boardLevel()).toBe("hatchling");
    reopened.unmount();

    openDigApp({ storage, ageLevel: { level: "paleontologist", revision: "b" } });
    fireEvent.click(homeTile("DIG"));
    expect(boardLevel()).toBe("paleontologist");
  });

  it("moves its mark with the shared motion tokens, which shorten under reduced motion", () => {
    land(reveal());
    expect(getComputedStyle(document.querySelector(".level-switch-mark") as Element).transition).toBe("translate var(--motion-standard) var(--ease-out)");
  });
});
