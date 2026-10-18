import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SortScreen, type Basket } from "../src/SortScreen.tsx";
import { boardState, score, type CardState, type Property, type Sorting } from "../src/sorting/index.ts";
import { AWAY, basketButton, centreOf, dragTo, latest, layOutBaskets, openBoard, otherBasket, tray, trayCard } from "./sorting.tsx";
import { withPictures } from "./pictures.tsx";
import { fakeBodyPicture, manualPictures, sortingBy, symbolOf, words, type ManualPictures } from "./support.ts";

const cardsOf = (sorting: Sorting) => boardState(sorting).cards;

function nthCard(sorting: Sorting, at: number): CardState {
  const card = cardsOf(sorting)[at];
  if (!card) throw new Error(`The board has no card ${at}`);
  return card;
}

const sortedIn = (basket: Basket) => [...basketButton(basket).querySelectorAll(".sorted-card")].map((card) => words(card as HTMLElement));
const isPicked = (card: HTMLElement) => card.hasAttribute("data-picked") && card.getAttribute("aria-pressed") === "true";
const filledSteps = () => document.querySelectorAll('.step[data-step="done"]').length;

describe("a new board", () => {
  it("shows the prompt, two baskets and six cards, each with its own dinosaur's picture and name in capitals", () => {
    const sorting = sortingBy("diet");
    openBoard(sorting);

    const heading = screen.getByRole("heading", { name: "SORT THE DINOSAURS" });
    expect([symbolOf(heading), words(heading)]).toEqual(["shapes", "SORT THE DINOSAURS"]);
    expect(screen.getAllByRole("button", { name: /^(PLANTS|MEAT)$/ })).toHaveLength(2);
    const cards = within(tray()).getAllByRole("button");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(cardsOf(sorting).map(({ dinosaur }) => dinosaur.name.en));
    for (const { dinosaur } of cardsOf(sorting)) {
      const card = trayCard({ dinosaur } as CardState);
      expect(within(card).getByRole("img", { name: dinosaur.name.en }).getAttribute("src")).toBe(fakeBodyPicture(dinosaur.id));
      expect(words(card)).toBe(dinosaur.name.en.toUpperCase());
      expect(getComputedStyle(card.querySelector(".sort-name") ?? card).fontWeight).toBe("700");
    }
  });

  it("has a HOME button with a house, away from the cards", () => {
    openBoard(sortingBy("legs"));

    const home = screen.getByRole("button", { name: "HOME" });
    expect([symbolOf(home), words(home)]).toEqual(["house", "HOME"]);
    expect(tray().contains(home)).toBe(false);
  });

  it.each<[Property, [string, string], [string, string]]>([
    ["legs", ["TWO LEGS", "2 footprints"], ["FOUR LEGS", "4 footprints"]],
    ["diet", ["PLANTS", "leaf"], ["MEAT", "drumstick"]],
    ["size", ["BIG", "footprints"], ["SMALL", "footprints"]],
    ["horns", ["HORNS", "horn"], ["NO HORNS", "horn crossed"]],
    ["feathers", ["FEATHERS", "feather"], ["NO FEATHERS", "feather crossed"]]
  ])("sorting by %s, shows the baskets %j and %j, each with its symbol", (property, first, second) => {
    openBoard(sortingBy(property));

    const baskets = within(document.querySelector(".baskets") as HTMLElement).getAllByRole("button");
    const shown = baskets.map((basket) => {
      const mark = basket.querySelector(".basket-mark") ?? basket;
      const count = mark.querySelector(".legs-count")?.textContent;
      const crossed = mark.querySelector("svg path.cross") ? " crossed" : "";
      return [words(basket), `${count ? `${count} ` : ""}${symbolOf(mark)}${crossed}`];
    });
    expect(shown).toEqual([first, second]);
  });

  it("draws BIG's footprint larger than SMALL's", () => {
    openBoard(sortingBy("size"));

    const width = (basket: Basket) => Number(basketButton(basket).querySelector(".basket-mark svg")?.getAttribute("width"));
    expect(width("big")).toBeGreaterThan(width("small") * 2);
  });

  it.each([
    ["en", "Pachycephalosaurus"],
    ["ru", "Пахицефалозавр"]
  ] as const)("fits a long name on one line inside its card, on the tray and in a basket, in %s", (language, name) => {
    const tray = [{ id: "pachycephalosaurus", name, picture: fakeBodyPicture("pachycephalosaurus"), hint: undefined }];
    const nothing = () => {};
    render(
      <SortScreen
        language={language}
        tray={tray}
        baskets={[
          { basket: "horns", cards: [{ id: "pachycephalosaurus-2", name, picture: fakeBodyPicture("pachycephalosaurus") }] },
          { basket: "no-horns", cards: [] }
        ]}
        sorted={1}
        total={2}
        glow={undefined}
        onDrop={nothing}
        onHome={nothing}
        onSeeResult={nothing}
      />,
      withPictures
    );

    const names = [...document.querySelectorAll<HTMLElement>(".sort-name, .sorted-name")];
    expect(names.map((each) => each.textContent)).toEqual([name.toLocaleUpperCase(language), name.toLocaleUpperCase(language)]);
    for (const each of names) {
      const style = getComputedStyle(each);
      // Each name's size falls with its letters, from the card's width, so
      // it shrinks to fit rather than wrap or be cut off.
      expect(each.style.getPropertyValue("--letters")).toBe(String(name.length));
      expect(style.whiteSpace).toBe("nowrap");
      expect(getComputedStyle(each.parentElement ?? each).getPropertyValue("container-type")).toBe("inline-size");
    }
  });
});

describe("dragging a card", () => {
  it("lights the basket under it, and lands it in its right basket with a ✓, counted as right", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("legs");
    const opened = openBoard(sorting);
    layOutBaskets(sorting);
    const card = nthCard(sorting, 0);
    const right = card.basket as Basket;

    await user.pointer([
      { keys: "[TouchA>]", target: trayCard(card), coords: { clientX: 200, clientY: 300 } },
      { pointerName: "TouchA", coords: centreOf(sorting, right) }
    ]);

    expect(basketButton(right).hasAttribute("data-over")).toBe(true);
    expect(basketButton(otherBasket(sorting, right)).hasAttribute("data-over")).toBe(false);
    expect(trayCard(card).hasAttribute("data-dragging")).toBe(true);
    expect(trayCard(card).style.translate).not.toBe("");

    await user.pointer({ keys: "[/TouchA]", coords: centreOf(sorting, right) });

    expect(within(tray()).queryByRole("button", { name: card.dinosaur.name.en })).toBeNull();
    expect(sortedIn(right)).toEqual([card.dinosaur.name.en.toUpperCase()]);
    const sorted = basketButton(right).querySelector(".sorted-card") as HTMLElement;
    expect(symbolOf(within(sorted).getByRole("img", { name: "RIGHT" }))).toBe("check");
    expect(within(sorted).getByRole("img", { name: card.dinosaur.name.en }).getAttribute("src")).toBe(fakeBodyPicture(card.dinosaur.id));
    expect(score(latest(opened))).toBe(1);
    // The card leaves an empty slot, so the others stay in their places.
    expect(tray().children[0]?.className).toBe("sort-slot");
    expect(basketButton(right).hasAttribute("data-over")).toBe(false);
  });

  it("slides a card dropped on the wrong basket back to its place, with its right basket's symbol as a hint, and glows that basket", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("diet");
    const opened = openBoard(sorting);
    layOutBaskets(sorting);
    const card = nthCard(sorting, 1);
    const right = card.basket as Basket;
    const wrong = otherBasket(sorting, right);

    await dragTo(user, trayCard(card), centreOf(sorting, wrong));

    const back = trayCard(card);
    expect(back.hasAttribute("data-returning")).toBe(true);
    expect(back.hasAttribute("data-dragging")).toBe(false);
    expect(back.style.getPropertyValue("--from-y")).not.toBe("");
    expect(within(tray()).getAllByRole("button")[1]).toBe(back);
    const hint = within(back).getByRole("img", { name: right.toUpperCase() });
    expect(symbolOf(hint)).toBe(right === "plants" ? "leaf" : "drumstick");
    expect(hint.getAttribute("data-basket")).toBe(right);
    expect(basketButton(right).querySelector(".basket-glow")).not.toBeNull();
    expect(basketButton(wrong).querySelector(".basket-glow")).toBeNull();
    expect(sortedIn(wrong)).toEqual([]);

    await dragTo(user, back, centreOf(sorting, right));

    expect(sortedIn(right)).toEqual([card.dinosaur.name.en.toUpperCase()]);
    // It counts as wrong, even once it lands.
    expect(score(latest(opened))).toBe(0);
    expect(boardState(latest(opened)).landed.map(({ missed }) => missed)).toEqual([true]);
  });

  it("slides back again from a second wrong drop, and glows the right basket anew", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("horns");
    openBoard(sorting);
    layOutBaskets(sorting);
    const card = nthCard(sorting, 2);
    const right = card.basket as Basket;
    const wrong = otherBasket(sorting, right);

    await dragTo(user, trayCard(card), centreOf(sorting, wrong));
    const firstGlow = basketButton(right).querySelector(".basket-glow");
    await dragTo(user, trayCard(card), centreOf(sorting, wrong));

    expect(trayCard(card).hasAttribute("data-returning")).toBe(true);
    expect(basketButton(right).querySelector(".basket-glow")).not.toBe(firstGlow);
    expect(sortedIn(wrong)).toEqual([]);

    await dragTo(user, trayCard(card), centreOf(sorting, right));

    expect(sortedIn(right)).toEqual([card.dinosaur.name.en.toUpperCase()]);
  });

  it("slides a card let go away from the baskets back, counting nothing, and it counts as right when then dropped on its basket", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("feathers");
    const opened = openBoard(sorting);
    layOutBaskets(sorting);
    const card = nthCard(sorting, 0);

    await dragTo(user, trayCard(card), AWAY);

    expect(trayCard(card).hasAttribute("data-returning")).toBe(true);
    expect(within(trayCard(card)).queryByRole("img", { name: /FEATHERS/ })).toBeNull();
    expect(opened.seen).toEqual([sorting]);
    expect(document.querySelector(".basket-glow")).toBeNull();

    await dragTo(user, trayCard(card), centreOf(sorting, card.basket as Basket));

    expect(score(latest(opened))).toBe(1);
  });

  it("moves one card at a time: a second finger moves nothing while one card is dragged", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("size");
    const opened = openBoard(sorting);
    layOutBaskets(sorting);
    const [first, second] = [nthCard(sorting, 0), nthCard(sorting, 1)];

    await user.pointer([
      { keys: "[TouchA>]", target: trayCard(first), coords: { clientX: 200, clientY: 300 } },
      { pointerName: "TouchA", coords: { clientX: 200, clientY: 360 } },
      { keys: "[TouchB>]", target: trayCard(second), coords: { clientX: 400, clientY: 300 } },
      { pointerName: "TouchB", coords: centreOf(sorting, second.basket as Basket) }
    ]);

    expect(trayCard(second).hasAttribute("data-dragging")).toBe(false);
    expect(trayCard(second).style.translate).toBe("");
    expect(trayCard(first).hasAttribute("data-dragging")).toBe(true);

    await user.pointer({ keys: "[/TouchB]", coords: centreOf(sorting, second.basket as Basket) });

    expect(opened.seen).toEqual([sorting]);
    expect(trayCard(first).hasAttribute("data-dragging")).toBe(true);

    await user.pointer([
      { pointerName: "TouchA", coords: centreOf(sorting, first.basket as Basket) },
      { keys: "[/TouchA]", coords: centreOf(sorting, first.basket as Basket) }
    ]);

    expect(boardState(latest(opened)).landed.map(({ dinosaur }) => dinosaur.id)).toEqual([first.dinosaur.id]);
  });
});

// How a card's picture is not shown: still loading, or failed. A sorted
// card is a place of its own, so a failed picture is loaded again there.
const NOT_SHOWN = [
  ["still loading", () => {}, (pictures: ManualPictures, url: string) => pictures.finish(url), ["loading", "appearing"]],
  ["failed", (pictures: ManualPictures, url: string) => pictures.fail(url), (pictures: ManualPictures, url: string) => pictures.fail(url), ["loading", "failed"]]
] as const;

// Each way a card is moved to a basket.
const MOVES = [
  ["a drag", async (user: UserEvent, sorting: Sorting, card: HTMLElement, basket: Basket) => dragTo(user, card, centreOf(sorting, basket))],
  [
    "taps",
    async (user: UserEvent, _: Sorting, card: HTMLElement, basket: Basket) => {
      await user.click(card);
      await user.click(basketButton(basket));
    }
  ]
] as const;

const lookIn = (element: Element | null) => element?.querySelector<HTMLElement>(".picture")?.dataset.picture;

describe("a card whose picture is not shown", () => {
  it.each(NOT_SHOWN.flatMap((shown) => MOVES.map((move) => [...shown, ...move] as const)))(
    "lands, its picture %s, in its right basket by %s, named, its place there shimmering, then as the picture ends",
    async (_, before, after, looks, __, move) => {
      const user = userEvent.setup();
      const pictures = manualPictures();
      const sorting = sortingBy("diet");
      openBoard(sorting, "en", pictures);
      layOutBaskets(sorting);
      const card = nthCard(sorting, 1);
      const url = fakeBodyPicture(card.dinosaur.id);
      act(() => before(pictures, url));
      const right = card.basket as Basket;

      await move(user, sorting, trayCard(card), right);

      const sorted = basketButton(right).querySelector(".sorted-card");
      expect([sortedIn(right), lookIn(sorted)]).toEqual([[card.dinosaur.name.en.toUpperCase()], looks[0]]);
      act(() => after(pictures, url));
      expect(lookIn(sorted)).toBe(looks[1]);
    }
  );

  it.each(NOT_SHOWN)("slides back to its place on a miss, its picture %s, named and hinted, its place shimmering, and glows its right basket", async (_, before, after, looks) => {
    const user = userEvent.setup();
    const pictures = manualPictures();
    const sorting = sortingBy("diet");
    openBoard(sorting, "en", pictures);
    layOutBaskets(sorting);
    const card = nthCard(sorting, 1);
    const url = fakeBodyPicture(card.dinosaur.id);
    act(() => before(pictures, url));
    const right = card.basket as Basket;

    await dragTo(user, trayCard(card), centreOf(sorting, otherBasket(sorting, right)));

    const back = trayCard(card);
    expect([back.hasAttribute("data-returning"), words(back.querySelector(".sort-name") as HTMLElement), back.querySelector(".sort-hint")?.getAttribute("data-basket"), lookIn(back)]).toEqual([true, card.dinosaur.name.en.toUpperCase(), right, looks[0]]);
    expect(basketButton(right).querySelector(".basket-glow")).not.toBeNull();
    act(() => after(pictures, url));
    expect(lookIn(trayCard(card))).toBe(looks[1]);
  });

  it("slides back to its place when let go away from the baskets, its picture still loading, its place shimmering, and nothing counts", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("diet");
    const opened = openBoard(sorting, "en", manualPictures());
    layOutBaskets(sorting);
    const card = nthCard(sorting, 1);

    await dragTo(user, trayCard(card), AWAY);

    expect([trayCard(card).hasAttribute("data-returning"), lookIn(trayCard(card)), opened.seen]).toEqual([true, "loading", [sorting]]);
  });
});

describe("tapping", () => {
  it("picks a card up, and a tap on a basket drops it there, as if dragged", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("legs");
    const opened = openBoard(sorting);
    const [first, second] = [nthCard(sorting, 0), nthCard(sorting, 1)];

    await user.click(trayCard(first));

    expect(isPicked(trayCard(first))).toBe(true);

    await user.click(basketButton(first.basket as Basket));

    expect(sortedIn(first.basket as Basket)).toEqual([first.dinosaur.name.en.toUpperCase()]);
    expect(score(latest(opened))).toBe(1);

    await user.click(trayCard(second));
    await user.click(basketButton(otherBasket(sorting, second.basket as Basket)));

    expect(isPicked(trayCard(second))).toBe(false);
    expect(within(trayCard(second)).getByRole("img", { name: (second.basket as string).replace("-", " ").toUpperCase() })).toBeDefined();
  });

  it.each<[string, (sorting: Sorting) => HTMLElement]>([
    ["the same card", (sorting) => trayCard(nthCard(sorting, 1))],
    ["an empty slot", () => tray().querySelector(".sort-slot") as HTMLElement],
    ["the space between", () => document.querySelector(".sort") as HTMLElement],
    ["the prompt", () => screen.getByRole("heading")],
    ["a sorted card", (sorting) => basketButton(nthCard(sorting, 0).basket as Basket).querySelector(".sorted-card") as HTMLElement]
  ])("puts a picked card down at a tap on %s, and nothing counts", async (_, target) => {
    const user = userEvent.setup();
    const sorting = sortingBy("diet");
    const opened = openBoard(sorting);
    const [sorted, card] = [nthCard(sorting, 0), nthCard(sorting, 1)];
    await user.click(trayCard(sorted));
    await user.click(basketButton(sorted.basket as Basket));
    await user.click(trayCard(card));

    await user.click(target(sorting));

    expect(isPicked(trayCard(card))).toBe(false);
    expect(opened.seen).toHaveLength(2);
    expect(within(tray()).getAllByRole("button")).toHaveLength(5);
  });

  it("picks another card up instead at a tap on it", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("diet");
    openBoard(sorting);
    const [first, second] = [nthCard(sorting, 0), nthCard(sorting, 1)];

    await user.click(trayCard(first));
    await user.click(trayCard(second));

    expect([isPicked(trayCard(first)), isPicked(trayCard(second))]).toEqual([false, true]);
  });

  it("puts a picked card down when another card is dragged, and the dragged one moves", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("diet");
    openBoard(sorting);
    layOutBaskets(sorting);
    const [first, second] = [nthCard(sorting, 0), nthCard(sorting, 1)];

    await user.click(trayCard(first));
    await user.pointer([
      { keys: "[TouchA>]", target: trayCard(second), coords: { clientX: 400, clientY: 300 } },
      { pointerName: "TouchA", coords: { clientX: 420, clientY: 360 } }
    ]);

    expect(isPicked(trayCard(first))).toBe(false);
    expect(trayCard(second).hasAttribute("data-dragging")).toBe(true);
    expect(trayCard(second).style.translate).toBe("20px 60px");
  });

  it("changes nothing at a tap on a basket with no card picked up", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("horns");
    const opened = openBoard(sorting);
    const before = document.body.innerHTML;

    await user.click(basketButton("horns"));

    expect(opened.seen).toEqual([sorting]);
    expect(document.body.innerHTML).toBe(before);
  });

  it("does not move a sorted card, dragged or tapped, nor change the score", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("legs");
    const opened = openBoard(sorting);
    layOutBaskets(sorting);
    const card = nthCard(sorting, 0);
    const right = card.basket as Basket;
    await user.click(trayCard(card));
    await user.click(basketButton(right));
    const sorted = () => basketButton(right).querySelector(".sorted-card") as HTMLElement;

    await user.click(sorted());
    await user.pointer([
      { keys: "[TouchA>]", target: sorted(), coords: centreOf(sorting, right) },
      { pointerName: "TouchA", coords: centreOf(sorting, otherBasket(sorting, right)) },
      { keys: "[/TouchA]", coords: centreOf(sorting, otherBasket(sorting, right)) }
    ]);

    expect(sortedIn(right)).toEqual([card.dinosaur.name.en.toUpperCase()]);
    expect(sortedIn(otherBasket(sorting, right))).toEqual([]);
    expect(opened.seen).toHaveLength(2);
    expect(score(latest(opened))).toBe(1);
  });
});

describe("the round on the board", () => {
  it("fills one progress step, with no numbers, for each card sorted", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("size");
    openBoard(sorting);

    expect([document.querySelectorAll(".step").length, filledSteps()]).toEqual([6, 0]);
    for (const card of cardsOf(sorting).slice(0, 2)) {
      await user.click(trayCard(card));
      await user.click(basketButton(card.basket as Basket));
    }

    expect([document.querySelectorAll(".step").length, filledSteps()]).toEqual([6, 2]);
    expect(document.querySelector(".steps")?.textContent).toBe("");
  });

  it("shows SEE RESULT with a trophy once the last card lands, and it leads to the result", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("feathers");
    const opened = openBoard(sorting);
    const cards = cardsOf(sorting);
    for (const card of cards.slice(0, 5)) {
      await user.click(trayCard(card));
      await user.click(basketButton(card.basket as Basket));
    }
    expect(screen.queryByRole("button", { name: "SEE RESULT" })).toBeNull();
    const last = cards[5] as CardState;

    await user.click(trayCard(last));
    await user.click(basketButton(last.basket as Basket));

    const seeResult = screen.getByRole("button", { name: "SEE RESULT" });
    expect([symbolOf(seeResult), words(seeResult)]).toEqual(["trophy", "SEE RESULT"]);
    expect(filledSteps()).toBe(6);
    await user.click(seeResult);
    expect(opened.results).toHaveLength(1);
  });

  it("leaves at HOME without asking", async () => {
    const user = userEvent.setup();
    const opened = openBoard(sortingBy("legs"));

    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(opened.homes).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks to turn the iPad in portrait, and keeps the cards sorted and the wrong drop when turned back", async () => {
    const user = userEvent.setup();
    const sorting = sortingBy("diet");
    const opened = openBoard(sorting);
    const cards = cardsOf(sorting).slice(0, 3);
    const [missed] = cards;
    if (!missed) throw new Error("The board has no cards");
    await user.click(trayCard(missed));
    await user.click(basketButton(otherBasket(sorting, missed.basket as Basket)));
    for (const card of cards) {
      await user.click(trayCard(card));
      await user.click(basketButton(card.basket as Basket));
    }
    const sorted = (["plants", "meat"] as const).map(sortedIn);
    expect(sorted.flat()).toHaveLength(3);

    act(() => opened.orientation.turn("portrait"));

    expect(screen.getByRole("img", { name: "TURN THE IPAD SIDEWAYS" })).toBeDefined();
    expect(screen.queryByRole("group")).toBeNull();

    act(() => opened.orientation.turn("landscape"));

    expect((["plants", "meat"] as const).map(sortedIn)).toEqual(sorted);
    expect(within(tray()).getAllByRole("button")).toHaveLength(3);
    expect(score(latest(opened))).toBe(2);
  });
});
