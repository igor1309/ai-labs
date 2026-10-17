import type { Texts } from "./texts.ts";

export const en: Texts = {
  quizCard: "COMPARE",
  quizCardPicture: "TWO DINOSAURS",
  languageMenu: "Language",
  themeMenu: "Theme",
  themes: { system: "System", light: "Light", dark: "Dark" },
  turnSideways: "TURN THE IPAD SIDEWAYS",
  home: "HOME",
  progress: "PROGRESS",
  dinosaurs: "DINOSAURS",
  prompts: { mass: "WHO IS HEAVIER?", height: "WHO IS TALLER?" },
  marks: { correct: "CORRECT", wrong: "WRONG" },
  next: "NEXT",
  seeResult: "SEE RESULT",
  units: { kilograms: "KG", tonnes: "T", metres: "M" },
  celebrations: {
    "first-best": { label: "FIRST BEST SCORE", text: "FIRST BEST!" },
    "new-best": { label: "NEW BEST SCORE", text: "NEW BEST!" }
  },
  stars: (score, total) => `${score} OF ${total} STARS`,
  score: "SCORE",
  bestScore: "BEST SCORE",
  best: "BEST",
  playAgain: "PLAY AGAIN"
};
