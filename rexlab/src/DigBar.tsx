import { BookOpen, Brush, House } from "lucide-react";
import type { ReactNode, Ref } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The bar over every dig screen: HOME, unless the screen has its own, the
// game's title beside a brush, and anything else the screen shows in the
// bar after them.
export function DigBar({ language, title, onHome, children }: { language: Language; title?: string; onHome?: () => void; children?: ReactNode }) {
  const text = TEXTS[language];
  return (
    <header className="dig-bar">
      {onHome && (
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
      )}
      <h1 className="dig-title">
        <span className="dig-mark" aria-hidden="true">
          <Brush size={28} />
        </span>
        {title ?? text.dig}
      </h1>
      {children}
    </header>
  );
}

export type FieldGuideButtonProps = {
  language: Language;
  // The treasures found, of every kind.
  count: number;
  // A treasure has just landed: its count ticks up, with NEW! by the
  // button for the first of its kind.
  landed?: "new" | "again" | undefined;
  // Whether the count ticks up as it lands; under reduced motion it
  // simply changes.
  motion?: boolean;
  disabled?: boolean;
  // Where a treasure flies to.
  bookRef?: Ref<SVGSVGElement>;
  onFieldGuide?: (() => void) | undefined;
};

// The way to the FIELD GUIDE on DIG's bar: the book and the count of
// treasures found, read out by its name alone.
export function FieldGuideButton({ language, count, landed, motion = false, disabled, bookRef, onFieldGuide }: FieldGuideButtonProps) {
  const text = TEXTS[language];
  return (
    <span className="dig-field-guide">
      <button type="button" className="dig-field-guide-button" aria-label={text.fieldGuide} disabled={disabled} onClick={onFieldGuide}
        data-landed={landed !== undefined || undefined} data-motion={motion || undefined}>
        <BookOpen ref={bookRef} size={26} aria-hidden="true" />
        <span className="dig-field-guide-count">{count}</span>
      </button>
      {landed === "new" && <span className="dig-field-guide-new" aria-hidden="true">{text.treasureNew}</span>}
    </span>
  );
}
