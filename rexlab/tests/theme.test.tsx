import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { CareResultScreen } from "../src/CareResultScreen.tsx";
import { CareWelcomeScreen } from "../src/CareWelcomeScreen.tsx";
import { CatalogueScreen } from "../src/CatalogueScreen.tsx";
import { DigBoardScreen, type BoardFinish } from "../src/DigBoardScreen.tsx";
import { DigFieldGuideScreen } from "../src/DigFieldGuideScreen.tsx";
import { DigRevealScreen } from "../src/DigRevealScreen.tsx";
import { DinosaurPage } from "../src/DinosaurPage.tsx";
import { FriendsScreen } from "../src/FriendsScreen.tsx";
import { OrientationGate } from "../src/OrientationGate.tsx";
import { PairsBoardScreen } from "../src/PairsBoardScreen.tsx";
import { PairsResultScreen } from "../src/PairsResultScreen.tsx";
import { PairsWelcomeScreen } from "../src/PairsWelcomeScreen.tsx";
import { SkeletonChoiceScreen } from "../src/SkeletonChoiceScreen.tsx";
import { SkeletonMuseumScreen } from "../src/SkeletonMuseumScreen.tsx";
import { SkeletonPuzzleScreen } from "../src/SkeletonPuzzleScreen.tsx";
import { SkeletonResultScreen } from "../src/SkeletonResultScreen.tsx";
import { VisitScreen } from "../src/VisitScreen.tsx";
import { FOODS, ofFood, type Food } from "../src/catalogue.ts";
import { ITEMS, MOST_HEARTS, NEEDS, give, settle, startVisit, suitableItems, type Need as CareNeed, type Visit, type Visitor } from "../src/care/visit.ts";
import { TREASURE_KINDS } from "../src/dig/index.ts";
import { BRUSH_SIZES, brushRound, startRound, type DigRound } from "../src/dig/round.ts";
import type { Language } from "../src/language/language.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localPairsProgress, localSortingProgress } from "../src/localProgress.ts";
import { THEME_KEY, localTheme } from "../src/localTheme.ts";
import { dealBoard, isFinished, turn, turnBack, type Board, type BoardLevel } from "../src/pairs/board.ts";
import {
  presentCatalogueCard,
  presentDigBoard,
  presentDinosaurPage,
  presentFriend,
  presentPairsBoard,
  presentPuzzle,
  presentSkeletonChoices,
  presentSkeletonMuseum,
  presentVisit
} from "../src/presentation.ts";
import { type Dinosaur } from "../src/quiz/round.ts";
import { NO_SKELETONS, museumOf, type SkeletonProgress } from "../src/skeletons/collection.ts";
import { HELP_AFTER, cutAt, drop, startPuzzle, touch, wait, type Puzzle } from "../src/skeletons/puzzle.ts";
import { THEMES, type Theme } from "../src/theme.ts";
import type { Basket } from "../src/SortScreen.tsx";
import { boardState, type Property } from "../src/sorting/index.ts";
import { board as sandBoard, placeBoard } from "./digApp.tsx";
import { chooseFrom, choicesIn, openMenu, outsideMenu } from "./menus.ts";
import { HOME_GAMES, nameRowOf, renderHomePageFeaturing, symbolSquareOf } from "./homePage.tsx";
import { pairsRecord, playBoard, playPairs } from "./pairsApp.tsx";
import { AWAY, hints, layOutPuzzle, lifted, moveTo, press, release, spotOf, spotPieces } from "./skeletonsApp.tsx";
import { basketButton, centreOf, dragTo, finishBoard, layOutBaskets, openBoard, openSortingGame, otherBasket, trayCard } from "./sorting.tsx";
import { moveAt, pressAt } from "./taps.ts";
import { withPictures } from "./pictures.tsx";
import {
  OVERLAYS,
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DIG,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SKELETONS,
  SHIPPED_VISITORS,
  contrast,
  emptyCare,
  emptyDig,
  emptyLabyrinth,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  fakeItemPicture,
  fakeSkeletonPicture,
  fakeTreasurePicture,
  featuring,
  keptNothing,
  largestSize,
  manualAppearance,
  manualViewport,
  manualTimers,
  memoryStorage,
  pageAtRest,
  sameColour,
  seededRandom,
  seenOn,
  sortingBy,
  surfaceOf,
  surfacesIn,
  symbolOf,
  unreadVersion,
  type ManualAppearance, type ManualViewport, type ManualTimers, type MemoryStorage,
  featuredCard, gameDoor,
  unsetAgeLevel,
  shownQuestion,
  wrongOf
} from "./support.ts";

const DESIGN_TOKENS = [...new Set(readFileSync(join(import.meta.dirname, "../src/app.css"), "utf8").match(/--ds-[\w-]+(?=:)/g) ?? [])];

// The WCAG AA contrast for text, which every text read in either theme keeps.
const TEXT_CONTRAST = 4.5;

const group = () => screen.getByRole("group", { name: "ANIMALS" });
const cardOf = (dinosaur: Dinosaur) => within(group()).getByRole("button", { name: dinosaur.name.en });
const progress = () => screen.getByLabelText("PROGRESS").textContent;

function openApp({
  device = manualAppearance("light"),
  storage = memoryStorage(),
  viewport = manualViewport("landscape"),
  language = "en-GB",
  timers = manualTimers(),
  sorting = emptySorting(),
  pairs = memoryStorage()
}: {
  device?: ManualAppearance;
  storage?: MemoryStorage;
  viewport?: ManualViewport;
  language?: string;
  timers?: ManualTimers;
  sorting?: ReturnType<typeof emptySorting>;
  // Where find the pair's progress is kept.
  pairs?: MemoryStorage;
} = {}) {
  const languages = memoryStorage();
  const view = render(
    <App {...emptyLabyrinth()}
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(41)}
      portraitLayouts={{}}
      viewport={viewport}
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
      {...emptyDig()}
      {...pageAtRest()}
      {...timers}
    />
  );
  return { user: userEvent.setup({ delay: null }), unmount: view.unmount };
}

const describeElement = (element: Element) =>
  `<${element.tagName.toLowerCase()} class="${element.className}">${element.textContent?.trim().slice(0, 20) ?? ""}`;

// The contrast of a text with what it is seen on.
const textContrast = (text: Element, styleOf: typeof getComputedStyle = getComputedStyle) => {
  const surface = surfaceOf(text, styleOf);
  return contrast(seenOn(styleOf(text).color, surface), surface);
};

// Which theme the app sets, cheaper than reading every part.
function expectPageIn(theme: Theme) {
  expect(document.documentElement.dataset.theme).toBe(theme);
}

// The screen is in `theme` when the page and every surface on it take the
// theme's colours from the game palette and shared tokens, or a layer both themes
// lay over the navy, and every text read on it keeps text contrast with
// what it is seen on. The two themes share no colour but the words on the
// navy, so a surface left in the other theme shows. Symbols hidden from
// reading, such as the faded stars, are pictures, not text. Given a part,
// only its surfaces and texts are checked, beside the page's own colour.

function expectScreenIn(theme: Theme, part: Element = document.body) {
  const styles = new Map<Element, CSSStyleDeclaration>();
  const styleOf: typeof getComputedStyle = element => {
    const cached = styles.get(element);
    if (cached) return cached;
    const style = getComputedStyle(element);
    styles.set(element, style);
    return style;
  };
  const surfaces = surfacesIn(part, styleOf);
  const texts = [part, ...part.querySelectorAll("*")].filter(
    (element) =>
      !element.closest('[aria-hidden="true"]') &&
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
  );
  const tokens = styleOf(document.documentElement);
  // Any design colour the stylesheet sets is a theme's colour.
  const sharedColours = DESIGN_TOKENS.map((name) => tokens.getPropertyValue(name).trim()).filter((value) => /^(#|rgb)/.test(value));
  const colours = [...Object.values(PALETTE[theme]), ...sharedColours, ...OVERLAYS];
  const accepted = new Map<string, boolean>(); // each colour is checked once
  const inPalette = (bg: string) => accepted.get(bg) ?? accepted.set(bg, colours.some(colour => sameColour(bg, colour))).get(bg)!;
  // The page behind the browser's bars is the theme's page, Home too.
  expect(sameColour(styleOf(document.body).backgroundColor, PALETTE[theme].bg ?? "")).toBe(true);
  expect(texts.length).toBeGreaterThan(0);
  expect(
    surfaces
      .filter((surface) => !inPalette(styleOf(surface).backgroundColor))
      .map((surface) => `${describeElement(surface)}: ${styleOf(surface).backgroundColor}`)
  ).toEqual([]);
  expect(
    texts.filter((text) => textContrast(text, styleOf) < TEXT_CONTRAST).map((text) => `${describeElement(text)}: ${styleOf(text).color} on ${surfaceOf(text, styleOf)} = ${textContrast(text, styleOf).toFixed(2)}`)
  ).toEqual([]);
}

const nothing = () => {};
const show = (screen: ReactElement) => render(screen, withPictures);

// What a screen check is given: the theme the page is in.
type Check = (theme: Theme) => void | Promise<void>;
type Part = [string, Check];

const catalogue = (food: Food, found: readonly string[] = []) => (
  <CatalogueScreen language="en"
    dinosaurs={ofFood(SHIPPED_CATALOGUE, food).map((entry) => presentCatalogueCard(entry, "en", fakeBodyPicture, found))}
    foods={FOODS.map((choice) => ({ food: choice, count: ofFood(SHIPPED_CATALOGUE, choice).length }))}
    food={food} initialArrangement={{ columns: 4, chips: undefined }} chipWidths={{ width: () => 0, subscribe: () => nothing }}
    onChipContents={nothing} layoutKeeping={keptNothing} returning={undefined} onFood={nothing} onOpen={nothing} onHome={nothing} />
);

const dinosaurPage = (id: string, found: readonly string[] = []) => {
  const index = SHIPPED_CATALOGUE.findIndex((entry) => entry.id === id);
  const entry = SHIPPED_CATALOGUE[index];
  if (!entry) throw new Error(`No ${id} in the catalogue`);
  return <DinosaurPage language="en" dinosaur={presentDinosaurPage(entry, "en", fakeBodyPicture, found)} number={index + 1} total={SHIPPED_CATALOGUE.length}
    onPrevious={nothing} onNext={nothing} onBack={nothing} initialLayout={{ upright: false, lines: { description: 4, note: 2 } }} />;
};

const VISITOR = SHIPPED_VISITORS[0]!;
const friendsScreen = (friends: readonly Visitor[]) => (
  <FriendsScreen language="en" friends={friends.map((friend) => presentFriend(friend, "en", fakeBodyPicture))} nestPicture={fakeItemPicture("nest")}
    onFriend={nothing} onNewVisitor={nothing} onBack={nothing} onHome={nothing} layoutKeeping={keptNothing} columns={() => 3} />
);
const visitScreen = (visit: Visit, leaving = false) => (
  <VisitScreen language="en" visit={presentVisit(visit, leaving, "en", fakeBodyPicture)} itemPicture={fakeItemPicture} onGive={nothing} onHome={nothing} />
);
const wrongItem = (visit: Visit, need: CareNeed) => ITEMS.find((item) => !suitableItems(visit.visitor, need).includes(item))!;

// The visit's needs from the `from`th to the `to`th, each asked, refused,
// suggested and met with hearts, those before them met at once, and the
// visitor dancing away after the last.
const visit = (from: number, to: number) => (theme: Theme) => {
  let shown = startVisit(VISITOR);
  for (const need of NEEDS.slice(0, from - 1)) shown = settle(give(shown, suitableItems(VISITOR, need)[0]!));
  const { rerender } = show(visitScreen(shown));
  const check = (leaving = false) => {
    rerender(visitScreen(shown, leaving));
    expectScreenIn(theme);
  };
  for (const need of NEEDS.slice(from - 1, to)) {
    check();
    shown = give(shown, wrongItem(shown, need));
    check();
    shown = settle(shown);
    check();
    shown = give(shown, suitableItems(VISITOR, need)[0]!);
    check();
    if (shown.met < NEEDS.length) shown = settle(shown);
  }
  if (to === NEEDS.length) check(true);
};

const pairsBoard = (board: Board, finished = false) => (
  <PairsBoardScreen language="en" {...presentPairsBoard(board, "en", fakeBodyPicture, fakeSkeletonPicture)} finished={finished} onTurn={nothing} onBack={nothing} onHome={nothing} />
);
const turnedAll = (board: Board) => board.cards.reduce((turned, { pal }, place) =>
  turned.found.includes(pal.id) ? turned : turnBack(turn(turn(turnBack(turned), place), turned.cards.findIndex((card, other) => other !== place && card.pal.id === pal.id))), board);
const pairsResult = (board: Board) => (
  <PairsResultScreen language="en" pals={board.cards.filter(({ pal }, place) => board.cards.findIndex((card) => card.pal.id === pal.id) === place)
    .map(({ pal }) => ({ id: pal.id, name: pal.name.en, picture: fakeBodyPicture(pal.id), newlyFound: true }))}
    tries={board.tries} stars={3} best={board.tries} beaten={undefined} celebration="first-best" levelUp={null} onPlayAgain={nothing} onBack={nothing} onHome={nothing} />
);

// A board with a card open, then every pair found and its cards waving,
// and the result with its celebration and NEW badges.
const pairsPlayed = (level: BoardLevel, miss: boolean) => (theme: Theme) => {
  const dealt = dealBoard(SHIPPED_PALS, level, seededRandom(41));
  const opened = turn(dealt, 0);
  const { rerender } = show(pairsBoard(dealt));
  const check = (screen: ReactElement) => { rerender(screen); expectScreenIn(theme); };
  check(pairsBoard(dealt));
  check(pairsBoard(opened));
  if (miss) check(pairsBoard(turn(opened, opened.cards.findIndex(({ pal }) => pal.id !== opened.cards[0]!.pal.id))));
  const finished = turnedAll(dealt);
  expect(isFinished(finished)).toBe(true);
  if (miss) check(pairsBoard({ ...finished, found: finished.found.slice(0, 2) }));
  check(pairsBoard(finished, true));
  expect(document.querySelector(".pair-board[data-finished]")).not.toBeNull();
  check(pairsResult(finished));
  expect(screen.getByRole("status")).toBeDefined();
};

const skeleton = (id: string) => SHIPPED_SKELETONS.find((each) => each.id === id)!;
const LOOKS = { explorer: { silhouette: false, homeShown: false }, paleontologist: { silhouette: true, homeShown: false } } as const;
const puzzleAt = (id: string, level: "explorer" | "paleontologist") =>
  startPuzzle(skeleton(id), cutAt(skeleton(id), level), { ladder: true, distractors: level === "paleontologist", badge: level });
const fitted = (puzzle: Puzzle, piece: string) => {
  const { x, y, width, height } = puzzle.cut.find(({ id }) => id === piece)!.place;
  return drop(puzzle, piece, { x: x + width / 2, y: y + height / 2 }, 1);
};
const puzzleScreen = (puzzle: Puzzle, level: "explorer" | "paleontologist" = "explorer", scatter = false) => (
  <SkeletonPuzzleScreen language="en" {...presentPuzzle(puzzle, "en", fakeSkeletonPicture, LOOKS[level])} scatter={scatter}
    onDrop={nothing} onTouch={nothing} onLastStep={nothing} onMuseum={nothing} onBack={nothing} onHome={nothing} />
);
const skeletonChoice = (earned: readonly string[], best: number | undefined) => (
  <SkeletonChoiceScreen language="en" choices={presentSkeletonChoices(SHIPPED_SKELETONS, "en", fakeBodyPicture, earned)} best={best} level="explorer"
    onLevel={nothing} onChoose={nothing} onMystery={earned.length > 0 ? nothing : undefined} onMuseum={nothing} onHome={nothing} />
);
const museum = (progress: SkeletonProgress) => (
  <SkeletonMuseumScreen language="en" {...presentSkeletonMuseum(museumOf({ progress, readable: true }, SHIPPED_SKELETONS), "en", fakeSkeletonPicture)}
    onBuild={nothing} onRebuild={nothing} onBuildAnother={nothing} onHome={nothing} />
);
const skeletonResult = (id: string, score: number, beaten: number | undefined) => {
  const { name, fact, frame } = skeleton(id);
  return <SkeletonResultScreen language="en" name={name.en} fact={fact.en} skeleton={fakeSkeletonPicture(id, "skeleton")} body={fakeBodyPicture(id)} frame={frame}
    score={score} total={SHIPPED_SKELETONS.length} best={score} beaten={beaten} celebration={beaten === undefined ? "first-best" : "new-best"} newStar badge="explorer"
    onBuildAnother={nothing} onMuseum={nothing} onHome={nothing} />;
};

const digRound = () => startRound(SHIPPED_DIG, [], undefined, seededRandom(41), "explorer");
const digBoard = (round: DigRound, finish?: BoardFinish) => (
  <DigBoardScreen language="en" {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture, (id) => id)} finish={finish} choiceCount={round.choices.length}
    level="explorer" brush={BRUSH_SIZES.explorer} wide={false} onWide={nothing} grains dugUp={finish ? 1 : 0} total={SHIPPED_DIG.length} treasures={0}
    sandContext={() => null} onBrush={nothing} onHome={nothing} />
);
const blownRound = () => ({ ...brushRound(digRound(), { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 }), blown: true });
const finishing = (phase: BoardFinish["phase"]): BoardFinish => ({ newStar: true, phase, startTimer: () => nothing, onLifted: nothing });
const digReveal = (landed: boolean) => (
  <DigRevealScreen language="en" name="Stegosaurus" picture={fakeBodyPicture("stegosaurus")} dugUp={1} total={SHIPPED_DIG.length} newStar celebration="first-best"
    badge treasures={0} level="explorer" onLevel={nothing} landed={landed} startTimer={() => nothing} landingWait={0} onLanded={nothing} onDigAgain={nothing} onHome={nothing} />
);

const checked = (screen: ReactElement, part?: () => Element): Check => (theme) => {
  show(screen);
  expectScreenIn(theme, part?.());
};

// Every screen in every state, by group, each rendered alone from its
// props, as the app renders it.
const SCREEN_GROUPS: Array<[string, Part[]]> = [
  [
    "the home page and its menus",
    [
      ["the home page", (theme) => { renderHomePageFeaturing("compare", { scored: false }); expectScreenIn(theme); }],
      ["each menu open", async (theme) => {
        const user = userEvent.setup({ delay: null });
        renderHomePageFeaturing("compare", { scored: false });
        for (const menu of ["Theme", "Language"]) {
          expectScreenIn(theme, await openMenu(user, menu));
          await user.click(outsideMenu());
        }
      }],
      ["the portrait gate", checked(<OrientationGate shown screenUpright language="en">{catalogue("all")}</OrientationGate>)]
    ]
  ],
  [
    "the catalogue",
    [
      ["the list with a card of each food type", checked(catalogue("all"))],
      ...(["meat", "plants", "both", "all"] as const).map((food): Part => [`the ${food.toUpperCase()} food choice`, checked(catalogue(food), () => screen.getByRole("group", { name: "FOOD" }))]),
      ...["tyrannosaurus", "triceratops", "gallimimus"].map((id): Part => [`the page of ${id}`, checked(dinosaurPage(id))])
    ]
  ],
  [
    "care",
    [
      ["the welcome", checked(<CareWelcomeScreen language="en" best={undefined} total={MOST_HEARTS} visitorPicture={fakeBodyPicture(VISITOR.id)} friendCount={0} friendPictures={[]} onNewVisitor={nothing} onFriends={nothing} onHome={nothing} />)],
      ["the friends with none yet", checked(friendsScreen([]))],
      ["a visit's first two needs, each asked, refused, suggested and met with hearts", visit(1, 2)],
      ["a visit's last two needs, each asked, refused, suggested and met with hearts, and the visitor dancing away", visit(3, NEEDS.length)],
      ["the result with its celebration", checked(<CareResultScreen language="en" visitor={{ name: VISITOR.name.en, picture: fakeBodyPicture(VISITOR.id) }} score={MOST_HEARTS} total={MOST_HEARTS} best={MOST_HEARTS} beaten={undefined} celebration="first-best" newFriend onNewVisitor={nothing} onFriends={nothing} onHome={nothing} />)],
      ["the friend made", checked(friendsScreen([VISITOR]))]
    ]
  ],
  [
    "find the pair",
    [
      ["the welcome", checked(<PairsWelcomeScreen language="en" level="hatchling" climbLevel={1} stars={0} heroPicture={fakeBodyPicture("stegosaurus")} onLevel={nothing} onPlay={nothing} onHome={nothing} />)],
      ["a board of pictures with a card open, a miss, found pairs and the cards waving, and the result", pairsPlayed({ climbLevel: 1 }, true)],
      ["Explorer's board of silhouettes, a card open, every pair found, and the result", pairsPlayed({ large: "explorer" }, false)],
      ["Paleontologist's board of skeletons, a card open, every pair found, and the result", pairsPlayed({ large: "paleontologist" }, false)],
      ["the dinosaurs found on home", (theme) => { renderHomePageFeaturing("compare"); expectScreenIn(theme, gameDoor("FIND THE PAIR")); }],
      ["the dinosaurs found on the catalogue", checked(catalogue("all", SHIPPED_PALS.map(({ id }) => id)))],
      ["the dinosaurs found on a page", checked(dinosaurPage(SHIPPED_PALS[0]!.id, SHIPPED_PALS.map(({ id }) => id)))]
    ]
  ],
  [
    "the skeleton game",
    [
      ["the choice of dinosaurs", checked(skeletonChoice([], undefined))],
      ...["tyrannosaurus", "triceratops", "stegosaurus"].map((id): Part => [`the ${id} puzzle as it starts`, checked(puzzleScreen(puzzleAt(id, "explorer")))]),
      ["a puzzle with a bone fitted, one lifted and each step of help", (theme) => {
        let puzzle = fitted(puzzleAt("stegosaurus", "explorer"), puzzleAt("stegosaurus", "explorer").cut[1]!.id);
        const { rerender } = show(puzzleScreen(puzzle));
        layOutPuzzle();
        const last = spotPieces().at(-1)!;
        const { left, top } = spotOf(last).getBoundingClientRect();
        press(spotOf(last), { clientX: left + 40, clientY: top + 40 });
        moveTo(AWAY);
        expect(lifted()).not.toBeNull();
        expectScreenIn(theme);
        release(AWAY);
        puzzle = touch(puzzle, last);
        for (const step of [".skeleton-region", ".skeleton-ghost", ".skeleton-piece[data-nudge]"]) {
          puzzle = wait(puzzle, HELP_AFTER);
          rerender(puzzleScreen(puzzle));
          expect([hints(), document.querySelector(step) !== null]).toEqual([[`spot ${last}`], true]);
          expectScreenIn(theme);
        }
      }],
      ["Paleontologist's puzzle on its silhouette, with another dinosaur's bone told", (theme) => {
        const puzzle = drop(fitted(puzzleAt("tyrannosaurus", "paleontologist"), "head"), "triceratops/frill", { x: 0, y: 0 }, 1);
        show(puzzleScreen(puzzle, "paleontologist"));
        expect([document.querySelector(".skeleton-outline-silhouette") !== null, screen.getByRole("status").textContent]).toEqual([true, "THAT'S THE TRICERATOPS FRILL!"]);
        expectScreenIn(theme);
      }],
      ["a finished skeleton's reveal with a first best", checked(skeletonResult("triceratops", 1, undefined))],
      ["a finished skeleton's reveal with a new best", checked(skeletonResult("stegosaurus", 2, 1))],
      ["the choice with the skeletons' stars", checked(skeletonChoice(["triceratops", "stegosaurus"], 2))],
      ["the museum empty", checked(museum(NO_SKELETONS))],
      ["the museum with a skeleton on its stand with its badge", checked(museum({ earned: ["triceratops"], bestScore: 1, rebuilding: [], badges: { triceratops: ["explorer"] } }))],
      ["the puzzle as the skeleton is knocked down", checked(puzzleScreen(puzzleAt("triceratops", "explorer"), "explorer", true))],
      ["the museum with a stand awaiting its skeleton", checked(museum({ earned: ["triceratops"], bestScore: 1, rebuilding: ["triceratops"], badges: {} }))]
    ]
  ],
  [
    "the dig game",
    [
      ["the board under sand", checked(digBoard(digRound()))],
      ["the board brushed", (theme) => {
        show(digBoard(digRound()));
        placeBoard(800);
        pressAt(sandBoard(), 0, { x: 200, y: 300 }); moveAt(10, { x: 400, y: 300 });
        expect(sandBoard().querySelector(".dig-puff")).not.toBeNull();
        expectScreenIn(theme);
      }],
      ["the board blown away", checked(digBoard(blownRound(), finishing("gust")))],
      ["the board lifting", (theme) => {
        show(digBoard(blownRound(), finishing("lift")));
        expect([sandBoard().hasAttribute("data-lifting"), document.querySelector(".dig-board-star") !== null]).toEqual([true, true]);
        expectScreenIn(theme);
      }],
      ["the reveal counting", checked(digReveal(false))],
      ["the reveal settled", checked(digReveal(true))]
    ]
  ]
];

// Each screen is shown in the theme the app sets on the page.
describe.each(THEMES)("every screen in the %s theme", (theme) => {
  describe.each(SCREEN_GROUPS)("on %s:", (_, parts) => {
    it.each(parts)("%s", async (_, check) => {
      document.documentElement.dataset.theme = theme;
      try {
        await check(theme);
      } finally {
        delete document.documentElement.dataset.theme;
      }
    });
  });
});

describe("the System theme", () => {
  it.each(THEMES)("follows the device appearance %s onto the screens", async (appearance) => {
    const { user } = openApp({ device: manualAppearance(appearance) });
    expectScreenIn(appearance);

    await user.click(gameDoor("COMPARE"));

    expectPageIn(appearance);
    expect(document.querySelector(".question")).not.toBeNull();
  });

  it.each([
    ["holds a theme the app does not have", memoryStorage({ [THEME_KEY]: "sepia" })],
    ["cannot be read", memoryStorage({ [THEME_KEY]: "light" }, { read: false })]
  ])("is the theme when the stored choice %s", (_, storage) => {
    openApp({ device: manualAppearance("dark"), storage });

    expectScreenIn("dark");
  });

  it("follows the device while the app is open, without reloading", async () => {
    const tint = document.createElement("meta");
    tint.name = "theme-color";
    tint.content = "#F2EFE8";
    document.head.append(tint);
    const device = manualAppearance("light");
    const { user, unmount } = openApp({ device });
    await user.click(gameDoor("COMPARE"));
    await user.click(cardOf(wrongOf(shownQuestion())));
    expectPageIn("light");
    const answered = document.body.innerHTML;

    act(() => device.switchTo("dark"));

    expectPageIn("dark");
    expect(tint.content).toBe("#0f1320");
    expect(sameColour(getComputedStyle(document.documentElement).backgroundColor, PALETTE.dark.bg ?? "")).toBe(true);
    expect(document.body.innerHTML).toBe(answered);
    expect(progress()).toBe("1/10");

    act(() => device.switchTo("light"));

    expectPageIn("light");
    expect(document.body.innerHTML).toBe(answered);
    expect(tint.content).toBe("#f2efe8");
    unmount();
    expect(tint.content).toBe("#F2EFE8");
    tint.remove();
  });
});

describe("a chosen theme", () => {
  it.each([
    ["Dark", "dark", "light"],
    ["Light", "light", "dark"]
  ] as const)("%s overrides the device in its %s appearance and back", async (name, chosen, appearance) => {
    const device = manualAppearance(appearance);
    const { user } = openApp({ device });
    expectPageIn(appearance);

    await chooseFrom(user, "Theme", name);

    expectPageIn(chosen);
    act(() => device.switchTo(chosen));
    act(() => device.switchTo(appearance));
    expectScreenIn(chosen);
    await user.click(gameDoor("COMPARE"));
    expectPageIn(chosen);
  });

  it("gives way to the device again once System is chosen", async () => {
    const device = manualAppearance("light");
    const storage = memoryStorage({ [THEME_KEY]: "dark" });
    const { user } = openApp({ device, storage });
    expectPageIn("dark");

    await chooseFrom(user, "Theme", "System");

    expectPageIn("light");
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
    "is a small button in the token ink with the current theme's symbol in the top-right corner of the home page only, in %s",
    async (language) => {
      const { user } = openApp({ language: language === "ru" ? "ru-RU" : "en-GB" });
      const button = screen.getByRole("button", { name: LABELS[language].menu });
      const card = gameDoor(LABELS[language].card);

      expect(button.textContent).toBe("");
      expect(symbolOf(button)).toBe("monitor");
      const corner = getComputedStyle(button.closest(".home-corner") ?? button);
      expect(corner.position).toBe("static");
      expect(button.closest("header")).not.toBeNull();
      const style = getComputedStyle(button);
      expect(sameColour(style.color, style.getPropertyValue("--ds-ink"))).toBe(true);
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
        largestSize(getComputedStyle(within(featuredCard()).getByText(LABELS[language].card)).fontSize) / 2
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
  it.each(THEMES.flatMap(theme => HOME_GAMES.map(([game]) => [theme, game] as const)))("is in the %s sky with %s featured", (theme, game) => {
    document.documentElement.dataset.theme = theme;
    try {
      const { unmount } = renderHomePageFeaturing(game);
      expectScreenIn(theme);

      const card = featuredCard();
      const tokens = getComputedStyle(document.documentElement);
      expect(getComputedStyle(card).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(sameColour(getComputedStyle(card).color, tokens.getPropertyValue("--ds-ink"))).toBe(true);
      const symbol = symbolSquareOf(card)!;
      expect(sameColour(getComputedStyle(symbol).backgroundColor, tokens.getPropertyValue("--ds-pocket-1"))).toBe(true);
      expect(sameColour(getComputedStyle(symbol).color, tokens.getPropertyValue("--ds-action"))).toBe(true);
      expect(getComputedStyle(nameRowOf(card)!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      unmount();
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

// The page is shown through its props, in the theme the app sets on the
// page, with kinds found and kinds not found yet.
describe("the FIELD GUIDE", () => {
  it.each(THEMES)("is in the %s theme, every card a sand pocket, a kind not found yet its outline in the deepest pocket", (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      const cards = TREASURE_KINDS.map((kind) => ({ kind, picture: fakeTreasurePicture(kind), count: kind === "shell" ? 3 : kind === "egg-nest" ? 1 : 0 }));
      render(<DigFieldGuideScreen language="en" cards={cards} onBack={() => {}} onHome={() => {}} />, withPictures);

      expectScreenIn(theme);
      const look = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector) ?? document.body);
        return { background: style.backgroundColor, border: style.borderColor, width: style.borderWidth, color: style.color, opacity: style.opacity };
      };
      const found = look(".dig-guide-card[data-found]");
      const missing = look(".dig-guide-card:not([data-found])");
      const outline = look(".dig-guide-outline");
      // Each card a sand pocket; a kind not found its outline.
      expect([found.width, missing.width, outline.opacity]).toEqual(["0px", "0px", "0.55"]);
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

// The board is shown through the sorting game and the screen's props, in
// the theme the app sets on the page.
describe("the sorting board", () => {
  const PROPERTIES: Property[] = ["legs", "diet", "size", "horns", "feathers"];

  // One board per test: a whole sort is long under pointer events.
  it.each(THEMES.flatMap((theme) => PROPERTIES.map((property) => [theme, property] as const)))("is in the %s theme in every state, sorting by %s, with every basket's symbol", async (theme, property) => {
    document.documentElement.dataset.theme = theme;
    try {
      const user = userEvent.setup({ delay: null });
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
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });

  it.each(THEMES)("marks a sorted card's ✓ and each hint at least 3:1 against what they are on, in the %s theme", async (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      const user = userEvent.setup({ delay: null });
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
  it.each(THEMES)("is in the %s theme with its celebration, and without one", async (theme) => {
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

describe("the SORT card", () => {
  it.each(THEMES)("has a pocket and name pill at text contrast in the %s theme", (theme) => {
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
      // SORT's tile takes its own pocket and symbol colours from the dig-site tokens.
      card: [getComputedStyle(card.querySelector(".home-tile-pocket")!).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue("--ds-pocket-sort")],
      symbol: [getComputedStyle(symbol).color, getComputedStyle(document.documentElement).getPropertyValue("--ds-game-sort")],
      words: [getComputedStyle(title).color, getComputedStyle(document.documentElement).getPropertyValue("--ds-on-label")],
    };
    expect(Object.entries(parts).filter(([, [seen, wanted]]) => !sameColour(seen ?? "", wanted ?? ""))).toEqual([]);
    expect(title.textContent).toBe("SORT");
    expect(card.querySelector(".sort-tile-best")).toBeNull();
    expect(textContrast(title)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});

describe("the FIND THE PAIR tile", () => {
  it.each(THEMES)("has its words on the %s theme's name pill at text contrast", (theme) => {
    openApp({ device: manualAppearance(theme) });

    expectScreenIn(theme);
    const tile = gameDoor("FIND THE PAIR");
    const title = tile.querySelector(".pairs-tile-title") ?? tile;
    const colours = PALETTE[theme];
    const parts = {
      // The pill supplies the background behind the name.
      tile: [getComputedStyle(title.parentElement!).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue("--ds-label")],
      words: [getComputedStyle(title).color, getComputedStyle(document.documentElement).getPropertyValue("--ds-on-label")]
    };
    expect(Object.entries(parts).filter(([, [seen, wanted]]) => !sameColour(seen ?? "", wanted ?? ""))).toEqual([]);
    expect(textContrast(title)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });
});

describe("a board of skeletons", () => {
  it.each(THEMES)("shows each skeleton in its own colours on the card's art in the %s theme", async (theme) => {
    const timers = manualTimers();
    const { user } = openApp({ device: manualAppearance(theme), timers });
    await playPairs(user, "PALEONTOLOGIST");

    await playBoard(user, timers);

    expectScreenIn(theme);
    // Its bones keep their colours, which stand on the art as the whole
    // skeletons' contrast test in skeletons.test.ts measures.
    const skeletons = [...document.querySelectorAll('.pair-card[data-face="skeleton"] img')];
    expect(skeletons).toHaveLength(12);
    expect(skeletons.map((picture) => [picture.classList.contains("pair-silhouette"), getComputedStyle(picture).filter])).toEqual(skeletons.map(() => [false, "none"]));
    const art = skeletons[0]?.closest(".pair-card-art") ?? document.body;
    expect(sameColour(getComputedStyle(art).backgroundColor, PALETTE[theme]["surface-2"] ?? "")).toBe(true);
  });
});

describe("a board of silhouettes", () => {
  it.each(THEMES)("keeps face-down cards, open cards and silhouettes apart from what is behind them in the %s theme", async (theme) => {
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
