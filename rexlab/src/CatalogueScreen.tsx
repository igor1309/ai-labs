import { Copy, House, MoveHorizontal, Ruler, Weight } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { ChipContent } from "./chipArrangement.ts";
import { DietTag, type Diet } from "./DietTag.tsx";
import { FoodChips, type ChipWidths, type Food, type FoodChoice } from "./FoodChips.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { SharedPicture } from "./SharedPicture.tsx";
import { useKeptList, type LayoutKeeping } from "./useKeptList.ts";

// How a creature's size is measured: a dinosaur's height, a flying
// reptile's wingspan or a sea reptile's length.
export type Measure = "height" | "wingspan" | "length";

// A height stands up the card's ruler; a wingspan or a length lies along
// its arrow, so neither reads as a height beside a dinosaur's.
export const MEASURE_ICONS = { height: Ruler, wingspan: MoveHorizontal, length: MoveHorizontal } as const;

export type CatalogueCardView = {
  id: string;
  name: string;
  // The URL of the dinosaur's picture.
  picture: string;
  // The size, by its measure, and the mass, written out.
  size: { measure: Measure; value: string };
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
  // The cards in a row.
  columns: number;
  // The width of the chips' row where it stands on its own, in a tall
  // window; undefined where the chips stand beside HOME.
  chipRow: number | undefined;
  // How the chips' parts are measured, for how they stand on their row.
  chipWidths: ChipWidths;
  onChipContents: (contents: readonly ChipContent[]) => void;
  layoutKeeping: LayoutKeeping;
  // The dinosaur whose page the child came back from, undefined when the
  // catalogue opens from the home page.
  returning: string | undefined;
  onFood: (food: Food) => void;
  onOpen: (id: string) => void;
  onHome: () => void;
};

export function CatalogueScreen({ language, dinosaurs, foods, food, columns, chipRow, chipWidths, onChipContents, layoutKeeping, returning, onFood, onOpen, onHome }: CatalogueScreenProps) {
  const text = TEXTS[language];
  const returningIndex = returning === undefined ? undefined : dinosaurs.findIndex(({ id }) => id === returning);
  // Back from a page, its card is scrolled into view, so its picture has a
  // card to shrink back into wherever the list was scrolled to.
  const list = useKeptList(layoutKeeping, columns, returningIndex === -1 ? undefined : returningIndex);

  return (
    <main className="catalogue" aria-label={text.catalogue}>
      {/* HOME and the chips in one row, or in a tall window the chips
          on a row of their own under HOME, and the cards under them. */}
      <header className="catalogue-bar">
        <Button className="home-button" data-turn-part="catalogue-home" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </Button>
        <FoodChips language={language} choices={foods} chosen={food} row={chipRow} widths={chipWidths} onContents={onChipContents} onChoose={onFood} />
      </header>
      {/* The cards rise in when the catalogue opens from home, and again
          for each food chosen, as a list of their own: back from a page,
          the picture shrinking into its card is the motion. */}
      <div
        key={food}
        ref={list.ref}
        onScroll={list.onScroll}
        className="catalogue-grid"
        role="group"
        aria-label={text.catalogue}
        data-rise={returning === undefined || undefined}
        data-turn-part="catalogue-list"
        style={{ "--columns": columns } as CSSProperties}
      >
        {dinosaurs.map((view, index) => (
          <CatalogueCard key={view.id} view={view} language={language} place={Math.min(index, columns - 1)} onOpen={onOpen} />
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

function CatalogueCard({ view: { id, name, picture, size, mass, diet }, language, place, onOpen }: CatalogueCardProps) {
  const SizeIcon = MEASURE_ICONS[size.measure];
  return (
    <Button
      className="card catalogue-card"
      aria-label={name}
      data-id={id}
      data-turn-part={`catalogue-card-${id}`}
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
            <SizeIcon size={16} aria-hidden="true" />
            {size.value}
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
