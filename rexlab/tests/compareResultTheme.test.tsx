import { join } from "node:path";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { LevelResultScreen } from "../src/LevelResultScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { appStylesheet } from "./stylesheet.ts";
import { resultProps } from "./compareResultProps.ts";
import { withPictures } from "./pictures.tsx";
import { contrast, surfaceOf, symbolOf } from "./support.ts";

const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));
const component = (id: string): any => {
  const find = (node: any): any => node.id === id ? node : node.children?.map(find).find(Boolean);
  return find(design);
};
const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--ds-${name}`).trim();
const literal = (property: string, value: string) => { const el = document.createElement("span"); el.style.setProperty(property, value); return getComputedStyle(el).getPropertyValue(property); };
afterEach(() => { delete document.documentElement.dataset.size; delete document.documentElement.dataset.theme; });

for (const theme of ["light", "dark"]) for (const size of ["wide", "tall", "tall-narrow", "wide-short"]) {
  test(`controlled result uses the design components in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    render(<LevelResultScreen {...resultProps()} />, withPictures);
    const matches = (selector: string, properties: Record<string, string>) => {
      for (const [property, name] of Object.entries(properties)) expect(getComputedStyle(part(selector)).getPropertyValue(property), `${selector} ${property}`).toBe(literal(property, token(name)));
    };
    matches(".compare-result", { color: "ink" });
    matches(".compare-result-sand", { "background-color": "strata-1" });
    matches(".compare-result-ochre", { "background-color": "strata-2" });
    matches(".result-score", { color: "ink" });
    matches(".result-score-total", { color: size === "wide-short" ? "ink" : "ink-soft" });
    matches(".star-won", { color: "reward" });
    matches(".star:not(.star-won)", { color: "ink-soft" });
    matches(".best-score", { "background-color": "label", color: "on-label", "border-radius": "radius-tag" });
    matches(".celebration", { "background-color": "reward", color: "on-reward", "border-radius": "radius-tag" });
    matches(".play-again-button", { "background-color": "action", color: "on-action", "border-radius": "radius-pill" });
    matches(".result-actions .home-button", { "background-color": "strong", color: "on-strong", "border-radius": "radius-pill" });
    matches(".glow", { "background-color": "reward-glow" });
    expect(getComputedStyle(part(".compare-result")).backgroundImage).toContain(literal("color", token("sky-top")));
    expect(part(".compare-result-edge path").getAttribute("d")).toBe(component("m8Jt7").children[0].geometry);
    if (size === "tall-narrow") {
      expect(getComputedStyle(part(".result-score-value")).fontSize).toBe(token(component("qvw8g").descendants.icigh.fontSize.slice(4)));
      expect(getComputedStyle(part(".result-title")).fontSize).toBe(token("size-34"));
    }
    expect(getComputedStyle(part(".result-hero")).objectFit).toBe("contain");
    expect(getComputedStyle(part(".result-hero")).minHeight).toBe("120px");
    expect(symbolOf(part(".best-score"))).toBe("trophy");
    expect([...document.querySelectorAll(".star svg")].map(svg => svg.getAttribute("fill"))).toEqual([...Array(7).fill("currentColor"), ...Array(3).fill("none")]);
    const actions = [TEXTS.en.playAgain, TEXTS.en.home].map(name => screen.getByRole("button", { name }));
    expect(actions.map(symbolOf)).toEqual(["rotate-ccw", "house"]);
    expect(actions.every(button => parseFloat(getComputedStyle(button).height) >= 44)).toBe(true);
  });
}

const rewards = [
  { score: 4, best: 4, beaten: undefined, celebration: "first-best" as const },
  { score: 7, best: 7, beaten: 6, celebration: "new-best" as const },
  { score: 5, best: 7, beaten: undefined, celebration: null },
  { score: 7, best: 7, beaten: undefined, celebration: null },
  { score: 0, best: 0, beaten: undefined, celebration: null },
  { score: 4, best: undefined, beaten: undefined, celebration: null }
];
for (const language of ["en", "ru"] as const) for (const reward of rewards) {
  test(`controlled ${language} reward ${JSON.stringify(reward)} renders only supplied progress`, () => {
    document.documentElement.dataset.size = "tall-narrow";
    const props = resultProps({ language, ...reward });
    render(<LevelResultScreen {...props} />, withPictures);
    const text = TEXTS[language];
    expect(screen.getByLabelText(text.score).textContent).toBe(`${reward.score}/10`);
    expect(screen.getByRole("heading").textContent).toBe(text.wellDone);
    expect(screen.getByRole("img", { name: text.stars(reward.score, 10) }).children).toHaveLength(10);
    expect(document.querySelectorAll(".star-won")).toHaveLength(reward.score);
    expect(screen.queryByLabelText(text.bestScore)?.querySelector(".best-score-value")?.textContent).toBe(reward.best?.toString());
    expect(part(".best-score-beaten")?.textContent).toBe(reward.beaten?.toString());
    expect(document.querySelectorAll(".best-score .lucide-trophy")).toHaveLength(reward.best === undefined ? 0 : 1);
    expect(screen.queryByRole("status")?.textContent).toBe(reward.celebration ? text.celebrations[reward.celebration].text : undefined);
    expect(document.querySelectorAll(".festivity")).toHaveLength(reward.celebration ? 1 : 0);
    expect(screen.getByRole("button", { name: text.playAgain })).toBeDefined();
    expect(screen.getByRole("button", { name: text.home })).toBeDefined();
  });
}
for (const theme of ["light", "dark"]) for (const language of ["en", "ru"] as const) {
  test(`result text and controls keep contrast in ${theme}, ${language}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = "wide";
    render(<><LevelResultScreen {...resultProps({ language })} /><footer id="version">v1.0</footer></>, withPictures);
    for (const selector of [".result-score", ".result-score-total", ".result-title", ".celebration", ".best-score", ".best-score-value", ".best-score-beaten", ".play-again-button", ".result-actions .home-button"]) {
      const el = part(selector);
      const background = el.closest(".best-score, .celebration, button") ? surfaceOf(el) : token("strata-1");
      expect(contrast(getComputedStyle(el).color, background), selector).toBeGreaterThanOrEqual(selector === ".result-score-total" ? 3 : 4.5);
    }
    expect(contrast(getComputedStyle(part("#version")).color, token("strata-2"))).toBeGreaterThanOrEqual(4.5);
    for (const selector of [".star", ".star-won"]) expect(contrast(getComputedStyle(part(`${selector} svg`)).stroke, token("strata-1")), selector).toBeGreaterThanOrEqual(3);
  });
}

test("SORT retains the shared navy result and text stars", () => {
  document.documentElement.dataset.size = "wide";
  const legacy = resultProps();
  delete legacy.presentation;
  render(<LevelResultScreen {...legacy} />, withPictures);
  expect(document.querySelector(".compare-result-sand")).toBeNull();
  expect(getComputedStyle(part(".result")).backgroundColor).toBe("rgb(31, 43, 77)");
  expect([...document.querySelectorAll(".star")].map(el => el.textContent)).toEqual(Array(10).fill("★"));
  expect(document.querySelector(".best-score .lucide-trophy")).toBeNull();
});

for (const size of ["wide", "tall", "tall-narrow", "wide-short"]) {
  test(`controlled result clears safe areas in ${size}`, () => {
    document.documentElement.dataset.size = size;
    render(<LevelResultScreen {...resultProps()} />, withPictures);
    const padding = () => {
      const root = getComputedStyle(part(".compare-result"));
      const content = getComputedStyle(part(".result-content"));
      return [root.paddingTop, root.paddingRight, root.paddingLeft, String(parseFloat(root.paddingBottom) + parseFloat(content.paddingBottom))].map(parseFloat);
    };
    const before = padding();
    const sheet = document.createElement("style");
    sheet.textContent = appStylesheet({ top: 24, right: 13, bottom: 20, left: 19 });
    document.head.append(sheet);
    try { expect(padding().map((value, index) => value - before[index]!)).toEqual([24, 13, 19, 20]); }
    finally { sheet.remove(); }
  });
}
