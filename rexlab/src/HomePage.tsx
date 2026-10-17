import { Footprints, Globe, Lock, Monitor, Moon, Ruler, Scale, Sun, Trophy, Utensils, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { ParentMenu } from "./ParentMenu.tsx";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { usePointerState } from "./usePointerState.ts";

const THEME_SYMBOLS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

// The app's name, the same in every language.
const BRAND = "RexLab";

// The games still to come, each shown locked by the symbol of what it
// will ask about.
export type LockedGame = "taller" | "diet";

const LOCKED_SYMBOLS: Record<LockedGame, LucideIcon> = { taller: Ruler, diet: Utensils };

export type HomePageProps = {
  language: Language;
  onLanguage: (language: Language) => void;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  // The pictures of the two dinosaurs facing off on the quiz card.
  faceOff: { left: string; right: string };
  // The best score of the quiz, undefined while there is none to show.
  best: number | undefined;
  // The dinosaur pictured on each locked game's tile.
  locked: Record<LockedGame, string>;
  onCompareDinosaurs: () => void;
};

type Menu = "language" | "theme";

export function HomePage({ language, onLanguage, theme, onTheme, faceOff, best, locked, onCompareDinosaurs }: HomePageProps) {
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
      <div className="strata" aria-hidden="true">
        <div className="stratum stratum-1" />
        <div className="stratum stratum-2" />
        <div className="stratum stratum-3" />
      </div>
      {/* An open menu is closed by a tap anywhere outside it, and that tap
          does nothing else: a parent closing a menu never starts a round. */}
      {openMenu && <div className="menu-backdrop" onClick={() => setOpenMenu(undefined)} />}
      <p className="wordmark">
        <span className="wordmark-mark" aria-hidden="true">
          <Footprints size={18} />
        </span>
        {BRAND}
      </p>
      {/* Both menus are for parents: small, in the soft ink and out of the
          way in the top-right corner, and only here, never during a round. */}
      <div className="parent-menus">
        <ParentMenu
          label={text.languageMenu}
          button={
            <>
              <Globe size={18} />
              <span className="parent-menu-code">{language.toUpperCase()}</span>
            </>
          }
          choices={LANGUAGES.map((option) => ({
            value: option,
            name: LANGUAGE_NAMES[option],
            lang: option,
            symbol: (
              <span className="parent-menu-choice-code" aria-hidden="true">
                {option.toUpperCase()}
              </span>
            )
          }))}
          chosen={language}
          onChoose={onLanguage}
          {...menu("language")}
        />
        <ParentMenu
          label={text.themeMenu}
          button={<ThemeSymbol size={18} />}
          choices={THEME_CHOICES.map((choice) => {
            const ChoiceSymbol = THEME_SYMBOLS[choice];
            return { value: choice, name: text.themes[choice], symbol: <ChoiceSymbol size={18} /> };
          })}
          chosen={theme}
          onChoose={onTheme}
          {...menu("theme")}
        />
      </div>
      <h1 className="greeting">{text.greeting}</h1>
      <div className="games">
        <button type="button" className="card quiz-card" aria-label={text.quizCard} onClick={onCompareDinosaurs} {...pointer}>
          <span className="face-off" role="img" aria-label={text.quizCardPicture}>
            <img className="face-off-picture face-off-left" src={faceOff.left} alt="" draggable={false} />
            <img className="face-off-picture face-off-right" src={faceOff.right} alt="" draggable={false} />
          </span>
          <span className="quiz-card-footer">
            <span className="quiz-card-symbol" aria-hidden="true">
              <Scale size={30} />
            </span>
            <span className="quiz-card-title">{text.quizCard}</span>
            {best !== undefined && (
              <span className="quiz-card-best">
                <Trophy size={22} />
                {best}
              </span>
            )}
          </span>
        </button>
        {/* Locked tiles are pictures, not buttons: a tap on one does
            nothing, and nothing on it invites one. */}
        <div className="locked-games">
          {(Object.keys(LOCKED_SYMBOLS) as LockedGame[]).map((game) => {
            const Symbol = LOCKED_SYMBOLS[game];
            return (
              <div key={game} className="locked-tile" data-game={game}>
                <img className="locked-picture" src={locked[game]} alt="" draggable={false} />
                <span className="locked-row">
                  <span className="locked-symbol">
                    <Symbol size={24} />
                  </span>
                  <Lock className="locked-lock" size={22} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
