import { formatValue } from "./formatValue.ts";
import { largerOf, type Attribute, type Dinosaur, type Question } from "./quiz/round.ts";
import { usePointerState } from "./usePointerState.ts";

const ASKS: Record<Attribute, { symbol: string; prompt: string }> = {
  mass: { symbol: "⚖️", prompt: "Who is heavier?" },
  height: { symbol: "📏", prompt: "Who is taller?" }
};

type Mark = "correct" | "wrong";

const MARKS: Record<Mark, { symbol: string; label: string }> = {
  correct: { symbol: "✓", label: "Correct" },
  wrong: { symbol: "✗", label: "Wrong" }
};

export type QuestionScreenProps = {
  question: Question;
  number: number;
  total: number;
  choice: string | null;
  last: boolean;
  onChoose: (dinosaur: Dinosaur) => void;
  onNext: () => void;
  onHome: () => void;
};

export function QuestionScreen({ question, number, total, choice, last, onChoose, onNext, onHome }: QuestionScreenProps) {
  const ask = ASKS[question.attribute];
  const answered = choice !== null;
  // Once answered, the right answer is marked whichever card was tapped,
  // so a wrong answer still shows the child which one is larger.
  const markOf = (dinosaur: Dinosaur): Mark | undefined => {
    if (!answered) return undefined;
    if (dinosaur.id === largerOf(question).id) return "correct";
    return dinosaur.id === choice ? "wrong" : undefined;
  };
  const card = (dinosaur: Dinosaur) => (
    <DinosaurCard
      key={dinosaur.id}
      dinosaur={dinosaur}
      answered={answered}
      value={answered ? formatValue(question.attribute, dinosaur.measures[question.attribute]) : undefined}
      mark={markOf(dinosaur)}
      onChoose={onChoose}
    />
  );
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
        {card(question.left)}
        {card(question.right)}
      </div>
      {answered && (
        <button type="button" className="next-button" onClick={onNext}>
          {last ? (
            <>
              <span aria-hidden="true">🏆</span> See result
            </>
          ) : (
            <>
              <span aria-hidden="true">▶</span> Next
            </>
          )}
        </button>
      )}
    </main>
  );
}

type DinosaurCardProps = {
  dinosaur: Dinosaur;
  answered: boolean;
  value: string | undefined;
  mark: Mark | undefined;
  onChoose: (dinosaur: Dinosaur) => void;
};

function DinosaurCard({ dinosaur, answered, value, mark, onChoose }: DinosaurCardProps) {
  const { "data-hovered": hovered, "data-pressed": pressed, ...pointer } = usePointerState();
  // An answered card no longer responds to touch: only the first tap
  // counts, and a card that still looked pressable would say otherwise.
  return (
    <button
      type="button"
      className="card dinosaur-card"
      aria-label={dinosaur.name}
      aria-disabled={answered || undefined}
      data-mark={mark}
      data-hovered={answered ? undefined : hovered}
      data-pressed={answered ? undefined : pressed}
      onClick={() => onChoose(dinosaur)}
      {...pointer}
    >
      {mark && (
        <span className="mark" role="img" aria-label={MARKS[mark].label}>
          {MARKS[mark].symbol}
        </span>
      )}
      {/* Every card shows the same placeholder at the same size until
          artwork exists: a picture must not hint at which one is larger. */}
      <span className="dinosaur-picture" role="img" aria-label={dinosaur.name}>
        🦕
      </span>
      <span className="dinosaur-name">{dinosaur.name.toUpperCase()}</span>
      {value !== undefined && <span className="dinosaur-value">{value}</span>}
    </button>
  );
}
