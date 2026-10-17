import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { HomePage, type LockedGame } from "./HomePage.tsx";
import { languageOfDevice, type Language } from "./language/language.ts";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { presentQuestion, presentResult } from "./presentation.ts";
import { QuestionScreen } from "./QuestionScreen.tsx";
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
};

// The two dinosaurs facing off on the home page's quiz card.
const FACE_OFF = { left: "tyrannosaurus", right: "brachiosaurus" };

// The dinosaur on each locked game's tile.
const LOCKED: Record<LockedGame, string> = { taller: "stegosaurus", diet: "triceratops" };

// The dinosaur cheering the child on at the end of a round.
const HERO = "tyrannosaurus";

type Screen ={ kind: "home" } | { kind: "question"; play: Play } | { kind: "result"; result: RoundResult };

export function App({ dinosaurs, bodyPicture, random, orientation, progress, deviceLanguage, languageStore, appearance, themeStore }: AppProps) {
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

  const playNewRound = () => {
    const started = startRound(dinosaurs, random, lastPlay);
    setLastPlay(started);
    setScreen({ kind: "question", play: started });
  };

  // Each update moves from the state it is given, not the one last
  // rendered, so a tap that lands after the screen has already moved on
  // changes nothing.
  const play = (move: (play: Play) => Play) =>
    setScreen((current) => (current.kind === "question" ? { ...current, play: move(current.play) } : current));
  const home = () => setScreen({ kind: "home" });

  // A round is recorded only here, when its result is shown, so a round
  // left early changes nothing.
  const seeResult = (finished: Play) => {
    const result = finishPlay(finished, progress.load());
    if (result.progress) {
      progress.save(result.progress);
    }
    setScreen({ kind: "result", result });
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
            onNext={question.last ? () => seeResult(current) : () => play(next)}
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

  return <OrientationGate orientation={orientation} language={language}>{content()}</OrientationGate>;
}
