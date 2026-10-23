import { render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PairsResultScreen } from "../src/PairsResultScreen.tsx";
import { pairsResultType, pairsResultWidth, PORTRAIT_PAIRS_RESULT } from "../src/pairsResultLayout.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_PALS, fakeBodyPicture } from "./support.ts";
import { openWindow, styleAt, windowsAnd, type WindowSize } from "./windowSizes.ts";

// jsdom does not lay out a page. Read the delivered CSS and budget its
// grid, rows and text using conservative widths in ems: Lexend's bold
// Latin face and the iPad's Cyrillic face. Names use the shared measures.
const FIT_TABLE = windowsAnd([1366, 1024]).flatMap(([width, height]) => [["Explorer", 9, width, height] as const, ["Paleontologist", 12, width, height] as const]);

const WORD_EMS: Record<string, number> = {
  "PLAY AGAIN": 7.2, HOME: 3.2, BACK: 2.9, "WELL DONE!": 7.5, "FIRST BEST!": 7.6,
  "ЕЩЁ РАЗ": 5.8, ДОМОЙ: 4.1, НАЗАД: 3.7, "МОЛОДЕЦ!": 6.8, "ПЕРВЫЙ РЕКОРД!": 10.8,
  BEST: 3.2, РЕКОРД: 5.2, NEW: 2.9, НОВЫЙ: 4.4, "2": 0.7
};

const element = (selector: string) => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const style = (selector: string) => getComputedStyle(element(selector));

describe.each(FIT_TABLE)("%s's %i-dinosaur result at %i by %i", (_, count, width, height) => {
  // Only the CSS lengths used by the result are accepted; an unsupported
  // unit fails the fit check rather than silently treating it as pixels.
  function pixels(value: string): number {
    if (value === "0") return 0;
    const plain = /^([\d.]+)(px|vw|vh)$/.exec(value);
    if (plain) return Number(plain[1]) * (plain[2] === "vw" ? width / 100 : plain[2] === "vh" ? height / 100 : 1);
    const range = /^(clamp|min)\(([^()]+)\)$/.exec(value);
    if (range) {
      const parts = (range[2] ?? "").split(",").map((part) => pixels(part.trim()));
      return range[1] === "min" ? Math.min(...parts) : Math.max(parts[0] ?? NaN, Math.min(parts[1] ?? NaN, parts[2] ?? NaN));
    }
    throw new Error(`Cannot budget ${value}`);
  }

  // jsdom keeps a gap only as the shorthand, row gap first; a gap may be
  // a clamp() or min() with spaces of its own.
  const gap = (s: CSSStyleDeclaration, axis: "row" | "column" = "column") => {
    const [row, column = row] = s.gap.match(/(?:[^\s()]+|\([^()]*\))+/g) ?? [];
    return pixels((axis === "column" ? column : row) ?? "");
  };
  const sides = (s: CSSStyleDeclaration) => pixels(s.paddingLeft) + pixels(s.paddingRight);
  const vertical = (s: CSSStyleDeclaration) => pixels(s.paddingTop) + pixels(s.paddingBottom);
  const wordWidth = (words: string, size: number) => (WORD_EMS[words] ?? NaN) * size;

  it.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))(
    "keeps every name, reward and action on screen in %s, %s",
    (language, theme) => {
      openWindow(width, height);
      const text = TEXTS[language];
      render(
        <div data-theme={theme}>
          <PairsResultScreen
            language={language}
            pals={SHIPPED_PALS.slice(0, count).map(({ id, name }, at) => ({ id, name: name[language], picture: fakeBodyPicture(id), newlyFound: at >= count - 3 }))}
            tries={20}
            stars={7}
            best={20}
            beaten={undefined}
            celebration="first-best"
            levelUp={null}
            onPlayAgain={() => {}}
            onBack={() => {}}
            onHome={() => {}}
          />
        </div>,
        withPictures
      );

      const outer = style(".pairs-result");
      expect([outer.display, outer.boxSizing, outer.height]).toEqual(["grid", "border-box", `${height}px`]);
      const room = { width: width - sides(outer), height: height - vertical(outer) };
      const columns = /^minmax\(0, (\d+)fr\) minmax\(0, (\d+)fr\)$/.exec(outer.gridTemplateColumns);
      if (!columns) throw new Error(`Unknown result grid: ${outer.gridTemplateColumns}`);
      const fraction = Number(columns[1]) / (Number(columns[1]) + Number(columns[2]));
      const left = (room.width - gap(outer)) * fraction;
      const right = room.width - gap(outer) - left;

      const grid = style(".pairs-found");
      const rows = Number((element(".pairs-found") as HTMLElement).style.getPropertyValue("--found-rows"));
      expect([rows, grid.height, grid.gridTemplateColumns, grid.gridTemplateRows]).toEqual([Math.ceil(count / 3), "100%", "repeat(3, minmax(0, 1fr))", "repeat(var(--found-rows), minmax(0, 1fr))"]);
      const cap = /^calc\(var\(--found-rows\) \* (\d+)px \+ \(var\(--found-rows\) - 1\) \* (\d+)px\)$/.exec(grid.maxHeight);
      if (!cap) throw new Error(`Unknown result row cap: ${grid.maxHeight}`);
      const gridHeight = Math.min(room.height, rows * Number(cap[1]) + (rows - 1) * Number(cap[2]));
      const card = { width: (left - 2 * gap(grid)) / 3, height: (gridHeight - (rows - 1) * gap(grid, "row")) / rows };
      const name = style(".pairs-found-name");
      const shrinking = /^min\((\d+)px, ([\d.]+) \* \(100cqi - (\d+)px\)\)$/.exec(name.fontSize);
      if (!shrinking) throw new Error(`Unknown name size: ${name.fontSize}`);
      const nameSize = Math.min(Number(shrinking[1]), Number(shrinking[2]) * (card.width - Number(shrinking[3])));
      expect(name.whiteSpace).toBe("nowrap");
      const allNames = SHIPPED_PALS.map(({ name }) => name[language].toLocaleUpperCase(language));
      const nameRoom = card.width - sides(name);
      expect(allNames.filter((name) => !((NAME_EMS[name] ?? Infinity) * nameSize <= nameRoom))).toEqual([]);
      expect([style(".pairs-found-art").flexBasis, style(".pairs-found-art").minHeight]).toEqual(["0px", "0px"]);
      expect(vertical(name) + nameSize * Number(name.lineHeight) + vertical(style(".pairs-found-art")) + pixels(style(".pairs-new-badge").height)).toBeLessThanOrEqual(card.height);
      expect(element(".pairs-found").children).toHaveLength(count);
      expect(document.querySelectorAll(".pairs-new-badge")).toHaveLength(3);
      const newBadge = style(".pairs-new-badge");
      expect(wordWidth(text.newlyFound, pixels(newBadge.fontSize)) + sides(newBadge) + 20 + gap(newBadge) + pixels(newBadge.right)).toBeLessThanOrEqual(card.width);

      const panel = style(".result-content");
      const tries = style(".pairs-result-tries");
      const digits = pixels(style(".pairs-result-tries-value").fontSize);
      const hand = Number(element(".pairs-result-hand").getAttribute("height"));
      const title = style(".result-title");
      const actions = style(".result-actions");
      const buttons = [text.playAgain, text.back, text.home].map((name) => screen.getByRole("button", { name }));
      const panelHeight = pixels(style(".celebration").height) + Math.max(digits, hand) + pixels(style(".pairs-result-stars").fontSize) + pixels(title.fontSize) * Number(title.lineHeight) + pixels(style(".best-score").height) + pixels(getComputedStyle(buttons[0] ?? document.body).height) + vertical(actions) + 5 * gap(panel, "row");
      expect(panelHeight).toBeLessThanOrEqual(room.height);
      expect(2 * 0.75 * digits + Number(element(".pairs-result-hand").getAttribute("width")) + gap(tries)).toBeLessThanOrEqual(right);
      expect(wordWidth(text.wellDone, pixels(title.fontSize))).toBeLessThanOrEqual(right);
      const badge = style(".celebration");
      expect(wordWidth(text.celebrations["first-best"].text, pixels(badge.fontSize)) + sides(badge) + 30 + gap(badge)).toBeLessThanOrEqual(right);
      const actionWidth = buttons.reduce((sum, button) => {
        const s = getComputedStyle(button);
        expect(s.whiteSpace).toBe("nowrap");
        expect(pixels(s.height)).toBeGreaterThanOrEqual(48);
        return sum + sides(s) + wordWidth(button.textContent ?? "", pixels(s.fontSize)) + 28 + gap(s);
      }, gap(actions));
      expect(actionWidth).toBeLessThanOrEqual(right);
      // A new best's chip includes its previous best and arrow as well.
      const best = style(".best-score");
      expect(sides(best) + 22 + wordWidth(text.best, pixels(best.fontSize)) + 2 * 0.75 * pixels(best.fontSize) + 20 + 2 * 0.75 * pixels(style(".best-score-value").fontSize) + 4 * gap(best)).toBeLessThanOrEqual(right);
      expect([screen.getByLabelText(text.tries).textContent, screen.getByLabelText(text.starsEarned).textContent, screen.getByLabelText(text.bestScore).textContent]).toEqual(["20", "★7", `${text.best}20`]);
    }
  );
});

// The document stands in a tall window, as App marks it.
function tallWindow(size: WindowSize) {
  openWindow(...size);
  document.documentElement.dataset.size = "tall";
  onTestFinished(() => void delete document.documentElement.dataset.size);
}

// find-the-pair-result-portrait.feature's "Every word fits the narrowest
// width": Hatchling's climb, a first best and a new level, and a
// Paleontologist board, a first best, upright in a 600 by 1000 window.
const UPRIGHT_BOARDS = [
  ["Hatchling's climb", 3, { level: 2, rows: 2, columns: 4 }],
  ["Paleontologist", 12, null]
] as const;

describe.each(UPRIGHT_BOARDS)("%s's %i-dinosaur result upright", (_, count, levelUp) => {
  it.each(LANGUAGES.flatMap((language) => [0, 16].map((scrollbar) => [language, scrollbar] as const)))(
    "keeps every word on its line in %s at 600 by 1000 with a %i-pixel scrollbar",
    (language, scrollbar) => {
      const size: WindowSize = [600, 1000];
      tallWindow(size);
      const sizes = PORTRAIT_PAIRS_RESULT;
      const width = pairsResultWidth(600, 0, 0, scrollbar);
      const type = pairsResultType(width, count);
      const text = TEXTS[language];
      render(
        <PairsResultScreen
          language={language}
          pals={SHIPPED_PALS.slice(0, count).map(({ id, name }, at) => ({ id, name: name[language], picture: fakeBodyPicture(id), newlyFound: at >= count - 3 }))}
          tries={20} stars={7} best={20} beaten={undefined} celebration="first-best" levelUp={levelUp}
          onPlayAgain={() => {}} onBack={() => {}} onHome={() => {}} width={width}
        />,
        withPictures
      );
      const at = (selector: string) => styleAt(element(selector), size);
      const sides = (selector: string) => at(selector).px("padding-left") + at(selector).px("padding-right");
      const words = (words: string, size: number) => (WORD_EMS[words] ?? NaN) * size;

      // Every name and NEW on one line on its card, as wide as the grid's
      // three columns leave it.
      const card = (Math.min(sizes.foundMaximum, width) - 2 * at(".pairs-found").columnGap()) / 3;
      const nameSize = Math.min(sizes.nameMaximum, (card - 2 * sizes.namePadding) / sizes.nameEms);
      expect(at(".pairs-found-name").value("white-space")).toBe("nowrap");
      const allNames = SHIPPED_PALS.map(({ name }) => name[language].toLocaleUpperCase(language));
      expect(allNames.filter((name) => !((NAME_EMS[name] ?? Infinity) * nameSize <= card - sides(".pairs-found-name")))).toEqual([]);
      expect(words(text.newlyFound, at(".pairs-new-badge").px("font-size")) + sides(".pairs-new-badge") + 20 + at(".pairs-new-badge").columnGap() + at(".pairs-new-badge").px("right")).toBeLessThanOrEqual(card);

      // Each badge on one line across the width; side by side where both
      // fit, which Russian's do not.
      const celebration = words(text.celebrations["first-best"].text, at(".celebration").px("font-size")) + sides(".celebration") + 30 + at(".celebration").columnGap();
      expect(celebration).toBeLessThanOrEqual(width);
      if (levelUp) {
        const next = levelUp.columns * 12 + (levelUp.columns - 1) * 3;
        const level = 34 + words(String(levelUp.level), at(".pairs-level-up").px("font-size")) + next + 2 * at(".pairs-level-up").columnGap() + sides(".pairs-level-up");
        expect(level).toBeLessThanOrEqual(width);
        expect([at(".pairs-badges").value("flex-wrap"), celebration + at(".pairs-badges").columnGap() + level <= width]).toEqual(["wrap", language === "en"]);
      }

      // PLAY AGAIN, BACK and HOME side by side, each on one line in the
      // window's one type, at least 22.
      const buttons = [text.playAgain, text.back, text.home].map((name) => screen.getByRole("button", { name }));
      const across = buttons.reduce((sum, button) => {
        const own = styleAt(button, size);
        expect([own.value("white-space"), own.px("font-size")]).toEqual(["nowrap", type.action]);
        return sum + own.px("padding-left") + own.px("padding-right") + 28 + own.columnGap() + words(button.textContent ?? "", own.px("font-size"));
      }, 2 * at(".result-actions").columnGap());
      expect(across).toBeLessThanOrEqual(width + 1e-9);
      expect(type.action).toBeGreaterThanOrEqual(22);

      // WELL DONE! and the best, each on one line.
      expect(words(text.wellDone, at(".result-title").px("font-size"))).toBeLessThanOrEqual(width);
      const best = at(".best-score");
      expect(sides(".best-score") + 22 + words(text.best, best.px("font-size")) + 2 * 0.75 * at(".best-score-value").px("font-size") + 3 * best.columnGap()).toBeLessThanOrEqual(width);
    }
  );
});
