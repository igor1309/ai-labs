import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import type { AgeLevel, AgeLevelSetting } from "../src/ageLevel.ts";
import { NO_LEVEL_OFFER, type LevelOffer } from "../src/levelOffer.ts";
import { PROGRESS_KEY, localPairsProgress } from "../src/localProgress.ts";
import type { Board, BoardLevel } from "../src/pairs/index.ts";
import { MISS, dealt, endWave, namesOf, openPairsApp, pairCards, pairsRecord, placesOf, storedPairs, type StoredPairs } from "./pairsApp.tsx";
import { manualPictures, manualViewport, memoryStorage, type MemoryStorage, type ManualViewport } from "./support.ts";

// find-the-pair-level-offer.feature, and the leaving-early outline of
// find-the-pair-level-offer-result.feature: what makes find the pair offer
// the next level, what the answers do, and what is kept. The screen of the
// offer is pairsLevelOffer.test.tsx's, the rule levelOffer.test.ts's: a
// scenario's long run of boards is played here only as far as the app's own
// part of it needs, with the count seeded in the progress it starts from.

// jsdom has no animation engine: with none running, the offer rises in, and
// fades out, when the timer of no wait fires.
beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
});
afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "getAnimations");
});

const HATCHLING: BoardLevel = { climbLevel: 4 };
const EXPLORER: BoardLevel = { large: "explorer" };
const PALEONTOLOGIST: BoardLevel = { large: "paleontologist" };

const picked = (level: AgeLevel): AgeLevelSetting => ({ level, revision: `picked-${level}` });
const button = (name: string) => screen.getByRole("button", { name });
const nameOf = (level: AgeLevel) => TEXTS.en.ageLevels[level].name;
const asks = (level: AgeLevel) => TEXTS.en.levelOffer.question(nameOf(level));

const offerOf = (level: AgeLevel | null, strong: number, ...declined: AgeLevel[]): LevelOffer => ({ level, strong, declined });
const entry = (progress: Partial<StoredPairs> = {}): StoredPairs => ({ stars: 0, level: 4, boardsOnLevel: 0, best: {}, found: [], ...progress });

type Session = Awaited<ReturnType<typeof begin>>;

// Find the pair's welcome screen, on progress seeded as given (at climb
// level 4 unless it says otherwise), with the pictures of each board
// loaded by the test.
async function begin({
  ageLevel = "hatchling",
  progress = {},
  storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(entry(progress)) }),
  viewport = manualViewport("landscape"),
  portraitLayouts = {},
  settingsStorage
}: { ageLevel?: AgeLevel; progress?: Partial<StoredPairs>; storage?: MemoryStorage; settingsStorage?: MemoryStorage; viewport?: ManualViewport; portraitLayouts?: PortraitLayouts } = {}) {
  const clock = manualPictures();
  const app = openPairsApp({ storage, viewport, portraitLayouts, ageLevel: picked(ageLevel), clock, ...(settingsStorage && { settingsStorage }) });
  await app.user.click(button("FIND THE PAIR"));
  // The board dealt last, which the next one is dealt after.
  return { ...app, clock, viewport, previous: undefined as Board | undefined };
}

// The app reopened on what the first kept.
async function reload(session: Session) {
  session.unmount();
  return begin({ storage: session.storage, settingsStorage: session.ageLevels });
}

// Taps `label`, which shows the board dealt at once, and lets its
// pictures load.
async function deal(session: Session, label: "PLAY" | "PLAY AGAIN", level: BoardLevel) {
  await session.user.click(button(label));
  const board = dealt(level, session.previous ? { previous: session.previous } : {});
  expect(pairCards()).toHaveLength(board.pals.length * 2);
  act(() => session.clock.finishAll());
  session.previous = board;
  return board;
}

// Finds every pair of `board` in `tries` tries, the misses first, and lets
// the cards' wave end.
function finish(session: Session, board: Board, tries: number) {
  const names = namesOf(board);
  const misses = tries - board.pals.length;
  expect(misses).toBeGreaterThanOrEqual(0);
  const cards = pairCards();
  const tap = (place: number) => fireEvent.click(cards[place]!);
  const other = names.findIndex((name) => name !== names[0]);
  for (let miss = 0; miss < misses; miss++) {
    tap(0);
    tap(other);
    act(() => session.clock.fire(MISS));
  }
  for (const name of new Set(names)) placesOf(names, name).forEach(tap);
  endWave(session.clock);
}

// The offer rises in, or the fade ends, once the timer of no wait fires.
const settle = (session: Session) => act(() => session.clock.fire(0));

// A board of `level` played in `tries` tries up to its result, the offer
// not yet risen in.
async function reach(session: Session, label: "PLAY" | "PLAY AGAIN", level: BoardLevel, tries: number) {
  finish(session, await deal(session, label, level), tries);
}

// The same, with the offer risen in if there is one.
async function result(session: Session, label: "PLAY" | "PLAY AGAIN", level: BoardLevel, tries: number) {
  await reach(session, label, level, tries);
  settle(session);
}

const asked = () => screen.queryByRole("dialog")?.querySelector("h2")?.textContent ?? null;
const savedOffer = (session: Session) => (storedPairs(session.storage) as StoredPairs).offer;
const chosen = () => within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getAllByRole("button", { pressed: true }).map((level) => level.querySelector(".level-switch-name")?.textContent);

// Home and back to find the pair's welcome screen.
async function toWelcome(session: Session) {
  await session.user.click(button("HOME"));
  await session.user.click(button("FIND THE PAIR"));
}

// `n` strong boards in a row of `level`: the first n - 1 show no offer and
// the last offers `next`.
async function needs(session: Session, n: number, level: BoardLevel, tries: number, next: AgeLevel, from: "PLAY" | "PLAY AGAIN" = "PLAY AGAIN") {
  for (let board = 1; board <= n; board++) {
    await result(session, board === 1 ? from : "PLAY AGAIN", level, tries);
    expect(asked()).toBe(board === n ? asks(next) : null);
  }
}

describe("when the next level is offered", () => {
  it("pauses the offer's arrival and dismissal while the portrait gate covers the mounted result", async () => {
    const session = await begin({ progress: { offer: offerOf("hatchling", 2) } });
    await reach(session, "PLAY", HATCHLING, 6);
    act(() => session.viewport.turn("portrait"));
    expect(session.clock.timers()).not.toContain(0);
    act(() => session.clock.deliverStopped(0));
    expect(savedOffer(session)).toEqual(offerOf("hatchling", 3));

    act(() => session.viewport.turn("landscape"));
    settle(session);
    expect(asked()).toBe(asks("explorer"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(button("NOT NOW"));
    act(() => session.viewport.turn("portrait"));
    expect(session.clock.timers()).not.toContain(0);
    act(() => session.clock.deliverStopped(0));
    expect(dialog.isConnected).toBe(true);
    act(() => session.viewport.turn("landscape"));
    settle(session);
    expect(asked()).toBeNull();
  });

  it.each([
    ["hatchling", HATCHLING, 12, "explorer", "🦖"],
    ["explorer", EXPLORER, 18, "paleontologist", "🦴"]
  ] as const)("offers after three strong %s boards in a row, and not before", async (level, board, tries, next, picture) => {
    const session = await begin({ ageLevel: level });

    await needs(session, 3, board, tries, next, "PLAY");

    expect(screen.getByRole("dialog").querySelector(".pairs-offer-picture")?.textContent).toBe(picture);
  });

  it("does not count Hatchling's boards below climb level 4, nor the one that moves up to it", async () => {
    const session = await begin({ progress: { level: 3, boardsOnLevel: 1 } });

    await result(session, "PLAY", { climbLevel: 3 }, 6);
    expect(storedPairs(session.storage)).toMatchObject({ level: 4, offer: offerOf("hatchling", 0) });
    await result(session, "PLAY AGAIN", HATCHLING, 6);
    await result(session, "PLAY AGAIN", HATCHLING, 6);
    expect(asked()).toBeNull();
    expect(savedOffer(session)).toEqual(offerOf("hatchling", 2));
    await needs(session, 1, HATCHLING, 6, "explorer");
  });

  it("counts a board at the limit of twice its pairs, and not a try over", async () => {
    const session = await begin({ ageLevel: "explorer", progress: { offer: offerOf("explorer", 1) } });

    await result(session, "PLAY", EXPLORER, 19);
    expect(savedOffer(session)).toEqual(offerOf("explorer", 0));
    await result(session, "PLAY AGAIN", EXPLORER, 18);
    expect(savedOffer(session)).toEqual(offerOf("explorer", 1));
  });

  it("is recorded as shown when the card begins to rise in, and not before", async () => {
    const session = await begin({ ageLevel: "explorer", progress: { offer: offerOf("explorer", 2) } });

    await reach(session, "PLAY", EXPLORER, 18);
    expect([asked(), savedOffer(session)]).toEqual([null, offerOf("explorer", 3)]);
    settle(session);

    expect([asked(), savedOffer(session)]).toEqual([asks("paleontologist"), offerOf("explorer", 0, "explorer")]);
  });
});

describe("what restarts the count", () => {
  const TWO = { offer: offerOf("explorer", 2) };

  it("starts again after a weak board", async () => {
    const session = await begin({ ageLevel: "explorer", progress: TWO });

    await result(session, "PLAY", EXPLORER, 19);

    expect(asked()).toBeNull();
    await needs(session, 3, EXPLORER, 18, "paleontologist");
  });

  it.each([
    ["a Hatchling board in 6 tries", 4],
    ["a Hatchling board on climb level 2", 2]
  ] as const)("starts again after %s and Explorer chosen again", async (_, climb) => {
    const session = await begin({ ageLevel: "explorer", progress: { ...TWO, level: climb } });

    await session.user.click(button(nameOf("hatchling")));
    await result(session, "PLAY", { climbLevel: climb }, 6);
    expect(asked()).toBeNull();
    await toWelcome(session);
    await session.user.click(button(nameOf("explorer")));

    await needs(session, 3, EXPLORER, 18, "paleontologist", "PLAY");
  });

  it("keeps the count when levels are chosen without finishing a board", async () => {
    const session = await begin({ ageLevel: "explorer", progress: TWO });

    await session.user.click(button(nameOf("hatchling")));
    await session.user.click(button(nameOf("explorer")));

    expect(savedOffer(session)).toEqual(offerOf("explorer", 2));
    await needs(session, 1, EXPLORER, 18, "paleontologist", "PLAY");
  });
});

describe("a level whose offer was turned down", () => {
  // The Explorer offer on a Hatchling result, risen in.
  async function offerShown() {
    const session = await begin({ progress: { offer: offerOf("hatchling", 2) } });
    await result(session, "PLAY", HATCHLING, 12);
    expect(asked()).toBe(asks("explorer"));
    return session;
  }

  it.each([
    ["taps NOT NOW and plays on at Hatchling", async (session: Session) => {
      await session.user.click(button("NOT NOW"));
      settle(session);
      await deal(session, "PLAY AGAIN", HATCHLING);
      return session;
    }],
    ["taps NOT NOW and finishes a Hatchling board in 20 tries", async (session: Session) => {
      await session.user.click(button("NOT NOW"));
      settle(session);
      await result(session, "PLAY AGAIN", HATCHLING, 20);
      expect(asked()).toBeNull();
      return session;
    }],
    ["taps NOT NOW, finishes an Explorer board and chooses Hatchling again", async (session: Session) => {
      await session.user.click(button("NOT NOW"));
      settle(session);
      await toWelcome(session);
      await session.user.click(button(nameOf("explorer")));
      await result(session, "PLAY", EXPLORER, 18);
      await toWelcome(session);
      await session.user.click(button(nameOf("hatchling")));
      return session;
    }],
    ["reloads the app without an answer", reload]
  ])("waits for 5 strong boards when the child %s", async (_, answer) => {
    const session = await answer(await offerShown());

    await toWelcome(session);
    expect(chosen()).toEqual([nameOf("hatchling")]);
    await needs(session, 5, HATCHLING, 12, "explorer", "PLAY");
  });

  it("leaves the other levels' offers alone", async () => {
    const session = await offerShown();
    await session.user.click(button("NOT NOW"));
    settle(session);
    await toWelcome(session);

    await session.user.click(button(nameOf("explorer")));

    await needs(session, 3, EXPLORER, 18, "paleontologist", "PLAY");
  });

  it("goes away on NOT NOW and leaves the result to be tapped, with the choice as it was", async () => {
    const session = await offerShown();
    const before = session.ageLevels.items.get(AGE_LEVEL_KEY);

    await session.user.click(button("NOT NOW"));
    expect(screen.getByRole("main").hasAttribute("inert")).toBe(true);
    settle(session);

    expect([asked(), screen.getByRole("main").hasAttribute("inert")]).toEqual([null, false]);
    expect(savedOffer(session)).toEqual(offerOf("hatchling", 0, "hatchling"));
    expect((storedPairs(session.storage) as StoredPairs).levelChoice).toBeUndefined();
    expect(session.ageLevels.items.get(AGE_LEVEL_KEY)).toBe(before);
  });
});

describe("an offer shown as the iPad turns", () => {
  const UPRIGHT: PortraitLayouts = { home: ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"], "pairs-result": ["tall"] };
  // A turn glides its parts for 240 ms, the page untouchable meanwhile.
  const GLIDE = 240;
  const turned = (session: Session, to: "portrait" | "landscape") => {
    act(() => session.viewport.turn(to));
    act(() => session.clock.fire(GLIDE));
    expect(document.documentElement.hasAttribute("data-turning")).toBe(false);
  };

  it.each(["portrait", "landscape"] as const)("stays, and its YES still plays the next level, after turning to %s and back", async (first) => {
    const session = await begin({ progress: { offer: offerOf("hatchling", 2) }, portraitLayouts: UPRIGHT, viewport: manualViewport(first === "portrait" ? "landscape" : "portrait") });
    await result(session, "PLAY", HATCHLING, 6);
    expect(asked()).toBe(asks("explorer"));
    turned(session, first);
    expect([asked(), screen.getByRole("dialog").closest("[inert]")]).toEqual([asks("explorer"), null]);
    turned(session, first === "portrait" ? "landscape" : "portrait");
    expect(asked()).toBe(asks("explorer"));
    await session.user.click(button("YES"));
    settle(session);
    expect(asked()).toBeNull();
    expect((storedPairs(session.storage) as StoredPairs).levelChoice).toEqual({ level: "explorer", revision: "picked-hatchling" });
    await deal(session, "PLAY AGAIN", EXPLORER);
    expect(pairCards()).toHaveLength(18);
  });
});

describe('"YES"', () => {
  // The Explorer offer, again, on a Hatchling result after it was turned
  // down, answered "YES".
  async function accepted() {
    const session = await begin({ progress: { offer: offerOf("hatchling", 4, "hatchling") } });
    await result(session, "PLAY", HATCHLING, 12);
    expect(asked()).toBe(asks("explorer"));
    await session.user.click(button("YES"));
    settle(session);
    return session;
  }

  it("goes away, deals the next level, and is what the level switch shows on reopening, with the age level as it was", async () => {
    const session = await accepted();

    expect([asked(), screen.getByRole("main").hasAttribute("inert")]).toEqual([null, false]);
    expect(savedOffer(session)).toEqual(offerOf("hatchling", 0));
    expect((storedPairs(session.storage) as StoredPairs).levelChoice).toEqual({ level: "explorer", revision: "picked-hatchling" });
    await deal(session, "PLAY AGAIN", EXPLORER);
    expect(pairCards()).toHaveLength(18);

    const reopened = await reload(session);
    expect(chosen()).toEqual([nameOf("explorer")]);
    expect(JSON.parse(reopened.ageLevels.items.get(AGE_LEVEL_KEY) ?? "")).toEqual(picked("hatchling"));
  });

  it("leaves HOME to be tapped", async () => {
    const session = await accepted();

    await session.user.click(button("HOME"));

    expect(screen.queryByRole("button", { name: "PLAY AGAIN" })).toBeNull();
    expect(button("FIND THE PAIR")).toBeTruthy();
  });

  it("starts the Paleontologist offer at 3 strong Explorer boards", async () => {
    const session = await accepted();

    await needs(session, 3, EXPLORER, 18, "paleontologist");
  });

  it("starts Hatchling's offer at 3, not 5, if Hatchling is chosen again", async () => {
    const session = await accepted();
    await toWelcome(session);

    await session.user.click(button(nameOf("hatchling")));

    await needs(session, 3, HATCHLING, 12, "explorer", "PLAY");
  });
});

describe("the top level, and moving down", () => {
  // Five strong boards pass both offer counts, three and five after a
  // decline; weak boards each start the count again, so a few show what
  // ten would.
  it.each([
    ["paleontologist", PALEONTOLOGIST, 24, 5],
    ["explorer", EXPLORER, 40, 3]
  ] as const)("never offers on %s boards, and never moves the child down", async (level, board, tries, boards) => {
    const session = await begin({ ageLevel: level });

    for (let played = 0; played < boards; played++) {
      await result(session, played === 0 ? "PLAY" : "PLAY AGAIN", board, tries);
      expect(asked()).toBeNull();
    }

    await toWelcome(session);
    expect(chosen()).toEqual([nameOf(level)]);
    expect((storedPairs(session.storage) as StoredPairs).levelChoice).toBeUndefined();
  });
});

describe("when progress cannot be saved", () => {
  it("still offers, and plays the next level on YES, while the app is open", async () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(entry({ offer: offerOf("explorer", 1) })) }, { save: false });
    const session = await begin({ ageLevel: "explorer", storage });

    await result(session, "PLAY", EXPLORER, 12);
    expect(asked()).toBeNull();
    await result(session, "PLAY AGAIN", EXPLORER, 12);
    expect(asked()).toBe(asks("paleontologist"));
    await session.user.click(button("YES"));
    settle(session);
    await deal(session, "PLAY AGAIN", PALEONTOLOGIST);
    expect(pairCards()).toHaveLength(24);

    const reopened = await reload(session);
    expect(chosen()).toEqual([nameOf("explorer")]);
    await needs(reopened, 2, EXPLORER, 12, "paleontologist", "PLAY");
  });
});

describe("progress saved before the level offer", () => {
  it("reads as no offer yet, with the rest as saved", async () => {
    const saved = entry({ stars: 5, level: 3, boardsOnLevel: 1, best: { 2: 6, explorer: 12 }, found: ["triceratops"], levelChoice: { level: "hatchling", revision: "picked-explorer" } });
    const storage = memoryStorage({ [PROGRESS_KEY]: pairsRecord(saved) });

    await begin({ ageLevel: "explorer", storage });

    expect(localPairsProgress(() => storage).load()).toEqual({
      progress: { stars: 5, climbLevel: 3, boardsOnClimbLevel: 1, best: { 2: 6, explorer: 12 }, found: ["triceratops"] },
      levelChoice: { level: "hatchling", revision: "picked-explorer" },
      offer: NO_LEVEL_OFFER
    });
    expect(storedPairs(storage)).toEqual(saved);
    expect([chosen(), screen.getByLabelText("STARS").textContent]).toEqual([[nameOf("hatchling")], "5"]);
  });

  it.each([
    ["hatchling", HATCHLING, 12, "explorer"],
    ["explorer", EXPLORER, 18, "paleontologist"]
  ] as const)("needs 3 strong %s boards for its offer", async (level, board, tries, next) => {
    const session = await begin({ ageLevel: level });

    await needs(session, 3, board, tries, next, "PLAY");
  });
});

describe("leaving the result before the offer rises in", () => {
  // Two strong Explorer boards, and a third that makes the offer due.
  async function due() {
    const session = await begin({ ageLevel: "explorer", progress: { offer: offerOf("explorer", 2) } });
    await reach(session, "PLAY", EXPLORER, 12);
    expect(asked()).toBeNull();
    return session;
  }

  const offerIsDue = async (session: Session, label: "PLAY" | "PLAY AGAIN") => {
    expect(savedOffer(session)).toEqual(offerOf("explorer", 3));
    await needs(session, 1, EXPLORER, 18, "paleontologist", label);
  };

  it("keeps the offer due after PLAY AGAIN", async () => {
    const session = await due();

    const next = await deal(session, "PLAY AGAIN", EXPLORER);
    settle(session);
    act(() => session.clock.deliverStopped(0));
    expect([asked(), savedOffer(session)]).toEqual([null, offerOf("explorer", 3)]);

    finish(session, next, 18);
    settle(session);
    expect(asked()).toBe(asks("paleontologist"));
  });

  it("keeps the offer due after HOME", async () => {
    const session = await due();

    await toWelcome(session);
    settle(session);

    await offerIsDue(session, "PLAY");
  });

  it("keeps the offer due after a reload", async () => {
    const session = await due();

    const reopened = await reload(session);

    await offerIsDue(reopened, "PLAY");
  });
});
