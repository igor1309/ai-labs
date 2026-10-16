import type { Celebration } from "../quiz/progress.ts";
import type { Attribute } from "../quiz/round.ts";
import { en } from "./en.ts";
import type { Language } from "./language.ts";
import { ru } from "./ru.ts";

// Every string the app shows or reads out, in one language. Both
// dictionaries are typed by it, so a text missing from one fails the
// typecheck.
export type Texts = {
  quizCard: string;
  quizCardPicture: string;
  languageSwitch: string;
  turnSideways: string;
  home: string;
  progress: string;
  dinosaurs: string;
  prompts: Record<Attribute, string>;
  marks: { correct: string; wrong: string };
  next: string;
  seeResult: string;
  units: { kilograms: string; tonnes: string; metres: string };
  celebrations: Record<Celebration, { label: string; text: string }>;
  stars: (score: number, total: number) => string;
  score: string;
  bestScore: string;
  best: string;
  playAgain: string;
};

export const TEXTS: Record<Language, Texts> = { en, ru };
