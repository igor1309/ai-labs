import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LANGUAGE_KEY, localLanguage } from "../src/localLanguage.ts";
import { localProgress } from "../src/localProgress.ts";
import { QuestionScreen } from "../src/QuestionScreen.tsx";
import { ResultScreen } from "../src/ResultScreen.tsx";
import { largerOf, type Attribute, type Dinosaur, type Question } from "../src/quiz/round.ts";
import {
  SHIPPED_DINOSAURS,
  emptyProgress,
  lightDevice,
  manualOrientation,
  memoryStorage,
  questionView,
  seededRandom,
  type ManualOrientation,
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
  progress = emptyProgress()
}: {
  device: string;
  storage?: MemoryStorage;
  orientation?: ManualOrientation;
  progress?: ReturnType<typeof emptyProgress>;
}) {
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      random={seededRandom(31)}
      orientation={orientation}
      progress={progress}
      deviceLanguage={device}
      languageStore={localLanguage(() => storage)}
      {...lightDevice()}
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

// What an element reads in words, without its symbols and pictures.
function words(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"], [role="img"]').forEach((part) => part.remove());
  return copy.textContent?.trim() ?? "";
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

describe("the language switch", () => {
  it('is a small, faded "EN | RU" control in a corner of the home page only', async () => {
    const { user } = openApp({ device: "en-GB" });
    const control = screen.getByRole("navigation", { name: "Language" });
    const card = screen.getByRole("button", { name: "COMPARE" });

    expect(control.textContent).toBe("EN | RU");
    expect(within(control).getAllByRole("button").map((button) => button.textContent)).toEqual(["EN", "RU"]);
    const style = getComputedStyle(control);
    expect(style.position).toBe("fixed");
    expect(style.top).toMatch(/^[\d.]+(px|rem)$/);
    expect(style.right).toMatch(/^[\d.]+(px|rem)$/);
    expect(Number(style.opacity)).toBeLessThan(1);
    expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(within(card).getByText("COMPARE")).fontSize) / 2);

    await user.click(card);

    expect(screen.queryByRole("navigation", { name: "Language" })).toBeNull();
  });

  it("marks the language shown", async () => {
    const { user } = openApp({ device: "en-GB" });
    const pressed = () =>
      within(screen.getByRole("navigation", { name: /^(Language|Язык)$/ }))
        .getAllByRole("button", { pressed: true })
        .map((button) => button.textContent);
    expect(pressed()).toEqual(["EN"]);

    await user.click(screen.getByRole("button", { name: "RU" }));

    expect(pressed()).toEqual(["RU"]);
  });

  it("keeps the chosen language when the app is closed and reopened", async () => {
    const storage = memoryStorage();
    const { user, unmount } = openApp({ device: "en-GB", storage });
    expectShownIn("en");

    await user.click(screen.getByRole("button", { name: "RU" }));

    expectShownIn("ru");
    expect(storage.items.get(LANGUAGE_KEY)).toBe("ru");

    unmount();
    openApp({ device: "en-GB", storage });

    expectShownIn("ru");
  });

  it("switches back, and the later choice is the one kept", async () => {
    const storage = memoryStorage();
    const { user, unmount } = openApp({ device: "ru-RU", storage });

    await user.click(screen.getByRole("button", { name: "EN" }));

    expectShownIn("en");
    unmount();
    openApp({ device: "ru-RU", storage });
    expectShownIn("en");
  });

  it("still switches for this visit when the choice cannot be saved", async () => {
    const { user } = openApp({ device: "en-GB", storage: memoryStorage({}, { save: false }) });

    await user.click(screen.getByRole("button", { name: "RU" }));

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
        render(<ResultScreen language="ru" score={6} total={10} best={8} celebration={null} onPlayAgain={nothing} onHome={nothing} />);
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
    render(<ResultScreen language="ru" score={6} total={10} best={8} celebration={null} onPlayAgain={nothing} onHome={nothing} />);

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

// The labels of the home page's switches for parents.
const PARENT_CONTROLS: Record<Language, string[]> = { en: ["Language", "Theme"], ru: ["Язык", "Тема"] };

// What the child is shown on every screen and in every state: the home
// page, the portrait gate, two rounds, one with mistakes and one without,
// and both results, played on a device in `language`.
type Seen = {
  // Every visible word and every label read out, outside the switches for
  // parents.
  texts: string[];
  // The labels that are a dinosaur's own name, kept as the list writes it.
  names: string[];
  // Every visible word in the switches for parents.
  parentTexts: string[];
  // The labels read out in the switches for parents.
  parentLabels: string[];
};

async function playEveryScreen(language: Language): Promise<Seen> {
  const orientation = manualOrientation("landscape");
  const progressStorage = memoryStorage();
  const { user } = openApp({
    device: language === "ru" ? "ru-RU" : "en-GB",
    orientation,
    progress: localProgress(() => progressStorage)
  });
  const seen: Seen = { texts: [], names: [], parentTexts: [], parentLabels: [] };
  const isName = (label: string) => SHIPPED_DINOSAURS.some((dinosaur) => dinosaur.name[language] === label);

  const look = () => {
    const controls = PARENT_CONTROLS[language].flatMap((name) => screen.queryAllByRole("navigation", { name }));
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
  };

  const shownQuestion = (): Question => {
    const heading = screen.getByRole("heading").textContent ?? "";
    const attribute: Attribute = heading.includes(PROMPTS[language].mass) ? "mass" : "height";
    const [left, right] = within(screen.getByRole("group"))
      .getAllByRole("button")
      .map((card) => byName(card.getAttribute("aria-label") ?? "", language));
    if (!left || !right) throw new Error("Expected two dinosaur cards");
    return { attribute, left, right };
  };

  async function playRound(correct: number) {
    for (let number = 1; number <= 10; number++) {
      const question = shownQuestion();
      const larger = largerOf(question);
      const tapped = number <= correct ? larger : larger === question.left ? question.right : question.left;
      look();
      await user.click(within(screen.getByRole("group")).getByRole("button", { name: tapped.name[language] }));
      look();
      await user.click(screen.getByRole("button", { name: number < 10 ? BUTTONS[language].next : BUTTONS[language].seeResult }));
    }
    look();
  }

  look();
  act(() => orientation.turn("portrait"));
  look();
  act(() => orientation.turn("landscape"));

  await user.click(screen.getByRole("button", { name: QUIZ_CARD[language] }));
  await playRound(5);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: BUTTONS[language].playAgain }));
  await playRound(10);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: BUTTONS[language].home }));
  look();

  return seen;
}

// The app's strings are checked by script: a text left in English shows up
// as Latin letters in Russian, and the other way round. Only the language
// switch's "EN" and "RU" read the same in both.
describe("every string shown", () => {
  const FOREIGN: Record<Language, RegExp> = { en: /[А-Яа-яЁё]/, ru: /[A-Za-z]/ };
  const CODES = new Set(LANGUAGES.map((code) => code.toUpperCase()));

  it.each(["en", "ru"] as const)("is in %s, on every screen and in every state", async (language) => {
    const { texts, names, parentTexts, parentLabels } = await playEveryScreen(language);
    const seen = [...texts, ...names, ...parentTexts.filter((text) => !CODES.has(text)), ...parentLabels];

    expect(texts.length).toBeGreaterThan(0);
    expect(seen.filter((text) => FOREIGN[language].test(text))).toEqual([]);
  });
});

// The version footer, also for parents, is part of the static page, not
// the app: release.test.ts proves it reads the version as stamped. The
// theme switch's own words, in normal case, are proved in theme.test.tsx.
describe("text for children", () => {
  it.each(["en", "ru"] as const)("is in capitals on every screen and in every state in %s", async (language) => {
    const { texts, parentLabels } = await playEveryScreen(language);

    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect(new Set(parentLabels)).toEqual(new Set(PARENT_CONTROLS[language]));
  });

  // Every dictionary entry, including those only shown in a state the
  // round above may not reach, such as either celebration.
  it.each(["en", "ru"] as const)("is written in capitals in the %s dictionary, all but the switches for parents", (language) => {
    const { languageSwitch, themeSwitch, themes, stars, ...forChildren } = TEXTS[language];
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>).flatMap(strings);
    const texts = [...strings(forChildren), stars(7, 10)];

    expect(texts.filter((text) => text !== text.toLocaleUpperCase(language))).toEqual([]);
    expect([languageSwitch, themeSwitch]).toEqual(PARENT_CONTROLS[language]);
    expect(Object.values(themes).filter((text) => text === text.toLocaleUpperCase(language))).toEqual([]);
  });
});
