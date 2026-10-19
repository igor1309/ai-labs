// jsdom lays nothing out, so the width of each word of a basket's name, and
// of the words in its symbol, is given here in ems of its bold face,
// rounded up: Lexend's for the Latin words, and for the Cyrillic ones,
// which Lexend has no letters for, the width of a system face with a tenth
// added for the iPad's own. A word missing here fails the test that reads
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
  ДВЕ: 2.2,
  ЧЕТЫРЕ: 4.4,
  НОГИ: 3.1,
  ИЛИ: 2.4,
  РАСТЕНИЯ: 5.8,
  МЯСО: 3.4,
  ВСЁ: 2.2,
  С: 0.8,
  ПЕРЬЯМИ: 5.3,
  БЕЗ: 2.1,
  ПЕРЬЕВ: 4.2,
  ПОКА: 3.2,
  НЕИЗВЕСТНО: 7.4
};

// A space between two words of a name.
export const SPACE_EMS = 0.4;

// The words a basket's symbol carries beside its pictures.
export const MARK_EMS: Record<string, number> = { "2": 0.8, "4": 0.8, "2 4": 1.6, "?": 0.6 };
