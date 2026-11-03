import { fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { localFeatured, PROGRESS_KEY } from "../src/localProgress.ts";
import { homeTile, memoryStorage } from "./support.ts";
import { openHomeApp } from "./skeletonsApp.tsx";
import { renderHomePageFeaturing } from "./homePage.tsx";

const style = getComputedStyle;
const part = (selector: string) => document.querySelector(selector)!;
const token = (name: string) => style(document.documentElement).getPropertyValue(`--ds-${name}`).trim();
const literal = (property: string, value: string) => {
  const element = document.createElement("span");
  element.style.setProperty(property, value);
  return getComputedStyle(element).getPropertyValue(property);
};
afterEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.size; });

it.each(["en", "ru"] as const)("shows NEW only on the offered, unfeatured new games in %s", (language) => {
  const { opened } = renderHomePageFeaturing("whoseJaw", { allGames: true, language, newGames: ["whoseJaw", "coloring"] });
  expect(document.querySelectorAll(".home-new")).toHaveLength(1);
  expect(part(".coloring-tile .home-new").getAttribute("aria-label")).toBe(language === "en" ? "NEW" : "НОВИНКА");
  expect(part(".coloring-tile .home-new svg.lucide-sparkles")).not.toBeNull();
  expect(part(".home-sky").querySelector(".home-new")).toBeNull();
  fireEvent.click(part(".coloring-tile .home-new"));
  expect(opened).toEqual(["coloring"]);
});

it.each(["en", "ru"] as const)("shows both new games and a parents' note in %s", (language) => {
  renderHomePageFeaturing("care", { allGames: true, language, newGames: ["whoseJaw", "coloring"] });
  expect([...document.querySelectorAll(".home-new")].map(e => e.closest("button")?.getAttribute("aria-label"))).toEqual(language === "en" ? ["TEETH", "COLOR"] : ["ЗУБЫ", "РАСКРАСЬ"]);
  expect(part(".home-parent-note").textContent).toBe(language === "en"
    ? "Parents: progress is saved on this device. Settings are at the top of the page."
    : "Родителям: прогресс сохраняется на этом устройстве. Настройки — вверху страницы.");
  expect(screen.getByRole("img", { name: language === "en" ? "SOON" : "СКОРО" })).toBe(part(".more-coming"));
  expect(part(".home-version").textContent).toBe("v1.2.3");
  expect(part(".home-version").getAttribute("aria-label")).toBe(language === "en" ? "Version" : "Версия");
});

for (const theme of ["light", "dark"]) for (const size of ["wide", "tall", "tall-narrow", "wide-short"]) {
  it(`uses the ground's design tokens in ${theme} ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    renderHomePageFeaturing("care", { allGames: true, newGames: ["whoseJaw"] });
    const matches = (selector: string, properties: Record<string, string>) => {
      for (const [property, name] of Object.entries(properties)) expect(style(part(selector)).getPropertyValue(property), `${selector} ${property}`).toBe(literal(property, token(name)));
    };
    matches('.home-layer[data-depth="1"]', { "background-color": "strata-1" });
    matches('.home-layer[data-depth="2"]', { "background-color": "strata-2" });
    // Each game's pocket and symbol take the game's own colours, at any depth; SOON's pocket is the deeper earth.
    for (const [tile, game] of [["compare", "compare"], ["catalogue", "explore"], ["pairs", "pairs"], ["skeletons", "bones"], ["dig", "dig"], ["sort", "sort"], ["sand-writing", "draw"], ["labyrinth", "maze"], ["picture-puzzle", "puzzle"], ["whose-jaw", "teeth"], ["coloring", "color"]]) {
      matches(`.${tile}-tile .home-tile-pocket`, { "background-color": `pocket-${game}` });
      matches(`.${tile}-tile .home-tile-symbol`, { color: `game-${game}`, width: "size-tile-icon", height: "size-tile-icon" });
    }
    matches('.more-coming .home-tile-pocket', { "background-color": "pocket-2" });
    matches('.home-tile-footer', { "background-color": "label", color: "on-label", "border-radius": "radius-pill", "padding-left": "chip-pad-x-lead", "padding-right": "chip-pad-x" });
    matches('.home-tile-title', { "font-size": "size-label" });
    matches('.home-new', { "background-color": "reward", color: "on-reward" });
    matches('.home-bedrock', { "background-color": "strata-3", color: "ink" });
    matches('.home-parent-note', { "font-size": "size-foot" });
    const phone = size === "tall-narrow" || size === "wide-short";
    expect(style(part('.home-tile-pocket')).height).toBe(phone ? "88px" : "96px");
    expect(style(part(".home-tile-symbol")).width).toBe(phone ? "18px" : "22px");
    expect(style(part('.home-tile-pocket')).borderRadius).toBe(`${token("radius-pocket-top")} ${token("radius-pocket-top")} ${token("radius-pocket-bottom")} ${token("radius-pocket-bottom")}`);
  });
}

it("uses the design's earth edge for the deeper band and bedrock", () => {
  const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));
  const nodes = (node: any): any[] => [node, ...(node.children ?? []).flatMap(nodes)];
  const edge = nodes(design).find(node => node.name === "DS/Layer Edge");
  renderHomePageFeaturing("compare");
  expect([...document.querySelectorAll(".home-earth-wave path")].map(e => e.getAttribute("d"))).toEqual([edge.children[0].geometry, edge.children[0].geometry]);
  expect(document.querySelectorAll(".home-tile-pocket")).toHaveLength(HOME_GAMES.length - 3);
});

it("drops a new game's tag when its start is counted and the child returns home", async () => {
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: {
    "home-first-visit": { games: HOME_GAMES.filter(game => game !== "catalogue") }
  } }) });
  const visit = localFeatured(() => storage, HOME_GAMES);
  const { user } = openHomeApp({ storage, startCounter: visit, newHomeGames: visit.newGames });
  expect(homeTile("EXPLORE").querySelector(".home-new")?.getAttribute("aria-label")).toBe("NEW");
  await user.click(homeTile("EXPLORE"));
  await user.click(screen.getByRole("button", { name: "HOME" }));
  expect(homeTile("EXPLORE").querySelector(".home-new")).toBeNull();
  expect(visit.history().timesStarted.get("catalogue")).toBe(1);
});
