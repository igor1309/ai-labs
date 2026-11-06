// The width of each word on DIG's FIELD GUIDE, in ems of its face,
// rounded up: Lexend's for the Latin words, and Manrope's for the
// Cyrillic ones, which Lexend has no letters for (scripts/cyrillic-ems.cjs
// measures them). The title and names at
// their bold, HOME and BACK at their semibold. A word missing here fails
// the test that reads it.
export const EMS: Record<string, number> = {
  SHELL: 3.3,
  TOOTH: 3.8,
  AMBER: 3.7,
  EGG: 2.3,
  NEST: 2.8,
  GOLDEN: 4.5,
  FOSSIL: 3.9,
  РАКУШКА: 4.9,
  ЗУБ: 2,
  ЯНТАРЬ: 4,
  ГНЕЗДО: 4.1,
  С: 0.8,
  ЯЙЦАМИ: 4.5,
  ЗОЛОТАЯ: 4.9,
  ОКАМЕНЕЛОСТЬ: 8.4,
  "FIELD GUIDE": 7.1,
  "ПОЛЕВОЙ ДНЕВНИК": 10,
  HOME: 3.1,
  BACK: 2.9,
  ДОМОЙ: 3.8,
  НАЗАД: 3.5,
  "5/5": 1.8
};
