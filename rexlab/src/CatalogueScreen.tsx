import { BookOpen, Footprints, House, Ruler, Weight } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { DietTag, type Diet } from "./DietTag.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { SharedPicture } from "./SharedPicture.tsx";
import { usePointerState } from "./usePointerState.ts";

// The cards in a row of the catalogue.
const COLUMNS = 4;

export type CatalogueCardView = {
  id: string;
  name: string;
  // The URL of the dinosaur's picture.
  picture: string;
  // The height and the mass, written out.
  height: string;
  mass: string;
  diet: Diet;
};

export type CatalogueScreenProps = {
  language: Language;
  dinosaurs: readonly CatalogueCardView[];
  // The dinosaur whose page the child came back from, undefined when the
  // catalogue opens from the home page.
  returning: string | undefined;
  onOpen: (id: string) => void;
  onHome: () => void;
};

export function CatalogueScreen({ language, dinosaurs, returning, onOpen, onHome }: CatalogueScreenProps) {
  const text = TEXTS[language];
  const grid = useRef<HTMLDivElement>(null);

  // Back from a page, its card is in view, so its picture has a card to
  // shrink back into wherever the list was scrolled to.
  useLayoutEffect(() => {
    if (returning === undefined) return;
    const cards = [...(grid.current?.children ?? [])] as HTMLElement[];
    cards.find((card) => card.dataset.id === returning)?.scrollIntoView({ block: "nearest" });
  }, [returning]);

  return (
    <main className="catalogue">
      <header className="catalogue-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
        <h1 className="catalogue-title">
          <span className="catalogue-mark" aria-hidden="true">
            <BookOpen size={28} />
          </span>
          {text.catalogue}
        </h1>
        <p className="catalogue-count" aria-label={text.dinosaurs}>
          <Footprints size={20} aria-hidden="true" />
          {dinosaurs.length}
        </p>
      </header>
      {/* The cards rise in only when the catalogue opens from home: back
          from a page, the picture shrinking into its card is the motion. */}
      <div ref={grid} className="catalogue-grid" role="group" aria-label={text.catalogue} data-rise={returning === undefined || undefined}>
        {dinosaurs.map((view, index) => (
          <CatalogueCard key={view.id} view={view} language={language} place={Math.min(index, COLUMNS - 1)} onOpen={onOpen} />
        ))}
      </div>
    </main>
  );
}

type CatalogueCardProps = {
  view: CatalogueCardView;
  language: Language;
  // The card's place in the stagger of the cards rising in: only the
  // first row is staggered, so the list is quick to arrive.
  place: number;
  onOpen: (id: string) => void;
};

function CatalogueCard({ view: { id, name, picture, height, mass, diet }, language, place, onOpen }: CatalogueCardProps) {
  const pointer = usePointerState();
  return (
    <button
      type="button"
      className="card catalogue-card"
      aria-label={name}
      data-id={id}
      style={{ "--card": place } as CSSProperties}
      onClick={() => onOpen(id)}
      {...pointer}
    >
      <span className="catalogue-art">
        <SharedPicture id={id}>
          <img className="catalogue-picture" src={picture} alt="" width={800} height={600} draggable={false} />
        </SharedPicture>
      </span>
      <span className="catalogue-footer">
        <span className="catalogue-name">{name.toLocaleUpperCase(language)}</span>
        <span className="catalogue-chips">
          <span className="catalogue-chip">
            <Ruler size={16} aria-hidden="true" />
            {height}
          </span>
          <span className="catalogue-chip">
            <Weight size={16} aria-hidden="true" />
            {mass}
          </span>
          <DietTag diet={diet} language={language} size="small" />
        </span>
      </span>
    </button>
  );
}
