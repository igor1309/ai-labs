import type { Texts } from "./texts.ts";

export const ru: Texts = {
  quizCard: "СРАВНИ",
  quizCardPicture: "Два динозавра",
  languageSwitch: "Язык",
  turnSideways: "Поверни планшет боком",
  home: "Домой",
  progress: "Прогресс",
  dinosaurs: "Динозавры",
  prompts: { mass: "Кто тяжелее?", height: "Кто выше?" },
  marks: { correct: "Верно", wrong: "Неверно" },
  next: "Дальше",
  seeResult: "Результат",
  units: { kilograms: "кг", tonnes: "т", metres: "м" },
  celebrations: {
    "first-best": { label: "Первый рекорд", text: "ПЕРВЫЙ РЕКОРД!" },
    "new-best": { label: "Новый рекорд", text: "НОВЫЙ РЕКОРД!" }
  },
  // "из 10 звёзд" takes the same form whatever the score, so no plural
  // rules are needed.
  stars: (score, total) => `${score} из ${total} звёзд`,
  score: "Счёт",
  bestScore: "Рекорд",
  best: "Рекорд",
  playAgain: "Ещё раз"
};
