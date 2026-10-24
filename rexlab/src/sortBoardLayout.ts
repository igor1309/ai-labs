// Sort's upright board's CSS sizes; the stylesheet contract tests keep
// these in step with app.css.
export const PORTRAIT_SORT = {
  topPadding: 40,
  bottomPadding: 48,
  sidePadding: 32,
  bar: 56,
  prompt: 56,
  gap: 28,
  cardsAcross: 16,
  cardsDown: 12,
  cardMaximum: 200,
  cardMinimum: 120,
  pictureRatio: 4 / 3,
  // The name strip under a card's picture, for six cards and for more.
  strip: { few: 46, many: 38 },
  basketsMinimum: 320,
  basketsGap: { two: 24, three: 16 },
  basketPadding: 20,
  basketType: { two: 34, three: 28 },
  // The longest word of any basket's name in either language, in ems of
  // its bold face: НЕИЗВЕСТНО, as tests/basketWidths.ts measures it. One
  // type per window fits it.
  widestBasketWordEms: 7.4
};

// In a tall-narrow window, an iPhone upright: 24 at the top, 32 at the
// bottom and 20 a side, the parts 16 apart, the cards 8 apart and never
// narrower than 72, and the baskets 8 apart and at least 240 tall, each
// 12 inside and showing its mark alone: no name fits a basket a third of
// a phone wide.
export const NARROW_SORT = {
  ...PORTRAIT_SORT,
  topPadding: 24,
  bottomPadding: 32,
  sidePadding: 20,
  gap: 16,
  cardsAcross: 8,
  cardsDown: 8,
  cardMinimum: 72,
  basketsMinimum: 240,
  basketsGap: { two: 8, three: 8 },
  basketPadding: 12
};

export type SortSizes = typeof PORTRAIT_SORT;

// The board's width is the window less safe-area insets, the screen's
// padding a side and any scrollbar reserved by the layout viewport.
export function sortBoardWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0, sizes: SortSizes = PORTRAIT_SORT): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * sizes.sidePadding - scrollbar);
}

// The tray's cards across a board `width` wide: half of them, in two rows
// of equal length, or fewer where the width cannot hold a row of cards at
// their least.
export function sortTrayColumns(width: number, cards: number, sizes: SortSizes = PORTRAIT_SORT): number {
  const { cardsAcross, cardMinimum } = sizes;
  return Math.max(1, Math.min(Math.ceil(cards / 2), Math.floor((width + cardsAcross) / (cardMinimum + cardsAcross))));
}

// The widest a tray card may be on a board `width` wide, at most its
// maximum.
export function sortCardWidth(width: number, cards: number, sizes: SortSizes = PORTRAIT_SORT): number {
  const columns = sortTrayColumns(width, cards, sizes);
  return Math.min(sizes.cardMaximum, Math.max(0, width - (columns - 1) * sizes.cardsAcross) / columns);
}

// A tray card's name strip.
export const sortStrip = (cards: number) => (cards > 6 ? PORTRAIT_SORT.strip.many : PORTRAIT_SORT.strip.few);

// The baskets' names' type on a board `width` wide: as large as lets the
// longest word fit across a basket, at most its maximum.
export function sortBasketType(width: number, baskets: number, sizes: SortSizes = PORTRAIT_SORT): number {
  const [gap, maximum] = baskets > 2 ? [sizes.basketsGap.three, sizes.basketType.three] : [sizes.basketsGap.two, sizes.basketType.two];
  const across = Math.max(0, (width - (baskets - 1) * gap) / baskets - 2 * sizes.basketPadding);
  return Math.min(maximum, across / sizes.widestBasketWordEms);
}

// What the stylesheet cannot work out itself, as each depends on the
// width the window leaves: the tray's rows and columns, its cards' widest
// and their strip, and the baskets' type.
export function sortBoardStyle(width: number, cards: number, baskets: number, sizes: SortSizes = PORTRAIT_SORT): Record<string, string> {
  const columns = sortTrayColumns(width, cards, sizes);
  return {
    "--upright-columns": String(columns),
    "--upright-rows": String(Math.ceil(cards / columns)),
    "--card-by-width": `${sortCardWidth(width, cards, sizes)}px`,
    "--strip": `${sortStrip(cards)}px`,
    "--basket-type": `${sortBasketType(width, baskets, sizes)}px`
  };
}

// Upright geometry with no vertical safe-area insets: the width, the
// tray's rows and columns, each card's width, the baskets' height and
// whether the screen scrolls. A card is its picture at 4:3 over its
// strip, as wide as the width allows and as leaves the baskets their
// least; it is never narrower than its minimum: below that the whole
// screen scrolls.
export function sortBoardGeometry(cards: number, baskets: number, windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0, sizes: SortSizes = PORTRAIT_SORT) {
  const width = sortBoardWidth(windowWidth, leftInset, rightInset, scrollbar, sizes);
  const columns = sortTrayColumns(width, cards, sizes);
  const rows = Math.ceil(cards / columns);
  const strip = sortStrip(cards);
  const room = windowHeight - sizes.topPadding - sizes.bottomPadding - sizes.bar - sizes.prompt - 3 * sizes.gap;
  const byHeight = ((room - sizes.basketsMinimum - (rows - 1) * sizes.cardsDown) / rows - strip) * sizes.pictureRatio;
  const card = Math.max(sizes.cardMinimum, Math.min(sortCardWidth(width, cards, sizes), byHeight));
  const tray = rows * (card / sizes.pictureRatio + strip) + (rows - 1) * sizes.cardsDown;
  return {
    width, rows, columns, card,
    type: sortBasketType(width, baskets, sizes),
    baskets: Math.max(sizes.basketsMinimum, room - tray),
    scrolls: byHeight < card
  };
}
