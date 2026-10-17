import { ArrowLeft, ArrowRight, BookOpen, Ruler, Weight } from "lucide-react";
import { ViewTransition, type ReactNode } from "react";
import { DietTag, type Diet } from "./DietTag.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { SharedPicture } from "./SharedPicture.tsx";

// The view transition types of the next or previous dinosaur taking the
// page: the picture and the words slide out and in the arrow's way, the
// words a little after the picture.
export const NEXT_DINOSAUR = "next-dinosaur";
export const PREVIOUS_DINOSAUR = "previous-dinosaur";

export type DinosaurPageView = {
  id: string;
  name: string;
  // The URL of the dinosaur's picture.
  picture: string;
  diet: Diet;
  description: string;
  // The height and the mass, written out.
  height: string;
  mass: string;
};

export type DinosaurPageProps = {
  language: Language;
  dinosaur: DinosaurPageView;
  // The dinosaur's place in the catalogue, from 1.
  number: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
};

// What slides as one dinosaur gives way to the next. It is keyed by the
// dinosaur, so the next one's picture and words enter as the last one's
// leave.
function Sliding({ late, children }: { late: boolean; children: ReactNode }) {
  const after = late ? "-late" : "";
  return (
    <ViewTransition
      default="none"
      enter={{ [NEXT_DINOSAUR]: `dinosaur-in${after}`, [PREVIOUS_DINOSAUR]: `dinosaur-in-back${after}`, default: "none" }}
      exit={{ [NEXT_DINOSAUR]: `dinosaur-out${after}`, [PREVIOUS_DINOSAUR]: `dinosaur-out-back${after}`, default: "none" }}
    >
      {children}
    </ViewTransition>
  );
}

export function DinosaurPage({ language, dinosaur: { id, name, picture, diet, description, height, mass }, number, total, onPrevious, onNext, onBack }: DinosaurPageProps) {
  const text = TEXTS[language];
  return (
    <main className="dinosaur-page">
      <header className="dinosaur-bar">
        <button type="button" className="home-button" onClick={onBack}>
          <BookOpen size={24} aria-hidden="true" />
          {text.catalogue}
        </button>
        <p className="dinosaur-position" aria-label={text.position}>
          {number} / {total}
        </p>
      </header>
      <div className="dinosaur-body">
        <div className="dinosaur-stage">
          <span className="dinosaur-glow" aria-hidden="true" />
          <Sliding key={id} late={false}>
            <div className="dinosaur-stage-art">
              <SharedPicture id={id}>
                <img className="dinosaur-stage-picture" src={picture} alt={name} width={800} height={600} draggable={false} />
              </SharedPicture>
            </div>
          </Sliding>
          <nav className="dinosaur-steps">
            <button type="button" className="dinosaur-step" aria-label={text.previousDinosaur} onClick={onPrevious}>
              <ArrowLeft size={32} aria-hidden="true" />
            </button>
            <button type="button" className="dinosaur-step" aria-label={text.nextDinosaur} onClick={onNext}>
              <ArrowRight size={32} aria-hidden="true" />
            </button>
          </nav>
        </div>
        <div className="dinosaur-info">
          <Sliding key={id} late={true}>
            <div className="dinosaur-about">
              <h1 className="dinosaur-page-name">{name.toLocaleUpperCase(language)}</h1>
              <DietTag diet={diet} language={language} size="medium" />
              <p className="dinosaur-description">{description}</p>
              <div className="dinosaur-facts">
                <p className="dinosaur-fact">
                  <span className="dinosaur-fact-label">
                    <Ruler size={22} aria-hidden="true" />
                    {text.tall}
                  </span>
                  <span className="dinosaur-fact-value">{height}</span>
                </p>
                <p className="dinosaur-fact">
                  <span className="dinosaur-fact-label">
                    <Weight size={22} aria-hidden="true" />
                    {text.heavy}
                  </span>
                  <span className="dinosaur-fact-value">{mass}</span>
                </p>
              </div>
            </div>
          </Sliding>
          <p className="source-note">{text.sourceNote}</p>
        </div>
      </div>
    </main>
  );
}
