import { Copy, House, Ruler, Weight } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { Button } from "./Button.tsx";
import { DietTag, type Diet } from "./DietTag.tsx";
import { FoodChips, type Food, type FoodChoice } from "./FoodChips.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { SharedPicture } from "./SharedPicture.tsx";

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
  const grid = useRef<HTMLDivElement>(null);

  // Back from a page, its card is in view, so its picture has a card to
  // shrink back into wherever the list was scrolled to.
  useLayoutEffect(() => {
    if (returning === undefined) return;
    const cards = [...(grid.current?.children ?? [])] as HTMLElement[];
    cards.find((card) => card.dataset.id === returning)?.scrollIntoView({ block: "nearest" });
  }, [returning]);

  return (
    <main className="catalogue" aria-label={text.catalogue}>
      {/* HOME and the chips in one row, the cards under it. */}
      <header className="catalogue-bar">
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </Button>
        <FoodChips language={language} choices={foods} chosen={food} onChoose={onFood} />
      </header>
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

function CatalogueCard({ view: { id, name, picture, height, mass, diet }, language, place, onOpen }: CatalogueCardProps) {
  const text = TEXTS[language];
  return (
    <Button
      className="card catalogue-card"
      aria-label={name}
      data-id={id}
      style={{ "--card": place } as CSSProperties}
      onClick={() => onOpen(id)}
    >
      <span className="catalogue-art">
        <SharedPicture id={id}>
          <Picture className="catalogue-picture" src={picture} alt="" width={800} height={600} />
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
    </Button>
  );
}
