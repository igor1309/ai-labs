import { formatValue } from "./formatValue.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { largerOf, type Attribute, type Dinosaur, type Question } from "./quiz/round.ts";
import { usePointerState } from "./usePointerState.ts";

const SYMBOLS: Record<Attribute, string> = { mass: "⚖️", height: "📏" };

type Mark = "correct" | "wrong";

const MARKS: Record<Mark, string> = { correct: "✓", wrong: "✗" };

export type QuestionScreenProps = {
  language: Language;
  question: Question;
  number: number;
  total: number;
  choice: string | null;
  last: boolean;
  onChoose: (dinosaur: Dinosaur) => void;
  onNext: () => void;
  onHome: () => void;
};

export function QuestionScreen({ language, question, number, total, choice, last, onChoose, onNext, onHome }: QuestionScreenProps) {
  const text = TEXTS[language];
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
      language={language}
      answered={answered}
      value={answered ? formatValue(question.attribute, dinosaur.measures[question.attribute], language) : undefined}
      mark={markOf(dinosaur)}
      onChoose={onChoose}
    />
  );
  return (
    <main className="question">
      <header className="question-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <span aria-hidden="true">🏠</span> {text.home}
        </button>
        <p className="progress" aria-label={text.progress}>
          {number}/{total}
        </p>
      </header>
      <h1 className="prompt">
        <span aria-hidden="true">{SYMBOLS[question.attribute]}</span> {text.prompts[question.attribute]}
      </h1>
      <div className="dinosaur-cards" role="group" aria-label={text.dinosaurs}>
        {card(question.left)}
        {card(question.right)}
      </div>
      {answered && (
        <button type="button" className="next-button" onClick={onNext}>
          {last ? (
            <>
              <span aria-hidden="true">🏆</span> {text.seeResult}
            </>
          ) : (
            <>
              <span aria-hidden="true">▶</span> {text.next}
            </>
          )}
        </button>
      )}
    </main>
  );
}

type DinosaurCardProps = {
  dinosaur: Dinosaur;
  language: Language;
  answered: boolean;
  value: string | undefined;
  mark: Mark | undefined;
  onChoose: (dinosaur: Dinosaur) => void;
};

function DinosaurCard({ dinosaur, language, answered, value, mark, onChoose }: DinosaurCardProps) {
  const name = dinosaur.name[language];
  const { "data-hovered": hovered, "data-pressed": pressed, ...pointer } = usePointerState();
  // An answered card no longer responds to touch: only the first tap
  // counts, and a card that still looked pressable would say otherwise.
  return (
    <button
      type="button"
      className="card dinosaur-card"
      aria-label={name}
      aria-disabled={answered || undefined}
      data-mark={mark}
      data-hovered={answered ? undefined : hovered}
      data-pressed={answered ? undefined : pressed}
      onClick={() => onChoose(dinosaur)}
      {...pointer}
    >
      {mark && (
        <span className="mark" role="img" aria-label={TEXTS[language].marks[mark]}>
          {MARKS[mark]}
        </span>
      )}
      {/* Every card shows the same placeholder at the same size until
          artwork exists: a picture must not hint at which one is larger. */}
      <span className="dinosaur-picture" role="img" aria-label={name}>
        🦕
      </span>
      <span className="dinosaur-name">{name.toLocaleUpperCase(language)}</span>
      {value !== undefined && <span className="dinosaur-value">{value}</span>}
    </button>
  );
}
