// The level switch's upright CSS sizes, for every game that shows it
// upright; the stylesheet contract tests keep these in step with app.css.
export const UPRIGHT_LEVEL_SWITCH = {
  padding: 6,
  gap: 4,
  maximum: 648,
  level: 64,
  sidePadding: 6,
  letterSpacing: 0.5,
  nameMaximum: 16,
  // The widest level name in either language, in ems of its bold face, and
  // its letters, each spaced apart: PALEONTOLOGIST, as levelEms.ts
  // measures it. One type per window fits every name.
  widestEms: 9.7,
  widestLetters: 14
} as const;

// The level names' type on an upright switch `switchWidth` wide: as large
// as lets the longest name fit its third, at most 16.
export function levelNameSize(switchWidth: number): number {
  const sizes = UPRIGHT_LEVEL_SWITCH;
  const third = (switchWidth - 2 * sizes.padding - 2 * sizes.gap) / 3;
  const nameRoom = third - 2 * sizes.sidePadding - sizes.letterSpacing * sizes.widestLetters;
  return Math.min(sizes.nameMaximum, Math.max(0, nameRoom) / sizes.widestEms);
}
