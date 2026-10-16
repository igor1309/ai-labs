import type { Texts } from "./texts.ts";

export const ru: Texts = {
  quizCard: "СРАВНИ",
  quizCardPicture: "ДВА ДИНОЗАВРА",
  languageSwitch: "Язык",
  themeSwitch: "Тема",
  themes: { system: "Системная", light: "Светлая", dark: "Тёмная" },
  turnSideways: "ПОВЕРНИ ПЛАНШЕТ БОКОМ",
  home: "ДОМОЙ",
  progress: "ПРОГРЕСС",
  dinosaurs: "ДИНОЗАВРЫ",
  prompts: { mass: "КТО ТЯЖЕЛЕЕ?", height: "КТО ВЫШЕ?" },
  marks: { correct: "ВЕРНО", wrong: "НЕВЕРНО" },
  next: "ДАЛЬШЕ",
  seeResult: "РЕЗУЛЬТАТ",
  units: { kilograms: "КГ", tonnes: "Т", metres: "М" },
  celebrations: {
    "first-best": { label: "ПЕРВЫЙ РЕКОРД", text: "ПЕРВЫЙ РЕКОРД!" },
    "new-best": { label: "НОВЫЙ РЕКОРД", text: "НОВЫЙ РЕКОРД!" }
  },
  // "ИЗ 10 ЗВЁЗД" takes the same form whatever the score, so no plural
  // rules are needed.
  stars: (score, total) => `${score} ИЗ ${total} ЗВЁЗД`,
  score: "СЧЁТ",
  bestScore: "РЕКОРД",
  best: "РЕКОРД",
  playAgain: "ЕЩЁ РАЗ"
};
