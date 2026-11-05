import { act, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LevelOfferDialog } from "../src/LevelOfferDialog.tsx";
import { PairsBoardScreen, type PairCardView } from "../src/PairsBoardScreen.tsx";
import { PairsResultScreen, type PairsResultScreenProps } from "../src/PairsResultScreen.tsx";
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
    matches(".pairs-hero-shadow", { "background-color": "ink" });
    expect([style(part(".pairs-hero .pair-silhouette")).opacity, style(part(".pairs-hero-shadow")).display]).toEqual(["0", "block"]);
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

// A board's cards, one of each step of a round: face down, open, found,
// at the face its age level shows.
const FACES = { hatchling: "picture", explorer: "silhouette", paleontologist: "skeleton" } as const;
function boardCards(level: AgeLevel): PairCardView[] {
  const face = FACES[level];
  const card = (id: string, state: PairCardView["state"]): PairCardView => ({ id, name: id === "rex" ? "Tyrannosaurus" : "Pachycephalosaurus", picture: `${id}.webp`, face, state });
  return [card("rex", "down"), card("rex", "open"), card("pachy", "found"), card("pachy", "found"), card("rex", "down"), card("rex", "down")];
}
function showBoard({ language = "en", level = "hatchling", finished = false }: { language?: Language; level?: AgeLevel; finished?: boolean } = {}) {
  const pictures = manualPictures();
  render(<PairsBoardScreen language={language} climbLevel={level === "hatchling" ? 3 : undefined} tries={7} rows={2} columns={3} cardFloor={150}
    cards={boardCards(level)} finished={finished} onTurn={noop} onBack={noop} onHome={noop} />, withManualPictures(pictures));
  return pictures;
}

for (const theme of THEMES) for (const shape of SHAPES) {
  it(`draws the board from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    const pictures = showBoard();
    matches('.pair-card[data-state="open"] .picture', { "background-color": "pocket-1", "--shimmer-from": "pocket-1", "--shimmer-to": "strata-1", "border-top-left-radius": "radius-10" });
    act(() => pictures.finishAll());
    matches(".pairs-board-screen", { color: "ink" });
    matches(".pairs-board-sand", { "background-color": "strata-1" });
    matches(".pairs-board-wave", { fill: "strata-1" });
    if (shape === "wide-short") expect(style(part(".pairs-board-bedrock")).display).toBe("none");
    else matches(".pairs-board-bedrock", { "background-color": "strata-2" });
    for (const button of [".pairs-bar-home", ".pairs-bar-back"]) matches(button, { "background-color": "quiet", color: "ink", "border-top-left-radius": "radius-pill" });
    matches(".pairs-bar-mark", { "background-color": "action", color: "on-action", "border-top-left-radius": shape === "wide-short" ? "radius-10" : "radius-12" });
    for (const chip of [...document.querySelectorAll(".pairs-bar-chip")].keys()) matches(`.pairs-bar-chip:nth-child(${chip + 1})`, { "background-color": "quiet", color: "ink", "border-radius": "radius-tag" });
    matches(".pairs-bar-number", { "font-size": phone(shape) ? "size-20" : "size-24" });
    const radius = phone(shape) ? "radius-12" : "radius-16";
    matches('.pair-card[data-state="down"]', { "border-top-left-radius": radius });
    matches('.pair-card[data-state="down"] .pair-card-back', { "background-color": "strong", color: "on-strong" });
    matches('.pair-card[data-state="open"] .pair-card-face', { "background-color": "label", "border-top-color": "outline", padding: phone(shape) ? "space-6" : "space-s" });
    matches('.pair-card[data-state="found"] .pair-card-face', { "background-color": "label", "border-top-color": "good" });
    expect(style(part('.pair-card[data-state="open"] .pair-card-face')).borderTopWidth).toBe("2px");
    expect(style(part('.pair-card[data-state="found"] .pair-card-face')).borderTopWidth).toBe("4px");
    const name = style(part('.pair-card[data-state="found"] .pair-card-name'));
    // On a phone a found card's name is left to its label.
    expect([name.fontWeight, name.display === "none"]).toEqual(["900", phone(shape)]);
  });

  it(`shows BACK and HOME, and the title, as its board does in ${theme} ${shape}`, () => {
    at(theme, shape);
    showBoard();
    const hidden = (selector: string) => style(part(selector)).position === "absolute";
    // HOME's word shows wide and upright on an iPad; BACK's only wide;
    // the title's word wide and on a phone on its side; on an upright
    // phone there is no title.
    expect([hidden(".pairs-bar-home .pairs-bar-name"), hidden(".pairs-bar-back .pairs-bar-name"), hidden(".pairs-bar-word"), hidden(".pairs-bar-title")]).toEqual({
      "wide": [false, false, false, false], "tall": [false, true, true, false], "tall-narrow": [true, true, true, true], "wide-short": [true, true, false, false]
    }[shape]);
  });
}

it.each(["hatchling", "explorer", "paleontologist"] as const)("draws %s's face up cards in its own face, a silhouette in ink", (level) => {
  at("light", "wide");
  const pictures = showBoard({ level });
  act(() => pictures.finishAll());
  const faces = [...document.querySelectorAll('.pair-card:not([data-state="down"])')].map((card) => card.getAttribute("data-face"));
  expect(faces).toEqual([FACES[level], FACES[level], FACES[level]]);
  expect(document.querySelectorAll(".pair-card-shadow")).toHaveLength(level === "explorer" ? 3 : 0);
  if (level === "explorer") {
    matches(".pair-card-shadow", { "background-color": "ink" });
    expect([style(part(".pair-silhouette")).opacity, style(part(".pair-card-shadow")).display]).toEqual(["0", "block"]);
  }
});

it.each(["en", "ru"] as const)("names the %s bar's buttons, title and chips, each with its symbol, HOME first", (language) => {
  const text = TEXTS[language];
  showBoard({ language });
  const buttons = [...document.querySelectorAll(".pairs-bar button")];
  expect(buttons.map((button) => [button.textContent, button.querySelector("svg") !== null])).toEqual([[text.home, true], [text.back, true]]);
  expect([part(".pairs-bar-title").textContent, part(".pairs-bar-mark svg") !== null]).toEqual([text.pairs, true]);
  const climb = within(document.body).getByLabelText(text.level);
  const tries = within(document.body).getByLabelText(text.tries);
  expect([climb.textContent, climb.querySelector("svg.pairs-stairs") !== null, tries.textContent, tries.querySelector("svg") !== null]).toEqual(["3", true, "7", true]);
});

it("shows a card whose picture cannot be loaded by its name alone", () => {
  at("light", "wide");
  const pictures = showBoard();
  act(() => pictures.fail("rex.webp"));
  act(() => pictures.finish("pachy.webp"));
  const open = part('.pair-card[data-state="open"]');
  expect([style(open.querySelector(".pair-card-art")!).display, open.querySelector(".pair-card-name")?.textContent]).toEqual(["none", "TYRANNOSAURUS"]);
  matches('.pair-card[data-state="open"] .pair-card-name', { "font-size": "size-16" });
});

// A result's rewards, from its props: a first best with a NEW find and a
// new level, or the best kept.
function showResult({ language = "en", ...props }: Partial<PairsResultScreenProps> = {}) {
  const pictures = manualPictures();
  const pals = [{ id: "rex", name: "Tyrannosaurus", picture: "rex.webp", newlyFound: true }, { id: "pachy", name: "Pachycephalosaurus", picture: "pachy.webp", newlyFound: false }, { id: "trike", name: "Triceratops", picture: "trike.webp", newlyFound: false }];
  render(<PairsResultScreen language={language} pals={pals} tries={5} stars={2} best={5} beaten={undefined} celebration="first-best" levelUp={{ level: 2, rows: 2, columns: 4 }} onPlayAgain={noop} onBack={noop} onHome={noop} {...props} />, withManualPictures(pictures));
  return pictures;
}

for (const theme of THEMES) for (const shape of SHAPES) {
  it(`draws the result from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    const pictures = showResult();
    matches(".pairs-found-art .picture", { "--shimmer-from": "pocket-1", "--shimmer-to": "strata-1" });
    act(() => pictures.finishAll());
    matches(".pairs-result", { color: "ink" });
    matches(".pairs-result-sand", { "background-color": "strata-1" });
    matches(".pairs-result-wave", { fill: "strata-1" });
    if (shape === "wide-short") expect(style(part(".pairs-result-bedrock")).display).toBe("none");
    else matches(".pairs-result-bedrock", { "background-color": "strata-2" });
    matches(".pairs-found-card", { "background-color": "label", "border-top-color": "outline", color: "ink" });
    matches(".pairs-new-badge", { "background-color": "reward", color: "on-reward", "font-size": "size-tag" });
    matches(".pairs-level-up", { "background-color": "reward", color: "on-reward" });
    matches(".pairs-next-board", { "background-color": "on-reward" });
    matches(".pairs-next-card", { "background-color": "reward" });
    matches(".pairs-result-stars", { "background-color": "quiet" });
    matches(".pairs-best", { "background-color": "reward", color: "on-reward" });
    matches(".pairs-result-title", { "font-size": shape === "wide" || shape === "tall" ? "size-40" : shape === "tall-narrow" ? "size-34" : "size-26" });
    matches(".play-again-button", { "background-color": "action", color: "on-action", "border-radius": "radius-pill" });
    matches(".pairs-result-back", { "background-color": "strong", color: "on-strong" });
    matches(".pairs-result-home", { "border-top-color": "ink", color: "ink" });
  });

  it(`keeps the best quiet when no new best is set in ${theme} ${shape}`, () => {
    at(theme, shape);
    showResult({ celebration: null, levelUp: null });
    matches(".pairs-best", { "background-color": "quiet", color: "ink" });
    matches(".pairs-best svg", { color: "reward" });
  });

  it(`draws the level offer from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    render(<LevelOfferDialog digSite language="en" offer={{ level: "explorer", onYes: noop, onNotNow: noop, onShown: noop, startTimer: () => noop }} leaving={false} onShown={noop} onAnswer={noop} onGone={noop} />);
    matches(".pairs-offer", { "background-color": "label", color: "ink", "border-radius": "radius-panel" });
    matches(".pairs-offer-tag", { "background-color": "reward", color: "on-reward" });
    matches(".pairs-offer-picture", { "background-color": "pocket-1" });
    matches(".pairs-offer-yes", { "background-color": "action", color: "on-action" });
    matches(".pairs-offer-not-now", { "border-top-color": "ink", color: "ink" });
  });
}

it.each(["en", "ru"] as const)("shows the %s rewards in words and symbols, the offer NOT NOW first", (language) => {
  const text = TEXTS[language];
  showResult({ language });
  expect(part(".pairs-level-up").textContent).toBe(text.newLevel(2));
  expect(document.querySelectorAll(".pairs-next-card")).toHaveLength(8);
  expect(part(".celebration-text").textContent).toBe(text.celebrations["first-best"].text);
  expect(part(".pairs-new-word").textContent).toBe(text.newlyFound);
  render(<LevelOfferDialog digSite language={language} offer={{ level: "explorer", onYes: noop, onNotNow: noop, onShown: noop, startTimer: () => noop }} leaving={false} onShown={noop} onAnswer={noop} onGone={noop} />);
  expect(part(".pairs-offer-tag").textContent).toBe(text.levelOffer.tag);
  expect([...document.querySelectorAll(".pairs-offer-answers button")].map((button) => button.textContent)).toEqual([text.levelOffer.notNow, text.levelOffer.yes]);
});

it("leaves the offer of the other games undressed", () => {
  render(<LevelOfferDialog language="en" offer={{ level: "explorer", onYes: noop, onNotNow: noop, onShown: noop, startTimer: () => noop }} leaving={false} onShown={noop} onAnswer={noop} onGone={noop} />);
  expect(document.querySelector(".pairs-offer-tag")).toBeNull();
  expect([...document.querySelectorAll(".pairs-offer-answers button")].map((button) => button.textContent)).toEqual(["YES", "NOT NOW"]);
});

it.each([
  ["ru", "Тираннозавр", "ТИ\u00ADРАННО\u00ADЗАВР"],
  ["en", "Pachycephalosaurus", "PA\u00ADCHY\u00ADCE\u00ADPHA\u00ADLO\u00ADSAU\u00ADRUS"],
  ["en", "T. rex", "T. REX"]
] as const)("breaks the %s name %s only between its syllables", (language, name, shown) => {
  showResult({ language, pals: [{ id: "pal", name, picture: "", newlyFound: false }] });
  expect(document.querySelector(".pairs-found-name")?.textContent).toBe(shown);
});
