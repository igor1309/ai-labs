import { BookOpen, Copy, Footprints, Globe, Heart, Monitor, Moon, Scale, Star, Sun, Trophy, type LucideIcon } from "lucide-react";
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
  // The pictures of the two dinosaurs facing off on the quiz card.
  faceOff: { left: string; right: string };
  // The best score of the quiz, undefined while there is none to show.
  best: number | undefined;
  // The catalogue's tile: the picture on it and how many dinosaurs it
  // holds.
  catalogue: { picture: string; count: number };
  // Dinosaur care's tile: the picture on it and its best score,
  // undefined while there is none to show.
  care: { picture: string; best: number | undefined };
  // Find the pair's tile: the dinosaur on its cards and the stars earned,
  // undefined until a board is finished.
  pairs: { picture: string; stars: number | undefined };
  onCompareDinosaurs: () => void;
  onCatalogue: () => void;
  onCare: () => void;
  onPairs: () => void;
};

type Menu = "language" | "theme";

export function HomePage({ language, onLanguage, theme, onTheme, faceOff, best, catalogue, care, pairs, onCompareDinosaurs, onCatalogue, onCare, onPairs }: HomePageProps) {
  const text = TEXTS[language];
  const pointer = usePointerState();
  const cataloguePointer = usePointerState();
  const carePointer = usePointerState();
  const pairsPointer = usePointerState();
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
          </span>
          {/* The best score sits in the card's corner, over the face-off:
              beside the title it would not fit the card's column. */}
          {best !== undefined && (
            <span className="quiz-card-best">
              <Trophy size={22} />
              {best}
            </span>
          )}
        </button>
        <div className="side-games">
          <button type="button" className="card catalogue-tile" aria-label={text.catalogueTile} onClick={onCatalogue} {...cataloguePointer}>
            <img className="catalogue-tile-picture" src={catalogue.picture} alt="" draggable={false} />
            <span className="catalogue-tile-row">
              <span className="catalogue-tile-symbol" aria-hidden="true">
                <BookOpen size={20} />
              </span>
              <span className="catalogue-tile-title">{text.catalogueTile}</span>
            </span>
            {/* The counts sit in the tiles' corners, over the pictures: the
                rows keep their width for the titles. */}
            <span className="catalogue-tile-count">
              <Footprints size={18} aria-hidden="true" />
              {catalogue.count}
            </span>
          </button>
          <button type="button" className="card care-tile" aria-label={text.care} onClick={onCare} {...carePointer}>
            <img className="care-tile-picture" src={care.picture} alt="" draggable={false} />
            <span className="care-tile-row">
              <span className="care-tile-symbol" aria-hidden="true">
                <Heart size={20} />
              </span>
              <span className="care-tile-title">{text.care}</span>
            </span>
            {care.best !== undefined && (
              <span className="care-tile-best">
                <Trophy size={18} aria-hidden="true" />
                {care.best}
              </span>
            )}
          </button>
        </div>
        {/* Find the pair's tile takes the third column: a pair of cards and
            a face-down one over its symbol and its title, which may take
            two lines there. */}
        <button type="button" className="card pairs-tile" aria-label={text.pairs} onClick={onPairs} {...pairsPointer}>
          <span className="pairs-tile-art" aria-hidden="true">
            <span className="pairs-tile-card pairs-tile-card-first">
              <img className="pairs-tile-picture" src={pairs.picture} alt="" draggable={false} />
            </span>
            <span className="pairs-tile-card pairs-tile-back">
              <Footprints size={44} />
            </span>
            <span className="pairs-tile-card pairs-tile-card-second">
              <img className="pairs-tile-picture" src={pairs.picture} alt="" draggable={false} />
            </span>
          </span>
          <span className="pairs-tile-row">
            <span className="pairs-tile-symbol" aria-hidden="true">
              <Copy size={24} />
            </span>
            <span className="pairs-tile-title">{text.pairs}</span>
          </span>
          {pairs.stars !== undefined && (
            <span className="pairs-tile-stars">
              <Star size={18} aria-hidden="true" />
              {pairs.stars}
            </span>
          )}
        </button>
      </div>
    </main>
  );
}
