import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import type { AgeLevel, AgeLevelSetting } from "../src/ageLevel.ts";
import { CLIMB_LEVELS, type Board, type ClimbLevel } from "../src/pairs/index.ts";
import { NAME_EMS } from "./nameWidths.ts";
import {
  MISS,
  board,
  dealt,
  endWave,
  labelAt,
  namesOf,
  openPairsApp,
  pairCards,
  pairsRecord,
  placesOf,
  playBoard,
  playDealt,
  playPairs,
  showMiss,
  stateAt,
  storedPairs,
  triesShown,
  turnCard,
  type PairsAppOptions,
  type StoredPairs
} from "./pairsApp.tsx";
import { SHIPPED_PALS, fakeBodyPicture, manualOrientation, manualPictures, memoryStorage, seededRandom, symbolOf, type ManualTimers } from "./support.ts";

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const pal = (id: string) => {
  const found = SHIPPED_PALS.find((each) => each.id === id);
  if (!found) throw new Error(`No ${id} in the shipped list`);
  return found;
};

// The three dinosaurs of every level 1 board in these tests.
const THREE = [pal("triceratops"), pal("stegosaurus"), pal("tyrannosaurus")];
const NAMES = namesOf(dealt(1, { pals: THREE }));
const [TRIKE, STEGO] = [placesOf(NAMES, "TRICERATOPS"), placesOf(NAMES, "STEGOSAURUS")];

const picked = (level: AgeLevel): AgeLevelSetting => ({ level, revision: `picked-${level}` });

// A board at each level, with the options that open the app on it and the
// board the app deals first: Hatchling's climb level 1 of the three, and
// Explorer's and Paleontologist's from the shared list.
const LEVEL_BOARDS: [string, PairsAppOptions<ManualTimers>, Board][] = [
  ["Hatchling", { pals: THREE }, dealt(1, { pals: THREE })],
  ["Explorer", { ageLevel: picked("explorer") }, dealt({ large: "explorer" })],
  ["Paleontologist", { ageLevel: picked("paleontologist") }, dealt({ large: "paleontologist" })]
];

const button = (name: string) => screen.getByRole("button", { name });
const stored = (progress: Partial<StoredPairs>, games: Record<string, unknown> = {}) =>
  memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 0, level: 1, boardsOnLevel: 0, best: {}, found: [], ...progress }, games) });
// The catalogue's count of dinosaurs found.
const foundCount = () => {
  const count = screen.getAllByLabelText("FOUND").find((each) => each.tagName === "P");
  if (!count) throw new Error("No found count in the catalogue");
  return count;
};
const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
const bestShown = () => screen.queryByLabelText("BEST SCORE")?.textContent ?? null;
// The names of the result's dinosaurs, whatever the language.
const resultNames = () => [...document.querySelectorAll(".pairs-found-name")].map((name) => name.textContent);

// Plays a level 1 board of the three in `tries` tries, and lets the
// result show.
async function finishThree(app: { user: UserEvent; clock: ManualTimers }, tries = 3) {
  await playPairs(app.user);
  await playDealt(app.user, app.clock, NAMES, tries - 3);
  endWave(app.clock);
}

describe("the welcome screen", () => {
  it("opens from the home tile with PLAY, the level and the stars, and HOME", async () => {
    const { user } = openPairsApp({ storage: stored({ stars: 5, level: 3 }) });

    await user.click(button("FIND THE PAIR"));

    expect(screen.getByRole("heading").textContent).toBe("FIND THE PAIR");
    expect(symbolOf(button("PLAY"))).toBe("play");
    const [level, stars] = [screen.getByLabelText("LEVEL"), screen.getByLabelText("STARS")];
    expect([level.textContent, symbolOf(level), stars.textContent, symbolOf(stars)]).toEqual(["3", "chart-no-axes-column-increasing", "5", "star"]);
    expect(symbolOf(button("HOME"))).toBe("house");
    expect([...document.querySelectorAll(".pairs-hero img")].map((picture) => picture.getAttribute("src"))).toEqual([
      fakeBodyPicture("triceratops"),
      fakeBodyPicture("triceratops")
    ]);
    expect(document.querySelectorAll(".pairs-hero .pair-silhouette")).toHaveLength(1);
  });

  it("goes back home on HOME", async () => {
    const { user } = openPairsApp();
    await user.click(button("FIND THE PAIR"));

    await user.click(button("HOME"));

    expect(button("FIND THE PAIR")).toBeDefined();
  });
});

describe("a board", () => {
  it.each([1, 2, 3, 4] as const)("of level %i is its pairs face down, row by row, each card at least 150px, each pair matched as the level matches", async (level) => {
    const { user, clock } = openPairsApp({ storage: stored({ level }) });

    await playPairs(user);

    const { pairs, rows, columns, silhouettes } = CLIMB_LEVELS[level];
    expect(pairCards()).toHaveLength(pairs * 2);
    expect(pairCards().map((card) => [card.getAttribute("data-state"), symbolsOf(card)])).toEqual(pairCards().map(() => ["down", ["footprints"]]));
    expect([board().style.getPropertyValue("--rows"), board().style.getPropertyValue("--columns")]).toEqual([String(rows), String(columns)]);
    const style = getComputedStyle(board());
    expect([style.gridTemplateRows, style.gridTemplateColumns].map((tracks) => tracks.includes("minmax(var(--card-floor), 1fr)"))).toEqual([true, true]);
    expect(board().style.getPropertyValue("--card-floor")).toBe("150px");
    expect(screen.getByLabelText("LEVEL").textContent).toBe(String(level));

    await playBoard(user, clock);

    const faces = new Map<string, string[]>();
    pairCards().forEach((card) => faces.set(card.getAttribute("aria-label") ?? "", [...(faces.get(card.getAttribute("aria-label") ?? "") ?? []), card.getAttribute("data-face") ?? ""]));
    expect([...faces.values()].map((pair) => pair.sort())).toEqual([...faces.values()].map(() => (silhouettes ? ["picture", "silhouette"] : ["picture", "picture"])));
    expect(board().querySelectorAll("img.pair-silhouette")).toHaveLength(silhouettes ? pairs : 0);
  });

  it("deals other dinosaurs on the next board", async () => {
    const { user, clock } = openPairsApp({ random: seededRandom(8) });
    await playPairs(user);
    await playBoard(user, clock);
    endWave(clock);
    const first = resultNames();

    await user.click(button("PLAY AGAIN"));
    await playBoard(user, clock);
    endWave(clock);

    expect(resultNames().filter((name) => first.includes(name))).toEqual([]);
  });

  it("waits for its pictures, with the welcome on screen until they have loaded", async () => {
    const pictures = manualPictures();
    const { user } = openPairsApp({ pals: THREE, clock: pictures });
    await user.click(button("FIND THE PAIR"));

    await user.click(button("PLAY"));

    const asked = pictures.loading();
    expect(asked.sort()).toEqual(THREE.map(({ id }) => fakeBodyPicture(id)).sort());
    expect(pictures.timers()).toEqual([1000]);
    act(() => asked.slice(1).forEach(pictures.finish));
    expect(screen.queryByRole("group", { name: "CARDS" })).toBeNull();

    act(() => pictures.finish(asked[0] ?? ""));

    expect(pairCards()).toHaveLength(6);
    expect(pictures.timers()).toEqual([]);
  });

  it("shows after a second when its pictures are slow, and is not dealt again when they arrive", async () => {
    const pictures = manualPictures();
    const { user } = openPairsApp({ pals: THREE, clock: pictures });
    await user.click(button("FIND THE PAIR"));
    await user.click(button("PLAY"));

    act(() => pictures.fire(1000));

    expect(pairCards()).toHaveLength(6);
    const first = document.body.innerHTML;
    act(() => pictures.loading().forEach(pictures.finish));
    expect(document.body.innerHTML).toBe(first);
  });

  it("is dealt once on a quick double tap of PLAY", async () => {
    const pictures = manualPictures();
    const { user } = openPairsApp({ pals: THREE, clock: pictures });
    await user.click(button("FIND THE PAIR"));

    await user.dblClick(button("PLAY"));

    expect(pictures.loading()).toHaveLength(3);
    expect(pictures.timers()).toEqual([1000]);
  });

  it("deals nothing once the child has gone home while its pictures load", async () => {
    const pictures = manualPictures();
    const { user } = openPairsApp({ pals: THREE, clock: pictures });
    await user.click(button("FIND THE PAIR"));
    await user.click(button("PLAY"));

    await user.click(button("HOME"));
    act(() => pictures.loading().forEach(pictures.finish));

    expect(button("FIND THE PAIR")).toBeDefined();
    expect(screen.queryByRole("group", { name: "CARDS" })).toBeNull();
  });
});

describe.each(LEVEL_BOARDS)("turning cards at %s", (_, options, dealtBoard) => {
  const names = namesOf(dealtBoard);
  const [firstName = "", secondName = ""] = new Set(names);
  // The places of the first two dinosaurs' cards, as the board deals them.
  const [FIRST, SECOND] = [placesOf(names, firstName), placesOf(names, secondName)];
  const firstId = dealtBoard.pals.find(({ name }) => name.en.toLocaleUpperCase("en") === firstName)?.id ?? "";

  const open = async () => {
    const app = openPairsApp(options);
    await playPairs(app.user);
    return app;
  };

  it("turns a face-down card over to its dinosaur, pressed before it turns", async () => {
    const { user } = await open();
    const card = pairCards()[FIRST[0] ?? 0];
    if (!card) throw new Error("No card");

    await user.pointer({ keys: "[TouchA>]", target: card });
    expect([card.hasAttribute("data-pressed"), stateAt(FIRST[0] ?? 0)]).toEqual([true, "down"]);
    await user.pointer({ keys: "[/TouchA]", target: card });

    expect([stateAt(FIRST[0] ?? 0), labelAt(FIRST[0] ?? 0)]).toEqual(["open", firstName]);
    expect(pairCards()[FIRST[0] ?? 0]?.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture(firstId));
    expect(triesShown()).toBe("0");
  });

  it("keeps an open card open, still the first of two, when it is tapped again", async () => {
    const { user } = await open();

    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, FIRST[0] ?? 0);
    expect([stateAt(FIRST[0] ?? 0), triesShown()]).toEqual(["open", "0"]);
    await turnCard(user, FIRST[1] ?? 0);

    expect([stateAt(FIRST[0] ?? 0), stateAt(FIRST[1] ?? 0), triesShown()]).toEqual(["found", "found", "1"]);
  });

  it("keeps a matching pair open, outlined and named, as found", async () => {
    const { user, clock } = await open();

    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, FIRST[1] ?? 0);

    const pair = FIRST.map((place) => pairCards()[place]);
    expect(pair.map((card) => [card?.getAttribute("data-state"), card?.querySelector(".pair-card-name")?.textContent])).toEqual([
      ["found", firstName],
      ["found", firstName]
    ]);
    expect(clock.timers()).toEqual([]);
    expect(getComputedStyle(pair[0]?.querySelector(".pair-card-face") ?? board()).outline).toBe("4px solid #2e7d4f");
  });

  it("names a found card in a size its card's width keeps every dinosaur's name in, in every language", async () => {
    const { user } = await open();

    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, FIRST[1] ?? 0);

    // jsdom works out no size from a card's width, so the size is read as
    // app.css gives it: at most a cap, otherwise the card's width, less the
    // name's sides, over a width in ems no name is wider than, which jsdom
    // keeps as a multiplication by its inverse.
    const name = pairCards()[FIRST[0] ?? 0]?.querySelector(".pair-card-name") ?? board();
    const style = getComputedStyle(name);
    const size = /^min\((\d+)px, ([\d.]+) \* \(100cqi - (\d+)px\)\)$/.exec(style.fontSize);
    expect([size?.[1], size?.[3]].map(Number)).toEqual([24, parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)]);
    expect([style.whiteSpace, style.letterSpacing]).toEqual(["nowrap", "normal"]);
    const ems = 1 / Number(size?.[2]);
    const names = SHIPPED_PALS.flatMap(({ name: { en, ru } }) => [en.toLocaleUpperCase("en"), ru.toLocaleUpperCase("ru")]);
    expect(names.filter((each) => !((NAME_EMS[each] ?? Infinity) <= ems))).toEqual([]);
  });

  it("turns a miss back after a second, with no cross, no wrong word and no shake", async () => {
    const { user, clock } = await open();

    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, SECOND[0] ?? 0);

    expect([stateAt(FIRST[0] ?? 0), stateAt(SECOND[0] ?? 0), triesShown()]).toEqual(["open", "open", "1"]);
    expect(clock.timers()).toEqual([MISS]);
    expect(symbolsOf(board()).filter((symbol) => symbol !== "footprints")).toEqual([]);
    expect(board().textContent).toBe("");
    expect(document.querySelectorAll("[data-mark]")).toHaveLength(0);

    act(() => clock.fire(MISS));

    expect([stateAt(FIRST[0] ?? 0), stateAt(SECOND[0] ?? 0), triesShown()]).toEqual(["down", "down", "1"]);
  });

  it("turns no third card while a miss shows, and any once it has turned back", async () => {
    const { user, clock } = await open();
    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, SECOND[0] ?? 0);

    await turnCard(user, FIRST[1] ?? 0);
    expect([stateAt(FIRST[1] ?? 0), triesShown()]).toEqual(["down", "1"]);
    act(() => clock.fire(MISS));
    await turnCard(user, FIRST[1] ?? 0);

    expect(stateAt(FIRST[1] ?? 0)).toBe("open");
  });

  it("turns over one card on a quick double tap", async () => {
    const { user } = await open();

    await user.dblClick(pairCards()[0] ?? board());

    expect(pairCards().map((_, place) => stateAt(place)).filter((state) => state !== "down")).toEqual(["open"]);
    expect(triesShown()).toBe("0");
  });

  it("counts every two cards turned as one try, matched or not, by a hand in the bar", async () => {
    const { user, clock } = await open();
    expect(symbolOf(screen.getByLabelText("TRIES"))).toBe("hand");

    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, SECOND[0] ?? 0);
    act(() => clock.fire(MISS));
    await turnCard(user, SECOND[0] ?? 0);
    await turnCard(user, SECOND[1] ?? 0);

    expect(triesShown()).toBe("2");
  });

  it("waves every card once the last pair is found, and then shows the result", async () => {
    const { user, clock } = await open();

    await playDealt(user, clock, names);

    expect(board().hasAttribute("data-finished")).toBe(true);
    expect(clock.timers()).toEqual([wave(tokens().motion, dealtBoard.cards.length)]);
    await turnCard(user, 0);
    expect(screen.queryByRole("button", { name: "PLAY AGAIN" })).toBeNull();
    endWave(clock);
    expect(button("PLAY AGAIN")).toBeDefined();
  });

  it("goes home from a board without asking, and the board earns nothing", async () => {
    const { user, storage } = await open();
    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, FIRST[1] ?? 0);

    await user.click(button("HOME"));

    expect(button("FIND THE PAIR")).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(storedPairs(storage)).toBeUndefined();
    await user.click(button("FIND THE PAIR"));
    expect(screen.getByLabelText("STARS").textContent).toBe("0");
  });

  // The tap and the timers read in one act, before React renders the home
  // page: the board's timers stop as the child leaves, not as the game is
  // taken off the screen.
  it.each(["miss", "celebration"] as const)("stops the %s as the child goes home, and the next board is not moved on by it, delivered all the same", async (during) => {
    const { user, clock } = openPairsApp(options);
    await playPairs(user);
    if (during === "miss") await showMiss(user);
    else await playBoard(user, clock);
    const timer = during === "miss" ? MISS : wave(tokens().motion, dealtBoard.cards.length);
    expect(clock.timers()).toEqual([timer]);

    let running: number[] = [];
    act(() => {
      fireEvent.click(button("HOME"));
      running = clock.timers();
    });
    await playPairs(user);
    act(() => clock.deliverStopped(timer));

    expect(running).toEqual([]);
    expect([pairCards().map((_, place) => stateAt(place)), triesShown(), board().hasAttribute("data-finished")]).toEqual([pairCards().map(() => "down"), "0", false]);
    expect(screen.queryByRole("button", { name: "PLAY AGAIN" })).toBeNull();
    await turnCard(user, 0);
    await turnCard(user, 1);
    expect([[stateAt(0), stateAt(1)].includes("down"), triesShown()]).toEqual([false, "1"]);
  });

  it("pauses in portrait, with nothing to turn, and is the same board again in landscape", async () => {
    const orientation = manualOrientation("landscape");
    const { user, clock } = openPairsApp({ ...options, orientation });
    await playPairs(user);
    await turnCard(user, FIRST[0] ?? 0);
    await turnCard(user, SECOND[0] ?? 0);
    act(() => clock.fire(MISS));
    await turnCard(user, SECOND[1] ?? 0);
    const before = pairCards().map((_, place) => stateAt(place));

    act(() => orientation.turn("portrait"));

    expect(screen.getByRole("img", { name: "TURN THE IPAD SIDEWAYS" })).toBeDefined();
    expect(screen.queryByRole("group", { name: "CARDS" })).toBeNull();
    act(() => orientation.turn("landscape"));
    expect([pairCards().map((_, place) => stateAt(place)), triesShown()]).toEqual([before, "1"]);
  });

});

describe("a board at any level", () => {
  it.each([
    ["Hatchling's climb level 3", { storage: stored({ level: 3 }) }, dealt(3)],
    ...LEVEL_BOARDS.slice(1)
  ] as const)("names a dinosaur whose picture cannot be loaded on both its cards, by a dinosaur symbol, at %s", async (_, options, dealtBoard) => {
    const { user, clock } = openPairsApp(options);
    await playPairs(user);
    const names = namesOf(dealtBoard);
    const [first, second] = placesOf(names, names[0] ?? "");

    await turnCard(user, first ?? 0);
    fireEvent.error(pairCards()[first ?? 0]?.querySelector("img") ?? board());

    const missing = (place: number) => [symbolsOf(pairCards()[place] ?? board()), pairCards()[place]?.querySelector(".pair-card-name")?.textContent];
    expect(missing(first ?? 0)).toEqual([["footprints"], names[0]]);
    await turnCard(user, second ?? 0);
    expect(missing(second ?? 0)).toEqual([["footprints"], names[0]]);
    expect(clock.timers()).toEqual([]);
  });
});

// The tokens of app.css, in milliseconds, in full motion and reduced.
function tokens(): Record<"motion" | "reduced", Record<string, number>> {
  const css = readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8");
  const read = (block: string) => Object.fromEntries([...block.matchAll(/--motion-(\w+):\s*(\d+)ms/g)].map(([, name, ms]) => [name ?? "", Number(ms)]));
  const reducedAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
  const motion = read(css.slice(0, reducedAt));
  return { motion, reduced: { ...motion, ...read(css.slice(reducedAt, css.indexOf("}", reducedAt))) } };
}

// How long app.css waves a board of `cards` cards: after the last flip,
// one after the other, each for a screen change.
function wave({ standard = 0, stagger = 0, screen: change = 0 }: Record<string, number>, cards: number) {
  return standard + (cards - 1) * stagger + change;
}

describe("find the pair's motion", () => {
  it.each(LEVEL_BOARDS.flatMap(([level, options, dealtBoard]) => (["motion", "reduced"] as const).map((setting) => [level, setting, options, dealtBoard] as const)))(
    "waits for the wave of a %s board's cards as app.css plays it, in %s, and a miss stays a second",
    async (_, setting, options, dealtBoard) => {
      const names = namesOf(dealtBoard);
      const { user, clock } = openPairsApp({ ...options, reducedMotion: setting === "reduced" });
      await playPairs(user);

      await turnCard(user, 0);
      await turnCard(user, names.findIndex((name) => name !== names[0]));
      expect(clock.timers()).toEqual([MISS]);
      act(() => clock.fire(MISS));
      await playDealt(user, clock, names);

      expect(clock.timers()).toEqual([wave(tokens()[setting], dealtBoard.cards.length)]);
    }
  );
});

describe("the result", () => {
  it("shows the tries by a hand, the stars earned, the board's dinosaurs and PLAY AGAIN and HOME", async () => {
    const app = openPairsApp({ pals: THREE, storage: stored({ stars: 4 }) });

    await finishThree(app, 7);

    const tries = screen.getByLabelText("TRIES");
    expect([tries.textContent, symbolOf(tries)]).toEqual(["7", "hand"]);
    expect(screen.getByLabelText("STARS").textContent).toBe("★5");
    expect(resultNames()).toEqual(["TRICERATOPS", "STEGOSAURUS", "TYRANNOSAURUS"].filter((name) => NAMES.includes(name)).sort((a, b) => NAMES.indexOf(a) - NAMES.indexOf(b)));
    expect(screen.getByRole("heading").textContent).toBe("WELL DONE!");
    expect([symbolOf(button("PLAY AGAIN")), symbolOf(button("HOME"))]).toEqual(["rotate-ccw", "house"]);
  });

  it("sets and celebrates the level's first best", async () => {
    const app = openPairsApp({ pals: THREE });

    await finishThree(app, 5);

    expect([celebrations(), bestShown()]).toEqual([["FIRST BEST SCORE"], "BEST5"]);
    expect(storedPairs(app.storage)).toMatchObject({ best: { 1: 5 } });
  });

  it("celebrates fewer tries than the best as a new best, beside the best it beat", async () => {
    const app = openPairsApp({ pals: THREE, storage: stored({ best: { 1: 7 } }) });

    await finishThree(app, 5);

    expect([celebrations(), bestShown()]).toEqual([["NEW BEST SCORE"], "BEST75"]);
    expect(storedPairs(app.storage)).toMatchObject({ best: { 1: 5 } });
  });

  it.each([7, 11])("keeps the best of 7 after %i tries, uncelebrated, by a trophy", async (tries) => {
    const app = openPairsApp({ pals: THREE, storage: stored({ stars: 2, best: { 1: 7 } }) });

    await finishThree(app, tries);

    expect([celebrations(), bestShown(), symbolOf(screen.getByLabelText("BEST SCORE"))]).toEqual([[], "BEST7", "trophy"]);
    expect(storedPairs(app.storage)).toMatchObject({ stars: 3, best: { 1: 7 } });
  });

  it("moves up a level after two boards on it, by its board, and deals that level next", async () => {
    const app = openPairsApp({ storage: stored({ stars: 1, boardsOnLevel: 1, best: { 1: 3 } }) });
    await playPairs(app.user);
    await playBoard(app.user, app.clock);
    endWave(app.clock);

    const levelUp = screen.getByRole("status", { name: "NEW LEVEL 2" });
    expect([levelUp.textContent, levelUp.querySelectorAll(".pairs-next-card").length]).toEqual(["2", 8]);
    await app.user.click(button("PLAY AGAIN"));
    expect([pairCards().length, screen.getByLabelText("LEVEL").textContent]).toEqual([8, "2"]);
  });

  it("stays on the top level, a star for each board", async () => {
    const app = openPairsApp({ storage: stored({ level: 4 }), random: seededRandom(4) });
    await playPairs(app.user);
    await playBoard(app.user, app.clock);
    endWave(app.clock);
    await app.user.click(button("PLAY AGAIN"));
    await playBoard(app.user, app.clock);
    endWave(app.clock);

    expect(screen.queryByRole("status", { name: /NEW LEVEL/ })).toBeNull();
    expect(storedPairs(app.storage)).toMatchObject({ stars: 2, level: 4 });
  });

  it("is recorded once, the moment the last pair is found: going home or reloading during the wave adds nothing", async () => {
    const app = openPairsApp({ pals: THREE });
    await playPairs(app.user);
    await playDealt(app.user, app.clock, NAMES);
    const recorded = { stars: 1, level: 1, boardsOnLevel: 1, best: { 1: 3 }, found: ["triceratops", "stegosaurus", "tyrannosaurus"] };
    expect(storedPairs(app.storage)).toEqual(recorded);

    await app.user.click(button("HOME"));
    act(() => app.clock.settle());
    expect([storedPairs(app.storage), screen.queryByRole("button", { name: "PLAY AGAIN" })]).toEqual([recorded, null]);
    app.unmount();

    const reopened = openPairsApp({ pals: THREE, storage: app.storage });
    await reopened.user.click(button("FIND THE PAIR"));
    expect(screen.getByLabelText("STARS").textContent).toBe("1");
    expect(storedPairs(app.storage)).toEqual(recorded);
  });

  it("shows the home tile's stars once a board is finished", async () => {
    const app = openPairsApp({ pals: THREE });
    expect(document.querySelector(".pairs-tile-stars")).toBeNull();

    await finishThree(app);
    await app.user.click(button("HOME"));

    const stars = document.querySelector(".pairs-tile-stars");
    expect(stars && [stars.textContent, symbolOf(stars)]).toEqual(["1", "star"]);
  });
});

describe("dinosaurs found", () => {
  const newBadges = () =>
    within(screen.getByRole("list", { name: "DINOSAURS" }))
      .getAllByRole("listitem")
      .flatMap((item) => (item.querySelector(".pairs-new-badge") ? [[item.querySelector(".pairs-found-name")?.textContent, symbolsOf(item.querySelector(".pairs-new-badge") ?? item)]] : []));

  it("are a finished board's dinosaurs, each new one marked NEW with a sparkle", async () => {
    const app = openPairsApp({ pals: THREE });

    await finishThree(app);

    expect(newBadges().map(([name]) => name).sort()).toEqual(["STEGOSAURUS", "TRICERATOPS", "TYRANNOSAURUS"]);
    expect(newBadges().map(([, symbols]) => symbols)).toEqual([["sparkles"], ["sparkles"], ["sparkles"]]);
    expect(within(screen.getByRole("list", { name: "DINOSAURS" })).getAllByText("NEW")).toHaveLength(3);
  });

  it("are found once: one found before is not new again", async () => {
    const app = openPairsApp({ pals: THREE, storage: stored({ found: ["triceratops"] }) });

    await finishThree(app);

    expect(newBadges().map(([name]) => name).sort()).toEqual(["STEGOSAURUS", "TYRANNOSAURUS"]);
    expect(storedPairs(app.storage)).toMatchObject({ found: ["triceratops", "stegosaurus", "tyrannosaurus"] });
  });

  it("are not found on a board left halfway", async () => {
    const app = openPairsApp({ pals: THREE, storage: stored({ found: ["triceratops"] }) });
    await playPairs(app.user);
    await turnCard(app.user, STEGO[0] ?? 0);
    await turnCard(app.user, STEGO[1] ?? 0);

    await app.user.click(button("HOME"));

    expect(storedPairs(app.storage)).toMatchObject({ found: ["triceratops"] });
  });

  it("are counted and stamped in the catalogue, the page of each stamped too", async () => {
    const { user } = openPairsApp({ storage: stored({ found: ["triceratops", "stegosaurus"] }) });

    await user.click(button("ALL DINOSAURS"));

    const count = foundCount();
    expect([count.textContent, symbolOf(count)]).toEqual([`2 / ${SHIPPED_PALS.length}`, "copy"]);
    const grid = screen.getByRole("group", { name: "ALL DINOSAURS" });
    const stamped = within(grid)
      .getAllByRole("button")
      .filter((card) => within(card).queryByRole("img", { name: "FOUND" }))
      .map((card) => card.getAttribute("aria-label"));
    expect(stamped.sort()).toEqual(["Stegosaurus", "Triceratops"]);
    expect(symbolOf(within(grid).getAllByRole("img", { name: "FOUND" })[0] ?? grid)).toBe("copy");
    await user.click(within(grid).getByRole("button", { name: "Triceratops" }));
    expect(symbolOf(screen.getByRole("img", { name: "FOUND" }))).toBe("copy");
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    expect(screen.queryByRole("img", { name: "FOUND" })).toBeNull();
  });

  it("show no count and no stamps before any is found", async () => {
    const { user } = openPairsApp();

    await user.click(button("ALL DINOSAURS"));

    expect(document.querySelector(".catalogue-found")).toBeNull();
    expect(screen.queryAllByRole("img", { name: "FOUND" })).toEqual([]);
  });

  it("count only those still in the dinosaur list, and the catalogue changes nothing stored", async () => {
    const storage = stored({ found: ["triceratops", "gone"] });
    const before = storage.items.get(PROGRESS_KEY);
    const { user } = openPairsApp({ storage });

    await user.click(button("ALL DINOSAURS"));

    expect(foundCount().textContent).toBe(`1 / ${SHIPPED_PALS.length}`);
    expect(storage.items.get(PROGRESS_KEY)).toBe(before);
  });
});

describe("find the pair in Russian", () => {
  it("speaks Russian in capitals, the dinosaurs' names too", async () => {
    const app = openPairsApp({ pals: THREE, deviceLanguage: "ru-RU" });

    await app.user.click(button("НАЙДИ ПАРУ"));
    expect([screen.getByRole("heading").textContent, button("ИГРАТЬ"), button("ДОМОЙ")].map((each) => (typeof each === "string" ? each : each.textContent))).toEqual([
      "НАЙДИ ПАРУ",
      "ИГРАТЬ",
      "ДОМОЙ"
    ]);
    await app.user.click(button("ИГРАТЬ"));
    await turnCard(app.user, TRIKE[0] ?? 0);
    expect(labelAt(TRIKE[0] ?? 0)).toBe(pal("triceratops").name.ru.toLocaleUpperCase("ru"));
    await turnCard(app.user, TRIKE[1] ?? 0);
    await playBoard(app.user, app.clock);
    endWave(app.clock);

    expect(resultNames().sort()).toEqual(THREE.map(({ name }) => name.ru.toLocaleUpperCase("ru")).sort());
    expect([button("ЕЩЁ РАЗ").textContent, button("ДОМОЙ").textContent]).toEqual(["ЕЩЁ РАЗ", "ДОМОЙ"]);
    expect(screen.getByRole("heading").textContent).toBe(screen.getByRole("heading").textContent?.toLocaleUpperCase("ru"));
  });
});

// The levels' shapes, as the feature gives them.
it.each([
  [1, 3, 2, 3],
  [2, 4, 2, 4],
  [3, 4, 2, 4],
  [4, 6, 3, 4]
] as const)("level %i deals %i pairs in %i rows of %i", (level: ClimbLevel, pairs, rows, columns) => {
  expect(CLIMB_LEVELS[level]).toMatchObject({ pairs, rows, columns });
});
