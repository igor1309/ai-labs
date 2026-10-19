import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { CatalogueEntry } from "../src/catalogue.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { localTheme } from "../src/localTheme.ts";
import type { Theme } from "../src/theme.ts";
import {
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  loadedPictures,
  manualAppearance,
  manualOrientation,
  manualPictures,
  memoryStorage,
  sameColour,
  seededRandom,
  symbolOf,
  unreadVersion,
  words,
  type ManualPictures,
  homeTile,
  unsetAgeLevel,
  type PictureClock
} from "./support.ts";

function openApp({
  pictures = loadedPictures(),
  language = "en",
  theme = "light"
}: { pictures?: PictureClock; language?: Language; theme?: Theme } = {}) {
  const languages = memoryStorage();
  const themes = memoryStorage();
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      orientation={manualOrientation("landscape")}
      progress={emptyProgress()}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={localLanguage(() => languages)}
      nameVersion={unreadVersion}
      appearance={manualAppearance(theme)}
      themeStore={localTheme(() => themes)}
      {...unsetAgeLevel()}
      {...pictures}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
    />
  );
  return userEvent.setup();
}

const entry = (id: string): CatalogueEntry => {
  const found = SHIPPED_CATALOGUE.find((dinosaur) => dinosaur.id === id);
  if (!found) throw new Error(`No ${id} in the catalogue`);
  return found;
};

const LAST = SHIPPED_CATALOGUE.at(-1) ?? entry("tyrannosaurus");

const grid = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].catalogue });
const cards = () => within(grid()).getAllByRole("button");
const cardOf = (id: string, language: Language = "en") => within(grid(language)).getByRole("button", { name: entry(id).name[language] });
const position = () => screen.queryByLabelText("NUMBER")?.textContent;
const pageName = () => screen.queryByRole("heading", { level: 1 })?.textContent;
// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

// The words and symbols of each chip on a card: its height, its weight and
// its food tag.
const chipsOf = (card: HTMLElement) =>
  [...card.querySelectorAll<HTMLElement>(".catalogue-chip, .diet-tag")].map((chip) => ({ symbols: symbolsOf(chip), words: words(chip) }));

async function openCatalogue(user: ReturnType<typeof userEvent.setup>, language: Language = "en") {
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
}

async function openPage(user: ReturnType<typeof userEvent.setup>, id: string, language: Language = "en") {
  await openCatalogue(user, language);
  await user.click(cardOf(id, language));
}

describe("the catalogue's tile on the home page", () => {
  it("reads ALL DINOSAURS beside a book, with a Stegosaurus and the count of every dinosaur, under the COMPARE tile, before the CARE tile", () => {
    openApp();

    const tile = screen.getByRole("button", { name: "ALL DINOSAURS" });
    expect(words(tile)).toBe("ALL DINOSAURS42");
    expect(symbolsOf(tile)).toEqual(["book-open", "footprints"]);
    expect(tile.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("stegosaurus"));
    expect(tile.querySelector(".catalogue-tile-count")?.textContent).toBe(String(SHIPPED_CATALOGUE.length));
    expect(SHIPPED_CATALOGUE).toHaveLength(42);
    expect(homeTile("COMPARE").nextElementSibling).toBe(tile);
    expect(tile.nextElementSibling).toBe(homeTile("CARE"));
  });
});

describe("the list of every dinosaur", () => {
  it("opens from the tile with its title, its count and a card for every dinosaur, four to a row, in the list's order", async () => {
    const user = openApp();

    await openCatalogue(user);

    const title = screen.getByRole("heading", { level: 1 });
    expect(words(title)).toBe("ALL DINOSAURS");
    expect(symbolOf(title)).toBe("book-open");
    const count = screen.getByLabelText("DINOSAURS");
    expect([symbolOf(count), count.textContent]).toEqual(["footprints", "42"]);
    expect(cards().map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.map(({ name }) => name.en));
    expect(getComputedStyle(grid()).gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
  });

  it("goes back to the home page by its HOME button", async () => {
    const user = openApp();
    await openCatalogue(user);
    const home = screen.getByRole("button", { name: "HOME" });
    expect(symbolOf(home)).toBe("house");

    await user.click(home);

    expect(homeTile("COMPARE")).toBeDefined();
    expect(screen.queryByRole("group", { name: "ALL DINOSAURS" })).toBeNull();
  });

  it("shows on each card its dinosaur's picture, its name in capitals, its height, its weight and its food", async () => {
    const user = openApp();
    await openCatalogue(user);

    for (const [at, card] of cards().entries()) {
      const dinosaur = SHIPPED_CATALOGUE[at] ?? LAST;
      expect(card.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture(dinosaur.id));
      expect(card.querySelector(".catalogue-name")?.textContent).toBe(dinosaur.name.en.toUpperCase());
      expect(chipsOf(card).map(({ symbols }) => symbols[0])).toEqual(["ruler", "weight", dinosaur.diet === "plants" ? "leaf" : "beef"]);
      expect(chipsOf(card)[2]?.words).toBe(TEXTS.en.diets[dinosaur.diet]);
    }
    expect(chipsOf(cardOf("tyrannosaurus")).map(({ words }) => words)).toEqual(["3.1 M", "8 T", "MEAT"]);
    expect(chipsOf(cardOf("velociraptor")).map(({ words }) => words)).toEqual(["0.6 M", "15 KG", "MEAT"]);
    expect(chipsOf(cardOf("brachiosaurus")).map(({ words }) => words)).toEqual(["3.4 M", "50 T", "PLANTS"]);
  });

  it.each([
    ["light", "tyrannosaurus", "terra", ["beef"], "MEAT"],
    ["light", "triceratops", "good", ["leaf"], "PLANTS"],
    ["light", "gallimimus", "amber", ["beef", "leaf"], "BOTH"],
    ["dark", "tyrannosaurus", "terra", ["beef"], "MEAT"],
    ["dark", "triceratops", "good", ["leaf"], "PLANTS"],
    ["dark", "oviraptor", "amber", ["beef", "leaf"], "BOTH"]
  ] as const)("in the %s theme tags %s in the design's %s, with %j and the word %s", async (theme, id, colour, symbols, word) => {
    const user = openApp({ theme });
    await openCatalogue(user);

    const tag = cardOf(id).querySelector<HTMLElement>(".diet-tag");
    if (!tag) throw new Error(`No food tag on ${id}`);
    expect(sameColour(getComputedStyle(tag).backgroundColor, PALETTE[theme][colour] ?? "")).toBe(true);
    expect(symbolsOf(tag)).toEqual(symbols);
    expect(words(tag)).toBe(word);
  });
});

describe("a dinosaur's page", () => {
  it("opens from its card with its big picture, its name, its food tag under it, its description, its height and weight, and its place", async () => {
    const user = openApp();

    await openPage(user, "tyrannosaurus");

    const name = screen.getByRole("heading", { level: 1 });
    expect(name.textContent).toBe("TYRANNOSAURUS");
    expect(screen.getByRole("img", { name: "Tyrannosaurus" }).getAttribute("src")).toBe(fakeBodyPicture("tyrannosaurus"));
    const tag = name.nextElementSibling as HTMLElement;
    expect([tag.className, words(tag), symbolsOf(tag)]).toEqual(["diet-tag", "MEAT", ["beef"]]);
    expect(tag.dataset.size).toBe("medium");
    expect(tag.nextElementSibling?.textContent).toBe("A HUGE HUNTER WITH A BIG HEAD AND TINY ARMS. ITS TEETH WERE AS LONG AS BANANAS.");
    expect(
      [...document.querySelectorAll<HTMLElement>(".dinosaur-fact")].map((fact) => ({
        symbol: symbolOf(fact),
        label: words(fact.querySelector(".dinosaur-fact-label") as HTMLElement),
        value: fact.querySelector(".dinosaur-fact-value")?.textContent
      }))
    ).toEqual([
      { symbol: "ruler", label: "TALL", value: "3.1 M" },
      { symbol: "weight", label: "HEAVY", value: "8 T" }
    ]);
    const back = screen.getByRole("button", { name: "ALL DINOSAURS" });
    expect([words(back), symbolOf(back)]).toEqual(["ALL DINOSAURS", "book-open"]);
    expect(position()).toBe("1 / 42");
  });

  // About ten dinosaurs to a test, each walked by the arrow from its first
  // dinosaur's card: one walk over the whole list outlasts a test's time
  // limit on CI.
  it.each([
    [1, 11],
    [12, 22],
    [23, 32],
    [33, 42]
  ])("shows each dinosaur's own description and food, and its place in the list, from the %ith to the %ith", async (first, last) => {
    const user = openApp();
    await openPage(user, SHIPPED_CATALOGUE[first - 1]?.id ?? "");

    for (const dinosaur of SHIPPED_CATALOGUE.slice(first - 1, last)) {
      expect(pageName()).toBe(dinosaur.name.en.toUpperCase());
      expect(document.querySelector(".dinosaur-description")?.textContent).toBe(dinosaur.description.en);
      expect(words(document.querySelector<HTMLElement>(".dinosaur-about .diet-tag") ?? document.body)).toBe(TEXTS.en.diets[dinosaur.diet]);
      expect(position()).toBe(`${SHIPPED_CATALOGUE.indexOf(dinosaur) + 1} / 42`);
      await user.click(screen.getByRole("button", { name: "NEXT" }));
    }
    expect(position()).toBe(`${(last % 42) + 1} / 42`);
  });

  it("has arrows to the previous and next dinosaur, each a tap target of at least 44 by 44", async () => {
    const user = openApp();
    await openPage(user, "tyrannosaurus");

    const arrows = ["PREVIOUS", "NEXT"].map((name) => screen.getByRole("button", { name }));
    expect(arrows.map(symbolOf)).toEqual(["arrow-left", "arrow-right"]);
    for (const arrow of arrows) {
      expect(parseFloat(getComputedStyle(arrow).width)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(getComputedStyle(arrow).height)).toBeGreaterThanOrEqual(44);
    }
  });

  it("goes round the whole list: next from the last is the first, and previous from the first the last", async () => {
    const user = openApp();
    await openPage(user, LAST.id);
    expect(position()).toBe("42 / 42");

    await user.click(screen.getByRole("button", { name: "NEXT" }));

    expect([pageName(), position()]).toEqual(["TYRANNOSAURUS", "1 / 42"]);

    await user.click(screen.getByRole("button", { name: "PREVIOUS" }));

    expect([pageName(), position()]).toEqual([LAST.name.en.toUpperCase(), "42 / 42"]);
  });

  // The picture on Velociraptor's page: its look and its source.
  const pagePicture = () => {
    const picture = screen.getByRole("img", { name: "Velociraptor" });
    return [picture.dataset.picture, picture.getAttribute("src")];
  };

  it("opens at once while its picture loads, the picture shimmering, then fading in", async () => {
    const pictures = manualPictures();
    const user = openApp({ pictures });
    await openCatalogue(user);

    await user.click(cardOf("velociraptor"));

    expect([pageName(), position()]).toEqual(["VELOCIRAPTOR", "3 / 42"]);
    expect(pagePicture()).toEqual(["loading", null]);
    act(() => pictures.finish(fakeBodyPicture("velociraptor")));
    expect(pagePicture()).toEqual(["appearing", fakeBodyPicture("velociraptor")]);
  });

  it("shows a picture its card has loaded at once", async () => {
    const pictures = manualPictures();
    const user = openApp({ pictures });
    await openCatalogue(user);
    act(() => pictures.finish(fakeBodyPicture("velociraptor")));

    await user.click(cardOf("velociraptor"));

    expect(pagePicture()).toEqual(["shown", fakeBodyPicture("velociraptor")]);
  });

  it("loads again a picture that failed on its card, and the pictures either side that failed", async () => {
    const pictures = manualPictures();
    const user = openApp({ pictures });
    await openCatalogue(user);
    const failed = ["velociraptor", "triceratops", "brachiosaurus"].map(fakeBodyPicture);
    act(() => failed.forEach(pictures.fail));
    expect(failed.filter((url) => pictures.loading().includes(url))).toEqual([]);

    await user.click(cardOf("velociraptor"));

    expect(failed.filter((url) => pictures.loading().includes(url))).toEqual(failed);
    expect(pagePicture()).toEqual(["loading", null]);
  });

  it("opens one page when two cards are tapped in one moment", async () => {
    const user = openApp({ pictures: manualPictures() });
    await openCatalogue(user);
    const [first, second] = [cardOf("velociraptor"), cardOf("stegosaurus")];

    act(() => {
      first.click();
      second.click();
    });

    expect([pageName(), position()]).toEqual(["VELOCIRAPTOR", "3 / 42"]);
  });

  it("goes back to the list with its card scrolled into view, the cards then standing still", async () => {
    const user = openApp();
    await openCatalogue(user);
    expect(grid().dataset.rise).toBe("true");
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    await user.click(cardOf(LAST.id));

    await user.click(screen.getByRole("button", { name: "ALL DINOSAURS" }));

    expect(cards()).toHaveLength(42);
    expect(grid().dataset.rise).toBeUndefined();
    const scrolled = vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts;
    expect(scrolled).toEqual([cardOf(LAST.id)]);
  });

  it.each(["en", "ru"] as const)("ends with a note for parents in %s, small, in normal case and in the soft ink, naming the sources", async (language) => {
    const user = openApp({ language });
    await openPage(user, "tyrannosaurus", language);

    const note = screen.getByText(TEXTS[language].sourceNote);
    expect(note.textContent).not.toBe(note.textContent?.toLocaleUpperCase(language));
    expect(parseFloat(getComputedStyle(note).fontSize)).toBeLessThan(parseFloat(getComputedStyle(document.querySelector(".dinosaur-description") ?? note).fontSize) / 2);
    expect(sameColour(getComputedStyle(note).color, PALETTE.light["ink-soft"] ?? "")).toBe(true);
  });

  it("names in its note every source of docs/sources.md", () => {
    const sources = readFileSync(join(import.meta.dirname, "../docs/sources.md"), "utf8");
    // Each source is named on its numbered line, before its address or
    // the part of it the facts come from.
    const names = [...sources.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => (match[1] ?? "").replace(/,?\s*https?:\S+$/, "").replace(/:.*$/, "").replace(/,$/, ""));

    expect(names).toHaveLength(5);
    expect(names.filter((name) => !TEXTS.en.sourceNote.includes(name ?? ""))).toEqual([]);
  });
});

describe("the catalogue in Russian", () => {
  it("reads its tile, its title, its food tags and its descriptions in Russian, the tile's title short", async () => {
    const user = openApp({ language: "ru" });
    expect(words(screen.getByRole("button", { name: "ВСЕ" }))).toBe("ВСЕ42");

    await openPage(user, "gallimimus", "ru");

    expect(pageName()).toBe(entry("gallimimus").name.ru.toLocaleUpperCase("ru"));
    expect(words(document.querySelector<HTMLElement>(".dinosaur-about .diet-tag") ?? document.body)).toBe("ВСЁ");
    expect(document.querySelector(".dinosaur-description")?.textContent).toBe(entry("gallimimus").description.ru);
    expect(screen.getByRole("button", { name: "ВСЕ ДИНОЗАВРЫ" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "ВСЕ ДИНОЗАВРЫ" }));
    expect(chipsOf(cardOf("tyrannosaurus", "ru")).map(({ words }) => words)).toEqual(["3,1 М", "8 Т", "МЯСО"]);
    expect(chipsOf(cardOf("triceratops", "ru"))[2]?.words).toBe("РАСТЕНИЯ");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ВСЕ ДИНОЗАВРЫ");
  });
});
