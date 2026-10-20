import { ArrowRight, Check, House, Ruler, Scale, Trophy, Weight, X, type LucideIcon } from "lucide-react";
import { ViewTransition } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";

// What the prompt asks about.
export type Prompt = keyof Texts["prompts"];

const SYMBOLS: Record<Prompt, LucideIcon> = { mass: Scale, height: Ruler };

// The symbol beside a revealed value, of what the value measures.
const VALUE_SYMBOLS: Record<Prompt, LucideIcon> = { mass: Weight, height: Ruler };

export type Mark = keyof Texts["marks"];

const MARKS: Record<Mark, LucideIcon> = { correct: Check, wrong: X };

// The view transition type of the next question taking the last one's
// place: the old pair slides out to the left and the new one in from the
// right, the second card a little after the first.
export const NEXT_QUESTION = "next-question";

export type DinosaurCardView = {
  id: string;
  name: string;
  // The URL of the dinosaur's picture.
  picture: string;
  // The dinosaur's value, written out, once the question is answered.
  value: string | undefined;
  mark: Mark | undefined;
  // The child tapped this card.
  chosen: boolean;
};

export type QuestionScreenProps = {
  language: Language;
  prompt: Prompt;
  number: number;
  total: number;
  left: DinosaurCardView;
  right: DinosaurCardView;
  answered: boolean;
  last: boolean;
  onChoose: (id: string) => void;
  onNext: () => void;
  onHome: () => void;
};

export function QuestionScreen({ language, prompt, number, total, left, right, answered, last, onChoose, onNext, onHome }: QuestionScreenProps) {
  const text = TEXTS[language];
  const Symbol = SYMBOLS[prompt];
  // Each question's cards are its own, so the next question's pair enters
  // as the last one leaves, even when a dinosaur is in both.
  const card = (view: DinosaurCardView, side: "left" | "right") => {
    const late = side === "right" ? "-late" : "";
    return (
      <ViewTransition
        key={`${number}-${side}`}
        default="none"
        enter={{ [NEXT_QUESTION]: `card-in${late}`, default: "none" }}
        exit={{ [NEXT_QUESTION]: `card-out${late}`, default: "none" }}
      >
        <DinosaurCard view={view} language={language} prompt={prompt} answered={answered} onChoose={onChoose} />
      </ViewTransition>
    );
  };
  return (
    <main className="question">
      <div className="stratum stratum-1" aria-hidden="true" />
      <header className="question-bar">
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </Button>
        {/* One step per question: those done, the one on screen, and those
            still to come. */}
        <span className="steps" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className="step" data-step={index + 1 < number ? "done" : index + 1 === number ? "current" : undefined} />
          ))}
        </span>
        <p className="progress" aria-label={text.progress}>
          {number}/{total}
        </p>
      </header>
      <h1 className="prompt">
        <span className="prompt-symbol" aria-hidden="true">
          <Symbol size={30} />
        </span>
        {text.prompts[prompt]}
      </h1>
      <div className="dinosaur-cards" role="group" aria-label={text.creatures}>
        {card(left, "left")}
        <span className="versus" aria-hidden="true">
          {text.versus}
        </span>
        {card(right, "right")}
      </div>
      {/* The row keeps its place before the answer, so the cards do not
          move when Next appears. */}
      <div className="next-row">
        {answered && (
          <Button className="next-button" onClick={onNext}>
            {last ? (
              <>
                <Trophy size={28} aria-hidden="true" />
                {text.seeResult}
              </>
            ) : (
              <>
                {text.next}
                <ArrowRight size={28} aria-hidden="true" />
              </>
            )}
          </Button>
        )}
      </div>
    </main>
  );
}

type DinosaurCardProps = {
  view: DinosaurCardView;
  language: Language;
  prompt: Prompt;
  answered: boolean;
  onChoose: (id: string) => void;
};

function DinosaurCard({ view: { id, name, picture, value, mark, chosen }, language, prompt, answered, onChoose }: DinosaurCardProps) {
  const text = TEXTS[language];
  const ValueSymbol = VALUE_SYMBOLS[prompt];
  const MarkSymbol = mark && MARKS[mark];
  // An answered card no longer responds to touch: only the first tap
  // counts, and a card that still looked pressable would say otherwise.
  return (
    <Button
      className="card dinosaur-card"
      aria-label={name}
      aria-disabled={answered || undefined}
      data-answered={answered || undefined}
      data-mark={mark}
      data-chosen={(answered && chosen) || undefined}
      onClick={() => onChoose(id)}
    >
      <span className="dinosaur-art">
        {/* Every picture is shown at the same size, whatever the dinosaur's
            real size: a picture must not hint at which one is larger. */}
        <Picture className="dinosaur-picture" src={picture} alt={name} width={800} height={600} />
        {mark && MarkSymbol && (
          <span className="mark" role="img" aria-label={text.marks[mark]}>
            <MarkSymbol size={24} strokeWidth={3} />
            {text.marks[mark]}
          </span>
        )}
      </span>
      <span className="dinosaur-footer">
        <span className="dinosaur-name">{name.toLocaleUpperCase(language)}</span>
        {value !== undefined && (
          <span className="dinosaur-value-chip">
            <ValueSymbol size={22} aria-hidden="true" />
            <span className="dinosaur-value">{value}</span>
          </span>
        )}
      </span>
    </Button>
  );
}
