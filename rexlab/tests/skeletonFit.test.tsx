import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { finishLoading, fitAll, keptSkeletons, layOutPuzzle, openSkeletonsApp, revealNow, skeletonOf } from "./skeletonsApp.tsx";
import { SHIPPED_SKELETONS } from "./support.ts";
import { WINDOW_SIZES, openWindow } from "./windowSizes.ts";

import { columnGapOf, neededBy, sizeOf, widthOf, wordsOf } from "./skeletonTextFit.ts";

const px = (value: string) => Number.parseFloat(value) || 0;

// What does not fit: `element` needs `needed` pixels where it has `room`.
const overflow = (element: Element, needed: number, room: number) =>
  needed <= room ? [] : [`${wordsOf(element) || element.className}: ${Number.isNaN(needed) ? "no width in ems" : `${needed.toFixed(1)}px in ${room.toFixed(1)}px`}`];

// The width of the screen's content, inside its sides, in the test's
// window.
const contentWidth = () => window.innerWidth - widthOf(document.querySelector(".skeleton-screen") ?? document.body);

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

describe.each(WINDOW_SIZES.flatMap(([width, height]) => LANGUAGES.map((language) => [language, width, height] as const)))("the skeleton game's buttons in %s in a %i by %i window", (language, width, height) => {
  const text = TEXTS[language];
  const name = (id: string) => skeletonOf(id).name[language].toLocaleUpperCase(language);

  it("keep their words on one line in the bar of the choice of dinosaurs, beside the best", () => {
    openWindow(width, height);
    openSkeletonsApp({ deviceLanguage: deviceOf(language), storage: keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] }) });

    expect(screen.getByLabelText(text.bestScore)).toBeDefined();
    expect([wrapping(), barOverflow()]).toEqual([[], []]);
  });

  it("keep their words on one line in the bar of a puzzle, beside the bones in place", async () => {
    openWindow(width, height);
    const { user, pictures } = openSkeletonsApp({ deviceLanguage: deviceOf(language) });
    await user.click(screen.getByRole("button", { name: name("stegosaurus") }));
    act(() => finishLoading(pictures));

    expect(screen.getByLabelText(text.fitted).textContent).toBe("0/4");
    expect([wrapping(), barOverflow()]).toEqual([[], []]);
  });

  it.each(SHIPPED_SKELETONS.map(({ id }) => id))("fit the name of the %s in the bar of its puzzle, beside BACK, HOME and MUSEUM, at a size a child reads", async (id) => {
    openWindow(width, height);
    const { user, pictures } = openSkeletonsApp({ deviceLanguage: deviceOf(language) });
    await user.click(screen.getByRole("button", { name: name(id) }));
    act(() => finishLoading(pictures));

    const fit = titleFit();
    expect(fit.shown).toBe(name(id));
    expect(fit.needed).toBeLessThanOrEqual(fit.room);
    expect(fit.size).toBeGreaterThanOrEqual(24);
  });

  it("keep their words on one line on the reveal, the panel at its least width", async () => {
    openWindow(width, height);
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
    openWindow(width, height);
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
