import type { Language } from "./language/language.ts";
import { DigBar } from "./DigBar.tsx";
import { Picture } from "./Picture.tsx";

export type DigRevealScreenProps = {
  language: Language;
  // The dinosaur dug up: its name and its body picture, whole.
  name: string;
  picture: string;
  onHome: () => void;
};

// The dinosaur the gust has uncovered, whole, with its name, large.
export function DigRevealScreen({ language, name, picture, onHome }: DigRevealScreenProps) {
  return (
    <main className="dig-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <DigBar language={language} onHome={onHome} />
      <div className="dig-reveal">
        <span className="dig-reveal-art">
          <Picture className="dig-reveal-picture" src={picture} alt="" width={800} height={600} />
        </span>
        <h2 className="dig-reveal-name">{name.toLocaleUpperCase(language)}</h2>
      </div>
    </main>
  );
}
