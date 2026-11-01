import { GameAudioButton } from "../src/GameAudioButton.tsx";
import { fireEvent, render } from "@testing-library/react";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { TEXTS } from "../src/language/texts.ts";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { jawMouth } from "../src/jawPresentation.ts";
import { WhoseJawBoardScreen, type WhoseJawBoardScreenProps } from "../src/WhoseJawBoardScreen.tsx";
import { manualPictures } from "./support.ts";
import { withManualPictures } from "./pictures.tsx";
import { JAWS } from "./whoseJaw.ts";
import { openWindow, styleAt, windowsAnd, type WindowSize } from "./windowSizes.ts";

const part = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const style = (selector: string, size: WindowSize) => styleAt(part(selector), size);
const PORTRAITS = [[360, 780, "tall-narrow"], [390, 844, "tall-narrow"], [768, 1024, "tall"], [820, 1180, "tall"]] as const;

// Measure the shipped pixels, so a large transparent canvas cannot satisfy
// the inspectable-art requirement. Faint edge antialiasing is excluded.
const bounds: { id: string; width: number; height: number; canvasWidth: number }[] = [];
beforeAll(async () => {
  for (const { id } of JAWS) {
    const { data, info } = await sharp(join(import.meta.dirname, `../src/assets/jaws/${id}.webp`))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! <= 32) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    bounds.push({ id, width: right - left + 1, height: bottom - top + 1, canvasWidth: info.width });
  }
});

function show(size: WindowSize, layout: string, level: AgeLevel, language: "en" | "ru" = "en", theme = "light") {
  openWindow(...size);
  const root = document.documentElement;
  const before = { size: root.dataset.size, theme: root.dataset.theme };
  Object.assign(root.dataset, { size: layout, theme });
  onTestFinished(() => {
    for (const key of ["size", "theme"] as const) {
      if (before[key] === undefined) delete root.dataset[key];
      else root.dataset[key] = before[key];
    }
  });
  const count = level === "hatchling" ? 2 : level === "explorer" ? 3 : 4;
  const props: WhoseJawBoardScreenProps = { audioControl: <GameAudioButton language={language} muted={false} onToggle={() => {}} />, language, phase: "waiting",
    choices: JAWS.slice(0, count).map((jaw) => ({ id: jaw.id, name: jaw.name[language].toLocaleUpperCase(language), picture: `${jaw.id}.webp`, food: "food.webp", diet: jaw.diet, mouth: jawMouth(jaw.id) })),
    jawPicture: "jaw.webp", placed: [], target: undefined, hint: undefined, jawDiet: "meat",
    foodShown: level === "hatchling", namesShown: level === "paleontologist", feedback: undefined,
    onNext: vi.fn(), onPlace: vi.fn(), onName: vi.fn(), onSlide: vi.fn(), onBack: vi.fn(), onHome: vi.fn()
  };
  const view = render(<WhoseJawBoardScreen {...props} />, withManualPictures(manualPictures()));
  return { count, props, view };
}

describe("Whose Jaw portrait composition", () => {
  it.each(PORTRAITS.flatMap(([width, height, layout]) => AGE_LEVELS.flatMap((level) =>
    (["en", "ru"] as const).map((language) => ({ size: [width, height] as WindowSize, layout, level, language }))
  )))("keeps the $language $level cards together at $size", ({ size, layout, level, language }) => {
    const { count, props, view } = show(size, layout, level, language);
    const bar = style(".whose-jaw-board-bar", size);
    expect(bar.value("grid-template-columns")).toBe(size[0] < 600 ? "48px minmax(0, 1fr) 48px 48px" : "auto minmax(0, 1fr) auto auto");
    expect(part(".whose-jaw-board-bar").children).toHaveLength(4);
    const audio = style(".game-audio-button", size);
    expect(audio.px("min-width")).toBeGreaterThanOrEqual(48);
    expect(audio.px("min-height")).toBeGreaterThanOrEqual(48);
    expect(part(".game-audio-button").getAttribute("aria-label")).toBe(TEXTS[language].gameAudio.mute);
    if (size[0] < 600) {
      expect(style(".game-audio-button span", size).value("display")).toBe("none");
      expect(style(".whose-jaw-board-bar .home-button span", size).value("display")).toBe("none");
      const socket = style(".jaw-socket", size);
      expect(socket.value("box-sizing")).toBe("border-box");
      const needed = 3 * audio.px("width") + 3 * bar.columnGap() + 5 * socket.px("width") + 4 * style(".jaw-teeth", size).columnGap();
      const page = style(".whose-jaw-board", size);
      expect(needed).toBeLessThanOrEqual(size[0] - page.px("padding-left") - page.px("padding-right"));
    }
    const grid = style(".jaw-choices", size);
    expect(grid.value("grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect([grid.value("flex-grow"), grid.value("flex-shrink"), grid.value("align-items"), grid.value("align-content")]).toEqual(["0", "0", "stretch", "start"]);
    expect([grid.value("width"), grid.value("margin-top"), grid.rowGap()]).toEqual([`min(100%, 680px, ${size[1] * .58}px)`, "0px", 12]);
    expect(document.querySelectorAll(".jaw-dinosaur")).toHaveLength(count);
    const card = style(".jaw-dinosaur", size);
    expect(card.value("box-sizing")).toBe("border-box");
    expect([card.px("padding-top"), card.px("border-top-width"), card.value("border-top-style")]).toEqual([6, 2, "solid"]);
    const art = style(".jaw-dinosaur-art", size);
    expect([art.value("width"), art.value("max-width")]).toEqual(["100%", "none"]);
    expect(style(".jaw-gummy", size).value("height")).toBe("auto");
    if (level === "paleontologist") {
      const name = style(".jaw-name", size);
      expect(name.px("font-size")).toBeGreaterThanOrEqual(16);
      expect(name.px("font-size")).toBeLessThanOrEqual(22);
      expect(name.value("line-height")).toBe("1.2");
      expect(name.px("min-height")).toBeCloseTo(2.4 * name.px("font-size"));
      expect([...document.querySelectorAll(".jaw-name")].every((name) => name.textContent === name.textContent?.toLocaleUpperCase(language))).toBe(true);
    }
    expect(style(".jaw-feedback", size).value("display")).toBe("none");
    const tray = style(".jaw-tray", size);
    expect(tray.value("box-sizing")).toBe("border-box");
    expect([tray.px("min-height"), tray.value("flex-shrink"), tray.value("margin-bottom"), tray.value("width")]).toEqual([0, "0", "0px", "min(100%, 520px)"]);
    const page = style(".whose-jaw-board", size);
    const pageWidth = size[0] - page.px("padding-left") - page.px("padding-right");
    const trayWidth = Math.min(pageWidth, 520);
    const loose = style(".jaw-loose", size);
    expect(loose.value("max-width")).toBe("100%");
    const looseWidth = Math.min(loose.px("width"), trayWidth - 2 * (tray.px("padding-left") + tray.px("border-left-width")));
    expect(style(".jaw-loose-picture", size).value("width")).toBe("100%");
    expect(style(".jaw-loose-picture", size).value("height")).toBe("auto");
    for (const art of bounds) {
      expect(art.width * looseWidth / art.canvasWidth, art.id).toBeGreaterThanOrEqual(260);
      if (size[0] === 390 && art.id === "tyrannosaurus") {
        expect(art.height * looseWidth / art.canvasWidth).toBeGreaterThanOrEqual(200);
        expect(art.height * looseWidth / art.canvasWidth).toBeLessThanOrEqual(250);
      }
    }

    // jsdom has no layout. The budget uses the stylesheet's card frame,
    // the full 4:3 canvas and two lines for names.
    const across = Math.min(pageWidth, 680, size[1] * .58);
    const cardWidth = (across - grid.columnGap()) / 2;
    const artWidth = cardWidth - 2 * (card.px("padding-left") + card.px("border-left-width"));
    const nameHeight = level === "paleontologist" ? style(".jaw-name", size).px("min-height") + style(".jaw-name", size).px("margin-top") : 0;
    const cardHeight = artWidth * .75 + 2 * (card.px("padding-top") + card.px("border-top-width")) + nameHeight;
    const rows = Math.ceil(count / 2);
    const gridHeight = rows * cardHeight + (rows - 1) * grid.rowGap();
    const trayHeight = looseWidth * .75 + 2 * (tray.px("padding-top") + tray.px("border-top-width"));
    expect(style(".jaw-board-title", size).value("line-height")).toBe("1.2");
    const titleHeight = style(".jaw-board-title", size).px("font-size") * 1.2;
    const total = page.px("padding-top") + page.px("padding-bottom") + 56 + titleHeight + gridHeight + trayHeight + 3 * page.rowGap();
    expect(artWidth).toBeGreaterThanOrEqual(size[0] < 390 ? 136 : size[0] < 600 ? 150 : size[0] < 820 ? 270 : 300);
    expect(trayWidth).toBeLessThanOrEqual(pageWidth);
    expect(cardWidth).toBeGreaterThanOrEqual(44);
    expect(cardHeight).toBeGreaterThanOrEqual(44);
    expect(gridHeight + page.px("padding-top") + 56 + titleHeight + 2 * page.rowGap()).toBeLessThan(total - page.px("padding-bottom"));
    expect(total).toBeLessThanOrEqual(size[1]);

    for (const phase of ["right", "reading", "wrong"] as const) {
      const longest = JAWS.reduce((a, b) => a.fact[language].length > b.fact[language].length ? a : b);
      view.rerender(<WhoseJawBoardScreen {...props} phase={phase} target={props.choices[0]!.id}
        feedback={{ words: longest.fact[language], symbol: "🦷" }} />);
      expect(part(".jaw-feedback p").textContent).toContain(longest.fact[language]);
      expect(style(".jaw-loose", size).value("display")).toBe("none");
      const feedback = style(".jaw-feedback", size);
      const words = style(".jaw-feedback p", size);
      expect([feedback.px("min-height"), words.px("padding-top"), words.value("line-height")]).toEqual([48, 8, "1.25"]);
      expect(words.px("font-size")).toBeGreaterThanOrEqual(16);
      expect(words.px("font-size")).toBeLessThanOrEqual(20);
      expect([words.value("box-sizing"), words.value("max-width")]).toEqual(["border-box", "100%"]);
      const wordsWidth = Math.min(pageWidth, 680) - 2 * words.px("padding-left");
      const columns = Math.floor(wordsWidth / words.px("font-size"));
      const next = phase === "wrong" ? undefined : style(".jaw-next", size);
      const nextHeight = next ? Math.max(next.px("min-height"), next.px("font-size") * 1.5 + 2 * next.px("padding-top")) : 0;
      if (next) {
        expect(nextHeight).toBeGreaterThanOrEqual(44);
        expect(part(".jaw-next").hasAttribute("disabled")).toBe(phase !== "reading");
        const nextWidth = part(".jaw-next").textContent!.length * next.px("font-size") + 24 + next.columnGap() + 2 * next.px("padding-left");
        expect(nextWidth).toBeLessThanOrEqual(trayWidth - 2 * (tray.px("padding-left") + tray.px("border-left-width")));
      }
      const feedbackTray = nextHeight + 2 * (tray.px("padding-top") + tray.px("border-top-width"));
      // Budget every fact with one em per glyph and word wrapping. This
      // overestimates the font's advances, including the Russian copy.
      for (const jaw of JAWS) {
        let lines = 1, used = 2;
        for (const word of jaw.fact[language].split(" ")) {
          expect(word.length).toBeLessThanOrEqual(columns);
          if (used + word.length + 1 > columns) { lines++; used = word.length; }
          else used += word.length + 1;
        }
        const feedbackHeight = Math.max(feedback.px("min-height"), lines * words.px("font-size") * 1.25 + 2 * words.px("padding-top"));
        expect(total - trayHeight + feedbackHeight + feedbackTray + page.rowGap(), `${phase} ${jaw.id}`).toBeLessThanOrEqual(size[1]);
      }
    }
  });

  it.each(PORTRAITS)("keeps a visible frame and pickup highlight in dark theme at %i by %i", (width, height, layout) => {
    const size = [width, height] as const;
    show(size, layout, "paleontologist", "en", "dark");
    expect(style(".game-audio-button", size).value("background-color")).toBe("rgb(24, 30, 46)");
    expect(style(".game-audio-button", size).value("color")).toBe("rgb(236, 232, 222)");
    expect(style(".jaw-dinosaur", size).value("background-color")).toBe("rgb(24, 30, 46)");
    expect(style(".jaw-dinosaur", size).value("border-top-color")).toBe("rgb(71, 81, 106)");
    expect(style(".jaw-tray", size).value("background-color")).toBe("rgb(24, 30, 46)");
    expect(style(".jaw-tray", size).value("border-top-style")).toBe("dashed");
    fireEvent.click(part(".jaw-loose"));
    expect(style(".jaw-dinosaur", size).value("border-top-color")).toBe("rgb(227, 155, 45)");
    expect(style(".jaw-dinosaur", size).value("background-color")).toBe("rgba(227, 155, 45, 0.19)");
  });

});

describe("Whose Jaw landscape composition", () => {
  it.each(windowsAnd([1180, 820], [1366, 956]).flatMap((size) => AGE_LEVELS.flatMap((level) =>
    (["en", "ru"] as const).flatMap((language) => ["light", "dark"].map((theme) => ({ size, level, language, theme })))
  )))("bounds the $language $level board at $size in $theme", ({ size, level, language, theme }) => {
    const { count, props, view } = show(size, "wide", level, language, theme);
    expect(style(".whose-jaw-board-bar", size).value("grid-template-columns")).toBe("auto minmax(0, 1fr) auto auto");
    expect(style(".game-audio-button span", size).value("display")).not.toBe("none");
    const grid = style(".jaw-choices", size);
    expect(grid.value("grid-template-columns")).toBe("repeat(var(--choices), minmax(0, 1fr))");
    // Choices keep their natural height, so their top stays beside the title
    // rather than moving toward the centre of an expanding row.
    expect([grid.value("flex-grow"), grid.value("flex-shrink"), grid.value("align-items"), grid.value("align-content")]).toEqual(["0", "0", "stretch", "start"]);
    expect(grid.value("width")).toBe("min(100%, calc(var(--choices) * min(300px, 34vh) + (var(--choices) - 1) * 12px))");
    const page = style(".whose-jaw-board", size);
    const pageWidth = size[0] - page.px("padding-left") - page.px("padding-right");
    const card = style(".jaw-dinosaur", size);
    expect([card.px("border-top-width"), card.value("border-top-style")]).toEqual([2, "solid"]);
    expect(card.value("background-color")).toBe(theme === "dark" ? "rgb(24, 30, 46)" : "rgb(255, 253, 248)");
    expect(style(".jaw-dinosaur-art", size).value("max-width")).toBe("none");
    const cardWidth = Math.min(Math.min(300, size[1] * .34), (pageWidth - (count - 1) * grid.columnGap()) / count);
    const artWidth = cardWidth - 2 * (card.px("padding-left") + card.px("border-left-width"));
    const nameHeight = level === "paleontologist" ? style(".jaw-name", size).px("min-height") + style(".jaw-name", size).px("margin-top") : 0;
    const cardHeight = artWidth * .75 + 2 * (card.px("padding-top") + card.px("border-top-width")) + nameHeight;
    const tray = style(".jaw-tray", size);
    expect([tray.value("width"), tray.px("min-height"), tray.value("border-top-style")]).toEqual(["fit-content", 0, "dashed"]);
    const looseWidth = style(".jaw-loose", size).px("width");
    for (const art of bounds) {
      const visibleWidth = art.width * looseWidth / art.canvasWidth;
      expect(visibleWidth, art.id).toBeGreaterThanOrEqual(size[1] >= 820 ? 320 : 260);
      expect(visibleWidth, art.id).toBeLessThanOrEqual(440);
    }
    expect(style(".jaw-feedback", size).value("display")).toBe("none");
    const barHeight = Math.max(56, style(".jaw-socket", size).px("width") + 2 * style(".jaw-socket", size).px("border-top-width"));
    const throughCards = page.px("padding-top") + barHeight + style(".jaw-board-title", size).px("font-size") * 1.2 + 2 * page.rowGap() + cardHeight;
    const trayHeight = looseWidth * .75 + 2 * (tray.px("padding-top") + tray.px("border-top-width"));
    expect(throughCards + page.rowGap() + tray.px("margin-top") + trayHeight + page.px("padding-bottom")).toBeLessThanOrEqual(size[1]);
    const longest = JAWS.reduce((a, b) => a.fact[language].length > b.fact[language].length ? a : b);
    for (const phase of ["right", "reading", "wrong"] as const) {
      view.rerender(<WhoseJawBoardScreen {...props} phase={phase} target={props.choices[0]!.id} feedback={{ words: longest.fact[language], symbol: "🦷" }} />);
      expect(style(".jaw-loose", size).value("display")).toBe("none");
      const words = style(".jaw-feedback p", size);
      expect(words.value("max-width")).toBe("min(100%, 800px)");
      expect(words.value("line-height")).toBe("1.25");
      const columns = Math.floor((Math.min(pageWidth, 800) - 2 * words.px("padding-left")) / words.px("font-size"));
      // One em per glyph plus wrapping slack bounds the shipped facts.
      const lines = Math.ceil((longest.fact[language].length + 2) / columns) + 1;
      const feedbackHeight = Math.max(64, lines * words.px("font-size") * 1.25 + 2 * words.px("padding-top"));
      const next = phase === "wrong" ? undefined : style(".jaw-next", size);
      const nextHeight = next ? Math.max(next.px("min-height"), 1.5 * next.px("font-size") + 2 * next.px("padding-top")) : 0;
      expect(throughCards + 2 * page.rowGap() + feedbackHeight + tray.px("margin-top") + nextHeight + 2 * (tray.px("padding-top") + tray.px("border-top-width")) + page.px("padding-bottom")).toBeLessThanOrEqual(size[1]);
      if (next) expect(part(".jaw-next").hasAttribute("disabled")).toBe(phase !== "reading");
    }
  });

  it.each(AGE_LEVELS.flatMap((level) => (["en", "ru"] as const).map((language) => ({ level, language }))))("keeps $language $level controls and a side tray on short landscape", ({ level, language }) => {
    const size = [844, 390] as const;
    const { count, props, view } = show(size, "wide-short", level, language);
    expect(style(".whose-jaw-board", size).value("grid-template-areas")).toBe('"bar bar" "title title" "choices tray" "feedback feedback"');
    expect(style(".jaw-choices", size).value("grid-template-columns")).toBe("repeat(var(--choices), minmax(0, 1fr))");
    expect(style(".whose-jaw-board-bar .home-button", size).px("height")).toBeGreaterThanOrEqual(48);
    expect(style(".whose-jaw-board-bar .home-button", size).px("width")).toBeGreaterThanOrEqual(48);
    expect(style(".game-audio-button span", size).value("display")).toBe("none");
    expect(style(".game-audio-button", size).px("min-height")).toBeGreaterThanOrEqual(48);
    expect(style(".jaw-loose", size).px("width")).toBeGreaterThanOrEqual(160);
    const page = style(".whose-jaw-board", size);
    const pageWidth = size[0] - page.px("padding-left") - page.px("padding-right");
    const sideWidth = Math.max(180, pageWidth * .28);
    const choicesWidth = Math.min(pageWidth - sideWidth - page.columnGap(), count * size[1] * .4 + (count - 1) * 12);
    const card = style(".jaw-dinosaur", size);
    const artWidth = (choicesWidth - (count - 1) * 12) / count - 2 * (card.px("padding-left") + card.px("border-left-width"));
    const nameHeight = level === "paleontologist" ? style(".jaw-name", size).px("min-height") + style(".jaw-name", size).px("margin-top") : 0;
    const cardHeight = artWidth * .75 + nameHeight + 2 * (card.px("padding-top") + card.px("border-top-width"));
    const tray = style(".jaw-tray", size);
    const trayHeight = style(".jaw-loose", size).px("width") * .75 + 2 * (tray.px("padding-top") + tray.px("border-top-width"));
    const throughTitle = page.px("padding-top") + 48 + page.rowGap() + style(".jaw-board-title", size).px("font-size") * 1.2;
    expect(throughTitle + page.rowGap() + Math.max(cardHeight, trayHeight) + page.px("padding-bottom")).toBeLessThanOrEqual(size[1]);
    view.rerender(<WhoseJawBoardScreen {...props} phase="reading" target={props.choices[0]!.id} feedback={{ words: JAWS[0]!.fact[language], symbol: "🦷" }} />);
    expect(style(".jaw-loose", size).value("display")).toBe("none");
    expect(style(".jaw-next", size).px("min-height")).toBeGreaterThanOrEqual(48);
    expect(style(".jaw-feedback", size).value("grid-area")).toBe("feedback");
    const words = style(".jaw-feedback p", size);
    const columns = Math.floor((pageWidth - 2 * words.px("padding-left")) / words.px("font-size"));
    const next = style(".jaw-next", size);
    const nextTrayHeight = Math.max(next.px("min-height"), next.px("font-size") * 1.5 + 2 * next.px("padding-top")) + 2 * (tray.px("padding-top") + tray.px("border-top-width"));
    for (const jaw of JAWS) {
      const lines = Math.ceil((jaw.fact[language].length + 2) / columns) + 1;
      const feedbackHeight = Math.max(48, lines * words.px("font-size") * 1.25 + 2 * words.px("padding-top"));
      expect(throughTitle + 2 * page.rowGap() + Math.max(cardHeight, nextTrayHeight) + feedbackHeight + page.px("padding-bottom"), jaw.id).toBeLessThanOrEqual(size[1]);
    }
  });
});
