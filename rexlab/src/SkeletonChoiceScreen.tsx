import { Star, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { SkeletonBar } from "./SkeletonBar.tsx";
import { usePointerState } from "./usePointerState.ts";

// A dinosaur whose skeleton can be built: its name, its picture and
// whether its finished skeleton has earned its star.
export type SkeletonChoiceView = { id: string; name: string; picture: string; earned: boolean };

export type SkeletonChoiceScreenProps = {
  language: Language;
  // Every dinosaur to build, in the order the screen shows them.
  choices: readonly SkeletonChoiceView[];
  // The best collection score, out of every dinosaur; undefined until a
  // skeleton is finished, or when stored progress cannot be read.
  best: number | undefined;
  onChoose: (id: string) => void;
  onMuseum: () => void;
  onHome: () => void;
};

export function SkeletonChoiceScreen({ language, choices, best, onChoose, onMuseum, onHome }: SkeletonChoiceScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="skeleton-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <SkeletonBar language={language} title={text.skeletonTitle} onMuseum={onMuseum} onHome={onHome}>
        {best !== undefined && (
          <p className="skeleton-chip" aria-label={text.bestScore}>
            <Trophy size={20} aria-hidden="true" />
            {best}/{choices.length}
          </p>
        )}
      </SkeletonBar>
      <div className="skeleton-choices" role="group" aria-label={text.dinosaurs}>
        {choices.map((choice, index) => (
          <ChoiceCard key={choice.id} language={language} choice={choice} index={index} onChoose={onChoose} />
        ))}
      </div>
    </main>
  );
}

function ChoiceCard({ language, choice, index, onChoose }: { language: Language; choice: SkeletonChoiceView; index: number; onChoose: (id: string) => void }) {
  const pointer = usePointerState();
  const name = choice.name.toLocaleUpperCase(language);
  return (
    <button
      type="button"
      className="card skeleton-choice"
      aria-label={name}
      style={{ "--choice": index } as CSSProperties}
      onClick={() => onChoose(choice.id)}
      {...pointer}
    >
      <span className="skeleton-choice-art">
        <img className="skeleton-choice-picture" src={choice.picture} alt="" draggable={false} />
        {choice.earned && (
          <span className="skeleton-choice-star" role="img" aria-label={TEXTS[language].star}>
            <Star size={28} aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="skeleton-choice-name">{name}</span>
    </button>
  );
}
