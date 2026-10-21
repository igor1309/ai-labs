import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import { HOME_GAMES, type HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { topLine } from "./homeCorner.ts";
import { TILE_COUNTS, TITLE_EMS, gamesWidths, linesOf, roomFor, tileTitles, widthOf } from "./homeTitles.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { openMenu, outsideMenu } from "./menus.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DIG,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  featuring,
  lightDevice,
  loadedPictures,
  manualViewport,
  memoryStorage,
  seededRandom,
  tilesRow,
  unsetAgeLevel,
  type ManualViewport,
  type MemoryStorage
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

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

// The home page in a window `width` by `height`, its large card
// `featured`'s, in `language`, with the progress `storage` keeps, upright
// unless `viewport` stands otherwise, and with the static page's version
// footer outside the app.
function openUpright(
  width: number,
  height: number,
  { language = "en", featured = "compare", storage = memoryStorage(), viewport = manualViewport("portrait") }: { language?: Language; featured?: HomeGame; storage?: MemoryStorage; viewport?: ManualViewport } = {}
) {
  openWindow(width, height);
  const footer = Object.assign(document.createElement("footer"), { id: "version" });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const progress = () => storage;
  render(
    <App
      {...featuring(featured)}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(7)}
      portraitLayouts={{ home: ["tall"] }}
      viewport={viewport}
      progress={localProgress(progress)}
      {...englishDevice()}
      deviceLanguage={DEVICES[language]}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...emptyCare()}
      careProgress={localCareProgress(progress)}
      {...emptySorting()}
      sortingProgress={localSortingProgress(progress)}
      {...emptyPairs()}
      pairsProgress={localPairsProgress(progress)}
      {...emptySkeletons()}
      skeletonProgress={localSkeletonProgress(progress)}
      {...emptyDig()}
      digProgress={localDigProgress(progress)}
      {...loadedPictures()}
    />
  );
  return { viewport, user: userEvent.setup() };
}

type Side = "Top" | "Right" | "Bottom" | "Left";

// A length the sum counts, in pixels, or `unset` where none is set. A
// length it cannot count fails here, since the sum would not see it.
function length(value: string, unset: number) {
  if (value === "none" || value === "auto") return unset;
  if (!/^-?[\d.]+(px)?$/.test(value)) throw new Error(`The upright sum cannot count ${value}`);
  return px(value);
}

const margins = (style: CSSStyleDeclaration, ...sides: Side[]) => sides.reduce((sum, side) => sum + length(style[`margin${side}`], 0), 0);
const insides = (style: CSSStyleDeclaration, ...sides: Side[]) => sides.reduce((sum, side) => sum + length(style[`padding${side}`], 0) + length(style[`border${side}Width`], 0), 0);

// The height a part's least and most heights leave of `outer`, the
// height with its paddings and borders it would take. Each counts them
// too where its box is its content's.
function heightWithin(style: CSSStyleDeclaration, outer: number) {
  const box = style.boxSizing === "border-box" ? 0 : insides(style, "Top", "Bottom");
  return Math.max(length(style.minHeight, 0) + box, Math.min(length(style.maxHeight, Infinity) + box, outer));
}

// The upright page as the browser lays it out from the stylesheet: a
// column of the greeting and the games, the games a column of the large
// card over the row, the large card growing into the height the rest
// leaves, from nothing to at least its least height. Each part's
// margins, paddings, borders and least and most heights are counted, so
// a size set any other way fails here, since this sum would not see it.
function uprightLayout(size: WindowSize) {
  const [width, height] = size;
  const home = part(".home");
  const greeting = part(".greeting");
  const games = part(".games");
  const card = featuredCard();
  const row = tilesRow();
  const [homeStyle, greetingStyle, gamesStyle, cardStyle, rowStyle] = [home, greeting, games, card, row].map((element) => getComputedStyle(element));
  if (!homeStyle || !greetingStyle || !gamesStyle || !cardStyle || !rowStyle) throw new Error("No style for the page");
  const inFlow = (child: Element) => getComputedStyle(child).position === "static" && getComputedStyle(child).display !== "contents";
  expect([...home.children].filter(inFlow)).toEqual([greeting, games]);
  expect([...home.querySelectorAll(".stratum")].map((band) => getComputedStyle(band).position)).toEqual(["absolute", "absolute", "absolute"]);
  expect([...games.children]).toEqual([card, row]);
  expect([homeStyle.display, homeStyle.flexDirection, homeStyle.boxSizing, px(homeStyle.minHeight), homeStyle.maxHeight]).toEqual(["flex", "column", "border-box", height, "none"]);
  expect([gamesStyle.display, gamesStyle.flexDirection, gamesStyle.flexGrow, gamesStyle.height]).toEqual(["flex", "column", "1", "auto"]);
  expect([cardStyle.flexGrow, cardStyle.flexBasis, cardStyle.height, rowStyle.flexGrow, rowStyle.flexShrink]).toEqual(["1", "0px", "auto", "0", "0"]);
  // The greeting is one line tall, and the large card as wide as the
  // games inside the page's sides.
  expect(greetingStyle.height).toBe("auto");
  expect([home, games, card].map((element) => [getComputedStyle(element).width, getComputedStyle(element).maxWidth])).toEqual([home, games, card].map(() => ["auto", "none"]));
  expect(["auto", "normal", "stretch"]).toContain(cardStyle.alignSelf);
  // The row reaches past the games above and below by as much as its
  // own padding, which keeps the tiles' shadows.
  expect(px(rowStyle.marginTop) + px(rowStyle.paddingTop)).toBe(0);
  expect(px(rowStyle.marginBottom) + px(rowStyle.paddingBottom)).toBe(0);

  const top = insides(homeStyle, "Top");
  const bottom = insides(homeStyle, "Bottom");
  const greetingHeight = heightWithin(greetingStyle, px(greetingStyle.lineHeight) + insides(greetingStyle, "Top", "Bottom")) + margins(greetingStyle, "Top", "Bottom");
  const rowSides = insides(rowStyle, "Top", "Bottom");
  const rowBox = heightWithin(rowStyle, length(rowStyle.height, Number.NaN) + (rowStyle.boxSizing === "border-box" ? 0 : rowSides));
  const rowHeight = rowBox - rowSides;
  const rest =
    top + greetingHeight + styleAt(home, size).rowGap() + insides(gamesStyle, "Top", "Bottom") + margins(gamesStyle, "Top", "Bottom") + styleAt(games, size).rowGap() + rowBox + margins(rowStyle, "Top", "Bottom") + bottom;
  const cardHeight = heightWithin(cardStyle, height - rest - margins(cardStyle, "Top", "Bottom"));
  const gamesStart = insides(homeStyle, "Left") + margins(gamesStyle, "Left") + insides(gamesStyle, "Left");
  const gamesEnd = width - margins(homeStyle, "Left", "Right") - insides(homeStyle, "Right") - margins(gamesStyle, "Right") - insides(gamesStyle, "Right");
  // The row runs from the page's padding to its margin past the page's
  // other side.
  const rowStart = gamesStart + margins(rowStyle, "Left");
  const rowEnd = gamesEnd - margins(rowStyle, "Right");
  const shown = rowEnd - rowStart - insides(rowStyle, "Left", "Right");
  const columnValue = styleAt(row, size).value("grid-auto-columns");
  expect(columnValue).toMatch(/^[\d.]+px$/);
  const column = px(columnValue);
  const gap = styleAt(row, size).columnGap();
  const columns = Math.ceil(row.children.length / 2);
  const whole = Math.floor((shown + gap) / (column + gap));
  return {
    card: { width: gamesEnd - gamesStart - margins(cardStyle, "Left", "Right"), height: cardHeight },
    row: { height: rowHeight, start: rowStart, end: rowEnd, rows: rowStyle.gridTemplateRows, rowGap: styleAt(row, size).rowGap() },
    column,
    peek: whole >= columns ? 0 : shown - whole * (column + gap),
    page: rest + margins(cardStyle, "Top", "Bottom") + cardHeight,
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
        [...tilesRow().children].slice(0, 2).map((tile) => within(tile as HTMLElement).queryByText(/ANCIENT REPTILES|FIND THE PAIR/)?.textContent)
      ).toEqual(["ANCIENT REPTILES", "FIND THE PAIR"]);
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

// A box the large card's picture draws, from the card's top left corner.
type Box = { left: number; top: number; right: number; bottom: number };

// A length the large card's picture is given, as jsdom writes it: in
// pixels, a share of `whole`, `whole` less some pixels, a share of the
// container's inline size `inline` less some pixels, or the least of two
// of these.
function lengthIn(value: string, whole: number, inline: number): number {
  const least = /^min\((.+), (.+)\)$/.exec(value);
  if (least) return Math.min(lengthIn(least[1] ?? "", whole, inline), lengthIn(least[2] ?? "", whole, inline));
  const inner = /^calc\((.+)\)$/.exec(value)?.[1] ?? value;
  const contained = /^([\d.]+) \* \(100cqi - ([\d.]+)px\)$/.exec(inner);
  if (contained) return Number(contained[1]) * (inline - Number(contained[2]));
  const short = /^100% - ([\d.]+)px$/.exec(inner);
  if (short) return whole - Number(short[1]);
  const share = /^(-?[\d.]+)%$/.exec(inner);
  if (share) return (Number(share[1]) / 100) * whole;
  if (/^[\d.]+px$/.test(inner)) return px(inner);
  throw new Error(`Cannot read the length ${value}`);
}

// The inline size of the container `element`'s cqi is read against: the
// nearest that is one, `widthOf` giving the width of each it may be.
function containerOf(element: Element, widthOf: (container: Element) => number) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.containerType === "inline-size" || style.containerType === "size") return widthOf(parent) - insides(style, "Left", "Right");
  }
  return Number.NaN;
}

const ratioOf = (value: string) => {
  const [across, down] = value.split(" / ").map(Number);
  if (!across || !down) throw new Error(`Cannot read the aspect ratio ${value}`);
  return across / down;
};

// The box a box `width` by `height` at `left`, `top` takes once its
// `translate` and `rotate`, about its centre, move it.
function moved(style: CSSStyleDeclaration, left: number, top: number, width: number, height: number): Box {
  const [across = "0%", down = "0%"] = style.translate === "none" ? [] : style.translate.split(" ");
  const turn = (style.rotate === "none" || !style.rotate ? 0 : Number.parseFloat(style.rotate)) * (Math.PI / 180);
  const centreX = left + lengthIn(across, width, Number.NaN) + width / 2;
  const centreY = top + lengthIn(down, height, Number.NaN) + height / 2;
  const halfWidth = (width * Math.abs(Math.cos(turn)) + height * Math.abs(Math.sin(turn))) / 2;
  const halfHeight = (width * Math.abs(Math.sin(turn)) + height * Math.abs(Math.cos(turn))) / 2;
  return { left: centreX - halfWidth, top: centreY - halfHeight, right: centreX + halfWidth, bottom: centreY + halfHeight };
}

// The height of the large card's name strip, a card `cardWidth` wide:
// its paddings and margins round the name's lines or its symbol, the
// taller.
function footerHeight(cardWidth: number) {
  const footer = getComputedStyle(part(".featured-card-footer"));
  const title = getComputedStyle(part(".featured-card-title"));
  const { size, lines } = featuredName(cardWidth);
  const line = title.lineHeight.endsWith("px") ? px(title.lineHeight) : Number(title.lineHeight) * size;
  expect([footer.display, footer.flexDirection, footer.height]).toEqual(["flex", "row", "auto"]);
  return insides(footer, "Top", "Bottom") + margins(footer, "Top", "Bottom") + Math.max(px(getComputedStyle(part(".featured-card-symbol")).height), lines.length * line);
}

// Each box the large card's picture draws in a card `width` by `height`,
// as the stylesheet places it, and each way it would show less than its
// whole picture. The picture takes the card's height its name strip
// leaves.
function featuredPicture(width: number, height: number) {
  const card = featuredCard();
  const cardStyle = getComputedStyle(card);
  const picture = card.firstElementChild;
  if (!(picture instanceof HTMLElement)) throw new Error("No picture on the large card");
  const style = getComputedStyle(picture);
  expect([cardStyle.display, cardStyle.flexDirection, style.flexGrow, style.flexBasis, px(style.minHeight)]).toEqual(["flex", "column", "1", "0px", 0]);
  const room = {
    left: insides(cardStyle, "Left"),
    top: insides(cardStyle, "Top"),
    width: width - insides(cardStyle, "Left", "Right"),
    height: height - insides(cardStyle, "Top", "Bottom") - footerHeight(width)
  };
  const cut: string[] = [];
  const inline = () => containerOf(picture.firstElementChild ?? picture, (container) => (container === card ? width : room.width));
  if (picture.matches(".face-off")) {
    // Two pictures, each a share of the room inside its padding, at its
    // sides and its foot.
    expect([style.boxSizing, style.justifyContent, style.alignItems]).toEqual(["border-box", "space-between", "flex-end"]);
    const inside = { left: room.left + insides(style, "Left"), right: room.left + room.width - insides(style, "Right"), bottom: room.top + room.height - insides(style, "Bottom") };
    const shown = [...picture.children].map((child) => {
      const childStyle = getComputedStyle(child);
      if (childStyle.objectFit !== "contain") cut.push(`${child.className}: ${childStyle.objectFit}`);
      return { width: lengthIn(childStyle.width, inside.right - inside.left, Number.NaN), height: lengthIn(childStyle.height, room.height - insides(style, "Top", "Bottom"), Number.NaN) };
    });
    const [first, last] = [shown[0], shown.at(-1)];
    if (!first || !last || shown.length !== 2) throw new Error("No two pictures face off");
    return {
      cut: first.width + last.width <= inside.right - inside.left ? cut : [...cut, "the two pictures overlap"],
      boxes: [
        { left: inside.left, top: inside.bottom - first.height, right: inside.left + first.width, bottom: inside.bottom },
        { left: inside.right - last.width, top: inside.bottom - last.height, right: inside.right, bottom: inside.bottom }
      ]
    };
  }
  if (picture.matches(".pairs-tile-art")) {
    // Three cards of the dinosaur's picture's shape, each placed from
    // the art's middle by its own size.
    expect([style.position, insides(style, "Top", "Right", "Bottom", "Left"), margins(style, "Top", "Right", "Bottom", "Left")]).toEqual(["relative", 0, 0]);
    const boxes = [...picture.children].map((child) => {
      const childStyle = getComputedStyle(child);
      expect([childStyle.position, childStyle.boxSizing]).toEqual(["absolute", "border-box"]);
      const cardHeight = lengthIn(childStyle.height, room.height, inline());
      const cardWidth = cardHeight * ratioOf(childStyle.aspectRatio);
      cut.push(...[...child.querySelectorAll("img")].filter((image) => getComputedStyle(image).objectFit !== "contain").map((image) => `${image.className}: ${getComputedStyle(image).objectFit}`));
      return moved(childStyle, room.left + lengthIn(childStyle.left, room.width, Number.NaN), room.top + lengthIn(childStyle.top, room.height, Number.NaN), cardWidth, cardHeight);
    });
    return { cut, boxes };
  }
  if (!(picture instanceof HTMLImageElement)) throw new Error(`No picture the budget knows: ${picture.className}`);
  const fixed = (side: "Top" | "Bottom") => (style[`margin${side}`] === "auto" ? 0 : px(style[`margin${side}`]));
  const free = room.height - fixed("Top") - fixed("Bottom");
  if (style.objectFit === "contain") {
    // A picture as wide as the card, shrunk whole into it inside its
    // padding.
    expect([style.width, style.boxSizing, insides(style, "Left", "Right") < room.width, insides(style, "Top", "Bottom") < free]).toEqual(["100%", "border-box", true, true]);
    return { cut, boxes: [{ left: room.left, top: room.top + fixed("Top"), right: room.left + room.width, bottom: room.top + fixed("Top") + free }] };
  }
  // A picture filling a box of its own shape, as wide as its height
  // makes it unless its most width cuts it.
  expect([style.objectFit, style.width, style.alignSelf, ratioOf(style.aspectRatio)]).toEqual(["cover", "auto", "center", picture.width / picture.height]);
  const pictureHeight = Math.min(free, lengthIn(style.maxHeight === "none" ? `${free}px` : style.maxHeight, room.height, inline()));
  const pictureWidth = pictureHeight * ratioOf(style.aspectRatio);
  const most = lengthIn(style.maxWidth, room.width, inline());
  if (pictureWidth > most + 0.5) cut.push(`${picture.className}: ${pictureWidth.toFixed(1)}px wide, cut to ${most.toFixed(1)}px`);
  const left = room.left + (room.width - Math.min(pictureWidth, most)) / 2;
  const top = room.top + (style.marginTop === "auto" ? (free - pictureHeight) / (style.marginBottom === "auto" ? 2 : 1) : fixed("Top"));
  return { cut, boxes: [{ left, top, right: left + Math.min(pictureWidth, most), bottom: top + pictureHeight }] };
}

describe("the large card's picture upright", () => {
  it.each(HOME_GAMES.flatMap((game) => UPRIGHT.map(([width, height]) => [game, width, height] as const)))(
    "shows %s's whole picture inside the large card in a %i by %i window",
    (game, width, height) => {
      openUpright(width, height, { featured: game });
      const { card } = uprightLayout([width, height]);
      const { cut, boxes } = featuredPicture(card.width, card.height);
      const outside = boxes.filter((box) => box.left < 0 || box.top < 0 || box.right > card.width || box.bottom > card.height).map((box) => Object.values(box).map((side) => side.toFixed(1)).join(" "));

      expect(boxes.length).toBeGreaterThan(0);
      expect({ cut, outside }).toEqual({ cut: [], outside: [] });
    }
  );

  it("keeps every tile's picture as it is in landscape", () => {
    const { viewport } = openUpright(1180, 820, { viewport: manualViewport("landscape") });
    const properties = ["height", "width", "max-height", "max-width", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left", "translate", "rotate", "aspect-ratio", "object-fit", "container-type"];
    const pictures = () =>
      [...tilesRow().querySelectorAll(".face-off, img, .pairs-tile-art, .pairs-tile-card")].map((picture) => {
        const style = getComputedStyle(picture);
        return [picture.className, ...properties.map((property) => style.getPropertyValue(property))];
      });
    const landscape = pictures();

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));

    expect(document.documentElement.dataset.size).toBe("tall");
    expect(landscape.map(([name]) => name)).toEqual(expect.arrayContaining(["pairs-tile-art", "pairs-tile-card pairs-tile-card-first", "picture dig-tile-picture"]));
    expect(pictures()).toEqual(landscape);
  });
});

// home-portrait.feature's "Every word fits the tightest tall windows": a
// best of 7 in COMPARE, 8 in CARE, 6 in SORT and 3 in SKELETONS, 120
// stars in FIND THE PAIR and 7 dinosaurs dug up in DIG.
const scored = () =>
  memoryStorage({
    [PROGRESS_KEY]: JSON.stringify({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 },
        "dinosaur-care": { bestScore: 8, visitsFinished: 1, friends: [] },
        "sort-dinosaurs": { bestScore: 6, explorerBest: 6, paleontologistBest: null, roundsPlayed: 2 },
        "find-the-pair": { stars: 120, level: 1, boardsOnLevel: 0, best: {}, found: [] },
        "skeleton-assembly": { earned: ["tyrannosaurus", "triceratops", "stegosaurus"], bestScore: 3, rebuilding: [] },
        dig: { dug: SHIPPED_DIG.slice(0, 7).map(({ id }) => id), badges: [] }
      }
    })
  });

// Each tile's count, in the tiles' order.
const COUNTS: Record<HomeGame, string> = {
  compare: "7",
  catalogue: String(SHIPPED_CATALOGUE.length),
  pairs: "120",
  skeletons: "3",
  dig: "7",
  sort: "6",
  care: "8"
};

const TILE_ORDER: readonly HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care"];

// The outline's examples: the language, the window's width, 800 tall,
// and the game the large card features.
const TIGHTEST: ReadonlyArray<readonly [Language, number, HomeGame]> = [
  ["en", 600, "compare"],
  ["ru", 600, "catalogue"],
  ["ru", 600, "pairs"],
  ["ru", 677, "compare"],
  ["ru", 700, "compare"],
  ["ru", 677, "skeletons"]
];

// The large card's name: its size and the lines it takes in a card
// `cardWidth` wide.
function featuredName(cardWidth: number) {
  const title = featuredCard().querySelector(".featured-card-title");
  if (!title?.textContent) throw new Error("No name on the large card");
  const style = getComputedStyle(title);
  const size = px(style.fontSize);
  const spacing = px(style.letterSpacing);
  const room = roomFor(title, () => cardWidth);
  const lines = linesOf(title.textContent, size, spacing, room);
  if (!Array.isArray(lines)) throw new Error(`${lines.missing}: no width in ems`);
  return { size, lines, wide: lines.filter((line) => widthOf(line, size, spacing) > room), wraps: style.whiteSpace !== "nowrap" };
}

describe("every word on the upright home page", () => {
  it.each(TIGHTEST)(
    "fits in %s in a %i by 800 window, featuring %s: the large card's name as at 1024 by 768 landscape, every title and count at its least, and the corner clear",
    (language, width, featured) => {
      const { viewport } = openUpright(1024, 768, { language, featured, storage: scored(), viewport: manualViewport("landscape") });
      const card = featuredCard();
      const landscape = featuredName(gamesWidths(1024).get(card) ?? Number.NaN);

      openWindow(width, 800);
      act(() => viewport.resize("tall", true));

      const home = getComputedStyle(part(".home"));
      const upright = featuredName(width - px(home.paddingLeft) - px(home.paddingRight));
      expect(upright.size).toBeGreaterThanOrEqual(landscape.size);
      expect(upright.lines.length).toBeLessThanOrEqual(landscape.lines.length);
      expect([upright.wide, upright.wraps]).toEqual([[], true]);
      const badge = card.querySelector<HTMLElement>(".featured-card-badge");
      expect([badge?.parentElement, badge && getComputedStyle(badge).position, badge && getComputedStyle(badge).top, badge && getComputedStyle(badge).right]).toEqual([card, "absolute", "24px", "24px"]);

      const row = tilesRow();
      const column = styleAt(row, [width, 800]).px("grid-auto-columns");
      expect(column).toBeGreaterThan(0);
      const titles = tileTitles();
      const shown = TILE_ORDER.filter((game) => game !== featured);
      const words = (game: HomeGame) => TEXTS[language][game === "compare" ? "quizCard" : game === "catalogue" ? "catalogueTile" : game];
      // FIND THE PAIR's title may wrap, so it is read apart below.
      expect(titles.map((title) => title.textContent)).toEqual([...shown.filter((game) => game !== "pairs").map(words), TEXTS[language].moreComing]);
      const overflowing = titles.flatMap((title) => {
        const style = getComputedStyle(title);
        const words = title.textContent ?? "";
        const least = title.className === "more-coming-title" ? 20 : 24;
        const needed = (TITLE_EMS[words] ?? Number.NaN) * px(style.fontSize) + px(style.letterSpacing) * words.length;
        const room = roomFor(title, () => column);
        return [
          ...(style.whiteSpace === "nowrap" ? [] : [`${words}: may wrap`]),
          ...(px(style.fontSize) >= least ? [] : [`${words}: ${style.fontSize}`]),
          ...(needed <= room ? [] : [`${words}: ${needed.toFixed(1)}px in ${room.toFixed(1)}px`])
        ];
      });
      expect(overflowing).toEqual([]);

      const pairs = row.querySelector(".pairs-tile-title");
      if (pairs) {
        const style = getComputedStyle(pairs);
        const size = px(style.fontSize);
        const spacing = px(style.letterSpacing);
        const room = roomFor(pairs, () => column);
        const lines = linesOf(pairs.textContent ?? "", size, spacing, room);
        expect(size).toBeGreaterThanOrEqual(24);
        expect(Array.isArray(lines) && lines.length <= 2 && lines.every((line) => widthOf(line, size, spacing) <= room)).toBe(true);
      }

      const counts = [...row.querySelectorAll<HTMLElement>(TILE_COUNTS)];
      expect(counts.map((count) => [count.textContent, count.parentElement === count.closest("button"), getComputedStyle(count).position, px(getComputedStyle(count).fontSize) >= 20])).toEqual(
        shown.map((game) => [COUNTS[game], true, "absolute", true])
      );

      const line = topLine(width, language);
      expect(line.museumWraps).toBe(false);
      expect(line.between).toBeGreaterThanOrEqual(line.cornerGap);
      expect(Math.max(line.cornerEnd, line.wordmarkEnd)).toBeLessThanOrEqual(line.greetingTop);
    }
  );
});

// jsdom lays nothing out, so the width of each choice's name in the
// language and theme menus is given here in ems of its face at the
// chosen one's weight, rounded up: Lexend's for English, and the iPad's
// own face for the Cyrillic names, which Lexend has no letters for. The
// age levels' are LEVEL_EMS.
const MENU_EMS: Record<string, number> = { ...LEVEL_EMS, English: 3.6, Русский: 3.9, Системная: 5.2, Светлая: 3.9, Тёмная: 3.5 };

const MENUS = { language: "languageMenu", theme: "themeMenu", "age level": "ageLevelMenu" } as const;

describe("the parents' menus upright", () => {
  it.each(Object.keys(MENUS) as Array<keyof typeof MENUS>)("open the %s menu whole inside a 600 by 800 window in Russian, each name on one line, and a tap outside closes it and opens nothing", async (name) => {
    const { user } = openUpright(600, 800, { language: "ru" });
    const label = TEXTS.ru[MENUS[name]];

    const menu = await openMenu(user, label);

    // The menu hangs under the parents' menus, its right edge on theirs,
    // which stand at the corner's right.
    const style = getComputedStyle(menu);
    expect([style.position, style.top, style.right, style.boxSizing]).toEqual(["absolute", "calc(100% + 8px)", "0px", "border-box"]);
    const corner = getComputedStyle(part(".home-corner"));
    const menus = getComputedStyle(part(".parent-menus"));
    expect(menus.position).toBe("relative");
    const right = 600 - px(corner.right) - px(corner.paddingRight);
    expect(right - px(style.width)).toBeGreaterThanOrEqual(0);
    const choices = within(menu).getAllByRole("menuitemradio");
    const rows = choices.map((choice) => px(getComputedStyle(choice).height));
    const height = px(style.paddingTop) + rows.reduce((sum, row) => sum + row, 0) + px(style.gap) * (rows.length - 1) + px(style.paddingBottom);
    const buttons = [...part(".parent-menus").querySelectorAll(".parent-menu-button")].map((button) => px(getComputedStyle(button).minHeight));
    const top = px(corner.top) + px(corner.paddingTop) + px(menus.paddingTop) + Math.max(...buttons) + px(menus.paddingBottom) + 8;
    expect(top + height).toBeLessThanOrEqual(800);

    // Each name stands on one line beside its symbol and room for the ✓,
    // which the chosen row draws.
    const room = px(style.width) - px(style.paddingLeft) - px(style.paddingRight);
    const tick = px(within(menu).getByRole("menuitemradio", { checked: true }).querySelector("svg.lucide-check")?.getAttribute("width") ?? "");
    expect(tick).toBeGreaterThan(0);
    const overflowing = choices.flatMap((choice) => {
      const row = getComputedStyle(choice);
      const symbol = choice.firstElementChild;
      const words = choice.querySelector(".parent-menu-words");
      if (!symbol || symbol === words || !words) throw new Error("A choice without its symbol or words");
      const symbolWidth = px(getComputedStyle(symbol).width) || px(symbol.getAttribute("width") ?? "");
      const wordsRoom = room - px(row.paddingLeft) - px(row.paddingRight) - symbolWidth - tick - px(row.gap) * 2;
      return [...words.children].flatMap((text) => {
        const shown = text.textContent ?? "";
        const textStyle = getComputedStyle(text);
        const width = (MENU_EMS[shown] ?? Number.NaN) * px(textStyle.fontSize) + px(textStyle.letterSpacing) * shown.length;
        return textStyle.whiteSpace === "nowrap" && width <= wordsRoom ? [] : [`${shown}: ${width.toFixed(1)}px in ${wordsRoom.toFixed(1)}px, ${textStyle.whiteSpace}`];
      });
    });
    expect(overflowing).toEqual([]);

    // The backdrop is fixed to the whole window: the corner it stands in,
    // upright on the page, has no transform or filter to pin it there.
    const backdrop = getComputedStyle(outsideMenu());
    expect([backdrop.position, backdrop.top, backdrop.right, backdrop.bottom, backdrop.left]).toEqual(["fixed", "0px", "0px", "0px", "0px"]);
    expect([corner.transform || "none", corner.filter || "none"]).toEqual(["none", "none"]);
    await user.click(outsideMenu());

    expect(screen.queryByRole("menu")).toBeNull();
    expect([featuredCard().isConnected, tilesRow().isConnected, document.querySelector(".menu-backdrop")]).toEqual([true, true, null]);
  });
});

describe("turning the window", () => {
  it("keeps the open menu and the large card, which does not rise in again, and stands the row of tiles at its start", async () => {
    const { viewport, user } = openUpright(1180, 820, { viewport: manualViewport("landscape") });
    const card = featuredCard();
    const row = tilesRow();
    const rise = getComputedStyle(card).animationName;
    const landscape = getComputedStyle(part(".games")).flexDirection;
    // Swiped to MORE COMING, the last column.
    row.scrollLeft = 1000;
    await openMenu(user, "Theme");

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));

    expect([document.documentElement.dataset.size, document.querySelector(".orientation-gate")?.hasAttribute("data-shown")]).toEqual(["tall", false]);
    expect(getComputedStyle(part(".games")).flexDirection).toBe("column");
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
    // The same card, never drawn anew, rises in only as it is first drawn.
    expect([featuredCard(), card.dataset.game, getComputedStyle(card).animationName]).toEqual([card, "compare", rise]);
    expect([tilesRow(), row.scrollLeft]).toEqual([row, 0]);
    expect(within(row).getAllByRole("button")[0]?.getAttribute("aria-label")).toBe("ANCIENT REPTILES");

    row.scrollLeft = 1000;
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));

    expect(document.documentElement.dataset.size).toBe("wide");
    expect(getComputedStyle(part(".games")).flexDirection).toBe(landscape);
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
    expect([featuredCard(), getComputedStyle(card).animationName]).toEqual([card, rise]);
    expect([tilesRow(), row.scrollLeft]).toEqual([row, 0]);
  });
});
