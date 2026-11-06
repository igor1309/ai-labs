// jsdom lays nothing out, so the width of each age level's name and age
// is given here in ems of its face, rounded up: Lexend's for the Latin
// words, and Manrope's for the Cyrillic ones, which Lexend has no letters
// for (scripts/cyrillic-ems.cjs measures them). The names at their bold, the chosen one's; the ages at
// their regular weight.
export const LEVEL_EMS: Record<string, number> = {
  HATCHLING: 6.3,
  EXPLORER: 5.5,
  PALEONTOLOGIST: 9.7,
  ДЕТЁНЫШ: 5.2,
  ИССЛЕДОВАТЕЛЬ: 8.9,
  ПАЛЕОНТОЛОГ: 7.7,
  "about 4": 3.8,
  "about 5": 3.8,
  "6 and up": 4.3,
  "около 4 лет": 5.4,
  "около 5 лет": 5.4,
  "6 лет и старше": 6.9
};
