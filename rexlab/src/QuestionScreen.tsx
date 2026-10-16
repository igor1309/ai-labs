import type { Attribute, Dinosaur, Question } from "./quiz/round.ts";
import { usePointerState } from "./usePointerState.ts";

const ASKS: Record<Attribute, { symbol: string; prompt: string }> = {
  mass: { symbol: "⚖️", prompt: "Who is heavier?" },
  height: { symbol: "📏", prompt: "Who is taller?" }
};

export type QuestionScreenProps = {
  question: Question;
  number: number;
  total: number;
  answered: boolean;
  onChoose: (dinosaur: Dinosaur) => void;
  onNext: () => void;
  onHome: () => void;
};

export function QuestionScreen({ question, number, total, answered, onChoose, onNext, onHome }: QuestionScreenProps) {
  const ask = ASKS[question.attribute];
  return (
    <main className="question">
      <header className="question-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <span aria-hidden="true">🏠</span> Home
        </button>
        <p className="progress" aria-label="Progress">
          {number}/{total}
        </p>
      </header>
      <h1 className="prompt">
        <span aria-hidden="true">{ask.symbol}</span> {ask.prompt}
      </h1>
      <div className="dinosaur-cards" role="group" aria-label="Dinosaurs">
        <DinosaurCard key={question.left.id} dinosaur={question.left} onChoose={onChoose} />
        <DinosaurCard key={question.right.id} dinosaur={question.right} onChoose={onChoose} />
      </div>
      {answered && number < total && (
        <button type="button" className="next-button" onClick={onNext}>
          <span aria-hidden="true">▶</span> Next
        </button>
      )}
    </main>
  );
}

function DinosaurCard({ dinosaur, onChoose }: { dinosaur: Dinosaur; onChoose: (dinosaur: Dinosaur) => void }) {
  const pointer = usePointerState();
  return (
    <button type="button" className="card dinosaur-card" aria-label={dinosaur.name} onClick={() => onChoose(dinosaur)} {...pointer}>
      {/* Every card shows the same placeholder at the same size until
          artwork exists: a picture must not hint at which one is larger. */}
      <span className="dinosaur-picture" role="img" aria-label={dinosaur.name}>
        🦕
      </span>
      <span className="dinosaur-name">{dinosaur.name.toUpperCase()}</span>
    </button>
  );
}
