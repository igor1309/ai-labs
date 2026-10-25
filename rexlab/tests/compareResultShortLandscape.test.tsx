import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import type { ProgressStore } from "../src/quiz/progress.ts";
import { correctOf } from "../src/quiz/round.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptySkeletons, emptySorting, fakeBodyPicture, featuring, gameDoor,
  lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom,
  shownQuestion, unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// iPhones on their side, full screen: the smallest, a common one and the
// largest, each with the insets its notch and home indicator take.
const PHONES = [
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;

const BOTH = (["en", "ru"] as const).flatMap((language) => PHONES.map(([width, height, insets]) => [language, width, height, insets] as const));

// An earlier best of 7 at every level, so a round won whole is a new best
// over it, celebrated: the result with every part it can show.
const EARLIER_BEST: ProgressStore = {
  load: () => ({ progress: { best: { hatchling: 7, explorer: 7, paleontologist: 7 }, roundsPlayed: 3 }, levelChoice: undefined }),
  save: () => {}
};

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The compare quiz's result, every question answered right, in a
// wide-short window of `size` with the safe-area insets `insets`.
async function openResult(size: WindowSize, insets: SafeArea, language: Language = "en") {
  openWindow(...size);
  const sheet = document.createElement("style");
  sheet.textContent = appStylesheet(insets);
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const user = userEvent.setup({ delay: null });
  render(<App
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={{}}
    viewport={viewport}
    progress={EARLIER_BEST}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
  />);
  const text = TEXTS[language];
  await user.click(gameDoor(text.quizCard));
  while (screen.queryByRole("group", { name: text.creatures })) {
    const right = correctOf(shownQuestion(language));
    await user.click(within(screen.getByRole("group", { name: text.creatures })).getByRole("button", { name: right.name[language] }));
    await user.click(screen.queryByRole("button", { name: text.next }) ?? screen.getByRole("button", { name: text.seeResult }));
  }
  return { user, viewport };
}

describe("the compare quiz's result in a wide-short window", () => {
  it.each(PHONES)("keeps the dinosaur beside the rewards at %i by %i, 12 under the top and 20 past each side's inset", async (width, height, insets) => {
    await openResult([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    expect([...part(".result").children].map((element) => element.className)).toEqual(["festivity", "stratum result-stratum", "picture result-hero", "result-content"]);
    const result = at(".result");
    expect([result.px("padding-top"), result.px("padding-right"), result.px("padding-bottom"), result.px("padding-left")]).toEqual([12, 20 + insets.right, 12 + insets.bottom, 20 + insets.left]);
    expect([result.value("height"), result.value("overflow"), result.value("display"), result.columnGap()]).toEqual([`${height}px`, "hidden", "grid", 20]);
    expect([result.value("grid-template-columns"), result.value("grid-template-rows")]).toEqual(["minmax(0, 1fr) minmax(0, 400px)", "minmax(0, 1fr)"]);
    // The dinosaur, fitted whole, as tall as the row.
    const hero = at(".result-hero");
    expect([hero.value("height"), hero.px("min-height"), hero.value("max-height"), hero.value("width"), hero.value("object-fit")]).toEqual(["100%", 0, "none", "100%", "contain"]);
  });

  it.each(PHONES)("stands the rewards, the switch and the actions in the height at %i by %i, a celebration and the best shown", async (width, height, insets) => {
    await openResult([width, height], insets);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    const content = at(".result-content");
    expect([content.value("display"), content.value("grid-template-columns"), content.rowGap(), content.columnGap()]).toEqual(["grid", "auto minmax(0, 1fr)", 8, 16]);
    expect([...part(".result-content").children].map((element) => element.className)).toEqual(["celebration", "result-score", "result-stars", "result-title", "best-score", "level-switch", "result-actions"]);
    const column = (selector: string) => at(selector).value("grid-column") || "auto";
    expect([column(".celebration"), column(".best-score"), column(".level-switch"), column(".result-actions"), at(".result-score").value("grid-row")]).toEqual(["1 / -1", "1 / -1", "1 / -1", "1 / -1", "span 2"]);
    // The score spans the two rows the stars and "WELL DONE!" stand in.
    const score = at(".result-score-value").px("font-size");
    const pair = at(".result-title").px("font-size") * Number(at(".result-title").value("line-height")) + 8 + at(".result-stars").px("font-size") * Number(at(".result-stars").value("line-height") || 1);
    const switchHeight = 2 * at(".level-switch").px("padding-top") + at(".level-switch-level").px("height");
    const rows = [at(".celebration").px("height"), Math.max(score, pair), at(".best-score").px("height"), switchHeight, at(".play-again-button").px("height")];
    expect(rows.reduce((sum, row) => sum + row, 0) + 8 * (rows.length - 1)).toBeLessThanOrEqual(height - 24 - insets.bottom);
    expect([at(".play-again-button").px("height"), at(".result-actions .home-button").px("height"), at(".level-switch-level").px("height")].every((tap) => tap >= 44)).toBe(true);
  });

  it.each(BOTH)("shows each level's picture alone, its name kept for screen readers, and PLAY AGAIN beside HOME, in %s at %i by %i", async (language, width, height, insets) => {
    await openResult([width, height], insets, language);
    const size: WindowSize = [width, height];
    const levels = within(screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch })).getAllByRole("button");
    expect(levels.map((level) => level.textContent)).toEqual(Object.values(TEXTS[language].ageLevels).map(({ name }) => expect.stringContaining(name)));
    for (const name of document.querySelectorAll(".level-switch-name")) expect([styleAt(name, size).value("position"), styleAt(name, size).value("clip-path")]).toEqual(["absolute", "inset(50%)"]);
    const mark = styleAt(part(".level-switch-mark"), size);
    expect([mark.px("top"), mark.px("left"), mark.value("width")]).toEqual([4, 4, "calc(0.3333333333333333 * (100% - 16px))"]);
    const actions = styleAt(part(".result-actions"), size);
    expect([actions.value("flex-direction") || "row", actions.columnGap()]).toEqual(["row", 12]);
    for (const button of [part(".play-again-button"), part(".result-actions .home-button")]) {
      const style = styleAt(button, size);
      expect([style.value("flex").replace("0px", "0"), style.px("padding-left"), style.columnGap(), style.value("font-size"), style.value("white-space")]).toEqual(["1 1 0", 16, 8, "18px", "nowrap"]);
      expect(styleAt(part("svg", button), size).value("width")).toBe("22px");
    }
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", async () => {
    const { viewport } = await openResult([852, 393], PHONES[1][2]);
    act(() => viewport.resize("wide", false));
    openWindow(1180, 820);
    const result = styleAt(part(".result"), [1180, 820]);
    expect([document.documentElement.dataset.size, result.px("padding-top"), result.value("grid-template-columns")]).toEqual(["wide", 32, "minmax(0, 1fr) minmax(0, 648px)"]);
    expect(styleAt(part(".result-content"), [1180, 820]).value("display")).toBe("flex");
  });
});

// Advances at weight 700, rounded up: Lexend's for English, the system
// face's for Russian with 10% room. ★ is the wider of the two faces'.
const EMS: Record<string, number> = {
  "★": 1.05, "10": 1.24, "/10": 1.81,
  "WELL DONE!": 6.53, "МОЛОДЕЦ!": 6.12,
  "PLAY AGAIN": 6.4, "ЕЩЁ РАЗ": 5.15, HOME: 3.12, ДОМОЙ: 4.27,
  "FIRST BEST!": 6.43, "NEW BEST!": 5.4, "ПЕРВЫЙ РЕКОРД!": 10.25, "НОВЫЙ РЕКОРД!": 9.64
};
const ems = (text: string) => {
  const found = EMS[text];
  if (found === undefined) throw new Error(`No width for ${text}`);
  return found;
};

// The rewards' column at every width of a phone on its side: at most 400,
// what the window leaves past 20 a side, the insets and the 20 gap.
const COLUMNS = [
  ...Array.from({ length: 932 - 568 + 1 }, (_, step) => Math.min(400, 568 + step - 40 - 20)),
  ...Array.from({ length: 932 - 812 + 1 }, (_, step) => Math.min(400, 812 + step - 40 - 2 * 59 - 20))
];

describe("the result's words fit on a phone on its side", () => {
  it("measures the words the result shows", () => {
    for (const language of ["en", "ru"] as const) {
      const text = TEXTS[language];
      for (const word of [text.wellDone, text.playAgain, text.home, ...Object.values(text.celebrations).map(({ text: shown }) => shown)]) ems(word);
    }
  });

  it.each([...new Set(COLUMNS)])("fits ten stars beside 10/10, and WELL DONE! in either language, in a %i-pixel column", (column) => {
    const score = ems("10") * 56 + 8 + ems("/10") * 24;
    expect(score + 16 + 10 * ems("★") * 20 + 9 * 4).toBeLessThanOrEqual(column);
    for (const title of ["WELL DONE!", "МОЛОДЕЦ!"]) expect(score + 16 + ems(title) * 24, title).toBeLessThanOrEqual(column);
  });

  it.each([...new Set(COLUMNS)])("fits PLAY AGAIN beside HOME and every celebration in either language in a %i-pixel column", (column) => {
    // A button: 16 a side, its 22-pixel symbol and the 8 gap before its word.
    const button = (word: string) => 16 + 22 + 8 + ems(word) * 18 + 16;
    for (const [again, home] of [["PLAY AGAIN", "HOME"], ["ЕЩЁ РАЗ", "ДОМОЙ"]] as const) expect(Math.max(button(again), button(home)) * 2 + 12, again).toBeLessThanOrEqual(column);
    // A celebration: 12 before its 22-pixel symbol, the 8 gap and 16 after.
    for (const word of ["FIRST BEST!", "NEW BEST!", "ПЕРВЫЙ РЕКОРД!", "НОВЫЙ РЕКОРД!"]) expect(12 + 22 + 8 + ems(word) * 16 + 16, word).toBeLessThanOrEqual(column);
  });
});
