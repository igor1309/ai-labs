import { expect, it } from "vitest";
import { renderHomePageFeaturing } from "./homePage.tsx";
import { featuredCard, tilesRow } from "./support.ts";
import type { HomeGame } from "../src/HomePage.tsx";

const games: HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting", "labyrinth", "picturePuzzle", "whoseJaw", "coloring"];
const labels = {
  en: ["COMPARE", "EXPLORE", "PAIRS", "BONES", "DIG", "SORT", "CARE", "DRAW", "MAZE", "PUZZLE", "TEETH", "COLOR", "SOON"],
  ru: ["СРАВНИ", "ЯЩЕРЫ", "ПАРЫ", "КОСТИ", "КОПАЙ", "СОРТИРУЙ", "ЗАБОТА", "РИСУЙ", "ЛАБИРИНТ", "ПАЗЛ", "ЗУБЫ", "РАСКРАСЬ", "СКОРО"]
};
const fullLabels = {
  en: ["COMPARE", "ANCIENT REPTILES", "FIND THE PAIR", "SKELETONS", "DIG", "SORT", "CARE", "SAND WRITING", "LABYRINTH", "PICTURE PUZZLE", "WHOSE JAW?", "COLOR A DINOSAUR"],
  ru: ["СРАВНИ", "ДРЕВНИЕ ЯЩЕРЫ", "НАЙДИ ПАРУ", "СКЕЛЕТЫ", "РАСКОПКИ", "РАЗЛОЖИ", "ЗАБОТА", "РИСОВАНИЕ НА ПЕСКЕ", "ЛАБИРИНТ", "СОБЕРИ КАРТИНКУ", "ЧЬЯ ЧЕЛЮСТЬ?", "РАСКРАСЬ ДИНОЗАВРА"]
};
it.each((["en", "ru"] as const).flatMap(language => games.map(featured => ({ language, featured }))))("shows short $language tiles with $featured featured, preserving hero labels and rewards", async ({ language, featured }) => {
  const { user, opened } = renderHomePageFeaturing(featured, { language, allGames: true, scored: true });
  const row = tilesRow();
  const titles = [...row.querySelectorAll(".home-tile-title")];
  expect(titles.map(t => t.textContent)).toEqual(labels[language].filter((_, at) => games[at] !== featured));
  expect(row.querySelector('[class$="-tile-count"], [class$="-tile-best"], [class$="-tile-stars"]')).toBeNull();
  for (const title of titles) {
    const footer = title.parentElement!;
    expect(footer.classList.contains("home-tile-footer")).toBe(true);
    expect(footer.firstElementChild?.classList.contains("home-tile-symbol")).toBe(true);
    expect(footer.querySelector("svg")?.getAttribute("width")).toBe("20");
    const style = getComputedStyle(title);
    expect([style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing, style.whiteSpace]).toEqual(["20px", "24px", "700", "0px", "nowrap"]);
    expect(getComputedStyle(footer).height).toBe("48px");
  }
  const hero = featuredCard();
  expect(hero.getAttribute("aria-label")).toBe(fullLabels[language][games.indexOf(featured)]);
  expect(hero.querySelector(".featured-card-title")?.textContent).toBe(fullLabels[language][games.indexOf(featured)]);
  const badge = hero.querySelector(".featured-card-badge");
  if (featured === "sandWriting") expect(badge).toBeNull();
  else if (featured === "catalogue") expect(Number(badge?.textContent)).toBeGreaterThan(0);
  else expect(badge?.textContent).toBe(({ compare: "7", pairs: "120", skeletons: "3", dig: "4", sort: "6", care: "8", labyrinth: "9", picturePuzzle: "2/3", whoseJaw: "5/16", coloring: "4" } as Record<string, string>)[featured]);
  const shown = games.filter(game => game !== featured);
  for (const game of shown) {
    const tile = row.querySelector<HTMLButtonElement>(`[data-turn-part="tile-${game}"]`)!;
    expect(tile.textContent).toBe(labels[language][games.indexOf(game)]);
    expect(tile.getAttribute("aria-label")).toBe(labels[language][games.indexOf(game)]);
    await user.click(tile);
  }
  await user.click(hero);
  expect(opened).toEqual([...shown, featured]);
});
