import { Search } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { SkeletonBar } from "./SkeletonBar.tsx";

// A dinosaur the mystery skeleton may be: its name, its body picture, and
// whether it was guessed and was not the one.
export type SkeletonGuessChoice = { id: string; name: string; picture: string; wrong: boolean };

export type SkeletonGuessScreenProps = {
  language: Language;
  // The finished mystery skeleton, whole, in its frame.
  skeleton: string;
  frame: { width: number; height: number };
  // The three dinosaurs to guess from, in the order shown.
  choices: readonly SkeletonGuessChoice[];
  // What tells the mystery apart, from the first wrong guess on.
  clue: string | undefined;
  onGuess: (id: string) => void;
  onBack: () => void;
  onMuseum: () => void;
  onHome: () => void;
};

// The finished mystery skeleton asks whose it is: its bones beside three
// dinosaurs' bodies. A wrong guess wobbles and rests aside, and the clue
// shows below them.
export function SkeletonGuessScreen({ language, skeleton, frame, choices, clue, onGuess, onBack, onMuseum, onHome }: SkeletonGuessScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="skeleton-screen skeleton-guess-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <SkeletonBar language={language} title={text.whoseSkeleton} onMuseum={onMuseum} onBack={onBack} onHome={onHome} />
      <div className="skeleton-reveal">
        <div
          className="skeleton-board skeleton-reveal-board"
          data-turn-part="skeleton-guess-board"
          role="img"
          aria-label={text.skeleton}
          style={{ "--frame-width": frame.width, "--frame-height": frame.height } as CSSProperties}
        >
          <span className="skeleton-reveal-bones" data-alone>
            <Picture className="skeleton-reveal-bones-picture" src={skeleton} alt="" />
          </span>
        </div>
        <section className="skeleton-guess">
          <div className="skeleton-guess-choices" role="group" aria-label={text.whoseSkeleton}>
            {choices.map((choice, index) => {
              const name = choice.name.toLocaleUpperCase(language);
              return (
                <Button
                  key={choice.id}
                  className="skeleton-guess-card"
                  data-turn-part={`skeleton-guess-${choice.id}`}
                  data-wrong={choice.wrong || undefined}
                  disabled={choice.wrong}
                  aria-label={choice.wrong ? `${name}: ${text.digChoice.tryAnother}` : name}
                  style={{ "--choice": index } as CSSProperties}
                  onClick={() => onGuess(choice.id)}
                >
                  <Picture className="skeleton-guess-picture" src={choice.picture} alt="" width={800} height={600} />
                  <span className="skeleton-guess-name" style={{ "--letters": choice.name.length } as CSSProperties}>
                    {name}
                  </span>
                </Button>
              );
            })}
          </div>
          <p className="skeleton-clue" role="status">
            {clue !== undefined && (
              <span className="skeleton-clue-line">
                <Search size={26} aria-hidden="true" />
                {clue}
              </span>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
