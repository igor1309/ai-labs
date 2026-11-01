import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { CLIMB_LEVELS, LARGE_LEVELS } from "../src/pairs/index.ts";
import { pairsBoardGeometry, pairsBoardWidth } from "../src/pairsBoardLayout.ts";
import { PairsBoardScreen, type PairCardView } from "../src/PairsBoardScreen.tsx";
import { NAME_EMS } from "./nameWidths.ts";
import { board, openPairsApp, pairCards, playBoard } from "./pairsApp.tsx";
import { withPictures } from "./pictures.tsx";
import { gameDoor, manualViewport, SHIPPED_PALS } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// find-the-pair-board-portrait.feature's bar and names at the narrowest
// tall window. jsdom lays nothing out: the delivered CSS is budgeted with
// the names' measured widths in ems, and conservative ones, 0.8 em a
// glyph, for the chips' digits.
const GLYPH_EMS = 0.8;

const element = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The document stands in a tall window, as App marks it.
function tallWindow(size: WindowSize) {
  openWindow(...size);
  document.documentElement.dataset.size = "tall";
  onTestFinished(() => void delete document.documentElement.dataset.size);
}

// What a symbol drawn straight into a part takes of it.
const symbolWidth = (part: Element) => Number(element("svg", part).getAttribute("width"));

// A name shown to screen readers alone: in the page, drawn in no room.
function expectHidden(name: Element, size: WindowSize) {
  const own = styleAt(name, size);
  expect([own.value("position"), own.value("width"), own.value("height"), own.value("overflow"), own.value("clip-path"), own.value("white-space")]).toEqual(["absolute", "1px", "1px", "hidden", "inset(50%)", "nowrap"]);
}

// Each board and the floor of its cards.
const SHAPES = [
  ...Object.values(CLIMB_LEVELS).map((shape) => ({ ...shape, floor: 150 })),
  { ...LARGE_LEVELS.explorer, floor: 130 },
  { ...LARGE_LEVELS.paleontologist, floor: 120 }
];

// The tall windows a board stands upright in.
const TALL_WINDOWS: readonly WindowSize[] = [[600, 700], [600, 800], [600, 1000], [744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]];

// Every name a found card may show, in either language.
const NAMES = SHIPPED_PALS.flatMap(({ name }) => LANGUAGES.map((language) => name[language].toLocaleUpperCase(language)));

// A found card's name type on a card `width` wide, as app.css gives it:
// at most 24, otherwise the card's width less the name's sides over the
// longest name's 12.7 ems.
const nameType = (width: number) => Math.min(24, (width - 20) / 12.7);

describe("an upright board's bar fits the narrowest width", () => {
  it.each([
    ["en", 0], ["ru", 16]
  ] as const)("keeps BACK, HOME, the mark, the climb level and 100 tries in one row in %s at 600 by 1000 with a %i-pixel scrollbar", (language, scrollbar) => {
    const size: WindowSize = [600, 1000];
    tallWindow(size);
    const width = pairsBoardWidth(600, 0, 0, scrollbar);
    const text = TEXTS[language];
    const { rows, columns } = CLIMB_LEVELS[4];
    const cards = Array.from({ length: rows * columns }, (_, place): PairCardView => ({ id: `pal-${place >> 1}`, name: "", picture: "", face: "picture", state: "down" }));
    render(
      <PairsBoardScreen
        language={language} climbLevel={4} tries={100} rows={rows} columns={columns} cardFloor={150} cards={cards}
        finished={false} onTurn={() => {}} onBack={() => {}} onHome={() => {}} width={width}
      />,
      withPictures
    );
    const at = (selector: string) => styleAt(element(selector), size);
    const page = at(".pairs-board-screen");
    expect([page.px("padding-left"), page.px("padding-right")]).toEqual([32, 32]);
    const bar = at(".pairs-bar");
    expect([bar.value("display"), bar.value("flex-direction") || "row", bar.value("flex-wrap") || "nowrap", bar.value("align-items"), bar.px("height")]).toEqual(["flex", "row", "nowrap", "center", 56]);

    // BACK and HOME, each its symbol alone in 56 a side, named for screen
    // readers.
    const header = element(".pairs-bar");
    const buttons = [within(header).getByRole("button", { name: text.back }), within(header).getByRole("button", { name: text.home })];
    for (const button of buttons) {
      const own = styleAt(button, size);
      expect([own.px("width"), own.px("height"), own.px("padding-left"), own.px("padding-right"), own.value("flex-shrink"), own.value("justify-content")]).toEqual([56, 56, 0, 0, "0", "center"]);
      expect(symbolWidth(button)).toBeLessThanOrEqual(56);
      expectHidden(element(".upright-hidden", button), size);
    }

    // The title, its mark alone, its name still read.
    const heading = screen.getByRole("heading");
    const title = styleAt(heading, size);
    expect(heading.textContent).toBe(text.pairs);
    expect([title.value("flex-grow"), title.value("flex-shrink"), title.px("min-width")]).toEqual(["1", "1", 0]);
    expectHidden(element(".upright-hidden", heading), size);
    const mark = at(".pairs-bar-mark");
    expect([mark.value("flex-shrink"), mark.px("width"), mark.px("height")]).toEqual(["0", 52, 52]);

    // The climb level and the tries at the right, each on one line.
    const chips = [screen.getByLabelText(text.level), screen.getByLabelText(text.tries)];
    expect(chips.map((chip) => chip.textContent)).toEqual(["4", "100"]);
    const chipsWidth = chips.reduce((sum, chip) => {
      const own = styleAt(chip, size);
      expect([own.value("flex-shrink"), own.value("display"), own.px("height")]).toEqual(["0", "flex", 52]);
      const digits = GLYPH_EMS * (chip.textContent ?? "").length * own.px("font-size");
      // The tries take at least their 1.4 em.
      const tries = chip.querySelector(".pairs-tries");
      const least = tries ? styleAt(tries, size).px("min-width") : 0;
      if (tries) expect(least).toBeCloseTo(1.4 * own.px("font-size"), 6);
      return sum + own.px("padding-left") + own.px("padding-right") + symbolWidth(chip) + own.columnGap() + Math.max(least, digits);
    }, 0);
    const parts = buttons.length + 1 + chips.length;
    expect(56 * buttons.length + mark.px("width") + chipsWidth + (parts - 1) * bar.columnGap()).toBeLessThanOrEqual(width);
  });
});

describe("a found pair's names fit upright", () => {
  it("never stands a card under the floor the landscape name fit holds it to, which every name fits", () => {
    for (const shape of SHAPES) {
      for (const [width, height] of TALL_WINDOWS) {
        expect(pairsBoardGeometry(shape, width, height, 0, 0).card.width).toBeGreaterThanOrEqual(shape.floor);
      }
      const type = nameType(shape.floor);
      expect(NAMES.filter((name) => !((NAME_EMS[name] ?? Infinity) * type <= shape.floor - 20 + 1e-9))).toEqual([]);
    }
  });

  // The screens with a portrait layout, as the browser's app has them.
  const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"] };
  const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

  it.each(LANGUAGES)("names each found card of a Paleontologist board in %s on one line at 768 by 1024", async (language) => {
    openWindow(768, 1024);
    const { user, clock } = openPairsApp({ viewport: manualViewport("portrait"), portraitLayouts: PORTRAIT_LAYOUTS, deviceLanguage: DEVICES[language], ageLevel: { level: "paleontologist", revision: "picked-paleontologist" } });
    await user.click(gameDoor(TEXTS[language].pairs));
    await user.click(screen.getByRole("button", { name: TEXTS[language].play }));
    await playBoard(user, clock);
    const card = pairsBoardGeometry({ rows: 4, columns: 6, floor: 120 }, 768, 1024, 0, 0).card.width;
    expect(board().style.getPropertyValue("--card-floor")).toBe("120px");
    expect(card).toBeGreaterThanOrEqual(120);
    const size: WindowSize = [768, 1024];
    for (const found of pairCards()) {
      expect(found.getAttribute("data-state")).toBe("found");
      expect(styleAt(found, size).value("container-type")).toBe("inline-size");
      const name = element(".pair-card-name", found);
      const own = styleAt(name, size);
      // The name's rule is landscape's, sized by the card's width.
      const rule = /^min\((\d+)px, ([\d.]+) \* \(100cqi - (\d+)px\)\)$/.exec(own.value("font-size"));
      if (!rule) throw new Error(`A name's type the test cannot read: ${own.value("font-size")}`);
      expect([Number(rule[1]), Number(rule[3])]).toEqual([24, own.px("padding-left") + own.px("padding-right")]);
      expect(1 / Number(rule[2])).toBeCloseTo(12.7, 3);
      expect([own.value("white-space"), name.textContent]).toEqual(["nowrap", found.getAttribute("aria-label")]);
      const ems = NAME_EMS[name.textContent ?? ""];
      if (ems === undefined) throw new Error(`No width for ${name.textContent}`);
      expect(ems * nameType(card) + own.px("padding-left") + own.px("padding-right")).toBeLessThanOrEqual(card + 1e-9);
    }
  });
});
