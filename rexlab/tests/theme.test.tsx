import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { THEME_KEY, localTheme } from "../src/localTheme.ts";
import { largerOf, type Dinosaur, type Question } from "../src/quiz/round.ts";
import type { Theme } from "../src/theme.ts";
import { chooseFrom, choicesIn, openMenu, outsideMenu, symbolOf } from "./menus.ts";
import {
  SHIPPED_DINOSAURS,
  contrast,
  emptyProgress,
  fakeBodyPicture,
  luminance,
  manualAppearance,
  manualOrientation,
  memoryStorage,
  seededRandom,
  type ManualAppearance,
  type ManualOrientation,
  type MemoryStorage
} from "./support.ts";

// The luminance of a mid grey: a surface below it is dark, one above light.
const MID_GREY = 0.18;
// The WCAG AA contrast for text, which every text read in either theme keeps.
const TEXT_CONTRAST = 4.5;

const byName = (name: string): Dinosaur => {
  const found = SHIPPED_DINOSAURS.find((d) => d.name.en === name);
  if (!found) throw new Error(`No ${name} in the shipped list`);
  return found;
};

const group = () => screen.getByRole("group", { name: "DINOSAURS" });
const cardOf = (dinosaur: Dinosaur) => within(group()).getByRole("button", { name: dinosaur.name.en });
const progress = () => screen.getByLabelText("PROGRESS").textContent;

function shownQuestion(): Question {
  const attribute = screen.getByRole("heading").textContent?.includes("HEAVIER") ? "mass" : "height";
  const [left, right] = within(group())
    .getAllByRole("button")
    .map((card) => byName(card.getAttribute("aria-label") ?? ""));
  if (!left || !right) throw new Error("Expected two dinosaur cards");
  return { attribute, left, right };
}

const smallerOf = (question: Question) => (largerOf(question) === question.left ? question.right : question.left);

function openApp({
  device = manualAppearance("light"),
  storage = memoryStorage(),
  orientation = manualOrientation("landscape"),
  language = "en-GB"
}: {
  device?: ManualAppearance;
  storage?: MemoryStorage;
  orientation?: ManualOrientation;
  language?: string;
} = {}) {
  const languages = memoryStorage();
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(41)}
      orientation={orientation}
      progress={emptyProgress()}
      deviceLanguage={language}
      languageStore={localLanguage(() => languages)}
      appearance={device}
      themeStore={localTheme(() => storage)}
    />
  );
  return { user: userEvent.setup(), unmount: view.unmount };
}

const opaque = (element: Element) => !/^(transparent|rgba\(.*,\s*0\))$/.test(getComputedStyle(element).backgroundColor);

// The surface an element is seen on: its own background, or the nearest
// one behind it.
function surfaceOf(element: Element): string {
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (opaque(at)) return getComputedStyle(at).backgroundColor;
  }
  throw new Error("The page has no background");
}

const describeElement = (element: Element) =>
  `<${element.tagName.toLowerCase()} class="${element.className}">${element.textContent?.trim().slice(0, 20) ?? ""}`;

// The screen is in `theme` when every surface on it, the page and each
// opaque background, is dark in the dark theme and light in the light one,
// and every text read on it keeps text contrast with its surface. Symbols
// hidden from reading, such as the faded stars, are pictures, not text.
// The home page's quiz card is the one exception the approved design
// draws: a bright yellow card with a dark badge in both themes, its text
// still held to text contrast.
function expectScreenIn(theme: Theme) {
  const elements = [document.body, ...document.body.querySelectorAll("*")];
  const surfaces = elements.filter((element) => opaque(element) && !element.closest(".quiz-card"));
  const texts = elements.filter(
    (element) =>
      !element.closest('[aria-hidden="true"]') &&
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
  );

  expect(surfaces).toContain(document.body);
  expect(texts.length).toBeGreaterThan(0);
  const side = (color: string): Theme => (luminance(color) < MID_GREY ? "dark" : "light");
  expect(surfaces.filter((surface) => side(getComputedStyle(surface).backgroundColor) !== theme).map(describeElement)).toEqual([]);
  expect(
    texts
      .filter((text) => contrast(getComputedStyle(text).color, surfaceOf(text)) < TEXT_CONTRAST)
      .map((text) => `${describeElement(text)}: ${contrast(getComputedStyle(text).color, surfaceOf(text)).toFixed(2)}`)
  ).toEqual([]);
}

// Checks every screen in every state: the home page with each menu closed
// and open, the portrait gate, a whole round, each question before and
// after its answer, the first one wrong so both marks show, the result with
// its celebration, and the home page again.
async function expectEveryScreenIn(theme: Theme, user: UserEvent, orientation: ManualOrientation) {
  expectScreenIn(theme);
  for (const menu of ["Theme", "Language"]) {
    await openMenu(user, menu);
    expectScreenIn(theme);
    await user.click(outsideMenu());
  }
  act(() => orientation.turn("portrait"));
  expectScreenIn(theme);
  act(() => orientation.turn("landscape"));

  await user.click(screen.getByRole("button", { name: "COMPARE" }));
  for (let number = 1; number <= 10; number++) {
    expectScreenIn(theme);
    const question = shownQuestion();
    await user.click(cardOf(number === 1 ? smallerOf(question) : largerOf(question)));
    expectScreenIn(theme);
    await user.click(screen.getByRole("button", { name: number < 10 ? "NEXT" : "SEE RESULT" }));
  }
  expect(screen.getByRole("status")).toBeDefined();
  expectScreenIn(theme);

  await user.click(screen.getByRole("button", { name: "HOME" }));
  expectScreenIn(theme);
}

describe("the System theme", () => {
  it.each(["light", "dark"] as const)("follows the device appearance %s on every screen", async (appearance) => {
    const orientation = manualOrientation("landscape");
    const { user } = openApp({ device: manualAppearance(appearance), orientation });

    await expectEveryScreenIn(appearance, user, orientation);
  });

  it.each([
    ["holds a theme the app does not have", memoryStorage({ [THEME_KEY]: "sepia" })],
    ["cannot be read", memoryStorage({ [THEME_KEY]: "light" }, { read: false })]
  ])("is the theme when the stored choice %s", (_, storage) => {
    openApp({ device: manualAppearance("dark"), storage });

    expectScreenIn("dark");
  });

  it("follows the device while the app is open, without reloading", async () => {
    const device = manualAppearance("light");
    const { user } = openApp({ device });
    await user.click(screen.getByRole("button", { name: "COMPARE" }));
    await user.click(cardOf(smallerOf(shownQuestion())));
    expectScreenIn("light");
    const answered = document.body.innerHTML;

    act(() => device.switchTo("dark"));

    expectScreenIn("dark");
    expect(document.body.innerHTML).toBe(answered);
    expect(progress()).toBe("1/10");

    act(() => device.switchTo("light"));

    expectScreenIn("light");
    expect(document.body.innerHTML).toBe(answered);
  });
});

describe("a chosen theme", () => {
  it.each([
    ["Dark", "dark", "light"],
    ["Light", "light", "dark"]
  ] as const)("%s overrides the device in its %s appearance and back", async (name, chosen, appearance) => {
    const device = manualAppearance(appearance);
    const { user } = openApp({ device });
    expectScreenIn(appearance);

    await chooseFrom(user, "Theme", name);

    expectScreenIn(chosen);
    act(() => device.switchTo(chosen));
    act(() => device.switchTo(appearance));
    expectScreenIn(chosen);
    await user.click(screen.getByRole("button", { name: "COMPARE" }));
    expectScreenIn(chosen);
  });

  it("gives way to the device again once System is chosen", async () => {
    const device = manualAppearance("light");
    const storage = memoryStorage({ [THEME_KEY]: "dark" });
    const { user } = openApp({ device, storage });
    expectScreenIn("dark");

    await chooseFrom(user, "Theme", "System");

    expectScreenIn("light");
    expect(storage.items.get(THEME_KEY)).toBe("system");
    act(() => device.switchTo("dark"));
    expectScreenIn("dark");
  });

  it.each([
    ["Dark", "dark", "light"],
    ["Light", "light", "dark"]
  ] as const)("%s is kept when the app is closed and reopened on a %s device", async (name, chosen, appearance) => {
    const storage = memoryStorage();
    const { user, unmount } = openApp({ device: manualAppearance(appearance), storage });

    await chooseFrom(user, "Theme", name);

    expect(storage.items.get(THEME_KEY)).toBe(chosen);
    unmount();
    openApp({ device: manualAppearance(appearance), storage });
    expectScreenIn(chosen);
  });

  it("still applies for this visit when it cannot be saved", async () => {
    const { user } = openApp({ device: manualAppearance("light"), storage: memoryStorage({}, { save: false }) });

    await chooseFrom(user, "Theme", "Dark");

    expectScreenIn("dark");
  });

  it("is taken off the page when the app is closed", async () => {
    const { user, unmount } = openApp({ device: manualAppearance("light") });
    await chooseFrom(user, "Theme", "Dark");

    unmount();

    expect(luminance(getComputedStyle(document.body).backgroundColor)).toBeGreaterThan(MID_GREY);
  });
});

describe("the theme menu", () => {
  const CHOICES: Record<Language, string[]> = {
    en: ["System", "Light", "Dark"],
    ru: ["Системная", "Светлая", "Тёмная"]
  };
  const LABELS: Record<Language, { menu: string; card: string }> = {
    en: { menu: "Theme", card: "COMPARE" },
    ru: { menu: "Тема", card: "СРАВНИ" }
  };

  it.each(["en", "ru"] as const)(
    "is a small, faded button with the current theme's symbol in the top-right corner of the home page only, in %s",
    async (language) => {
      const { user } = openApp({ language: language === "ru" ? "ru-RU" : "en-GB" });
      const button = screen.getByRole("button", { name: LABELS[language].menu });
      const card = screen.getByRole("button", { name: LABELS[language].card });

      expect(button.textContent).toBe("");
      expect(symbolOf(button)).toBe("monitor");
      const corner = getComputedStyle(button.closest(".parent-menus") ?? button);
      expect(corner.position).toBe("fixed");
      expect(corner.top).toMatch(/^[\d.]+(px|rem)$/);
      expect(corner.right).toMatch(/^[\d.]+(px|rem)$/);
      const style = getComputedStyle(button);
      expect(Number(style.opacity)).toBeLessThan(1);
      // A tap area for a parent's finger around the small symbol.
      expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);

      await user.click(card);

      expect(screen.queryByRole("button", { name: LABELS[language].menu })).toBeNull();
    }
  );

  it.each(["en", "ru"] as const)(
    "lists the themes in normal case, each with its symbol, the current one ticked, in %s, and a tap outside changes nothing",
    async (language) => {
      const storage = memoryStorage();
      const { user } = openApp({ language: language === "ru" ? "ru-RU" : "en-GB", storage });

      const menu = await openMenu(user, LABELS[language].menu);

      expect(choicesIn(menu)).toEqual(CHOICES[language].map((name, at) => ({ name, checked: at === 0, tick: at === 0 })));
      expect(within(menu).getAllByRole("menuitemradio").map(symbolOf)).toEqual(["monitor", "sun", "moon"]);
      expect(CHOICES[language].filter((name) => name === name.toLocaleUpperCase(language))).toEqual([]);
      expect(parseFloat(getComputedStyle(within(menu).getByText(CHOICES[language][0] ?? "")).fontSize)).toBeLessThan(
        parseFloat(getComputedStyle(screen.getByText(LABELS[language].card)).fontSize) / 2
      );

      await user.click(outsideMenu());

      expect(screen.queryByRole("menu")).toBeNull();
      expect(storage.items.has(THEME_KEY)).toBe(false);
      expectScreenIn("light");
    }
  );

  it.each([
    ["Light", "sun"],
    ["Dark", "moon"],
    ["System", "monitor"]
  ] as const)("shows the symbol of %s once it is chosen, and ticks it the next time it opens", async (name, symbol) => {
    const { user } = openApp({ storage: memoryStorage({ [THEME_KEY]: name === "System" ? "dark" : "system" }) });

    await chooseFrom(user, "Theme", name);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(symbolOf(screen.getByRole("button", { name: "Theme" }))).toBe(symbol);
    expect(choicesIn(await openMenu(user, "Theme")).filter(({ tick }) => tick)).toEqual([{ name, checked: true, tick: true }]);
  });
});

describe("marks", () => {
  it.each(["light", "dark"] as const)("keep at least 3:1 contrast with their card in the %s theme", async (theme) => {
    const { user } = openApp({ device: manualAppearance(theme) });
    await user.click(screen.getByRole("button", { name: "COMPARE" }));
    const question = shownQuestion();

    await user.click(cardOf(smallerOf(question)));

    expectScreenIn(theme);
    const marks = [largerOf(question), smallerOf(question)].map((dinosaur) => {
      const card = cardOf(dinosaur);
      const mark = within(card).getByRole("img", { name: /^(CORRECT|WRONG)$/ });
      return { symbol: mark.textContent, color: getComputedStyle(mark).color, card: getComputedStyle(card) };
    });
    expect(marks.map(({ symbol }) => symbol)).toEqual(["✓", "✗"]);
    expect(new Set(marks.map(({ color }) => color)).size).toBe(2);
    for (const { color, card } of marks) {
      expect(color).not.toBe(card.color);
      expect(contrast(color, card.backgroundColor)).toBeGreaterThanOrEqual(3);
    }
  });
});
