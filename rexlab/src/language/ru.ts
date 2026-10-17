import type { Texts } from "./texts.ts";

export const ru: Texts = {
  greeting: "ВЫБЕРИ ИГРУ",
  quizCard: "СРАВНИ",
  quizCardPicture: "ДВА ДИНОЗАВРА",
  languageMenu: "Язык",
  themeMenu: "Тема",
  themes: { system: "Системная", light: "Светлая", dark: "Тёмная" },
  turnSideways: "ПОВЕРНИ ПЛАНШЕТ БОКОМ",
  home: "ДОМОЙ",
  progress: "ПРОГРЕСС",
  dinosaurs: "ДИНОЗАВРЫ",
  versus: "ИЛИ",
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
  wellDone: "МОЛОДЕЦ!",
  bestScore: "РЕКОРД",
  best: "РЕКОРД",
  playAgain: "ЕЩЁ РАЗ",
  catalogue: "ВСЕ ДИНОЗАВРЫ",
  diets: { meat: "МЯСО", plants: "РАСТЕНИЯ", both: "ВСЁ" },
  tall: "РОСТ",
  heavy: "ВЕС",
  position: "НОМЕР",
  previousDinosaur: "НАЗАД",
  nextDinosaur: "ДАЛЬШЕ",
  sourceNote:
    "Факты сверены с Музеем естествознания в Лондоне, Американским музеем естественной истории, Национальным музеем естественной истории Смитсоновского института, Музеем палеонтологии Калифорнийского университета и Британской энциклопедией."
};
