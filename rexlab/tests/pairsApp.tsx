import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { App, type AppProps } from "../src/App.tsx";
import { dealBoard, type Board, type Level, type Pal, type PairsProgress, type Random } from "../src/pairs/index.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localPairsProgress, localProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SORTABLES,
  SHIPPED_VISITORS,
  emptySkeletons,
  fakeBodyPicture,
  fakeItemPicture,
  manualAppearance,
  manualOrientation,
  manualTimers,
  memoryStorage,
  unreadVersion,
  type ManualOrientation,
  type ManualTimers,
  type MemoryStorage
} from "./support.ts";

type Clock = Pick<AppProps, "loadPicture" | "startTimer">;

// Timers a test fires itself.
type Timers = Pick<ManualTimers, "timers" | "fire">;

export type PairsAppOptions<C extends Clock> = {
  // Where progress, the language and the theme are kept: one storage, as
  // in a browser, so reopening the app on it is a reload.
  storage?: MemoryStorage;
  pals?: readonly Pal[];
  random?: Random;
  clock?: C;
  reducedMotion?: boolean;
  orientation?: ManualOrientation;
  deviceLanguage?: string;
};

// The app as a child opens it to find pairs.
export function openPairsApp<C extends Clock = ReturnType<typeof manualTimers>>({
  storage = memoryStorage(),
  pals = SHIPPED_PALS,
  random = () => 0,
  clock = manualTimers() as unknown as C,
  reducedMotion = false,
  orientation = manualOrientation("landscape"),
  deviceLanguage = "en-GB"
}: PairsAppOptions<C> = {}) {
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      orientation={orientation}
      progress={localProgress(() => storage)}
      deviceLanguage={deviceLanguage}
      languageStore={localLanguage(() => storage)}
      nameVersion={unreadVersion}
      appearance={manualAppearance("light")}
      themeStore={localTheme(() => storage)}
      visitors={SHIPPED_VISITORS}
      careProgress={localCareProgress(() => storage)}
      itemPicture={fakeItemPicture}
      pals={pals}
      pairsProgress={localPairsProgress(() => storage)}
      {...emptySkeletons()}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(() => storage)}
      reducedMotion={() => reducedMotion}
      {...clock}
    />
  );
  return { user: userEvent.setup(), clock, storage, unmount: view.unmount };
}

// A stored record with find the pair's entry, and the other games'
// entries given.
export const pairsRecord = (pairs: Partial<PairsProgress> | unknown, games: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 1, games: { ...games, "find-the-pair": pairs } });

// Find the pair's entry as stored now, undefined while none is.
export function storedPairs(storage: MemoryStorage): unknown {
  const raw = storage.items.get(PROGRESS_KEY);
  return raw === undefined ? undefined : (JSON.parse(raw) as { games?: Record<string, unknown> }).games?.["find-the-pair"];
}

// How long a miss stays open.
export const MISS = 1000;

// The board, whatever the language.
export function board(): HTMLElement {
  const found = document.querySelector<HTMLElement>(".pair-board");
  if (!found) throw new Error("No board on the screen");
  return found;
}
export const pairCards = () => within(board()).getAllByRole("button");

const cardAt = (place: number) => {
  const card = pairCards()[place];
  if (!card) throw new Error(`No card at ${place}`);
  return card;
};

// What a card shows: "down", "open" or "found".
export const stateAt = (place: number) => cardAt(place).getAttribute("data-state");

// A card's name once it is turned over, its place while it is face down.
export const labelAt = (place: number) => cardAt(place).getAttribute("aria-label") ?? "";

export const triesShown = () => screen.getByLabelText("TRIES").textContent;

export async function turnCard(user: UserEvent, place: number) {
  await user.click(cardAt(place));
}

// Opens the game and deals a board, its pictures loaded at once.
export async function playPairs(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "FIND THE PAIR" }));
  await user.click(screen.getByRole("button", { name: "PLAY" }));
}

// Turns the cards in twos from the first until a miss shows, and leaves it
// open. Returns the tries made.
export async function showMiss(user: UserEvent): Promise<number> {
  for (let place = 0; place + 1 < pairCards().length; place += 2) {
    await turnCard(user, place);
    await turnCard(user, place + 1);
    if (stateAt(place) === "open") return place / 2 + 1;
  }
  throw new Error("Every pair on the board lay side by side");
}

// Finds every pair left as a child who forgets no card does: a pair seen
// is turned at once, and otherwise an unseen card, then its seen match or
// another unseen card. Each miss is let turn back. Returns the tries made;
// after the last pair the cards are left waving.
export async function playBoard(user: UserEvent, clock: Timers): Promise<number> {
  const seen = new Map<number, string>();
  const turn = async (place: number) => {
    await turnCard(user, place);
    seen.set(place, labelAt(place));
  };
  let tries = 0;
  for (;;) {
    const down = pairCards()
      .map((_, place) => place)
      .filter((place) => stateAt(place) === "down");
    if (down.length === 0) return tries;
    const unseen = (but: number) => down.find((place) => place !== but && !seen.has(place));
    const known = down.find((place) => seen.has(place) && down.some((other) => other !== place && seen.get(other) === seen.get(place)));
    let first = known;
    if (first === undefined) first = unseen(-1);
    if (first === undefined) throw new Error("No card to turn");
    await turn(first);
    const name = labelAt(first);
    const second = down.find((place) => place !== first && seen.get(place) === name) ?? unseen(first);
    if (second === undefined) throw new Error(`No card to turn after ${name}`);
    await turn(second);
    tries++;
    if (stateAt(second) === "open") act(() => clock.fire(MISS));
  }
}

// Lets the cards' wave end, and the result show.
export function endWave(clock: Timers) {
  const [first] = clock.timers();
  if (first === undefined) throw new Error("No wave is playing");
  act(() => clock.fire(first));
}

// The board the app deals with `random` after `previous`, so a test knows
// which dinosaur is where. The app takes nothing else from `random` on
// the way to a board.
export const dealt = (level: Level, { pals = SHIPPED_PALS, random = () => 0, previous }: { pals?: readonly Pal[]; random?: Random; previous?: Board } = {}) =>
  dealBoard(pals, level, random, previous);

// The names of a board's cards, place by place, as their labels read
// once turned over.
export const namesOf = (dealtBoard: Board) => dealtBoard.cards.map(({ pal }) => pal.name.en.toLocaleUpperCase("en"));

// The places of the cards of `name`.
export const placesOf = (names: readonly string[], name: string) => names.flatMap((each, place) => (each === name ? [place] : []));

// Plays a board whose cards are `names`, place by place: `misses` misses
// first, each let turn back, then every pair at the first try, in the
// order the board deals them. Leaves the cards waving.
export async function playDealt(user: UserEvent, clock: Timers, names: readonly string[], misses = 0) {
  const other = names.findIndex((name) => name !== names[0]);
  for (let miss = 0; miss < misses; miss++) {
    await turnCard(user, 0);
    await turnCard(user, other);
    act(() => clock.fire(MISS));
  }
  for (const name of new Set(names)) {
    for (const place of placesOf(names, name)) await turnCard(user, place);
  }
}
