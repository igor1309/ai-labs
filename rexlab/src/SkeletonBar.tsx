import { Bone, House, Landmark } from "lucide-react";
import type { ReactNode } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The bar over every skeleton screen: HOME, the screen's title beside a
// bone, and MUSEUM, with anything else the screen shows in the bar after
// them.
export function SkeletonBar({
  language,
  title,
  onMuseum,
  onHome,
  children
}: {
  language: Language;
  title: string;
  onMuseum: () => void;
  onHome: () => void;
  children?: ReactNode;
}) {
  const text = TEXTS[language];
  return (
    <header className="skeleton-bar">
      <button type="button" className="home-button" onClick={onHome}>
        <House size={24} aria-hidden="true" />
        {text.home}
      </button>
      <h1 className="skeleton-title">
        <span className="skeleton-mark" aria-hidden="true">
          <Bone size={28} />
        </span>
        {title}
      </h1>
      <button type="button" className="home-button museum-button" onClick={onMuseum}>
        <Landmark size={24} aria-hidden="true" />
        {text.museum}
      </button>
      {children}
    </header>
  );
}
