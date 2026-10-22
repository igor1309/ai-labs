import { ArrowLeft, ArrowRight, BookOpen, Weight } from "lucide-react";
import { ViewTransition, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { MEASURE_ICONS, type Measure } from "./CatalogueScreen.tsx";
import { DietTag, type Diet } from "./DietTag.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { SharedPicture, type PictureTransition } from "./SharedPicture.tsx";
import type { KeptLines } from "./dinosaurPageLayout.ts";

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
  // A creature that is no dinosaur names its group.
  group?: "flying-reptile" | "sea-reptile";
  diet: Diet;
  description: string;
  // The size, by its measure, and the mass, written out.
  size: { measure: Measure; value: string };
  mass: string;
  // Found in find the pair.
  found: boolean;
};

export type DinosaurPageProps = {
  pictureTransition?: PictureTransition | undefined;
  language: Language;
  dinosaur: DinosaurPageView;
  // The dinosaur's place in the catalogue, from 1.
  number: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
  keptLines: KeptLines;
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

export function DinosaurPage({ pictureTransition, language, dinosaur: { id, name, picture, group, diet, description, size, mass }, number, total, onPrevious, onNext, onBack, keptLines }: DinosaurPageProps) {
  const text = TEXTS[language];
  const SizeIcon = MEASURE_ICONS[size.measure];
  return (
    <main className="dinosaur-page" data-description-lines={keptLines.description} data-note-lines={keptLines.note}>
      <header className="dinosaur-bar">
        <Button className="home-button" onClick={onBack}>
          <BookOpen size={24} aria-hidden="true" />
          {text.catalogue}
        </Button>
        <p className="dinosaur-position" aria-label={text.position}>
          {number} / {total}
        </p>
      </header>
      <div className="dinosaur-body">
        <div className="dinosaur-stage">
          <span className="dinosaur-glow" aria-hidden="true" />
          <Sliding key={id} late={false}>
            <div className="dinosaur-stage-art">
              <SharedPicture id={id} transition={pictureTransition}>
                <Picture className="dinosaur-stage-picture" src={picture} alt={name} width={800} height={600} />
              </SharedPicture>
            </div>
          </Sliding>
          <nav className="dinosaur-steps">
            <Button className="dinosaur-step" aria-label={text.previousDinosaur} onClick={onPrevious}>
              <ArrowLeft size={32} aria-hidden="true" />
            </Button>
            <Button className="dinosaur-step" aria-label={text.nextDinosaur} onClick={onNext}>
              <ArrowRight size={32} aria-hidden="true" />
            </Button>
          </nav>
        </div>
        <div className="dinosaur-info">
          <Sliding key={id} late={true}>
            <div className="dinosaur-about">
              <p className="dinosaur-group">{group ? text.groups[group] : ""}</p>
              <h1 className="dinosaur-page-name">{name.toLocaleUpperCase(language)}</h1>
              <DietTag diet={diet} language={language} size="medium" />
              <p className="dinosaur-description" data-lines={keptLines.description}>{description}</p>
              <div className="dinosaur-facts">
                <p className="dinosaur-fact">
                  <span className="dinosaur-fact-label">
                    <SizeIcon size={22} aria-hidden="true" />
                    {text.measures[size.measure]}
                  </span>
                  <span className="dinosaur-fact-value">{size.value}</span>
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
          <p className="source-note" data-lines={keptLines.note}>{text.sourceNote}</p>
        </div>
      </div>
    </main>
  );
}
