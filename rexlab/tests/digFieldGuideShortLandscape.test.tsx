import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { board, openDigApp } from "./digApp.tsx";
import { EMS } from "./digFieldGuideWords.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { homeTile, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// DIG's FIELD GUIDE on an iPhone on its side, full screen: the smallest,
// two common ones and the largest, each with its insets.
const PHONES = [
  [568, 320, { top: 0, right: 0, bottom: 0, left: 0 }],
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;
const LANGUAGES = ["en", "ru"] as const;
const EVERY = PHONES.flatMap(([width, height, insets]) => LANGUAGES.map((language) => [width, height, language, insets] as const));

const LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "dig-board": ["tall", "tall-narrow"] };

// The cards in a row: five of English's short names, three of Russian's
// long ones. A name is never smaller than 16, its picture never under 48,
// a space is at most 0.3 em and a digit or × 0.68.
const ROW = { en: 5, ru: 3 };
const LEAST_NAME = 16;
const LEAST_PICTURE = 48;
const SPACE = 0.3;
const DIGIT = 0.68;
const everyKind = { shell: 1, tooth: 2, amber: 1, "egg-nest": 1, "golden-fossil": 12 };

const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const emsOf = (word: string) => {
  const ems = EMS[word];
  if (ems === undefined) throw new Error(`No width for ${word}`);
  return ems;
};

// The lines a name takes in `room` ems, each word kept whole.
function lines(name: string, room: number): number {
  let count = 1;
  let line = 0;
  for (const word of name.split(" ")) {
    const wide = emsOf(word);
    if (line > 0 && line + SPACE + wide > room) {
      count += 1;
      line = wide;
    } else line += (line > 0 ? SPACE : 0) + wide;
  }
  return count;
}

// The FIELD GUIDE, every kind found, opened from DIG's board in a
// wide-short window of `size` with the insets `insets`.
function openGuide(size: WindowSize, insets: SafeArea, language: Language = "en") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
  document.head.append(sheet);
  onTestFinished(() => {
    sheet.remove();
    delete document.documentElement.dataset.size;
  });
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], treasures: everyKind } } }) });
  openDigApp({ viewport, portraitLayouts: LAYOUTS, ageLevel: { level: "hatchling", revision: "parent" }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  fireEvent.click(screen.getByRole("button", { name: TEXTS[language].fieldGuide }));
}

describe("DIG's FIELD GUIDE in a wide-short window", () => {
  it.each(EVERY)("keeps the board's 48-pixel bar, HOME and BACK as squares, at %i by %i in %s", (width, height, language, insets) => {
    const size: WindowSize = [width, height];
    openGuide(size, insets, language);
    const at = (selector: string) => styleAt(part(selector), size);
    const text = TEXTS[language];
    expect([document.documentElement.dataset.size, part(".orientation-gate").hasAttribute("data-shown")]).toEqual(["wide-short", false]);
    const page = at(".dig-field-guide-screen");
    expect([page.px("padding-top"), page.px("padding-right"), page.px("padding-bottom"), page.px("padding-left"), page.rowGap()]).toEqual([8, 20 + insets.right, 12 + insets.bottom, 20 + insets.left, 8]);
    const bar = at(".dig-bar");
    expect([bar.value("height"), bar.columnGap()]).toEqual(["48px", 8]);
    for (const name of [text.home, text.back]) {
      const button = screen.getByRole("button", { name });
      const style = styleAt(button, size);
      expect([style.value("width"), style.value("height"), style.px("padding-left")]).toEqual(["48px", "48px", 0]);
      expect(styleAt(part(".upright-hidden", button), size).value("clip-path")).toBe("inset(50%)");
    }

    // The title, beside its book, takes the room HOME, BACK and the kinds
    // found leave it.
    const title = at(".dig-title");
    const mark = at(".dig-mark");
    expect([title.columnGap(), mark.value("width"), at(".dig-mark svg").value("width")]).toEqual([8, "40px", "24px"]);
    const chip = at(".dig-chip");
    const chipSymbol = at(".dig-chip svg");
    expect([chip.value("height"), chip.px("font-size")]).toEqual(["40px", 16]);
    const chipWidth = chip.px("padding-left") + chipSymbol.px("width") + chip.columnGap() + emsOf("5/5") * chip.px("font-size") + chip.px("padding-right");
    const inner = width - 40 - insets.left - insets.right;
    const room = inner - 2 * 48 - chipWidth - 3 * bar.columnGap() - mark.px("width") - title.columnGap();
    expect(at(".dig-title-words").value("font-size")).toBe("min(24px, (100cqi - 48px) / (var(--letters) * 0.75))");
    const words = Math.min(24, room / (text.fieldGuide.length * 0.75));
    expect(words).toBeGreaterThanOrEqual(LEAST_NAME);
    expect(emsOf(text.fieldGuide) * words).toBeLessThanOrEqual(room);
  });

  it.each(EVERY)("shows the five cards, every name whole and readable, all within the height, at %i by %i in %s", (width, height, language, insets) => {
    const size: WindowSize = [width, height];
    openGuide(size, insets, language);
    const at = (selector: string) => styleAt(part(selector), size);
    const text = TEXTS[language];
    const row = ROW[language];
    const cards = [...document.querySelectorAll<HTMLElement>(".dig-guide-card")];
    expect(cards).toHaveLength(5);
    const room = at(".dig-guide-cards");
    expect(room.columnGap()).toBe(8);
    const card = styleAt(cards[0]!, size);
    const inner = width - 40 - insets.left - insets.right;
    const cardWidth = (inner - (row - 1) * room.columnGap()) / row;
    const content = cardWidth - card.px("padding-left") - card.px("padding-right") - 2 * card.px("border-left-width");
    const rows = Math.ceil(cards.length / row);
    const tall = height - 8 - 12 - insets.bottom - 48 - 8;
    const cardHeight = (tall - (rows - 1) * room.rowGap()) / rows;
    const sides = card.px("padding-top") + card.px("padding-bottom") + 2 * card.px("border-top-width");

    const name = at(".dig-guide-name");
    const ems = { en: 4.5, ru: 8.4 }[language];
    expect(name.value("font-size")).toBe(`min(22px, 100cqi/${ems})`);
    const nameSize = Math.min(22, content / ems);
    expect(nameSize).toBeGreaterThanOrEqual(LEAST_NAME);
    const count = at(".dig-guide-count");
    expect(count.px("font-size")).toBe(24);
    for (const kind of Object.values(text.treasures)) {
      for (const word of kind.split(" ")) expect(emsOf(word) * nameSize, word).toBeLessThanOrEqual(content);
      const named = lines(kind, content / nameSize) * Number(name.value("line-height")) * nameSize;
      if (language === "en") {
        // A column: the picture over the name over the count.
        expect([room.value("flex-wrap") || "nowrap", card.rowGap()]).toEqual(["nowrap", 6]);
        expect(cardHeight - sides - named - count.px("font-size") - 2 * card.rowGap(), kind).toBeGreaterThanOrEqual(LEAST_PICTURE);
      } else {
        // Three over two, the two centred: the name across the card, over
        // its picture beside its count.
        expect([room.value("flex-wrap"), room.value("justify-content"), card.value("flex-basis"), card.value("display")]).toEqual(["wrap", "center", "calc(0.3333333333333333*(100% - 16px))", "grid"]);
        expect([card.rowGap(), card.columnGap()]).toEqual([4, 8]);
        expect(cardHeight - sides - named - card.rowGap(), kind).toBeGreaterThanOrEqual(LEAST_PICTURE);
        expect(3 * DIGIT * count.px("font-size")).toBeLessThanOrEqual((content - card.columnGap()) / 2);
      }
    }
  });

  it("goes back to the board on its side", () => {
    openGuide([667, 375], PHONES[1][2]);
    fireEvent.click(screen.getByRole("button", { name: TEXTS.en.back }));
    expect(board()).toBeTruthy();
    expect(document.documentElement.dataset.size).toBe("wide-short");
  });
});
