import { BookOpen, Copy, Footprints, House, Ruler, Weight } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { DietTag, type Diet } from "./DietTag.tsx";
import { FoodChips, type Food, type FoodChoice } from "./FoodChips.tsx";
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
  // Found in find the pair.
  found: boolean;
};

export type CatalogueScreenProps = {
  language: Language;
  // The dinosaurs of the food chosen.
  dinosaurs: readonly CatalogueCardView[];
  foods: readonly FoodChoice[];
  food: Food;
  // The dinosaur whose page the child came back from, undefined when the
  // catalogue opens from the home page.
  returning: string | undefined;
  onFood: (food: Food) => void;
  onOpen: (id: string) => void;
  onHome: () => void;
};

export function CatalogueScreen({ language, dinosaurs, foods, food, returning, onFood, onOpen, onHome }: CatalogueScreenProps) {
  const text = TEXTS[language];
  const found = dinosaurs.filter((view) => view.found).length;
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
        {/* Once a dinosaur shown is found, the count is of those found. */}
        {found > 0 ? (
          <p className="catalogue-count catalogue-found" aria-label={text.found}>
            <Copy size={20} aria-hidden="true" />
            {found} / {dinosaurs.length}
          </p>
        ) : (
          <p className="catalogue-count" aria-label={text.dinosaurs}>
            <Footprints size={20} aria-hidden="true" />
            {dinosaurs.length}
          </p>
        )}
      </header>
      <FoodChips language={language} choices={foods} chosen={food} onChoose={onFood} />
      {/* The cards rise in when the catalogue opens from home, and again
          for each food chosen, as a list of their own: back from a page,
          the picture shrinking into its card is the motion. */}
      <div key={food} ref={grid} className="catalogue-grid" role="group" aria-label={text.catalogue} data-rise={returning === undefined || undefined}>
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

function CatalogueCard({ view: { id, name, picture, height, mass, diet, found }, language, place, onOpen }: CatalogueCardProps) {
  const pointer = usePointerState();
  const text = TEXTS[language];
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
        {found && (
          <span className="found-stamp" role="img" aria-label={text.found}>
            <Copy size={26} aria-hidden="true" />
          </span>
        )}
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
