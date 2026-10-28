import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLabyrinthProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { clickTwice, mazeBoard, mazeLayout, mazeRoute, openLabyrinthApp, solveMaze } from "./labyrinthApp.tsx";
import { fakeBodyPicture, featuredCard, homeTile, memoryStorage } from "./support.ts";

const button = (name: string) => screen.getByRole("button", { name });
const chosen = (level: AgeLevel) => within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels[level].name });
const saved = (app: ReturnType<typeof openLabyrinthApp>) => localLabyrinthProgress(() => app.storage).load()!;
const total = () => document.querySelector(".labyrinth-reward")?.textContent;

describe("labyrinth through the app", () => {
  it.each(["tile", "featured"] as const)("opens directly from the %s, counts duplicate starts once, and leaves unfinished rounds unrewarded", (door) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "home-featured": { starts: {}, featured: { day: "2026-10-28", game: door === "tile" ? "compare" : "labyrinth" } } } }) });
    const app = openLabyrinthApp({ storage });
    clickTwice(door === "tile" ? homeTile("LABYRINTH") : featuredCard());
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("15");
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(1);
    const first = mazeLayout();
    fireEvent.click(mazeBoard().children[mazeRoute()[1]!]!);
    fireEvent.click(button("HOME"));
    expect(saved(app).progress).toEqual({ stars: 0, roundsPlayed: 0, best: { hatchling: null, explorer: null, paleontologist: null } });
    clickTwice(door === "tile" ? homeTile("LABYRINTH") : featuredCard());
    expect(mazeLayout()).not.toBe(first);
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(2);
    app.unmount();
    openLabyrinthApp({ storage });
    expect(document.querySelector(".labyrinth-maze")).toBeNull();
    expect(screen.getByRole("main").classList.contains("home")).toBe(true);
  });

  it.each(AGE_LEVELS)("rewards %s once, including hints and backtracking, and a tied replay still earns three stars", (level) => {
    const app = openLabyrinthApp({ ageLevel: { level, revision: "parent" } });
    fireEvent.click(homeTile("LABYRINTH"));
    const first = mazeLayout();
    solveMaze({ hint: true, backtrack: true });
    expect(screen.getByRole("heading", { name: "HOME TOGETHER!" })).toBeDefined();
    expect(screen.getByRole("img", { name: TEXTS.en.stars(3, 3) }).children).toHaveLength(3);
    expect(screen.getByRole("status", { name: "FIRST BEST SCORE" })).toBeDefined();
    expect(total()).toBe("+3 STARS · TOTAL 3");
    expect(saved(app).progress).toEqual({ stars: 3, roundsPlayed: 1, best: { hatchling: null, explorer: null, paleontologist: null, [level]: 3 } });
    clickTwice(button("AGAIN"));
    expect(mazeLayout()).not.toBe(first);
    expect(mazeBoard().querySelector("[data-hint]")).toBeNull();
    const baby = mazeBoard().querySelector<HTMLElement>(".labyrinth-baby")!;
    expect([baby.style.getPropertyValue("--step-x"), baby.style.getPropertyValue("--step-y")]).toEqual(["0", "0"]);
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(2);
    solveMaze();
    expect(total()).toBe("+3 STARS · TOTAL 6");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("img", { name: TEXTS.en.stars(3, 3) }).children).toHaveLength(3);
    expect(saved(app).progress.roundsPlayed).toBe(2);
    clickTwice(button("AGAIN"));
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(3);
    fireEvent.click(button("HOME"));
    expect(homeTile("LABYRINTH").querySelector(".labyrinth-tile-best")?.textContent).toBe("6");
    expect(saved(app).progress.roundsPlayed).toBe(2);
  });

  it("keeps bests per played level and remembers the result choice until a global revision changes", () => {
    const app = openLabyrinthApp();
    fireEvent.click(homeTile("LABYRINTH"));
    solveMaze();
    fireEvent.click(chosen("hatchling"));
    expect(saved(app).progress.best).toEqual({ hatchling: null, explorer: 3, paleontologist: null });
    expect(app.featured.history().timesStarted.get("labyrinth")).toBe(1);
    fireEvent.click(button("AGAIN"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("9");
    solveMaze();
    expect(screen.getByRole("status", { name: "FIRST BEST SCORE" })).toBeDefined();
    expect(saved(app).progress).toEqual({ stars: 6, roundsPlayed: 2, best: { hatchling: 3, explorer: 3, paleontologist: null } });
    app.unmount();
    const reopened = openLabyrinthApp({ storage: app.storage, settings: app.settings });
    fireEvent.click(homeTile("LABYRINTH"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("9");
    reopened.unmount();
    const reset = openLabyrinthApp({ storage: app.storage, ageLevel: { level: "paleontologist", revision: "changed" } });
    fireEvent.click(homeTile("LABYRINTH"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("17");
    expect(saved(reset).progress.stars).toBe(6);
  });

  it("resets a remembered override when the parent changes the global setting during the visit", () => {
    const app = openLabyrinthApp();
    fireEvent.click(homeTile("LABYRINTH")); solveMaze();
    fireEvent.click(chosen("hatchling")); fireEvent.click(button("HOME"));
    fireEvent.click(button("Age level"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /PALEONTOLOGIST/ }));
    act(() => app.timers.fire(160));
    fireEvent.click(homeTile("LABYRINTH"));
    expect(mazeBoard().style.getPropertyValue("--columns")).toBe("17");
    expect(saved(app).progress.stars).toBe(3);
  });

  it.each(AGE_LEVELS)("celebrates a higher best at %s without replacing the other levels' bests", (level) => {
    const best = { hatchling: 1, explorer: 2, paleontologist: 0 };
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { labyrinth: { progress: { stars: 6, roundsPlayed: 2, best } } } }) });
    const app = openLabyrinthApp({ storage, ageLevel: { level, revision: "parent" } });
    fireEvent.click(homeTile("LABYRINTH")); solveMaze();
    expect(screen.getByRole("status", { name: TEXTS.en.celebrations["new-best"].label })).toBeDefined();
    expect(saved(app).progress).toEqual({ stars: 9, roundsPlayed: 3, best: { ...best, [level]: 3 } });
  });

  it("preserves other shared progress, restores stars on the featured card, and keeps scores off catalogue and dinosaur pages", () => {
    const others = {
      "compare-dinosaurs": { bestScore: 7, explorerBest: 8, paleontologistBest: null, roundsPlayed: 2 },
      "dinosaur-care": { bestScore: 8, visitsFinished: 2, friends: ["stegosaurus"] },
      "find-the-pair": { stars: 20, level: 1, boardsOnLevel: 1, best: {}, found: ["stegosaurus"] },
      "sort-dinosaurs": { bestScore: 5, roundsPlayed: 2 },
      "skeleton-assembly": { bestScore: 1, earned: ["stegosaurus"], rebuilding: [] },
      dig: { dug: ["stegosaurus"], badges: [], treasures: { amber: 2 } }
    };
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: others }) });
    const app = openLabyrinthApp({ storage });
    fireEvent.click(homeTile("LABYRINTH")); solveMaze();
    const { labyrinth, "home-featured": home, ...rest } = JSON.parse(storage.items.get(PROGRESS_KEY)!).games;
    expect(rest).toEqual(others);
    expect([labyrinth.progress.stars, home.starts]).toEqual([3, { labyrinth: 1 }]);
    app.unmount();
    const record = JSON.parse(storage.items.get(PROGRESS_KEY)!);
    record.games["home-featured"].featured = { game: "labyrinth", day: "2026-10-28" };
    storage.items.set(PROGRESS_KEY, JSON.stringify(record));
    openLabyrinthApp({ storage });
    expect(featuredCard().dataset.game).toBe("labyrinth");
    expect(featuredCard().querySelector(".featured-card-badge")?.textContent).toBe("3");
    expect(featuredCard().querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("triceratops"));
    expect(featuredCard().querySelector(".lucide-route")).not.toBeNull();
    fireEvent.click(homeTile("ANCIENT REPTILES"));
    expect(document.querySelector('[class*="labyrinth"]')).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "ANCIENT REPTILES" })).getAllByRole("button")[0]!);
    expect(document.querySelector('[class*="labyrinth"]')).toBeNull();
  });

  it.each(["malformed", "read", "write", "access"] as const)("plays and keeps session rewards with %s storage errors", (failure) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: "{" }, { read: failure !== "read", save: failure !== "write" });
    if (failure === "access") Object.defineProperty(storage, "getItem", { get: () => { throw new Error("blocked"); } });
    const app = openLabyrinthApp({ storage });
    expect(homeTile("LABYRINTH").querySelector(".labyrinth-tile-best")).toBeNull();
    fireEvent.click(homeTile("LABYRINTH")); solveMaze({ hint: true });
    expect(total()).toBe("+3 STARS · TOTAL 3");
    fireEvent.click(button("HOME"));
    expect(homeTile("LABYRINTH").querySelector(".labyrinth-tile-best")?.textContent).toBe("3");
    fireEvent.click(homeTile("LABYRINTH")); solveMaze({ hint: true });
    expect(total()).toBe("+3 STARS · TOTAL 6");
    app.unmount();
    openLabyrinthApp({ storage });
    expect(homeTile("LABYRINTH").querySelector(".labyrinth-tile-best")?.textContent).toBe(failure === "malformed" ? "6" : undefined);
  });

  it("names the Russian tile and opens its board", () => {
    openLabyrinthApp({ language: "ru" });
    const tile = homeTile("ЛАБИРИНТ");
    expect(tile.querySelector(".lucide-route")).not.toBeNull();
    expect(tile.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("triceratops"));
    fireEvent.click(tile);
    expect(mazeBoard()).not.toBeNull();
  });
});
