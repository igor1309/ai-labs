import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { usePointerState } from "./usePointerState.ts";

// What the prompt asks about.
export type Prompt = keyof Texts["prompts"];

const SYMBOLS: Record<Prompt, string> = { mass: "⚖️", height: "📏" };

export type Mark = keyof Texts["marks"];

const MARKS: Record<Mark, string> = { correct: "✓", wrong: "✗" };

export type DinosaurCardView = {
  id: string;
  name: string;
  // The URL of the dinosaur's picture.
  picture: string;
  // The dinosaur's value, written out, once the question is answered.
  value: string | undefined;
  mark: Mark | undefined;
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
  const card = (view: DinosaurCardView) => (
    <DinosaurCard key={view.id} view={view} language={language} answered={answered} onChoose={onChoose} />
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
        <span aria-hidden="true">{SYMBOLS[prompt]}</span> {text.prompts[prompt]}
      </h1>
      <div className="dinosaur-cards" role="group" aria-label={text.dinosaurs}>
        {card(left)}
        {card(right)}
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
  view: DinosaurCardView;
  language: Language;
  answered: boolean;
  onChoose: (id: string) => void;
};

function DinosaurCard({ view: { id, name, picture, value, mark }, language, answered, onChoose }: DinosaurCardProps) {
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
      onClick={() => onChoose(id)}
      {...pointer}
    >
      {mark && (
        <span className="mark" role="img" aria-label={TEXTS[language].marks[mark]}>
          {MARKS[mark]}
        </span>
      )}
      {/* Every picture is shown at the same size, whatever the dinosaur's
          real size: a picture must not hint at which one is larger. */}
      <img className="dinosaur-picture" src={picture} alt={name} width={800} height={600} draggable={false} />
      <span className="dinosaur-name">{name.toLocaleUpperCase(language)}</span>
      {value !== undefined && <span className="dinosaur-value">{value}</span>}
    </button>
  );
}
