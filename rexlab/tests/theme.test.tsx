import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { THEME_KEY, localTheme } from "../src/localTheme.ts";
import { largerOf, type Dinosaur, type Question } from "../src/quiz/round.ts";
import type { Theme } from "../src/theme.ts";
import { endReaction, meets, missesFor, needAsked, trayItem, visitorShown } from "./care.ts";
import { chooseFrom, choicesIn, openMenu, outsideMenu } from "./menus.ts";
import {
  OVERLAYS,
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  contrast,
  emptyCare,
  emptyProgress,
  fakeBodyPicture,
  manualAppearance,
  manualOrientation,
  manualTimers,
  memoryStorage,
  sameColour,
  seededRandom,
  seenOn,
  surfaceOf,
  surfacesIn,
  symbolOf,
  type ManualAppearance,
  type ManualOrientation,
  type ManualTimers,
  type MemoryStorage
} from "./support.ts";

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
  language = "en-GB",
  timers = manualTimers()
}: {
  device?: ManualAppearance;
  storage?: MemoryStorage;
  orientation?: ManualOrientation;
  language?: string;
  timers?: ManualTimers;
} = {}) {
  const languages = memoryStorage();
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(41)}
      orientation={orientation}
      progress={emptyProgress()}
      deviceLanguage={language}
      languageStore={localLanguage(() => languages)}
      appearance={device}
      themeStore={localTheme(() => storage)}
      {...emptyCare()}
      {...timers}
    />
  );
  return { user: userEvent.setup(), unmount: view.unmount };
}

const describeElement = (element: Element) =>
  `<${element.tagName.toLowerCase()} class="${element.className}">${element.textContent?.trim().slice(0, 20) ?? ""}`;

// The contrast of a text with what it is seen on.
const textContrast = (text: Element) => {
  const surface = surfaceOf(text);
  return contrast(seenOn(getComputedStyle(text).color, surface), surface);
};

// The screen is in `theme` when the page and every surface on it take the
// theme's own colours of the design, or a translucent layer both themes
// lay over the navy, and every text read on it keeps text contrast with
// what it is seen on. The two themes share no colour but the words on the
// navy, so a surface left in the other theme shows. Symbols hidden from
// reading, such as the faded stars, are pictures, not text.
function expectScreenIn(theme: Theme) {
  const surfaces = surfacesIn(document.body);
  const texts = [document.body, ...document.body.querySelectorAll("*")].filter(
    (element) =>
      !element.closest('[aria-hidden="true"]') &&
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
  );
  const colours = [...Object.values(PALETTE[theme]), ...OVERLAYS];

  expect(sameColour(getComputedStyle(document.body).backgroundColor, PALETTE[theme].bg ?? "")).toBe(true);
  expect(texts.length).toBeGreaterThan(0);
  expect(
    surfaces
      .filter((surface) => !colours.some((colour) => sameColour(getComputedStyle(surface).backgroundColor, colour)))
      .map((surface) => `${describeElement(surface)}: ${getComputedStyle(surface).backgroundColor}`)
  ).toEqual([]);
  expect(
    texts.filter((text) => textContrast(text) < TEXT_CONTRAST).map((text) => `${describeElement(text)}: ${textContrast(text).toFixed(2)}`)
  ).toEqual([]);
}

// Checks every screen in every state: the home page with each menu closed
// and open, the portrait gate, a whole round, each question before and
// after its answer, the first one wrong so both marks show, the result with
// its celebration, the home page again, the catalogue with a card of each
// food type, and a page of each; then care's welcome, its friends with
// none yet, a visit with each need asked, refused, suggested, met with
// hearts and the visitor dancing away, its result with its celebration,
// and the friend made.
async function expectEveryScreenIn(theme: Theme, user: UserEvent, orientation: ManualOrientation, timers: ManualTimers) {
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

  await user.click(screen.getByRole("button", { name: "ALL DINOSAURS" }));
  expectScreenIn(theme);
  for (const name of ["Tyrannosaurus", "Triceratops", "Gallimimus"]) {
    await user.click(within(screen.getByRole("group", { name: "ALL DINOSAURS" })).getByRole("button", { name }));
    expectScreenIn(theme);
    await user.click(screen.getByRole("button", { name: "ALL DINOSAURS" }));
  }
  await user.click(screen.getByRole("button", { name: "HOME" }));

  await user.click(screen.getByRole("button", { name: "CARE" }));
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "FRIENDS" }));
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "BACK" }));
  await user.click(screen.getByRole("button", { name: "NEW VISITOR" }));
  for (let need = needAsked(); need !== undefined; need = needAsked()) {
    expectScreenIn(theme);
    const visitor = visitorShown();
    await user.click(trayItem(missesFor(visitor, need)));
    expectScreenIn(theme);
    endReaction(timers);
    expectScreenIn(theme);
    await user.click(trayItem(meets(visitor, need)));
    expectScreenIn(theme);
    endReaction(timers);
  }
  expect(document.querySelector(".stage[data-leaving]")).not.toBeNull();
  expectScreenIn(theme);
  endReaction(timers);
  expect(screen.getByRole("status")).toBeDefined();
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "FRIENDS" }));
  expect(within(screen.getByRole("group", { name: "FRIENDS" })).getAllByRole("button")).toHaveLength(1);
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "HOME" }));
}

describe("the System theme", () => {
  it.each(["light", "dark"] as const)("follows the device appearance %s on every screen", async (appearance) => {
    const orientation = manualOrientation("landscape");
    const timers = manualTimers();
    const { user } = openApp({ device: manualAppearance(appearance), orientation, timers });

    await expectEveryScreenIn(appearance, user, orientation, timers);
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

    expect(sameColour(getComputedStyle(document.body).backgroundColor, PALETTE.light.bg ?? "")).toBe(true);
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
    "is a small button in the soft ink with the current theme's symbol in the top-right corner of the home page only, in %s",
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
      // Faded as the design fades what is for parents: in its soft ink.
      expect(sameColour(style.color, PALETTE.light["ink-soft"] ?? "")).toBe(true);
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
      const mark = within(cardOf(dinosaur)).getByRole("img", { name: /^(RIGHT|WRONG)$/ });
      return { symbol: symbolOf(mark), colour: getComputedStyle(mark).backgroundColor, card: surfaceOf(mark.parentElement ?? mark) };
    });
    expect(marks.map(({ symbol }) => symbol)).toEqual(["check", "x"]);
    // The right answer in the design's green, the wrong one in its
    // terracotta.
    expect(marks.map(({ colour }, at) => sameColour(colour, [PALETTE[theme].good, PALETTE[theme].bad][at] ?? ""))).toEqual([true, true]);
    for (const { colour, card } of marks) {
      expect(contrast(colour, card)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the MORE COMING card", () => {
  it.each(["light", "dark"] as const)("is on the %s theme's paper, its lock and words in the soft ink at text contrast", (theme) => {
    openApp({ device: manualAppearance(theme) });

    expectScreenIn(theme);
    const card = document.querySelector(".more-coming") ?? document.body;
    const symbol = card.querySelector(".more-coming-symbol") ?? card;
    const title = card.querySelector(".more-coming-title") ?? card;
    const colours = PALETTE[theme];
    const parts = {
      card: [getComputedStyle(card).backgroundColor, colours.surface],
      symbol: [getComputedStyle(symbol).backgroundColor, colours["surface-2"]],
      lock: [getComputedStyle(symbol).color, colours["ink-soft"]],
      words: [getComputedStyle(title).color, colours["ink-soft"]]
    };
    expect(Object.entries(parts).filter(([, [seen, wanted]]) => !sameColour(seen ?? "", wanted ?? ""))).toEqual([]);
    expect(title.textContent).toBe("MORE COMING");
    expect(textContrast(title)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});
