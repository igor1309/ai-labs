import { emptyLabyrinth } from "./support.ts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  gameDoor, lightDevice, loadedPictures, manualViewport, pageAtRest,
  seededRandom, shownQuestion, unreadVersion, unsetAgeLevel, wrongOf
} from "./support.ts";
import { correctOf } from "../src/quiz/round.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// iPhones on their side, full screen: the smallest, a common one and the
// largest, each with the insets its notch and home indicator take.
const PHONES = [
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;

const BOTH = (["en", "ru"] as const).flatMap((language) => PHONES.map(([width, height, insets]) => [language, width, height, insets] as const));

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The compare quiz's first question in a wide-short window of `size` with
// the safe-area insets `insets`, in `language`.
async function openQuestion(size: WindowSize, insets: SafeArea, language: Language = "en") {
  openWindow(...size);
  const sheet = document.createElement("style");
  sheet.textContent = appStylesheet(insets);
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const user = userEvent.setup({ delay: null });
  render(<App {...emptyLabyrinth()}
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={{}}
    viewport={viewport}
    progress={emptyProgress()}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
  />);
  await user.click(gameDoor(TEXTS[language].quizCard));
  return { user, viewport };
}

// The pixels a size of px, cqi, min() and calc() comes to in a container
// `width` wide, as a browser resolves it. jsdom does not.
function pixelsIn(value: string, width: number) {
  const expression = value.replace(/([\d.]+)cqi/g, (_, share: string) => `${(Number(share) * width) / 100}`).replace(/px/g, "").replace(/min\(/g, "Math.min(").replace(/calc\(/g, "(");
  if (!/^[\d\s.+\-*/(),Mathmin]*$/.test(expression)) throw new Error(`${value} is not a size`);
  return Number(new Function(`return ${expression}`)());
}

const cards = (language: Language = "en") => within(screen.getByRole("group", { name: TEXTS[language].creatures })).getAllByRole("button");

describe("a compare question in a wide-short window", () => {
  it.each(PHONES)("keeps the cards side by side at %i by %i, under one short bar, NEXT's row beside the prompt, 20 past each side's inset", async (width, height, insets) => {
    await openQuestion([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    expect([...part(".question").children].map((element) => element.className)).toEqual(["stratum stratum-1", "question-bar", "prompt", "dinosaur-cards", "next-row"]);
    const question = at(".question");
    expect([question.px("padding-top"), question.px("padding-right"), question.px("padding-bottom"), question.px("padding-left")]).toEqual([8, 20 + insets.right, 12 + insets.bottom, 20 + insets.left]);
    expect([question.value("height"), question.value("overflow"), question.value("display"), question.rowGap(), question.columnGap()]).toEqual([`${height}px`, "hidden", "grid", 8, 12]);
    expect([question.value("grid-template-columns"), question.value("grid-template-rows"), question.value("container-type")]).toEqual(["minmax(0, 1fr) auto", "auto auto minmax(0, 1fr)", "inline-size"]);
    const place = (selector: string) => [at(selector).value("grid-row") || "auto", at(selector).value("grid-column") || "auto"];
    expect([place(".question-bar"), place(".prompt"), place(".next-row"), place(".dinosaur-cards")]).toEqual([["auto", "1 / -1"], ["2", "1"], ["2", "2"], ["3", "1 / -1"]]);
    const row = at(".dinosaur-cards");
    expect([row.value("flex-direction") || "row", row.value("align-items"), row.columnGap(), row.px("min-height")]).toEqual(["row", "stretch", 8, 0]);
    expect([...part(".dinosaur-cards").children].map((element) => element.className)).toEqual(["card dinosaur-card", "versus", "card dinosaur-card"]);
    for (const card of cards()) {
      const style = styleAt(card, size);
      expect([style.value("flex").replace("0px", "0"), style.px("min-width"), style.value("align-self"), style.value("position"), style.value("container-type")]).toEqual(["1 1 0", 0, "stretch", "relative", "inline-size"]);
    }
    const versus = at(".versus");
    expect([versus.value("width"), versus.value("height"), versus.value("align-self"), versus.value("flex-shrink")]).toEqual(["40px", "40px", "center", "0"]);
  });

  it.each(PHONES)("gives each card the height the bar, the prompt's row and the gaps leave at %i by %i, its picture at least 110 tall", async (width, height, insets) => {
    await openQuestion([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    // The bar's tallest part is HOME, the prompt's row's NEXT's row, so
    // the cards have what 8 + 48 + 8 + 48 + 8 and the bottom leave.
    expect([at(".question .home-button").value("height"), at(".steps").value("height")]).toEqual(["48px", "10px"]);
    expect([at(".next-row").px("min-height"), at(".prompt-symbol").value("height"), at(".prompt").value("line-height")]).toEqual([48, "40px", "1.25"]);
    const card = height - 8 - 48 - 8 - 48 - 8 - 12 - insets.bottom;
    const art = at(".dinosaur-art");
    const footer = at(".dinosaur-footer");
    expect([art.value("flex").replace("0px", "0"), art.px("min-height"), art.px("padding-top"), art.px("padding-bottom")]).toEqual(["1 1 0", 0, 12, 12]);
    expect([footer.value("flex"), footer.value("height"), footer.value("box-sizing"), footer.value("flex-wrap")]).toEqual(["0 0 auto", "41px", "border-box", "nowrap"]);
    expect(card - 41 - 2 * 12).toBeGreaterThanOrEqual(110);
    // The picture keeps its 4:3 in what its area leaves, never past it.
    const picture = at(".dinosaur-picture");
    expect([picture.value("max-width"), picture.value("max-height"), picture.value("object-fit")]).toEqual(["100%", "100%", "contain"]);
  });

  it.each(BOTH)("sets the words in their small type in %s at %i by %i: the prompt to fit beside NEXT, a name on one line to fit its card", async (language, width, height, insets) => {
    await openQuestion([width, height], insets, language);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    // The question's row less its sides, and each card half of it short
    // of "VS" and its two gaps: the containers the type is sized in.
    const row = width - 40 - insets.left - insets.right;
    const card = (row - 40 - 2 * 8) / 2;
    const prompt = at(".prompt");
    expect([pixelsIn(prompt.value("font-size"), row), prompt.value("white-space"), prompt.columnGap(), at(".prompt-symbol").value("width")]).toEqual([Math.min(28, (row - 274) / 9.97), "nowrap", 12, "40px"]);
    expect(pixelsIn(prompt.value("font-size"), 528)).toBeCloseTo((528 - 274) / 9.97, 6);
    const name = at(".dinosaur-name");
    expect([pixelsIn(name.value("font-size"), card), name.value("white-space"), at(".dinosaur-footer").px("padding-left"), at(".dinosaur-footer").px("padding-right")]).toEqual([Math.min(20, (card - 24) / 12.7), "nowrap", 12, 12]);
    expect(pixelsIn(name.value("font-size"), 236)).toBeCloseTo(212 / 12.7, 6);
    expect([at(".progress").value("font-size"), at(".question .home-button").value("font-size")]).toEqual(["17px", "17px"]);
  });

  it.each(BOTH)("puts NEXT beside the prompt, 48 tall, and each value at the bottom right of its picture's area once answered, in %s at %i by %i", async (language, width, height, insets) => {
    const { user } = await openQuestion([width, height], insets, language);
    const size: WindowSize = [width, height];
    await user.click(cards(language)[0]!);
    const next = screen.getByRole("button", { name: TEXTS[language].next });
    expect(next.closest(".next-row")).toBe(part(".next-row"));
    const style = styleAt(next, size);
    expect([style.value("height"), style.value("font-size"), style.px("padding-left"), style.px("padding-right"), style.columnGap()]).toEqual(["48px", "20px", 24, 20, 10]);
    // The symbol the fit tests leave NEXT 22 pixels for.
    expect(styleAt(part("svg", next), size).value("width")).toBe("22px");
    for (const chip of document.querySelectorAll<HTMLElement>(".dinosaur-value-chip")) {
      const at = styleAt(chip, size);
      // 12 from the card's right, and 12 above the footer's 41.
      expect([at.value("position"), at.px("right"), at.px("bottom"), at.value("height"), at.value("font-size")]).toEqual(["absolute", 12, 41 + 12, "36px", "17px"]);
      // The sides, gap and 22-pixel symbol the fit tests measure a chip by.
      expect([at.px("padding-left"), at.px("padding-right"), at.columnGap(), part("svg", chip).getAttribute("width")]).toEqual([12, 12, 6, "22"]);
    }
    const mark = styleAt(part(".mark"), size);
    expect([mark.px("top"), mark.px("left"), mark.value("height")]).toEqual([12, 12, "36px"]);
  });

  // Every property that places or sizes a card or a part of one.
  const GEOMETRY = ["position", "top", "right", "bottom", "left", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "width", "height", "min-width", "min-height", "max-width", "max-height", "flex", "align-self", "align-items", "justify-content", "transform", "font-size", "line-height"];
  const layout = (size: WindowSize) => [".dinosaur-cards", ".dinosaur-card", ".dinosaur-art", ".dinosaur-picture", ".dinosaur-footer", ".dinosaur-name", ".versus"].map((selector) =>
    [...document.querySelectorAll(selector)].map((element) => GEOMETRY.map((property) => styleAt(element, size).value(property))));

  it.each((["en", "ru"] as const).flatMap((language) => (["right", "wrong"] as const).map((answer) => [language, answer] as const)))("moves no card when it is answered in %s, %s", async (language, answer) => {
    const size: WindowSize = [667, 375];
    const { user } = await openQuestion(size, PHONES[0][2], language);
    const before = layout(size);
    const question = shownQuestion(language);
    const chosen = answer === "right" ? correctOf(question) : wrongOf(question);
    await user.click(screen.getByRole("button", { name: chosen.name[language] }));
    expect(document.querySelectorAll(".dinosaur-card[data-answered]")).toHaveLength(2);
    expect(layout(size)).toEqual(before);
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", async () => {
    const { viewport } = await openQuestion([852, 393], PHONES[1][2]);
    act(() => viewport.resize("wide", false));
    openWindow(1180, 820);
    const question = styleAt(part(".question"), [1180, 820]);
    expect([document.documentElement.dataset.size, question.value("display"), question.px("padding-top"), question.rowGap()]).toEqual(["wide", "flex", 40, 32]);
    expect(styleAt(part(".prompt"), [1180, 820]).value("font-size")).toBe("44px");
  });
});
