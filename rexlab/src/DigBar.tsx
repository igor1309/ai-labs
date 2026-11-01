import { ArrowLeft, BookOpen, Brush, House, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { Button } from "./Button.tsx";
import { ParentMenu, type ParentMenuProps } from "./ParentMenu.tsx";
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
  const lines = twoLines(words);
  return (
    <header className="dig-bar">
      {onHome && (
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.home}</span>
        </Button>
      )}
      {onBack && (
        <Button className="home-button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.back}</span>
        </Button>
      )}
      <h1 className="dig-title">
        <span className="dig-mark" aria-hidden="true">
          <Mark size={28} />
        </span>
        <span className="dig-title-words" style={{ "--letters": words.length, "--line-letters": Math.max(...lines.map((line) => line.length)), "--lines": lines.length } as CSSProperties}>
          {words}
        </span>
      </h1>
      {children}
    </header>
  );
}

// A title split where its longer line is shortest, so where it may take
// two lines, as on a phone, it can be as large as that line allows.
export function twoLines(words: string): string[] {
  const parts = words.split(" ");
  let best = [words];
  for (let at = 1; at < parts.length; at++) {
    const lines = [parts.slice(0, at).join(" "), parts.slice(at).join(" ")];
    if (Math.max(...lines.map((line) => line.length)) < Math.max(...best.map((line) => line.length))) best = lines;
  }
  return best;
}

// The picker of DIG's two brushes, before the FIELD GUIDE: each button a
// dot, the wide brush's twice the brush's, the picked one pressed.
export function BrushPicker({ language, wide, disabled, onWide }: {
  language: Language;
  wide: boolean;
  // Once the sand is gone the picker rests until the next round.
  disabled?: boolean;
  onWide: (wide: boolean) => void;
}) {
  const text = TEXTS[language];
  return (
    <span className="dig-brush-picker">
      {[false, true].map((option) => (
        <Button key={String(option)} className="dig-brush-option" aria-label={option ? text.wideBrush : text.brush}
          aria-pressed={wide === option} disabled={disabled} onClick={() => onWide(option)}>
          <span className="dig-brush-dot" data-wide={option || undefined} aria-hidden="true" />
        </Button>
      ))}
    </span>
  );
}

// On a phone the brushes are a menu opened from the title's brush: its
// button the brush beside the picked one's dot, each choice its dot and
// its name. A tap outside closes it and does nothing else, so it never
// brushes the sand.
export function BrushMenu({ language, wide, disabled, open, onOpen, onClose, onWide, startTimer }: {
  language: Language;
  wide: boolean;
  disabled?: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onWide: (wide: boolean) => void;
  startTimer: ParentMenuProps<string>["startTimer"];
}) {
  const text = TEXTS[language];
  return (
    <span className="dig-brush-menu">
      {open && <span className="menu-backdrop" onClick={onClose} />}
      <ParentMenu
        label={text.brushMenu}
        button={
          <>
            <Brush size={24} />
            <span className="dig-brush-dot" data-wide={wide || undefined} />
          </>
        }
        choices={(["brush", "wide"] as const).map((option) => ({
          value: option,
          name: option === "wide" ? text.wideBrush : text.brush,
          symbol: (
            <span className="dig-brush-slot" aria-hidden="true">
              <span className="dig-brush-dot" data-wide={option === "wide" || undefined} />
            </span>
          )
        }))}
        chosen={wide ? "wide" : "brush"}
        open={open && !disabled}
        disabled={disabled}
        onOpen={onOpen}
        onClose={onClose}
        onChoose={(option) => onWide(option === "wide")}
        startTimer={startTimer}
      />
    </span>
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
      <Button className="dig-field-guide-button" aria-label={text.fieldGuide} disabled={disabled} onClick={onFieldGuide}
        data-landed={landed !== undefined || undefined} data-motion={motion || undefined}>
        <BookOpen ref={bookRef} size={26} aria-hidden="true" />
        <span className="dig-field-guide-count">{count}</span>
      </Button>
      {landed === "new" && <span className="dig-field-guide-new" aria-hidden="true">{text.treasureNew}</span>}
    </span>
  );
}
