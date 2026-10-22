// The upright result's CSS sizes, a result with the level switch as the
// compare quiz shows it; the stylesheet contract tests keep these in step
// with app.css.
export const PORTRAIT_RESULT = {
  padding: 32,
  heroGap: 20,
  gap: 16,
  celebration: 52,
  title: 48,
  best: 48,
  switchPadding: 6,
  switchGap: 4,
  switchMaximum: 648,
  level: 64,
  levelSidePadding: 6,
  levelLetterSpacing: 0.5,
  levelNameMaximum: 16,
  actions: 80,
  scoreShare: 0.15,
  scoreMaximum: 180,
  stars: 10,
  starGap: 8,
  starMaximum: 48,
  heroRatio: 4 / 3,
  heroMaximum: 480,
  heroMinimum: 200,
  // The widest level name in either language, in ems of its bold face, and
  // its letters, each spaced apart: PALEONTOLOGIST, as levelEms.ts
  // measures it. One type per window fits every name.
  widestLevelEms: 9.7,
  widestLevelLetters: 14
} as const;

// What the stylesheet cannot work out itself, as each depends on the
// width the window leaves: the stars' size, the level names' type and the
// tallest the dinosaur may stand.
export type ResultType = { star: number; levelName: number; heroMaximum: number };

// The result's width is the window less safe-area insets, the screen's
// 32px padding a side and any scrollbar reserved by the layout viewport.
export function compareResultWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * PORTRAIT_RESULT.padding - scrollbar);
}

// The sizes for a result `width` wide: ten stars and their gaps across
// it, the longest level name across its third of the switch, and the
// dinosaur at 4:3 no wider than it, each at most its own maximum.
export function compareResultType(width: number): ResultType {
  const sizes = PORTRAIT_RESULT;
  const levelSwitch = Math.min(sizes.switchMaximum, width);
  const third = (levelSwitch - 2 * sizes.switchPadding - 2 * sizes.switchGap) / 3;
  const nameRoom = third - 2 * sizes.levelSidePadding - sizes.levelLetterSpacing * sizes.widestLevelLetters;
  return {
    star: Math.min(sizes.starMaximum, Math.max(0, width - (sizes.stars - 1) * sizes.starGap) / sizes.stars),
    levelName: Math.min(sizes.levelNameMaximum, Math.max(0, nameRoom) / sizes.widestLevelEms),
    heroMaximum: Math.min(sizes.heroMaximum, width / sizes.heroRatio)
  };
}

// Upright geometry with no vertical safe-area insets: the sizes, the
// score's, the column under the dinosaur, the dinosaur's height and
// whether the screen scrolls. The dinosaur takes the height the column
// leaves, within its maximum, and never less than its minimum: below
// that the whole screen scrolls.
export function compareResultGeometry(windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0) {
  const sizes = PORTRAIT_RESULT;
  const width = compareResultWidth(windowWidth, leftInset, rightInset, scrollbar);
  const type = compareResultType(width);
  const score = Math.min(sizes.scoreMaximum, sizes.scoreShare * windowHeight);
  const levelSwitch = { width: Math.min(sizes.switchMaximum, width), height: 2 * sizes.switchPadding + sizes.level };
  // The celebration, the score, the stars, "WELL DONE!", the best score,
  // the switch and the actions, six gaps apart.
  const column = sizes.celebration + score + type.star + sizes.title + sizes.best + levelSwitch.height + sizes.actions + 6 * sizes.gap;
  const available = windowHeight - 2 * sizes.padding - sizes.heroGap - column;
  const hero = Math.max(sizes.heroMinimum, Math.min(type.heroMaximum, available));
  return {
    width, type, score, levelSwitch, column,
    hero: { width: hero * sizes.heroRatio, height: hero },
    scrolls: available < sizes.heroMinimum
  };
}
