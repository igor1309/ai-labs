import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigRevealScreen, STAR_LANDS } from "../src/DigRevealScreen.tsx";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { withPictures } from "./pictures.tsx";
import { contrast, fakeBodyPicture, manualTimers, seenOn, surfaceOf } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

// jsdom lays nothing out. Budget the delivered CSS of the fullest reveal,
// the 42nd dinosaur dug up and named at the first pick, in each window,
// using conservative widths in ems: Lexend's bold Latin face and the
// iPad's Cyrillic face. Names and levels use the shared measures.
const WORD_EMS: Record<string, number> = {
  "DIG AGAIN": 6.6, HOME: 3.2, "DUG UP": 4.4, "NEW!": 3.0, "NEW BEST!": 7.2,
  "КОПАТЬ ЕЩЁ": 7.4, ДОМОЙ: 4.1, ОТКОПАНО: 6.2, "НОВЫЙ!": 4.6, "НОВЫЙ РЕКОРД!": 10.5
};

function pixels(value: string): number {
  if (value === "0" || value === "normal") return 0;
  const plain = /^([\d.]+)px$/.exec(value);
  if (plain) return Number(plain[1]);
  throw new Error(`Cannot budget ${value}`);
}
const horizontal = (s: CSSStyleDeclaration) => pixels(s.paddingLeft) + pixels(s.paddingRight);
const vertical = (s: CSSStyleDeclaration) => pixels(s.paddingTop) + pixels(s.paddingBottom);
const gap = (s: CSSStyleDeclaration) => pixels(s.gap);
const wordWidth = (word: string, size: number) => (WORD_EMS[word] ?? NaN) * size;
const element = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const style = (selector: string) => getComputedStyle(element(selector));

describe.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))("the dig reveal in %s, %s", (language, theme) => {
  it.each(windowsAnd([1366, 1024]))("shows the name, the fullest DUG UP card, the switch and both actions with no scrolling, every word readable, in a %i by %i window", (windowWidth, windowHeight) => {
    openWindow(windowWidth, windowHeight);
    document.documentElement.dataset.theme = theme;
    try {
      const text = TEXTS[language];
      const name = "PACHYCEPHALOSAURUS";
      render(
        <DigRevealScreen
          language={language}
          name={name}
          picture={fakeBodyPicture("pachycephalosaurus")}
          dugUp={42}
          total={42}
          treasures={128}
          newStar
          celebration="new-best"
          badge
          landed
          startTimer={manualTimers().startTimer}
          landingWait={STAR_LANDS.motion}
          onLanded={() => {}}
          level="paleontologist"
          onLevel={() => {}}
          onDigAgain={() => {}}
          onHome={() => {}}
        />,
        withPictures
      );

      const outer = style(".dig-reveal-screen");
      expect([outer.height, outer.boxSizing, outer.display, outer.flexDirection, outer.overflow]).toEqual([`${windowHeight}px`, "border-box", "flex", "column", "hidden"]);
      const room = { width: windowWidth - horizontal(outer), height: windowHeight - vertical(outer) };

      // The reward column takes its 648 pixels; the dinosaur the rest.
      const reveal = style(".dig-reveal");
      const reward = style(".dig-reward");
      expect([reward.flex, reveal.display]).toEqual(["0 1 648px", "flex"]);
      const width = 648;
      expect(width + gap(reveal) + 200).toBeLessThanOrEqual(room.width);

      // The whole 4:3 picture stays in its flexible left column in every
      // window, the screen's padding as this window gives it. Its glide
      // uses the gap, never space outside the screen.
      const art = style(".dig-reveal-art");
      const picture = style(".dig-reveal-picture");
      expect([art.flex, art.minWidth, art.height, picture.width, picture.maxHeight, picture.objectFit])
        .toEqual(["1 1 0px", "0px", "100%", "100%", "100%", "contain"]);
      const artWidth = room.width - width - gap(reveal);
      const artHeight = room.height - 48 - gap(outer);
      expect(artWidth).toBeGreaterThan(0);
      expect(artHeight).toBeGreaterThan(0);
      const scale = Math.min(artWidth / 800, artHeight / 600);
      expect(800 * scale).toBeLessThanOrEqual(artWidth);
      expect(600 * scale).toBeLessThanOrEqual(artHeight);
      expect(pixels(outer.paddingLeft) + artWidth + gap(reveal)).toBeLessThanOrEqual(windowWidth - pixels(outer.paddingRight));

      // The name, as large as fits the column, on one line.
      const shown = style(".dig-reveal-name");
      expect(shown.whiteSpace).toBe("nowrap");
      const shrinking = /^min\((\d+)px, ([\d.]+) \* \(100cqi - (\d+)px\)\)$/.exec(shown.fontSize);
      if (!shrinking) throw new Error(`Unknown name size: ${shown.fontSize}`);
      const nameSize = Math.min(Number(shrinking[1]), Number(shrinking[2]) * (width - Number(shrinking[3])));
      expect((NAME_EMS[name] ?? Infinity) * nameSize + pixels(shown.letterSpacing) * name.length).toBeLessThanOrEqual(width);

      // The card: its star, the words, the count, NEW!, the 🏆 and the 🦴.
      const card = screen.getByRole("region", { name: text.dugUp });
      const cardStyle = getComputedStyle(card);
      expect(cardStyle.whiteSpace).toBe("nowrap");
      expect(within(card).getByRole("img", { name: text.allDugUp })).toBeDefined();
      expect(within(card).getByRole("img", { name: text.badges.paleontologist })).toBeDefined();
      const size = pixels(cardStyle.fontSize);
      const cardWidth =
        horizontal(cardStyle) +
        pixels(style(".dig-card-star").width) +
        wordWidth(text.dugUp, size) + pixels(style(".dig-card-words").letterSpacing) * text.dugUp.length +
        5 * 0.75 * pixels(style(".dig-card-count").fontSize) +
        wordWidth(text.dugUpNew, size) +
        30 +
        pixels(style(".level-badge").width) +
        5 * gap(cardStyle);
      expect(cardWidth).toBeLessThanOrEqual(width);
      expect(card.textContent).toContain("42/42");

      const chip = style(".celebration");
      expect(wordWidth(text.celebrations["new-best"].text, pixels(chip.fontSize)) + horizontal(chip) + 30 + gap(chip)).toBeLessThanOrEqual(width);

      // The switch, every level's name on one line in its third.
      const switcher = screen.getByRole("group", { name: text.ageLevelSwitch });
      const switchStyle = getComputedStyle(switcher);
      const segment = (width - horizontal(switchStyle) - pixels(switchStyle.borderLeftWidth) - pixels(switchStyle.borderRightWidth) - 2 * gap(switchStyle)) / 3;
      const levels = within(switcher).getAllByRole("button");
      for (const button of levels) {
        const s = getComputedStyle(button);
        const words = button.querySelector(".level-switch-name")?.textContent ?? "";
        const picture = button.querySelector(".level-switch-picture");
        if (!picture) throw new Error("A level without its picture");
        expect(s.whiteSpace).toBe("nowrap");
        expect(pixels(s.height)).toBeGreaterThanOrEqual(48);
        expect((LEVEL_EMS[words] ?? NaN) * pixels(s.fontSize) + pixels(s.letterSpacing) * words.length + horizontal(s) + pixels(getComputedStyle(picture).width) + gap(s)).toBeLessThanOrEqual(segment);
        const surface = surfaceOf(button);
        expect(contrast(seenOn(s.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }

      // DIG AGAIN and HOME side by side.
      const actions = style(".dig-reveal-screen .result-actions");
      const buttons = [text.digAgain, text.home].map((name) => screen.getByRole("button", { name }));
      const actionWidth = buttons.reduce((sum, button) => {
        const s = getComputedStyle(button);
        expect(s.whiteSpace).toBe("nowrap");
        expect(pixels(s.height)).toBeGreaterThanOrEqual(48);
        const surface = surfaceOf(button);
        expect(contrast(seenOn(s.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
        return sum + horizontal(s) + 28 + gap(s) + wordWidth(button.textContent ?? "", pixels(s.fontSize));
      }, gap(actions));
      expect(actionWidth).toBeLessThanOrEqual(width);

      // Every word on the dark reveal keeps its contrast.
      for (const word of [element(".dig-reveal-name"), card.querySelector<HTMLElement>(".dig-card-words"), card.querySelector<HTMLElement>(".dig-card-count"), card.querySelector<HTMLElement>(".dig-card-new")]) {
        if (!word) throw new Error("A word of the reveal is missing");
        const surface = surfaceOf(word);
        expect(contrast(seenOn(getComputedStyle(word).color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }

      // The bar, then the column's rows, fit the screen's height.
      const bar = Math.max(pixels(style(".dig-mark").height), pixels(style(".dig-title").fontSize) * 1.25);
      const ways = style(".dig-reveal-ways");
      const switchHeight = vertical(switchStyle) + pixels(switchStyle.borderTopWidth) + pixels(switchStyle.borderBottomWidth) + pixels(getComputedStyle(levels[0] ?? document.body).height);
      const column =
        nameSize * Number(shown.lineHeight) + pixels(cardStyle.height) + pixels(chip.height) +
        switchHeight + gap(ways) + Math.max(...buttons.map((button) => pixels(getComputedStyle(button).height))) + vertical(actions) +
        3 * gap(reward);
      expect(bar + gap(outer) + column).toBeLessThanOrEqual(room.height);
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
