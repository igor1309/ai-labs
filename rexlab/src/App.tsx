import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, ViewTransition } from "react";
import { DEFAULT_AGE_LEVEL, pickAgeLevel, type AgeLevel, type AgeLevelSetting } from "./ageLevel.ts";
import { beatBest } from "./bestScore.ts";
import { useCareGame, type CareGameProps } from "./careGame.tsx";
import { FOODS, ofFood, stepFrom, type CatalogueEntry, type Food, type Step } from "./catalogue.ts";
import { CatalogueScreen } from "./CatalogueScreen.tsx";
import { DinosaurPage, NEXT_DINOSAUR, PREVIOUS_DINOSAUR } from "./DinosaurPage.tsx";
import { calendarDay, chooseFeatured, type FeaturedStore } from "./featured.ts";
import { HOME_GAMES, HomePage, type HomeGame } from "./HomePage.tsx";
import { languageOfDevice, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { usePairsGame, type PairsGameProps } from "./pairsGame.tsx";
import { LoadAhead, pictureStore, PicturesProvider, type PictureStore } from "./Picture.tsx";
import type { LoadPicture, StartTimer } from "./pictureWait.ts";
import { presentCatalogueCard, presentDinosaurPage, presentQuestion, presentResult } from "./presentation.ts";
import { NEXT_QUESTION, QuestionScreen } from "./QuestionScreen.tsx";
import {
  choose,
  finishPlay,
  next,
  questionState,
  startRound,
  type Dinosaur,
  type GameProgress,
  type Play,
  type Random,
  type RoundResult
} from "./quiz/index.ts";
import { ResultScreen } from "./ResultScreen.tsx";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { CLOSE_DINOSAUR, OPEN_DINOSAUR } from "./SharedPicture.tsx";
import { useSkeletonGame, type Presence, type SkeletonGameProps } from "./skeletonGame.tsx";
import { useSortingGame, type SortingGameProps } from "./sortingGame.tsx";
import { themeOf, type ThemeChoice } from "./theme.ts";

export type ProgressStore = {
  // The progress kept so far, or undefined when it cannot be read at all.
  load(): GameProgress | undefined;
  save(progress: GameProgress): void;
};

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

export type { CareProgressStore } from "./careGame.tsx";
export type { PairsProgressStore } from "./pairsGame.tsx";
export type { SkeletonPicture, SkeletonProgressStore } from "./skeletonGame.tsx";

export type AppProps = CareGameProps &
  PairsGameProps &
  Pick<SortingGameProps, "sortables" | "sortingProgress"> &
  Pick<SkeletonGameProps, "skeletons" | "skeletonPicture" | "skeletonProgress"> & {
    dinosaurs: readonly Dinosaur[];
    // Every dinosaur, in the order the catalogue shows them.
    catalogue: readonly CatalogueEntry[];
    // The URL of the body picture of the dinosaur with this id.
    bodyPicture: (dinosaurId: string) => string;
    random: Random;
    orientation: Orientation;
    pageVisibility: PageVisibility;
    progress: ProgressStore;
    // The device's language tag, such as "ru-RU".
    deviceLanguage: string;
    languageStore: LanguageStore;
    // Gives the version footer, which the static page holds outside the
    // app, its name for a screen reader.
    nameVersion: (label: string) => void;
    appearance: Appearance;
    themeStore: ThemeStore;
    ageLevelStore: AgeLevelStore;
    loadPicture: LoadPicture;
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

// The dinosaur cheering the child on at the end of a round.
const HERO = "tyrannosaurus";

const STEPS: Record<Step, string> = { next: NEXT_DINOSAUR, previous: PREVIOUS_DINOSAUR };

type Screen =
  | { kind: "home" }
  | { kind: "question"; play: Play }
  | { kind: "result"; result: RoundResult }
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
  | { kind: "skeletons" };

// A new question animates only its pair of cards, and an answer chosen,
// or a food, changes the screen at once. A dinosaur's page opens from its
// card and closes back to it, and a step slides the next page in the
// arrow's direction, which `step` gives: on a short or wrapping list the
// two places alone cannot tell previous from next.
export function transitionFor(from: Screen, to: Screen, step: Step | undefined): string | undefined {
  if (from.kind === "question" && to.kind === "question") return from.play.index === to.play.index ? undefined : NEXT_QUESTION;
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
  orientation,
  pageVisibility,
  progress,
  deviceLanguage,
  languageStore,
  nameVersion,
  appearance,
  themeStore,
  ageLevelStore,
  loadPicture,
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
  ...careProps
}: AppProps) {
  const { screen, go, set } = useScreens<Screen, Step>({ kind: "home" }, transitionFor);
  // The game the large card features, chosen once as the app starts: it
  // stays while the app is open, past midnight too, and the next day's is
  // chosen when the app is opened again.
  const [featured] = useState<HomeGame>(() => chooseFeatured(HOME_GAMES, { store: featuredStore, random, today: calendarDay(now()) }));
  const [lastPlay, setLastPlay] = useState<Play>();
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

  // Every picture the screens show, each loaded once.
  const [pictures] = useState<PictureStore>(() => pictureStore(loadPicture));

  // A round opens at once, its pictures shimmering until they load. It is
  // counted with the change, so a second COMPARE or PLAY AGAIN before the
  // question shows finds a round already asked for and starts nothing.
  const playNewRound = () => {
    sorting.cancel();
    const started = startRound(dinosaurs, random, lastPlay);
    go((current) => (current.kind === "question" ? current : { kind: "question", play: started }), {
      also: () => {
        setLastPlay(started);
        startCounter.countStart("compare");
      }
    });
  };

  // Each update moves from the state it is given, not the one last
  // rendered, so a tap that lands after the screen has already moved on
  // changes nothing.
  const play = (move: (play: Play) => Play) =>
    go((current) => (current.kind === "question" ? { ...current, play: move(current.play) } : current));
  const home = () => go({ kind: "home" });

  // Each game counts a start where it begins, wherever the child began it
  // from, and not as it opens on a welcome or choice screen.
  const counting = (game: HomeGame) => () => startCounter.countStart(game);

  const care = useCareGame({ ...careProps, bodyPicture, random, startTimer }, home, counting("care"));

  const openCare = () => {
    leaveHome();
    go({ kind: "care" }, { also: care.open });
  };

  const sorting = useSortingGame({ sortables, sortingProgress, bodyPicture, random, loadPicture, startTimer }, home, counting("sort"));

  const openSorting = () => {
    sorting.start(() => set({ kind: "sorting" }));
  };

  // A board SORT started, still waiting for its pictures, is dropped as
  // the child goes anywhere else, so it never opens over the screen they
  // chose.
  const leaveHome = () => sorting.cancel();

  const pairs = usePairsGame(
    { pals, pairsProgress, bodyPicture, random, startTimer, reducedMotion: careProps.reducedMotion },
    ageLevel,
    home,
    counting("pairs")
  );

  const openPairs = () => {
    leaveHome();
    go({ kind: "pairs" }, { also: pairs.open });
  };

  // The child is away from a game while the app is hidden, or while the
  // iPad is in portrait and the orientation gate covers it.
  const presence = useMemo<Presence>(
    () => ({
      isAway: () => orientation.isPortrait() || pageVisibility.isHidden(),
      subscribe: (onChange) => {
        const stopOrientation = orientation.subscribe(onChange);
        const stopVisibility = pageVisibility.subscribe(onChange);
        return () => {
          stopOrientation();
          stopVisibility();
        };
      }
    }),
    [orientation, pageVisibility]
  );

  const skeletonGame = useSkeletonGame(
    { skeletons, skeletonPicture, skeletonProgress, bodyPicture, loadPicture, startTimer, presence, reducedMotion: careProps.reducedMotion },
    home,
    counting("skeletons")
  );

  const openSkeletons = () => {
    leaveHome();
    go({ kind: "skeletons" });
  };

  // The museum opens from the home page straight into the skeleton game,
  // as a screen change and not a start: only building there starts one.
  const openMuseum = () => {
    leaveHome();
    go({ kind: "skeletons" }, { also: skeletonGame.openMuseum });
  };

  // The next question shows at once, and only if the round is still where
  // Next was tapped: a second tap changes nothing more.
  const goOn = (from: Play) => {
    const to = next(from);
    go((current) => (current.kind === "question" && current.play === from ? { ...current, play: to } : current));
  };

  // A round is recorded only here, when its result is shown, so a round
  // left early changes nothing.
  const seeResult = (finished: Play) => {
    const result = finishPlay(finished, progress.load(), beatBest);
    if (result.progress) {
      progress.save(result.progress);
    }
    go({ kind: "result", result });
  };

  // The food chosen is kept going to a page and back, but the catalogue
  // opens from home on every dinosaur.
  const [food, setFood] = useState<Food>("all");
  const shown = ofFood(catalogue, food);

  // The list opened from home is the catalogue's start; a food chosen or a
  // dinosaur's page left is not. It is counted with the change, so a
  // second ALL DINOSAURS, on its tile or the large card, before the
  // catalogue shows finds it already asked for and counts nothing.
  const openCatalogue = () => {
    leaveHome();
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
  const showDinosaur = (index: number, still: (current: Screen) => boolean, step?: Step) =>
    go((current) => (still(current) ? { kind: "dinosaur", index } : current), { intent: step });

  // The pictures either side of a page, loaded ahead so a step to them
  // shows its picture at once.
  const neighboursOf = (index: number) => (["previous", "next"] as const).map((way) => pictureOf(stepFrom(index, way, shown.length)));

  const openDinosaur = (id: string) =>
    showDinosaur(
      shown.findIndex((entry) => entry.id === id),
      (current) => current.kind === "catalogue"
    );

  const step = (from: number, way: Step) =>
    showDinosaur(stepFrom(from, way, shown.length), (current) => current.kind === "dinosaur" && current.index === from, way);

  const closeDinosaur = (index: number) => go({ kind: "catalogue", returning: shown[index]?.id });

  const content = () => {
    switch (screen.kind) {
      case "question": {
        const current = screen.play;
        const question = questionState(current);
        // The next question's pictures load while this one is answered.
        const coming = current.round[current.index + 1];
        return (
          <>
            {coming && <LoadAhead urls={[bodyPicture(coming.left.id), bodyPicture(coming.right.id)]} />}
            <QuestionScreen
              language={language}
              {...presentQuestion(question, language, bodyPicture)}
              onChoose={(id) => play((state) => choose(state, id))}
              onNext={question.last ? () => seeResult(current) : () => goOn(current)}
              onHome={home}
            />
          </>
        );
      }
      case "result":
        return (
          <ResultScreen
            language={language}
            {...presentResult(screen.result)}
            hero={bodyPicture(HERO)}
            onPlayAgain={playNewRound}
            onHome={home}
          />
        );
      case "catalogue":
        return (
          <CatalogueScreen
            language={language}
            dinosaurs={shown.map((entry) => presentCatalogueCard(entry, language, bodyPicture, pairs.found))}
            foods={FOODS.map((choice) => ({ food: choice, count: ofFood(catalogue, choice).length }))}
            food={food}
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
              language={language}
              dinosaur={presentDinosaurPage(entry, language, bodyPicture, pairs.found)}
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
        return sorting.content(language);
      case "pairs":
        return pairs.content(language);
      case "skeletons":
        return skeletonGame.content(language);
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
            featured={featured}
            faceOff={{ left: bodyPicture(FACE_OFF.left), right: bodyPicture(FACE_OFF.right) }}
            best={progress.load()?.bestScore ?? undefined}
            catalogue={{ picture: bodyPicture(CATALOGUE_TILE), count: catalogue.length }}
            care={{ picture: bodyPicture(CARE_TILE), best: care.best }}
            pairs={{ picture: bodyPicture(PAIRS_TILE), stars: pairs.stars }}
            skeletons={{ picture: skeletonPicture(SKELETONS_TILE, "skeleton"), best: skeletonGame.best }}
            sort={{ picture: bodyPicture(SORT_TILE), best: sortingProgress.load()?.bestScore ?? undefined }}
            moreComing={bodyPicture(MORE_COMING)}
            onCompareDinosaurs={playNewRound}
            onCatalogue={openCatalogue}
            onCare={openCare}
            onSort={openSorting}
            onPairs={openPairs}
            onSkeletons={openSkeletons}
            onMuseum={openMuseum}
          />
        );
    }
  };

  // One screen cross-fades into the next; a new question animates only its
  // pair of cards, inside the question screen, and so does the next
  // dinosaur inside its page. As a dinosaur's page opens or closes, the
  // rest of the screen fades while its picture moves.
  return (
    <PicturesProvider store={pictures} startTimer={startTimer}>
      <OrientationGate orientation={orientation} language={language}>
        <ViewTransition
          default="none"
          update={{ [SCREEN_CHANGE]: "screen", [OPEN_DINOSAUR]: "screen-fade", [CLOSE_DINOSAUR]: "screen-fade", default: "none" }}
        >
          {content()}
        </ViewTransition>
      </OrientationGate>
    </PicturesProvider>
  );
}
