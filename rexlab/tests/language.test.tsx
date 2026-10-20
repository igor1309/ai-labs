import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AGE_LEVEL_PICTURES } from "../src/ageLevelPictures.ts";
import { App } from "../src/App.tsx";
import { NEEDS } from "../src/care/index.ts";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LANGUAGE_KEY, localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { ResultScreen } from "../src/ResultScreen.tsx";
import { largerOf, type Attribute, type Dinosaur, type Question } from "../src/quiz/round.ts";
import { versionFooter } from "../src/root.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import type { Basket } from "../src/SortScreen.tsx";
import { boardState, type Property } from "../src/sorting/index.ts";
import { endReaction, meets, missesFor, needAsked, playVisit, trayItem, visitorShown } from "./care.ts";
import { chooseFrom, choicesIn, openMenu, outsideMenu } from "./menus.ts";
import { MISS, endWave, playBoard, showMiss, turnCard } from "./pairsApp.tsx";
import { fitAll, layOutPuzzle, skeletonOf } from "./skeletonsApp.tsx";
import { basketButton, finishBoard, openBoard, openSortingGame, sortByTrying, trayCard } from "./sorting.tsx";
import {
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  lightDevice,
  loadedPictures,
  manualViewport,
  manualTimers,
  memoryStorage,
  questionView,
  sameColour,
  seededRandom,
  sortingBy,
  symbolOf,
  unreadVersion,
  words,
  type ManualViewport,
  type ManualTimers,
  type MemoryStorage,
  featuredCard,
  gameDoor,
  unsetAgeLevel
} from "./support.ts";
import { withPictures } from "./pictures.tsx";

const QUIZ_CARD: Record<Language, string> = { en: "COMPARE", ru: "СРАВНИ" };
const BUTTONS: Record<Language, { next: string; seeResult: string; playAgain: string; home: string }> = {
  en: { next: "NEXT", seeResult: "SEE RESULT", playAgain: "PLAY AGAIN", home: "HOME" },
  ru: { next: "ДАЛЬШЕ", seeResult: "РЕЗУЛЬТАТ", playAgain: "ЕЩЁ РАЗ", home: "ДОМОЙ" }
};
const PROMPTS: Record<Language, Record<Attribute, string>> = {
  en: { mass: "WHO IS HEAVIER?", height: "WHO IS TALLER?" },
  ru: { mass: "КТО ТЯЖЕЛЕЕ?", height: "КТО ВЫШЕ?" }
};

const nothing = () => {};

const byName = (name: string, language: Language = "en"): Dinosaur => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name[language] === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

function openApp({
  device,
  storage = memoryStorage(),
  viewport = manualViewport("landscape"),
  progress = emptyProgress(),
  timers = loadedPictures(),
  nameVersion = unreadVersion
}: {
  device: string;
  storage?: MemoryStorage;
  viewport?: ManualViewport;
  progress?: ReturnType<typeof emptyProgress>;
  timers?: ReturnType<typeof loadedPictures>;
  nameVersion?: (label: string) => void;
}) {
  const view = render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(31)}
      portraitLayouts={new Set()}
      viewport={viewport}
      progress={progress}
      deviceLanguage={device}
      languageStore={localLanguage(() => storage)}
      nameVersion={nameVersion}
      {...lightDevice()} {...unsetAgeLevel()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      {...timers}
    />
  );
  return { user: userEvent.setup(), unmount: view.unmount };
}

// The app is in a language when the page says so and the home page's quiz
// tile reads in it.
function expectShownIn(language: Language) {
  expect(document.documentElement.lang).toBe(language);
  expect(words(gameDoor(QUIZ_CARD[language]))).toBe(QUIZ_CARD[language]);
}

function renderQuestion(
  language: Language,
  {
    question = { attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") },
    choice,
    last = false
  }: { question?: Question; choice?: string; last?: boolean } = {}
) {
  render(
    <QuestionScreen language={language} {...questionView(question, language, choice)} last={last} onChoose={nothing} onNext={nothing} onHome={nothing} />,
    withPictures
  );
}

describe("the first language", () => {
  it.each([
    ["ru-RU", "ru"],
    ["en-GB", "en"],
    ["de-DE", "en"],
    ["ru", "ru"],
    ["en-US", "en"],
    ["uk-UA", "en"]
  ] as const)("is the device language %s when none has been chosen: %s", (device, language) => {
    const storage = memoryStorage();
    openApp({ device, storage });

    expectShownIn(language);
    expect(storage.items.has(LANGUAGE_KEY)).toBe(false);
  });

  it.each([
    ["ru-RU", "en"],
    ["en-GB", "ru"]
  ] as const)("on a %s device is the chosen %s", (device, chosen) => {
    openApp({ device, storage: memoryStorage({ [LANGUAGE_KEY]: chosen }) });

    expectShownIn(chosen);
  });

  it.each([
    ["holds a language the app does not speak", memoryStorage({ [LANGUAGE_KEY]: "de" })],
    ["cannot be read", memoryStorage({ [LANGUAGE_KEY]: "en" }, { read: false })]
  ])("is the device language when the stored choice %s", (_, storage) => {
    openApp({ device: "ru-RU", storage });

    expectShownIn("ru");
  });
});

describe("the language menu", () => {
  it.each([
    ["en-GB", "en", "EN", "Language", "COMPARE"],
    ["ru-RU", "ru", "RU", "Язык", "СРАВНИ"]
  ] as const)(
    "is a small globe button in the soft ink in the top-right corner of the home page only, on a %s device",
    async (device, language, code, label, card) => {
      const { user } = openApp({ device });
      const button = screen.getByRole("button", { name: label });

      expect(button.textContent).toBe(code);
      expect(symbolOf(button)).toBe("globe");
      const corner = getComputedStyle(button.closest(".home-corner") ?? button);
      expect(corner.position).toBe("fixed");
      expect(corner.top).toMatch(/^[\d.]+(px|rem)$/);
      expect(corner.right).toMatch(/^[\d.]+(px|rem)$/);
      const style = getComputedStyle(button);
      // Faded as the design fades what is for parents: in its soft ink.
      expect(sameColour(style.color, PALETTE.light["ink-soft"] ?? "")).toBe(true);
      expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(within(featuredCard()).getByText(card)).fontSize) / 2);
      // A tap area for a parent's finger around the small symbol.
      expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(document.documentElement.lang).toBe(language);

      await user.click(featuredCard());

      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  );

  it.each([
    ["en-GB", "en", "Language"],
    ["ru-RU", "ru", "Язык"]
  ] as const)(
    "lists every language in its own language, the one shown ticked, on a %s device, and a tap outside changes nothing",
    async (device, language, label) => {
      const storage = memoryStorage();
      const { user } = openApp({ device, storage });

      const menu = await openMenu(user, label);

      expect(choicesIn(menu)).toEqual(
        LANGUAGES.map((option) => ({ name: LANGUAGE_NAMES[option], checked: option === language, tick: option === language }))
      );
      expect(within(menu).getAllByRole("menuitemradio").map((choice) => choice.querySelector("[lang]")?.getAttribute("lang"))).toEqual([...LANGUAGES]);

      await user.click(outsideMenu());

      expect(screen.queryByRole("menu")).toBeNull();
      expectShownIn(language);
      expect(storage.items.has(LANGUAGE_KEY)).toBe(false);
    }
  );

  it("closes once a language is chosen, and ticks it the next time it opens", async () => {
    const { user } = openApp({ device: "en-GB" });

    await chooseFrom(user, "Language", "Русский");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Язык" }).textContent).toBe("RU");
    expect(choicesIn(await openMenu(user, "Язык")).filter(({ tick }) => tick)).toEqual([{ name: "Русский", checked: true, tick: true }]);
  });

  it("keeps the chosen language when the app is closed and reopened", async () => {
    const storage = memoryStorage();
    const { user, unmount } = openApp({ device: "en-GB", storage });
    expectShownIn("en");

    await chooseFrom(user, "Language", "Русский");

    expectShownIn("ru");
    expect(storage.items.get(LANGUAGE_KEY)).toBe("ru");

    unmount();
    openApp({ device: "en-GB", storage });

    expectShownIn("ru");
  });

  it.each([
    ["ru-RU", "Версия", "Язык", "English", "ALL DINOSAURS", "Version", "HOME", "Language", "Русский"],
    ["en-GB", "Version", "Language", "Русский", "ВСЕ", "Версия", "ДОМОЙ", "Язык", "English"]
  ])(
    "names the version footer of the static page in the app's language, on %s from %s, on another screen and after switching back",
    async (device, first, menu, choice, tile, then, home, menuBack, choiceBack) => {
      // index.html's footer, named as the app in a browser names it.
      const footer = document.createElement("footer");
      footer.id = "version";
      footer.setAttribute("aria-label", "Version");
      footer.textContent = "v1.2.3";
      document.body.append(footer);
      try {
        const { user } = openApp({ device, nameVersion: versionFooter(document) });
        expect(screen.getByRole("contentinfo", { name: first })).toBe(footer);

        await chooseFrom(user, menu, choice);
        expect(screen.getByRole("contentinfo", { name: then })).toBe(footer);
        await user.click(screen.getByRole("button", { name: tile }));
        await screen.findByRole("button", { name: home });
        expect(screen.getByRole("contentinfo", { name: then })).toBe(footer);

        await user.click(screen.getByRole("button", { name: home }));
        await chooseFrom(user, menuBack, choiceBack);
        expect(screen.getByRole("contentinfo", { name: first })).toBe(footer);
      } finally {
        footer.remove();
      }
    }
  );

  // The footer is styled by its id, so its look holds under either name:
  // the soft ink on the page, the dark theme's soft ink, and the faded
  // paper on the navy result screen.
  it.each(["Version", "Версия"])("keeps the version footer's look in every theme and on the result screen when it is named %s", (name) => {
    const footer = document.createElement("footer");
    footer.id = "version";
    footer.setAttribute("aria-label", name);
    const result = document.createElement("div");
    result.className = "result";
    document.body.append(footer);
    try {
      expect([getComputedStyle(footer).position, sameColour(getComputedStyle(footer).color, "#5c647a")]).toEqual(["fixed", true]);
      document.documentElement.dataset.theme = "dark";
      expect(sameColour(getComputedStyle(footer).color, "#9ca3b6")).toBe(true);
      delete document.documentElement.dataset.theme;
      document.body.prepend(result);
      expect(sameColour(getComputedStyle(footer).color, "#f6f1e699")).toBe(true);
    } finally {
      footer.remove();
      result.remove();
      delete document.documentElement.dataset.theme;
    }
  });

  it("switches back, and the later choice is the one kept", async () => {
    const storage = memoryStorage();
    const { user, unmount } = openApp({ device: "ru-RU", storage });

    await chooseFrom(user, "Язык", "English");

    expectShownIn("en");
    unmount();
    openApp({ device: "ru-RU", storage });
    expectShownIn("en");
  });

  it("still switches for this visit when the choice cannot be saved", async () => {
    const { user } = openApp({ device: "en-GB", storage: memoryStorage({}, { save: false }) });

    await chooseFrom(user, "Language", "Русский");

    expectShownIn("ru");
  });
});

describe("Russian text", () => {
  const items: Array<[string, () => HTMLElement, string]> = [
    [
      "quiz tile",
      () => {
        openApp({ device: "ru-RU" });
        return gameDoor("СРАВНИ");
      },
      "СРАВНИ"
    ],
    [
      "mass prompt",
      () => {
        renderQuestion("ru", { question: { attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") } });
        return screen.getByRole("heading");
      },
      "КТО ТЯЖЕЛЕЕ?"
    ],
    [
      "height prompt",
      () => {
        renderQuestion("ru", { question: { attribute: "height", left: byName("Triceratops"), right: byName("Velociraptor") } });
        return screen.getByRole("heading");
      },
      "КТО ВЫШЕ?"
    ],
    [
      "Next button",
      () => {
        renderQuestion("ru", { choice: "triceratops" });
        return screen.getByRole("button", { name: "ДАЛЬШЕ" });
      },
      "ДАЛЬШЕ"
    ],
    [
      "See result button",
      () => {
        renderQuestion("ru", { choice: "triceratops", last: true });
        return screen.getByRole("button", { name: "РЕЗУЛЬТАТ" });
      },
      "РЕЗУЛЬТАТ"
    ],
    [
      "Play again button",
      () => {
        render(<ResultScreen language="ru" score={6} total={10} best={8} beaten={undefined} celebration={null} hero={fakeBodyPicture("tyrannosaurus")} onPlayAgain={nothing} onHome={nothing} />, withPictures);
        return screen.getByRole("button", { name: "ЕЩЁ РАЗ" });
      },
      "ЕЩЁ РАЗ"
    ],
    [
      "Home button",
      () => {
        renderQuestion("ru");
        return screen.getByRole("button", { name: "ДОМОЙ" });
      },
      "ДОМОЙ"
    ],
    [
      "name of Triceratops",
      () => {
        renderQuestion("ru");
        return within(screen.getByRole("group", { name: "ДИНОЗАВРЫ" })).getByRole("button", { name: "Трицератопс" });
      },
      "ТРИЦЕРАТОПС"
    ]
  ];

  it.each(items)("reads the %s in Russian", (_, show, text) => {
    expect(words(show())).toBe(text);
  });

  it("reads the Home button on the result in Russian too", () => {
    render(<ResultScreen language="ru" score={6} total={10} best={8} beaten={undefined} celebration={null} hero={fakeBodyPicture("tyrannosaurus")} onPlayAgain={nothing} onHome={nothing} />, withPictures);

    expect(words(screen.getByRole("button", { name: "ДОМОЙ" }))).toBe("ДОМОЙ");
  });
});

// The board is shown through the sorting game and the screen's props: a
// whole board of each property, to SEE RESULT.
describe("the sorting board", () => {
  const BASKET_NAMES: Record<Language, Record<Property, [string, string]>> = {
    en: {
      legs: ["TWO LEGS", "FOUR LEGS"],
      diet: ["PLANTS", "MEAT"],
      size: ["BIG", "SMALL"],
      horns: ["HORNS", "NO HORNS"],
      feathers: ["FEATHERS", "NO FEATHERS"]
    },
    ru: {
      legs: ["ДВЕ НОГИ", "ЧЕТЫРЕ НОГИ"],
      diet: ["РАСТЕНИЯ", "МЯСО"],
      size: ["БОЛЬШИЕ", "МАЛЕНЬКИЕ"],
      horns: ["С РОГАМИ", "БЕЗ РОГОВ"],
      feathers: ["С ПЕРЬЯМИ", "БЕЗ ПЕРЬЕВ"]
    }
  };
  const PROMPT: Record<Language, string> = { en: "SORT THE DINOSAURS", ru: "РАЗЛОЖИ ДИНОЗАВРОВ" };
  const FOREIGN: Record<Language, RegExp> = { en: /[А-Яа-яЁё]/, ru: /[A-Za-z]/ };

  // Every text in the document and every name read out, as now shown.
  const shown = () => [
    // The hidden gate stays mounted so it can fade over the board.
    ...[...document.body.querySelectorAll("*")].filter((element) => !element.closest('.orientation-gate[aria-hidden="true"]')).flatMap((element) =>
      [...element.childNodes].flatMap((node) => (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() ? [node.textContent.trim()] : []))
    ),
    ...[...document.body.querySelectorAll("[aria-label]"), ...document.body.querySelectorAll("img[alt]")].filter((element) => !element.closest('.orientation-gate[aria-hidden="true"]')).map(
      (element) => element.getAttribute("aria-label") ?? element.getAttribute("alt") ?? ""
    )
  ];

  it.each(LANGUAGES.flatMap((language) => (Object.keys(BASKET_NAMES[language]) as Property[]).map((property) => [language, property] as const)))(
    "reads in %s, sorting by %s, every text for children in capitals",
    async (language, property) => {
      const user = userEvent.setup();
      const sorting = sortingBy(property);
      openBoard(sorting, language);
      const [missed, ...rest] = boardState(sorting).cards;
      if (!missed) throw new Error("The board has no cards");
      const [first, second] = boardState(sorting).baskets;
      const seen = [...shown()];

      expect(words(screen.getByRole("heading"))).toBe(PROMPT[language]);
      expect([first, second].map((basket) => words(basketButton(basket, language)))).toEqual(BASKET_NAMES[language][property]);
      expect(words(screen.getByRole("button", { name: BUTTONS[language].home }))).toBe(BUTTONS[language].home);
      await user.click(trayCard(missed, language));
      await user.click(basketButton(missed.basket === first ? second : first, language));
      seen.push(...shown());
      for (const card of [missed, ...rest]) {
        await user.click(trayCard(card, language));
        await user.click(basketButton(card.basket as Basket, language));
      }
      expect(words(screen.getByRole("button", { name: BUTTONS[language].seeResult }))).toBe(BUTTONS[language].seeResult);
      seen.push(...shown());

      const texts = seen.filter((text) => !/^\d+$/.test(text));
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((text) => FOREIGN[language].test(text))).toEqual([]);
      // Names are read out as written; every text shown is in capitals.
      const names = boardState(sorting).cards.map(({ dinosaur }) => dinosaur.name[language]);
      expect(texts.filter((text) => !names.includes(text) && text !== text.toLocaleUpperCase(language))).toEqual([]);
    }
  );
});

// The result is reached through the sorting game, its screens' props and
// its progress store.
describe("the sorting result", () => {
  it("reads in Russian, every text for children in capitals", async () => {
    const { user, nextBoard } = openSortingGame({ language: "ru" });

    await finishBoard(user, nextBoard(), 4, "ru");

    expect(screen.getByLabelText("СЧЁТ").textContent).toBe("4/6");
    expect(screen.getByRole("img", { name: "4 ИЗ 6 ЗВЁЗД" })).toBeDefined();
    expect(words(screen.getByRole("status"))).toBe("ПЕРВЫЙ РЕКОРД!");
    expect(words(screen.getByRole("heading"))).toBe("МОЛОДЕЦ!");
    const best = screen.getByLabelText("РЕКОРД");
    expect([best.firstChild?.textContent, best.querySelector(".best-score-value")?.textContent]).toEqual(["РЕКОРД", "4"]);
    expect([BUTTONS.ru.playAgain, BUTTONS.ru.home].map((name) => words(screen.getByRole("button", { name })))).toEqual(["ЕЩЁ РАЗ", "ДОМОЙ"]);
  });
});

describe("revealed values", () => {
  it.each<[Language, Question, string, string]>([
    ["en", { attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") }, "7 T", "15 KG"],
    ["ru", { attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") }, "7 Т", "15 КГ"],
    ["en", { attribute: "height", left: byName("Brachiosaurus"), right: byName("Stegosaurus") }, "3.4 M", "1.5 M"],
    ["ru", { attribute: "height", left: byName("Brachiosaurus"), right: byName("Stegosaurus") }, "3,4 М", "1,5 М"]
  ])("are written in %s", (language, question, leftValue, rightValue) => {
    renderQuestion(language, { question, choice: question.left.id });

    const cards = within(screen.getByRole("group")).getAllByRole("button");
    expect(cards.map((card) => card.querySelector(".dinosaur-value")?.textContent)).toEqual([leftValue, rightValue]);
  });
});

// The labels of the home page's menus for parents.
const PARENT_CONTROLS: Record<Language, string[]> = { en: ["Language", "Theme", "Age level"], ru: ["Язык", "Тема", "Возрастной уровень"] };

// The age levels' names, the children's words in the menu for parents,
// in capitals, and their ages, a parents' footnote, in normal case.
const levelNames = (language: Language) => Object.values(TEXTS[language].ageLevels).map(({ name }) => name);
const levelAges = (language: Language) => Object.values(TEXTS[language].ageLevels).map(({ age }) => age);

// The app's name, a wordmark for parents, written the same in every
// language.
const BRAND = "RexLab";

// What the child is shown on screens, recorded as a walk over them in a
// language goes.
type Seen = {
  // Every visible word and every label read out, outside what is for
  // parents.
  texts: string[];
  // The labels that are a dinosaur's own name, kept as the list writes it.
  names: string[];
  // Every visible word for parents: in the menus and the wordmark.
  parentTexts: string[];
  // The labels read out in the menus for parents.
  parentLabels: string[];
};

// A walk over screens in `language`, on an app opened on the home page of
// a device in it, or on the screen it is opened on: `look` records what
// the screen shows now in `seen`.
type Play = {
  language: Language;
  user: UserEvent;
  viewport: ManualViewport;
  timers: ManualTimers;
  look: () => void;
  seen: Seen;
};

// A compare-dinosaurs record of a best score of 5 from one round.
const BEST_OF_5 = JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 5, roundsPlayed: 1 } } });

function openPlay(language: Language, progressStorage = memoryStorage()): Play {
  const viewport = manualViewport("landscape");
  const timers = manualTimers();
  const { user } = openApp({
    device: language === "ru" ? "ru-RU" : "en-GB",
    viewport,
    progress: localProgress(() => progressStorage),
    timers
  });
  const seen: Seen = { texts: [], names: [], parentTexts: [], parentLabels: [] };
  const isName = (label: string) => SHIPPED_DINOSAURS.some((dinosaur) => dinosaur.name[language] === label);

  const look = () => {
    const controls = [
      ...PARENT_CONTROLS[language].flatMap((name) => screen.queryAllByRole("button", { name })),
      // Each menu by its label, a closed one too as it animates out,
      // hidden and so unnamed for a screen reader.
      ...[...document.querySelectorAll('[role="menu"]')].filter((menu) => PARENT_CONTROLS[language].includes(menu.getAttribute("aria-label") ?? "")),
      ...screen.queryAllByText(BRAND),
      ...screen.queryAllByText(TEXTS[language].sourceNote),
      ...screen.queryAllByText(TEXTS[language].portraitLayoutComing)
    ];
    // Both gate layers stay mounted; only the exposed layer is shown.
    const covered = (element: Element | null) => element?.closest('.orientation-gate[aria-hidden="true"], .gated-screen[aria-hidden="true"]');
    const forParents = (node: Node) => controls.some((control) => control.contains(node));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || covered(node.parentElement)) continue;
      (forParents(node) ? seen.parentTexts : seen.texts).push(node.textContent);
    }
    for (const element of document.body.querySelectorAll("[aria-label]")) {
      if (covered(element)) continue;
      const label = element.getAttribute("aria-label") ?? "";
      if (forParents(element)) seen.parentLabels.push(label);
      else if (isName(label)) seen.names.push(label);
      else seen.texts.push(label);
    }
    for (const picture of document.body.querySelectorAll("img")) {
      if (covered(picture)) continue;
      const label = picture.alt;
      (isName(label) ? seen.names : seen.texts).push(label);
    }
  };

  return { language, user, viewport, timers, look, seen };
}

function shownQuestion(language: Language): Question {
  const heading = screen.getByRole("heading").textContent ?? "";
  const attribute: Attribute = heading.includes(PROMPTS[language].mass) ? "mass" : "height";
  const [left, right] = within(screen.getByRole("group"))
    .getAllByRole("button")
    .map((card) => byName(card.getAttribute("aria-label") ?? "", language));
  if (!left || !right) throw new Error("Expected two dinosaur cards");
  return { attribute, left, right };
}

// Plays a round from its first question, the first `correct` answers
// right and the rest wrong, looking at each question before and after its
// answer and at the result.
async function playRound({ language, user, look }: Play, correct: number) {
  for (let number = 1; number <= 10; number++) {
    const question = shownQuestion(language);
    const larger = largerOf(question);
    const tapped = number <= correct ? larger : larger === question.left ? question.right : question.left;
    look();
    await user.click(within(screen.getByRole("group")).getByRole("button", { name: tapped.name[language] }));
    look();
    await user.click(screen.getByRole("button", { name: number < 10 ? BUTTONS[language].next : BUTTONS[language].seeResult }));
  }
  look();
}

// Plays the visit on the stage to its result, each need refused once
// first when `refuse` is set, looking at every state of it.
async function lookThroughVisit({ user, timers, look }: Play, refuse: boolean) {
  for (let need = needAsked(); need !== undefined; need = needAsked()) {
    const visitor = visitorShown();
    look();
    if (refuse) {
      await user.click(trayItem(missesFor(visitor, need)));
      look();
      endReaction(timers);
      look();
    }
    await user.click(trayItem(meets(visitor, need)));
    look();
    endReaction(timers);
  }
  look();
  endReaction(timers);
  look();
}

async function homeAndMenus(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, viewport, look } = play;
  look();
  for (const label of PARENT_CONTROLS[language]) {
    await openMenu(user, label);
    look();
    await user.click(outsideMenu());
  }
  act(() => viewport.turn("portrait"));
  look();
  return play.seen;
}

async function roundWithMistakes(language: Language): Promise<Seen> {
  const play = openPlay(language);
  await play.user.click(gameDoor(QUIZ_CARD[language]));
  await playRound(play, 5);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  return play.seen;
}

// The second round, without mistakes, beats the best of the first one.
async function roundWithoutMistakes(language: Language): Promise<Seen> {
  const play = openPlay(language, memoryStorage({ [PROGRESS_KEY]: BEST_OF_5 }));
  const { user, look } = play;
  await user.click(gameDoor(QUIZ_CARD[language]));
  await playRound(play, 10);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: BUTTONS[language].home }));
  look();
  return play.seen;
}

// The catalogue, and the page of a dinosaur of each food type, the first
// reached from its card, the others by the arrows, the last round from
// the first.
async function catalogue(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, look } = play;
  const text = TEXTS[language];
  await user.click(screen.getByRole("button", { name: text.catalogueTile }));
  look();
  await user.click(within(screen.getByRole("group", { name: text.catalogue })).getByRole("button", { name: byName("Gallimimus").name[language] }));
  look();
  await user.click(screen.getByRole("button", { name: text.previousDinosaur }));
  look();
  await user.click(screen.getByRole("button", { name: text.catalogue }));
  await user.click(within(screen.getByRole("group", { name: text.catalogue })).getAllByRole("button")[0] ?? document.body);
  await user.click(screen.getByRole("button", { name: text.previousDinosaur }));
  look();
  await user.click(screen.getByRole("button", { name: text.nextDinosaur }));
  look();
  await user.click(screen.getByRole("button", { name: text.catalogue }));
  await user.click(screen.getByRole("button", { name: BUTTONS[language].home }));
  look();
  return play.seen;
}

async function careWelcome(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, look } = play;
  const text = TEXTS[language];
  await user.click(screen.getByRole("button", { name: text.care }));
  look();
  await user.click(screen.getByRole("button", { name: text.friends }));
  look();
  return play.seen;
}

async function visitWithRefusals(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const text = TEXTS[language];
  await play.user.click(screen.getByRole("button", { name: text.care }));
  await play.user.click(screen.getByRole("button", { name: text.newVisitor }));
  await lookThroughVisit(play, true);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  return play.seen;
}

// The second visit, without a refusal, beats the first one's hearts.
async function visitWithoutRefusals(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, timers, look } = play;
  const text = TEXTS[language];
  await user.click(screen.getByRole("button", { name: text.care }));
  await user.click(screen.getByRole("button", { name: text.newVisitor }));
  await playVisit(user, timers, NEEDS);
  await user.click(screen.getByRole("button", { name: text.newVisitor }));
  await lookThroughVisit(play, false);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: text.friends }));
  look();
  await user.click(screen.getByRole("button", { name: text.back }));
  look();
  await user.click(screen.getByRole("button", { name: text.home }));
  look();
  return play.seen;
}

// A board of the sorting game reached from the home page, each card tried
// on the first basket and, after a miss, the other, then its result, a
// second board from PLAY AGAIN and the home page again.
async function sortingRounds(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, look } = play;
  const text = TEXTS[language];
  await user.click(screen.getByRole("button", { name: text.sort }));
  look();
  await sortByTrying(user, language, look);
  await user.click(screen.getByRole("button", { name: text.seeResult }));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  look();
  await user.click(screen.getByRole("button", { name: text.playAgain }));
  look();
  await user.click(screen.getByRole("button", { name: text.home }));
  look();
  return play.seen;
}

// Find the pair: its welcome, Hatchling chosen on its switch, a board with
// a card open, a miss, found pairs and the cards waving, its result with a
// first best, the home page again, and the catalogue and a page with the
// dinosaurs found.
async function findThePair(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, timers, look } = play;
  const text = TEXTS[language];
  await user.click(screen.getByRole("button", { name: text.pairs }));
  look();
  await user.click(screen.getByRole("button", { name: text.ageLevels.hatchling.name }));
  look();
  await user.click(screen.getByRole("button", { name: text.play }));
  look();
  await turnCard(user, 0);
  look();
  await showMiss(user);
  look();
  act(() => timers.fire(MISS));
  await playBoard(user, timers);
  look();
  endWave(timers);
  look();
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: text.home }));
  look();
  await user.click(screen.getByRole("button", { name: text.catalogueTile }));
  look();
  const catalogue = screen.getByRole("group", { name: text.catalogue });
  await user.click(within(catalogue).getAllByRole("button")[0] as HTMLElement);
  look();
  return play.seen;
}

// The skeleton game: its home tile, its choice of dinosaurs, a puzzle as
// it starts, its reveal with a first best, the choice again with the star
// earned, the museum with the skeleton on its stand, its puzzle as it is
// knocked down, the museum with its stand awaiting it, and the home page
// again with the best on the tile.
async function skeletons(language: Language): Promise<Seen> {
  const play = openPlay(language);
  const { user, timers, look } = play;
  const text = TEXTS[language];
  const triceratops = skeletonOf("triceratops");
  look();
  await user.click(screen.getByRole("button", { name: text.skeletons }));
  look();
  await user.click(screen.getByRole("button", { name: triceratops.name[language].toLocaleUpperCase(language) }));
  expect(screen.getByRole("group", { name: text.bones })).toBeDefined();
  look();
  layOutPuzzle();
  fitAll(triceratops);
  act(() => timers.fire(REVEAL.motion));
  expect(screen.getAllByRole("status")).toHaveLength(1);
  look();
  await user.click(screen.getByRole("button", { name: text.buildAnother }));
  expect(screen.getAllByRole("img", { name: text.star })).toHaveLength(1);
  look();
  await user.click(screen.getByRole("button", { name: text.museum }));
  look();
  await user.click(screen.getByRole("button", { name: text.rebuild }));
  expect(screen.getByRole("group", { name: text.bones })).toBeDefined();
  look();
  await user.click(screen.getByRole("button", { name: text.museum }));
  expect(screen.getByRole("button", { name: text.keepBuilding })).toBeDefined();
  look();
  await user.click(screen.getByRole("button", { name: text.home }));
  expect(screen.getByRole("button", { name: text.skeletons }).textContent).toBe(`${text.skeletons}1`);
  look();
  return play.seen;
}

// What a part shows for parents: its words, the language menu's codes
// aside, and the labels read out.
type ForParents = (language: Language) => { words: string[]; labels: string[] };

const NOTHING_FOR_PARENTS: ForParents = () => ({ words: [], labels: [] });
const HOME_PAGE: ForParents = (language) => ({ words: [BRAND], labels: PARENT_CONTROLS[language] });

// What the child is shown on every screen and in every state, by part,
// each part walked from a newly opened app: one walk over them all
// outlasts a test's time limit on CI. Together they are the home page with
// each menu for parents closed and open, the portrait gate, two rounds,
// one with mistakes and one without, and both results, the catalogue, and
// care: its welcome, its friends with none yet, a visit with each need
// refused once and one without, both results and the friends made,
// the sorting game: a board with wrong drops, its result and the next
// board, find the pair from its welcome to the dinosaurs found, and the
// skeleton game's choice, a puzzle, its reveal and its museum.
const PARTS: Array<[string, (language: Language) => Promise<Seen>, ForParents]> = [
  [
    "the home page and its menus",
    homeAndMenus,
    (language) => ({
      words: [BRAND, TEXTS[language].portraitLayoutComing, ...OWN_NAMES, ...Object.values(TEXTS[language].themes), ...levelNames(language), ...levelAges(language)],
      labels: PARENT_CONTROLS[language]
    })
  ],
  ["a round with mistakes and its result", roundWithMistakes, NOTHING_FOR_PARENTS],
  ["a round without mistakes, its result and the home page again", roundWithoutMistakes, HOME_PAGE],
  [
    "the catalogue",
    catalogue,
    (language) => ({ words: [BRAND, TEXTS[language].sourceNote], labels: PARENT_CONTROLS[language] })
  ],
  ["care's welcome and its friends", careWelcome, NOTHING_FOR_PARENTS],
  ["a visit with each need refused once and its result", visitWithRefusals, NOTHING_FOR_PARENTS],
  ["a visit without a refusal, its result, the friends made and the home page again", visitWithoutRefusals, HOME_PAGE],
  ["a sorting board with wrong drops, its result, the next board and the home page again", sortingRounds, HOME_PAGE],
  [
    "find the pair, its result, and the dinosaurs found in the catalogue",
    findThePair,
    (language) => ({ words: [BRAND, TEXTS[language].sourceNote], labels: PARENT_CONTROLS[language] })
  ],
  ["the skeleton game's tile, its choice of dinosaurs, a puzzle, its reveal, the choice again, the museum, a rebuild and the home page again", skeletons, HOME_PAGE]
];

const CASES = LANGUAGES.flatMap((language) => PARTS.map(([part, walk, forParents]) => [language, part, walk, forParents] as const));

// The language menu's codes, "EN" and "RU", read the same in every
// language, and so does each language's name in it, written in itself.
const CODES = new Set(LANGUAGES.map((code) => code.toUpperCase()));
const OWN_NAMES = new Set(Object.values(LANGUAGE_NAMES));

// The age levels' pictures, on the age level menu's button and choices,
// have no letters and no case.
const PICTURES = new Set(Object.values(AGE_LEVEL_PICTURES));

// The app's strings are checked by script: a text left in English shows up
// as Latin letters in Russian, and the other way round. Only the language
// menu's codes and names and the wordmark read the same in both.
describe("every string shown", () => {
  const FOREIGN: Record<Language, RegExp> = { en: /[А-Яа-яЁё]/, ru: /[A-Za-z]/ };
  const SAME_IN_EVERY_LANGUAGE = new Set([...CODES, ...OWN_NAMES, BRAND]);

  it.each(CASES)("is in %s, on %s", async (language, _, walk) => {
    const { texts, names, parentTexts, parentLabels } = await walk(language);
    const seen = [...texts, ...names, ...parentTexts.filter((text) => !SAME_IN_EVERY_LANGUAGE.has(text)), ...parentLabels];

    expect(texts.length).toBeGreaterThan(0);
    expect(seen.filter((text) => FOREIGN[language].test(text))).toEqual([]);
  });
});

// The version footer, also for parents, is part of the static page, not
// the app: release.test.ts proves it reads the version as stamped, and
// the test of its name above that the app names it in the chosen
// language.
describe("text for children", () => {
  it.each(CASES)("is in capitals in %s on %s, but not the menus and the wordmark for parents, save the age levels' names", async (language, _, walk, forParents) => {
    const { texts, parentTexts, parentLabels } = await walk(language);
    const shown = forParents(language);

    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect(new Set(parentLabels)).toEqual(new Set(shown.labels));
    const words = parentTexts.filter((text) => !CODES.has(text) && !PICTURES.has(text));
    expect(new Set(words)).toEqual(new Set(shown.words));
    const names = levelNames(language);
    expect(words.filter((text) => names.includes(text) !== (text === text.toLocaleUpperCase(language)))).toEqual([]);
  });

  // Every dictionary entry, including those only shown in a state the
  // round above may not reach, such as either celebration.
  it.each(["en", "ru"] as const)("is written in capitals in the %s dictionary, all but the menus for parents, save the age levels' names", (language) => {
    const { languageMenu, themeMenu, themes, ageLevelMenu, ageLevels, versionLabel, sourceNote, portraitLayoutComing, stars, heartsOf, ...forChildren } = TEXTS[language];
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>).flatMap(strings);
    const texts = [...strings(forChildren), ...levelNames(language), stars(7, 10), heartsOf(6, 8)];

    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect([languageMenu, themeMenu, ageLevelMenu]).toEqual(PARENT_CONTROLS[language]);
    expect([...Object.values(themes), ...levelAges(language), versionLabel, sourceNote, portraitLayoutComing].filter((text) => text === text.toLocaleUpperCase(language))).toEqual([]);
  });
});
