import { Brush, House } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
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
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </Button>
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
