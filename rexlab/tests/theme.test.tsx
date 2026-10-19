import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localPairsProgress, localSortingProgress } from "../src/localProgress.ts";
import { THEME_KEY, localTheme } from "../src/localTheme.ts";
import { largerOf, type Dinosaur, type Question } from "../src/quiz/round.ts";
import { REVEAL } from "../src/skeletonGame.tsx";
import { HELP_AFTER } from "../src/skeletons/index.ts";
import type { Theme } from "../src/theme.ts";
import { NEEDS } from "../src/care/index.ts";
import type { Basket } from "../src/SortScreen.tsx";
import { boardState, type Property } from "../src/sorting/index.ts";
import { endReaction, meetNeed, meets, missesFor, needAsked, playVisit, trayItem, visitorShown } from "./care.ts";
import { chooseFrom, choicesIn, openMenu, outsideMenu } from "./menus.ts";
import { HOME_GAMES, badgeOf, nameRowOf, renderHomePageFeaturing, symbolSquareOf } from "./homePage.tsx";
import { MISS, endWave, pairsRecord, playBoard, playPairs, showMiss, stateAt, turnCard } from "./pairsApp.tsx";
import { AWAY, dragTo as dragBone, fit, fitAll, fittedPieces, hints, layOutPuzzle, lifted, moveTo, press, release, skeletonOf, spotOf, spotPieces, spots } from "./skeletonsApp.tsx";
import { basketButton, centreOf, dragTo, finishBoard, layOutBaskets, openBoard, openSortingGame, otherBasket, trayCard } from "./sorting.tsx";
import {
  OVERLAYS,
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  contrast,
  emptyCare,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  manualAppearance,
  manualOrientation,
  manualTimers,
  memoryStorage,
  sameColour,
  seededRandom,
  seenOn,
  sortingBy,
  surfaceOf,
  surfacesIn,
  symbolOf,
  unreadVersion,
  type ManualAppearance,
  type ManualOrientation,
  type ManualTimers,
  type MemoryStorage,
  featuredCard,
  homeTile,
  unsetAgeLevel
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
  timers = manualTimers(),
  sorting = emptySorting(),
  pairs = memoryStorage()
}: {
  device?: ManualAppearance;
  storage?: MemoryStorage;
  orientation?: ManualOrientation;
  language?: string;
  timers?: ManualTimers;
  sorting?: ReturnType<typeof emptySorting>;
  // Where find the pair's progress is kept.
  pairs?: MemoryStorage;
} = {}) {
  const languages = memoryStorage();
  const view = render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(41)}
      orientation={orientation}
      progress={emptyProgress()}
      deviceLanguage={language}
      languageStore={localLanguage(() => languages)}
      nameVersion={unreadVersion}
      appearance={device}
      themeStore={localTheme(() => storage)}
      {...unsetAgeLevel()}
      {...emptyCare()}
      {...sorting}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(() => pairs)}
      {...emptySkeletons()}
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

// What a walk over screens is given: the theme each screen is to be in,
// and the app it walks, opened on the home page.
type Walk = { theme: Theme; user: UserEvent; orientation: ManualOrientation; timers: ManualTimers };

const unchecked = () => {};

async function home({ theme }: Walk) {
  expectScreenIn(theme);
}

async function menus({ theme, user }: Walk) {
  for (const menu of ["Theme", "Language"]) {
    await openMenu(user, menu);
    expectScreenIn(theme);
    await user.click(outsideMenu());
  }
}

async function portraitGate({ theme, orientation }: Walk) {
  act(() => orientation.turn("portrait"));
  expectScreenIn(theme);
}

// Answers the round's questions `from` to `to`, the first one wrong so
// both marks show, with `check` before and after each answer.
async function answer(user: UserEvent, from: number, to: number, check: () => void) {
  for (let number = from; number <= to; number++) {
    check();
    const question = shownQuestion();
    await user.click(cardOf(number === 1 ? smallerOf(question) : largerOf(question)));
    check();
    await user.click(screen.getByRole("button", { name: number < 10 ? "NEXT" : "SEE RESULT" }));
  }
}

// Questions `from` to `to`, those before them answered unchecked.
const questions =
  (from: number, to: number) =>
  async ({ theme, user }: Walk) => {
    await user.click(homeTile("COMPARE"));
    await answer(user, 1, from - 1, unchecked);
    await answer(user, from, to, () => expectScreenIn(theme));
  };

async function quizResult({ theme, user }: Walk) {
  await user.click(homeTile("COMPARE"));
  await answer(user, 1, 10, unchecked);
  expect(screen.getByRole("status")).toBeDefined();
  expectScreenIn(theme);

  await user.click(screen.getByRole("button", { name: "HOME" }));
  expectScreenIn(theme);
}

async function catalogueList({ theme, user }: Walk) {
  await user.click(screen.getByRole("button", { name: "ALL DINOSAURS" }));
  expectScreenIn(theme);
  for (const food of ["MEAT", "PLANTS", "BOTH", "ALL"]) {
    await user.click(within(screen.getByRole("group", { name: "FOOD" })).getByRole("button", { name: food }));
    expectScreenIn(theme);
  }
}

async function cataloguePages({ theme, user }: Walk) {
  for (const name of ["Tyrannosaurus", "Triceratops", "Gallimimus"]) {
    await user.click(screen.getByRole("button", { name: "ALL DINOSAURS" }));
    await user.click(within(screen.getByRole("group", { name: "ALL DINOSAURS" })).getByRole("button", { name }));
    expectScreenIn(theme);
  }
}

async function careWelcome({ theme, user }: Walk) {
  await user.click(screen.getByRole("button", { name: "CARE" }));
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "FRIENDS" }));
  expectScreenIn(theme);
}

// The visit's needs from the `from`th to the `to`th, each asked, refused,
// suggested and met with hearts, those before them met unchecked, and the
// visitor dancing away after the last.
const visit =
  (from: number, to: number) =>
  async ({ theme, user, timers }: Walk) => {
    await user.click(screen.getByRole("button", { name: "CARE" }));
    await user.click(screen.getByRole("button", { name: "NEW VISITOR" }));
    for (let number = 1; number < from; number++) await meetNeed(user, timers, true);
    for (let number = from; number <= to; number++) {
      const need = needAsked();
      if (need === undefined) throw new Error(`No need ${number} is asked`);
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
    if (to < NEEDS.length) return;
    expect(document.querySelector(".stage[data-leaving]")).not.toBeNull();
    expectScreenIn(theme);
  };

async function careResult({ theme, user, timers }: Walk) {
  await user.click(screen.getByRole("button", { name: "CARE" }));
  await user.click(screen.getByRole("button", { name: "NEW VISITOR" }));
  await playVisit(user, timers, NEEDS);
  expect(screen.getByRole("status")).toBeDefined();
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "FRIENDS" }));
  expect(within(screen.getByRole("group", { name: "FRIENDS" })).getAllByRole("button")).toHaveLength(1);
  expectScreenIn(theme);
}

async function pairsWelcome({ theme, user }: Walk) {
  await user.click(screen.getByRole("button", { name: "FIND THE PAIR" }));
  expectScreenIn(theme);
}

// A Hatchling board with a card open, a miss, found pairs, and its cards
// waving, then the result, with its celebration and NEW badges.
async function pairsBoard({ theme, user, timers }: Walk) {
    await playPairs(user, "HATCHLING");
    expectScreenIn(theme);
    await turnCard(user, 0);
    expectScreenIn(theme);
    await showMiss(user);
    expectScreenIn(theme);
    act(() => timers.fire(MISS));
    await playBoard(user, timers);
    expect(document.querySelector(".pair-board[data-finished]")).not.toBeNull();
    expectScreenIn(theme);
    endWave(timers);
    expect(screen.getByRole("status")).toBeDefined();
    expectScreenIn(theme);
}

// Each large level's board with a silhouette or picture open, every pair
// found, and the result with its first best and NEW badges.
const pairsLargeBoard = (level: string) =>
  async ({ theme, user, timers }: Walk) => {
    await playPairs(user, level);
    await turnCard(user, 0);
    expectScreenIn(theme);
    await turnCard(user, 1);
    if (stateAt(1) === "open") act(() => timers.fire(MISS));
    await playBoard(user, timers);
    expectScreenIn(theme);
    endWave(timers);
    expect(screen.getByRole("status", { name: "FIRST BEST SCORE" })).toBeDefined();
    expectScreenIn(theme);
    await user.click(screen.getByRole("button", { name: "HOME" }));
  };

async function pairsFound({ theme, user, timers }: Walk) {
  await playPairs(user, "HATCHLING");
  await playBoard(user, timers);
  endWave(timers);
  await user.click(screen.getByRole("button", { name: "HOME" }));
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "ALL DINOSAURS" }));
  expect(screen.getAllByRole("img", { name: "FOUND" })).toHaveLength(3);
  expectScreenIn(theme);
  const grid = screen.getByRole("group", { name: "ALL DINOSAURS" });
  const stamped = within(grid).getAllByRole("img", { name: "FOUND" })[0]?.closest("button");
  if (!stamped) throw new Error("No stamped card");
  await user.click(stamped);
  expect(screen.getByRole("img", { name: "FOUND" })).toBeDefined();
  expectScreenIn(theme);
}

async function skeletonChoice({ theme, user }: Walk) {
  await user.click(screen.getByRole("button", { name: "SKELETONS" }));
  expectScreenIn(theme);
}

// A dinosaur's puzzle as it starts: its faint outline and its pieces in
// the tray.
const skeletonPuzzle =
  (name: string) =>
  async ({ theme, user }: Walk) => {
    await user.click(screen.getByRole("button", { name: "SKELETONS" }));
    await user.click(screen.getByRole("button", { name }));
    expect(within(screen.getByRole("group", { name: "BONES" })).getAllByRole("img")).toHaveLength(spots().length);
    expectScreenIn(theme);
  };

// A puzzle at work: a bone fitted, another lifted from the tray, and,
// once the child has waited, each step of help on the bone to fit next.
async function skeletonAtWork({ theme, user, timers }: Walk) {
  const stegosaurus = skeletonOf("stegosaurus");
  await user.click(screen.getByRole("button", { name: "SKELETONS" }));
  await user.click(screen.getByRole("button", { name: "STEGOSAURUS" }));
  layOutPuzzle();
  const [first = "", second = ""] = spotPieces();
  fit(stegosaurus, second);
  const spot = spotOf(spotPieces().at(-1) ?? "");
  const { left, top } = spot.getBoundingClientRect();
  press(spot, { clientX: left + 40, clientY: top + 40 });
  moveTo(AWAY);
  expect([fittedPieces(), lifted()]).toEqual([[second], expect.anything()]);
  expectScreenIn(theme);
  release(AWAY);
  // Explorer's help climbs its steps: the region, the ghost, the move.
  for (const step of [".skeleton-region", ".skeleton-ghost", ".skeleton-piece[data-nudge]"]) {
    for (let second = 0; second < HELP_AFTER / 1000; second++) act(() => timers.fire(1000));
    expect([hints(), document.querySelector(step) !== null]).toEqual([[`spot ${first}`], true]);
    expectScreenIn(theme);
  }
}

// Paleontologist's Tyrannosaurus on its silhouette, a bone fitted and
// another dinosaur's bone dropped, its line saying whose it is.
async function skeletonPaleontologist({ theme, user }: Walk) {
  const tyrannosaurus = skeletonOf("tyrannosaurus");
  await user.click(screen.getByRole("button", { name: "SKELETONS" }));
  await user.click(screen.getByRole("button", { name: "PALEONTOLOGIST" }));
  await user.click(screen.getByRole("button", { name: "TYRANNOSAURUS" }));
  layOutPuzzle();
  fit(tyrannosaurus, "head");
  dragBone("triceratops/frill", AWAY);
  expect([document.querySelector(".skeleton-outline-silhouette") !== null, screen.getByRole("status").textContent]).toEqual([true, "THAT'S THE TRICERATOPS FRILL!"]);
  expectScreenIn(theme);
}

// A skeleton's reveal with a first best, the choice with its star, a
// second skeleton's reveal with the best it beat, and the home page with
// the best on the SKELETONS tile.
async function skeletonReveals({ theme, user, timers }: Walk) {
  await user.click(screen.getByRole("button", { name: "SKELETONS" }));
  for (const [id, celebration] of [
    ["triceratops", "FIRST BEST SCORE"],
    ["stegosaurus", "NEW BEST SCORE"]
  ] as const) {
    const skeleton = skeletonOf(id);
    await user.click(screen.getByRole("button", { name: skeleton.name.en.toUpperCase() }));
    layOutPuzzle();
    fitAll(skeleton);
    act(() => timers.fire(REVEAL.motion));
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(celebration);
    expectScreenIn(theme);
    await user.click(screen.getByRole("button", { name: "BUILD ANOTHER" }));
    expect(screen.getAllByRole("img", { name: "STAR" })).not.toHaveLength(0);
    expectScreenIn(theme);
  }
  await user.click(screen.getByRole("button", { name: "HOME" }));
  expect(screen.getByRole("button", { name: "SKELETONS" }).querySelector(".skeletons-tile-best")?.textContent).toBe("2");
  expectScreenIn(theme);
}

// The museum empty, then with a skeleton on its stand with its Explorer
// badge, built at Explorer, the level none was picked at, without help;
// its puzzle as the skeleton is knocked down and its bones scatter, and
// the museum with that stand awaiting it.
async function skeletonMuseum({ theme, user, timers }: Walk) {
  const triceratops = skeletonOf("triceratops");
  await user.click(screen.getByRole("button", { name: "SKELETONS" }));
  await user.click(screen.getByRole("button", { name: "MUSEUM" }));
  expectScreenIn(theme);
  await user.click(within(screen.getByRole("region", { name: "TRICERATOPS" })).getByRole("button", { name: "BUILD" }));
  layOutPuzzle();
  fitAll(triceratops);
  act(() => timers.fire(REVEAL.motion));
  await user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "MUSEUM" }));
  expect([screen.getAllByRole("img", { name: "STAR" }), screen.getAllByRole("img", { name: "EXPLORER BADGE" })].map((shown) => shown.length)).toEqual([1, 1]);
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "REBUILD" }));
  expect(within(screen.getByRole("group", { name: "BONES" })).getAllByRole("img")).toHaveLength(spots().length);
  expectScreenIn(theme);
  await user.click(screen.getByRole("button", { name: "MUSEUM" }));
  expect(screen.getByRole("button", { name: "CONTINUE" })).toBeDefined();
  expectScreenIn(theme);
}

// Every screen in every state, by group, each part of a group walked from
// a newly opened app: one walk over them all outlasts a test's time limit
// on CI.
const SCREEN_GROUPS: Array<[string, Array<[string, (walk: Walk) => Promise<void>]>]> = [
  [
    "the home page and its menus",
    [
      ["the home page", home],
      ["each menu open", menus],
      ["the portrait gate", portraitGate]
    ]
  ],
  [
    "the quiz and its result",
    [
      ["questions 1 to 4 before and after their answers, the first one wrong so both marks show", questions(1, 4)],
      ["questions 5 to 7 before and after their answers", questions(5, 7)],
      ["questions 8 to 10 before and after their answers", questions(8, 10)],
      ["the result with its celebration, and the home page again", quizResult]
    ]
  ],
  [
    "the catalogue",
    [
      ["the list with a card of each food type, each food chosen", catalogueList],
      ["a page of each food type", cataloguePages]
    ]
  ],
  [
    "care",
    [
      ["the welcome, and the friends with none yet", careWelcome],
      ["a visit's first two needs, each asked, refused, suggested and met with hearts", visit(1, 2)],
      ["a visit's last two needs, each asked, refused, suggested and met with hearts, and the visitor dancing away", visit(3, NEEDS.length)],
      ["the result with its celebration, and the friend made", careResult]
    ]
  ],
  [
    "find the pair",
    [
      ["the welcome", pairsWelcome],
      ["a board of pictures with a card open, a miss, found pairs and the cards waving, and the result", pairsBoard],
      ["Explorer's board of silhouettes, a card open, every pair found, and the result", pairsLargeBoard("EXPLORER")],
      ["Paleontologist's board of silhouettes, a card open, every pair found, and the result", pairsLargeBoard("PALEONTOLOGIST")],
      ["the dinosaurs found, stamped in the catalogue and on a page", pairsFound]
    ]
  ],
  [
    "the skeleton game",
    [
      ["the choice of dinosaurs", skeletonChoice],
      ["the Tyrannosaurus puzzle as it starts", skeletonPuzzle("TYRANNOSAURUS")],
      ["the Triceratops puzzle as it starts", skeletonPuzzle("TRICERATOPS")],
      ["the Stegosaurus puzzle as it starts", skeletonPuzzle("STEGOSAURUS")],
      ["a puzzle with a bone fitted, one lifted and each step of help", skeletonAtWork],
      ["Paleontologist's puzzle on its silhouette, with another dinosaur's bone told", skeletonPaleontologist],
      ["two finished skeletons' reveals, a first best and a new one, the choice with their stars, and the home page with the best", skeletonReveals],
      ["the museum empty, with a skeleton on its stand, as it is knocked down, and with its stand awaiting it", skeletonMuseum]
    ]
  ]
];

describe("the System theme", () => {
  describe.each(["light", "dark"] as const)("follows the device appearance %s", (appearance) => {
    describe.each(SCREEN_GROUPS)("on %s:", (_, parts) => {
      it.each(parts)("%s", async (_, walk) => {
        const orientation = manualOrientation("landscape");
        const timers = manualTimers();
        const { user } = openApp({ device: manualAppearance(appearance), orientation, timers });

        await walk({ theme: appearance, user, orientation, timers });
      });
    });
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
    await user.click(homeTile("COMPARE"));
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
    await user.click(homeTile("COMPARE"));
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
      const card = homeTile(LABELS[language].card);

      expect(button.textContent).toBe("");
      expect(symbolOf(button)).toBe("monitor");
      const corner = getComputedStyle(button.closest(".home-corner") ?? button);
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
        parseFloat(getComputedStyle(within(featuredCard()).getByText(LABELS[language].card)).fontSize) / 2
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

// The large card is shown through the home page's props, each game
// featured in turn, in the theme the app sets on the page.
describe("the large card", () => {
  // The colours a part is drawn in: its surface, its words, and its
  // symbol's.
  const look = (part: Element | null) =>
    part && [part, part.querySelector("svg") ?? part].map((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(element).color]);

  it.each(["light", "dark"] as const)("is in the %s theme with every game featured, in its own tile's colours", (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      for (const [game, key] of HOME_GAMES) {
        const { unmount } = renderHomePageFeaturing(game);
        expectScreenIn(theme);

        const card = featuredCard();
        const tile = homeTile(TEXTS.en[key]);
        const parts = (of: Element) => [look(of), look(symbolSquareOf(of)), look(badgeOf(of)), look(of.querySelector('[class$="-title"]'))];
        expect({ game, parts: parts(card) }).toEqual({ game, parts: parts(tile) });
        // The shade the name stands on, the tile's row's or none.
        const footer = getComputedStyle(nameRowOf(card) ?? card).backgroundColor;
        expect({ game, footer }).toEqual({ game, footer: getComputedStyle(nameRowOf(tile) ?? tile).backgroundColor });
        unmount();
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

// The board is shown through the sorting game and the screen's props, in
// the theme the app sets on the page.
describe("the sorting board", () => {
  const PROPERTIES: Property[] = ["legs", "diet", "size", "horns", "feathers"];

  it.each(["light", "dark"] as const)("is in the %s theme in every state, with every basket's symbol", async (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      for (const property of PROPERTIES) {
        const user = userEvent.setup();
        const sorting = sortingBy(property);
        const { unmount } = openBoard(sorting);
        layOutBaskets(sorting);
        const [missed, ...rest] = boardState(sorting).cards;
        if (!missed) throw new Error("The board has no cards");
        const right = missed.basket as Basket;
        expectScreenIn(theme);

        await user.click(trayCard(missed));
        expectScreenIn(theme);
        await user.click(trayCard(missed));
        await user.pointer([
          { keys: "[TouchA>]", target: trayCard(missed), coords: { clientX: 200, clientY: 300 } },
          { pointerName: "TouchA", coords: centreOf(sorting, otherBasket(sorting, right)) }
        ]);
        expectScreenIn(theme);
        await user.pointer({ keys: "[/TouchA]", coords: centreOf(sorting, otherBasket(sorting, right)) });
        // The hint on the card and the right basket's glow.
        expect(document.querySelector(".sort-hint")).not.toBeNull();
        expect(document.querySelector(".basket-glow")).not.toBeNull();
        expectScreenIn(theme);

        await dragTo(user, trayCard(missed), centreOf(sorting, right));
        for (const card of rest) {
          await user.click(trayCard(card));
          await user.click(basketButton(card.basket as Basket));
        }
        expect(screen.getByRole("button", { name: "SEE RESULT" })).toBeDefined();
        expectScreenIn(theme);
        unmount();
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });

  it.each(["light", "dark"] as const)("marks a sorted card's ✓ and each hint at least 3:1 against what they are on, in the %s theme", async (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      const user = userEvent.setup();
      const sorting = sortingBy("diet");
      const { unmount } = openBoard(sorting);
      const [first, second] = boardState(sorting).cards;
      if (!first || !second) throw new Error("The board has no cards");
      await user.click(trayCard(first));
      await user.click(basketButton(first.basket as Basket));
      await user.click(trayCard(second));
      await user.click(basketButton(otherBasket(sorting, second.basket as Basket)));

      const check = screen.getByRole("img", { name: "RIGHT" });
      const hint = within(trayCard(second)).getByRole("img", { name: (second.basket as string).toUpperCase() });
      for (const mark of [check, hint]) {
        const colour = getComputedStyle(mark).backgroundColor;
        expect(contrast(colour, surfaceOf(mark.parentElement ?? mark))).toBeGreaterThanOrEqual(3);
        expect(contrast(getComputedStyle(mark).color, colour)).toBeGreaterThanOrEqual(3);
      }
      expect(sameColour(getComputedStyle(check).backgroundColor, PALETTE[theme].good ?? "")).toBe(true);
      unmount();
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

// The result is reached through the sorting game, its screens' props and
// its progress store, in the theme the app sets on the page.
describe("the sorting result", () => {
  it.each(["light", "dark"] as const)("is in the %s theme with its celebration, and without one", async (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      for (const right of [4, 0]) {
        const { user, nextBoard, unmount } = openSortingGame();
        await finishBoard(user, nextBoard(), right);
        expect(screen.queryAllByRole("status")).toHaveLength(right > 0 ? 1 : 0);
        expectScreenIn(theme);
        unmount();
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

describe("marks", () => {
  it.each(["light", "dark"] as const)("keep at least 3:1 contrast with their card in the %s theme", async (theme) => {
    const { user } = openApp({ device: manualAppearance(theme) });
    await user.click(homeTile("COMPARE"));
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

describe("the SORT card", () => {
  it.each(["light", "dark"] as const)("is on the %s theme's paper, its shapes on terracotta and its words and best score at text contrast", (theme) => {
    const sortingStorage = memoryStorage({
      [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "sort-dinosaurs": { bestScore: 4, explorerBest: 4, roundsPlayed: 2 } } })
    });
    openApp({ device: manualAppearance(theme), sorting: { ...emptySorting(), sortingProgress: localSortingProgress(() => sortingStorage) } });

    expectScreenIn(theme);
    const card = screen.getByRole("button", { name: "SORT" });
    const symbol = card.querySelector(".sort-tile-symbol") ?? card;
    const title = card.querySelector(".sort-tile-title") ?? card;
    const best = card.querySelector(".sort-tile-best") ?? card;
    const colours = PALETTE[theme];
    const parts = {
      card: [getComputedStyle(card).backgroundColor, colours.surface],
      symbol: [getComputedStyle(symbol).backgroundColor, colours.terra],
      words: [getComputedStyle(title).color, colours.ink],
      best: [getComputedStyle(best).backgroundColor, colours["surface-2"]],
      trophy: [getComputedStyle(best.querySelector("svg") ?? best).color, colours.amber]
    };
    expect(Object.entries(parts).filter(([, [seen, wanted]]) => !sameColour(seen ?? "", wanted ?? ""))).toEqual([]);
    expect([title.textContent, best.textContent]).toEqual(["SORT", "4"]);
    expect([title, best].map((text) => textContrast(text) >= TEXT_CONTRAST)).toEqual([true, true]);
  });
});

describe("the FIND THE PAIR tile", () => {
  it.each(["light", "dark"] as const)("is the %s theme's sky, its words in the ink at text contrast", (theme) => {
    openApp({ device: manualAppearance(theme) });

    expectScreenIn(theme);
    const tile = screen.getByRole("button", { name: "FIND THE PAIR" });
    const title = tile.querySelector(".pairs-tile-title") ?? tile;
    const colours = PALETTE[theme];
    const parts = {
      tile: [getComputedStyle(tile).backgroundColor, colours.sky],
      words: [getComputedStyle(title).color, colours.ink]
    };
    expect(Object.entries(parts).filter(([, [seen, wanted]]) => !sameColour(seen ?? "", wanted ?? ""))).toEqual([]);
    expect(textContrast(title)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});

describe("a board of silhouettes", () => {
  it.each(["light", "dark"] as const)("keeps face-down cards, open cards and silhouettes apart from what is behind them in the %s theme", async (theme) => {
    const timers = manualTimers();
    const pairs = memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 6, level: 4, boardsOnLevel: 0, best: {}, found: [] }) });
    const { user } = openApp({ device: manualAppearance(theme), timers, pairs });
    await playPairs(user);
    expectScreenIn(theme);

    await playBoard(user, timers);

    expectScreenIn(theme);
    // A silhouette is black on the light art, white on the dark, and so
    // keeps text contrast with it.
    const art = document.querySelector(".pair-card-art") ?? document.body;
    const silhouette = document.querySelector(".pair-silhouette") ?? document.body;
    expect(getComputedStyle(silhouette).filter).toBe(theme === "dark" ? "brightness(0) invert(1)" : "brightness(0)");
    expect(sameColour(getComputedStyle(art).backgroundColor, PALETTE[theme]["surface-2"] ?? "")).toBe(true);
    expect(contrast(theme === "dark" ? "#FFFFFF" : "#000000", PALETTE[theme]["surface-2"] ?? "")).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});
