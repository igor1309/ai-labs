import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { STAR_LANDS } from "../src/digGame.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { digUp, finishBoard, openDigApp, placeBoard } from "./digApp.tsx";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { homeTile, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// DIG's reveal on an iPhone on its side, full screen: the smallest, two
// common ones and the largest, each with its insets.
const PHONES = [
  [568, 320, { top: 0, right: 0, bottom: 0, left: 0 }],
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;
const LANGUAGES = ["en", "ru"] as const;
const EVERY = PHONES.flatMap((phone) => LANGUAGES.map((language) => [...phone, language] as const));

const LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "dig-board": ["tall", "tall-narrow"] };

// Every glyph of the reveal's capitals is at most 0.75 of its type wide,
// and a digit or slash at most 0.68, in Lexend and the system face.
const LETTER = 0.75;
const DIGIT = 0.68;
// The longest of the 52 names, PACHYCEPHALOSAURUS, in ems with its spacing.
const LONGEST_NAME = 12.7;
// The column's width at most.
const COLUMN = 340;

// jsdom has no animation engine: the offer's reward and dismissal take
// no time.
beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: 0 }) } }] });
});
afterEach(() => { Reflect.deleteProperty(Element.prototype, "getAnimations"); });

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// A dinosaur dug up at Hatchling, its star landed, in a wide-short window
// of `size` with the insets `insets`.
function reveal(size: WindowSize, insets: SafeArea, language: Language = "en") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => {
    sheet.remove();
    delete document.documentElement.dataset.size;
  });
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [] } } }) });
  const app = openDigApp({ viewport, portraitLayouts: LAYOUTS, ageLevel: { level: "hatchling", revision: "parent" }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  placeBoard(800);
  digUp();
  finishBoard(app.timers);
  act(() => app.timers.fire(STAR_LANDS.motion));
  return app;
}

describe("DIG's reveal in a wide-short window", () => {
  it.each(EVERY)("stands the dinosaur beside its column under a 48-pixel bar, all within the height, at %i by %i in %s", (width, height, insets, language) => {
    const size: WindowSize = [width, height];
    reveal(size, insets, language);
    const at = (selector: string) => styleAt(part(selector), size);
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const page = at(".dig-reveal-screen");
    expect([page.px("padding-top"), page.px("padding-right"), page.px("padding-bottom"), page.px("padding-left"), page.rowGap()]).toEqual([8, 20 + insets.right, 12 + insets.bottom, 20 + insets.left, 8]);
    const bar = at(".dig-reveal-screen .dig-bar");
    expect([bar.value("height"), bar.columnGap(), at(".dig-reveal-screen .dig-mark").value("width"), at(".dig-reveal-screen .dig-field-guide-button").value("height")]).toEqual(["48px", 8, "40px", "48px"]);

    // The dinosaur, as large as the room left of the column, 20 from it.
    const body = at(".dig-reveal");
    expect([body.value("flex-direction"), body.columnGap()]).toEqual(["row", 20]);
    const art = at(".dig-reveal-art");
    expect([art.value("flex-grow"), art.value("min-width"), art.value("height")]).toEqual(["1", "0px", "100%"]);
    const reward = at(".dig-reward");
    expect([reward.value("flex-basis"), reward.value("flex-direction"), reward.rowGap()]).toEqual([`${COLUMN}px`, "column", 6]);
    const inner = width - 40 - insets.left - insets.right;
    const column = Math.min(COLUMN, inner - 20);
    expect(inner - 20 - column).toBeGreaterThanOrEqual(160);

    // The column, its tallest: the name, DUG UP, a celebration, the
    // switch and the buttons, under the bar.
    const nameStyle = at(".dig-reveal-name");
    expect(nameStyle.value("font-size")).toBe("min(28px, 0.07874015748031496 * (100cqi - 18px))");
    const name = Math.min(28, (column - 18) / LONGEST_NAME);
    expect(name).toBeGreaterThanOrEqual(20);
    const card = at(".dig-card");
    const celebration = at(".dig-reveal-screen .celebration");
    const switchStyle = at(".dig-reveal-screen .level-switch");
    const level = styleAt(part(".dig-reveal-screen .level-switch-level"), size);
    const button = styleAt(screen.getByRole("button", { name: TEXTS[language].digAgain }), size);
    const ways = at(".dig-reveal-ways");
    expect([card.value("height"), level.value("height"), switchStyle.px("padding-top"), button.value("height"), ways.rowGap()]).toEqual(["44px", "44px", 4, "48px", 6]);
    const actions = at(".dig-reveal-screen .result-actions");
    const switchHeight = switchStyle.px("border-top-width") + switchStyle.px("padding-top") + level.px("height") + switchStyle.px("padding-bottom") + switchStyle.px("border-bottom-width");
    const tallest = name * Number(nameStyle.value("line-height")) + card.px("height") + celebration.px("height") + 3 * reward.rowGap() + switchHeight + ways.rowGap() + actions.px("padding-top") + button.px("height");
    expect(tallest).toBeLessThanOrEqual(height - 8 - 12 - insets.bottom - 48 - 8);
  });

  it.each(LANGUAGES)("fits DUG UP's fullest card, DIG AGAIN beside HOME and a celebration across the column, in %s", (language) => {
    const size: WindowSize = [568, 320];
    reveal(size, PHONES[0][2], language);
    const at = (selector: string) => styleAt(part(selector), size);
    const text = TEXTS[language];
    const letters = (words: string) => [...words].reduce((sum, glyph) => sum + (/[\d/]/.test(glyph) ? DIGIT : LETTER), 0);

    // The card at its fullest: its star, its words, 52/52, NEW!, the
    // trophy and the 🦴 badge. A first find has no trophy or badge, so
    // theirs are put in the card to read the sizes it gives them.
    const cardElement = part(".dig-card");
    cardElement.insertAdjacentHTML("beforeend", '<span class="dig-card-trophy"><svg></svg></span><span class="level-badge">🦴</span>');
    const card = at(".dig-card");
    const words = at(".dig-card-words");
    const count = at(".dig-card-count");
    const trophy = styleAt(part(".dig-card-trophy svg", cardElement), size);
    const badge = at(".dig-card .level-badge");
    expect([card.px("font-size"), card.columnGap(), card.px("padding-left"), card.px("padding-right"), at(".dig-card-star").value("width"), count.px("font-size"), trophy.value("width"), badge.value("width")]).toEqual([14, 6, 4, 12, "32px", 16, "20px", "28px"]);
    const spaced = (glyphs: string, style: ReturnType<typeof styleAt>) => letters(glyphs) * style.px("font-size") + [...glyphs].length * (style.px("letter-spacing") || 0);
    const parts = [at(".dig-card-star").px("width"), spaced(text.dugUp, words), spaced("52/52", count), letters(text.dugUpNew) * card.px("font-size"), trophy.px("width"), badge.px("width")];
    const fullest = card.px("padding-left") + parts.reduce((sum, each) => sum + each, 0) + (parts.length - 1) * card.columnGap() + card.px("padding-right");
    expect(fullest).toBeLessThanOrEqual(COLUMN);

    // DIG AGAIN beside HOME, each its words and symbol, 12 apart.
    const actions = at(".dig-reveal-screen .result-actions");
    expect([actions.value("flex-direction"), actions.columnGap()]).toEqual(["row", 12]);
    const widthOf = (label: string) => {
      const button = styleAt(screen.getByRole("button", { name: label }), size);
      expect([button.value("flex-grow"), button.value("flex-basis"), button.value("white-space"), button.px("padding-left"), button.columnGap()]).toEqual(["1", "auto", "nowrap", 16, 8]);
      return 2 * button.px("padding-left") + 22 + button.columnGap() + letters(label) * button.px("font-size");
    };
    expect(widthOf(text.digAgain) + actions.columnGap() + widthOf(text.home)).toBeLessThanOrEqual(COLUMN);

    // The longer celebration, its symbol 20.
    const longest = Math.max(...Object.values(text.celebrations).map((each) => letters(each.text)));
    expect(16 + 20 + 8 + longest * 16 + 12).toBeLessThanOrEqual(COLUMN);
  });

  it.each(LANGUAGES)("shows the level switch's pictures alone, its names kept for screen readers, in %s", (language) => {
    const size: WindowSize = [667, 375];
    reveal(size, PHONES[1][2], language);
    const text = TEXTS[language];
    for (const level of ["hatchling", "explorer", "paleontologist"] as const) {
      const button = screen.getByRole("button", { name: text.ageLevels[level].name });
      const name = styleAt(part(".level-switch-name", button), size);
      expect([name.value("position"), name.value("clip-path")]).toEqual(["absolute", "inset(50%)"]);
    }
    expect(screen.getByRole("group", { name: text.ageLevelSwitch })).toBeTruthy();
  });

  it("keeps the celebration, when there is one, 36 tall with 16-pixel words", () => {
    const size: WindowSize = [667, 375];
    reveal(size, PHONES[1][2]);
    const chip = document.querySelector<HTMLElement>(".dig-reveal-screen .celebration");
    expect(chip).toBeTruthy();
    const style = styleAt(chip!, size);
    expect([style.value("height"), style.px("font-size"), style.columnGap()]).toEqual(["36px", 16, 8]);
  });
});
