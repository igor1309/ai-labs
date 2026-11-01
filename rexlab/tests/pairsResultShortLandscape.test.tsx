import { act, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { shapeOf, type BoardLevel } from "../src/pairs/index.ts";
import { endWave, openPairsApp, pairsRecord, PICKED_HATCHLING, playBoard } from "./pairsApp.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { gameDoor, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// Windows on their side, full screen: the shortest a phone gives the
// layout, and iPhones from the smallest to the largest, each with the
// insets its notch and home indicator take.
const PHONES = [
  [568, 320, NO_SAFE_AREA],
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;

// Each count of dinosaurs a board finds: a climb's three, four and six,
// and the larger levels' nine and twelve. A climb's is played on the
// second board of its level over a best of 99, so it is a new best and a
// new level, both badges shown.
const BOARDS = {
  "climb 1": { climbLevel: 1 },
  "climb 2": { climbLevel: 2 },
  "climb 4": { climbLevel: 4 },
  explorer: { large: "explorer" },
  paleontologist: { large: "paleontologist" }
} as const satisfies Record<string, BoardLevel>;

type BoardName = keyof typeof BOARDS;

const EVERY = PHONES.flatMap(([width, height, insets]) => (Object.keys(BOARDS) as BoardName[]).map((name) => [name, width, height, insets] as const));

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

// Advances at weight 700, rounded up: Lexend's for English, the system
// face's for Russian with 10% room.
const EMS: Record<string, number> = {
  "PLAY AGAIN": 6.4, BACK: 2.81, HOME: 3.12, "ЕЩЁ РАЗ": 4.68, "НАЗАД": 3.86, "ДОМОЙ": 4.27,
  "WELL DONE!": 6.52, "МОЛОДЕЦ!": 6.12
};

// Counts of tries at weight 700, the wider of Lexend and the system face,
// rounded up.
const DIGIT_EMS: Record<string, number> = { "9": 0.66, "99": 1.31, "100": 1.92, "999": 1.96 };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The board of `name`, played to its result in a wide-short window of
// `size` with the insets `insets`.
async function openResult(size: WindowSize, insets: SafeArea, name: BoardName, language: Language = "en") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const level: BoardLevel = BOARDS[name];
  const climbing = "climbLevel" in level;
  const storage = memoryStorage(climbing ? { [PROGRESS_KEY]: pairsRecord({ stars: 1, level: level.climbLevel, boardsOnLevel: 1, best: { [level.climbLevel]: 99 }, found: [] }) } : {});
  const ageLevel = climbing ? PICKED_HATCHLING : { level: level.large, revision: `picked-${level.large}` };
  const app = openPairsApp({ storage, viewport, deviceLanguage: DEVICES[language], ageLevel });
  await app.user.click(gameDoor(TEXTS[language].pairs));
  await app.user.click(screen.getByRole("button", { name: TEXTS[language].play }));
  await playBoard(app.user, app.clock);
  endWave(app.clock);
  return { ...app, viewport, count: shapeOf(level).pairs };
}

// The pixels a size of px, cqw, min() and calc() comes to in a container
// `width` wide, as a browser resolves it. jsdom does not.
function pixelsIn(value: string, width: number) {
  const expression = value.replace(/([\d.]+)cqw/g, (_, share: string) => `${(Number(share) * width) / 100}`).replace(/px/g, "").replace(/min\(/g, "Math.min(").replace(/calc\(/g, "(");
  if (!/^[\d\s.+\-*/(),Mathmin]*$/.test(expression)) throw new Error(`${value} is not a size`);
  return Number(new Function(`return ${expression}`)());
}

// A line's height: its type times its line height, or the type alone at
// the result's line height of 1.
const lineOf = (style: ReturnType<typeof styleAt>) => style.px("font-size") * (Number.parseFloat(style.value("line-height")) || 1);

describe("find the pair's result in a wide-short window", () => {
  it.each(EVERY)("stands the %s board's dinosaurs beside the column, all within the height, at %i by %i", async (name, width, height, insets) => {
    const { count } = await openResult([width, height], insets, name);
    const size: WindowSize = [width, height];
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const page = at(".pairs-result");
    expect([page.px("padding-top"), page.px("padding-right"), page.px("padding-bottom"), page.px("padding-left")]).toEqual([12, 20 + insets.right, 12 + insets.bottom, 20 + insets.left]);
    expect([page.value("display"), page.value("grid-template-columns"), page.columnGap(), page.value("height"), page.value("overflow")]).toEqual(["grid", "minmax(0, 1fr) 300px", 16, `${height}px`, "hidden"]);
    const room = height - 24 - insets.bottom;

    // The column: the badges, both on their own rows at worst; the tries
    // beside the title over the stars; the best; and PLAY AGAIN over BACK
    // and HOME.
    const content = at(".pairs-result .result-content");
    expect([content.value("display"), content.value("grid-template-columns"), content.rowGap(), content.columnGap()]).toEqual(["grid", "auto minmax(0, 1fr)", 6, 12]);
    const tries = at(".pairs-result-tries");
    const title = at(".pairs-result .result-title");
    const stars = at(".pairs-result-stars");
    expect([tries.value("order"), tries.value("grid-column"), tries.value("grid-row"), title.value("order"), title.value("grid-column"), stars.value("order"), stars.value("grid-column")]).toEqual(["1", "1", "span 2", "2", "2", "3", "2"]);
    for (const selector of [".pairs-badges", ".pairs-result .best-score", ".pairs-result .result-actions"]) expect(at(selector).value("grid-column"), selector).toBe("1 / -1");
    const badges = [...document.querySelectorAll<HTMLElement>(".pairs-result .celebration, .pairs-level-up")].map((each) => styleAt(each, size).px("height") + content.rowGap());
    const triesRow = Math.max(lineOf(at(".pairs-result-tries-value")), at(".pairs-result-hand").px("height"), lineOf(title) + content.rowGap() + lineOf(stars));
    const actions = at(".pairs-result .result-actions");
    const button = at(".pairs-result .play-again-button");
    expect([actions.value("flex-wrap"), at(".pairs-result .play-again-button").value("flex-basis")]).toEqual(["wrap", "100%"]);
    const column = badges.reduce((sum, each) => sum + each, 0) + triesRow + at(".pairs-result .best-score").px("height") + 2 * button.px("height") + actions.rowGap() + 2 * content.rowGap();
    expect(column).toBeLessThanOrEqual(room);
    expect(button.px("height")).toBeGreaterThanOrEqual(44);

    // The dinosaurs: three across, two for four, in the width the column
    // leaves, their rows sharing the height, each row at most its card's
    // art at 4:3 over its name, and at most 162.
    const found = at(".pairs-found");
    const columns = count === 4 ? 2 : 3;
    const rows = Math.ceil(count / 3);
    expect(Number(part(".pairs-found").style.getPropertyValue("--found-rows"))).toBe(rows);
    expect([found.value("--found-columns"), found.value("height"), found.value("grid-template-rows"), found.rowGap(), found.columnGap(), at(".pairs-found-art").value("aspect-ratio"), page.value("container-type")]).toEqual([`${columns}`, "100%", "repeat(var(--found-rows), minmax(0, 1fr))", 8, 8, "auto", "size"]);
    const left = width - 40 - insets.left - insets.right - 300 - 16;
    const card = (left - (columns - 1) * 8) / columns;
    const nameStyle = at(".pairs-found-name");
    expect([nameStyle.value("font-size"), nameStyle.value("line-height"), nameStyle.px("padding-top"), nameStyle.px("padding-bottom")]).toEqual(["min(18px, 0.07692307692307693 * (100cqi - 16px))", "1.25", 8, 8]);
    const nameHeight = Math.min(18, (card - 16) / 13) * 1.25 + 16;
    const cardValue = found.value("--found-card").replaceAll("var(--found-columns)", `${columns}`);
    const most = pixelsIn(found.value("max-height").replaceAll("var(--found-rows)", `${rows}`).replaceAll("var(--found-card)", cardValue), width - insets.left - insets.right - 40);
    const row = (Math.min(room, most) - (rows - 1) * 8) / rows;
    expect(most).toBeCloseTo(rows * Math.min(162, card * 0.75 + nameHeight) + (rows - 1) * 8, 6);
    expect(row - nameHeight).toBeGreaterThan(30);
    expect((row - nameHeight) / card).toBeLessThanOrEqual(0.75 + 1e-9);
  });

  it.each(["en", "ru"] as const)("fits PLAY AGAIN across the column, BACK and HOME side by side and WELL DONE! beside the tries, in %s", async (language) => {
    const size: WindowSize = [667, 375];
    await openResult(size, PHONES[1][2], "climb 4", language);
    const at = (selector: string) => styleAt(part(selector), size);
    const button = at(".pairs-result .play-again-button");
    const symbol = styleAt(part(".pairs-result .result-actions svg"), size).px("width");
    const width = (label: string) => button.px("padding-left") + button.px("padding-right") + symbol + button.columnGap() + EMS[label]! * button.px("font-size");
    const text = TEXTS[language];
    expect(width(text.playAgain)).toBeLessThanOrEqual(300);
    expect(width(text.back) + width(text.home) + at(".pairs-result .result-actions").columnGap()).toBeLessThanOrEqual(300);
    // The tries, up to 999, beside the hand and WELL DONE!.
    const tries = at(".pairs-result-tries");
    const title = at(".pairs-result .result-title");
    for (const count of ["9", "99", "100", "999"]) {
      const triesWidth = DIGIT_EMS[count]! * at(".pairs-result-tries-value").px("font-size") + tries.columnGap() + at(".pairs-result-hand").px("width");
      expect(triesWidth + at(".pairs-result .result-content").columnGap() + EMS[text.wellDone]! * title.px("font-size"), count).toBeLessThanOrEqual(300);
    }
  });

  it("shows NEW as its sparkle alone, the word kept for screen readers", async () => {
    const size: WindowSize = [852, 393];
    await openResult(size, PHONES[2][2], "climb 1");
    const word = styleAt(part(".pairs-new-badge .narrow-hidden"), size);
    expect([word.value("position"), word.value("clip-path")]).toEqual(["absolute", "inset(50%)"]);
    expect(screen.getAllByText(TEXTS.en.newlyFound).length).toBeGreaterThan(0);
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", async () => {
    const { viewport } = await openResult([852, 393], PHONES[2][2], "explorer");
    act(() => viewport.resize("wide", false));
    openWindow(1180, 820);
    const size: WindowSize = [1180, 820];
    expect([document.documentElement.dataset.size, styleAt(part(".pairs-result"), size).value("grid-template-columns"), styleAt(part(".pairs-result .result-content"), size).value("display")]).toEqual(["wide", "minmax(0, 640fr) minmax(0, 680fr)", "flex"]);
  });
});
