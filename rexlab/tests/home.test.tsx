import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { openMenu, outsideMenu } from "./menus.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyProgress,
  englishDevice,
  fakeBodyPicture,
  lightDevice,
  loadedPictures,
  manualPictures,
  manualOrientation,
  memoryStorage,
  seededRandom,
  symbolOf,
  type MemoryStorage
} from "./support.ts";

function openHomePage(progress = emptyProgress(), pictures = loadedPictures()) {
  render(<App dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} orientation={manualOrientation("landscape")} progress={progress} {...englishDevice()} {...lightDevice()} {...emptyCare()} {...pictures} />);
  return { user: userEvent.setup(), card: screen.getByRole("button", { name: "COMPARE" }) };
}

const withStorage = (storage: MemoryStorage) => localProgress(() => storage);

// A stored record in the section 5 format of docs/mvp-infrastructure.md.
const record = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed: 3 } } });

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const moreComing = () => {
  const card = document.querySelector<HTMLElement>(".more-coming");
  if (!card) throw new Error("No MORE COMING card on the page");
  return card;
};

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

describe("the home page", () => {
  it("offers the quiz as a card with the app's own Tyrannosaurus and Brachiosaurus facing off", () => {
    const { card } = openHomePage();

    expect(card.textContent).toBe("COMPARE");
    expect(symbolOf(card)).toBe("scale");
    const faceOff = within(card).getByRole("img", { name: "TWO DINOSAURS" });
    const pictures = [...faceOff.querySelectorAll("img")];
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([fakeBodyPicture("tyrannosaurus"), fakeBodyPicture("brachiosaurus")]);
  });

  it("lays the games out in three columns, 5 : 3 : 2 of the width: COMPARE, ALL DINOSAURS over CARE, then MORE COMING as tall as them", () => {
    const { card } = openHomePage();

    const games = card.parentElement;
    expect(games?.classList.contains("games")).toBe(true);
    const catalogue = screen.getByRole("button", { name: "ALL DINOSAURS" });
    const care = screen.getByRole("button", { name: "CARE" });
    const tiles = catalogue.parentElement;
    expect([...(tiles?.children ?? [])]).toEqual([catalogue, care]);
    expect([...(games?.children ?? [])]).toEqual([card, tiles, moreComing()]);
    expect(
      [card, tiles, moreComing()].map((column) => {
        const style = getComputedStyle(column ?? card);
        return [style.flexGrow, style.flexBasis, style.alignSelf];
      })
    ).toEqual([
      ["5", "0px", "auto"],
      ["3", "0px", "auto"],
      ["2", "0px", "auto"]
    ]);
    expect(getComputedStyle(games ?? card).alignItems).toBe("normal");
  });

  it("keeps the titles of the quiz card and the tiles on one line, the tiles' sized by their own width", () => {
    openHomePage(withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })));

    const words = document.querySelectorAll(".quiz-card-title, .catalogue-tile-title, .care-tile-title");
    expect([...words].map((title) => [title.textContent, getComputedStyle(title).whiteSpace])).toEqual([
      ["COMPARE", "nowrap"],
      ["ALL DINOSAURS", "nowrap"],
      ["CARE", "nowrap"]
    ]);
    expect([".catalogue-tile", ".care-tile"].map((tile) => getComputedStyle(document.querySelector(tile) ?? document.body).getPropertyValue("container-type"))).toEqual([
      "inline-size",
      "inline-size"
    ]);
  });

  it("shows MORE COMING beside the tiles as a picture, not a button: a faded Triceratops over a lock", () => {
    openHomePage();

    const card = moreComing();
    expect(card.textContent).toBe("MORE COMING");
    expect(symbolsOf(card)).toEqual(["lock"]);
    const picture = card.querySelector("img");
    expect(picture?.getAttribute("src")).toBe(fakeBodyPicture("triceratops"));
    expect(Number(getComputedStyle(picture ?? card).opacity)).toBeLessThan(1);
    expect(card.closest("button")).toBeNull();
    expect(within(card).queryAllByRole("button")).toEqual([]);
    expect([card, ...card.querySelectorAll("*")].filter((element) => element instanceof HTMLElement && element.tabIndex >= 0)).toEqual([]);
  });

  it("does nothing on a tap or a press of MORE COMING, and it neither brightens nor presses in", async () => {
    const { user } = openHomePage();
    const card = moreComing();
    const before = document.body.innerHTML;

    await user.hover(card);
    expect(brightness(card)).toBe(1);
    await user.pointer({ keys: "[TouchA>]", target: card });
    expect([brightness(card), getComputedStyle(card).transform]).toEqual([1, "none"]);
    await user.pointer({ keys: "[/TouchA]", target: card });
    await user.click(card);
    await user.unhover(card);

    expect(document.body.innerHTML).toBe(before);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();
  });

  it("shows the best score in the quiz card's corner, over the face-off, beside a trophy", () => {
    const { card } = openHomePage(withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })));

    const best = card.querySelector(".quiz-card-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "7"]);
    expect(best?.parentElement).toBe(card);
    expect(card.querySelector(".quiz-card-footer")?.contains(best)).toBe(false);
    const [cardStyle, style] = [getComputedStyle(card), getComputedStyle(best ?? card)];
    expect([cardStyle.position, style.position]).toEqual(["relative", "absolute"]);
    expect([style.top, style.right]).toEqual(["24px", "24px"]);
  });

  it.each([
    ["no round finished yet", memoryStorage()],
    ["no best kept", memoryStorage({ [PROGRESS_KEY]: record(null) })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: record(7) }, { read: false })]
  ])("shows no best score on the quiz card with %s", (_, storage) => {
    const { card } = openHomePage(withStorage(storage));

    expect(card.querySelector(".quiz-card-best")).toBeNull();
    expect(symbolsOf(card)).toEqual(["scale"]);
  });

  it("shows the RexLab wordmark, small, in the top-left corner", () => {
    const { card } = openHomePage();

    const wordmark = screen.getByText("RexLab");
    const style = getComputedStyle(wordmark);
    expect(style.position).toBe("fixed");
    expect(style.top).toMatch(/^[\d.]+(px|rem)$/);
    expect(style.left).toMatch(/^[\d.]+(px|rem)$/);
    expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(within(card).getByText("COMPARE")).fontSize) / 2);
  });

  it("opens one menu for parents at a time, and a tap outside it does not start a round", async () => {
    const { user } = openHomePage();

    await openMenu(user, "Language");
    await openMenu(user, "Theme");

    expect(screen.getAllByRole("menu").map((menu) => menu.getAttribute("aria-label"))).toEqual(["Theme"]);

    await user.click(outsideMenu());

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();
    expect(document.querySelector(".menu-backdrop")).toBeNull();
  });

  it("closes a menu for parents with Escape, back on its button, after the keys move through its choices", async () => {
    const { user } = openHomePage();

    const menu = await openMenu(user, "Theme");

    expect(document.activeElement?.textContent).toBe("System");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Light");
    await user.keyboard("{End}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("System");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await user.keyboard("{Home}");
    expect(document.activeElement?.textContent).toBe("System");
    expect(menu.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("brightens the quiz card under a pointer", async () => {
    const { user, card } = openHomePage();
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it("shows the card pressed before the round opens", async () => {
    const { user, card } = openHomePage();

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it("starts a round of 10 questions on a tap", async () => {
    const { user, card } = openHomePage();

    await user.click(card);

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
    expect(within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button")).toHaveLength(2);
  });
});

describe("the first question of a round", () => {
  const progressShown = () => screen.queryByLabelText("PROGRESS")?.textContent;
  const picturesShown = () =>
    within(screen.getByRole("group", { name: "DINOSAURS" }))
      .getAllByRole("img")
      .map((picture) => picture.getAttribute("src"));

  it("waits for its pictures, with the home page on screen until both have loaded", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.click(card);

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    act(() => pictures.finish(asked[0] ?? ""));
    expect(progressShown()).toBeUndefined();
    expect(screen.getByRole("button", { name: "COMPARE" })).toBeDefined();

    act(() => pictures.finish(asked[1] ?? ""));

    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
    expect(pictures.timers()).toEqual([]);
  });

  it("starts after a second when its pictures are slow, and not again when they arrive", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);
    await user.click(card);
    const asked = pictures.loading();

    act(() => pictures.fire(1000));

    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
    const first = document.body.innerHTML;
    act(() => asked.forEach(pictures.finish));
    expect(document.body.innerHTML).toBe(first);
  });

  it("starts one round on a quick double tap while its pictures load", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.dblClick(card);

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    act(() => asked.forEach(pictures.finish));
    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
  });
});
