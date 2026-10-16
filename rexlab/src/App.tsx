import { useEffect, useState } from "react";
import { HomePage } from "./HomePage.tsx";
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

export type AppProps = {
  dinosaurs: readonly Dinosaur[];
  random: Random;
  orientation: Orientation;
  progress: ProgressStore;
  // The device's language tag, such as "ru-RU".
  deviceLanguage: string;
  languageStore: LanguageStore;
};

type Screen = { kind: "home" } | { kind: "question"; play: Play } | { kind: "result"; result: RoundResult };

export function App({ dinosaurs, random, orientation, progress, deviceLanguage, languageStore }: AppProps) {
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
            {...presentQuestion(question, language)}
            onChoose={(id) => play((state) => choose(state, id))}
            onNext={question.last ? () => seeResult(current) : () => play(next)}
            onHome={home}
          />
        );
      }
      case "result":
        return <ResultScreen language={language} {...presentResult(screen.result)} onPlayAgain={playNewRound} onHome={home} />;
      case "home":
        return <HomePage language={language} onLanguage={chooseLanguage} onCompareDinosaurs={playNewRound} />;
    }
  };

  return <OrientationGate orientation={orientation} language={language}>{content()}</OrientationGate>;
}
