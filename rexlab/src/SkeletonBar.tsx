import { ArrowLeft, Bone, House, Landmark, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The bar over every skeleton screen: BACK where the screen has one, HOME,
// the screen's title beside a bone, or the screen's own symbol, and MUSEUM
// where the screen has no MUSEUM of its own, with anything else the screen
// shows in the bar after them.
export function SkeletonBar({
  language,
  title,
  Mark = Bone,
  onMuseum,
  onBack,
  onHome,
  children
}: {
  language: Language;
  title: string;
  Mark?: LucideIcon;
  onMuseum?: () => void;
  onBack?: () => void;
  onHome: () => void;
  children?: ReactNode;
}) {
  const text = TEXTS[language];
  return (
    <header className="skeleton-bar">
      {onBack && (
        <button type="button" className="home-button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          {text.back}
        </button>
      )}
      <button type="button" className="home-button" onClick={onHome}>
        <House size={24} aria-hidden="true" />
        {text.home}
      </button>
      <h1 className="skeleton-title">
        <span className="skeleton-mark" aria-hidden="true">
          <Mark size={28} />
        </span>
        <span className="skeleton-title-words" style={{ "--letters": title.length } as CSSProperties}>
          {title}
        </span>
      </h1>
      {onMuseum && (
        <button type="button" className="home-button museum-button" onClick={onMuseum}>
          <Landmark size={24} aria-hidden="true" />
          {text.museum}
        </button>
      )}
      {children}
    </header>
  );
}
