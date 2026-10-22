import { ArrowLeft, ArrowRight, BookOpen, Weight } from "lucide-react";
import { useImperativeHandle, useRef, ViewTransition, type ReactNode, type Ref } from "react";
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

// The page's layout: whether it stands upright, and the lines its words
// keep there.
export type DinosaurLayout = { upright: boolean; lines: KeptLines };

// The turn applies the layout only after measuring or capturing the page
// as it stood.
export type DinosaurPageLayout = { apply(layout: DinosaurLayout): void };

export type DinosaurPageProps = {
  ref?: Ref<DinosaurPageLayout>;
  pictureTransition?: PictureTransition | undefined;
  language: Language;
  dinosaur: DinosaurPageView;
  // The dinosaur's place in the catalogue, from 1.
  number: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onBack: () => void;
  initialLayout: DinosaurLayout;
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

// Whether going from `from` to `to` turns the page to its other layout,
// rather than following the window in the same one.
const isTurn = (from: DinosaurLayout, to: DinosaurLayout) =>
  from.upright !== to.upright || (to.upright && (from.lines.description !== to.lines.description || from.lines.note !== to.lines.note));

export function DinosaurPage({ ref, pictureTransition, language, dinosaur: { id, name, picture, group, diet, description, size, mass }, number, total, onPrevious, onNext, onBack, initialLayout }: DinosaurPageProps) {
  const text = TEXTS[language];
  const SizeIcon = MEASURE_ICONS[size.measure];
  const applied = useRef(initialLayout);
  const main = useRef<HTMLElement>(null);
  useImperativeHandle(ref, () => ({
    apply: (next) => {
      const from = applied.current;
      applied.current = next;
      const page = main.current;
      if (!page) return;
      page.dataset.descriptionLines = String(next.lines.description);
      page.dataset.noteLines = String(next.lines.note);
      page.querySelector(".dinosaur-description")?.setAttribute("data-lines", String(next.lines.description));
      page.querySelector(".source-note")?.setAttribute("data-lines", String(next.lines.note));
      // A turned page shows from its top. The stylesheet gives the root
      // and the body no overflow of their own, so the window scrolls the
      // page, through the root's scroll position.
      if (isTurn(from, next)) page.ownerDocument.documentElement.scrollTop = 0;
    }
  }), []);
  const { lines } = applied.current;
  // The bar, the stage and the words are the parts a turn glides, each
  // with the parts inside it that it would otherwise lay out anew at once.
  return (
    <main ref={main} className="dinosaur-page" data-description-lines={lines.description} data-note-lines={lines.note}>
      <header className="dinosaur-bar" data-turn-part="dinosaur-bar">
        <Button className="home-button" data-turn-part="dinosaur-catalogue" onClick={onBack}>
          <BookOpen size={24} aria-hidden="true" />
          {text.catalogue}
        </Button>
        <p className="dinosaur-position" data-turn-part="dinosaur-position" aria-label={text.position}>
          {number} / {total}
        </p>
      </header>
      <div className="dinosaur-body">
        <div className="dinosaur-stage" data-turn-part="dinosaur-stage">
          <span className="dinosaur-glow" data-turn-part="dinosaur-glow" aria-hidden="true" />
          <Sliding key={id} late={false}>
            <div className="dinosaur-stage-art" data-turn-part="dinosaur-picture">
              <SharedPicture id={id} transition={pictureTransition}>
                <Picture className="dinosaur-stage-picture" src={picture} alt={name} width={800} height={600} />
              </SharedPicture>
            </div>
          </Sliding>
          <nav className="dinosaur-steps">
            <Button className="dinosaur-step" data-turn-part="dinosaur-previous" aria-label={text.previousDinosaur} onClick={onPrevious}>
              <ArrowLeft size={32} aria-hidden="true" />
            </Button>
            <Button className="dinosaur-step" data-turn-part="dinosaur-next" aria-label={text.nextDinosaur} onClick={onNext}>
              <ArrowRight size={32} aria-hidden="true" />
            </Button>
          </nav>
        </div>
        <div className="dinosaur-info" data-turn-part="dinosaur-words">
          <Sliding key={id} late={true}>
            <div className="dinosaur-about" data-turn-part="dinosaur-about">
              <p className="dinosaur-group">{group ? text.groups[group] : ""}</p>
              <h1 className="dinosaur-page-name">{name.toLocaleUpperCase(language)}</h1>
              <DietTag diet={diet} language={language} size="medium" />
              <p className="dinosaur-description" data-lines={lines.description}>{description}</p>
              <div className="dinosaur-facts">
                <p className="dinosaur-fact" data-turn-part="dinosaur-size">
                  <span className="dinosaur-fact-label">
                    <SizeIcon size={22} aria-hidden="true" />
                    {text.measures[size.measure]}
                  </span>
                  <span className="dinosaur-fact-value">{size.value}</span>
                </p>
                <p className="dinosaur-fact" data-turn-part="dinosaur-mass">
                  <span className="dinosaur-fact-label">
                    <Weight size={22} aria-hidden="true" />
                    {text.heavy}
                  </span>
                  <span className="dinosaur-fact-value">{mass}</span>
                </p>
              </div>
            </div>
          </Sliding>
          <p className="source-note" data-turn-part="dinosaur-note" data-lines={lines.note}>{text.sourceNote}</p>
        </div>
      </div>
    </main>
  );
}
