import { Globe, Monitor, Moon, Scale, Sun, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { ParentMenu } from "./ParentMenu.tsx";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { usePointerState } from "./usePointerState.ts";

const THEME_SYMBOLS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

// The app's name, the same in every language.
const BRAND = "RexLab";

export type HomePageProps = {
  language: Language;
  onLanguage: (language: Language) => void;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  // The pictures of the two dinosaurs facing off on the quiz card, both
  // drawn facing left.
  faceOff: { left: string; right: string };
  onCompareDinosaurs: () => void;
};

type Menu = "language" | "theme";

export function HomePage({ language, onLanguage, theme, onTheme, faceOff, onCompareDinosaurs }: HomePageProps) {
  const text = TEXTS[language];
  const pointer = usePointerState();
  const [openMenu, setOpenMenu] = useState<Menu>();
  const menu = (name: Menu) => ({
    open: openMenu === name,
    onOpen: () => setOpenMenu(name),
    onClose: () => setOpenMenu(undefined)
  });
  const ThemeSymbol = THEME_SYMBOLS[theme];
  return (
    <main className="home">
      <div className="hill hill-back" aria-hidden="true" />
      <div className="hill hill-back-right" aria-hidden="true" />
      <div className="hill hill-front" aria-hidden="true" />
      {/* An open menu is closed by a tap anywhere outside it, and that tap
          does nothing else: a parent closing a menu never starts a round. */}
      {openMenu && <div className="menu-backdrop" onClick={() => setOpenMenu(undefined)} />}
      {/* Both menus are for parents: small, faded and out of the way in the
          top-right corner, and only here, never during a round. */}
      <div className="parent-menus">
        <ParentMenu
          label={text.themeMenu}
          button={<ThemeSymbol size={15} />}
          choices={THEME_CHOICES.map((choice) => {
            const ChoiceSymbol = THEME_SYMBOLS[choice];
            return { value: choice, name: text.themes[choice], symbol: <ChoiceSymbol size={16} /> };
          })}
          chosen={theme}
          onChoose={onTheme}
          {...menu("theme")}
        />
        <ParentMenu
          label={text.languageMenu}
          button={
            <>
              <Globe size={15} />
              <span className="parent-menu-code">{language.toUpperCase()}</span>
            </>
          }
          choices={LANGUAGES.map((option) => ({ value: option, name: LANGUAGE_NAMES[option], lang: option }))}
          chosen={language}
          onChoose={onLanguage}
          {...menu("language")}
        />
      </div>
      <button type="button" className="card quiz-card" aria-label={text.quizCard} onClick={onCompareDinosaurs} {...pointer}>
        <span className="face-off" role="img" aria-label={text.quizCardPicture}>
          {/* Both pictures face left, so the left one is turned to face the
              right one. */}
          <img className="face-off-picture face-off-left" src={faceOff.left} alt="" draggable={false} />
          <span className="face-off-badge">
            <Scale size={28} />
          </span>
          <img className="face-off-picture" src={faceOff.right} alt="" draggable={false} />
        </span>
        <span className="quiz-card-title">{text.quizCard}</span>
      </button>
      <p className="wordmark">{BRAND}</p>
    </main>
  );
}
