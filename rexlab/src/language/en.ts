import type { Texts } from "./texts.ts";

export const en: Texts = {
  greeting: "PICK A GAME",
  quizCard: "COMPARE",
  quizCardPicture: "TWO DINOSAURS",
  languageMenu: "Language",
  themeMenu: "Theme",
  themes: { system: "System", light: "Light", dark: "Dark" },
  turnSideways: "TURN THE IPAD SIDEWAYS",
  home: "HOME",
  progress: "PROGRESS",
  dinosaurs: "DINOSAURS",
  versus: "VS",
  prompts: { mass: "WHO IS HEAVIER?", height: "WHO IS TALLER?" },
  marks: { correct: "RIGHT", wrong: "WRONG" },
  next: "NEXT",
  seeResult: "SEE RESULT",
  units: { kilograms: "KG", tonnes: "T", metres: "M" },
  celebrations: {
    "first-best": { label: "FIRST BEST SCORE", text: "FIRST BEST!" },
    "new-best": { label: "NEW BEST SCORE", text: "NEW BEST!" }
  },
  stars: (score, total) => `${score} OF ${total} STARS`,
  score: "SCORE",
  wellDone: "WELL DONE!",
  bestScore: "BEST SCORE",
  best: "BEST",
  playAgain: "PLAY AGAIN",
  catalogue: "ALL DINOSAURS",
  diets: { meat: "MEAT", plants: "PLANTS", both: "BOTH" },
  tall: "TALL",
  heavy: "HEAVY",
  position: "NUMBER",
  previousDinosaur: "PREVIOUS",
  nextDinosaur: "NEXT",
  sourceNote:
    "Facts checked with the Natural History Museum, London, the American Museum of Natural History, the Smithsonian National Museum of Natural History, the University of California Museum of Paleontology and Encyclopaedia Britannica."
};
