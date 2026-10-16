import { LANGUAGES, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { usePointerState } from "./usePointerState.ts";

export type HomePageProps = {
  language: Language;
  onLanguage: (language: Language) => void;
  onCompareDinosaurs: () => void;
};

export function HomePage({ language, onLanguage, onCompareDinosaurs }: HomePageProps) {
  const text = TEXTS[language];
  const pointer = usePointerState();
  return (
    <main className="home">
      {/* The switch is for parents: small, faded and out of the way in a
          corner, and only here, never during a round. */}
      <nav className="language-switch" aria-label={text.languageSwitch}>
        {LANGUAGES.map((option, index) => (
          <span key={option}>
            {index > 0 && <span aria-hidden="true">{" | "}</span>}
            <button type="button" aria-pressed={option === language} onClick={() => onLanguage(option)}>
              {option.toUpperCase()}
            </button>
          </span>
        ))}
      </nav>
      <button type="button" className="card quiz-card" aria-label={text.quizCard} onClick={onCompareDinosaurs} {...pointer}>
        <span className="quiz-card-picture" role="img" aria-label={text.quizCardPicture}>
          🦖🦕
        </span>
        <span className="quiz-card-title">{text.quizCard}</span>
      </button>
    </main>
  );
}
