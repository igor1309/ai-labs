import { NO_LEVEL_OFFER } from "../src/levelOffer.ts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localPairsProgress, localProgress } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { dealt, endWave, namesOf, openPairsApp, pairCards, pairsRecord, playDealt, playPairs, storedPairs, type StoredPairs } from "./pairsApp.tsx";
import { SHIPPED_PALS, homeTile, manualTimers, memoryStorage, symbolOf } from "./support.ts";

// find-the-pair-progress.feature at every age level, and the full flow
// of find-the-pair-level-progress.feature.
const button = (name: string) => screen.getByRole("button", { name });
const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
const bestShown = () => screen.queryByLabelText("BEST SCORE")?.textContent ?? null;
const entry = (progress: Partial<StoredPairs> = {}): StoredPairs => ({ stars: 0, level: 1, boardsOnLevel: 0, best: {}, found: [], ...progress });
const picked = (level: AgeLevel) => ({ level, revision: `picked-${level}` });
const ordered = (ids: readonly string[]) => SHIPPED_PALS.filter(({ id }) => ids.includes(id)).map(({ id }) => id);

// The catalogue marks no dinosaur found, by a count or a stamp: the
// found are kept in storage only.
function expectCatalogueUnmarked() {
  screen.getByRole("group", { name: "ALL DINOSAURS" });
  expect(screen.queryAllByLabelText("FOUND")).toEqual([]);
}

describe.each(AGE_LEVELS)("progress while playing %s", (level) => {
  const board = dealt(level === "hatchling" ? 1 : { large: level });
  const names = namesOf(board);
  const ids = board.pals.map(({ id }) => id);
  const played = level === "hatchling" ? 1 : level;

  it("earns one star on the result and home tile, and keeps its found dinosaurs after reopening", async () => {
    const storage = memoryStorage();
    const app = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    await playPairs(app.user);
    await playDealt(app.user, app.clock, names);
    endWave(app.clock);

    expect(screen.getByLabelText("STARS").textContent).toBe("★1");
    expect(storedPairs(storage)).toEqual(entry({ stars: 1, boardsOnLevel: level === "hatchling" ? 1 : 0, best: { [played]: ids.length }, found: ordered(ids), offer: { level, strong: level === "hatchling" ? 0 : 1, declined: [] } }));
    await app.user.click(button("HOME"));
    const tile = homeTile("FIND THE PAIR").querySelector(".pairs-tile-stars");
    expect(tile && [tile.textContent, symbolOf(tile)]).toEqual(["1", "star"]);
    app.unmount();

    const reopened = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    await reopened.user.click(button("FIND THE PAIR"));
    expect(screen.getByLabelText("STARS").textContent).toBe("1");
    await reopened.user.click(button("HOME"));
    await reopened.user.click(button("ALL DINOSAURS"));
    expectCatalogueUnmarked();
  });

  it("restores the saved stars, climb and bests, and found dinosaurs", async () => {
    const saved = entry({ stars: 5, level: 3, best: { 2: 6 }, found: ["triceratops"] });
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(saved) });
    const first = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    first.unmount();
    const app = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    await app.user.click(button("FIND THE PAIR"));

    expect(screen.getByLabelText("STARS").textContent).toBe("5");
    await app.user.click(button("HATCHLING"));
    expect(screen.getByLabelText("LEVEL").textContent).toBe("3");
    expect(localPairsProgress(() => storage).load()?.progress.best).toEqual({ 2: 6 });
    await app.user.click(button("HOME"));
    await app.user.click(button("ALL DINOSAURS"));
    expectCatalogueUnmarked();
  });

  it("preserves the other games and settings, and their saves preserve its progress and choice", async () => {
    const quiz = { bestScore: 7, roundsPlayed: 3 };
    const care = { bestScore: 6, visitsFinished: 2, friends: ["triceratops"] };
    const setting = JSON.stringify(picked("explorer"));
    const storage = memoryStorage({
      [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": quiz, "dinosaur-care": care } }),
      [LANGUAGE_KEY]: "en", [THEME_KEY]: "dark", [AGE_LEVEL_KEY]: setting
    });
    const app = openPairsApp({ storage, settingsStorage: storage, clock: manualTimers(), random: () => 0 });
    await playPairs(app.user, level.toUpperCase());
    await playDealt(app.user, app.clock, names);
    endWave(app.clock);
    const saved = storedPairs(storage);
    app.unmount();
    const reopened = openPairsApp({ storage, settingsStorage: storage, clock: manualTimers(), random: () => 0 });
    await reopened.user.click(button("FIND THE PAIR"));

    expect([storage.items.get(LANGUAGE_KEY), storage.items.get(THEME_KEY), storage.items.get(AGE_LEVEL_KEY)]).toEqual(["en", "dark", setting]);
    expect(localProgress(() => storage).load()).toEqual(quiz);
    expect(localCareProgress(() => storage).load()).toEqual(care);
    localProgress(() => storage).save({ bestScore: 10, roundsPlayed: 5 });
    localCareProgress(() => storage).save({ ...care, visitsFinished: 3 });
    expect(storedPairs(storage)).toEqual(saved);
    expect(saved).toMatchObject({ stars: 1, best: { [played]: ids.length }, found: ordered(ids) });
  });

  it.each(["absent", "malformed", "unknown schema"] as const)("starts afresh with %s progress and saves a readable first best", async (state) => {
    const quiz = { bestScore: 7, roundsPlayed: 3 };
    const games = { "compare-dinosaurs": quiz };
    const raw = state === "absent" ? JSON.stringify({ schemaVersion: 1, games })
      : state === "malformed" ? pairsRecord({ stars: "5", level: 9, best: [], found: "triceratops" }, games)
      : JSON.stringify({ schemaVersion: 2, games: { ...games, "find-the-pair": entry({ stars: 5 }) } });
    const storage = memoryStorage({ [PROGRESS_KEY]: raw });
    const app = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    await app.user.click(button("FIND THE PAIR"));

    expect(within(screen.getByRole("group", { name: "AGE LEVEL" })).getByRole("button", { pressed: true }).textContent).toContain(level.toUpperCase());
    expect(screen.getByLabelText("STARS").textContent).toBe("0");
    expect(localPairsProgress(() => storage).load()).toEqual({ progress: { stars: 0, climbLevel: 1, boardsOnClimbLevel: 0, best: {}, found: [] }, levelChoice: undefined, offer: NO_LEVEL_OFFER });
    await app.user.click(button("PLAY"));
    await playDealt(app.user, app.clock, names, 1);
    endWave(app.clock);

    expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
    expect(localPairsProgress(() => storage).load()).toEqual({ progress: { stars: 1, climbLevel: 1, boardsOnClimbLevel: level === "hatchling" ? 1 : 0, best: { [played]: ids.length + 1 }, found: ordered(ids) }, levelChoice: undefined, offer: { level, strong: level === "hatchling" ? 0 : 1, declined: [] } });
    expect(localProgress(() => storage).load()).toEqual(state === "unknown schema" ? { bestScore: null, roundsPlayed: 0 } : quiz);
  });

  it("keeps the earned dinosaurs and star in memory when storage cannot be read, without a best", async () => {
    const raw = pairsRecord(entry({ stars: 3, best: { [played]: ids.length + 4 } }));
    const storage = memoryStorage({ [PROGRESS_KEY]: raw }, { read: false });
    const app = openPairsApp({ storage, ageLevel: picked("explorer"), clock: manualTimers(), random: () => 0 });
    await playPairs(app.user, level.toUpperCase());
    await playDealt(app.user, app.clock, names, 3);
    endWave(app.clock);

    expect([screen.getByLabelText("TRIES").textContent, screen.getByLabelText("STARS").textContent, bestShown(), celebrations()]).toEqual([String(ids.length + 3), "★1", null, []]);
    await app.user.click(button("HOME"));
    expect(homeTile("FIND THE PAIR").querySelector(".pairs-tile-stars")?.textContent).toBe("1");
    await app.user.click(button("ALL DINOSAURS"));
    expectCatalogueUnmarked();
    expect(storage.items.get(PROGRESS_KEY)).toBe(raw);
  });

  it("keeps an unsaved board's best, star, climb and dinosaurs in memory, restoring only saved progress on reload", async () => {
    const saved = entry({ stars: 2, best: { [played]: ids.length + 2 } });
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(saved) }, { save: false });
    const app = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    await playPairs(app.user);
    await playDealt(app.user, app.clock, names, 1);
    endWave(app.clock);

    expect([celebrations(), bestShown()]).toEqual([["NEW BEST SCORE"], `BEST${ids.length + 2}${ids.length + 1}`]);
    await app.user.click(button("HOME"));
    await app.user.click(button("ALL DINOSAURS"));
    expectCatalogueUnmarked();
    await app.user.click(button("HOME"));
    await app.user.click(button("FIND THE PAIR"));
    expect(screen.getByLabelText("STARS").textContent).toBe("3");
    await app.user.click(button("PLAY"));
    const next = dealt(level === "hatchling" ? 1 : { large: level }, { previous: board });
    await playDealt(app.user, app.clock, namesOf(next), 2);
    endWave(app.clock);
    expect(bestShown()).toBe(`BEST${ids.length + 1}`);
    expect(celebrations()).toEqual(level === "hatchling" ? ["NEW LEVEL 2"] : []);
    app.unmount();

    const reopened = openPairsApp({ storage, ageLevel: picked(level), clock: manualTimers(), random: () => 0 });
    await reopened.user.click(button("FIND THE PAIR"));
    expect(screen.getByLabelText("STARS").textContent).toBe("2");
    await reopened.user.click(button("HOME"));
    await reopened.user.click(button("ALL DINOSAURS"));
    expectCatalogueUnmarked();
    expect(storedPairs(storage)).toEqual(saved);
  });
});

describe("the level's progress across screens", () => {
  it.each(["explorer", "paleontologist"] as const)("PLAY AGAIN keeps %s chosen on the switch", async (level) => {
    const app = openPairsApp({ ageLevel: picked("hatchling"), clock: manualTimers(), random: () => 0 });
    await playPairs(app.user, level.toUpperCase());
    const first = dealt({ large: level });
    await playDealt(app.user, app.clock, namesOf(first));
    endWave(app.clock);
    await app.user.click(button("PLAY AGAIN"));

    expect(pairCards()).toHaveLength(level === "explorer" ? 18 : 24);
    expect(screen.queryByLabelText("LEVEL")).toBeNull();
    await playDealt(app.user, app.clock, namesOf(dealt({ large: level }, { previous: first })));
    endWave(app.clock);
    expect(storedPairs(app.storage)).toMatchObject({ stars: 2, level: 1, boardsOnLevel: 0, best: { [level]: first.pals.length }, levelChoice: { level, revision: "picked-hatchling" } });
  });

  it.each([
    ["explorer", 12, "NEW BEST SCORE", 12],
    ["explorer", 16, null, 14],
    ["paleontologist", 20, "FIRST BEST SCORE", 20]
  ] as const)("keeps other levels' bests when %s finishes in %i tries", async (level, tries, celebration, best) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(entry({ level: 4, best: { 4: 8, explorer: 14 } })) });
    const app = openPairsApp({ storage, clock: manualTimers(), random: () => 0 });
    await playPairs(app.user, level.toUpperCase());
    const board = dealt({ large: level });
    await playDealt(app.user, app.clock, namesOf(board), tries - board.pals.length);
    endWave(app.clock);

    expect(screen.getByLabelText("TRIES").textContent).toBe(String(tries));
    expect(celebrations()).toEqual(celebration ? [celebration] : []);
    expect(bestShown()).toBe(`BEST${celebration === "NEW BEST SCORE" ? 14 : ""}${best}`);
    expect(storedPairs(storage)).toMatchObject({ best: { 4: 8, explorer: 14, [level]: best } });
    app.unmount();
    const reopened = openPairsApp({ storage, clock: manualTimers(), random: () => 0 });
    await reopened.user.click(button("FIND THE PAIR"));
    expect(localPairsProgress(() => storage).load()?.progress.best).toEqual({ 4: 8, explorer: 14, [level]: best });
  });

  it("leaves Hatchling's climb at level 2 after two Explorer boards, then climbs on at Hatchling", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(entry({ level: 2, boardsOnLevel: 1 })) });
    const app = openPairsApp({ storage, clock: manualTimers(), random: () => 0 });
    await playPairs(app.user, "EXPLORER");
    let previous = dealt({ large: "explorer" });
    for (let round = 0; round < 2; round++) {
      if (round > 0) {
        await app.user.click(button("PLAY AGAIN"));
        previous = dealt({ large: "explorer" }, { previous });
      }
      await playDealt(app.user, app.clock, namesOf(previous));
      endWave(app.clock);
      expect(celebrations().filter((name) => name?.startsWith("NEW LEVEL"))).toEqual([]);
      expect(storedPairs(storage)).toMatchObject({ level: 2, boardsOnLevel: 1 });
    }
    await app.user.click(button("HOME"));
    await playPairs(app.user, "HATCHLING");
    await playDealt(app.user, app.clock, namesOf(dealt(2, { previous })));
    endWave(app.clock);
    expect(celebrations()).toContain("NEW LEVEL 3");
    expect(storedPairs(storage)).toMatchObject({ level: 3, boardsOnLevel: 0 });
  });

  it("reads legacy progress as Hatchling's without a choice or large-level best, then continues the saved climb", async () => {
    const saved = entry({ stars: 5, level: 2, boardsOnLevel: 1, best: { 1: 5, 2: 6, 3: 7, 4: 8 }, found: ["triceratops"] });
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(saved) });
    const app = openPairsApp({ storage, ageLevel: picked("explorer"), clock: manualTimers(), random: () => 0 });
    await app.user.click(button("FIND THE PAIR"));

    expect(localPairsProgress(() => storage).load()).toEqual({ progress: { stars: 5, climbLevel: 2, boardsOnClimbLevel: 1, best: saved.best, found: saved.found }, levelChoice: undefined, offer: NO_LEVEL_OFFER });
    expect(storedPairs(storage)).toEqual(saved);
    await app.user.click(button("HOME"));
    await app.user.click(button("ALL DINOSAURS"));
    expectCatalogueUnmarked();
    await app.user.click(button("HOME"));
    await playPairs(app.user, "HATCHLING");
    expect(screen.getByLabelText("LEVEL").textContent).toBe("2");
    const board = dealt(2);
    await playDealt(app.user, app.clock, namesOf(board));
    endWave(app.clock);

    expect(celebrations()).toContain("NEW LEVEL 3");
    expect(storedPairs(storage)).toEqual(entry({ stars: 6, level: 3, best: { ...saved.best, 2: 4 }, found: ordered([...saved.found, ...board.pals.map(({ id }) => id)]), levelChoice: { level: "hatchling", revision: "picked-explorer" }, offer: { level: "hatchling", strong: 0, declined: [] } }));
  });
});
