import { Bone, BookOpen, Copy, Footprints, Globe, Heart, Lock, Monitor, Moon, Scale, Shapes, Star, Sun, Trophy, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { ParentMenu } from "./ParentMenu.tsx";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { usePointerState } from "./usePointerState.ts";

const THEME_SYMBOLS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

// The app's name, the same in every language.
const BRAND = "RexLab";

// The games the home page offers, each on a tile of its own.
export type HomeGame = "compare" | "catalogue" | "care" | "sort" | "pairs" | "skeletons";

// What a game's tile shows in its picture's corner: a number beside its
// symbol.
type Badge = { symbol: LucideIcon; value: number };

export type HomePageProps = {
  language: Language;
  onLanguage: (language: Language) => void;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  // The game the large card features today, beside its own tile.
  featured: HomeGame;
  // The pictures of the two dinosaurs facing off, the quiz's picture.
  faceOff: { left: string; right: string };
  // The best score of the quiz, undefined while there is none to show.
  best: number | undefined;
  // The catalogue's tile: the picture on it and how many dinosaurs it
  // holds.
  catalogue: { picture: string; count: number };
  // Dinosaur care's tile: the picture on it and its best score,
  // undefined while there is none to show.
  care: { picture: string; best: number | undefined };
  // The sorting game's card: the picture on it and its best score,
  // undefined while there is none to show.
  sort: { picture: string; best: number | undefined };
  // Find the pair's tile: the dinosaur on its cards and the stars earned,
  // undefined until a board is finished.
  pairs: { picture: string; stars: number | undefined };
  // The skeleton game's tile: the skeleton on it and the best collection
  // score, undefined while there is none to show.
  skeletons: { picture: string; best: number | undefined };
  // The dinosaur whose shape stands on the tile of the games still to
  // come.
  moreComing: string;
  onCompareDinosaurs: () => void;
  onCatalogue: () => void;
  onCare: () => void;
  onSort: () => void;
  onPairs: () => void;
  onSkeletons: () => void;
};

type Menu = "language" | "theme";

export function HomePage({
  language,
  onLanguage,
  theme,
  onTheme,
  featured,
  faceOff,
  best,
  catalogue,
  care,
  sort,
  pairs,
  skeletons,
  moreComing,
  onCompareDinosaurs,
  onCatalogue,
  onCare,
  onSort,
  onPairs,
  onSkeletons
}: HomePageProps) {
  const text = TEXTS[language];
  const featuredPointer = usePointerState();
  const comparePointer = usePointerState();
  const cataloguePointer = usePointerState();
  const carePointer = usePointerState();
  const sortPointer = usePointerState();
  const pairsPointer = usePointerState();
  const skeletonsPointer = usePointerState();
  const [openMenu, setOpenMenu] = useState<Menu>();
  const menu = (name: Menu) => ({
    open: openMenu === name,
    onOpen: () => setOpenMenu(name),
    onClose: () => setOpenMenu(undefined)
  });
  const ThemeSymbol = THEME_SYMBOLS[theme];
  // Each game's own parts, which its tile and the large card both show,
  // so the two never tell the child different things.
  const games: Record<HomeGame, { name: string; symbol: LucideIcon; picture: ReactNode; badge: Badge | undefined; onOpen: () => void }> = {
    compare: {
      name: text.quizCard,
      symbol: Scale,
      picture: <FaceOff label={text.quizCardPicture} {...faceOff} />,
      badge: best === undefined ? undefined : { symbol: Trophy, value: best },
      onOpen: onCompareDinosaurs
    },
    catalogue: {
      name: text.catalogueTile,
      symbol: BookOpen,
      picture: <img className="catalogue-tile-picture" src={catalogue.picture} alt="" draggable={false} />,
      badge: { symbol: Footprints, value: catalogue.count },
      onOpen: onCatalogue
    },
    care: {
      name: text.care,
      symbol: Heart,
      picture: <img className="care-tile-picture" src={care.picture} alt="" draggable={false} />,
      badge: care.best === undefined ? undefined : { symbol: Trophy, value: care.best },
      onOpen: onCare
    },
    sort: {
      name: text.sort,
      symbol: Shapes,
      picture: <img className="sort-tile-picture" src={sort.picture} alt="" draggable={false} />,
      badge: sort.best === undefined ? undefined : { symbol: Trophy, value: sort.best },
      onOpen: onSort
    },
    pairs: {
      name: text.pairs,
      symbol: Copy,
      picture: <PairsArt picture={pairs.picture} />,
      badge: pairs.stars === undefined ? undefined : { symbol: Star, value: pairs.stars },
      onOpen: onPairs
    },
    skeletons: {
      name: text.skeletons,
      symbol: Bone,
      picture: <img className="skeletons-tile-picture" src={skeletons.picture} alt="" draggable={false} />,
      badge: skeletons.best === undefined ? undefined : { symbol: Trophy, value: skeletons.best },
      onOpen: onSkeletons
    }
  };
  const today = games[featured];
  const FeaturedSymbol = today.symbol;
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
        {/* The large card is an extra door to today's game, which keeps its
            own tile in its place, so a child who cannot read finds every
            game where it was. It stays as the tiles scroll. */}
        <button
          type="button"
          className="card featured-card"
          data-game={featured}
          aria-label={today.name}
          onClick={today.onOpen}
          {...featuredPointer}
        >
          {today.picture}
          <span className="featured-card-footer">
            <span className="featured-card-symbol" aria-hidden="true">
              <FeaturedSymbol size={28} />
            </span>
            <span className="featured-card-title">{today.name}</span>
          </span>
          {/* The badge sits in the card's corner, over the picture, as on
              the tiles: the footer keeps its width for the name. */}
          <BadgeChip badge={today.badge} className="featured-card-badge" size={22} />
        </button>
        {/* Every game stands in columns of two, in a fixed order, and
            scrolls sideways beside the large card when they do not fit. */}
        <div className="games-tiles">
          <button type="button" className="card compare-tile" aria-label={games.compare.name} onClick={games.compare.onOpen} {...comparePointer}>
            {games.compare.picture}
            <span className="compare-tile-row">
              <span className="compare-tile-symbol" aria-hidden="true">
                <Scale size={20} />
              </span>
              <span className="compare-tile-title">{games.compare.name}</span>
            </span>
            <BadgeChip badge={games.compare.badge} className="compare-tile-best" size={18} />
          </button>
          <button type="button" className="card catalogue-tile" aria-label={games.catalogue.name} onClick={games.catalogue.onOpen} {...cataloguePointer}>
            {games.catalogue.picture}
            {/* The book sits in the picture's other corner: beside the
                title it would leave ALL DINOSAURS too little of the row on
                the smallest iPad. */}
            <span className="catalogue-tile-symbol" aria-hidden="true">
              <BookOpen size={20} />
            </span>
            <span className="catalogue-tile-row">
              <span className="catalogue-tile-title">{games.catalogue.name}</span>
            </span>
            {/* The counts sit in the tiles' corners, over the pictures: the
                rows keep their width for the titles. */}
            <BadgeChip badge={games.catalogue.badge} className="catalogue-tile-count" size={18} />
          </button>
          <button type="button" className="card care-tile" aria-label={games.care.name} onClick={games.care.onOpen} {...carePointer}>
            {games.care.picture}
            <span className="care-tile-row">
              <span className="care-tile-symbol" aria-hidden="true">
                <Heart size={20} />
              </span>
              <span className="care-tile-title">{games.care.name}</span>
            </span>
            <BadgeChip badge={games.care.badge} className="care-tile-best" size={18} />
          </button>
          <button type="button" className="card sort-tile" aria-label={games.sort.name} onClick={games.sort.onOpen} {...sortPointer}>
            {games.sort.picture}
            <span className="sort-tile-row">
              <span className="sort-tile-symbol" aria-hidden="true">
                <Shapes size={20} />
              </span>
              <span className="sort-tile-title">{games.sort.name}</span>
            </span>
            <BadgeChip badge={games.sort.badge} className="sort-tile-best" size={18} />
          </button>
          <button type="button" className="card pairs-tile" aria-label={games.pairs.name} onClick={games.pairs.onOpen} {...pairsPointer}>
            {games.pairs.picture}
            <span className="pairs-tile-row">
              <span className="pairs-tile-symbol" aria-hidden="true">
                <Copy size={24} />
              </span>
              <span className="pairs-tile-title">{games.pairs.name}</span>
            </span>
            <BadgeChip badge={games.pairs.badge} className="pairs-tile-stars" size={18} />
          </button>
          <button type="button" className="card skeletons-tile" aria-label={games.skeletons.name} onClick={games.skeletons.onOpen} {...skeletonsPointer}>
            {games.skeletons.picture}
            <span className="skeletons-tile-row">
              <span className="skeletons-tile-symbol" aria-hidden="true">
                <Bone size={20} />
              </span>
              <span className="skeletons-tile-title">{games.skeletons.name}</span>
            </span>
            <BadgeChip badge={games.skeletons.badge} className="skeletons-tile-best" size={18} />
          </button>
          {/* The games still to come are a picture, not a button: a tap on
              it does nothing, and nothing on it invites one. */}
          <div className="more-coming">
            <img className="more-coming-picture" src={moreComing} alt="" draggable={false} />
            <span className="more-coming-row">
              <Lock size={22} aria-hidden="true" />
              <span className="more-coming-title">{text.moreComing}</span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

// The quiz's picture: two dinosaurs facing off.
function FaceOff({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <span className="face-off" role="img" aria-label={label}>
      <img className="face-off-picture face-off-left" src={left} alt="" draggable={false} />
      <img className="face-off-picture face-off-right" src={right} alt="" draggable={false} />
    </span>
  );
}

// Find the pair's picture: two cards of one dinosaur with a face-down
// card between them.
function PairsArt({ picture }: { picture: string }) {
  return (
    <span className="pairs-tile-art" aria-hidden="true">
      <span className="pairs-tile-card pairs-tile-card-first">
        <img className="pairs-tile-picture" src={picture} alt="" draggable={false} />
      </span>
      <span className="pairs-tile-card pairs-tile-back">
        <Footprints size={44} />
      </span>
      <span className="pairs-tile-card pairs-tile-card-second">
        <img className="pairs-tile-picture" src={picture} alt="" draggable={false} />
      </span>
    </span>
  );
}

// A game's badge, while it has one to show.
function BadgeChip({ badge, className, size }: { badge: Badge | undefined; className: string; size: number }) {
  if (!badge) return null;
  const Symbol = badge.symbol;
  return (
    <span className={className}>
      <Symbol size={size} aria-hidden="true" />
      {badge.value}
    </span>
  );
}
