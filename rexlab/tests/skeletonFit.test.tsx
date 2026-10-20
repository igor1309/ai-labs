import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { finishLoading, fitAll, keptSkeletons, layOutPuzzle, openSkeletonsApp, revealNow, skeletonOf } from "./skeletonsApp.tsx";
import { SHIPPED_SKELETONS } from "./support.ts";

// The narrowest iPad's width in landscape, in CSS pixels.
const NARROWEST = 1024;

// jsdom lays nothing out, so the width of the words on each skeleton
// button and chip is given here in ems of its bold face, rounded up:
// Lexend's for the Latin words and the numbers, and the iPad's own face,
// at its smallest optical size, for the Cyrillic words, which Lexend has
// no letters for. Words missing here fail the test that reads them.
const WORD_EMS: Record<string, number> = {
  HOME: 3.2,
  ДОМОЙ: 4.1,
  BACK: 2.9,
  НАЗАД: 3.7,
  MUSEUM: 4.6,
  МУЗЕЙ: 3.8,
  "BUILD ANOTHER": 8.9,
  "СОБРАТЬ ДРУГОЙ": 9.7,
  BUILD: 3.5,
  СОБРАТЬ: 5.1,
  REBUILD: 4.8,
  "СОБРАТЬ ЗАНОВО": 9.8,
  CONTINUE: 5.8,
  ДОСТРОИТЬ: 6.7,
  "0/3": 1.9,
  "1/3": 1.8,
  "2/3": 1.8,
  "3/3": 1.8,
  "0/4": 2.0,
  "1/4": 1.9,
  "2/4": 1.9,
  "3/4": 1.9,
  "4/4": 2.0,
  "0/5": 2.0,
  "1/5": 1.9,
  "2/5": 2.0,
  "3/5": 2.0,
  "4/5": 2.0,
  "5/5": 2.0
};

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded.
const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

const sidesOf = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);

const widthOf = (element: Element) => sidesOf(getComputedStyle(element));

// The words an element shows itself, beside its symbols.
const wordsOf = (element: Element) =>
  [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join("")
    .trim();

// An element's font size in pixels, in a container `container` pixels
// wide: as app.css gives it, or, for one worked out from the container's
// width, at most a cap, otherwise the container's width less a length
// over a width in ems, which jsdom keeps as a multiplication by its
// inverse.
function sizeOf(element: Element, container?: number) {
  const { fontSize } = getComputedStyle(element);
  if (/^[\d.]+px$/.test(fontSize)) return px(fontSize);
  const shrinking = /^min\(([\d.]+)px, ([\d.]+) \* \(100cqi - ([\d.]+)px\)\)$/.exec(fontSize);
  if (!shrinking || container === undefined) throw new Error(`A size of ${fontSize} cannot be worked out here`);
  return Math.min(Number(shrinking[1]), Number(shrinking[2]) * (container - Number(shrinking[3])));
}

// The width a button or chip needs for its words on one line at `size`,
// beside its symbols: its sides, its symbols as wide as they are drawn,
// the gaps between them and its words, and the words, their letters
// spaced; NaN for words with no width in ems here.
function neededBy(element: Element, size: number) {
  const style = getComputedStyle(element);
  const words = wordsOf(element);
  const symbols = [...element.children].filter((child) => child.tagName.toLowerCase() === "svg");
  const parts = symbols.length + (words ? 1 : 0);
  return (
    widthOf(element) +
    symbols.reduce((sum, symbol) => sum + px(symbol.getAttribute("width") ?? ""), 0) +
    columnGapOf(style) * Math.max(parts - 1, 0) +
    (words ? (WORD_EMS[words] ?? Number.NaN) * size + px(style.letterSpacing) * [...words].length : 0)
  );
}

// What does not fit: `element` needs `needed` pixels where it has `room`.
const overflow = (element: Element, needed: number, room: number) =>
  needed <= room ? [] : [`${wordsOf(element) || element.className}: ${Number.isNaN(needed) ? "no width in ems" : `${needed.toFixed(1)}px in ${room.toFixed(1)}px`}`];

// The width of the screen's content, inside its sides.
const contentWidth = () => NARROWEST - widthOf(document.querySelector(".skeleton-screen") ?? document.body);

// The bar's buttons and chips, each at its full width, with the gaps
// between every part of the bar, fit in the bar, the title shrinking to
// nothing at the least.
function barOverflow() {
  const { bar, needed } = barNeeds();
  return overflow(bar, needed, contentWidth());
}

function barNeeds() {
  const bar = document.querySelector(".skeleton-bar");
  if (!bar) throw new Error("No skeleton bar");
  const title = bar.querySelector(".skeleton-title");
  if (!title) throw new Error("No title in the bar");
  expect([getComputedStyle(title).flexBasis, getComputedStyle(title).minWidth]).toEqual(["0px", "0px"]);
  const parts = [...bar.children].filter((part) => part !== title);
  expect(parts.filter((part) => getComputedStyle(part).flexShrink !== "0").map(wordsOf)).toEqual([]);
  const needed = parts.reduce((sum, part) => sum + neededBy(part, sizeOf(part)), 0) + columnGapOf(getComputedStyle(bar)) * parts.length;
  return { bar, title, needed };
}

// The title's words in the room the bar's buttons and chips leave it,
// beside its bone: the size app.css gives them, at most a cap, otherwise
// that room less the bone and its gap, over the words' letters at 0.75 of
// an em each, and the width those words then need.
function titleFit() {
  const { title, needed } = barNeeds();
  const words = title.querySelector<HTMLElement>(".skeleton-title-words");
  if (!words) throw new Error("No words in the title");
  const shown = words.textContent ?? "";
  const size = /^min\((\d+)px, \(100cqi - (\d+)px\) \/ \(var\(--letters\) \* ([\d.]+)\)\)$/.exec(getComputedStyle(words).fontSize);
  expect([getComputedStyle(title).getPropertyValue("container-type"), size?.[2], words.style.getPropertyValue("--letters")]).toEqual([
    "inline-size",
    String(px(getComputedStyle(title.querySelector(".skeleton-mark") ?? title).width) + columnGapOf(getComputedStyle(title))),
    String(shown.length)
  ]);
  const room = contentWidth() - needed - px(size?.[2] ?? "");
  const at = Math.min(Number(size?.[1]), room / (shown.length * Number(size?.[3])));
  return { shown, size: at, needed: (NAME_EMS[shown] ?? Number.NaN) * at, room };
}

// Each button on the reveal's panel is as wide as the panel inside its
// sides; the panel takes its share of the reveal beside the board, or its
// least width. A board kept narrower by the screen's height leaves the
// panel more, never less.
function actionsOverflow() {
  const reveal = document.querySelector(".skeleton-reveal");
  const panel = document.querySelector(".skeleton-reward");
  const board = reveal?.querySelector(".skeleton-board");
  if (!reveal || !panel || !board) throw new Error("No reveal with its board and panel");
  const panelStyle = getComputedStyle(panel);
  const boardStyle = getComputedStyle(board);
  expect([panelStyle.flexBasis, boardStyle.flexBasis]).toEqual(["0px", "0px"]);
  const grows = [panelStyle.flexGrow, boardStyle.flexGrow].map(Number);
  const share = ((contentWidth() - columnGapOf(getComputedStyle(reveal))) * (grows[0] ?? 0)) / ((grows[0] ?? 0) + (grows[1] ?? 0));
  const room = Math.max(share, px(panelStyle.minWidth)) - widthOf(panel);
  return [...panel.querySelectorAll(".skeleton-actions button")].flatMap((button) => overflow(button, neededBy(button, sizeOf(button)), room));
}

// Each stand takes a third of the hall inside its sides and the gaps of
// a row of three, however many stands there are, and its button, on its
// own under the exhibit, the stand's width, its words sized by the
// stand's width. Returns the size of the words too.
function standsOverflow() {
  const hall = document.querySelector(".skeleton-hall");
  if (!hall) throw new Error("No museum hall");
  const stands = [...hall.children];
  const hallStyle = getComputedStyle(hall);
  const gap = columnGapOf(hallStyle);
  expect([hallStyle.flexWrap, hallStyle.justifyContent]).toEqual(["wrap", "center"]);
  expect(stands.map((stand) => [getComputedStyle(stand).flexBasis, getComputedStyle(stand).flexGrow, getComputedStyle(stand).minWidth])).toEqual(
    stands.map(() => [`calc(${1 / 3}*(100% - ${2 * gap}px))`, "0", "0px"])
  );
  const stand = (contentWidth() - widthOf(hall) - gap * 2) / 3;
  return stands.map((each) => {
    const button = each.querySelector(":scope > button");
    if (!button) throw new Error("A stand with no button of its own");
    expect(getComputedStyle(button).alignSelf).toBe("stretch");
    const size = sizeOf(button, stand);
    return { size, overflow: overflow(button, neededBy(button, size), stand) };
  });
}

// Every button on the screen, the choice's cards aside, whose names have
// a test of their own, keeps its words on one line.
const wrapping = () =>
  screen
    .getAllByRole("button")
    .filter((button) => button.closest(".skeleton-screen") && !button.classList.contains("skeleton-choice"))
    .filter((button) => getComputedStyle(button).whiteSpace !== "nowrap")
    .map(wordsOf);

const deviceOf = (language: Language) => (language === "ru" ? "ru-RU" : "en-GB");

describe.each(LANGUAGES)("the skeleton game's buttons in %s on the narrowest iPad", (language) => {
  const text = TEXTS[language];
  const name = (id: string) => skeletonOf(id).name[language].toLocaleUpperCase(language);

  it("keep their words on one line in the bar of the choice of dinosaurs, beside the best", () => {
    openSkeletonsApp({ deviceLanguage: deviceOf(language), storage: keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }) });

    expect(screen.getByLabelText(text.bestScore)).toBeDefined();
    expect([wrapping(), barOverflow()]).toEqual([[], []]);
  });

  it("keep their words on one line in the bar of a puzzle, beside the bones in place", async () => {
    const { user, pictures } = openSkeletonsApp({ deviceLanguage: deviceOf(language) });
    await user.click(screen.getByRole("button", { name: name("stegosaurus") }));
    act(() => finishLoading(pictures));

    expect(screen.getByLabelText(text.fitted).textContent).toBe("0/4");
    expect([wrapping(), barOverflow()]).toEqual([[], []]);
  });

  it.each(SHIPPED_SKELETONS.map(({ id }) => id))("fit the name of the %s in the bar of its puzzle, beside BACK, HOME and MUSEUM, at a size a child reads", async (id) => {
    const { user, pictures } = openSkeletonsApp({ deviceLanguage: deviceOf(language) });
    await user.click(screen.getByRole("button", { name: name(id) }));
    act(() => finishLoading(pictures));

    const fit = titleFit();
    expect(fit.shown).toBe(name(id));
    expect(fit.needed).toBeLessThanOrEqual(fit.room);
    expect(fit.size).toBeGreaterThanOrEqual(24);
  });

  it("keep their words on one line on the reveal, the panel at its least width", async () => {
    const { user, pictures } = openSkeletonsApp({ deviceLanguage: deviceOf(language) });
    await user.click(screen.getByRole("button", { name: name("triceratops") }));
    act(() => finishLoading(pictures));
    layOutPuzzle();
    fitAll(skeletonOf("triceratops"));
    revealNow(pictures, "triceratops");

    expect(screen.getByRole("button", { name: text.buildAnother })).toBeDefined();
    expect([wrapping(), barOverflow(), actionsOverflow()]).toEqual([[], [], []]);
  });

  it("keep their words on one line in the museum, on a built stand, one awaiting its skeleton and an empty one, as large as the bar's", async () => {
    const { user } = openSkeletonsApp({
      deviceLanguage: deviceOf(language),
      storage: keptSkeletons({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: ["triceratops"] })
    });
    await user.click(screen.getByRole("button", { name: text.museum }));

    expect([text.rebuild, text.keepBuilding, text.build].map((words) => screen.getAllByRole("button", { name: words })[0]?.textContent)).toEqual([
      text.rebuild,
      text.keepBuilding,
      text.build
    ]);
    const stands = standsOverflow();
    expect([wrapping(), barOverflow(), stands.flatMap((stand) => stand.overflow)]).toEqual([[], [], []]);
    const bar = sizeOf(screen.getByRole("button", { name: text.home }));
    expect(stands.filter((stand) => stand.size < bar)).toEqual([]);
  });
});
