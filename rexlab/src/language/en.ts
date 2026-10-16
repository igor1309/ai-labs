import type { Texts } from "./texts.ts";

export const en: Texts = {
  quizCard: "COMPARE",
  quizCardPicture: "Two dinosaurs",
  languageSwitch: "Language",
  turnSideways: "Turn the iPad sideways",
  home: "Home",
  progress: "Progress",
  dinosaurs: "Dinosaurs",
  prompts: { mass: "Who is heavier?", height: "Who is taller?" },
  marks: { correct: "Correct", wrong: "Wrong" },
  next: "Next",
  seeResult: "See result",
  units: { kilograms: "kg", tonnes: "t", metres: "m" },
  celebrations: {
    "first-best": { label: "First best score", text: "FIRST BEST!" },
    "new-best": { label: "New best score", text: "NEW BEST!" }
  },
  stars: (score, total) => `${score} of ${total} stars`,
  score: "Score",
  bestScore: "Best score",
  best: "Best",
  playAgain: "Play again"
};
