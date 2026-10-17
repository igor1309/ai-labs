import { addTransitionType, startTransition, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, ViewTransition } from "react";
import { HomePage, type LockedGame } from "./HomePage.tsx";
import { languageOfDevice, type Language } from "./language/language.ts";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
import { presentQuestion, presentResult } from "./presentation.ts";
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

export type AppProps = {
  dinosaurs: readonly Dinosaur[];
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

// The dinosaur on each locked game's tile.
const LOCKED: Record<LockedGame, string> = { taller: "stegosaurus", diet: "triceratops" };

// The dinosaur cheering the child on at the end of a round.
const HERO = "tyrannosaurus";

// The longest a question waits for its pictures, in milliseconds:
// long enough for a picture on a slow connection, short enough that a
// broken one does not keep the child waiting.
const PICTURE_WAIT = 1000;

// The view transition type of one screen giving way to another.
const SCREEN_CHANGE = "screen-change";

// Makes `update` a view transition of `type`, where the browser has view
// transitions; elsewhere the screen changes at once.
function changeScreen(type: string, update: () => void) {
  startTransition(() => {
    addTransitionType(type);
    update();
  });
}

type Screen = { kind: "home" } | { kind: "question"; play: Play } | { kind: "result"; result: RoundResult };

export function App({
  dinosaurs,
  bodyPicture,
  random,
  orientation,
  progress,
  deviceLanguage,
  languageStore,
  appearance,
  themeStore,
  loadPicture,
  startTimer
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
    const result = finishPlay(finished, progress.load());
    if (result.progress) {
      progress.save(result.progress);
    }
    changeScreen(SCREEN_CHANGE, () => setScreen({ kind: "result", result }));
  };

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
      case "home":
        return (
          <HomePage
            language={language}
            onLanguage={chooseLanguage}
            theme={themeChoice}
            onTheme={chooseTheme}
            faceOff={{ left: bodyPicture(FACE_OFF.left), right: bodyPicture(FACE_OFF.right) }}
            best={progress.load()?.bestScore ?? undefined}
            locked={{ taller: bodyPicture(LOCKED.taller), diet: bodyPicture(LOCKED.diet) }}
            onCompareDinosaurs={playNewRound}
          />
        );
    }
  };

  // One screen cross-fades into the next; a new question animates only its
  // pair of cards, inside the question screen.
  return (
    <OrientationGate orientation={orientation} language={language}>
      <ViewTransition default="none" update={{ [SCREEN_CHANGE]: "screen", default: "none" }}>
        {content()}
      </ViewTransition>
    </OrientationGate>
  );
}
