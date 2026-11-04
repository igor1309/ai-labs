import { act, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GameAudioButton } from "../src/GameAudioButton.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { THEMES } from "../src/theme.ts";
import { WhoseJawResultScreen, type JawResult } from "../src/WhoseJawResultScreen.tsx";
import { JAWS } from "./whoseJaw.ts";
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

function showResult(language: "en" | "ru", celebration: JawResult["celebration"] = "first-best", newly = 5) {
  const pictures = manualPictures();
  const jaws = JAWS.slice(0, 5).map(({ id, name }, index) => ({ id, name, picture: `${id}.webp`, newly: index < newly }));
  render(<WhoseJawResultScreen language={language} result={{ stars: 2, best: 3, beaten: celebration === "new-best" ? 1 : undefined, celebration, jaws }}
    audioControl={<GameAudioButton language={language} muted={false} onToggle={noop} />} onPlayAgain={noop} onShelf={noop} onHome={noop} />, withManualPictures(pictures));
  act(() => { for (const jaw of jaws) pictures.finish(jaw.picture); });
}

for (const theme of THEMES) for (const shape of SHAPES) {
  it(`draws the result from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    showResult("en");
    matches(".whose-jaw-result", { color: "ink", "font-family": "font" });
    matches(".jaw-result-sand", { "background-color": "strata-1" });
    matches(".jaw-result-wave", { fill: "strata-1" });
    matches(".whose-jaw-result .glow", { "background-color": "reward" });
    if (shape === "wide-short") expect(style(part(".jaw-result-bedrock")).display).toBe("none");
    else matches(".jaw-result-bedrock", { "background-color": "strata-2" });
    matches(".whose-jaw-result h1", { "font-size": shape === "wide-short" ? "size-24" : shape === "tall-narrow" ? "size-action" : "size-title" });
    matches(".jaw-result-record", { "background-color": "reward", color: "on-reward", "border-radius": "radius-tag" });
    matches(".jaw-result-record .celebration", { "font-size": "size-14" });
    matches(".whose-jaw-result .best-score-value", { "font-size": "size-action", color: "on-reward" });
    matches(".jaw-result-shelf", { "border-bottom-color": "plank", "border-radius": "radius-4" });
    matches(".jaw-result-collection p", { "font-size": "size-14" });
    matches(".jaw-result-jaws li", { "background-color": "photo-white", "border-radius": "radius-18" });
    matches(".jaw-result-find", { "background-color": "photo-white", "border-radius": "radius-10" });
    expect([...document.querySelectorAll(".jaw-result-jaws li")].map(card => style(card).rotate)).toEqual(["10deg", "-7deg", "3deg", "-6deg", "8deg"]);
    for (const selector of [".whose-jaw-result h1", ".jaw-result-record .celebration", ".jaw-result-collection p"]) expect(style(part(selector)).fontWeight, selector).toBe("800");
  });

  it(`draws the result actions from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    showResult("en");
    matches(".jaw-result-play", { "background-color": "action", color: "on-action", "border-radius": "radius-pill", "font-size": shape === "tall-narrow" ? "size-26" : shape === "wide-short" ? "size-18" : "size-action" });
    matches(".jaw-result-visit", { "background-color": "strong", color: "on-strong" });
    matches(".jaw-result-home", { color: "ink", "border-top-color": "ink" });
    expect(style(part(".jaw-result-home")).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style(part(".jaw-result-actions button")).fontWeight).toBe("800");
  });
}

it.each(THEMES)("keeps the ordinary best on a quiet chip in %s", theme => {
  at(theme, "wide");
  showResult("en", null, 0);
  matches(".jaw-result-record", { "background-color": "quiet", color: "ink" });
  matches(".whose-jaw-result .best-score-value", { color: "ink" });
  expect(document.querySelector(".jaw-result-collection")).toBeNull();
  expect(document.querySelector(".celebration")).toBeNull();
});

it.each(["en", "ru"] as const)("shows localized result rewards and actions with symbols in %s", language => {
  showResult(language, "new-best", 2);
  const text = TEXTS[language];
  expect(part(".jaw-result-title").textContent).toBe(text.wellDone);
  expect(part(".jaw-result-new-label").textContent).toBe(text.jawNewCollection);
  expect(part(".jaw-result-record > svg")).not.toBeNull();
  expect(part(".jaw-result-collection svg")).not.toBeNull();
  expect([...document.querySelectorAll(".jaw-result-actions button")].map(button => [button.textContent, !!button.querySelector("svg")])).toEqual([
    [text.playAgain, true], [text.jawShelf, true], [text.home, true]
  ]);
  expect([...document.querySelectorAll(".jaw-result-jaws img")].map(image => image.getAttribute("alt"))).toEqual(JAWS.slice(0, 5).map(jaw => jaw.name[language].toLocaleUpperCase(language)));
  expect(document.querySelectorAll(".jaw-result-find")).toHaveLength(2);
});
