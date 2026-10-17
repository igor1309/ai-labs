import { Beef, Leaf, type LucideIcon } from "lucide-react";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";

// What a dinosaur ate, as its tag shows it.
export type Diet = keyof Texts["diets"];

// Each food type by its symbols, so a child who cannot read the word
// still tells the tags apart: a dinosaur that ate both shows both.
export const DIET_SYMBOLS: Record<Diet, LucideIcon[]> = { meat: [Beef], plants: [Leaf], both: [Beef, Leaf] };

// A small tag on a catalogue card, a medium one under the name on a
// dinosaur's page.
export type DietTagSize = "small" | "medium";

const SYMBOL_SIZES: Record<DietTagSize, number> = { small: 16, medium: 22 };

// The tag's face is a layer of its own, so a colour too light for white
// words can be shaded under them.
export function DietTag({ diet, language, size }: { diet: Diet; language: Language; size: DietTagSize }) {
  return (
    <span className="diet-tag" data-diet={diet} data-size={size}>
      <span className="diet-tag-face">
        <span className="diet-tag-symbols" aria-hidden="true">
          {DIET_SYMBOLS[diet].map((Symbol, index) => (
            <Symbol key={index} size={SYMBOL_SIZES[size]} />
          ))}
        </span>
        {TEXTS[language].diets[diet]}
      </span>
    </span>
  );
}
