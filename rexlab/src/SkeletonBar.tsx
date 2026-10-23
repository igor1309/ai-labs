import { ArrowLeft, Bone, House, Landmark, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "./Button.tsx";
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
  part,
  children
}: {
  language: Language;
  title: string;
  Mark?: LucideIcon;
  onMuseum?: () => void;
  onBack?: () => void;
  onHome: () => void;
  part?: string;
  children?: ReactNode;
}) {
  const text = TEXTS[language];
  return (
    <header className="skeleton-bar">
      {onBack && (
        <Button className="home-button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.back}</span>
        </Button>
      )}
      <Button className="home-button" onClick={onHome} data-turn-part={part && `${part}-home`}>
        <House size={24} aria-hidden="true" />
        <span className="upright-hidden">{text.home}</span>
      </Button>
      <h1 className="skeleton-title" data-turn-part={part && `${part}-title`}>
        <span className="skeleton-mark" aria-hidden="true">
          <Mark size={28} />
        </span>
        <span className="skeleton-title-words" style={{ "--letters": title.length } as CSSProperties}>
          {title}
        </span>
      </h1>
      {onMuseum && (
        <Button className="home-button museum-button" onClick={onMuseum}>
          <Landmark size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.museum}</span>
        </Button>
      )}
      {children}
    </header>
  );
}
