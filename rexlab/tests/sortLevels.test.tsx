import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import type { Basket } from "../src/SortScreen.tsx";
import { boardState, score, type Baskets, type Property, type Sorting } from "../src/sorting/index.ts";
import { BASKET_EMS, MARK_EMS, SPACE_EMS } from "./basketWidths.ts";
import { basketButton, centreOf, dragTo, latest, layOutBaskets, openBoard, tray, trayCard } from "./sorting.tsx";
import { SHIPPED_SORTABLES, contrast, seenOn, sortingBy, surfaceOf, words } from "./support.ts";

// sort-dinosaurs-levels.feature: the screen board of a level, which has
// three baskets, eight or ten cards. The boards are handed to the screen
// as they are dealt for a level, each dinosaur in the basket the feature
// names.

type Level = {
  name: string;
  property: Property;
  baskets: Baskets;
  // The dinosaurs in each basket, in the order of `baskets`.
  members: readonly (readonly string[])[];
  // The baskets' names in each language, as the feature gives them.
  names: Record<Language, readonly string[]>;
  // What the third basket's symbol shows: its pictures and its words.
  third: { pictures: readonly string[]; words: string };
};

const LEVELS: readonly Level[] = [
  {
    name: "Explorer diet",
    property: "diet",
    baskets: ["plants", "meat", "both"],
    members: [
      ["triceratops", "diplodocus"],
      ["tyrannosaurus", "allosaurus", "velociraptor"],
      ["gallimimus", "oviraptor", "troodon"]
    ],
    names: { en: ["PLANTS", "MEAT", "BOTH"], ru: ["РАСТЕНИЯ", "МЯСО", "ВСЁ"] },
    third: { pictures: ["leaf", "drumstick"], words: "" }
  },
  {
    name: "Paleontologist legs",
    property: "legs",
    baskets: ["two-legs", "four-legs", "two-or-four"],
    members: [
      ["tyrannosaurus", "velociraptor", "allosaurus"],
      ["triceratops", "stegosaurus", "ankylosaurus"],
      ["iguanodon", "plateosaurus", "parasaurolophus", "edmontosaurus"]
    ],
    names: { en: ["TWO LEGS", "FOUR LEGS", "TWO OR FOUR"], ru: ["ДВЕ НОГИ", "ЧЕТЫРЕ НОГИ", "ДВЕ ИЛИ ЧЕТЫРЕ"] },
    third: { pictures: ["footprints"], words: "2 4" }
  },
  {
    name: "Paleontologist feathers",
    property: "feathers",
    baskets: ["feathers", "no-feathers", "not-known-yet"],
    members: [
      ["velociraptor", "microraptor", "archaeopteryx"],
      ["allosaurus", "carnotaurus"],
      ["tyrannosaurus", "spinosaurus", "compsognathus", "giganotosaurus", "coelophysis"]
    ],
    names: { en: ["FEATHERS", "NO FEATHERS", "NOT KNOWN YET"], ru: ["С ПЕРЬЯМИ", "БЕЗ ПЕРЬЕВ", "ПОКА НЕИЗВЕСТНО"] },
    third: { pictures: ["feather"], words: "?" }
  }
];

// The level's board with its cards on the tray alternating between the
// baskets, so the first card is not always the first basket's.
function dealt({ property, baskets, members }: Level): Sorting {
  const cards = Array.from({ length: Math.max(...members.map((each) => each.length)) }, (_, round) =>
    members.flatMap((ids, at) => {
      const id = ids[round];
      const basket = baskets[at];
      const dinosaur = SHIPPED_SORTABLES.find((each) => each.id === id);
      if (id !== undefined && !dinosaur) throw new Error(`No ${id} in the shipped list`);
      return dinosaur && basket ? [{ dinosaur, basket }] : [];
    })
  ).flat();
  return { board: { level: property === "diet" ? "explorer" : "paleontologist", property, baskets, cards }, landed: [], misses: [] };
}

const baskets = () => [...document.querySelectorAll<HTMLElement>(".baskets .basket")];
const steps = () => [...document.querySelectorAll(".steps .step")];
const px = (value: string) => Number.parseFloat(value) || 0;
// jsdom keeps a gap only as the shorthand, row gap first.
const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");
const rowGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ")[0] ?? "");
const symbolsOf = (element: Element) => [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

describe.each(LEVELS)("the $name board", (level) => {
  const cards = dealt(level).board.cards.length;

  it.each(LANGUAGES)("shows its cards, as many unfilled steps, and its baskets with their names and symbols, in %s", (language) => {
    openBoard(dealt(level), language);

    expect(within(tray(language)).getAllByRole("button")).toHaveLength(cards);
    expect([steps().length, document.querySelectorAll('.step[data-step="done"]').length]).toEqual([cards, 0]);
    expect(baskets().map((basket) => words(basket))).toEqual(level.names[language]);
    const mark = baskets()[2]?.querySelector<HTMLElement>(".basket-mark");
    if (!mark) throw new Error("The board has no third basket");
    expect([symbolsOf(mark), words(mark)]).toEqual([level.third.pictures, level.third.words]);
  });

  it.each(LANGUAGES)("lays its cards out in %s as the design does: one row up to eight cards, otherwise two rows of five", (language) => {
    openBoard(dealt(level), language);

    const columns = Number(tray(language).style.getPropertyValue("--columns"));
    expect([getComputedStyle(tray(language)).display, columns, Math.ceil(cards / columns)]).toEqual(["grid", cards > 8 ? 5 : cards, cards > 8 ? 2 : 1]);
  });

  it.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))(
    "fits a 1024 by 768 screen with every basket's name in full and at least 48 by 48 to drop on, in %s and the %s theme",
    (language, theme) => {
      document.documentElement.dataset.theme = theme;
      try {
        const { unmount } = openBoard(dealt(level), language);
        const style = (selector: string) => getComputedStyle(document.querySelector(selector) ?? document.body);
        const screenStyle = style(".sort");

        // The baskets share the row beside each other.
        const row = 1024 - px(screenStyle.paddingLeft) - px(screenStyle.paddingRight);
        const width = (row - columnGapOf(style(".baskets")) * (level.baskets.length - 1)) / level.baskets.length;
        // The height left under the bar, the prompt and the tray.
        const height =
          768 - px(screenStyle.paddingTop) - px(screenStyle.paddingBottom) - px(style(".home-button").height) - px(style(".prompt-symbol").height) - px(style(".sort-tray-area").height) - 3 * rowGapOf(screenStyle);
        expect(width).toBeGreaterThanOrEqual(48);
        expect(height).toBeGreaterThanOrEqual(48);

        for (const basket of baskets()) {
          const basketStyle = getComputedStyle(basket);
          const mark = basket.querySelector<HTMLElement>(".basket-mark");
          const name = basket.querySelector<HTMLElement>(".basket-name");
          if (!mark || !name) throw new Error("A basket without its mark or name");
          const markStyle = getComputedStyle(mark);
          const content = [...mark.children].map((part) =>
            part instanceof SVGElement ? px(getComputedStyle(part).width) || Number(part.getAttribute("width")) : (MARK_EMS[part.textContent ?? ""] ?? Number.NaN) * px(getComputedStyle(part).fontSize)
          );
          const markWidth = Math.max(px(markStyle.minWidth), content.reduce((sum, each) => sum + each, 0) + columnGapOf(markStyle) * (content.length - 1) + px(markStyle.paddingLeft) + px(markStyle.paddingRight));
          const labelGap = columnGapOf(getComputedStyle(name.parentElement ?? name));
          const room = width - px(basketStyle.paddingLeft) - px(basketStyle.paddingRight) - markWidth - labelGap;

          // The name breaks between its words, in at most two lines that
          // each fit beside the mark.
          const size = px(getComputedStyle(name).fontSize);
          let lines = 1;
          let used = 0;
          for (const word of (name.textContent ?? "").split(" ")) {
            const needed = (BASKET_EMS[word] ?? Number.NaN) * size;
            expect([word, needed <= room]).toEqual([word, true]);
            if (used === 0) used = needed;
            else if (used + SPACE_EMS * size + needed <= room) used += SPACE_EMS * size + needed;
            else {
              lines++;
              used = needed;
            }
          }
          expect(lines).toBeLessThanOrEqual(2);
          // The label is a mark beside a name; the basket keeps 48 pixels
          // of height under it.
          const label = Math.max(px(markStyle.height), lines * size * px(getComputedStyle(name).lineHeight));
          expect(px(basketStyle.paddingTop) + px(basketStyle.paddingBottom) + label + rowGapOf(basketStyle)).toBeLessThanOrEqual(height - 48);

          const surface = surfaceOf(basket);
          expect(contrast(seenOn(getComputedStyle(name).color, surface), surface)).toBeGreaterThanOrEqual(4.5);
          for (const part of mark.querySelectorAll(".legs-count, .mark-question")) {
            expect(contrast(seenOn(getComputedStyle(part).color, surfaceOf(mark)), surfaceOf(mark))).toBeGreaterThanOrEqual(4.5);
          }
        }
        unmount();
      } finally {
        delete document.documentElement.dataset.theme;
      }
    }
  );

  it("sorts by taps into three baskets, a wrong drop pointing at the right basket by its symbol, and ends in the result", async () => {
    const user = userEvent.setup();
    const sorting = dealt(level);
    const opened = openBoard(sorting);
    const third = level.baskets[2] as Basket;
    const miss = boardState(sorting).cards.find((card) => card.basket === third);
    if (!miss) throw new Error("The board has no card for the third basket");

    await user.click(trayCard(miss));
    await user.click(basketButton(miss.basket === level.baskets[0] ? level.baskets[1] : level.baskets[0]));
    const hint = within(trayCard(miss)).getByRole("img", { name: TEXTS.en.baskets[third] });
    expect(symbolsOf(hint)).toEqual(level.third.pictures);
    expect(basketButton(third).querySelector(".basket-glow")).not.toBeNull();

    await user.click(trayCard(miss));
    await user.click(basketButton(third));
    expect([...basketButton(third).querySelectorAll(".sorted-card")].map((card) => words(card as HTMLElement))).toEqual([miss.dinosaur.name.en.toUpperCase()]);
    expect(score(latest(opened))).toBe(0);
    expect(document.querySelectorAll('.step[data-step="done"]')).toHaveLength(1);

    for (const card of boardState(sorting).cards.filter((each) => each.dinosaur.id !== miss.dinosaur.id)) {
      await user.click(trayCard(card));
      await user.click(basketButton(card.basket as Basket));
    }
    expect(screen.getByRole("button", { name: "SEE RESULT" })).toBeDefined();
    expect(opened.seen.at(-1)?.landed).toHaveLength(cards);
  });

  it("drops a dragged card on the third basket, under the first two", async () => {
    const user = userEvent.setup();
    const sorting = dealt(level);
    openBoard(sorting);
    layOutBaskets(sorting);
    const third = level.baskets[2] as Basket;
    const card = boardState(sorting).cards.find((each) => each.basket === third);
    if (!card) throw new Error("The board has no card for the third basket");

    await dragTo(user, trayCard(card), centreOf(sorting, third));

    expect(within(tray()).queryByRole("button", { name: card.dinosaur.name.en })).toBeNull();
    expect(basketButton(third).querySelectorAll(".sorted-card")).toHaveLength(1);
  });
});

describe("a board of six cards", () => {
  it("keeps its two baskets and one row of six cards", () => {
    openBoard(sortingBy("legs"));

    expect(baskets()).toHaveLength(2);
    expect([tray().style.getPropertyValue("--columns"), document.querySelector(".baskets")?.getAttribute("data-count")]).toEqual(["6", "2"]);
  });
});
