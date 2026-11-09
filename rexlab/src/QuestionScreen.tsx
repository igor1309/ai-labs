import { ArrowDownToLine, Check, Feather, House, MoveHorizontal, Play, Ruler, Scale, Trophy, Weight, X, type LucideIcon } from "lucide-react";
import { ViewTransition, type CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { QuestionType } from "./compareQuestionLayout.ts";
import { EarthEdge } from "./EarthEdge.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";

// What the prompt asks about.
export type Prompt = keyof Texts["prompts"];

const SYMBOLS: Record<Prompt, LucideIcon> = { mass: Scale, height: Ruler, lighter: Feather, shorter: ArrowDownToLine, longer: MoveHorizontal };

// The symbol beside a revealed value, of what the value measures.
const VALUE_SYMBOLS: Record<Prompt, LucideIcon> = { mass: Weight, height: Ruler, lighter: Weight, shorter: Ruler, longer: MoveHorizontal };

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

// How one question of the round stands on the progress steps.
export type QuestionStep = "right" | "just-right" | "wrong" | "current" | "to-come";

export type QuestionScreenProps = {
  language: Language;
  prompt: Prompt;
  number: number;
  total: number;
  // One for each question of the round, in order.
  steps: readonly QuestionStep[];
  // The level's best score, when there is one to show.
  best: number | undefined;
  left: DinosaurCardView;
  right: DinosaurCardView;
  answered: boolean;
  last: boolean;
  onChoose: (id: string) => void;
  onNext: () => void;
  onHome: () => void;
  // The prompt's and the names' type upright, one for every question in
  // the window; landscape sizes them itself.
  type?: QuestionType;
};

// The upright type, as the custom properties the stylesheet sizes the
// prompt and the names by.
const typeStyle = (type: QuestionType | undefined) => (type ? { "--prompt-size": `${type.prompt}px`, "--name-size": `${type.name}px` } : {});

export function QuestionScreen({ language, prompt, number, total, steps, best, left, right, answered, last, onChoose, onNext, onHome, type }: QuestionScreenProps) {
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
        <DinosaurCard view={view} part={`question-${side}`} language={language} prompt={prompt} answered={answered} onChoose={onChoose} />
      </ViewTransition>
    );
  };
  // The bar, the prompt, each card, "VS" and the row for NEXT are the
  // parts a turn glides. The sand and its ochre layer are one decoration
  // behind them, so the parts stay the grid's own children and NEXT can
  // stand under the cards or beside the prompt.
  return (
    <main className="question" style={typeStyle(type) as CSSProperties}>
      <div className="question-sand" aria-hidden="true">
        <EarthEdge className="question-edge" />
        <div className="question-ochre">
          <EarthEdge className="question-edge" />
        </div>
      </div>
      <header className="question-bar" data-turn-part="question-bar">
        <Button className="home-button" onClick={onHome}>
          <House size={22} aria-hidden="true" />
          <span className="narrow-hidden">{text.home}</span>
        </Button>
        <div className="question-position">
          <span className="steps" aria-hidden="true">
            {steps.map((step, index) => (
              <span key={index} className="step" data-step={step} />
            ))}
          </span>
          <p className="progress" aria-label={text.progress}>
            <span className="question-tally">{number}</span>
            <span className="question-of">/<span className="question-total">{total}</span></span>
          </p>
        </div>
        {best !== undefined && (
          <p className="question-best" aria-label={text.bestScore}>
            <Trophy size={18} fill="currentColor" aria-hidden="true" />
            <span className="question-tally">{best}</span>
            <span className="question-of">/<span className="question-total">{total}</span></span>
          </p>
        )}
      </header>
      <h1 className="prompt" data-turn-part="question-prompt">
        <span className="prompt-symbol" aria-hidden="true">
          <Symbol size={30} />
        </span>
        {text.prompts[prompt]}
      </h1>
      <div className="dinosaur-cards" role="group" aria-label={text.creatures}>
        {card(left, "left")}
        <span key={number} className="versus" data-turn-part="question-versus" aria-hidden="true">
          {text.versus}
        </span>
        {card(right, "right")}
      </div>
      {/* The row keeps its place before the answer, so the cards do not
          move when Next appears. */}
      <div className="next-row" data-turn-part="question-next">
        {answered && (
          <Button className="next-button" onClick={onNext}>
            {last ? <Trophy size={26} aria-hidden="true" /> : <Play size={26} aria-hidden="true" />}
            {last ? text.seeResult : text.next}
          </Button>
        )}
      </div>
    </main>
  );
}

type DinosaurCardProps = {
  view: DinosaurCardView;
  // The card's name as a part of the turn.
  part: string;
  language: Language;
  prompt: Prompt;
  answered: boolean;
  onChoose: (id: string) => void;
};

function DinosaurCard({ view: { id, name, picture, value, mark, chosen }, part, language, prompt, answered, onChoose }: DinosaurCardProps) {
  const text = TEXTS[language];
  const ValueSymbol = VALUE_SYMBOLS[prompt];
  const MarkSymbol = mark && MARKS[mark];
  // An answered card no longer responds to touch: only the first tap
  // counts, and a card that still looked pressable would say otherwise.
  return (
    <Button
      className="card dinosaur-card"
      data-turn-part={part}
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
            <MarkSymbol strokeWidth={3} aria-hidden="true" />
          </span>
        )}
        {value !== undefined && (
          <span className="dinosaur-value-chip">
            <ValueSymbol size={22} aria-hidden="true" />
            <span className="dinosaur-value">{value}</span>
          </span>
        )}
      </span>
      <span className="dinosaur-name">{name.toLocaleUpperCase(language)}</span>
    </Button>
  );
}
