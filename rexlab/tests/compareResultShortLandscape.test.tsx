import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import type { ProgressStore } from "../src/quizGame.tsx";
import { correctOf } from "../src/quiz/round.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring, gameDoor,
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

// A best of 10 already, so a round won whole is no new best: no
// celebration, the best still shown.
const BEST_OF_TEN: ProgressStore = {
  load: () => ({ progress: { best: { hatchling: 10, explorer: 10, paleontologist: 10 }, roundsPlayed: 3 }, levelChoice: undefined }),
  save: () => {}
};

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// Where a two-column grid's automatic placement puts each of the rewards'
// column's parts, in their order and from their declared columns and
// spans, as a browser does: jsdom does not. Rows and columns from 1.
function placed(size: WindowSize) {
  const items = [...part(".result-content").children].map((element, index) => {
    const style = styleAt(element, size);
    const column = style.value("grid-column") || "auto";
    const span = /^span (\d+)$/.exec(style.value("grid-row"))?.[1];
    return { name: element.className, order: Number(style.value("order") || 0), index, column, rows: span ? Number(span) : 1 };
  }).sort((a, b) => a.order - b.order || a.index - b.index);
  const taken = new Set<string>();
  const free = (row: number, column: number, rows: number) => Array.from({ length: rows }, (_, step) => `${row + step} ${column}`).every((cell) => !taken.has(cell));
  let row = 1;
  let column = 1;
  return items.map(({ name, column: declared, rows }) => {
    const whole = declared === "1 / -1";
    const fixed = whole ? 1 : declared === "auto" ? undefined : Number(declared);
    for (;;) {
      if (fixed !== undefined && column > fixed) { row += 1; column = 1; }
      const at = fixed ?? column;
      if (at > 2) { row += 1; column = 1; continue; }
      if (free(row, at, rows) && (!whole || free(row, 2, rows))) {
        for (let step = 0; step < rows; step += 1) for (const each of whole ? [1, 2] : [at]) taken.add(`${row + step} ${each}`);
        column = whole ? 3 : at + 1;
        return [name, row, whole ? "1 / -1" : at] as const;
      }
      column = at + 1;
      if (column > 2 || fixed !== undefined) { row += 1; column = 1; }
    }
  });
}

// The compare quiz's result, every question answered right, in a
// wide-short window of `size` with the safe-area insets `insets`.
async function openResult(size: WindowSize, insets: SafeArea, language: Language = "en", progress: ProgressStore = EARLIER_BEST) {
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
    progress={progress}
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
    // The celebration on top, the score beside WELL DONE! over the stars.
    expect(placed(size)).toEqual([["celebration", 1, "1 / -1"], ["result-score", 2, 1], ["result-title", 2, 2], ["result-stars", 3, 2], ["best-score", 4, "1 / -1"], ["level-switch", 5, "1 / -1"], ["result-actions", 6, "1 / -1"]]);
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

  it.each(["en", "ru"] as const)("stands WELL DONE! over the stars with no celebration either, in %s", async (language) => {
    await openResult([667, 375], PHONES[0][2], language, BEST_OF_TEN);
    expect(document.querySelector(".celebration")).toBeNull();
    expect(placed([667, 375])).toEqual([["result-score", 1, 1], ["result-title", 1, 2], ["result-stars", 2, 2], ["best-score", 3, "1 / -1"], ["level-switch", 4, "1 / -1"], ["result-actions", 5, "1 / -1"]]);
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

// The rendered sizes the fit sums take, read from the result as the
// stylesheet sets it on a phone on its side.
function shownSizes(size: WindowSize) {
  const at = (selector: string) => styleAt(part(selector), size);
  const button = at(".play-again-button");
  const celebration = at(".celebration");
  return {
    score: at(".result-score-value").px("font-size"), scoreGap: at(".result-score").columnGap(), total: at(".result-score-total").px("font-size"),
    beside: at(".result-content").columnGap(), star: at(".result-stars").px("font-size"), starGap: at(".result-stars").columnGap(), title: at(".result-title").px("font-size"),
    button: { sides: button.px("padding-left") + button.px("padding-right"), gap: button.columnGap(), symbol: styleAt(part("svg", part(".play-again-button")), size).px("width"), type: button.px("font-size") },
    homeType: at(".result-actions .home-button").px("font-size"), between: at(".result-actions").columnGap(),
    celebration: { sides: celebration.px("padding-left") + celebration.px("padding-right"), gap: celebration.columnGap(), symbol: styleAt(part("svg", part(".celebration")), size).px("width"), type: celebration.px("font-size") }
  };
}

describe("the result's words fit on a phone on its side", () => {
  it.each((["en", "ru"] as const).flatMap((language) => [[language, "new-best", () => EARLIER_BEST], [language, "first-best", emptyProgress]] as const))("fits every part in its row at every width, in %s with a %s celebration", async (language, kind, progress) => {
    const size: WindowSize = [667, 375];
    // No round played before, a round won is the first best.
    await openResult(size, PHONES[0][2], language, progress());
    const text = TEXTS[language];
    expect(part(".celebration-text").textContent).toBe(text.celebrations[kind].text);
    const shown = shownSizes(size);
    const score = ems("10") * shown.score + shown.scoreGap + ems("/10") * shown.total;
    const button = (word: string, type: number) => shown.button.sides + shown.button.symbol + shown.button.gap + ems(word) * type;
    for (const column of new Set(COLUMNS)) {
      expect(score + shown.beside + 10 * ems("★") * shown.star + 9 * shown.starGap, `stars in ${column}`).toBeLessThanOrEqual(column);
      expect(score + shown.beside + ems(text.wellDone) * shown.title, `title in ${column}`).toBeLessThanOrEqual(column);
      expect(Math.max(button(text.playAgain, shown.button.type), button(text.home, shown.homeType)) * 2 + shown.between, `actions in ${column}`).toBeLessThanOrEqual(column);
      expect(shown.celebration.sides + shown.celebration.symbol + shown.celebration.gap + ems(text.celebrations[kind].text) * shown.celebration.type, `celebration in ${column}`).toBeLessThanOrEqual(column);
    }
  });
});
