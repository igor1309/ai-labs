// jsdom lays nothing out, so the width of each word of a basket's name, and
// of the words in its symbol, is given here in ems of its bold face,
// rounded up: Lexend's for the Latin words, and for the Cyrillic ones,
// which Lexend has no letters for, Manrope's (scripts/cyrillic-ems.cjs
// measures them). A word missing here fails the test that reads
// it.
export const BASKET_EMS: Record<string, number> = {
  TWO: 2.5,
  FOUR: 2.9,
  LEGS: 2.7,
  OR: 1.6,
  PLANTS: 4.1,
  MEAT: 2.9,
  BOTH: 3.0,
  FEATHERS: 5.4,
  NO: 1.7,
  NOT: 2.3,
  KNOWN: 4.2,
  YET: 2.0,
  ДВЕ: 2,
  ЧЕТЫРЕ: 4.1,
  НОГИ: 2.8,
  ИЛИ: 2.2,
  РАСТЕНИЯ: 5.4,
  МЯСО: 3.1,
  ВСЁ: 2,
  С: 0.8,
  ПЕРЬЯМИ: 4.9,
  БЕЗ: 1.9,
  ПЕРЬЕВ: 3.9,
  ПОКА: 2.9,
  НЕИЗВЕСТНО: 6.8,
  // The two-basket words, which only an upright board needs: set from
  // the measured words' widths a letter, rounded up.
  BIG: 2.2,
  SMALL: 3.7,
  HORNS: 3.8,
  БОЛЬШИЕ: 5.1,
  МАЛЕНЬКИЕ: 6.3,
  РОГАМИ: 4.3,
  РОГОВ: 3.4
};

// A space between two words of a name.
export const SPACE_EMS = 0.4;

// The words a basket's symbol carries beside its pictures.
export const MARK_EMS: Record<string, number> = { "2": 0.8, "4": 0.8, "2 4": 1.6, "?": 0.6 };
