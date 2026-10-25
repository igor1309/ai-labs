import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { nameLines } from "../src/DigBoardScreen.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { board, cleared, drag, openDigApp, placeBoard, roundDinosaur, wrongCards } from "./digApp.tsx";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { SHIPPED_DIG, SHIPPED_DINOSAURS, homeTile, manualViewport, memoryStorage } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// DIG's WHO IS IT? on an iPhone on its side, full screen: the smallest,
// two common ones and the largest, each with its insets.
const PHONES = [
  [568, 320, { top: 0, right: 0, bottom: 0, left: 0 }],
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]
] as const;
const LANGUAGES = ["en", "ru"] as const;
const LEVELS = ["explorer", "paleontologist"] as const;
const EVERY = PHONES.flatMap((phone) => LEVELS.flatMap((level) => LANGUAGES.map((language) => [phone[0], phone[1], level, language, phone[2]] as const)));

const LAYOUTS: PortraitLayouts = { home: ["tall", "tall-narrow"], "dig-board": ["tall", "tall-narrow"] };

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

function openBoard(size: WindowSize, insets: SafeArea, level: (typeof LEVELS)[number], language: "en" | "ru" = "en") {
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
  const app = openDigApp({ viewport, portraitLayouts: LAYOUTS, ageLevel: { level, revision: "parent" }, storage, language });
  fireEvent.click(homeTile(TEXTS[language].dig));
  return { ...app, viewport };
}

// The room under the bar: the window less 20 at each side past its
// inset, 8 above, 12 below past the home indicator, the bar's 48 and 8.
// Brushes the sand row by row until the question asks, at three quarters
// of the dinosaur.
function brushUntilAsked() {
  placeBoard(800);
  let time = 0;
  for (let y = 10; y < 600 && cleared() < 0.75; y += 20) drag([[0, y], [800, y]], (time += 1000));
}

const roomOf = (width: number, height: number, insets: SafeArea) => [width - 40 - insets.left - insets.right, height - 8 - 48 - 8 - 12 - insets.bottom] as const;

describe("DIG's WHO IS IT? in a wide-short window", () => {
  it.each(EVERY)("puts the sand on the left and the cards stacked on its right at %i by %i at %s in %s", (width, height, level, language, insets) => {
    const size: WindowSize = [width, height];
    openBoard(size, insets, level, language);
    expect(document.documentElement.dataset.size).toBe("wide-short");
    const body = styleAt(part(".dig-body[data-asks]"), size);
    expect([body.value("container-type"), body.value("flex-direction") || "row", body.columnGap()]).toEqual(["size", "row", 12]);
    // The sand's size is set before the cards come, so it never moves.
    const sand = styleAt(board(), size);
    expect([sand.value("flex").replace("0px", "0"), sand.value("width"), sand.value("height"), sand.value("max-height")]).toEqual(["0 0 auto", "min(100cqw - 228px, 100cqh * var(--frame-width) / var(--frame-height))", "auto", "none"]);
    // The column holds its room before the question too.
    const room = () => {
      const style = styleAt(part(".dig-choice-cards"), size);
      return [style.value("flex"), style.value("align-self"), style.columnGap(), styleAt(part(".dig-body[data-asks]"), size).columnGap()];
    };
    const before = room();
    expect(part(".dig-choice-cards").getAttribute("aria-hidden")).toBe("true");
    brushUntilAsked();
    expect(room()).toEqual(before);
    const column = styleAt(part(".dig-choice-cards"), size);
    expect([column.value("flex").replace("0px", "0"), column.value("flex-direction"), column.value("justify-content"), column.value("overflow-y"), column.rowGap()]).toEqual(["0 0 216px", "column", "safe center", "auto", 8]);
    const count = level === "explorer" ? 3 : 4;
    const slots = all(".dig-choice-slot");
    expect(slots).toHaveLength(count);
    for (const slot of slots) expect([styleAt(slot, size).value("flex"), styleAt(slot, size).value("min-height"), styleAt(slot, size).value("max-height")]).toEqual(["1 0 44px", "44px", "72px"]);
    for (const card of all(".dig-choice-card")) {
      const style = styleAt(card, size);
      expect([style.value("flex-direction"), style.value("align-items"), style.px("padding-left"), style.columnGap()]).toEqual(["row", "center", 8, 8]);
      // The dinosaur fills the card's height, its base height of 0 left
      // to the column cards of larger windows.
      const picture = styleAt(card.querySelector<HTMLElement>(".dig-choice-picture")!, size);
      expect([picture.value("flex").replace("0px", "0"), picture.value("width"), picture.value("height")]).toEqual(["0 0 56px", "56px", "100%"]);
    }
    // Each card at least 44 tall in the room under the bar, and the sand
    // at least 220 wide beside the column.
    const [roomWidth, roomHeight] = roomOf(width, height, insets);
    expect(Math.min(72, (roomHeight - (count - 1) * 8) / count)).toBeGreaterThanOrEqual(44);
    expect(Math.min(roomWidth - 228, (roomHeight * 4) / 3)).toBeGreaterThanOrEqual(220);
  });

  // A card's name has the column's 216 less the card's 2 × 2 border,
  // 2 × 8 padding, its 56 picture and 8 gap: 132. The smallest card,
  // four in the 568 by 320 window's 244 under the bar, is 55 tall.
  it.each(LANGUAGES)("fits every %s name DIG asks about, at least 12 pixels, a long one on two lines inside the smallest card", (language) => {
    openBoard([568, 320], PHONES[0][2], "paleontologist", language);
    brushUntilAsked();
    const name = styleAt(part(".dig-choice-name"), [568, 320]);
    expect([name.value("font-size"), name.value("text-align")]).toEqual(["min(16px, calc((100cqi - 64px) / (var(--line-letters) * 0.75)))", "start"]);
    // A long name's hyphen and break, placed in a card on the board,
    // show, so it stands on two lines.
    const nameOf = part(".dig-choice-name");
    const hyphen = Object.assign(document.createElement("span"), { className: "dig-choice-hyphen" });
    const lineBreak = Object.assign(document.createElement("br"), { className: "dig-choice-break" });
    nameOf.append(hyphen, lineBreak);
    expect([styleAt(hyphen, [568, 320]).value("display"), styleAt(lineBreak, [568, 320]).value("display")]).toEqual(["inline", "inline"]);
    // The name's room from the card as styled: the column less its border,
    // padding, picture and gap.
    const card = styleAt(part(".dig-choice-card"), [568, 320]);
    const pictureWidth = styleAt(part(".dig-choice-picture"), [568, 320]).px("width");
    const room = 216 - card.px("border-left-width") - card.px("border-right-width") - card.px("padding-left") - card.px("padding-right") - pictureWidth - card.columnGap();
    expect(room).toBe(132);
    const vertical = card.px("border-top-width") + card.px("border-bottom-width") + card.px("padding-top") + card.px("padding-bottom");
    const names = SHIPPED_DIG.map(({ id }) => SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === id)!.name[language].toLocaleUpperCase(language));
    for (const each of names) {
      const lines = nameLines(each);
      const type = Math.min(16, room / (Math.max(...lines.map((line) => line.length)) * 0.75));
      expect(type, each).toBeGreaterThanOrEqual(12);
      // Both lines inside the smallest card, less its border and padding.
      expect(lines.length * 1.1 * type, each).toBeLessThanOrEqual((244 - 3 * 8) / 4 - vertical);
    }
  });

  // Safari's toolbars, or a shorter window, leave less than four cards of
  // 44 need: each keeps its 44, and the column scrolls instead of the page.
  it.each([[667, 220], [568, 212]] as const)("keeps every card at least 44 tall at %i by %i, the column scrolling on its own", (width, height) => {
    const size: WindowSize = [width, height];
    openBoard(size, PHONES[0][2], "paleontologist");
    brushUntilAsked();
    expect(document.documentElement.dataset.size).toBe("wide-short");
    const [, roomHeight] = roomOf(width, height, PHONES[0][2]);
    expect(4 * 44 + 3 * 8).toBeGreaterThan(roomHeight);
    for (const slot of all(".dig-choice-slot")) expect(styleAt(slot, size).px("min-height")).toBe(44);
    const column = styleAt(part(".dig-choice-cards"), size);
    expect([column.value("overflow-y"), column.value("overscroll-behavior"), column.value("justify-content")]).toEqual(["auto", "none", "safe center"]);
    expect(styleAt(part(".dig-board-screen"), size).value("overflow")).toBe("hidden");
  });

  it("marks a wrong pick inside its card and the right one in its corner", () => {
    const size: WindowSize = [667, 375];
    openBoard(size, PHONES[1][2], "explorer");
    brushUntilAsked();
    fireEvent.click(wrongCards()[0]!);
    const rejected = styleAt(part(".dig-choice-mark-rejected"), size);
    expect([rejected.value("inset"), rejected.px("min-height"), rejected.px("font-size")]).toEqual(["4px", 0, 13]);
    fireEvent.click(document.querySelector<HTMLElement>(`.dig-choice-card[data-choice="${roundDinosaur().id}"]`)!);
    const correct = styleAt(part(".dig-choice-mark-correct"), size);
    expect([correct.px("top"), correct.px("right"), correct.px("min-height"), correct.px("font-size")]).toEqual([4, 4, 28, 18]);
  });

  it("keeps the round and its cards when the phone turns upright mid-question and back", () => {
    const { viewport } = openBoard([852, 393], PHONES[2][2], "paleontologist");
    brushUntilAsked();
    const dinosaur = roundDinosaur().id;
    fireEvent.click(wrongCards()[0]!);
    const cards = () => all(".dig-choice-card").map((card) => [card.dataset.choice, card.hasAttribute("data-rejected")]);
    const before = cards();
    act(() => viewport.resize("tall-narrow", true));
    openWindow(393, 852);
    expect([document.documentElement.dataset.size, roundDinosaur().id, cards()]).toEqual(["tall-narrow", dinosaur, before]);
    act(() => viewport.resize("wide-short", false));
    openWindow(852, 393);
    expect([roundDinosaur().id, cards()]).toEqual([dinosaur, before]);
    expect(screen.getAllByRole("button").some((button) => button.dataset.choice === dinosaur)).toBe(true);
  });
});
