import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { Viewport } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localSortingProgress } from "../src/localProgress.ts";
import { OrientationGate } from "../src/OrientationGate.tsx";
import { droppedOn, presentBoard } from "../src/presentation.ts";
import { SortScreen, type Basket } from "../src/SortScreen.tsx";
import { useSortingGame, type SortingGameProps } from "../src/sortingGame.tsx";
import { boardState, drop, startBoard, type CardState, type Sorting } from "../src/sorting/index.ts";
import { SHIPPED_SORTABLES, fakeBodyPicture, manualViewport, memoryStorage, seededRandom, type ManualPictures, type MemoryStorage } from "./support.ts";
import { withManualPictures, withPictures } from "./pictures.tsx";

// The board as the app will hold it: the sorting in state above the
// viewport gate, each drop played through the sorting game.
function Board({
  start,
  language,
  viewport,
  seen,
  onHome,
  onSeeResult
}: {
  start: Sorting;
  language: Language;
  viewport: Viewport;
  seen: Sorting[];
  onHome: () => void;
  onSeeResult: () => void;
}) {
  const size = useSyncExternalStore(viewport.subscribe, viewport.sizeClass);
  const [sorting, setSorting] = useState(start);
  const onDrop = useCallback(
    (id: string, basket: Basket) =>
      setSorting((current) => {
        const next = drop(current, id, droppedOn(basket));
        seen.push(next);
        return next;
      }),
    [seen]
  );
  return (
    <OrientationGate shown={size.startsWith("tall")} screenUpright={viewport.isScreenUpright()} language={language}>
      <SortScreen
        language={language}
        {...presentBoard(boardState(sorting), language, fakeBodyPicture)}
        onDrop={onDrop}
        onHome={onHome}
        onSeeResult={onSeeResult}
      />
    </OrientationGate>
  );
}

export type OpenBoard = {
  viewport: ReturnType<typeof manualViewport>;
  // Each sorting the board has played, in order.
  seen: Sorting[];
  homes: number[];
  results: number[];
  unmount: () => void;
};

// The board on its own, its pictures loaded the moment they are asked for
// unless `pictures` loads them.
export function openBoard(start: Sorting, language: Language = "en", pictures?: ManualPictures): OpenBoard {
  const viewport = manualViewport("landscape");
  const seen = [start];
  const homes: number[] = [];
  const results: number[] = [];
  const { unmount } = render(
    <Board
      start={start}
      language={language}
      viewport={viewport}
      seen={seen}
      onHome={() => homes.push(1)}
      onSeeResult={() => results.push(1)}
    />,
    pictures ? withManualPictures(pictures) : withPictures
  );
  return { viewport, seen, homes, results, unmount };
}

export const latest = ({ seen }: OpenBoard): Sorting => {
  const sorting = seen.at(-1);
  if (!sorting) throw new Error("The board has no sorting");
  return sorting;
};

export const tray = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].creatures });

export const trayCard = (card: CardState, language: Language = "en") =>
  within(tray(language)).getByRole("button", { name: card.dinosaur.name[language] });

export const basketButton = (basket: Basket, language: Language = "en") => screen.getByRole("button", { name: TEXTS[language].baskets[basket] });

// The other basket of the board's two.
export const otherBasket = (sorting: Sorting, basket: Basket): Basket => {
  const [first, second] = boardState(sorting).baskets;
  return basket === first ? second : first;
};

// Where things are on the iPad's screen: jsdom lays nothing out, so each
// basket is given its place, side by side under the tray. A third basket
// has the place beyond the two's.
export const BASKET_PLACES = [
  { left: 56, right: 664, top: 420, bottom: 852 },
  { left: 688, right: 1384, top: 420, bottom: 852 },
  { left: 1408, right: 2000, top: 420, bottom: 852 }
] as const;

export const CARD_AT = { clientX: 200, clientY: 300 };
export const AWAY = { clientX: 700, clientY: 380 };

export function layOutBaskets(sorting: Sorting, language: Language = "en") {
  boardState(sorting).baskets.forEach((basket, at) => {
    const place = BASKET_PLACES[at] ?? BASKET_PLACES[0];
    const rect = { ...place, x: place.left, y: place.top, width: place.right - place.left, height: place.bottom - place.top };
    basketButton(basket, language).getBoundingClientRect = () => ({ ...rect, toJSON: () => rect });
  });
}

export const centreOf = (sorting: Sorting, basket: Basket) => {
  const place = BASKET_PLACES[boardState(sorting).baskets.indexOf(basket)] ?? BASKET_PLACES[0];
  return { clientX: (place.left + place.right) / 2, clientY: (place.top + place.bottom) / 2 };
};

// A finger drags `card` from its place to `to` and lets go there.
export async function dragTo(user: UserEvent, card: HTMLElement, to: { clientX: number; clientY: number }, finger = "TouchA") {
  await user.pointer([
    { keys: `[${finger}>]`, target: card, coords: CARD_AT },
    { pointerName: finger, coords: { clientX: (CARD_AT.clientX + to.clientX) / 2, clientY: (CARD_AT.clientY + to.clientY) / 2 } },
    { pointerName: finger, coords: to },
    { keys: `[/${finger}]`, coords: to }
  ]);
}

// The sorting game as the app will hold it: above the viewport gate,
// started by its owner, who is told when the child goes home.
function Game({
  props,
  language,
  viewport,
  owner,
  onHome
}: {
  props: SortingGameProps;
  language: Language;
  viewport: Viewport;
  owner: { start?: () => void };
  onHome: () => void;
}) {
  const size = useSyncExternalStore(viewport.subscribe, viewport.sizeClass);
  const game = useSortingGame(props, { level: "hatchling", revision: null }, onHome, () => {});
  owner.start = game.start;
  // The gate covers every upright window here, so the board's upright
  // width is never read.
  return (
    <OrientationGate shown={size.startsWith("tall")} screenUpright={viewport.isScreenUpright()} language={language}>
      {game.content(language, 0)}
    </OrientationGate>
  );
}

export type OpenGame = {
  user: UserEvent;
  storage: MemoryStorage;
  homes: number[];
  // The next board the game starts, as its random source picks it: the
  // first call gives the board it opens on.
  nextBoard: () => Sorting;
  unmount: () => void;
};

// The sorting game on its first board, its progress kept in `storage`,
// its boards picked by a random source of `seed` and their pictures
// loaded the moment they are asked for.
export function openSortingGame({ storage = memoryStorage(), seed = 1, language = "en" }: { storage?: MemoryStorage; seed?: number; language?: Language } = {}): OpenGame {
  const homes: number[] = [];
  const owner: { start?: () => void } = {};
  const props = {
    sortables: SHIPPED_SORTABLES,
    sortingProgress: localSortingProgress(() => storage),
    bodyPicture: fakeBodyPicture,
    random: seededRandom(seed)
  };
  const { unmount } = render(<Game props={props} language={language} viewport={manualViewport("landscape")} owner={owner} onHome={() => homes.push(1)} />, withPictures);
  act(() => owner.start?.());
  const random = seededRandom(seed);
  let last: Sorting | undefined;
  const nextBoard = () => (last = startBoard(SHIPPED_SORTABLES, "hatchling", random, last));
  return { user: userEvent.setup(), storage, homes, nextBoard, unmount };
}

// Sorts the first `count` cards of `sorting` by taps, a card then a
// basket: the first `right` of them on their first drop, each other one
// on the wrong basket first.
export async function sortCards(user: UserEvent, sorting: Sorting, right: number, { count = boardState(sorting).cards.length, language = "en" as Language } = {}) {
  for (const [at, card] of boardState(sorting).cards.slice(0, count).entries()) {
    const basket = card.basket as Basket;
    if (at >= right) {
      await user.click(trayCard(card, language));
      await user.click(basketButton(otherBasket(sorting, basket), language));
    }
    await user.click(trayCard(card, language));
    await user.click(basketButton(basket, language));
  }
}

// Sorts the whole board, `right` cards on their first drop, and sees its
// result.
export async function finishBoard(user: UserEvent, sorting: Sorting, right: number, language: Language = "en") {
  await sortCards(user, sorting, right, { language });
  await user.click(screen.getByRole("button", { name: TEXTS[language].seeResult }));
}

// A stored record with the sorting game's entry, and the other games'
// entries given.
export const sortingRecord = (entry: unknown, games: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 1, games: { ...games, "sort-dinosaurs": entry } });

// The stored record now, undefined while none is.
export function storedRecord(storage: MemoryStorage): { schemaVersion: unknown; games: Record<string, unknown> } | undefined {
  const raw = storage.items.get(PROGRESS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

// The baskets of the board on screen, in order, by their names.
export const basketsShown = () => [...document.querySelectorAll(".basket")].map((basket) => basket.getAttribute("aria-label"));

// Sorts every card on the tray by taps, trying baskets in order until
// the card lands. `look` is called after each drop.
export async function sortByTrying(user: UserEvent, language: Language = "en", look: () => void = () => {}) {
  const baskets = [...document.querySelectorAll<HTMLElement>(".basket")];
  const [first, second] = baskets;
  if (!first || !second) throw new Error("The board has no two baskets");
  const names = within(tray(language))
    .getAllByRole("button")
    .map((card) => card.getAttribute("aria-label") ?? "");
  for (const name of names) {
    for (const basket of baskets) {
      const card = within(tray(language)).queryByRole("button", { name });
      if (!card) break;
      await user.click(card);
      await user.click(basket);
      look();
    }
  }
}
