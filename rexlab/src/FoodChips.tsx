import { Funnel } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button.tsx";
import { chipArrangement, type ChipContent } from "./chipArrangement.ts";
import { DIET_SYMBOLS, type Diet } from "./DietTag.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The dinosaurs a child chooses to see: every one, or those of one food
// type.
export type Food = "all" | Diet;

// A chip and how many dinosaurs it shows.
export type FoodChoice = { food: Food; count: number };

// How wide a part of a chip is as laid out, and when that may change with
// no change of the window, as when a font comes in.
export type ChipWidths = {
  width(part: Element): number;
  subscribe(onChange: () => void): () => void;
};

// Each chip by its symbols, as the tags show the food types, so a child
// who cannot read the word still picks one. The chip for every dinosaur
// is a filter symbol alone, with no word or count.
const SYMBOLS = { all: [Funnel], ...DIET_SYMBOLS };

// Two by two, the first two chips stand on the first row.
const FIRST_ROW = 2;

export type FoodChipsProps = {
  language: Language;
  // The chips, in the order they show.
  choices: readonly FoodChoice[];
  chosen: Food;
  // The width of the chips' row where it stands on its own, in a tall
  // window; undefined where the chips stand beside HOME.
  row: number | undefined;
  widths: ChipWidths;
  onContents?: (contents: readonly ChipContent[]) => void;
  onChoose: (food: Food) => void;
};

// The chips are named by their word alone: the count beside it is only
// shown. On a row of their own they stand as their measured parts let
// them, which the stylesheet reads from `data-arrangement`; the two rows
// they would stand in two by two are one row otherwise.
export function FoodChips({ language, choices, chosen, row, widths, onContents, onChoose }: FoodChipsProps) {
  const text = TEXTS[language];
  const group = useRef<HTMLDivElement>(null);
  const [contents, setContents] = useState<readonly ChipContent[]>([]);
  const counts = choices.map(({ food, count }) => `${food} ${count}`).join();

  // The parts keep their widths whatever the arrangement, so they are
  // measured as they stand, before the chips are first seen.
  useLayoutEffect(() => {
    const measure = () => {
      const faces = [...(group.current?.querySelectorAll(".food-chip:not([data-food='all']) .food-chip-face") ?? [])];
      const measured = faces.map((face) => {
        const part = (selector: string) => {
          const found = face.querySelector(selector);
          return found ? widths.width(found) : 0;
        };
        return { symbols: part(".food-chip-symbols"), word: part(".food-chip-word"), count: part(".food-chip-count") };
      });
      setContents(measured);
      onContents?.(measured);
    };
    measure();
    return widths.subscribe(measure);
  }, [widths, language, counts, onContents]);

  const chip = ({ food, count }: FoodChoice) => {
    const word = food === "all" ? text.everyFood : text.diets[food];
    return (
      <Button key={food} className="food-chip" data-food={food} aria-label={word} aria-pressed={food === chosen} onClick={() => onChoose(food)}>
        <span className="food-chip-face">
          <span className="food-chip-symbols" aria-hidden="true">
            {SYMBOLS[food].map((Symbol, index) => (
              <Symbol key={index} size={22} />
            ))}
          </span>
          {food !== "all" && (
            <>
              <span className="food-chip-word">{word}</span>
              <span className="food-chip-count">{count}</span>
            </>
          )}
        </span>
      </Button>
    );
  };

  return (
    <div ref={group} className="food-chips" role="group" aria-label={text.foodChoice} data-turn-part="catalogue-chips" data-arrangement={row === undefined ? undefined : chipArrangement(row, contents)}>
      <div className="food-chips-row">{choices.slice(0, FIRST_ROW).map(chip)}</div>
      <div className="food-chips-row">{choices.slice(FIRST_ROW).map(chip)}</div>
    </div>
  );
}
