import { levelNameSize, UPRIGHT_LEVEL_SWITCH } from "./levelSwitchLayout.ts";

// Find the pair's upright welcome's CSS sizes; the stylesheet contract
// tests keep these in step with app.css.
export const PORTRAIT_WELCOME = {
  topPadding: 40,
  bottomPadding: 48,
  sidePadding: 32,
  bar: 56,
  gap: 28,
  cardsGap: 32,
  columnMaximum: 648,
  mark: 88,
  markGap: 20,
  titleMaximum: 64,
  chips: 64,
  play: 104,
  cardShare: 0.32,
  cardMaximum: 280,
  cardMinimum: 120,
  cardRatio: 3 / 4,
  // The longer title in either language, in ems of its bold face: FIND
  // THE PAIR, as homeTitles.ts measures it. One type per window fits
  // either.
  widestTitleEms: 8.1
} as const;

// What the stylesheet cannot work out itself, as each depends on the
// width the window leaves: the title's type and the level names'.
export type WelcomeType = { title: number; levelName: number };

// The welcome's width is the window less safe-area insets, the screen's
// 32px padding a side and any scrollbar reserved by the layout viewport.
export function pairsWelcomeWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * PORTRAIT_WELCOME.sidePadding - scrollbar);
}

// The type for a welcome `width` wide: the title as large as lets the
// longer one fit the column beside its mark, and the level names as the
// switch, the column's width, gives them, each at most its maximum.
export function pairsWelcomeType(width: number): WelcomeType {
  const sizes = PORTRAIT_WELCOME;
  const column = Math.min(sizes.columnMaximum, width);
  return {
    title: Math.min(sizes.titleMaximum, Math.max(0, column - sizes.mark - sizes.markGap) / sizes.widestTitleEms),
    levelName: levelNameSize(column)
  };
}

// Upright geometry with no vertical safe-area insets: the width, the
// column, the type, the stack of parts under the cards, each card's size
// and whether the screen scrolls. A card keeps its 3:4 and its share of
// the width, within its maximum, and shrinks to the height the bar and
// the stack leave; it is never narrower than its minimum: below that the
// whole screen scrolls.
export function pairsWelcomeGeometry(windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0) {
  const sizes = PORTRAIT_WELCOME;
  const width = pairsWelcomeWidth(windowWidth, leftInset, rightInset, scrollbar);
  const column = Math.min(sizes.columnMaximum, width);
  const type = pairsWelcomeType(width);
  const levelSwitch = { width: column, height: 2 * UPRIGHT_LEVEL_SWITCH.padding + UPRIGHT_LEVEL_SWITCH.level };
  // The title beside its mark, the chips, the switch and PLAY, three gaps
  // apart.
  const stack = sizes.mark + sizes.chips + levelSwitch.height + sizes.play + 3 * sizes.gap;
  const available = windowHeight - sizes.topPadding - sizes.bottomPadding - sizes.bar - sizes.gap - sizes.cardsGap - stack;
  const fitted = Math.min(sizes.cardMaximum, sizes.cardShare * width, sizes.cardRatio * available);
  const card = Math.max(sizes.cardMinimum, fitted);
  return {
    width, column, type, levelSwitch, stack,
    card: { width: card, height: card / sizes.cardRatio },
    scrolls: sizes.cardRatio * available < card
  };
}
