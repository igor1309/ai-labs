import { expect, it } from "vitest";
import { localFeatured, localProgress, PROGRESS_KEY, type KeyValueStorage } from "../src/localProgress.ts";
import { memoryStorage, quizSaved } from "./support.ts";

const firstGames = ["compare", "catalogue", "care"];
const allGames = [...firstGames, "whoseJaw", "coloring"];
const record = (games: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, games });

it.each([undefined, record({ "compare-dinosaurs": { bestScore: 4, roundsPlayed: 1 } }), "broken"])("remembers the first visit without tagging existing games, upgrading %s", (saved) => {
  const storage = memoryStorage(saved === undefined ? {} : { [PROGRESS_KEY]: saved });
  const first = localFeatured(() => storage, firstGames);
  expect(first.newGames()).toEqual([]);
  expect(localFeatured(() => storage, firstGames).newGames()).toEqual([]);
  expect(localFeatured(() => storage, allGames).newGames()).toEqual(["whoseJaw", "coloring"]);
  expect(JSON.parse(storage.items.get(PROGRESS_KEY)!).games["home-first-visit"]).toEqual({ games: firstGames });
});

it("tags only added games that have never started, across visits and progress saves", () => {
  const storage = memoryStorage();
  localFeatured(() => storage, firstGames).newGames();
  const visit = localFeatured(() => storage, allGames);
  expect(visit.newGames()).toEqual(["whoseJaw", "coloring"]);
  visit.countStart("whoseJaw");
  expect(visit.newGames()).toEqual(["coloring"]);
  localProgress(() => storage).save(quizSaved(6, 2));
  const reloaded = localFeatured(() => storage, allGames);
  expect(reloaded.newGames()).toEqual(["coloring"]);
  reloaded.countStart("coloring");
  expect(localFeatured(() => storage, allGames).newGames()).toEqual([]);
  expect(localProgress(() => storage).load()).toEqual(quizSaved(6, 2));
});

it("keeps the first-visit record and other progress while choosing today's game and counting starts", () => {
  const savedQuiz = { bestScore: 4, roundsPlayed: 1 };
  const storage = memoryStorage({ [PROGRESS_KEY]: record({ "compare-dinosaurs": savedQuiz }) });
  const visit = localFeatured(() => storage, firstGames);
  visit.newGames();
  visit.feature({ game: "care", on: "2026-11-02" });
  visit.countStart("care");
  const saved = JSON.parse(storage.items.get(PROGRESS_KEY)!);
  expect(saved.games).toEqual({
    "compare-dinosaurs": savedQuiz,
    "home-first-visit": { games: firstGames },
    "home-featured": { starts: { care: 1 }, featured: { game: "care", day: "2026-11-02" } }
  });
});

it.each([null, {}, { games: null }, { games: [7] }])("replaces an unusable first-visit record %j without showing NEW", (first) => {
  const storage = memoryStorage({ [PROGRESS_KEY]: record({ "home-first-visit": first, other: { kept: true } }) });
  expect(localFeatured(() => storage, allGames).newGames()).toEqual([]);
  expect(JSON.parse(storage.items.get(PROGRESS_KEY)!).games).toEqual({ "home-first-visit": { games: allGames }, other: { kept: true } });
});

it.each(["access", "read", "write"])("shows no NEW tag when storage fails on %s, even with an existing first-visit record", (failure) => {
  const target = memoryStorage({ [PROGRESS_KEY]: record({ "home-first-visit": { games: firstGames } }) });
  const storage = (): KeyValueStorage => {
    if (failure === "access") throw Error("blocked");
    return {
      getItem: key => { if (failure === "read") throw Error("blocked"); return target.getItem(key); },
      setItem: (key, value) => { if (failure === "write") throw Error("blocked"); target.setItem(key, value); }
    };
  };
  const visit = localFeatured(storage, allGames);
  expect(visit.newGames()).toEqual([]);
  visit.countStart("whoseJaw");
  expect(visit.history().timesStarted.get("whoseJaw")).toBe(1);
  expect(visit.newGames()).toEqual([]);
});
