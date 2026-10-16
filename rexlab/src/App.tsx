import { useState } from "react";
import { HomePage } from "./HomePage.tsx";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { QuestionScreen } from "./QuestionScreen.tsx";
import { generateRound, type Dinosaur, type Random, type Round } from "./quiz/round.ts";

export type AppProps = {
  dinosaurs: readonly Dinosaur[];
  random: Random;
  orientation: Orientation;
};

type Screen = { kind: "home" } | { kind: "question"; round: Round; index: number; choice: string | null };

export function App({ dinosaurs, random, orientation }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [lastRound, setLastRound] = useState<Round>([]);

  const startRound = () => {
    const round = generateRound(dinosaurs, random, lastRound);
    setLastRound(round);
    setScreen({ kind: "question", round, index: 0, choice: null });
  };

  // Each update checks the state it moves from, so a tap that lands after
  // the screen has already moved on changes nothing.
  const choose = (dinosaur: Dinosaur) =>
    setScreen((current) =>
      current.kind === "question" && current.choice === null ? { ...current, choice: dinosaur.id } : current
    );
  const next = () =>
    setScreen((current) =>
      current.kind === "question" && current.choice !== null && current.index + 1 < current.round.length
        ? { ...current, index: current.index + 1, choice: null }
        : current
    );
  const home = () => setScreen({ kind: "home" });

  const question = screen.kind === "question" ? screen.round[screen.index] : undefined;
  return (
    <OrientationGate orientation={orientation}>
      {screen.kind === "question" && question ? (
        <QuestionScreen
          question={question}
          number={screen.index + 1}
          total={screen.round.length}
          answered={screen.choice !== null}
          onChoose={choose}
          onNext={next}
          onHome={home}
        />
      ) : (
        <HomePage onCompareDinosaurs={startRound} />
      )}
    </OrientationGate>
  );
}
