import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TEXTS } from "../src/language/texts.ts";
import { board as digBoard, openDigApp } from "./digApp.tsx";
import { board as pairsBoard, openPairsApp, pairCards, playPairs } from "./pairsApp.tsx";
import { board as skeletonBoard, choices, finishLoading, layOutPuzzle, openSkeletonsApp, tray as skeletonTray } from "./skeletonsApp.tsx";
import { basketButton, openSortingGame, tray as sortTray } from "./sorting.tsx";
import { homeTile } from "./support.ts";
import type { Basket } from "../src/SortScreen.tsx";

// The play helpers find a screen's parts by their class; each part is
// what a child's screen reader finds by its role and name.
describe("the parts play finds", () => {
  it("are the dig board, a group named for its sand", () => {
    openDigApp();
    fireEvent.click(homeTile(TEXTS.en.dig));
    expect(screen.getByRole("group", { name: TEXTS.en.sand })).toBe(digBoard());
  });

  it("are the pairs board's cards, its buttons", async () => {
    const { user } = openPairsApp();
    await playPairs(user);
    expect(within(pairsBoard()).getAllByRole("button")).toEqual(pairCards());
  });

  it("are the sort tray, a group of the creatures' buttons, and each basket, a button by its name", () => {
    openSortingGame();
    const tray = screen.getByRole("group", { name: TEXTS.en.creatures });
    expect(tray).toBe(sortTray());
    expect(within(tray).getAllByRole("button")).toEqual([...tray.querySelectorAll('[data-turn-part^="sort-card-"]')]);
    const baskets = [...document.querySelectorAll(".basket")].map((basket) => basket.getAttribute("data-turn-part")?.slice("basket-".length) as Basket);
    expect(baskets.length).toBeGreaterThan(1);
    for (const basket of baskets) expect(screen.getByRole("button", { name: TEXTS.en.baskets[basket] })).toBe(basketButton(basket));
  });

  it("are the skeleton game's choices, board and tray, each a group by its name", async () => {
    const { user, pictures } = openSkeletonsApp();
    expect(within(screen.getByRole("group", { name: TEXTS.en.creatures })).getAllByRole("button")).toEqual(choices());
    const first = choices()[0];
    if (!first) throw new Error("No choice");
    await user.click(first);
    act(() => finishLoading(pictures));
    layOutPuzzle();
    expect(screen.getByRole("group", { name: TEXTS.en.skeleton })).toBe(skeletonBoard());
    expect(screen.getByRole("group", { name: TEXTS.en.bones })).toBe(skeletonTray());
  });
});
