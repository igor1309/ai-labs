import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { NEEDS } from "../src/care/index.ts";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LANGUAGE_KEY, localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localProgress } from "../src/localProgress.ts";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { ResultScreen } from "../src/ResultScreen.tsx";
import { largerOf, type Attribute, type Dinosaur, type Question } from "../src/quiz/round.ts";
import { endReaction, meets, missesFor, needAsked, playVisit, trayItem, visitorShown } from "./care.ts";
import { chooseFrom, choicesIn, openMenu, outsideMenu } from "./menus.ts";
import {
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyProgress,
  fakeBodyPicture,
  lightDevice,
  loadedPictures,
  manualOrientation,
  manualTimers,
  memoryStorage,
  questionView,
  sameColour,
  seededRandom,
  symbolOf,
  words,
  type ManualOrientation,
  type ManualTimers,
  type MemoryStorage
} from "./support.ts";

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
  orientation = manualOrientation("landscape"),
  progress = emptyProgress(),
  timers = loadedPictures()
}: {
  device: string;
  storage?: MemoryStorage;
  orientation?: ManualOrientation;
  progress?: ReturnType<typeof emptyProgress>;
  timers?: ReturnType<typeof loadedPictures>;
}) {
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(31)}
      orientation={orientation}
      progress={progress}
      deviceLanguage={device}
      languageStore={localLanguage(() => storage)}
      {...lightDevice()}
      {...emptyCare()}
      {...timers}
    />
  );
  return { user: userEvent.setup(), unmount: view.unmount };
}

// The app is in a language when the page says so and the home page's quiz
// card reads in it.
function expectShownIn(language: Language) {
  expect(document.documentElement.lang).toBe(language);
  expect(words(screen.getByRole("button", { name: QUIZ_CARD[language] }))).toBe(QUIZ_CARD[language]);
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
    <QuestionScreen language={language} {...questionView(question, language, choice)} last={last} onChoose={nothing} onNext={nothing} onHome={nothing} />
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
      const corner = getComputedStyle(button.closest(".parent-menus") ?? button);
      expect(corner.position).toBe("fixed");
      expect(corner.top).toMatch(/^[\d.]+(px|rem)$/);
      expect(corner.right).toMatch(/^[\d.]+(px|rem)$/);
      const style = getComputedStyle(button);
      // Faded as the design fades what is for parents: in its soft ink.
      expect(sameColour(style.color, PALETTE.light["ink-soft"] ?? "")).toBe(true);
      expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(within(screen.getByRole("button", { name: card })).getByText(card)).fontSize) / 2);
      // A tap area for a parent's finger around the small symbol.
      expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(document.documentElement.lang).toBe(language);

      await user.click(screen.getByRole("button", { name: card }));

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
      "quiz card",
      () => {
        openApp({ device: "ru-RU" });
        return screen.getByRole("button", { name: "СРАВНИ" });
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
        render(<ResultScreen language="ru" score={6} total={10} best={8} beaten={undefined} celebration={null} hero={fakeBodyPicture("tyrannosaurus")} onPlayAgain={nothing} onHome={nothing} />);
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
    render(<ResultScreen language="ru" score={6} total={10} best={8} beaten={undefined} celebration={null} hero={fakeBodyPicture("tyrannosaurus")} onPlayAgain={nothing} onHome={nothing} />);

    expect(words(screen.getByRole("button", { name: "ДОМОЙ" }))).toBe("ДОМОЙ");
  });
});

describe("revealed values", () => {
  it.each<[Language, Question, string, string]>([
    ["en", { attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") }, "7 T", "15 KG"],
    ["ru", { attribute: "mass", left: byName("Triceratops"), right: byName("Velociraptor") }, "7 Т", "15 КГ"],
    ["en", { attribute: "height", left: byName("Brachiosaurus"), right: byName("Triceratops") }, "12.5 M", "3 M"],
    ["ru", { attribute: "height", left: byName("Brachiosaurus"), right: byName("Triceratops") }, "12,5 М", "3 М"]
  ])("are written in %s", (language, question, leftValue, rightValue) => {
    renderQuestion(language, { question, choice: question.left.id });

    const cards = within(screen.getByRole("group")).getAllByRole("button");
    expect(cards.map((card) => card.querySelector(".dinosaur-value")?.textContent)).toEqual([leftValue, rightValue]);
  });
});

// The labels of the home page's menus for parents.
const PARENT_CONTROLS: Record<Language, string[]> = { en: ["Language", "Theme"], ru: ["Язык", "Тема"] };

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
// a device in it: `look` records what the screen shows now in `seen`.
type Play = {
  language: Language;
  user: UserEvent;
  orientation: ManualOrientation;
  timers: ManualTimers;
  look: () => void;
  seen: Seen;
};

// A compare-dinosaurs record of a best score of 5 from one round.
const BEST_OF_5 = JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 5, roundsPlayed: 1 } } });

function openPlay(language: Language, progressStorage = memoryStorage()): Play {
  const orientation = manualOrientation("landscape");
  const timers = manualTimers();
  const { user } = openApp({
    device: language === "ru" ? "ru-RU" : "en-GB",
    orientation,
    progress: localProgress(() => progressStorage),
    timers
  });
  const seen: Seen = { texts: [], names: [], parentTexts: [], parentLabels: [] };
  const isName = (label: string) => SHIPPED_DINOSAURS.some((dinosaur) => dinosaur.name[language] === label);

  const look = () => {
    const controls = [
      ...PARENT_CONTROLS[language].flatMap((name) => [...screen.queryAllByRole("button", { name }), ...screen.queryAllByRole("menu", { name })]),
      ...screen.queryAllByText(BRAND),
      ...screen.queryAllByText(TEXTS[language].sourceNote)
    ];
    const forParents = (node: Node) => controls.some((control) => control.contains(node));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      (forParents(node) ? seen.parentTexts : seen.texts).push(node.textContent);
    }
    for (const element of document.body.querySelectorAll("[aria-label]")) {
      const label = element.getAttribute("aria-label") ?? "";
      if (forParents(element)) seen.parentLabels.push(label);
      else if (isName(label)) seen.names.push(label);
      else seen.texts.push(label);
    }
    for (const picture of document.body.querySelectorAll("img")) {
      const label = picture.alt;
      (isName(label) ? seen.names : seen.texts).push(label);
    }
  };

  return { language, user, orientation, timers, look, seen };
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
  const { user, orientation, look } = play;
  look();
  for (const label of PARENT_CONTROLS[language]) {
    await openMenu(user, label);
    look();
    await user.click(outsideMenu());
  }
  act(() => orientation.turn("portrait"));
  look();
  return play.seen;
}

async function roundWithMistakes(language: Language): Promise<Seen> {
  const play = openPlay(language);
  await play.user.click(screen.getByRole("button", { name: QUIZ_CARD[language] }));
  await playRound(play, 5);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  return play.seen;
}

// The second round, without mistakes, beats the best of the first one.
async function roundWithoutMistakes(language: Language): Promise<Seen> {
  const play = openPlay(language, memoryStorage({ [PROGRESS_KEY]: BEST_OF_5 }));
  const { user, look } = play;
  await user.click(screen.getByRole("button", { name: QUIZ_CARD[language] }));
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
  await user.click(screen.getByRole("button", { name: text.catalogue }));
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
// refused once and one without, both results and the friends made.
const PARTS: Array<[string, (language: Language) => Promise<Seen>, ForParents]> = [
  [
    "the home page and its menus",
    homeAndMenus,
    (language) => ({ words: [BRAND, ...OWN_NAMES, ...Object.values(TEXTS[language].themes)], labels: PARENT_CONTROLS[language] })
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
  ["a visit without a refusal, its result, the friends made and the home page again", visitWithoutRefusals, HOME_PAGE]
];

const CASES = LANGUAGES.flatMap((language) => PARTS.map(([part, walk, forParents]) => [language, part, walk, forParents] as const));

// The language menu's codes, "EN" and "RU", read the same in every
// language, and so does each language's name in it, written in itself.
const CODES = new Set(LANGUAGES.map((code) => code.toUpperCase()));
const OWN_NAMES = new Set(Object.values(LANGUAGE_NAMES));

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
// the app: release.test.ts proves it reads the version as stamped.
describe("text for children", () => {
  it.each(CASES)("is in capitals in %s on %s, but not the menus and the wordmark for parents", async (language, _, walk, forParents) => {
    const { texts, parentTexts, parentLabels } = await walk(language);
    const shown = forParents(language);

    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect(new Set(parentLabels)).toEqual(new Set(shown.labels));
    const words = parentTexts.filter((text) => !CODES.has(text));
    expect(new Set(words)).toEqual(new Set(shown.words));
    expect(words.filter((text) => text === text.toLocaleUpperCase(language))).toEqual([]);
  });

  // Every dictionary entry, including those only shown in a state the
  // round above may not reach, such as either celebration.
  it.each(["en", "ru"] as const)("is written in capitals in the %s dictionary, all but the menus for parents", (language) => {
    const { languageMenu, themeMenu, themes, sourceNote, stars, heartsOf, ...forChildren } = TEXTS[language];
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>).flatMap(strings);
    const texts = [...strings(forChildren), stars(7, 10), heartsOf(6, 8)];

    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect([languageMenu, themeMenu]).toEqual(PARENT_CONTROLS[language]);
    expect([...Object.values(themes), sourceNote].filter((text) => text === text.toLocaleUpperCase(language))).toEqual([]);
  });
});
