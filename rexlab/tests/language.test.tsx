import packageInfo from "../package.json";
import { emptyLabyrinth, largestSize } from "./support.ts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AGE_LEVEL_PICTURES } from "../src/ageLevelPictures.ts";
import { App } from "../src/App.tsx";
import { LANGUAGE_FLAGS, LANGUAGE_NAMES, LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LANGUAGE_KEY, localLanguage } from "../src/localLanguage.ts";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { ResultScreen } from "../src/ResultScreen.tsx";
import { correctOf, type Dinosaur, type Question } from "../src/quiz/round.ts";
import { versionFooter } from "../src/root.ts";
import type { Basket } from "../src/SortScreen.tsx";
import { boardState, type Property } from "../src/sorting/index.ts";
import { chooseFrom, choicesIn, openMenu, outsideMenu } from "./menus.ts";
import { basketButton, openBoard, trayCard } from "./sorting.tsx";
import {
  SHIPPED_PALS,
  SHIPPED_SKELETONS,
  fakeItemPicture,
  fakeSkeletonPicture,
  keptNothing,
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
  pageAtRest,
  questionView,
  sameColour,
  seededRandom,
  sortingBy,
  unreadVersion,
  words,
  type ManualViewport,
  type MemoryStorage,
  featuredCard,
  gameDoor,
  unsetAgeLevel,
  wrongOf
} from "./support.ts";
import { withPictures } from "./pictures.tsx";
import type { ReactElement } from "react";
import { askedNeed, give, ITEMS, settle, startVisit, suitableItems } from "../src/care/index.ts";
import { CareResultScreen } from "../src/CareResultScreen.tsx";
import { CareWelcomeScreen } from "../src/CareWelcomeScreen.tsx";
import { FOODS, ofFood } from "../src/catalogue.ts";
import { CatalogueScreen } from "../src/CatalogueScreen.tsx";
import { DinosaurPage } from "../src/DinosaurPage.tsx";
import { FriendsScreen } from "../src/FriendsScreen.tsx";
import { LevelResultScreen } from "../src/LevelResultScreen.tsx";
import { dealBoard, turn } from "../src/pairs/index.ts";
import { PairsBoardScreen } from "../src/PairsBoardScreen.tsx";
import { PairsResultScreen } from "../src/PairsResultScreen.tsx";
import { PairsWelcomeScreen } from "../src/PairsWelcomeScreen.tsx";
import { presentCatalogueCard, presentDinosaurPage, presentFriend, presentPairsBoard, presentPuzzle, presentSkeletonChoices, presentVisit } from "../src/presentation.ts";
import { SkeletonChoiceScreen } from "../src/SkeletonChoiceScreen.tsx";
import { SkeletonMuseumScreen } from "../src/SkeletonMuseumScreen.tsx";
import { SkeletonPuzzleScreen } from "../src/SkeletonPuzzleScreen.tsx";
import { SkeletonResultScreen } from "../src/SkeletonResultScreen.tsx";
import { cutAt, startPuzzle } from "../src/skeletons/index.ts";
import { VisitScreen } from "../src/VisitScreen.tsx";
import { shipped } from "./careApp.tsx";

const QUIZ_CARD: Record<Language, string> = { en: "COMPARE", ru: "СРАВНИ" };
const BUTTONS: Record<Language, { next: string; seeResult: string; playAgain: string; home: string }> = {
  en: { next: "NEXT", seeResult: "SEE RESULT", playAgain: "PLAY AGAIN", home: "HOME" },
  ru: { next: "ДАЛЬШЕ", seeResult: "РЕЗУЛЬТАТ", playAgain: "ЕЩЁ РАЗ", home: "ДОМОЙ" }
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
    <App {...emptyLabyrinth()}
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(31)}
      portraitLayouts={{}}
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
      {...pageAtRest()}
      {...timers}
    />
  );
  return { user: userEvent.setup({ delay: null }), unmount: view.unmount };
}

// The app is in a language when the page says so and the home page's quiz
// tile reads in it.
function expectShownIn(language: Language) {
  expect(document.documentElement.lang).toBe(language);
  expect(gameDoor(QUIZ_CARD[language]).querySelector(".featured-card-title")?.textContent).toBe(QUIZ_CARD[language]);
}

function renderQuestion(
  language: Language,
  {
    question = { kind: "heavier", attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") },
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
    ["en-GB", "en", "Language", "COMPARE"],
    ["ru-RU", "ru", "Язык", "СРАВНИ"]
  ] as const)(
    "is the language's flag on a round button in the soft ink in the top-right corner of the home page only, on a %s device",
    async (device, language, label, card) => {
      const { user } = openApp({ device });
      const button = screen.getByRole("button", { name: label });

      expect(button.textContent).toBe("");
      expect(button.querySelector("svg.language-flag-disc")?.getAttribute("data-language")).toBe(language);
      expect(button.querySelector("svg.language-flag-disc")?.getAttribute("aria-hidden")).toBe("true");
      const corner = getComputedStyle(button.closest(".home-corner") ?? button);
      expect(corner.position).toBe("static");
      expect(button.closest("header")).not.toBeNull();
      const style = getComputedStyle(button);
      // The quiet chip carries its symbol in the design ink.
      expect(sameColour(style.color, style.getPropertyValue("--ds-ink"))).toBe(true);
      expect(parseFloat(style.fontSize)).toBeLessThan(largestSize(getComputedStyle(within(featuredCard()).getByText(card)).fontSize) / 2);
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

      for (const option of LANGUAGES) {
        const choice = within(menu).getByRole("menuitemradio", { name: LANGUAGE_NAMES[option] });
        expect(choice.querySelector(".language-flag")?.textContent).toBe(LANGUAGE_FLAGS[option]);
      }
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
    expect(screen.getByRole("button", { name: "Язык" }).querySelector("svg.language-flag-disc")?.getAttribute("data-language")).toBe("ru");
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
    ["ru-RU", "Версия", "Язык", "English", "ANCIENT REPTILES", "Version", "HOME", "Language", "Русский"],
    ["en-GB", "Version", "Language", "Русский", "ДРЕВНИЕ ЯЩЕРЫ", "Версия", "ДОМОЙ", "Язык", "English"]
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
        // Home names its bedrock version while the static footer is hidden.
        expect(footer.getAttribute("aria-label")).toBe(first);
        expect(document.querySelector(".home-version")?.getAttribute("aria-label")).toBe(first);

        await chooseFrom(user, menu, choice);
        expect(footer.getAttribute("aria-label")).toBe(then);
        expect(document.querySelector(".home-version")?.getAttribute("aria-label")).toBe(then);
        await user.click(gameDoor(tile));
        await screen.findByRole("button", { name: home });
        expect(screen.getByRole("contentinfo", { name: then })).toBe(footer);

        await user.click(screen.getByRole("button", { name: home }));
        await chooseFrom(user, menuBack, choiceBack);
        expect(footer.getAttribute("aria-label")).toBe(first);
        expect(document.querySelector(".home-version")?.getAttribute("aria-label")).toBe(first);
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
        return gameDoor("СРАВНИ").querySelector<HTMLElement>(".featured-card-title")!;
      },
      "СРАВНИ"
    ],
    [
      "mass prompt",
      () => {
        renderQuestion("ru", { question: { kind: "heavier", attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") } });
        return screen.getByRole("heading");
      },
      "КТО ТЯЖЕЛЕЕ?"
    ],
    [
      "height prompt",
      () => {
        renderQuestion("ru", { question: { kind: "taller", attribute: "height", left: byName("Triceratops"), right: byName("Velociraptor") } });
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
        return within(screen.getByRole("group", { name: "ЖИВОТНЫЕ" })).getByRole("button", { name: "Трицератопс" });
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
  const PROMPT: Record<Language, string> = { en: "SORT THEM ALL", ru: "РАЗЛОЖИ ВСЕХ" };
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
      const user = userEvent.setup({ delay: null });
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

describe("the sorting result", () => {
  it("reads in Russian, every text for children in capitals", () => {
    render(
      <LevelResultScreen language="ru" score={4} total={6} best={4} beaten={undefined} celebration="first-best" hero={fakeBodyPicture("tyrannosaurus")} level="hatchling" onLevel={nothing} onPlayAgain={nothing} onHome={nothing} />,
      withPictures
    );

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
    ["en", { kind: "heavier", attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") }, "7 T", "15 KG"],
    ["ru", { kind: "heavier", attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") }, "7 Т", "15 КГ"],
    ["en", { kind: "taller", attribute: "height", left: byName("Brachiosaurus"), right: byName("Stegosaurus") }, "3.4 M", "1.5 M"],
    ["ru", { kind: "taller", attribute: "height", left: byName("Brachiosaurus"), right: byName("Stegosaurus") }, "3,4 М", "1,5 М"]
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
const APP_VERSION = `v${packageInfo.version}`;

// What the child is shown on screens, recorded as each screen in a
// language is looked at.
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

// Records in `seen` what the page shows now in `language`.
function look(language: Language, seen: Seen) {
  const isName = (label: string) => SHIPPED_DINOSAURS.some((dinosaur) => dinosaur.name[language] === label);
  const controls = [
    ...PARENT_CONTROLS[language].flatMap((name) => screen.queryAllByRole("button", { name })),
    // Each menu by its label, a closed one too as it animates out,
    // hidden and so unnamed for a screen reader.
    ...[...document.querySelectorAll('[role="menu"]')].filter((menu) => PARENT_CONTROLS[language].includes(menu.getAttribute("aria-label") ?? "")),
    ...screen.queryAllByText(BRAND),
    ...document.querySelectorAll(".home-bedrock"),
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
}

const noSeen = (): Seen => ({ texts: [], names: [], parentTexts: [], parentLabels: [] });

// Renders each screen in turn, each in its own state, and looks at it.
function lookAtEach(language: Language, screens: readonly ReactElement[]): Seen {
  const seen = noSeen();
  for (const element of screens) {
    const { unmount } = render(element, withPictures);
    look(language, seen);
    unmount();
  }
  return seen;
}

// The home page on an app opened in `language`, with each menu for
// parents closed and open, and the portrait gate.
async function homeAndMenus(language: Language): Promise<Seen> {
  const seen = noSeen();
  const viewport = manualViewport("landscape");
  const { user } = openApp({ device: language === "ru" ? "ru-RU" : "en-GB", viewport, timers: manualTimers() });
  look(language, seen);
  for (const label of PARENT_CONTROLS[language]) {
    await openMenu(user, label);
    look(language, seen);
    await user.click(outsideMenu());
  }
  act(() => viewport.turn("portrait"));
  look(language, seen);
  return seen;
}

const CELEBRATIONS = [
  { best: 5, beaten: undefined, celebration: null },
  { best: 5, beaten: undefined, celebration: "first-best" },
  { best: 10, beaten: 5, celebration: "new-best" }
] as const;

// A question before its answer, answered right, answered wrong and the
// last one answered, then a round's result with each celebration and none.
function quiz(language: Language): Seen {
  const question: Question = { kind: "heavier", attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") };
  const answer = (choice: string | undefined, last = false) => (
    <QuestionScreen language={language} {...questionView(question, language, choice)} last={last} onChoose={nothing} onNext={nothing} onHome={nothing} />
  );
  return lookAtEach(language, [
    answer(undefined),
    answer(correctOf(question).id),
    answer(wrongOf(question).id),
    answer(correctOf(question).id, true),
    ...CELEBRATIONS.map((reward) => (
      <LevelResultScreen presentation="dig-site" language={language} score={reward.best} total={10} {...reward} hero={fakeBodyPicture("tyrannosaurus")} level="explorer" onLevel={nothing} onPlayAgain={nothing} onHome={nothing} />
    ))
  ]);
}

// The catalogue, and the page of a creature of each food type and group.
function catalogue(language: Language): Seen {
  const pageOf = (entry: (typeof SHIPPED_CATALOGUE)[number], index: number) => (
    <DinosaurPage
      language={language}
      dinosaur={presentDinosaurPage(entry, language, fakeBodyPicture, [])}
      initialLayout={{ upright: false, lines: { description: 3, note: 1 } }}
      number={index + 1}
      total={SHIPPED_CATALOGUE.length}
      onPrevious={nothing}
      onNext={nothing}
      onBack={nothing}
    />
  );
  const kinds = [
    ...new Map(SHIPPED_CATALOGUE.map((entry, index) => [`${entry.diet} ${entry.group}`, pageOf(entry, index)])).values()
  ];
  return lookAtEach(language, [
    <CatalogueScreen
      language={language}
      dinosaurs={SHIPPED_CATALOGUE.map((entry) => presentCatalogueCard(entry, language, fakeBodyPicture, [SHIPPED_CATALOGUE[0]?.id ?? ""]))}
      foods={FOODS.map((food) => ({ food, count: ofFood(SHIPPED_CATALOGUE, food).length }))}
      food="all"
      initialArrangement={{ columns: 4, chips: undefined }}
      chipWidths={{ width: () => 0, subscribe: () => () => {} }}
      onChipContents={nothing}
      layoutKeeping={keptNothing}
      returning={undefined}
      onFood={nothing}
      onOpen={nothing}
      onHome={nothing}
    />,
    ...kinds
  ]);
}

// Care's welcome with no best and with one, its friends with none and with
// one, a visit as it starts, as a need is refused, after the refusal and
// as a need is met, and its result with each celebration and none.
function care(language: Language): Seen {
  const visitor = shipped("tyrannosaurus");
  const friend = presentFriend(shipped("triceratops"), language, fakeBodyPicture);
  const started = startVisit(visitor);
  const need = askedNeed(started);
  if (need === undefined) throw new Error("A visit asks for a need");
  const right = suitableItems(visitor, need)[0];
  const wrong = ITEMS.find((item) => !suitableItems(visitor, need).includes(item));
  if (right === undefined || wrong === undefined) throw new Error(`No items to meet and miss ${need}`);
  const refused = give(started, wrong);
  const visit = (state: typeof started, leaving = false) => (
    <VisitScreen language={language} visit={presentVisit(state, leaving, language, fakeBodyPicture)} itemPicture={fakeItemPicture} onGive={nothing} onHome={nothing} />
  );
  const friends = (shown: (typeof friend)[]) => (
    <FriendsScreen language={language} friends={shown} nestPicture={fakeItemPicture("nest")} onFriend={nothing} onNewVisitor={nothing} onBack={nothing} onHome={nothing} layoutKeeping={keptNothing} columns={() => 4} />
  );
  return lookAtEach(language, [
    ...[undefined, 6].map((best) => (
      <CareWelcomeScreen language={language} best={best} total={8} visitorPicture={fakeBodyPicture("brachiosaurus")} friendCount={1} friendPictures={[friend.picture]} onNewVisitor={nothing} onFriends={nothing} onHome={nothing} />
    )),
    friends([]),
    friends([friend]),
    visit(started),
    visit(refused),
    visit(settle(refused)),
    visit(give(settle(refused), right)),
    visit(started, true),
    ...CELEBRATIONS.map((reward, at) => (
      <CareResultScreen language={language} visitor={{ name: visitor.name[language], picture: fakeBodyPicture(visitor.id) }} score={reward.best} total={8} {...reward} newFriend={at === 0} onNewVisitor={nothing} onFriends={nothing} onHome={nothing} />
    ))
  ]);
}

// A sorting board's result with each celebration and none.
function sortingResult(language: Language): Seen {
  return lookAtEach(
    language,
    CELEBRATIONS.map((reward) => (
      <LevelResultScreen language={language} score={reward.best} total={6} {...reward} hero={fakeBodyPicture("tyrannosaurus")} level="hatchling" onLevel={nothing} onPlayAgain={nothing} onHome={nothing} />
    ))
  );
}

// Find the pair's welcome, a board as dealt, with a card open, with a pair
// found and finished, and its result with each celebration and none, one
// moving up a level.
function findThePair(language: Language): Seen {
  const dealt = dealBoard(SHIPPED_PALS, { climbLevel: 1 }, () => 0);
  const opened = turn(dealt, 0);
  const pair = dealt.cards.findIndex(({ pal }, place) => place > 0 && pal.id === dealt.cards[0]?.pal.id);
  const found = turn(opened, pair);
  const board = (state: typeof dealt, finished = false) => (
    <PairsBoardScreen language={language} {...presentPairsBoard(state, language, fakeBodyPicture, fakeSkeletonPicture)} finished={finished} onTurn={nothing} onBack={nothing} onHome={nothing} />
  );
  const pals = dealt.cards.map(({ pal }) => ({ id: pal.id, name: pal.name[language], picture: fakeBodyPicture(pal.id), newlyFound: true }));
  return lookAtEach(language, [
    ...(["hatchling", "explorer"] as const).map((level) => (
      <PairsWelcomeScreen language={language} level={level} climbLevel={1} stars={0} heroPicture={fakeBodyPicture("triceratops")} onLevel={nothing} onPlay={nothing} onHome={nothing} />
    )),
    board(dealt),
    board(opened),
    board(found),
    board(found, true),
    ...CELEBRATIONS.map(({ best, beaten, celebration }, at) => (
      <PairsResultScreen language={language} pals={pals} tries={best} stars={1} best={best} beaten={beaten} celebration={celebration} levelUp={at === 0 ? { level: 2, rows: 2, columns: 3 } : null} onPlayAgain={nothing} onBack={nothing} onHome={nothing} />
    ))
  ]);
}

// The skeleton game's choice, a puzzle as it starts and with another
// skeleton's bone told, its reveal with each celebration and none, and its
// museum.
function skeletons(language: Language): Seen {
  const skeleton = SHIPPED_SKELETONS.find((each) => (each.distractors ?? []).length > 0);
  if (!skeleton) throw new Error("No skeleton has another's bones");
  const puzzle = startPuzzle(skeleton, cutAt(skeleton, "hatchling"), { distractors: true });
  const stray = puzzle.distractors[0];
  if (!stray) throw new Error(`${skeleton.id} has no other bone`);
  const told = { ...puzzle, told: stray };
  const atWork = (state: typeof puzzle) => (
    <SkeletonPuzzleScreen
      language={language}
      {...presentPuzzle(state, language, fakeSkeletonPicture)}
      scatter={false}
      onDrop={nothing}
      onTouch={nothing}
      onLastStep={nothing}
      onMuseum={nothing}
      onBack={nothing}
      onHome={nothing}
    />
  );
  return lookAtEach(language, [
    <SkeletonChoiceScreen language={language} choices={presentSkeletonChoices(SHIPPED_SKELETONS, language, fakeBodyPicture, [skeleton.id])} best={1} level="hatchling" onLevel={nothing} onChoose={nothing} onMystery={undefined} onMuseum={nothing} onHome={nothing} />,
    atWork(puzzle),
    atWork(told),
    ...CELEBRATIONS.map(({ best, beaten, celebration }, at) => (
      <SkeletonResultScreen
        language={language}
        name={skeleton.name[language]}
        fact={skeleton.fact[language]}
        skeleton={fakeSkeletonPicture(skeleton.id, "skeleton")}
        body={fakeBodyPicture(skeleton.id)}
        frame={skeleton.frame}
        score={1}
        total={SHIPPED_SKELETONS.length}
        best={best}
        beaten={beaten}
        celebration={celebration}
        newStar={at < 2}
        badge={at === 2 ? "explorer" : undefined}
        onBuildAnother={nothing}
        onMuseum={nothing}
        onHome={nothing}
      />
    )),
    <SkeletonMuseumScreen
      language={language}
      stands={SHIPPED_SKELETONS.map(({ id, name }, at) => ({ id, name: name[language], skeleton: fakeSkeletonPicture(id, "skeleton"), state: (["built", "rebuilding", "empty"] as const)[at % 3] ?? "empty", badges: at === 0 ? ["explorer"] : [] }))}
      score={1}
      total={SHIPPED_SKELETONS.length}
      best={1}
      onBuild={nothing}
      onRebuild={nothing}
      onBuildAnother={nothing}
      onHome={nothing}
    />
  ]);
}

// What a part shows for parents: its words, the language menu's codes
// aside, and the labels read out.
type ForParents = (language: Language) => { words: string[]; labels: string[] };

const NOTHING_FOR_PARENTS: ForParents = () => ({ words: [], labels: [] });

// What the child is shown on every screen and in every state, by part:
// the home page with each menu for parents closed and open and the
// portrait gate on an app, and each other screen rendered in its state.
const PARTS: Array<[string, (language: Language) => Seen | Promise<Seen>, ForParents]> = [
  [
    "the home page and its menus",
    homeAndMenus,
    (language) => ({
      words: [BRAND, TEXTS[language].homeParentNote, APP_VERSION, TEXTS[language].portraitLayoutComing, ...OWN_NAMES, ...Object.values(TEXTS[language].themes), ...levelNames(language), ...levelAges(language)],
      labels: [...PARENT_CONTROLS[language], TEXTS[language].versionLabel]
    })
  ],
  ["the quiz's questions and results", quiz, NOTHING_FOR_PARENTS],
  ["the catalogue and its pages", catalogue, (language) => ({ words: [TEXTS[language].sourceNote], labels: [] })],
  ["care's welcome, friends, visits and results", care, NOTHING_FOR_PARENTS],
  ["the sorting results", sortingResult, NOTHING_FOR_PARENTS],
  ["find the pair's welcome, boards and results", findThePair, NOTHING_FOR_PARENTS],
  ["the skeleton game's choice, puzzles, reveals and museum", skeletons, NOTHING_FOR_PARENTS]
];

const CASES = LANGUAGES.flatMap((language) => PARTS.map(([part, walk, forParents]) => [language, part, walk, forParents] as const));

// The language menu's codes, "EN" and "RU", read the same in every
// language, and so does each language's name in it, written in itself.
const CODES = new Set(LANGUAGES.map((code) => code.toUpperCase()));
const OWN_NAMES = new Set(Object.values(LANGUAGE_NAMES));

// The age levels' pictures, on the age level menu's button and choices,
// have no letters and no case.
const PICTURES = new Set([...Object.values(AGE_LEVEL_PICTURES), ...Object.values(LANGUAGE_FLAGS)]);

// The app's strings are checked by script: a text left in English shows up
// as Latin letters in Russian, and the other way round. Only the language
// menu's codes and names and the wordmark read the same in both.
describe("every string shown", () => {
  const FOREIGN: Record<Language, RegExp> = { en: /[А-Яа-яЁё]/, ru: /[A-Za-z]/ };
  const SAME_IN_EVERY_LANGUAGE = new Set([...CODES, ...OWN_NAMES, BRAND, APP_VERSION]);

  it.each(CASES)("is in %s, on %s", async (language, _, walk) => {
    const { texts, names, parentTexts, parentLabels } = await walk(language);
    const seen = [...texts, ...names, ...parentTexts.filter((text) => !SAME_IN_EVERY_LANGUAGE.has(text)), ...parentLabels];

    expect(texts.length).toBeGreaterThan(0);
    expect(seen.filter((text) => FOREIGN[language].test(text))).toEqual([]);
  });
});

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
    const { languageMenu, themeMenu, themes, ageLevelMenu, ageLevels, versionLabel, homeParentNote, sourceNote, portraitLayoutComing, stars, heartsOf, ...forChildren } = TEXTS[language];
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>).flatMap(strings);
    const texts = [...strings(forChildren), ...levelNames(language), stars(7, 10), heartsOf(6, 8)];

    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect([languageMenu, themeMenu, ageLevelMenu]).toEqual(PARENT_CONTROLS[language]);
    expect([...Object.values(themes), ...levelAges(language), versionLabel, homeParentNote, sourceNote, portraitLayoutComing].filter((text) => text === text.toLocaleUpperCase(language))).toEqual([]);
  });
});
