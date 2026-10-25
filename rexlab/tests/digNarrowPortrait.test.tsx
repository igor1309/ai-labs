import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { twoLines } from "../src/DigBar.tsx";
import { DigRevealScreen } from "../src/DigRevealScreen.tsx";
import { STAR_LANDS } from "../src/digGame.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { board, brushAll, digUp, finishBoard, openDigApp, placeBoard } from "./digApp.tsx";
import { withPictures } from "./pictures.tsx";
import { fakeBodyPicture, homeTile, manualTimers, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// DIG's screens in a tall-narrow window: an iPhone upright.

const NARROW_LAYOUTS: PortraitLayouts = {
  home: ["tall", "tall-narrow"], "dig-board": ["tall", "tall-narrow"], "dig-question": ["tall", "tall-narrow"],
  "dig-reveal": ["tall", "tall-narrow"], "dig-guide": ["tall", "tall-narrow"]
};

const PHONES = [[320, 568], [375, 667], [393, 852], [430, 932]] as const;
const LANGUAGES = ["en", "ru"] as const;

// jsdom has no animation engine: the reveal's parts take no time.
beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: 0 }) } }] });
});
afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "getAnimations");
  delete document.documentElement.dataset.size;
});

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");
// A word's width at `size` pixels, each letter at most 0.75 of its size.
const wordWidth = (words: string, size: number) => words.length * 0.75 * size;

const narrowViewport = () => {
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  return viewport;
};

type Level = "hatchling" | "explorer" | "paleontologist";

function openDig(size: WindowSize, { level = "hatchling" as Level, language = "en" as "en" | "ru", games = {} as object } = {}) {
  openWindow(...size);
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: [], badges: [], ...games } } }) });
  const app = openDigApp({ viewport: narrowViewport(), portraitLayouts: NARROW_LAYOUTS, ageLevel: { level, revision: "parent" }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  return app;
}

// The screen stands upright with its 24, 32 and 20 padding, its parts 16
// apart, HOME and BACK 48-pixel symbols with their words for screen readers.
function phoneScreen(selector: string, size: WindowSize) {
  expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall-narrow", false, false]);
  expect(screen.queryByRole("img", { name: TEXTS.en.turnSideways })).toBeNull();
  const page = styleAt(part(selector), size);
  expect([page.px("padding-top"), page.px("padding-bottom"), page.px("padding-left"), page.px("padding-right"), page.rowGap()]).toEqual([24, 32, 20, 20, 16]);
  // The board's bar, one row of four parts, keeps 4 between them.
  expect(styleAt(part(".dig-bar"), size).columnGap()).toBe(selector === ".dig-board-screen" ? 4 : 8);
  for (const button of all(".dig-bar .home-button")) {
    expect(styleAt(button, size).px("width")).toBe(48);
    expect(button.querySelector(".upright-hidden")?.textContent).toBe(button.textContent);
  }
}

describe("DIG upright on a phone", () => {
  it.each(PHONES.flatMap((size) => LANGUAGES.map((language) => [...size, language] as const)))("stands the board upright at %i by %i in %s, its bar one row over the sand", (width, height, language) => {
    const size: WindowSize = [width, height];
    openDig(size, { level: "paleontologist", language });
    phoneScreen(".dig-board-screen", size);
    const bar = styleAt(part(".dig-board-screen .dig-bar"), size);
    expect([bar.value("flex-wrap"), bar.columnGap()]).toEqual(["nowrap", 4]);
    // The picker's pair, DUG UP and the title's brush leave the bar; the
    // brush menu takes the brush's place, after HOME.
    for (const gone of [".dig-brush-picker", ".dig-chip", ".dig-board-screen .dig-mark"]) expect(styleAt(part(gone), size).value("display"), gone).toBe("none");
    const menu = styleAt(part(".dig-brush-menu"), size);
    expect([menu.value("display"), menu.value("order"), styleAt(part(".dig-bar .home-button"), size).value("order")]).toEqual(["block", "-1", "-2"]);
    // HOME, the menu's button of the brush and the wide brush's dot, and
    // the FIELD GUIDE with a count of three digits, each at most Lexend's
    // widest 0.68 em, leave the title its room.
    const button = styleAt(part(".dig-brush-menu .parent-menu-button"), size);
    const face = styleAt(part(".dig-brush-menu .parent-menu-face"), size);
    expect([button.px("height"), button.px("padding-left"), button.px("padding-right")]).toEqual([48, 8, 8]);
    const menuWidth = 2 * 8 + 24 + face.columnGap() + 14;
    const guide = styleAt(part(".dig-field-guide-button"), size);
    expect([guide.px("height"), guide.px("font-size")]).toEqual([48, 18]);
    const guideWidth = 2 * guide.px("padding-left") + 26 + guide.columnGap() + 3 * 0.68 * 18;
    const room = width - 40 - 48 - menuWidth - guideWidth - 3 * bar.columnGap();
    // Each title on its two lines at most, as large as its longer line
    // lets it, at least 12 pixels.
    const words = styleAt(part(".dig-board-screen .dig-title-words"), size);
    expect([words.value("white-space"), words.value("font-size")]).toEqual(["normal", "min(28px, 46px / (var(--lines) * 1.05), 100cqi / (var(--line-letters) * 0.75))"]);
    for (const title of [TEXTS[language].dig, TEXTS[language].whoIsIt]) {
      const lines = twoLines(title);
      const type = Math.min(28, 46 / (lines.length * 1.05), room / (Math.max(...lines.map((line) => line.length)) * 0.75));
      expect(type, title).toBeGreaterThanOrEqual(12);
      expect(lines.length * 1.05 * type).toBeLessThanOrEqual(48);
    }
    expect(styleAt(board(), size).value("touch-action")).toBe("none");
  });

  it.each(PHONES.flatMap((size) => (["explorer", "paleontologist"] as const).map((level) => [...size, level] as const)))("asks WHO IS IT? at %i by %i at %s, the dinosaurs two to a row under the sand", (width, height, level) => {
    const size: WindowSize = [width, height];
    openDig(size, { level });
    phoneScreen(".dig-board-screen", size);
    expect(styleAt(part(".dig-board-screen .dig-body[data-asks]"), size).value("flex-direction")).toBe("column");
    const cards = styleAt(part(".dig-choice-cards"), size);
    expect([cards.value("display"), cards.value("grid-template-columns"), cards.columnGap(), cards.rowGap()]).toEqual(["grid", "repeat(2, minmax(0, 1fr))", 12, 12]);
    const count = level === "explorer" ? 3 : 4;
    const slots = all(".dig-choice-slot");
    expect(slots).toHaveLength(count);
    for (const slot of slots) expect(styleAt(slot, size).value("aspect-ratio")).toBe("10 / 9");
    // Three put the third alone on its row, centred, as wide as the rest.
    const last = styleAt(slots.at(-1)!, size);
    const alone = [last.value("grid-column"), last.value("justify-self"), last.value("width")];
    if (count === 3) expect(alone).toEqual(["1 / -1", "center", "calc(0.5 * (100% - 12px))"]);
    else expect(alone[0]).not.toBe("1 / -1");
    // The sand takes what two rows of cards leave, at least 160 wide,
    // under the bar's one row of 48.
    expect(styleAt(board(), size).value("width")).toBe("min(100cqw, (100cqh - 12px - ((100cqw - 12px) * 0.9 + 12px)) * var(--frame-width) / var(--frame-height))");
    const column = width - 40;
    const rows = (column - 12) * 0.9 + 12;
    const body = height - 24 - 32 - 48 - 16;
    expect(Math.min(column, (body - 12 - rows) * 800 / 600)).toBeGreaterThanOrEqual(160);
    expect((column - 12) / 2).toBeGreaterThanOrEqual(134);
  });

  it.each(LANGUAGES)("keeps every %s name of the question on one line, at least 12 pixels, at 320 wide", (language) => {
    const size: WindowSize = [320, 568];
    openDig(size, { level: "paleontologist", language });
    brushAll();
    const cards = all(".dig-choice-card");
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      const name = card.querySelector<HTMLElement>(".dig-choice-name")!;
      const own = styleAt(name, size);
      expect([own.value("white-space"), own.value("font-size")]).toEqual(["nowrap", "min(16px, calc(100cqi / (var(--letters) * 0.75)))"]);
      const style = styleAt(card, size);
      expect([style.value("flex-direction"), style.px("padding-left"), style.px("padding-right")]).toEqual(["column", 2, 2]);
      // The card's content: half of 280 less the 12 gap, less its 2 × 2
      // border and 2 × 2 padding.
      const letters = Number(name.style.getPropertyValue("--letters"));
      expect(Math.min(16, 126 / (letters * 0.75)), name.textContent ?? "").toBeGreaterThanOrEqual(12);
    }
  });

  it.each(PHONES.flatMap((size) => LANGUAGES.map((language) => [...size, language] as const)))("stands the FIELD GUIDE upright at %i by %i in %s, its five cards one over another", (width, height, language) => {
    const size: WindowSize = [width, height];
    openDig(size, { language, games: { treasures: { shell: 1, tooth: 2, amber: 1, "egg-nest": 1, "golden-fossil": 12 } } });
    fireEvent.click(screen.getByRole("button", { name: TEXTS[language].fieldGuide }));
    phoneScreen(".dig-field-guide-screen", size);
    expect(styleAt(part(".dig-field-guide-screen .dig-title-words"), size).value("position")).toBe("absolute");
    const room = styleAt(part(".dig-guide-cards"), size);
    expect([room.value("flex-direction"), room.value("flex-wrap"), room.rowGap()]).toEqual(["column", "nowrap", 8]);
    const cards = all(".dig-guide-card");
    expect(cards).toHaveLength(5);
    for (const card of cards) expect([styleAt(card, size).value("flex-direction"), styleAt(card, size).value("flex-basis")]).toEqual(["row", "0px"]);
    // Each card a fifth of what the bar leaves, at least 56 tall.
    expect((height - 24 - 32 - 52 - 16 - 4 * 8) / 5).toBeGreaterThanOrEqual(56);
    // A name beside its picture of at most 72 and its count of up to two
    // digits at 24, 12 apart: the longest word at its size fits what they
    // leave, in a card of 2 × 12 padding and 2 × 1 border.
    for (const name of all(".dig-guide-name")) expect(styleAt(name, size).value("font-size")).toBe("min(22px, 0.11904761904761904 * (100cqi - 152px))");
    expect(Math.min(22, (width - 40 - 2 - 24 - 152) / 8.4)).toBeGreaterThanOrEqual(12);
    expect(72 + 12 + 12 + 3 * 0.75 * 24).toBeLessThanOrEqual(152);
    expect(all(".dig-guide-name").map((name) => name.textContent)).toEqual(Object.values(TEXTS[language].treasures));
  });

  it.each(PHONES.flatMap((size) => LANGUAGES.map((language) => [...size, language] as const)))("stands the reveal upright at %i by %i in %s, scrolling rather than shrink its dinosaur", (width, height, language) => {
    const size: WindowSize = [width, height];
    const app = openDig(size, { language });
    placeBoard(800);
    digUp();
    finishBoard(app.timers);
    act(() => app.timers.fire(STAR_LANDS.motion));
    phoneScreen(".dig-reveal-screen", size);
    const page = styleAt(part(".dig-reveal-screen"), size);
    expect([page.value("height"), page.px("min-height"), page.value("overflow")]).toEqual(["auto", height, "visible"]);
    expect(styleAt(part(".dig-reveal"), size).value("flex-direction")).toBe("column");
    expect(styleAt(part(".dig-reveal-art"), size).value("flex-basis")).toBe("140px");
    const text = TEXTS[language];
    for (const name of all(".level-switch-name")) expect(styleAt(name, size).value("position")).toBe("absolute");
    for (const name of [text.digAgain, text.home]) {
      const own = styleAt(screen.getByRole("button", { name }), size);
      expect([own.px("height"), own.value("white-space"), own.value("width")]).toEqual([64, "nowrap", "100%"]);
      expect(own.px("padding-left") + own.px("padding-right") + 28 + own.columnGap() + wordWidth(name, own.px("font-size")), name).toBeLessThanOrEqual(width - 40);
    }
  });

  // DUG UP as full as it gets: the last dinosaur, new, with the trophy and
  // the badge. Its parts go in rows, each part where the one before it
  // leaves room, and take two rows at most.
  it.each(PHONES.flatMap((size) => LANGUAGES.flatMap((language) => [[...size, language, false], [...size, language, true]] as const)))("fits DUG UP at %i by %i in %s in two rows, the last dinosaur %s", (width, height, language, fullest) => {
    const size: WindowSize = [width, height];
    openWindow(...size);
    document.documentElement.dataset.size = "tall-narrow";
    const text = TEXTS[language];
    render(
      <DigRevealScreen language={language} name="TRICERATOPS" picture={fakeBodyPicture("triceratops")} dugUp={fullest ? 52 : 1} total={52} treasures={128} celebration={null}
        newStar badge={fullest} landed startTimer={manualTimers().startTimer} landingWait={STAR_LANDS.motion} onLanded={() => {}}
        level="paleontologist" onLevel={() => {}} onDigAgain={() => {}} onHome={() => {}} />,
      withPictures
    );
    const card = part(".dig-card");
    const own = styleAt(card, size);
    expect([own.value("flex-wrap"), own.value("height"), own.px("min-height"), own.px("font-size")]).toEqual(["wrap", "auto", 60, 18]);
    const widthOf = (item: HTMLElement) => {
      const style = styleAt(item, size);
      if (item.matches(".dig-card-star, .level-badge")) return style.px("width");
      if (item.matches(".dig-card-trophy")) return 30;
      const letters = item.textContent ?? "";
      const type = style.px("font-size") || own.px("font-size");
      return letters.length * (0.75 * type + style.px("letter-spacing"));
    };
    const items = [...card.children] as HTMLElement[];
    expect(items).toHaveLength(fullest ? 6 : 4);
    const room = width - 40 - own.px("padding-left") - own.px("padding-right");
    const rows: number[] = [];
    for (const item of items) {
      const wide = widthOf(item);
      expect(wide, item.className).toBeLessThanOrEqual(room);
      const last = rows.length - 1;
      if (last >= 0 && rows[last]! + own.columnGap() + wide <= room) rows[last] = rows[last]! + own.columnGap() + wide;
      else rows.push(wide);
    }
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(card.textContent).toContain(fullest ? "52/52" : "1/52");
  });

  it("takes the phone's sizes as a tall window narrows over the board, asking nothing", () => {
    openWindow(820, 1180);
    const viewport = manualViewport("portrait");
    openDigApp({ viewport, portraitLayouts: NARROW_LAYOUTS, ageLevel: { level: "hatchling", revision: "parent" } });
    fireEvent.click(homeTile(TEXTS.en.dig));
    const sand = board();
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([document.documentElement.dataset.size, gateShown(), board()]).toEqual(["tall-narrow", false, sand]);
    phoneScreen(".dig-board-screen", [393, 852]);
  });
});
