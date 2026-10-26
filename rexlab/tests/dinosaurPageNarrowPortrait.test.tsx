import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type Viewport } from "../src/App.tsx";
import { dinosaurWordsWidth, keptLines, NARROW_PAGE, PORTRAIT_PAGE } from "../src/dinosaurPageLayout.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom,
  unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

const PHONES = [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932]
] as const;

// Each glyph's advance in ems in the position's face, Lexend at weight
// 600, rounded up.
const POSITION_EMS: Record<string, number> = {
  "0": 0.66, "1": 0.55, "2": 0.55, "3": 0.58, "4": 0.65,
  "5": 0.59, "6": 0.58, "7": 0.55, "8": 0.6, "9": 0.57,
  " ": 0.31, "/": 0.59
};

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
const narrowWords = (width: number) => dinosaurWordsWidth(width, 0, 0, 0, NARROW_PAGE.sidePadding);

// The page of `id`, opened from the catalogue in a window of `size`,
// tall-narrow under 600 wide and tall from 600.
async function openPage(size: WindowSize, { language = "en", id = "pachycephalosaurus", viewport = manualViewport("portrait") }: { language?: Language; id?: string; viewport?: ReturnType<typeof manualViewport> & Viewport } = {}) {
  openWindow(...size);
  viewport.resize(size[0] < 600 ? "tall-narrow" : "tall", true);
  const user = userEvent.setup({ delay: null });
  render(<App
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={{ home: ["tall", "tall-narrow"], catalogue: ["tall", "tall-narrow"], dinosaur: ["tall", "tall-narrow"] }}
    viewport={viewport}
    progress={emptyProgress()}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
  />);
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
  await user.click(part(`[data-id="${id}"]`));
  return { user, viewport };
}

// The lines the page keeps, as the custom properties it sets.
const pageLines = () => {
  const style = part(".dinosaur-page").style;
  return { description: Number(style.getPropertyValue("--description-lines")), note: Number(style.getPropertyValue("--note-lines")) };
};

// The rules under which a narrow page's sums hold: jsdom lays out no
// boxes, so each is checked here.
function narrowRules(size: WindowSize) {
  const at = (selector: string) => styleAt(part(selector), size);
  const page = at(".dinosaur-page");
  const stage = at(".dinosaur-stage");
  const art = at(".dinosaur-stage-art");
  expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right")]).toEqual([PORTRAIT_PAGE.topPadding, PORTRAIT_PAGE.bottomPadding, NARROW_PAGE.sidePadding, NARROW_PAGE.sidePadding]);
  expect([page.value("width") || "auto", page.value("overflow-y"), page.px("min-height")]).toEqual(["auto", "auto", size[1]]);
  expect([at(".dinosaur-body").value("flex-direction"), at(".dinosaur-body").rowGap()]).toEqual(["column", PORTRAIT_PAGE.stageGap]);
  // The stage: the picture across it over a row of ← and →, 16 apart.
  expect([stage.value("display"), stage.value("flex-grow"), stage.value("flex-shrink"), stage.value("flex-basis") || "auto", stage.px("min-height")]).toEqual(["grid", "0", "0", "auto", 0]);
  expect([stage.px("padding-left"), stage.px("padding-right"), stage.px("padding-top"), stage.px("padding-bottom")]).toEqual([20, 20, 20, 20]);
  expect([stage.value("grid-template-columns"), stage.value("grid-template-rows"), stage.columnGap(), stage.rowGap()]).toEqual(["72px minmax(0, 1fr) 72px", "auto 72px", 16, 16]);
  expect([art.value("grid-column"), art.value("grid-row"), art.value("width"), art.value("max-height"), art.value("aspect-ratio")]).toEqual(["1 / -1", "1", "100%", "none", "4 / 3"]);
  expect(at(".dinosaur-steps").value("display")).toBe("contents");
  for (const [selector, column] of [[".dinosaur-step:first-child", "1"], [".dinosaur-step:last-child", "3"]] as const) {
    expect([at(selector).value("grid-column"), at(selector).value("grid-row"), at(selector).px("width"), at(selector).px("height")]).toEqual([column, "2", 72, 72]);
  }
  // The facts one over the other, each as wide as the words.
  const fact = at(".dinosaur-fact");
  expect([at(".dinosaur-facts").value("display"), at(".dinosaur-facts").value("flex-direction"), at(".dinosaur-facts").rowGap()]).toEqual(["flex", "column", PORTRAIT_PAGE.factsGap]);
  expect([fact.value("flex-grow"), fact.value("flex-shrink"), fact.value("flex-basis") || "auto", fact.value("width") || "auto", fact.px("padding-left"), fact.px("padding-right")]).toEqual(["0", "0", "auto", "auto", 24, 24]);
  expect([at(".dinosaur-fact-value").value("font-size"), at(".dinosaur-page-name").value("font-size")]).toEqual(["min(44px, 26cqi)", "min(64px, 7.8cqi)"]);
  // The description in its narrow type, its kept lines tall.
  const description = at(".dinosaur-description");
  expect([description.px("font-size"), description.px("line-height"), description.value("height"), description.value("overflow")]).toEqual([NARROW_PAGE.descriptionSize, NARROW_PAGE.descriptionLineHeight, `calc(var(--description-lines, 8) * ${NARROW_PAGE.descriptionLineHeight}px)`, "hidden"]);
  expect([at(".source-note").px("font-size"), at(".source-note").value("height")]).toEqual([13, `calc(var(--note-lines, 3) * ${PORTRAIT_PAGE.noteLineHeight}px)`]);
  expect(pageLines()).toEqual(keptLines(narrowWords(size[0]), true));
}

describe("a dinosaur's page in a tall-narrow window", () => {
  it.each(PHONES)("stands upright at %i by %i with no picture asking to turn, the stage over the words on 20-pixel sides", async (width, height) => {
    await openPage([width, height]);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("PACHYCEPHALOSAURUS");
    expect([...part(".dinosaur-body").children]).toEqual([part(".dinosaur-stage"), part(".dinosaur-info")]);
    narrowRules([width, height]);
  });

  it.each(PHONES)("keeps the bar on one row at %i by %i: the button's book alone, its words for screen readers, and the position", async (width, height) => {
    await openPage([width, height]);
    const size: WindowSize = [width, height];
    const button = screen.getByRole("button", { name: TEXTS.en.catalogue });
    expect(button).toBe(part(".dinosaur-bar .home-button"));
    const words = styleAt(part(".narrow-hidden", button), size);
    expect([words.value("position"), words.px("width"), words.value("clip-path")]).toEqual(["absolute", 1, "inset(50%)"]);
    const buttonAt = styleAt(button, size);
    const icon = Number(part("svg", button).getAttribute("width"));
    const buttonWidth = buttonAt.px("padding-left") + icon + buttonAt.px("padding-right");
    expect([buttonWidth, buttonAt.px("height")]).toEqual([56, 56]);
    const bar = styleAt(part(".dinosaur-bar"), size);
    expect([bar.value("display"), bar.value("justify-content"), bar.value("flex-wrap") || "nowrap", bar.columnGap()]).toEqual(["flex", "space-between", "nowrap", 16]);
    const positionSize = styleAt(part(".dinosaur-position"), size).px("font-size");
    const widest = Math.max(...SHIPPED_CATALOGUE.map((_, index) => [...`${index + 1} / ${SHIPPED_CATALOGUE.length}`].reduce((sum, glyph) => sum + POSITION_EMS[glyph]!, 0) * positionSize));
    expect(buttonWidth + bar.columnGap() + widest).toBeLessThanOrEqual(narrowWords(width));
  });

  it.each(PHONES)("keeps every tap at least 44 pixels at %i by %i", async (width, height) => {
    await openPage([width, height]);
    const size: WindowSize = [width, height];
    expect(styleAt(screen.getByRole("button", { name: TEXTS.en.catalogue }), size).px("height")).toBeGreaterThanOrEqual(44);
    for (const name of [TEXTS.en.previousDinosaur, TEXTS.en.nextDinosaur]) {
      const at = styleAt(screen.getByRole("button", { name }), size);
      expect([at.px("width") >= 44, at.px("height") >= 44], name).toEqual([true, true]);
    }
  });

  it.each(["en", "ru"] as const)("keeps the same lines on all 52 pages in %s at 375 by 667", async (language) => {
    // fireEvent drives the arrows through every creature without
    // user-event's pointer machinery.
    await openPage([375, 667], { language, id: SHIPPED_CATALOGUE[0]!.id });
    expect(SHIPPED_CATALOGUE).toHaveLength(52);
    for (const creature of SHIPPED_CATALOGUE) {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(creature.name[language].toLocaleUpperCase(language));
      expect(pageLines()).toEqual({ description: 6, note: 6 });
      fireEvent.click(screen.getByRole("button", { name: TEXTS[language].nextDinosaur }));
    }
  });

  it("takes its narrow layout as a tall window narrows, with no picture asking to turn, and its tall one back as it widens", async () => {
    const viewport = manualViewport("portrait");
    await openPage([820, 1180], { id: "triceratops", viewport });
    const page = part(".dinosaur-page");
    expect(pageLines()).toEqual(keptLines(708));
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), part(".dinosaur-page")]).toEqual(["tall-narrow", false, page]);
    narrowRules([393, 852]);
    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect([document.documentElement.dataset.size, gateShown(), pageLines()]).toEqual(["tall", false, keptLines(708)]);
    expect(styleAt(part(".dinosaur-step:last-child"), [820, 1180]).value("grid-row")).toBe("1");
  });
});
