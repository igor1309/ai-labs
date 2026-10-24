import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, ViewTransition } from "react";
import { DEFAULT_AGE_LEVEL, pickAgeLevel, type AgeLevel, type AgeLevelSetting } from "./ageLevel.ts";
import { useCareGame, type CareGameProps, type CarePhase } from "./careGame.tsx";
import { FOODS, ofFood, stepFrom, type CatalogueEntry, type Food, type Step } from "./catalogue.ts";
import { catalogueColumns, catalogueRow } from "./catalogueColumns.ts";
import { CatalogueScreen, type CatalogueLayout } from "./CatalogueScreen.tsx";
import { chipArrangement, type ChipContent } from "./chipArrangement.ts";
import { closingPicture, refitPicture, type PictureMotion } from "./closingPicture.ts";
import { compareQuestionType, compareQuestionWidth, NARROW_QUESTION, PORTRAIT_QUESTION } from "./compareQuestionLayout.ts";
import { compareResultType, compareResultWidth, NARROW_RESULT, PORTRAIT_RESULT } from "./compareResultLayout.ts";
import digTile from "./assets/dig/tile.webp";
import { DIG_REVEAL, useDigGame, type DigGameProps, type DigPhase } from "./digGame.tsx";
import { DinosaurPage, NEXT_DINOSAUR, PREVIOUS_DINOSAUR, type DinosaurPageLayout } from "./DinosaurPage.tsx";
import { dinosaurSlide } from "./dinosaurSlide.ts";
import { dinosaurWordsWidth, keptLines, NARROW_PAGE, PORTRAIT_PAGE } from "./dinosaurPageLayout.ts";
import { calendarDay, chooseFeatured, type FeaturedStore } from "./featured.ts";
import type { ChipWidths } from "./FoodChips.tsx";
import { HOME_GAMES, HomePage, type HomeGame } from "./HomePage.tsx";
import { languageOfDevice, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { useLayoutTurns } from "./layoutTurns.ts";
import { OrientationGate } from "./OrientationGate.tsx";
import type { StartTimer } from "./ownedTimers.ts";
import { NARROW_BOARD, pairsBoardWidth, PORTRAIT_BOARD } from "./pairsBoardLayout.ts";
import { usePairsGame, type PairsGameProps, type PairsPhase } from "./pairsGame.tsx";
import { NARROW_PAIRS_RESULT, pairsResultWidth, PORTRAIT_PAIRS_RESULT } from "./pairsResultLayout.ts";
import { NARROW_WELCOME, pairsWelcomeType, pairsWelcomeWidth, PORTRAIT_WELCOME } from "./pairsWelcomeLayout.ts";
import { LoadAhead, PicturesProvider, type PictureStore } from "./Picture.tsx";
import { presentCatalogueCard, presentDinosaurPage } from "./presentation.ts";
import { useQuizGame, type QuizGameProps, type QuizPhase } from "./quizGame.tsx";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { SandWritingScreen } from "./SandWritingScreen.tsx";
import { CLOSE_DINOSAUR, OPEN_DINOSAUR, type PictureTransition } from "./SharedPicture.tsx";
import { useSkeletonGame, type SkeletonGameProps, type SkeletonPhase } from "./skeletonGame.tsx";
import { SILENT, type SkeletonSounds } from "./skeletonSounds.ts";
import { sortBoardWidth } from "./sortBoardLayout.ts";
import { useSortingGame, type SortingGameProps, type SortingPhase } from "./sortingGame.tsx";
import { themeOf, type ThemeChoice } from "./theme.ts";
import { turnMotion, type TurnMotion, type TurnMotionSeams } from "./turnMotion.ts";

export type LanguageStore = {
  // The language a parent chose, or undefined when none can be read.
  load(): Language | undefined;
  save(language: Language): void;
};

export type ThemeStore = {
  // The theme a parent chose, or undefined when none can be read.
  load(): ThemeChoice | undefined;
  save(choice: ThemeChoice): void;
};

export type AgeLevelStore = {
  // The age level a parent picked, or undefined when none can be read.
  load(): AgeLevelSetting | undefined;
  save(setting: AgeLevelSetting): void;
};

export type StartCounter = {
  // Counts one more start of `game`, as it begins.
  countStart(game: HomeGame): void;
};

// Whether the device is set to its dark appearance, and its changes.
export type Appearance = {
  isDark(): boolean;
  subscribe(onChange: () => void): () => void;
};

// Whether the app is hidden, as when the iPad shows another app or is
// locked, and its changes.
export type PageVisibility = {
  isHidden(): boolean;
  subscribe(onChange: () => void): () => void;
};

export type SizeClass = "wide" | "wide-short" | "tall" | "tall-narrow";

// The viewport boundary's safe-area values, kept independent of any screen's
// geometry types.
export type ViewportInsets = { left: number; right: number };

// The size classes in which a screen with no portrait layout for them
// shows the picture asking to turn or widen.
export type PortraitSizeClass = Extract<SizeClass, "tall" | "tall-narrow">;

// The screens a layout is built for: each of the app's, each of the
// compare quiz's own, a question or its result, and each of find the
// pair's, its welcome, a board or its result, which each game names as it
// shows them.
export type LayoutScreen = Screen["kind"] | `compare-${QuizPhase}` | `pairs-${PairsPhase}` | `sorting-${SortingPhase}` | `skeletons-${SkeletonPhase}` | `dig-${DigPhase}` | `care-${CarePhase}`;

// Each screen with a portrait layout, named with the size classes its
// layout is built for; a screen not named has none.
export type PortraitLayouts = Readonly<Partial<Record<LayoutScreen, readonly PortraitSizeClass[]>>>;

export type Viewport = {
  sizeClass(): SizeClass;
  isScreenUpright(): boolean;
  // The window's width in CSS pixels.
  width(): number;
  // The vertical scrollbar's room, when it is reserved by the browser.
  scrollbarWidth?: () => number;
  // The window's safe-area insets at its left and right edges.
  sideInsets(): ViewportInsets;
  subscribe(onChange: () => void): () => void;
};

export type { CareProgressStore } from "./careGame.tsx";
export type { DigProgressStore, SandContext } from "./digGame.tsx";
export type { PairsProgressStore } from "./pairsGame.tsx";
export type { ProgressStore } from "./quizGame.tsx";
export type { SkeletonPicture, SkeletonProgressStore } from "./skeletonGame.tsx";

export type AppProps = CareGameProps &
  PairsGameProps &
  QuizGameProps &
  Pick<SortingGameProps, "sortables" | "sortingProgress"> &
  Pick<SkeletonGameProps, "skeletons" | "skeletonPicture" | "skeletonProgress"> &
  Pick<DigGameProps, "digDinosaurs" | "digProgress" | "sandContext"> & {
    // Every dinosaur, in the order the catalogue shows them.
    catalogue: readonly CatalogueEntry[];
    // The skeleton game's sounds, silent if none.
    skeletonSounds?: SkeletonSounds;
    viewport: Viewport;
    portraitLayouts: PortraitLayouts;
    // How the catalogue's food chips' parts are measured as laid out.
    chipWidths: ChipWidths;
    // How the page's parts are found, measured and animated, and the page
    // cross-faded, as a screen goes to its other layout.
    layoutMotion: Omit<TurnMotionSeams, "reducedMotion" | "startTimer" | "continuation" | "shifted" | "refit">;
    pictureTransition?: PictureTransition;
    pictureMotion: PictureMotion;
    pageVisibility: PageVisibility;
    // The device's language tag, such as "ru-RU".
    deviceLanguage: string;
    languageStore: LanguageStore;
    // Gives the version footer, which the static page holds outside the
    // app, its name for a screen reader.
    nameVersion: (label: string) => void;
    appearance: Appearance;
    themeStore: ThemeStore;
    ageLevelStore: AgeLevelStore;
    // Every picture the screens show, each loaded once, made where the
    // browser is.
    pictures: PictureStore;
    startTimer: StartTimer;
    // The device's clock: the time now.
    now: () => Date;
    // The start counts and the day's featured game the large card's
    // choice reads, and where it keeps the day's game.
    featuredStore: FeaturedStore;
    // Where each game's starts are counted, for the next days' choices.
    startCounter: StartCounter;
  };

// The two dinosaurs facing off in the quiz's picture on the home page.
const FACE_OFF = { left: "tyrannosaurus", right: "brachiosaurus" };

// The dinosaur on the catalogue's tile.
const CATALOGUE_TILE = "stegosaurus";

// The dinosaur on dinosaur care's tile.
const CARE_TILE = "parasaurolophus";

// The dinosaur on the sorting game's card.
const SORT_TILE = "triceratops";

// The dinosaur on find the pair's tile.
const PAIRS_TILE = "stegosaurus";

// The dinosaur whose skeleton stands on the skeleton game's tile.
const SKELETONS_TILE = "triceratops";

// The dinosaur whose shape stands on the home tile of the games still to
// come.
const MORE_COMING = "triceratops";

const STEPS: Record<Step, string> = { next: NEXT_DINOSAUR, previous: PREVIOUS_DINOSAUR };

type Screen =
  | { kind: "home" }
  // The compare quiz, which keeps its own screens.
  | { kind: "compare" }
  // The id of the dinosaur whose page the child came back from, if any.
  | { kind: "catalogue"; returning: string | undefined }
  // The dinosaur's place among those of the food chosen.
  | { kind: "dinosaur"; index: number }
  // Dinosaur care, which keeps its own screens.
  | { kind: "care" }
  // The sorting game, which keeps its own screens.
  | { kind: "sorting" }
  // Find the pair, which keeps its own screens too.
  | { kind: "pairs" }
  // And the skeleton game.
  | { kind: "skeletons" }
  // And the dig game.
  | { kind: "dig" }
  | { kind: "sandWriting" };

// A food chosen changes the screen at once. A dinosaur's page opens from its
// card and closes back to it, and a step slides the next page in the
// arrow's direction, which `step` gives: on a short or wrapping list the
// two places alone cannot tell previous from next.
export function transitionFor(from: Screen, to: Screen, step: Step | undefined): string | undefined {
  if (from.kind === "dinosaur" && to.kind === "dinosaur") return step === undefined ? undefined : STEPS[step];
  if (from.kind === "catalogue" && to.kind === "dinosaur") return OPEN_DINOSAUR;
  if (from.kind === "dinosaur" && to.kind === "catalogue") return CLOSE_DINOSAUR;
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

export function App({
  dinosaurs,
  catalogue,
  bodyPicture,
  random,
  viewport,
  portraitLayouts,
  chipWidths,
  layoutMotion,
  pictureTransition,
  pictureMotion,
  pageVisibility,
  progress,
  deviceLanguage,
  languageStore,
  nameVersion,
  appearance,
  themeStore,
  ageLevelStore,
  pictures,
  startTimer,
  now,
  featuredStore,
  startCounter,
  sortables,
  sortingProgress,
  pals,
  pairsProgress,
  skeletons,
  skeletonPicture,
  skeletonProgress,
  skeletonSounds = SILENT,
  digDinosaurs,
  digProgress,
  sandContext,
  ...careProps
}: AppProps) {
  const { screen, go, set } = useScreens<Screen, Step>({ kind: "home" }, transitionFor);
  const size = useSyncExternalStore(viewport.subscribe, viewport.sizeClass);
  const screenUpright = useSyncExternalStore(viewport.subscribe, viewport.isScreenUpright);
  const [closing] = useState<ReturnType<typeof closingPicture>>(() => closingPicture(layoutMotion, pictureMotion));
  const [sliding] = useState<ReturnType<typeof dinosaurSlide>>(() => dinosaurSlide(layoutMotion, pictureMotion));
  const [turns] = useState<TurnMotion>(() => turnMotion({
    ...layoutMotion, continuation: closing.take, shifted: sliding.take, refit: refitPicture, reducedMotion: careProps.reducedMotion, startTimer
  }));
  const dinosaurWords = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    const side = viewport.sizeClass() === "tall-narrow" ? NARROW_PAGE.sidePadding : PORTRAIT_PAGE.sidePadding;
    return dinosaurWordsWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0, side);
  });
  // The game the large card features, chosen once as the app starts: it
  // stays while the app is open, past midnight too, and the next day's is
  // chosen when the app is opened again.
  const [featured] = useState<HomeGame>(() => chooseFeatured(HOME_GAMES, { store: featuredStore, random, today: calendarDay(now()) }));
  // The device language is only the first guess: a parent's choice is kept
  // and wins on every later visit.
  const [language, setLanguage] = useState<Language>(() => languageStore.load() ?? languageOfDevice(deviceLanguage));

  // The version footer's name follows the language, with the page's.
  useEffect(() => {
    document.documentElement.lang = language;
    nameVersion(TEXTS[language].versionLabel);
  }, [language, nameVersion]);

  const chooseLanguage = (chosen: Language) => {
    setLanguage(chosen);
    languageStore.save(chosen);
  };

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => themeStore.load() ?? "system");
  const deviceDark = useSyncExternalStore(appearance.subscribe, appearance.isDark);
  const theme = themeOf(themeChoice, deviceDark ? "dark" : "light");

  // The theme is set on the whole document, so the page around the app and
  // the version footer take it too. It is set before the browser paints, so
  // a screen never shows in the other theme first, and it is taken off with
  // the app.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  const chooseTheme = (chosen: ThemeChoice) => {
    setThemeChoice(chosen);
    themeStore.save(chosen);
  };

  // The age level a parent picked, held for the visit even when it cannot
  // be saved.
  const [ageLevel, setAgeLevel] = useState<AgeLevelSetting>(() => ageLevelStore.load() ?? DEFAULT_AGE_LEVEL);

  const chooseAgeLevel = (level: AgeLevel) => {
    const picked = pickAgeLevel(ageLevel, level, random);
    if (picked === ageLevel) return;
    setAgeLevel(picked);
    ageLevelStore.save(picked);
  };

  const home = () => go({ kind: "home" });

  // Each game counts a start where it begins, wherever the child began it
  // from, and not as it opens on a welcome or choice screen.
  const counting = (game: HomeGame) => () => startCounter.countStart(game);

  const quiz = useQuizGame({ dinosaurs, progress, bodyPicture, random }, ageLevel, home, counting("compare"));

  const pairs = usePairsGame(
    { pals, pairsProgress, bodyPicture, skeletonPicture, random, startTimer, reducedMotion: careProps.reducedMotion },
    ageLevel,
    home,
    counting("pairs")
  );

  const sorting = useSortingGame({ sortables, sortingProgress, bodyPicture, random }, ageLevel, home, counting("sort"));

  // Whether the gate covers a screen in the window as it is now.
  const gateShownFor = useCallback((key: LayoutScreen) => {
    const size = viewport.sizeClass();
    return (size === "tall" || size === "tall-narrow") && !portraitLayouts[key]?.includes(size);
  }, [viewport, portraitLayouts]);

  // The child is away while the page is hidden or the gate covers this
  // screen. A screen with its portrait layout remains playable.
  const subscribePresence = useCallback((onChange: () => void) => {
    const stopViewport = viewport.subscribe(onChange);
    const stopVisibility = pageVisibility.subscribe(onChange);
    return () => {
      stopViewport();
      stopVisibility();
    };
  }, [viewport, pageVisibility]);

  // The skeleton and dig games ask for the screen they show, which the gate below
  // reads from it in turn.
  const skeletonPresence = useMemo(
    () => ({
      isAway: (phase: SkeletonPhase) => gateShownFor(`skeletons-${phase}`) || pageVisibility.isHidden(),
      subscribe: subscribePresence
    }),
    [gateShownFor, pageVisibility, subscribePresence]
  );

  const skeletonGame = useSkeletonGame(
    { skeletons, skeletonPicture, skeletonProgress, bodyPicture, startTimer, presence: skeletonPresence, reducedMotion: careProps.reducedMotion, random, sounds: skeletonSounds, kin: pals },
    ageLevel,
    home,
    counting("skeletons")
  );

  const dinosaurName = (dinosaurId: string, chosen: Language) => {
    const dinosaur = dinosaurs.find(({ id }) => id === dinosaurId);
    if (!dinosaur) throw new Error(`No dinosaur ${dinosaurId} to name`);
    return dinosaur.name[chosen];
  };

  const digPresence = useMemo(
    () => ({
      isAway: (phase: DigPhase) => gateShownFor(`dig-${phase}`) || pageVisibility.isHidden(),
      subscribe: subscribePresence
    }),
    [gateShownFor, pageVisibility, subscribePresence]
  );

  const dig = useDigGame(
    { digDinosaurs, digProgress, dinosaurName, bodyPicture, random, startTimer, presence: digPresence, reducedMotion: careProps.reducedMotion, sandContext },
    ageLevel,
    home,
    counting("dig")
  );

  // In a tall window FRIENDS stands two cards to a row, four otherwise.
  const care = useCareGame({ ...careProps, bodyPicture, random, startTimer }, home, counting("care"), {
    keeping: turns,
    columns: () => (viewport.sizeClass() === "tall" ? 2 : 4)
  });

  // Each game's phase is its own: the gate and the turns read it as the
  // game reports it.
  const layoutScreen: LayoutScreen =
    screen.kind === "compare" && quiz.phase
      ? `compare-${quiz.phase}`
      : screen.kind === "pairs"
        ? `pairs-${pairs.phase}`
        : screen.kind === "sorting" && sorting.phase
          ? `sorting-${sorting.phase}`
          : screen.kind === "skeletons"
            ? `skeletons-${skeletonGame.phase}`
            : screen.kind === "dig"
              ? `dig-${dig.phase}`
              : screen.kind === "care"
                ? `care-${care.phase}`
                : screen.kind;
  const portraitSizes = portraitLayouts[layoutScreen];
  const gate = useMemo(() => ({
    isShown: () => gateShownFor(layoutScreen),
    subscribe: viewport.subscribe
  }), [viewport, gateShownFor, layoutScreen]);
  const gateShown = useSyncExternalStore(gate.subscribe, gate.isShown);
  const portrait = (size === "tall" || size === "tall-narrow") && (portraitSizes?.includes(size) ?? false);
  // One type for every question in the window, which the stylesheet
  // reads only upright.
  const questionWidth = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    return compareQuestionWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0, viewport.sizeClass() === "tall-narrow" ? NARROW_QUESTION : PORTRAIT_QUESTION);
  });
  // And one size for the result's stars, level names and dinosaur.
  const resultWidth = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    return compareResultWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0, viewport.sizeClass() === "tall-narrow" ? NARROW_RESULT : PORTRAIT_RESULT);
  });
  // And one type for find the pair's welcome's title and level names.
  const welcomeWidth = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    return pairsWelcomeWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0, viewport.sizeClass() === "tall-narrow" ? NARROW_WELCOME : PORTRAIT_WELCOME);
  });
  // And the width its board stands in.
  const boardWidth = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    return pairsBoardWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0, viewport.sizeClass() === "tall-narrow" ? NARROW_BOARD : PORTRAIT_BOARD);
  });
  // And the width sort's board stands in.
  const sortWidth = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    return sortBoardWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0);
  });
  // And the width find the pair's result stands in.
  const pairsResultRoom = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    const sizes = viewport.sizeClass() === "tall-narrow" ? NARROW_PAIRS_RESULT : PORTRAIT_PAIRS_RESULT;
    return pairsResultWidth(viewport.width(), left, right, viewport.scrollbarWidth?.() ?? 0, sizes);
  });

  // A round starts at once from the tile, with no welcome screen.
  const openCompare = () => {
    quiz.start(() => set({ kind: "compare" }));
  };

  const openCare = () => {
    go({ kind: "care" }, { also: care.open });
  };

  const openSorting = () => {
    sorting.start(() => set({ kind: "sorting" }));
  };

  const openPairs = () => {
    go({ kind: "pairs" }, { also: pairs.open });
  };

  const openSkeletons = () => {
    go({ kind: "skeletons" });
  };

  // The museum opens from the home page straight into the skeleton game,
  // as a screen change and not a start: only building there starts one.
  const openMuseum = () => {
    go({ kind: "skeletons" }, { also: skeletonGame.openMuseum });
  };


  // A round starts at once from the tile, with no choice screen.
  const openDig = () => {
    dig.start(() => set({ kind: "dig" }));
  };

  const openSandWriting = () => {
    go((current) => current.kind === "home" ? { kind: "sandWriting" } : current, { also: counting("sandWriting") });
  };

  // The food chosen is kept going to a page and back, but the catalogue
  // opens from home on every dinosaur.
  const [food, setFood] = useState<Food>("all");
  // The chips' parts as last measured, in the language they were measured
  // in: another language's are not yet known, so the catalogue's first
  // open after a switch takes its arrangement as a first visit does.
  const [chipMeasure, setChipMeasure] = useState<{ language: Language; contents: readonly ChipContent[] }>({ language, contents: [] });
  const chipContents = chipMeasure.language === language ? chipMeasure.contents : [];
  const measuredChips = useCallback((contents: readonly ChipContent[]) => setChipMeasure({ language, contents }), [language]);
  const shown = ofFood(catalogue, food);
  // The catalogue's cards in a row, and in a tall window, where the chips
  // stand on a row of their own, that row's width, by the window.
  const columns = useSyncExternalStore(viewport.subscribe, () => {
    const { left, right } = viewport.sideInsets();
    return catalogueColumns(viewport.width(), viewport.sizeClass(), left, right);
  });
  const chipRow = useSyncExternalStore(viewport.subscribe, () => {
    if (viewport.sizeClass() !== "tall") return undefined;
    const { left, right } = viewport.sideInsets();
    return catalogueRow(viewport.width(), left, right);
  });
  const chips = chipRow === undefined ? undefined : chipArrangement(chipRow, chipContents);
  const catalogueArrangement = chipContents.length === 0 ? undefined : `${columns}:${chips ?? "landscape"}`;
  const dinosaur = screen.kind === "dinosaur" ? shown[screen.index] : undefined;
  // The lines a dinosaur's page keeps for its words are its arrangement
  // only upright, where the stylesheet reads them.
  const { description: descriptionLines, note: noteLines } = keptLines(dinosaurWords, size === "tall-narrow");
  const dinosaurArrangement = portrait ? `${descriptionLines}:${noteLines}` : undefined;
  const catalogueLayout = useRef<CatalogueLayout>(null);
  const dinosaurLayout = useRef<DinosaurPageLayout>(null);
  // The screen shown takes its layout as the turn changes it, after the
  // turn has measured or captured the page as it stood.
  const applyLayout = useCallback(() => {
    catalogueLayout.current?.apply({ columns, chips });
    dinosaurLayout.current?.apply({ upright: portrait, lines: { description: descriptionLines, note: noteLines } });
  }, [columns, chips, portrait, descriptionLines, noteLines]);
  useLayoutTurns(
    turns,
    viewport,
    size,
    screen.kind === "catalogue" && catalogueArrangement !== undefined
      ? { screen: layoutScreen, portrait, gated: gateShown, arrangement: catalogueArrangement }
      : screen.kind === "dinosaur" && dinosaurArrangement !== undefined
        ? { screen: layoutScreen, portrait, gated: gateShown, arrangement: dinosaurArrangement }
      : { screen: layoutScreen, portrait, gated: gateShown },
    applyLayout
  );
  // The next or previous creature takes the page with no change of
  // layout, and its words may stand elsewhere: the turn measures its parts
  // afresh.
  useLayoutEffect(() => {
    if (dinosaur) turns.redrawn();
  }, [turns, dinosaur]);
  // Where the shared picture lands: the card come back to, whose row the
  // keeper puts back before it is read, so the native close and the
  // continuation agree, or the page opened.
  const landing = screen.kind === "catalogue" ? screen.returning : dinosaur?.id;
  useLayoutEffect(() => closing.arrive(landing), [closing, screen, landing]);

  // The list opened from home is the catalogue's start; a food chosen or a
  // dinosaur's page left is not. It is counted with the change, so a
  // second ANCIENT REPTILES, on its tile or the large card, before the
  // catalogue shows finds it already asked for and counts nothing.
  const openCatalogue = () => {
    go((current) => (current.kind === "home" ? { kind: "catalogue", returning: undefined } : current), {
      also: () => {
        startCounter.countStart("catalogue");
        setFood("all");
      }
    });
  };

  // A food newly chosen shows its dinosaurs from the top, rising in.
  const chooseFood = (chosen: Food) => {
    if (chosen === food) return;
    go({ kind: "catalogue", returning: undefined }, { also: () => setFood(chosen) });
  };

  const pictureOf = (index: number) => bodyPicture(shown[index]?.id ?? "");

  // A dinosaur's page shows at once, and only if the screen is still
  // where the child tapped: a second tap meanwhile changes nothing more.
  const showDinosaur = (index: number, still: (current: Screen) => boolean, options?: { step?: Step; also?: () => void }) =>
    go((current) => (still(current) ? { kind: "dinosaur", index } : current), { intent: options?.step, also: options?.also });

  // The pictures either side of a page, loaded ahead so a step to them
  // shows its picture at once.
  const neighboursOf = (index: number) => (["previous", "next"] as const).map((way) => pictureOf(stepFrom(index, way, shown.length)));

  const openDinosaur = (id: string) =>
    showDinosaur(
      shown.findIndex((entry) => entry.id === id),
      (current) => current.kind === "catalogue",
      { also: () => { if (!careProps.reducedMotion()) closing.open(id); } }
    );

  const step = (from: number, way: Step) =>
    showDinosaur(stepFrom(from, way, shown.length), (current) => current.kind === "dinosaur" && current.index === from, {
      step: way,
      also: () => { if (!careProps.reducedMotion()) sliding.start(way); }
    });

  const closeDinosaur = (index: number) => go({ kind: "catalogue", returning: shown[index]?.id }, {
    also: () => { if (!careProps.reducedMotion()) closing.start(shown[index]!.id); }
  });

  const content = () => {
    switch (screen.kind) {
      case "compare":
        return quiz.content(language, compareQuestionType(questionWidth, size === "tall-narrow" ? NARROW_QUESTION : PORTRAIT_QUESTION), compareResultType(resultWidth, size === "tall-narrow" ? NARROW_RESULT : PORTRAIT_RESULT));
      case "catalogue":
        return (
          <CatalogueScreen
            ref={catalogueLayout}
            pictureTransition={pictureTransition}
            language={language}
            dinosaurs={shown.map((entry) => presentCatalogueCard(entry, language, bodyPicture, pairs.found))}
            foods={FOODS.map((choice) => ({ food: choice, count: ofFood(catalogue, choice).length }))}
            food={food}
            initialArrangement={{ columns, chips }}
            chipWidths={chipWidths}
            onChipContents={measuredChips}
            layoutKeeping={turns}
            returning={screen.returning}
            onFood={chooseFood}
            onOpen={openDinosaur}
            onHome={home}
          />
        );
      case "dinosaur": {
        const { index } = screen;
        const entry = shown[index];
        if (!entry) throw new Error(`No dinosaur at ${index} among those shown`);
        return (
          <>
            <LoadAhead urls={neighboursOf(index)} />
            <DinosaurPage
              ref={dinosaurLayout}
              pictureTransition={pictureTransition}
              language={language}
              dinosaur={presentDinosaurPage(entry, language, bodyPicture, pairs.found)}
              initialLayout={{ upright: portrait, lines: { description: descriptionLines, note: noteLines } }}
              number={index + 1}
              total={shown.length}
              onPrevious={() => step(index, "previous")}
              onNext={() => step(index, "next")}
              onBack={() => closeDinosaur(index)}
            />
          </>
        );
      }
      case "care":
        return care.content(language);
      case "sorting":
        return sorting.content(language, sortWidth, compareResultType(resultWidth));
      case "pairs":
        return pairs.content(language, pairsWelcomeType(welcomeWidth, size === "tall-narrow" ? NARROW_WELCOME : PORTRAIT_WELCOME), boardWidth, pairsResultRoom, size === "tall-narrow" ? NARROW_BOARD : PORTRAIT_BOARD, size === "tall-narrow" ? NARROW_PAIRS_RESULT : PORTRAIT_PAIRS_RESULT);
      case "skeletons":
        return skeletonGame.content(language);
      case "dig":
        return dig.content(language);
      case "sandWriting":
        return <SandWritingScreen language={language} sandContext={sandContext} onHome={home} />;
      case "home":
        return (
          <HomePage
            language={language}
            onLanguage={chooseLanguage}
            theme={themeChoice}
            onTheme={chooseTheme}
            ageLevel={ageLevel.level}
            onAgeLevel={chooseAgeLevel}
            startTimer={startTimer}
            viewport={viewport}
            upright={size === "tall" || size === "tall-narrow"}
            narrow={size === "tall-narrow"}
            layoutKeeping={turns}
            featured={featured}
            faceOff={{ left: bodyPicture(FACE_OFF.left), right: bodyPicture(FACE_OFF.right) }}
            best={quiz.best}
            catalogue={{ picture: bodyPicture(CATALOGUE_TILE), count: catalogue.length }}
            care={{ picture: bodyPicture(CARE_TILE), best: care.best }}
            pairs={{ picture: bodyPicture(PAIRS_TILE), stars: pairs.stars }}
            skeletons={{ picture: skeletonPicture(SKELETONS_TILE, "skeleton"), best: skeletonGame.best }}
            sort={{ picture: bodyPicture(SORT_TILE), best: sorting.best }}
            dig={{ picture: digTile, dugUp: dig.dugUp }}
            moreComing={bodyPicture(MORE_COMING)}
            onCompareDinosaurs={openCompare}
            onCatalogue={openCatalogue}
            onCare={openCare}
            onSort={openSorting}
            onPairs={openPairs}
            onSkeletons={openSkeletons}
            onMuseum={openMuseum}
            onDig={openDig}
            onSandWriting={openSandWriting}
          />
        );
    }
  };

  // One screen cross-fades into the next; a new question of the quiz
  // animates only its pair of cards, inside the question screen, and so
  // does the next dinosaur inside its page. As a dinosaur's page opens or closes, the
  // rest of the screen fades while its picture moves.
  return (
    <PicturesProvider store={pictures} startTimer={startTimer}>
      <OrientationGate shown={gateShown} screenUpright={screenUpright} language={language}>
        <ViewTransition
          default="none"
          update={{ [SCREEN_CHANGE]: "screen", [DIG_REVEAL]: "dig-reveal-change", [OPEN_DINOSAUR]: "screen-fade", [CLOSE_DINOSAUR]: "screen-fade", default: "none" }}
        >
          {content()}
        </ViewTransition>
      </OrientationGate>
    </PicturesProvider>
  );
}
