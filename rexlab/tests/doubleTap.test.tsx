import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TEXTS } from "../src/language/texts.ts";
import { boardState, type CardState, type Sorting } from "../src/sorting/index.ts";
import { pairCards, openPairsApp, playPairs, stateAt } from "./pairsApp.tsx";
import { finishLoading, fittedPieces, homeOf, lifted, openHomeApp, openPuzzle, skeletonOf, spotOf } from "./skeletonsApp.tsx";
import { CARD_AT, centreOf, latest, layOutBaskets, openBoard, trayCard } from "./sorting.tsx";
import { gameDoor, sortingBy } from "./support.ts";
import { clickOf, filterTaps, moveAt, pressAt, releaseAt, tapAt } from "./taps.ts";

// double-tap.feature. Its first scenario is in homeMuseum.test.tsx and
// its last in featuredProgress.test.tsx, beside the tests of the screens
// they open. Each test sets up with userEvent, whose taps come at once on
// one spot, and only then puts the filter in.

const position = () => screen.queryByLabelText("NUMBER")?.textContent;
const next = () => screen.getByRole("button", { name: "NEXT" });

// The app on Tyrannosaurus's page in the catalogue, the pictures either
// side of it ready, and the filter before it from then on.
async function onFirstPage() {
  const { user, pictures } = openHomeApp();
  await user.click(gameDoor(TEXTS.en.catalogueTile));
  act(() => finishLoading(pictures));
  await user.click(within(screen.getByRole("group", { name: TEXTS.en.catalogue })).getByRole("button", { name: "Tyrannosaurus" }));
  act(() => finishLoading(pictures));
  expect(position()).toBe("1 / 42");
  filterTaps();
  // Each step's next pictures ready, so a tap let through would go on.
  return () => act(() => finishLoading(pictures));
}

describe("a double tap on a control that stays on screen", () => {
  it("goes on once for the → button tapped again 200 ms after its release", async () => {
    const ready = await onFirstPage();

    tapAt(next(), 0);
    ready();
    tapAt(next(), 250);
    ready();

    expect(position()).toBe("2 / 42");
  });

  it("goes on once for a burst of three taps, each 250 ms after the release before it", async () => {
    const ready = await onFirstPage();

    for (const time of [0, 300, 600]) {
      tapAt(next(), time);
      ready();
    }

    expect(position()).toBe("2 / 42");
  });

  it("does not filter keys: Enter twice on the → button goes on twice", async () => {
    const ready = await onFirstPage();

    next().focus();
    // A button pressed by a key clicks with no pointer's detail.
    fireEvent.click(next(), { detail: 0 });
    ready();
    fireEvent.click(next(), { detail: 0 });
    ready();

    expect(position()).toBe("3 / 42");
  });
});

const PRESS = { x: CARD_AT.clientX, y: CARD_AT.clientY };
const isPicked = (card: HTMLElement) => card.hasAttribute("data-picked");

// A sorting board with its baskets laid out, its first card, and the
// filter before it.
function sortBoard() {
  const sorting: Sorting = sortingBy("diet");
  const opened = openBoard(sorting);
  layOutBaskets(sorting);
  const card = boardState(sorting).cards[0] as CardState;
  filterTaps();
  return { sorting, opened, card };
}

describe("a second tap on a sort card", () => {
  it.each([
    [499, 0, true],
    [500, 0, false],
    [200, 99, true],
    [200, 100, false]
  ])("leaves the card picked up, tapped again %i ms after its release and %i CSS pixels from it: %s", (later, away, picked) => {
    const { card } = sortBoard();
    tapAt(trayCard(card), 0, PRESS);
    expect(isPicked(trayCard(card))).toBe(true);

    tapAt(trayCard(card), 50 + later, { x: PRESS.x + away * 0.6, y: PRESS.y + away * 0.8 });

    expect(isPicked(trayCard(card))).toBe(picked);
  });

  it("is a tap after a drag out and back to its own place", () => {
    const { card } = sortBoard();
    pressAt(trayCard(card), 0, PRESS);
    moveAt(20, { x: PRESS.x + 40, y: PRESS.y });
    moveAt(40, PRESS);
    releaseAt(window, 60, PRESS);
    clickOf(trayCard(card), PRESS);

    tapAt(trayCard(card), 160, PRESS);

    expect(isPicked(trayCard(card))).toBe(true);
  });

  it("stays picked up when a swallowed drag out and back is followed by a tap 200 ms later", () => {
    const { card } = sortBoard();
    tapAt(trayCard(card), 0, PRESS);

    pressAt(trayCard(card), 250, PRESS);
    moveAt(270, { x: PRESS.x + 40, y: PRESS.y });
    moveAt(290, PRESS);
    releaseAt(window, 310, PRESS);
    clickOf(trayCard(card), PRESS);
    tapAt(trayCard(card), 510, PRESS);

    expect(isPicked(trayCard(card))).toBe(true);
  });

  it("does nothing when pressed again and dragged onto its right basket", () => {
    const { sorting, opened, card } = sortBoard();
    tapAt(trayCard(card), 0, PRESS);

    const basket = centreOf(sorting, card.basket);
    pressAt(trayCard(card), 250, PRESS);
    moveAt(270, { x: basket.clientX, y: basket.clientY });
    releaseAt(window, 290, { x: basket.clientX, y: basket.clientY });

    expect(isPicked(trayCard(card))).toBe(true);
    expect(boardState(latest(opened)).landed).toEqual([]);
  });
});

describe("taps far apart", () => {
  it("turns both pair cards, more than 100 CSS pixels apart and 200 ms apart", async () => {
    const { user } = openPairsApp();
    await playPairs(user);
    filterTaps();

    const [first, second] = pairCards();
    tapAt(first as HTMLElement, 0, { x: 0 });
    tapAt(second as HTMLElement, 250, { x: 150 });

    expect([stateAt(0), stateAt(1)]).not.toContain("down");
  });
});

describe("a second press on a bone piece", () => {
  it("does not move it onto its slot", async () => {
    await openPuzzle("TYRANNOSAURUS");
    filterTaps();
    const { left, top } = spotOf("spine").getBoundingClientRect();
    const at = { x: left + 40, y: top + 40 };
    const home = homeOf(skeletonOf("tyrannosaurus"), "spine");

    tapAt(spotOf("spine"), 0, at);
    pressAt(spotOf("spine"), 250, at);
    moveAt(270, { x: home.clientX, y: home.clientY });
    releaseAt(window, 290, { x: home.clientX, y: home.clientY });

    expect([fittedPieces(), lifted()]).toEqual([[], null]);
  });
});

