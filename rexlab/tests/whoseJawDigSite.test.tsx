import { act, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GameAudioButton } from "../src/GameAudioButton.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { THEMES } from "../src/theme.ts";
import { WhoseJawWelcomeScreen } from "../src/WhoseJawWelcomeScreen.tsx";
import { withManualPictures } from "./pictures.tsx";
import { computedStyleWithVariables } from "./stylesheet.ts";
import { manualPictures } from "./support.ts";

const style = computedStyleWithVariables(window.getComputedStyle.bind(window));
const part = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const noop = () => {};
const SHAPES = ["wide", "tall", "tall-narrow", "wide-short"] as const;
const phone = (shape: string) => shape === "tall-narrow" || shape === "wide-short";
afterEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.size; });

function at(theme: string, shape: string) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.size = shape;
}
// Each property of `selector` computes the dig-site token it names, as
// that literal would in the same theme and shape.
function matches(selector: string, properties: Record<string, string>) {
  for (const [property, token] of Object.entries(properties)) {
    const literal = document.createElement("span");
    literal.style.setProperty(property, style(document.documentElement).getPropertyValue(`--ds-${token}`));
    expect(style(part(selector)).getPropertyValue(property), `${selector} ${property}`).toBe(getComputedStyle(literal).getPropertyValue(property));
  }
}
function showWelcome(language: "en" | "ru" = "en", best: number | null = 2) {
  const pictures = manualPictures();
  render(<WhoseJawWelcomeScreen audioControl={<GameAudioButton language={language} muted={false} onToggle={noop} />} language={language} level="explorer" best={best} collected={5} total={16}
    jawPicture="jaw.webp" gummyPicture="gummy.webp" onLevel={noop} onPlay={noop} onShelf={noop} onHome={noop} />, withManualPictures(pictures));
  return pictures;
}

for (const theme of THEMES) for (const shape of SHAPES) {
  it(`draws the welcome from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    const pictures = showWelcome();
    matches(".whose-jaw-gummy", { "--shimmer-from": "pocket-1", "--shimmer-to": "label" });
    act(() => { pictures.finish("gummy.webp"); pictures.finish("jaw.webp"); });
    matches(".whose-jaw-welcome", { color: "ink" });
    matches(".whose-jaw-welcome-sand", { "background-color": "strata-1" });
    matches(".whose-jaw-welcome-wave", { fill: "strata-1" });
    if (shape === "wide-short") expect(style(part(".whose-jaw-welcome-bedrock")).display).toBe("none");
    else matches(".whose-jaw-welcome-bedrock", { "background-color": "strata-2" });
    matches(".whose-jaw-welcome-home", { "background-color": "quiet", color: "ink", "border-radius": "radius-pill", "font-size": "size-label" });
    matches(".whose-jaw-welcome-mark", { "background-color": "pocket-1", color: "action", "border-top-left-radius": "radius-30", "border-bottom-left-radius": "radius-15" });
    matches(".whose-jaw-welcome-title", { "font-size": shape === "tall-narrow" ? "size-27" : "size-40" });
    matches(".whose-jaw-gummy", { "background-color": "photo-white" });
    matches(".whose-jaw-chomp", { "background-color": "photo-white" });
    matches(".whose-jaw-best", { "background-color": "reward", color: "on-reward", "border-radius": "radius-tag" });
    matches(".whose-jaw-collection", { "background-color": "quiet", color: "ink", "border-radius": "radius-tag" });
    matches(".whose-jaw-collection .whose-jaw-badge-number", { "font-size": shape === "tall-narrow" ? "size-title" : "size-32" });
    matches(".whose-jaw-badge-of", { color: "ink-soft", "font-size": shape === "tall-narrow" ? "size-20" : "size-22" });
    matches(".whose-jaw-welcome .level-switch", { "background-color": "quiet", "border-radius": "radius-pill" });
    matches('.whose-jaw-welcome .level-switch-level[aria-pressed="true"]', { "background-color": "strong", color: "on-strong", "font-size": "size-tag" });
    matches('.whose-jaw-welcome .level-switch-level[aria-pressed="false"]', { color: "ink" });
    matches(".whose-jaw-play", { "background-color": "action", color: "on-action", "border-radius": "radius-pill", "font-size": shape === "wide-short" ? "size-18" : "size-action" });
    matches(".whose-jaw-shelf", { "background-color": "strong", color: "on-strong", "border-radius": "radius-pill", "font-size": shape === "wide-short" ? "size-18" : "size-action" });
    for (const selector of [".whose-jaw-welcome-title", ".whose-jaw-welcome-home", ".whose-jaw-play", ".whose-jaw-shelf", ".whose-jaw-badges p"]) {
      expect(style(part(selector)).fontWeight, selector).toBe("800");
    }
  });

  it(`names the chosen level, and on a phone only it, in ${theme} ${shape}`, () => {
    at(theme, shape);
    showWelcome();
    const names = [...document.querySelectorAll(".level-switch-level")].map((level) => [level.getAttribute("aria-pressed"), style(level.querySelector(".level-switch-name")!).position]);
    expect(names).toEqual([["false", phone(shape) ? "absolute" : "static"], ["true", "static"], ["false", phone(shape) ? "absolute" : "static"]]);
    expect(style(part(".whose-jaw-welcome-home span")).display).toBe(phone(shape) ? "none" : "inline");
    expect(style(part(".whose-jaw-welcome .level-switch-mark")).display).toBe("none");
  });
}

it.each(["en", "ru"] as const)("shows the %s title, badges and actions each with its symbol", (language) => {
  const text = TEXTS[language];
  showWelcome(language);
  const title = part(".whose-jaw-welcome-title");
  expect(title.textContent).toBe(text.whoseJaw);
  expect(text.whoseJaw).toBe(text.whoseJaw.toLocaleUpperCase(language));
  expect(title.querySelector(".whose-jaw-welcome-mark svg")).not.toBeNull();
  const best = within(document.body).getByLabelText(text.bestScore);
  expect([best.textContent, best.querySelector("svg") !== null]).toEqual(["2", true]);
  const collection = within(document.body).getByLabelText(text.jawCollection);
  expect([collection.textContent, collection.querySelector("svg") !== null]).toEqual(["5 / 16", true]);
  for (const selector of [".whose-jaw-welcome-home", ".whose-jaw-play", ".whose-jaw-shelf"]) expect(part(selector).querySelector("svg"), selector).not.toBeNull();
  expect([part(".whose-jaw-play").textContent, part(".whose-jaw-shelf").textContent]).toEqual([text.play, text.jawShelf]);
  expect(part(".whose-jaw-welcome-bar .game-audio-button").getAttribute("aria-label")).toBe(text.gameAudio.mute);
});

it("leaves out the best badge before there is a best", () => {
  showWelcome("en", null);
  expect(document.querySelectorAll(".whose-jaw-badges p")).toHaveLength(1);
  expect(document.querySelector(".whose-jaw-best")).toBeNull();
});
