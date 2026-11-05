import { act, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PairsWelcomeScreen } from "../src/PairsWelcomeScreen.tsx";
import { THEMES } from "../src/theme.ts";
import { withManualPictures } from "./pictures.tsx";
import { manualPictures } from "./support.ts";

// Find the pair's screens drawn from the dig-site tokens: each screen
// rendered from its props, in each theme and size class.

const style = window.getComputedStyle.bind(window);
const part = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const noop = () => {};
const SHAPES = ["wide", "tall", "tall-narrow", "wide-short"] as const;
type Shape = (typeof SHAPES)[number];
const phone = (shape: Shape) => shape === "tall-narrow" || shape === "wide-short";
afterEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.size; });

function at(theme: string, shape: Shape) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.size = shape;
}
// Each property of `selector` computes the dig-site token it names, as
// that literal would in the same theme and shape. Each style is read
// once: resolving it walks the whole stylesheet.
function matches(selector: string, properties: Record<string, string>) {
  const tokens = style(document.documentElement);
  const shown = style(part(selector));
  for (const [property, token] of Object.entries(properties)) {
    const literal = document.createElement("span");
    literal.style.setProperty(property, tokens.getPropertyValue(`--ds-${token}`));
    expect(shown.getPropertyValue(property), `${selector} ${property}`).toBe(getComputedStyle(literal).getPropertyValue(property));
  }
}
function showWelcome({ language = "en", level = "hatchling", climbLevel = 1, stars = 0 }: { language?: Language; level?: AgeLevel; climbLevel?: number; stars?: number } = {}) {
  const pictures = manualPictures();
  render(<PairsWelcomeScreen language={language} level={level} climbLevel={climbLevel} stars={stars} heroPicture="triceratops.webp" onLevel={noop} onPlay={noop} onHome={noop} />, withManualPictures(pictures));
  return pictures;
}

for (const theme of THEMES) for (const shape of SHAPES) {
  it(`draws the welcome from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    const pictures = showWelcome();
    matches(".pairs-hero-picture-card .picture", { "--shimmer-from": "pocket-1", "--shimmer-to": "label" });
    act(() => pictures.finish("triceratops.webp"));
    matches(".pairs-welcome", { color: "ink" });
    matches(".pairs-welcome-sand", { "background-color": "strata-1" });
    matches(".pairs-welcome-wave", { fill: "strata-1" });
    if (shape === "wide-short") expect(style(part(".pairs-welcome-bedrock")).display).toBe("none");
    else matches(".pairs-welcome-bedrock", { "background-color": "strata-2" });
    matches(".pairs-welcome-home", { "background-color": "quiet", color: "ink", "border-radius": "radius-pill", "font-size": "size-label" });
    if (shape === "wide-short") matches(".pairs-mark", { "background-color": "action", color: "on-action", "border-top-left-radius": "radius-12" });
    else matches(".pairs-mark", { "background-color": "pocket-1", color: "action", "border-top-left-radius": "radius-30", "border-bottom-left-radius": "radius-15" });
    matches(".pairs-title", { "font-size": { "wide": "size-40", "tall": "size-40", "tall-narrow": "size-title", "wide-short": "size-26" }[shape] });
    matches(".pairs-hero-back", { "background-color": "strong", color: "on-strong", "border-top-left-radius": phone(shape) ? "radius-12" : "radius-16" });
    for (const card of [".pairs-hero-silhouette", ".pairs-hero-picture-card"]) matches(card, { "background-color": "label", "border-top-color": "outline" });
    matches(".pairs-climb .pairs-chip", { "background-color": "quiet", color: "ink", "border-radius": "radius-tag" });
    matches(".pairs-stars", { "background-color": "quiet", color: "ink", "border-radius": "radius-tag" });
    matches(".pairs-stars svg", { color: "reward" });
    matches(".pairs-stars .pairs-chip-number", { "font-size": phone(shape) ? "size-22" : "size-32" });
    matches(".pairs-welcome .level-switch", { "background-color": "quiet" });
    matches('.pairs-welcome .level-switch-level[aria-pressed="true"]', { "background-color": "strong", color: "on-strong", "font-size": "size-tag" });
    matches('.pairs-welcome .level-switch-level[aria-pressed="false"]', { color: "ink" });
    matches(".pairs-play-button", { "background-color": "action", color: "on-action", "border-radius": "radius-pill", "font-size": { "wide": "size-action", "tall": "size-30", "tall-narrow": "size-30", "wide-short": "size-26" }[shape] });
    for (const selector of [".pairs-title", ".pairs-welcome-home", ".pairs-play-button", ".pairs-stars"]) expect(style(part(selector)).fontWeight, selector).toBe("800");
  });

  it(`names the levels as its board does, and HOME by its house on a phone, in ${theme} ${shape}`, () => {
    at(theme, shape);
    showWelcome();
    const names = [...document.querySelectorAll(".level-switch-level")].map((level) => style(level.querySelector(".level-switch-name")!).position);
    // On a phone upright only the chosen level is named; on its side none
    // is; the names stay for screen readers.
    const hidden = shape === "wide-short" ? [true, true, true] : shape === "tall-narrow" ? [false, true, true] : [false, false, false];
    expect(names.map((position) => position === "absolute")).toEqual(hidden);
    expect(style(part(".pairs-welcome-home span")).display).toBe(phone(shape) ? "none" : "inline");
    expect(style(part(".pairs-welcome .level-switch-mark")).display).toBe("none");
  });
}

it.each(["en", "ru"] as const)("shows the %s title, chips and PLAY each with its symbol", (language) => {
  const text = TEXTS[language];
  showWelcome({ language, climbLevel: 3, stars: 14 });
  const title = part(".pairs-title");
  expect(title.textContent).toBe(text.pairs);
  expect(text.pairs).toBe(text.pairs.toLocaleUpperCase(language));
  expect(title.querySelector(".pairs-mark svg")).not.toBeNull();
  const climb = within(document.body).getByLabelText(text.level);
  const stars = within(document.body).getByLabelText(text.starsEarned);
  expect([climb.textContent, climb.querySelector("svg") !== null, stars.textContent, stars.querySelector("svg") !== null]).toEqual(["3", true, "14", true]);
  for (const selector of [".pairs-welcome-home", ".pairs-play-button"]) expect(part(selector).querySelector("svg"), selector).not.toBeNull();
  expect(part(".pairs-play-button").textContent).toBe(text.play);
});

it.each(["explorer", "paleontologist"] as const)("folds the climb level away at %s, its stars still shown", (level) => {
  showWelcome({ level, climbLevel: 2, stars: 5 });
  const climb = part(".pairs-climb");
  expect([climb.hasAttribute("data-shown"), climb.getAttribute("aria-hidden"), style(climb).opacity]).toEqual([false, "true", "0"]);
  expect(part(".pairs-stars").textContent).toBe("5");
});
