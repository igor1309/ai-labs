import { ArrowLeft, BookOpen, Brush, House, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode, Ref } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The bar over every dig screen: HOME, unless the screen has its own, BACK
// where the screen has one, the screen's title beside a brush, or the
// screen's own symbol, and anything else the screen shows in the bar
// after them.
export function DigBar({
  language,
  title,
  Mark = Brush,
  onHome,
  onBack,
  children
}: {
  language: Language;
  title?: string;
  Mark?: LucideIcon;
  onHome?: () => void;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const text = TEXTS[language];
  const words = title ?? text.dig;
  return (
    <header className="dig-bar">
      {onHome && (
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
      )}
      {onBack && (
        <button type="button" className="home-button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          {text.back}
        </button>
      )}
      <h1 className="dig-title">
        <span className="dig-mark" aria-hidden="true">
          <Mark size={28} />
        </span>
        <span className="dig-title-words" style={{ "--letters": words.length } as CSSProperties}>
          {words}
        </span>
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
