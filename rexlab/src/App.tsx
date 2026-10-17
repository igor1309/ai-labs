import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, ViewTransition } from "react";
import { beatBest } from "./bestScore.ts";
import { useCareGame, type CareGameProps } from "./careGame.tsx";
import { FOODS, ofFood, stepFrom, type CatalogueEntry, type Food, type Step } from "./catalogue.ts";
import { CatalogueScreen } from "./CatalogueScreen.tsx";
import { DinosaurPage, NEXT_DINOSAUR, PREVIOUS_DINOSAUR } from "./DinosaurPage.tsx";
import { HomePage } from "./HomePage.tsx";
import { languageOfDevice, type Language } from "./language/language.ts";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { usePairsGame, type PairsGameProps } from "./pairsGame.tsx";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
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
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";
import { CLOSE_DINOSAUR, OPEN_DINOSAUR } from "./SharedPicture.tsx";
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

// Whether the device is set to its dark appearance, and its changes.
export type Appearance = {
  isDark(): boolean;
  subscribe(onChange: () => void): () => void;
};

export type { CareProgressStore } from "./careGame.tsx";
export type { PairsProgressStore } from "./pairsGame.tsx";

export type AppProps = CareGameProps &
  PairsGameProps &
  Pick<SortingGameProps, "sortables" | "sortingProgress"> & {
    dinosaurs: readonly Dinosaur[];
    // Every dinosaur, in the order the catalogue shows them.
    catalogue: readonly CatalogueEntry[];
    // The URL of the body picture of the dinosaur with this id.
    bodyPicture: (dinosaurId: string) => string;
    random: Random;
    orientation: Orientation;
    progress: ProgressStore;
    // The device's language tag, such as "ru-RU".
    deviceLanguage: string;
    languageStore: LanguageStore;
    appearance: Appearance;
    themeStore: ThemeStore;
    loadPicture: LoadPicture;
    startTimer: StartTimer;
  };

// The two dinosaurs facing off on the home page's quiz card.
const FACE_OFF = { left: "tyrannosaurus", right: "brachiosaurus" };

// The dinosaur on the catalogue's tile.
const CATALOGUE_TILE = "stegosaurus";

// The dinosaur on dinosaur care's tile.
const CARE_TILE = "parasaurolophus";

// The dinosaur on the sorting game's card.
const SORT_TILE = "triceratops";

// The dinosaur on find the pair's tile.
const PAIRS_TILE = "stegosaurus";

// The dinosaur whose shape stands on the home tile of the games still to
// come.
const MORE_COMING = "triceratops";

// The dinosaur cheering the child on at the end of a round.
const HERO = "tyrannosaurus";

// The longest a question waits for its pictures, in milliseconds:
// long enough for a picture on a slow connection, short enough that a
// broken one does not keep the child waiting.
const PICTURE_WAIT = 1000;

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
  | { kind: "pairs" };

export function App({
  dinosaurs,
  catalogue,
  bodyPicture,
  random,
  orientation,
  progress,
  deviceLanguage,
  languageStore,
  appearance,
  themeStore,
  loadPicture,
  startTimer,
  sortables,
  sortingProgress,
  pals,
  pairsProgress,
  ...careProps
}: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [lastPlay, setLastPlay] = useState<Play>();
  // The device language is only the first guess: a parent's choice is kept
  // and wins on every later visit.
  const [language, setLanguage] = useState<Language>(() => languageStore.load() ?? languageOfDevice(deviceLanguage));

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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

  // The pictures of the question `play` is on, once they are ready or the
  // wait runs out.
  const whenPicturesReady = (play: Play, ready: () => void) => {
    const { left, right } = questionState(play);
    waitForPictures([bodyPicture(left.dinosaur.id), bodyPicture(right.dinosaur.id)], { loadPicture, startTimer, limit: PICTURE_WAIT }, ready);
  };

  // A round being started, while its first pictures load: a second tap on
  // COMPARE or PLAY AGAIN meanwhile starts nothing more.
  const starting = useRef(false);

  const playNewRound = () => {
    leaveHome();
    if (starting.current) return;
    starting.current = true;
    const started = startRound(dinosaurs, random, lastPlay);
    whenPicturesReady(started, () => {
      starting.current = false;
      setLastPlay(started);
      changeScreen(SCREEN_CHANGE, () => setScreen({ kind: "question", play: started }));
    });
  };

  // Each update moves from the state it is given, not the one last
  // rendered, so a tap that lands after the screen has already moved on
  // changes nothing.
  const play = (move: (play: Play) => Play) =>
    setScreen((current) => (current.kind === "question" ? { ...current, play: move(current.play) } : current));
  const home = () => changeScreen(SCREEN_CHANGE, () => setScreen({ kind: "home" }));

  const care = useCareGame({ ...careProps, bodyPicture, random, loadPicture, startTimer }, home);

  const openCare = () => {
    leaveHome();
    changeScreen(SCREEN_CHANGE, () => {
      care.open();
      setScreen({ kind: "care" });
    });
  };

  const sorting = useSortingGame({ sortables, sortingProgress, bodyPicture, random, loadPicture, startTimer }, home);

  const openSorting = () => sorting.start(() => setScreen({ kind: "sorting" }));

  // A board SORT started, still waiting for its pictures, is dropped as
  // the child goes anywhere else, so it never opens over the screen they
  // chose.
  const leaveHome = () => sorting.cancel();

  const pairs = usePairsGame({ pals, pairsProgress, bodyPicture, random, loadPicture, startTimer, reducedMotion: careProps.reducedMotion }, home);

  const openPairs = () => {
    leaveHome();
    changeScreen(SCREEN_CHANGE, () => {
      pairs.open();
      setScreen({ kind: "pairs" });
    });
  };

  // The next question shows once its pictures are ready, so none pops in,
  // and only if the round is still where Next was tapped: a second tap, or
  // Home, while the pictures load changes nothing more.
  const goOn = (from: Play) => {
    const to = next(from);
    whenPicturesReady(to, () =>
      changeScreen(NEXT_QUESTION, () => setScreen((current) => (current.kind === "question" && current.play === from ? { ...current, play: to } : current)))
    );
  };

  // A round is recorded only here, when its result is shown, so a round
  // left early changes nothing.
  const seeResult = (finished: Play) => {
    const result = finishPlay(finished, progress.load(), beatBest);
    if (result.progress) {
      progress.save(result.progress);
    }
    changeScreen(SCREEN_CHANGE, () => setScreen({ kind: "result", result }));
  };

  // The food chosen is kept going to a page and back, but the catalogue
  // opens from home on every dinosaur.
  const [food, setFood] = useState<Food>("all");
  const shown = ofFood(catalogue, food);

  const openCatalogue = () => {
    leaveHome();
    changeScreen(SCREEN_CHANGE, () => {
      setFood("all");
      setScreen({ kind: "catalogue", returning: undefined });
    });
  };

  // A food newly chosen shows its dinosaurs from the top, rising in.
  const chooseFood = (chosen: Food) => {
    if (chosen === food) return;
    setFood(chosen);
    setScreen({ kind: "catalogue", returning: undefined });
  };

  const pictureOf = (index: number) => bodyPicture(shown[index]?.id ?? "");

  // A dinosaur's page shows once its picture is ready, as a question
  // does, and only if the screen is still where the child tapped: a
  // second tap meanwhile changes nothing more. The pictures either side
  // are loaded ahead, so a step to them does not wait.
  const showDinosaur = (index: number, type: string, still: (current: Screen) => boolean) => {
    const wait = { loadPicture, startTimer, limit: PICTURE_WAIT };
    waitForPictures([pictureOf(index)], wait, () =>
      changeScreen(type, () => setScreen((current) => (still(current) ? { kind: "dinosaur", index } : current)))
    );
    const neighbours = (["previous", "next"] as const).map((step) => pictureOf(stepFrom(index, step, shown.length)));
    waitForPictures(neighbours, wait, () => {});
  };

  const openDinosaur = (id: string) =>
    showDinosaur(
      shown.findIndex((entry) => entry.id === id),
      OPEN_DINOSAUR,
      (current) => current.kind === "catalogue"
    );

  const step = (from: number, way: Step) =>
    showDinosaur(stepFrom(from, way, shown.length), STEPS[way], (current) => current.kind === "dinosaur" && current.index === from);

  const closeDinosaur = (index: number) => changeScreen(CLOSE_DINOSAUR, () => setScreen({ kind: "catalogue", returning: shown[index]?.id }));

  const content = () => {
    switch (screen.kind) {
      case "question": {
        const current = screen.play;
        const question = questionState(current);
        return (
          <QuestionScreen
            language={language}
            {...presentQuestion(question, language, bodyPicture)}
            onChoose={(id) => play((state) => choose(state, id))}
            onNext={question.last ? () => seeResult(current) : () => goOn(current)}
            onHome={home}
          />
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
          <DinosaurPage
            language={language}
            dinosaur={presentDinosaurPage(entry, language, bodyPicture, pairs.found)}
            number={index + 1}
            total={shown.length}
            onPrevious={() => step(index, "previous")}
            onNext={() => step(index, "next")}
            onBack={() => closeDinosaur(index)}
          />
        );
      }
      case "care":
        return care.content(language);
      case "sorting":
        return sorting.content(language);
      case "pairs":
        return pairs.content(language);
      case "home":
        return (
          <HomePage
            language={language}
            onLanguage={chooseLanguage}
            theme={themeChoice}
            onTheme={chooseTheme}
            faceOff={{ left: bodyPicture(FACE_OFF.left), right: bodyPicture(FACE_OFF.right) }}
            best={progress.load()?.bestScore ?? undefined}
            catalogue={{ picture: bodyPicture(CATALOGUE_TILE), count: catalogue.length }}
            care={{ picture: bodyPicture(CARE_TILE), best: care.best }}
            pairs={{ picture: bodyPicture(PAIRS_TILE), stars: pairs.stars }}
            sort={{ picture: bodyPicture(SORT_TILE), best: sortingProgress.load()?.bestScore ?? undefined }}
            moreComing={bodyPicture(MORE_COMING)}
            onCompareDinosaurs={playNewRound}
            onCatalogue={openCatalogue}
            onCare={openCare}
            onSort={openSorting}
            onPairs={openPairs}
          />
        );
    }
  };

  // One screen cross-fades into the next; a new question animates only its
  // pair of cards, inside the question screen, and so does the next
  // dinosaur inside its page. As a dinosaur's page opens or closes, the
  // rest of the screen fades while its picture moves.
  return (
    <OrientationGate orientation={orientation} language={language}>
      <ViewTransition
        default="none"
        update={{ [SCREEN_CHANGE]: "screen", [OPEN_DINOSAUR]: "screen-fade", [CLOSE_DINOSAUR]: "screen-fade", default: "none" }}
      >
        {content()}
      </ViewTransition>
    </OrientationGate>
  );
}
