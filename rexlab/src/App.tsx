import { useState } from "react";
import { HomePage } from "./HomePage.tsx";
import { OrientationGate, type Orientation } from "./OrientationGate.tsx";
import { QuestionScreen } from "./QuestionScreen.tsx";
import { choose, currentChoice, currentQuestion, isLastQuestion, next, startPlay, type Play } from "./quiz/play.ts";
import { generateRound, type Dinosaur, type Random, type Round } from "./quiz/round.ts";

export type AppProps = {
  dinosaurs: readonly Dinosaur[];
  random: Random;
  orientation: Orientation;
};

type Screen = { kind: "home" } | { kind: "question"; play: Play };

export function App({ dinosaurs, random, orientation }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [lastRound, setLastRound] = useState<Round>([]);

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

  return (
    <OrientationGate orientation={orientation}>
      {screen.kind === "question" ? (
        <QuestionScreen
          question={currentQuestion(screen.play)}
          number={screen.play.index + 1}
          total={screen.play.round.length}
          choice={currentChoice(screen.play)}
          last={isLastQuestion(screen.play)}
          onChoose={(dinosaur) => play((current) => choose(current, dinosaur.id))}
          onNext={() => play(next)}
          onHome={home}
        />
      ) : (
        <HomePage onCompareDinosaurs={startRound} />
      )}
    </OrientationGate>
  );
}
