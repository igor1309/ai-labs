import { en } from "./en.ts";
import type { Language } from "./language.ts";
import { ru } from "./ru.ts";

// Every string the app shows or reads out, in one language. Both
// dictionaries are typed by it, so a text missing from one fails the
// typecheck. Children are just learning to read, so every text for them,
// shown or read out, is written in capitals here rather than styled so.
export type Texts = {
  quizCard: string;
  quizCardPicture: string;
  // The language switch is for parents, so its label is in normal case.
  languageSwitch: string;
  turnSideways: string;
  home: string;
  progress: string;
  dinosaurs: string;
  prompts: { mass: string; height: string };
  marks: { correct: string; wrong: string };
  next: string;
  seeResult: string;
  units: { kilograms: string; tonnes: string; metres: string };
  celebrations: { "first-best": Celebrated; "new-best": Celebrated };
  stars: (score: number, total: number) => string;
  score: string;
  bestScore: string;
  best: string;
  playAgain: string;
};

// A celebration's label, read out, and its text, shown.
type Celebrated = { label: string; text: string };

export const TEXTS: Record<Language, Texts> = { en, ru };
