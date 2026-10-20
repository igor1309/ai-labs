import { act, render, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  featuring,
  lightDevice,
  loadedPictures,
  manualViewport,
  seededRandom,
  tilesRow,
  unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// home-portrait.feature, "The home page stands upright": each window,
// with the large card's height, the row's, every column's width, how much
// of the column after the last whole one shows, and whether the page
// scrolls.
const UPRIGHT = [
  [600, 800, 280, 360, 310, 210, true],
  [768, 950, 298, 360, 310, 44, false],
  [768, 1024, 363, 369, 310, 44, false],
  [744, 1060, 386, 382, 308, 24, false],
  [744, 1133, 433, 408, 308, 24, false],
  [834, 1194, 472, 430, 310, 110, false],
  [1032, 1376, 589, 495, 293, 25, false],
  [900, 1000, 348, 360, 310, 176, false],
  [712, 1000, 348, 360, 292, 24, false],
  [600, 1400, 604, 504, 310, 210, false],
  [1068, 1500, 688, 520, 305, 25, false],
  [1400, 1500, 688, 520, 310, 0, false]
] as const;

// An iPad mini upright, home-portrait.feature's "Safe areas stay clear
// upright": its rounded corners under the status bar, and its home
// indicator. An iPad upright has no inset at its sides.
const IPAD_MINI_UPRIGHT: SafeArea = { top: 24, right: 0, bottom: 20, left: 0 };

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

// The home page in a tall window `width` by `height`, its large card
// COMPARE's, with the static page's version footer outside the app.
function openUpright(width: number, height: number) {
  openWindow(width, height);
  const footer = Object.assign(document.createElement("footer"), { id: "version" });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const viewport = manualViewport("portrait");
  render(
    <App
      {...featuring("compare")}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(7)}
      portraitLayouts={{ home: ["tall"] }}
      viewport={viewport}
      progress={emptyProgress()}
      {...englishDevice()}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      {...loadedPictures()}
    />
  );
  return { viewport };
}

// The upright page as the browser lays it out from the stylesheet: a
// column of the greeting and the games, the games a column of the large
// card over the row, the large card growing into the height the rest
// leaves, from nothing to at least its least height. A size set any
// other way fails here, since this sum would not see it.
function uprightLayout(size: WindowSize) {
  const [width, height] = size;
  const home = part(".home");
  const greeting = part(".greeting");
  const games = part(".games");
  const card = featuredCard();
  const row = tilesRow();
  const [homeStyle, gamesStyle, cardStyle, rowStyle] = [home, games, card, row].map((element) => getComputedStyle(element));
  if (!homeStyle || !gamesStyle || !cardStyle || !rowStyle) throw new Error("No style for the page");
  const inFlow = (child: Element) => getComputedStyle(child).position === "static" && getComputedStyle(child).display !== "contents";
  expect([...home.children].filter(inFlow)).toEqual([greeting, games]);
  expect([...home.querySelectorAll(".stratum")].map((band) => getComputedStyle(band).position)).toEqual(["absolute", "absolute", "absolute"]);
  expect([...games.children]).toEqual([card, row]);
  expect([homeStyle.display, homeStyle.flexDirection, px(homeStyle.minHeight)]).toEqual(["flex", "column", height]);
  expect([gamesStyle.display, gamesStyle.flexDirection, gamesStyle.flexGrow, gamesStyle.height]).toEqual(["flex", "column", "1", "auto"]);
  expect([cardStyle.flexGrow, cardStyle.flexBasis, cardStyle.height, rowStyle.flexGrow, rowStyle.flexShrink]).toEqual(["1", "0px", "auto", "0", "0"]);
  // The row reaches past the games above and below by as much as its
  // own padding, which keeps the tiles' shadows.
  expect(px(rowStyle.marginTop) + px(rowStyle.paddingTop)).toBe(0);
  expect(px(rowStyle.marginBottom) + px(rowStyle.paddingBottom)).toBe(0);

  const top = px(homeStyle.paddingTop);
  const bottom = px(homeStyle.paddingBottom);
  const rowHeight = px(rowStyle.height);
  const rest = top + px(getComputedStyle(greeting).lineHeight) + styleAt(home, size).rowGap() + styleAt(games, size).rowGap() + rowHeight + bottom;
  const cardHeight = Math.max(px(cardStyle.minHeight), height - rest);
  // The row runs from the page's padding to its margin past the page's
  // other side.
  const rowStart = px(homeStyle.paddingLeft);
  const rowEnd = width - px(homeStyle.paddingRight) - px(rowStyle.marginRight);
  const shown = rowEnd - rowStart - px(rowStyle.paddingLeft) - px(rowStyle.paddingRight);
  const columnValue = styleAt(row, size).value("grid-auto-columns");
  expect(columnValue).toMatch(/^[\d.]+px$/);
  const column = px(columnValue);
  const gap = styleAt(row, size).columnGap();
  const columns = Math.ceil(row.children.length / 2);
  const whole = Math.floor((shown + gap) / (column + gap));
  return {
    card: { width: width - px(homeStyle.paddingLeft) - px(homeStyle.paddingRight), height: cardHeight },
    row: { height: rowHeight, start: rowStart, end: rowEnd, rows: rowStyle.gridTemplateRows, rowGap: styleAt(row, size).rowGap() },
    column,
    peek: whole >= columns ? 0 : shown - whole * (column + gap),
    page: rest + cardHeight,
    tilesEnd: bottom
  };
}

// Where a part fixed or placed against the page's edges stands, by its
// offsets and its own height.
const placed = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return { position: style.position, top: px(style.top), right: px(style.right), bottom: px(style.bottom), left: px(style.left), height: px(style.height) };
};

describe("the home page upright", () => {
  it.each(UPRIGHT)(
    "in a %i by %i window: the large card %i tall across the width, the row %i tall, columns %i wide with %i of the next showing, and the page scrolling: %s",
    (width, height, cardHeight, rowHeight, column, peek, scrolls) => {
      openUpright(width, height);
      const layout = uprightLayout([width, height]);

      expect(document.querySelector(".orientation-gate")?.hasAttribute("data-shown")).toBe(false);
      expect(Math.abs(layout.card.height - cardHeight)).toBeLessThanOrEqual(1);
      expect(layout.card.width).toBe(width - 112);
      expect([...featuredCard().querySelectorAll(".face-off-picture")].map((picture) => getComputedStyle(picture).objectFit)).toEqual(["contain", "contain"]);
      expect(Math.abs(layout.row.height - rowHeight)).toBeLessThanOrEqual(1);
      expect([layout.row.start, layout.row.end]).toEqual([56, width]);
      // Every tile is half of the row, less the gap between the two.
      expect([layout.row.rows, layout.row.rowGap]).toEqual(["minmax(0, 1fr) minmax(0, 1fr)", 28]);
      expect(
        [...tilesRow().children].slice(0, 2).map((tile) => within(tile as HTMLElement).queryByText(/ALL DINOSAURS|FIND THE PAIR/)?.textContent)
      ).toEqual(["ALL DINOSAURS", "FIND THE PAIR"]);
      expect(Math.abs(layout.column - column)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.peek - peek)).toBeLessThanOrEqual(1);
      expect(layout.page > height).toBe(scrolls);
    }
  );

  it.each(UPRIGHT.map(([width, height]) => [width, height] as const))(
    "in a %i by %i window stands RexLab and the corner on one line over the greeting, and the version footer over no tile, all scrolling with the page",
    (width, height) => {
      openUpright(width, height);
      const layout = uprightLayout([width, height]);
      const wordmark = placed(part(".wordmark"));
      const corner = placed(part(".home-corner"));
      const museum = placed(part(".home-museum"));
      const footer = placed(part("#version"));
      const greetingTop = px(getComputedStyle(part(".home")).paddingTop);

      expect([wordmark.position, corner.position, footer.position, getComputedStyle(document.body).position]).toEqual(["absolute", "absolute", "absolute", "relative"]);
      expect([getComputedStyle(part(".home-corner")).display, getComputedStyle(part(".home-corner")).alignItems]).toEqual(["flex", "center"]);
      // The corner is as tall as the museum, its tallest part.
      expect(wordmark.top + wordmark.height / 2).toBe(corner.top + museum.height / 2);
      expect(Math.max(wordmark.top + wordmark.height, corner.top + museum.height)).toBeLessThanOrEqual(greetingTop);
      // A line of the footer's small words is less than twice their size.
      expect(footer.bottom + 2 * px(getComputedStyle(part("#version")).fontSize)).toBeLessThanOrEqual(layout.tilesEnd);
    }
  );

  it("narrows its columns anew as the window is resized, and widens them back", () => {
    const { viewport } = openUpright(834, 1194);
    const column = () => uprightLayout([window.innerWidth, window.innerHeight]).column;
    expect(column()).toBe(310);

    openWindow(744, 1133);
    act(() => viewport.resize("tall", true));
    expect(column()).toBe(308);

    openWindow(1032, 1376);
    act(() => viewport.resize("tall", true));
    expect(column()).toBe(293);

    openWindow(834, 1194);
    act(() => viewport.resize("tall", true));
    expect(column()).toBe(310);
  });

  it("keeps clear of an iPad mini's safe areas at 744 by 1133, the large card shorter by them, the page still, and its background at the window's edges", () => {
    openUpright(744, 1133);
    const home = part(".home");
    const measure = () => {
      const style = getComputedStyle(home);
      return {
        layout: uprightLayout([744, 1133]),
        padding: { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) },
        box: [style.margin, style.boxSizing, style.width, style.minHeight, style.position],
        wordmark: placed(part(".wordmark")),
        corner: placed(part(".home-corner")),
        footer: placed(part("#version"))
      };
    };
    const without = measure();
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(IPAD_MINI_UPRIGHT) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());

    const inset = measure();

    expect(inset.layout.card.height).toBe(without.layout.card.height - IPAD_MINI_UPRIGHT.top - IPAD_MINI_UPRIGHT.bottom);
    expect(inset.layout.page).toBe(1133);
    expect(inset.box).toEqual(without.box);
    // The large card, the greeting and the tiles keep inside the page's
    // padding, which adds each inset to its own.
    expect([inset.padding.top - without.padding.top, inset.padding.right - without.padding.right, inset.padding.bottom - without.padding.bottom, inset.padding.left - without.padding.left]).toEqual([
      IPAD_MINI_UPRIGHT.top,
      IPAD_MINI_UPRIGHT.right,
      IPAD_MINI_UPRIGHT.bottom,
      IPAD_MINI_UPRIGHT.left
    ]);
    expect([inset.layout.row.start, 744 - inset.layout.row.end]).toEqual([56 + IPAD_MINI_UPRIGHT.left, IPAD_MINI_UPRIGHT.right]);
    expect([inset.wordmark.top - without.wordmark.top, inset.corner.top - without.corner.top, inset.footer.bottom - without.footer.bottom]).toEqual([
      IPAD_MINI_UPRIGHT.top,
      IPAD_MINI_UPRIGHT.top,
      IPAD_MINI_UPRIGHT.bottom
    ]);
    expect([inset.layout.column, inset.layout.peek]).toEqual([without.layout.column, without.layout.peek]);
  });
});
