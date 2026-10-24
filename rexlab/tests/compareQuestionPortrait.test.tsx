import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addTransitionType } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type PortraitLayouts, type Viewport } from "../src/App.tsx";
import { compareQuestionGeometry, compareQuestionType, compareQuestionWidth, NARROW_QUESTION, PORTRAIT_QUESTION, type QuestionSizes } from "../src/compareQuestionLayout.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NEXT_QUESTION } from "../src/QuestionScreen.tsx";
import { correctOf } from "../src/quiz/round.ts";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  gameDoor, lightDevice, loadedPictures, manualViewport, pageAtRest,
  seededRandom, shownQuestion, unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, addTransitionType: vi.fn(react.addTransitionType) };
});

// compare-dinosaurs-portrait.feature. The turn between the layouts is
// compareQuestionTurn.test.tsx's; here each window is opened in its layout.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"] };

// "A question stands upright": each window, its cards' height, their
// pictures' size and whether the screen scrolls.
const WINDOWS = [
  [600, 800, 281, 200, 150, true],
  [744, 1133, 370, 320, 240, false],
  [768, 1024, 316, 247, 186, false],
  [820, 1180, 394, 351, 264, false],
  [1024, 1366, 487, 475, 356, false]
] as const;

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const cards = () => within(screen.getByRole("group", { name: TEXTS.en.creatures })).getAllByRole("button");
const progress = () => screen.getByLabelText(TEXTS.en.progress).textContent;

async function openQuestion(size: WindowSize, {
  language = "en", insets = NO_SAFE_AREA, viewport = manualViewport("portrait", insets), layouts = PORTRAIT_LAYOUTS
}: { language?: Language; insets?: SafeArea; viewport?: Viewport; layouts?: PortraitLayouts } = {}) {
  openWindow(...size);
  const user = userEvent.setup();
  render(<App
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={layouts}
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

// The type the screen gives the stylesheet, as its custom properties.
const shownType = () => {
  const { style } = part(".question");
  return { prompt: style.getPropertyValue("--prompt-size"), name: style.getPropertyValue("--name-size") };
};
const px = (size: number) => `${size}px`;

const { textLineHeight, footerVerticalPadding } = PORTRAIT_QUESTION;

// The pixels a rule of the form calc(var(--name-size) * ratio + N px)
// gives, with the names' type the screen sets, as a browser resolves it.
// jsdom does not.
function footerHeight(value: string) {
  const [, ratio = "", pixels = ""] = /^calc\(var\(--name-size\) ?\* ?([\d.]+) \+ ([\d.]+)px\)$/.exec(value) ?? [];
  if (!ratio) throw new Error(`${value} is not sized by the names' type`);
  return Number.parseFloat(shownType().name) * Number(ratio) + Number(pixels);
}

// The pixels a rule of the form calc(N px + var(--card-footer)) gives.
function aboveFooter(value: string) {
  const [, pixels = ""] = /^calc\(([\d.]+)px \+ var\(--card-footer\)\)$/.exec(value) ?? [];
  if (!pixels) throw new Error(`${value} is not sized by the card's footer`);
  return Number(pixels);
}

// The CSS contracts under which the geometry's sums hold. jsdom does not
// lay out boxes, so every structural assumption is checked here.
function uprightRules(size: WindowSize, width: number, sizes: QuestionSizes = PORTRAIT_QUESTION) {
  const { artPadding, minimumPicture } = sizes;
  const at = (selector: string) => styleAt(part(selector), size);
  const question = at(".question");
  expect([...part(".question").children].map((element) => element.className)).toEqual(["stratum stratum-1", "question-bar", "prompt", "dinosaur-cards", "next-row"]);
  expect([...part(".dinosaur-cards").children].map((element) => element.className)).toEqual(["card dinosaur-card", "versus", "card dinosaur-card"]);
  expect([question.value("display"), question.value("flex-direction"), question.rowGap()]).toEqual(["flex", "column", sizes.gap]);
  expect([question.px("padding-top"), question.px("padding-bottom"), question.px("padding-left"), question.px("padding-right")]).toEqual([sizes.topPadding, sizes.bottomPadding, sizes.sidePadding, sizes.sidePadding]);
  expect([question.px("min-height"), question.value("height"), question.value("overflow-y"), question.value("overscroll-behavior")]).toEqual([size[1], "auto", "auto", "none"]);
  expect(at(".home-button").px("height")).toBe(sizes.barHeight);
  // One type for the window, as the geometry gives it.
  expect(shownType()).toEqual({ prompt: px(compareQuestionType(width, sizes).prompt), name: px(compareQuestionType(width, sizes).name) });
  const prompt = at(".prompt");
  expect([prompt.value("font-size"), prompt.value("line-height"), prompt.value("white-space"), prompt.columnGap()]).toEqual([shownType().prompt, String(textLineHeight), "nowrap", sizes.promptGap]);
  expect([at(".prompt-symbol").px("width"), at(".prompt-symbol").px("height"), at(".prompt-symbol").value("flex-shrink")]).toEqual([sizes.promptSymbol, sizes.promptSymbol, "0"]);
  expect(sizes.promptMaximum * textLineHeight).toBeLessThanOrEqual(sizes.promptSymbol);
  const group = at(".dinosaur-cards");
  expect([group.value("flex-direction"), group.value("align-items"), group.rowGap(), group.value("flex-grow"), group.value("flex-shrink"), group.value("position")]).toEqual(["column", "stretch", sizes.cardsGap, "1", "0", "relative"]);
  // A card's footer: its name's line and the padding above and below.
  const footer = footerHeight(question.value("--card-footer"));
  expect(footer).toBeCloseTo(2 * footerVerticalPadding + compareQuestionType(width, sizes).name * textLineHeight, 6);
  for (const card of cards()) {
    const style = styleAt(card, size);
    expect([style.value("flex-grow"), style.value("flex-shrink"), style.value("flex-basis"), style.value("position")]).toEqual(["1", "0", "0px", "relative"]);
    expect(aboveFooter(style.value("min-height"))).toBe(minimumPicture + 2 * artPadding);
    const own = styleAt(part(".dinosaur-footer", card), size);
    expect([footerHeight(own.value("height")), own.value("flex-grow"), own.value("flex-shrink"), own.value("box-sizing")]).toEqual([footer, "0", "0", "border-box"]);
    expect([own.px("padding-top"), own.px("padding-bottom"), own.px("padding-left"), own.px("padding-right")]).toEqual([footerVerticalPadding, footerVerticalPadding, sizes.footerSidePadding, sizes.footerSidePadding]);
    const name = styleAt(part(".dinosaur-name", card), size);
    expect([name.value("font-size"), name.value("line-height"), name.value("white-space")]).toEqual([shownType().name, String(textLineHeight), "nowrap"]);
    const art = styleAt(part(".dinosaur-art", card), size);
    expect([art.value("flex-grow"), art.value("flex-basis"), art.px("min-height"), art.px("padding-top"), art.px("padding-left")]).toEqual(["1", "0px", 0, artPadding, artPadding]);
    const picture = styleAt(part(".dinosaur-picture", card), size);
    expect([picture.px("width"), picture.px("height"), picture.value("max-width"), picture.value("max-height"), picture.value("object-fit")]).toEqual([
      sizes.pictureMaximum.width, sizes.pictureMaximum.height, "100%", "100%", "contain"
    ]);
    expect(sizes.pictureMaximum.width / sizes.pictureMaximum.height).toBe(sizes.pictureRatio);
  }
  // "VS" stands centred over the seam, out of the cards' flow.
  const versus = at(".versus");
  expect([versus.value("position"), versus.value("inset"), versus.value("margin"), versus.px("width"), versus.px("height"), versus.value("z-index")]).toEqual(["absolute", "0px", "auto", 64, 64, "1"]);
  expect([at(".next-row").px("min-height"), at(".next-row").value("justify-content")]).toEqual([sizes.rowHeight, "flex-end"]);
}

describe("the compare quiz's question upright", () => {
  it.each(WINDOWS)("stands upright at %i by %i, its cards %i tall, their pictures %i by %i, scrolling %s", async (width, height, card, pictureWidth, pictureHeight, scrolls) => {
    await openQuestion([width, height]);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    expect(part(".question-bar .home-button").textContent).toBe(TEXTS.en.home);
    expect(progress()).toBe("1/10");
    const geometry = compareQuestionGeometry(width, height, 0, 0);
    expect(Math.abs(geometry.cardHeight - card)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.picture.width - pictureWidth)).toBeLessThanOrEqual(4);
    expect(Math.abs(geometry.picture.height - pictureHeight)).toBeLessThanOrEqual(4);
    expect(geometry.scrolls).toBe(scrolls);
    uprightRules([width, height], compareQuestionWidth(width, 0, 0));
  });

  it.each([
    ["en", 0], ["ru", 0], ["en", 16], ["ru", 16]
  ] as const)("gives every prompt and name in %s one type at 600 by 1000 with a %i-pixel scrollbar, the names at least 32", async (language, scrollbar) => {
    const viewport = { ...manualViewport("portrait"), scrollbarWidth: () => scrollbar };
    await openQuestion([600, 1000], { language, viewport });
    const type = compareQuestionType(compareQuestionWidth(600, 0, 0, scrollbar));
    expect(shownType()).toEqual({ prompt: px(type.prompt), name: px(type.name) });
    expect(type.name).toBeGreaterThanOrEqual(32);
    expect(gateShown()).toBe(false);
  });

  it("takes the side insets from the viewport for the type", async () => {
    await openQuestion([744, 1133], { insets: { top: 0, right: 13, bottom: 0, left: 19 } });
    const type = compareQuestionType(600);
    expect(shownType()).toEqual({ prompt: px(type.prompt), name: px(type.name) });
  });

  it("marks the answer at the top left of its picture and shows both values at the bottom right of theirs, no card growing or moving", async () => {
    const { user } = await openQuestion([820, 1180]);
    const size: WindowSize = [820, 1180];
    const laidOut = () => cards().map((card) => {
      const style = styleAt(card, size);
      const footer = styleAt(part(".dinosaur-footer", card), size);
      return [style.value("flex"), style.value("min-height"), footer.value("height"), styleAt(part(".dinosaur-art", card), size).value("flex")];
    });
    const before = laidOut();
    const question = shownQuestion();
    const right = correctOf(question);
    const tapped = within(screen.getByRole("group", { name: TEXTS.en.creatures })).getByRole("button", { name: right.name.en });
    await user.click(tapped);
    expect(laidOut()).toEqual(before);
    const mark = within(tapped).getByRole("img", { name: TEXTS.en.marks.correct });
    expect(mark.parentElement).toBe(part(".dinosaur-art", tapped));
    expect([styleAt(mark, size).value("position"), styleAt(mark, size).px("top"), styleAt(mark, size).px("left")]).toEqual(["absolute", 24, 24]);
    for (const card of cards()) {
      const chip = styleAt(part(".dinosaur-value-chip", card), size);
      const [, above = ""] = /^calc\(var\(--card-footer\) \+ ([\d.]+)px\)$/.exec(chip.value("bottom")) ?? [];
      expect([chip.value("position"), chip.px("right"), Number(above), chip.value("white-space")]).toEqual(["absolute", 24, 24, "nowrap"]);
    }
    const next = screen.getByRole("button", { name: TEXTS.en.next });
    expect(next.parentElement).toBe(part(".next-row"));
    expect(part(".next-row").previousElementSibling).toBe(part(".dinosaur-cards"));
    uprightRules(size, 708);
  });

  it("slides the next pair in, each card in its own place, one above the other", async () => {
    const { user } = await openQuestion([820, 1180]);
    await user.click(cards()[0]!);
    const old = cards();
    vi.mocked(addTransitionType).mockClear();
    await user.click(screen.getByRole("button", { name: TEXTS.en.next }));
    expect(vi.mocked(addTransitionType).mock.calls).toEqual([[NEXT_QUESTION]]);
    expect(progress()).toBe("2/10");
    const now = cards();
    expect(now.some((card) => old.includes(card))).toBe(false);
    expect(now.map((card) => card.getAttribute("data-turn-part"))).toEqual(["question-left", "question-right"]);
    expect([gateShown(), document.documentElement.dataset.size]).toEqual([false, "tall"]);
    uprightRules([820, 1180], 708);
  });

  it("still shows the picture asking to turn over the result in a tall window", async () => {
    const { user } = await openQuestion([820, 1180]);
    for (let number = 1; number <= 10; number++) {
      const right = correctOf(shownQuestion());
      await user.click(within(screen.getByRole("group", { name: TEXTS.en.creatures })).getByRole("button", { name: right.name.en }));
      expect(gateShown()).toBe(false);
      await user.click(screen.getByRole("button", { name: number === 10 ? TEXTS.en.seeResult : TEXTS.en.next }));
    }
    expect(screen.queryByRole("group", { name: TEXTS.en.creatures })).toBeNull();
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
  });

  it("fades the picture asking to turn over the question as a tall window narrows", async () => {
    const viewport = manualViewport("portrait");
    await openQuestion([820, 1180], { viewport });
    const question = part(".question");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect([part(".question"), progress()]).toEqual([question, "1/10"]);
  });

  it("keeps the landscape question as it was", async () => {
    const { user } = await openQuestion([1180, 820], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    const style = (selector: string) => getComputedStyle(part(selector));
    expect([style(".question").height, style(".question").overflow, style(".dinosaur-cards").flexDirection || "row"]).toEqual(["820px", "hidden", "row"]);
    expect([style(".prompt").fontSize, style(".dinosaur-name").fontSize, style(".versus").position || "static"]).toEqual(["44px", "34px", "static"]);
    await user.click(cards()[0]!);
    expect(style(".dinosaur-value-chip").position || "static").toBe("static");
  });

  it("puts the bar below the top inset and the row for NEXT above the home indicator, the background to the edges", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openQuestion([744, 1133], { insets });
    const question = getComputedStyle(part(".question"));
    expect([question.paddingTop, question.paddingRight, question.paddingBottom, question.paddingLeft]).toEqual(["64px", "69px", "68px", "75px"]);
    expect([question.boxSizing, question.minHeight, question.height]).toEqual(["border-box", "1133px", "auto"]);
    expect(part(".next-row")).toBe(part(".question").lastElementChild);
    expect([getComputedStyle(document.body).margin, getComputedStyle(document.body).backgroundColor]).toEqual(["0px", "rgb(242, 239, 232)"]);
    expect(gateShown()).toBe(false);
  });
});

// The question in a tall-narrow window: an iPhone upright.
const NARROW_LAYOUTS: PortraitLayouts = { ...PORTRAIT_LAYOUTS, home: ["tall", "tall-narrow"], "compare-question": ["tall", "tall-narrow"] };
const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

// Each phone's window, its cards' height, their pictures' height and
// whether the screen scrolls.
const PHONES = [
  [320, 568, 206, 110, true],
  [375, 667, 211, 110, true],
  [393, 759, 222, 119, false],
  [393, 852, 268, 165, false],
  [430, 932, 308, 202, false]
] as const;

describe("the compare quiz's question in a tall-narrow window", () => {
  it.each(PHONES)("stands upright at %i by %i, its cards %i tall, their pictures %i tall, scrolling %s", async (width, height, card, pictureHeight, scrolls) => {
    await openQuestion([width, height], { viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
    const geometry = compareQuestionGeometry(width, height, 0, 0, 0, NARROW_QUESTION);
    expect(Math.abs(geometry.cardHeight - card)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.picture.height - pictureHeight)).toBeLessThanOrEqual(1);
    expect(geometry.scrolls).toBe(scrolls);
    uprightRules([width, height], compareQuestionWidth(width, 0, 0, 0, NARROW_QUESTION), NARROW_QUESTION);
  });

  it("shows HOME as its symbol, a 56-pixel square still named for screen readers, so the steps keep their room", async () => {
    await openQuestion([393, 852], { viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    const home = part(".question-bar .home-button");
    expect(screen.getByRole("button", { name: TEXTS.en.home })).toBe(home);
    expect(styleAt(part(".narrow-hidden", home), [393, 852]).value("position")).toBe("absolute");
    const style = styleAt(home, [393, 852]);
    expect([style.px("width"), style.px("height"), style.px("padding-left"), style.px("padding-right")]).toEqual([56, 56, 16, 16]);
    expect(styleAt(part(".question-bar"), [393, 852]).columnGap()).toBe(16);
  });

  it.each([["en"], ["ru"]] as const)("gives every prompt and name in %s one type at 320 by 568, the names at least 18", async (language) => {
    await openQuestion([320, 568], { language, viewport: narrowViewport(), layouts: NARROW_LAYOUTS });
    const type = compareQuestionType(compareQuestionWidth(320, 0, 0, 0, NARROW_QUESTION), NARROW_QUESTION);
    expect(shownType()).toEqual({ prompt: px(type.prompt), name: px(type.name) });
    expect(type.name).toBeGreaterThanOrEqual(18);
  });
});
