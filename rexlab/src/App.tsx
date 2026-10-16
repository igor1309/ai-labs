import { useEffect, useState } from "react";
import { HomePage } from "./HomePage.tsx";
import { languageOfDevice, type Language } from "./language/language.ts";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { QuestionScreen } from "./QuestionScreen.tsx";
import { ResultScreen } from "./ResultScreen.tsx";
import { choose, currentChoice, currentQuestion, isLastQuestion, next, score, startPlay, type Play } from "./quiz/play.ts";
import { finishRound, type Celebration, type GameProgress } from "./quiz/progress.ts";
import { generateRound, type Dinosaur, type Random, type Round } from "./quiz/round.ts";

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

type Result = {
  score: number;
  total: number;
  best: number | undefined;
  celebration: Celebration | null;
};

type Screen = { kind: "home" } | { kind: "question"; play: Play } | { kind: "result"; result: Result };

export function App({ dinosaurs, random, orientation, progress, deviceLanguage, languageStore }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [lastRound, setLastRound] = useState<Round>([]);
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

  const startRound = () => {
    const round = generateRound(dinosaurs, random, lastRound);
    setLastRound(round);
    setScreen({ kind: "question", play: startPlay(round) });
  };

  // Each update moves from the state it is given, not the one last
  // rendered, so a tap that lands after the screen has already moved on
  // changes nothing.
  const play = (move: (play: Play) => Play) =>
    setScreen((current) => (current.kind === "question" ? { ...current, play: move(current.play) } : current));
  const home = () => setScreen({ kind: "home" });

  // A round is recorded only here, when its result is shown, so a round
  // left early changes nothing. Progress that cannot be read gives no best
  // to compare with, so the round is neither celebrated nor saved over it.
  const seeResult = (finished: Play) => {
    const correct = score(finished);
    const stored = progress.load();
    const outcome = stored === undefined ? undefined : finishRound(stored, correct);
    if (outcome) {
      progress.save(outcome.progress);
    }
    setScreen({
      kind: "result",
      result: {
        score: correct,
        total: finished.round.length,
        best: outcome?.progress.bestScore,
        celebration: outcome?.celebration ?? null
      }
    });
  };

  const content = () => {
    switch (screen.kind) {
      case "question": {
        const current = screen.play;
        return (
          <QuestionScreen
            language={language}
            question={currentQuestion(current)}
            number={current.index + 1}
            total={current.round.length}
            choice={currentChoice(current)}
            last={isLastQuestion(current)}
            onChoose={(dinosaur) => play((state) => choose(state, dinosaur.id))}
            onNext={isLastQuestion(current) ? () => seeResult(current) : () => play(next)}
            onHome={home}
          />
        );
      }
      case "result":
        return <ResultScreen language={language} {...screen.result} onPlayAgain={startRound} onHome={home} />;
      case "home":
        return <HomePage language={language} onLanguage={chooseLanguage} onCompareDinosaurs={startRound} />;
    }
  };

  return <OrientationGate orientation={orientation} language={language}>{content()}</OrientationGate>;
}
