import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { renderHomePageFeaturing } from "./homePage.tsx";
import { featuredCard, manualViewport, tilesRow } from "./support.ts";
import { openHomeApp } from "./skeletonsApp.tsx";

const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));
const part = (selector: string) => document.querySelector(selector)!;
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--ds-${name}`).trim();
const literal = (property: string, value: string) => {
  const element = document.createElement("span");
  element.style.setProperty(property, value);
  return getComputedStyle(element).getPropertyValue(property);
};
afterEach(() => { delete document.documentElement.dataset.size; delete document.documentElement.dataset.theme; });

for (const language of ["en", "ru"] as const) for (const game of HOME_GAMES) {
  test(`today names ${game} in ${language}; PLAY, the name and artwork open the same game`, async () => {
    const { user, opened } = renderHomePageFeaturing(game, { language, allGames: true });
    expect(part(".home-today-tag").textContent).toBe(language === "en" ? "TODAY" : "СЕГОДНЯ");
    expect(part(".home-play").textContent).toBe(TEXTS[language].play);
    expect(part(".featured-card-title").textContent).toBe(featuredCard().getAttribute("aria-label"));
    expect(part(".featured-card-symbol svg")).toBeTruthy();
    expect(part(".home-today-art").children.length).toBeGreaterThan(0);
    if (game === "catalogue") expect(part(".featured-card-title").textContent).toBe(TEXTS[language].catalogue);
    expect(tilesRow().querySelector(`[data-turn-part="tile-${game}"]`)).toBeNull();
    for (const selector of [".home-play", ".featured-card-title", ".home-today-art"]) await user.click(part(selector));
    expect(opened).toEqual([game, game, game]);
  });
}

for (const theme of ["light", "dark"]) for (const size of ["wide", "tall", "wide-short", "tall-narrow"]) {
  test(`sky reads design tokens in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    renderHomePageFeaturing("compare");
    const matches = (selector: string, properties: Record<string, string>) => {
      for (const [property, name] of Object.entries(properties)) {
        expect(getComputedStyle(part(selector)).getPropertyValue(property), `${selector} ${property}`).toBe(literal(property, token(name)));
      }
    };
    matches(".home-sky", { color: "ink" });
    matches(".home-museum", { color: "on-strong", "background-color": "strong", "border-radius": "radius-pill", "font-size": "size-label" });
    matches(".home-today-tag", { color: "on-strong", "background-color": "strong", "border-radius": "radius-tag", "font-size": "size-tag" });
    matches(".featured-card-symbol", { color: "action", "background-color": "pocket-1" });
    matches(".featured-card-title", { "font-size": "size-display", color: "ink" });
    matches(".home-play", { "background-color": "action", color: "on-action", "font-size": "size-action", "border-radius": "radius-pill" });
    matches(".featured-card-badge", { color: "ink", "font-size": "size-number" });
    matches(".home-sky-body", { "background-color": "sky-halo" });
    matches(".home-sky-body span", { "background-color": "sky-core" });
    matches(".home-sky-wave", { fill: "strata-1" });
    const phone = size === "tall-narrow" || size === "wide-short";
    expect(getComputedStyle(part(".home-museum-word")).position === "absolute").toBe(phone);
    expect(getComputedStyle(part(".home-museum")).whiteSpace).toBe("nowrap");
    expect(screen.getByRole("button", { name: "MUSEUM" })).toBe(part(".home-museum"));
  });
}

test("the first earth wave uses the design's geometry", () => {
  renderHomePageFeaturing("compare");
  const nodes = (node: any): any[] => [node, ...(node.children ?? []).flatMap(nodes)];
  const edge = nodes(design).find(node => node.name === "DS/Layer Edge");
  expect(part(".home-sky-wave path").getAttribute("d")).toBe(edge.children[0].geometry);
});

for (const size of ["wide", "tall", "wide-short", "tall-narrow"] as const) {
  test(`the three menus stay usable in ${size}, and an outside tap starts nothing`, async () => {
    const viewport = manualViewport("landscape");
    viewport.resize(size, size.startsWith("tall"));
    const { user } = openHomeApp({ viewport, portraitLayouts: { home: ["tall", "tall-narrow"] } });
    for (const button of document.querySelectorAll(".parent-menu-button")) {
      fireEvent.click(button);
      expect(screen.getAllByRole("menu")).toHaveLength(1);
      const card = featuredCard();
      await user.click(part(".menu-backdrop"));
      expect(screen.queryByRole("menu")).toBeNull();
      expect(featuredCard()).toBe(card);
    }
  });
}

test("turning keeps today's game and an open parents' menu", () => {
  const viewport = manualViewport("landscape");
  openHomeApp({ viewport, portraitLayouts: { home: ["tall", "tall-narrow"] } });
  const card = featuredCard();
  fireEvent.click(screen.getByRole("button", { name: "Theme" }));
  for (const [size, upright] of [["tall", true], ["tall-narrow", true], ["wide-short", false], ["wide", false]] as const) {
    act(() => viewport.resize(size, upright));
    expect(featuredCard()).toBe(card);
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
  }
});

test("a best of zero stays beside PLAY with the quiz total", () => {
  renderHomePageFeaturing("compare", { best: 0 });
  expect(part(".home-today-progress").previousElementSibling).toBe(part(".home-play"));
  expect(part(".featured-card-badge").textContent).toBe("0");
  expect(part(".home-progress-total").textContent).toBe("/ 10");
  expect(part(".featured-card-badge .lucide-trophy")).not.toBeNull();
});

for (const [size, frameName] of [["wide", "Home · Dig site · iPad 11 landscape 1180×820 · Light · whole page"], ["tall-narrow", "Home · Dig site · iPhone 15 Pro portrait 393×852 · Light · whole page"]]) {
  test(`symbol pocket reads the ${size} frame's geometry`, () => {
    document.documentElement.dataset.size = size;
    renderHomePageFeaturing("compare");
    const frame = design.children.find((node: { name: string }) => node.name === frameName);
    const featured = frame.children.find((node: { name: string }) => node.name === "Featured");
    const symbol = featured.descendants.MKp0m;
    const style = getComputedStyle(part(".featured-card-symbol"));
    expect([style.width, style.height]).toEqual([`${symbol.width}px`, `${symbol.height}px`]);
    expect(style.borderRadius).toBe(symbol.cornerRadius.map((value: number) => `${value}px`).join(" "));
  });
}

for (const game of HOME_GAMES) for (const theme of ["light", "dark"]) {
  test(`${game}'s progress stands on the ${theme} sky`, () => {
    document.documentElement.dataset.theme = theme;
    renderHomePageFeaturing(game, { allGames: true });
    for (const selector of [".featured-card", ".home-today-copy", ".home-today-actions", ".home-today-progress", ".featured-card-badge"]) {
      const element = document.querySelector(selector);
      if (!element) continue;
      expect(getComputedStyle(element).backgroundColor, selector).toBe("rgba(0, 0, 0, 0)");
    }
  });
}
