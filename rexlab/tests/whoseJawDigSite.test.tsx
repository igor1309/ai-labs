import { act, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GameAudioButton } from "../src/GameAudioButton.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { THEMES } from "../src/theme.ts";
import { WhoseJawBoardScreen, type WhoseJawBoardScreenProps } from "../src/WhoseJawBoardScreen.tsx";
import { WhoseJawWelcomeScreen } from "../src/WhoseJawWelcomeScreen.tsx";
import { withManualPictures, withPictures } from "./pictures.tsx";
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
// Each style is read once: resolving it walks the whole stylesheet.
function matches(selector: string, properties: Record<string, string>) {
  const tokens = style(document.documentElement);
  const shown = style(part(selector));
  for (const [property, token] of Object.entries(properties)) {
    const literal = document.createElement("span");
    literal.style.setProperty(property, tokens.getPropertyValue(`--ds-${token}`));
    expect(shown.getPropertyValue(property), `${selector} ${property}`).toBe(getComputedStyle(literal).getPropertyValue(property));
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

const CHOICE_IDS = ["tyrannosaurus", "triceratops", "stegosaurus", "velociraptor"];
function boardProps(count: number, changes: Partial<WhoseJawBoardScreenProps> = {}, language: "en" | "ru" = "en"): WhoseJawBoardScreenProps {
  return {
    audioControl: <GameAudioButton language={language} muted={false} onToggle={noop} />, language, phase: "waiting",
    choices: CHOICE_IDS.slice(0, count).map((id, at) => ({ id, name: id.toUpperCase(), picture: `${id}.webp`, food: `food-${at % 2}.webp`, diet: at % 2 ? "plants" : "meat", mouth: { x: 50, y: 50, width: 30, mirror: false, angle: 0 } })),
    jawPicture: "jaw.webp", placed: [{ firstTry: true }, { firstTry: false }], target: undefined, hint: undefined, jawDiet: "meat", best: 2,
    foodShown: count === 2, namesShown: count === 4, feedback: undefined,
    onPlace: noop, onNext: noop, onName: noop, onSlide: noop, onBack: noop, onHome: noop, ...changes
  };
}
function showBoard(count: number, changes: Partial<WhoseJawBoardScreenProps> = {}, language: "en" | "ru" = "en") {
  return render(<WhoseJawBoardScreen {...boardProps(count, changes, language)} />, withPictures);
}
const card = (id: string) => [...document.querySelectorAll(".jaw-dinosaur")].find((each) => each.getAttribute("aria-label") === id.toUpperCase())!;
const POCKETS: Record<string, Record<number, string>> = {
  tall: { 2: "260px", 3: "220px", 4: "200px" },
  "tall-narrow": { 2: "150px", 3: "118px", 4: "96px" },
  "wide-short": { 2: "150px", 3: "110px", 4: "76px" }
};

for (const theme of THEMES) for (const shape of SHAPES) {
  it(`draws the board's sky, sand and bar from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    showBoard(2);
    matches(".whose-jaw-board", { color: "ink" });
    matches(".jaw-sand", { "background-color": "strata-1" });
    matches(".jaw-sand-wave", { fill: "strata-1" });
    if (shape === "wide-short") expect(style(part(".jaw-bedrock")).display).toBe("none");
    else matches(".jaw-bedrock", { "background-color": "strata-2" });
    matches(".whose-jaw-board-bar .home-button", { "background-color": "quiet", color: "ink", "border-radius": "radius-pill", "font-size": "size-label" });
    matches(".jaw-board-mark", { "background-color": "pocket-1", color: "action", "border-top-left-radius": "radius-30", "border-bottom-left-radius": "radius-15" });
    matches(".jaw-board-title", { "font-size": shape === "tall-narrow" ? "size-27" : shape === "wide-short" ? "size-24" : "size-40" });
    expect(style(part(".jaw-board-title")).fontWeight).toBe("800");
    matches(".jaw-socket:not([data-filled])", { "background-color": "quiet", color: "outline", "border-top-color": "outline", "border-top-left-radius": "radius-10", "border-bottom-left-radius": "radius-16" });
    matches(".jaw-socket[data-shining]", { "background-color": "strong", color: "on-strong", "border-top-color": "reward" });
    expect(style(part(".jaw-socket[data-shining]")).borderTopWidth).toBe("3px");
    matches(".jaw-socket[data-filled]:not([data-shining])", { "background-color": "strong", color: "on-strong" });
  });

  it(`draws the board's cards and tray from the dig-site tokens in ${theme} ${shape}`, () => {
    at(theme, shape);
    showBoard(2);
    matches(".jaw-pocket", { "background-color": "photo-white", "border-top-color": "outline", "border-radius": "radius-24" });
    matches(".jaw-window", { "border-radius": "radius-16" });
    matches(".jaw-food-tag", { "background-color": "label", color: "on-label", "border-radius": "radius-tag", "font-size": "size-label" });
    matches(".jaw-tray", { "background-color": "pocket-1", "border-radius": "radius-28" });
    matches(".jaw-loose", { "background-color": "photo-white", "border-radius": "radius-speech" });
    matches(".jaw-prompt", { color: "ink", "font-size": shape === "wide" || shape === "tall" ? "size-24" : shape === "tall-narrow" ? "size-18" : "size-16" });
    expect(style(part(".jaw-prompt")).fontWeight).toBe("800");
  });

  it(`shows the best score, and on a phone only the sockets, in ${theme} ${shape}`, () => {
    at(theme, shape);
    showBoard(3);
    const hidden = phone(shape);
    expect(style(part(".jaw-board-best")).display).toBe(hidden ? "none" : "flex");
    expect(style(part(".whose-jaw-board-bar .home-button span")).display).toBe(hidden ? "none" : "inline");
    if (!hidden) {
      matches(".jaw-board-best svg", { color: "reward" });
      matches(".jaw-board-best-number", { color: "ink", "font-size": "size-number" });
      matches(".jaw-board-best-of", { color: "ink-soft", "font-size": "size-label" });
    }
  });

  it.each([2, 3, 4])(`gives %i cards their board's pockets in ${theme} ${shape}`, (count) => {
    at(theme, shape);
    showBoard(count);
    if (shape !== "wide") expect(style(part(".jaw-pocket")).getPropertyValue("--jb-pocket")).toBe(POCKETS[shape]![count]);
    expect(document.querySelectorAll(".jaw-food-tag").length).toBe(count === 2 ? 2 : 0);
    expect(document.querySelectorAll(".jaw-name").length).toBe(count === 4 ? 4 : 0);
    if (count === 4) expect(style(part(".jaw-name")).fontWeight).toBe("800");
  });

  it(`lights each card by its step in ${theme} ${shape}`, () => {
    at(theme, shape);
    const view = showBoard(3, { phase: "wrong", target: "triceratops", feedback: { words: "OW!", symbol: "🌿" } });
    const stroke = (id: string) => style(card(id).querySelector(".jaw-pocket")!);
    const literal = (token: string) => { const span = document.createElement("span"); span.style.color = style(document.documentElement).getPropertyValue(`--ds-${token}`); return getComputedStyle(span).color; };
    expect([stroke("triceratops").borderTopColor, stroke("triceratops").borderTopWidth]).toEqual([literal("bad"), "5px"]);
    expect(stroke("tyrannosaurus").borderTopColor).toBe(literal("outline"));
    matches(".jaw-feedback p", { "background-color": "label", color: "on-label", "border-radius": "radius-speech", "font-size": "size-label" });
    matches(".jaw-feedback p svg", { color: "action" });
    expect(style(part(".jaw-feedback")).position).toBe("absolute");
    expect(style(part(".jaw-slot")).opacity).toBe("0.6");
    expect(style(part(".jaw-prompt")).display).toBe("none");
    view.unmount();

    const right = showBoard(3, { phase: "reading", target: "triceratops", feedback: { words: "A FACT.", symbol: "🦷" } });
    expect([stroke("triceratops").borderTopColor, stroke("triceratops").borderTopWidth]).toEqual([literal("good"), "5px"]);
    expect(stroke("tyrannosaurus").opacity).toBe("0.35");
    expect(stroke("triceratops").opacity).not.toBe("0.35");
    matches(".jaw-next", { "background-color": "action", color: "on-action", "border-radius": "radius-pill" });
    matches(".jaw-feedback p", { color: "ink" });
    matches(".jaw-feedback p svg", { color: "reward" });
    expect(style(part(".jaw-feedback")).position).not.toBe("absolute");
    expect(style(part(".jaw-slot")).display).toBe("none");
    right.unmount();

    showBoard(2, { hint: "tyrannosaurus" });
    expect([stroke("tyrannosaurus").borderTopColor, stroke("tyrannosaurus").borderTopWidth]).toEqual([literal("reward"), "6px"]);
    expect(style(card("tyrannosaurus").querySelector(".jaw-food-tag")!).backgroundColor).toBe(literal("reward"));
  });
}

it("lights the cards and clears the prompt while the jaw is held", () => {
  at("light", "wide");
  showBoard(2);
  const jaw = part(".jaw-loose");
  expect(style(part(".jaw-prompt")).visibility).not.toBe("hidden");
  fireEvent.click(jaw);
  matches(".jaw-pocket", { "border-top-color": "strong" });
  expect(style(part(".jaw-pocket")).borderTopWidth).toBe("3px");
  expect(style(part(".jaw-prompt")).visibility).toBe("hidden");
});

it("leaves a faint jaw in the tray while one is dragged", () => {
  at("light", "wide");
  showBoard(2);
  const jaw = part(".jaw-loose");
  expect(document.querySelector(".jaw-ghost")).toBeNull();
  fireEvent.pointerDown(jaw, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
  fireEvent(window, Object.assign(new MouseEvent("pointermove", { clientX: 40, clientY: 0 }), { pointerId: 1 }));
  expect(style(part(".jaw-ghost")).opacity).toBe("0.18");
});

it.each(["en", "ru"] as const)("says the %s prompt, title and food each with its picture, and the hint's food in the tray", (language) => {
  const text = TEXTS[language];
  at("light", "wide");
  const view = showBoard(2, {}, language);
  expect(part(".jaw-board-title").textContent).toBe(text.whoseJaw);
  expect(part(".jaw-board-title svg")).not.toBeNull();
  expect(part(".jaw-prompt").textContent).toBe(text.jawPick);
  expect(part(".jaw-prompt svg")).not.toBeNull();
  expect([...document.querySelectorAll(".jaw-food-tag")].map((tag) => tag.textContent)).toEqual([text.jawFoods.meat, text.jawFoods.plants]);
  expect([...document.querySelectorAll(".jaw-food-tag img")].map((image) => image.getAttribute("src"))).toEqual(["food-0.webp", "food-1.webp"]);
  view.unmount();
  showBoard(2, { hint: "tyrannosaurus" }, language);
  expect(part(".jaw-prompt").textContent).toBe(text.jawFoods.meat);
  expect(part(".jaw-prompt img").getAttribute("src")).toBe("food-0.webp");
});

it("leaves out the board's best before there is one, and counts the best out of the round's stars", () => {
  at("light", "wide");
  const view = showBoard(2, { best: null });
  expect(document.querySelector(".jaw-board-best")).toBeNull();
  view.unmount();
  showBoard(2, { best: 2 });
  expect(within(document.body).getByLabelText(TEXTS.en.bestScore).textContent).toBe("2 / 3");
});

it.each([["🌿", "lucide-zap"], ["🥩", "lucide-circle-help"], ["📏", "lucide-ruler"]])("marks the %s cue with its icon", (symbol, icon) => {
  at("light", "wide");
  showBoard(2, { phase: "wrong", target: "triceratops", feedback: { words: "WORDS", symbol } });
  expect(part(".jaw-feedback p svg").getAttribute("class")).toContain(icon);
  expect(part(".jaw-feedback p").textContent).toContain("WORDS");
});

// The cue's place comes from where the browser lays the card out; the
// test lays out the card, the cue and the sand itself.
it("stands the cue on the wrong card's top-right corner and keeps it on the sand", () => {
  at("light", "wide");
  const margin = 40, cueWidth = 250, sandWidth = 1133, cardTop = 18;
  let card = { left: 0, width: 0 };
  const has = (element: HTMLElement, name: string) => element.classList.contains(name);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) { return has(this, "jaw-feedback") ? document.querySelector(".jaw-sand") : null; });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return has(this, "jaw-feedback") ? cueWidth : has(this, "jaw-dinosaur") ? card.width : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) { return has(this, "jaw-dinosaur") ? card.left : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) { return has(this, "jaw-dinosaur") ? cardTop : 0; });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return has(this, "jaw-sand") ? sandWidth : 0; });
  const cue = () => { const region = part(".jaw-feedback") as HTMLElement; return [region.style.getPropertyValue("--cue-x"), region.style.getPropertyValue("--cue-y")]; };
  const wrongAt = (target: string, left: number, width: number) => {
    card = { left, width };
    const view = showBoard(2);
    (part(".jaw-sand") as HTMLElement).style.setProperty("--jb-cue-margin", `${margin}px`);
    view.rerender(<WhoseJawBoardScreen {...boardProps(2, { phase: "wrong", target, feedback: { words: "OW!", symbol: "🌿" } })} />);
    const placed = cue();
    view.unmount();
    return placed;
  };
  try {
    expect(wrongAt("triceratops", 590, 360)).toEqual([`${590 + 360 + margin - cueWidth}px`, `${cardTop}px`]);
    expect(wrongAt("tyrannosaurus", 0, 100)).toEqual([`${margin}px`, `${cardTop}px`]);
    expect(wrongAt("triceratops", 1000, 133)).toEqual([`${sandWidth - margin - cueWidth}px`, `${cardTop}px`]);
  } finally {
    vi.restoreAllMocks();
  }
});
