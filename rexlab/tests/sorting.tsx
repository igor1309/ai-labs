import { render, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { useCallback, useState } from "react";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { OrientationGate, type Orientation } from "../src/OrientationGate.tsx";
import { droppedOn, presentBoard } from "../src/presentation.ts";
import { SortScreen, type Basket } from "../src/SortScreen.tsx";
import { boardState, drop, type CardState, type Sorting } from "../src/sorting/index.ts";
import { fakeBodyPicture, manualOrientation } from "./support.ts";

// The board as the app will hold it: the sorting in state above the
// orientation gate, each drop played through the sorting game.
function Board({
  start,
  language,
  orientation,
  seen,
  onHome,
  onSeeResult
}: {
  start: Sorting;
  language: Language;
  orientation: Orientation;
  seen: Sorting[];
  onHome: () => void;
  onSeeResult: () => void;
}) {
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
    <OrientationGate orientation={orientation} language={language}>
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
  orientation: ReturnType<typeof manualOrientation>;
  // Each sorting the board has played, in order.
  seen: Sorting[];
  homes: number[];
  results: number[];
  unmount: () => void;
};

export function openBoard(start: Sorting, language: Language = "en"): OpenBoard {
  const orientation = manualOrientation("landscape");
  const seen = [start];
  const homes: number[] = [];
  const results: number[] = [];
  const { unmount } = render(
    <Board
      start={start}
      language={language}
      orientation={orientation}
      seen={seen}
      onHome={() => homes.push(1)}
      onSeeResult={() => results.push(1)}
    />
  );
  return { orientation, seen, homes, results, unmount };
}

export const latest = ({ seen }: OpenBoard): Sorting => {
  const sorting = seen.at(-1);
  if (!sorting) throw new Error("The board has no sorting");
  return sorting;
};

export const tray = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].dinosaurs });

export const trayCard = (card: CardState, language: Language = "en") =>
  within(tray(language)).getByRole("button", { name: card.dinosaur.name[language] });

export const basketButton = (basket: Basket, language: Language = "en") => screen.getByRole("button", { name: TEXTS[language].baskets[basket] });

// The other basket of the board's two.
export const otherBasket = (sorting: Sorting, basket: Basket): Basket => {
  const [first, second] = boardState(sorting).baskets;
  return basket === first ? second : first;
};

// Where things are on the iPad's screen: jsdom lays nothing out, so each
// basket is given its place, side by side under the tray.
export const BASKET_PLACES = [
  { left: 56, right: 664, top: 420, bottom: 852 },
  { left: 688, right: 1384, top: 420, bottom: 852 }
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
