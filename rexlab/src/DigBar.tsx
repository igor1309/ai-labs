import { Brush, House } from "lucide-react";
import type { ReactNode } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// The bar over every dig screen: HOME, the game's title beside a brush,
// and anything else the screen shows in the bar after them.
export function DigBar({ language, onHome, children }: { language: Language; onHome: () => void; children?: ReactNode }) {
  const text = TEXTS[language];
  return (
    <header className="dig-bar">
      <button type="button" className="home-button" onClick={onHome}>
        <House size={24} aria-hidden="true" />
        {text.home}
      </button>
      <h1 className="dig-title">
        <span className="dig-mark" aria-hidden="true">
          <Brush size={28} />
        </span>
        {text.dig}
      </h1>
      {children}
    </header>
  );
}
