import { en } from "./en.ts";
import type { Language } from "./language.ts";
import { ru } from "./ru.ts";

// Every string the app shows or reads out, in one language. Both
// dictionaries are typed by it, so a text missing from one fails the
// typecheck. Children are just learning to read, so every text for them,
// shown or read out, is written in capitals here rather than styled so.
export type Texts = {
  greeting: string;
  quizCard: string;
  quizCardPicture: string;
  // The language menu is for parents, so its label is in normal case.
  languageMenu: string;
  // So is the theme menu, with its label and its choices.
  themeMenu: string;
  themes: { system: string; light: string; dark: string };
  turnSideways: string;
  home: string;
  progress: string;
  dinosaurs: string;
  // Between the two dinosaur cards.
  versus: string;
  prompts: { mass: string; height: string };
  marks: { correct: string; wrong: string };
  next: string;
  seeResult: string;
  units: { kilograms: string; tonnes: string; metres: string };
  celebrations: { "first-best": Celebrated; "new-best": Celebrated };
  stars: (score: number, total: number) => string;
  score: string;
  wellDone: string;
  bestScore: string;
  best: string;
  playAgain: string;
  // The catalogue of every dinosaur: its title, also on its home tile.
  catalogue: string;
  diets: { meat: string; plants: string; both: string };
  tall: string;
  heavy: string;
  // A dinosaur's place in the catalogue, such as "1 / 30".
  position: string;
  previousDinosaur: string;
  nextDinosaur: string;
  // The note under a dinosaur's facts is for parents, so it is in normal
  // case: it names the sources the facts were checked with.
  sourceNote: string;
};

// A celebration's label, read out, and its text, shown.
type Celebrated = { label: string; text: string };

export const TEXTS: Record<Language, Texts> = { en, ru };
