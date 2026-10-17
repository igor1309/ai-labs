import { BookOpen } from "lucide-react";
import { DIET_SYMBOLS, type Diet } from "./DietTag.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The dinosaurs a child chooses to see: every one, or those of one food
// type.
export type Food = "all" | Diet;

// A chip and how many dinosaurs it shows.
export type FoodChoice = { food: Food; count: number };

// Each chip by its symbols, as the tags show the food types, so a child
// who cannot read the word still picks one; every dinosaur is the
// catalogue's book.
const SYMBOLS = { all: [BookOpen], ...DIET_SYMBOLS };

export type FoodChipsProps = {
  language: Language;
  // The chips, in the order they show.
  choices: readonly FoodChoice[];
  chosen: Food;
  onChoose: (food: Food) => void;
};

// The chips are named by their word alone: the count beside it is only
// shown.
export function FoodChips({ language, choices, chosen, onChoose }: FoodChipsProps) {
  const text = TEXTS[language];
  return (
    <div className="food-chips" role="group" aria-label={text.foodChoice}>
      {choices.map(({ food, count }) => {
        const word = food === "all" ? text.everyFood : text.diets[food];
        return (
          <button key={food} type="button" className="food-chip" data-food={food} aria-label={word} aria-pressed={food === chosen} onClick={() => onChoose(food)}>
            <span className="food-chip-face">
              <span className="food-chip-symbols" aria-hidden="true">
                {SYMBOLS[food].map((Symbol, index) => (
                  <Symbol key={index} size={22} />
                ))}
              </span>
              {word}
              <span className="food-chip-count">{count}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
