import { Route, Bone, BookOpen, Brush, Copy, Footprints, Heart, Landmark, Lock, Monitor, Moon, Pencil, Puzzle, Scale, Shapes, Star, Sun, TriangleAlert, Trophy, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import { Button } from "./Button.tsx";
import { LANGUAGE_FLAGS, LANGUAGE_NAMES, LANGUAGES, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { ParentMenu, type ParentMenuProps } from "./ParentMenu.tsx";
import { Picture } from "./Picture.tsx";
import { PicturePuzzlePicture } from "./PicturePuzzlePicture.tsx";
import { SandWritingPicture } from "./SandWritingPicture.tsx";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { tileColumns } from "./tileColumns.ts";
import { useKeptRow, type LayoutKeeping } from "./useKeptRow.ts";

const THEME_SYMBOLS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

// The app's name, the same in every language.
const BRAND = "RexLab";

// The games the home page offers, each on a tile of its own.
export type HomeGame = "compare" | "catalogue" | "care" | "sort" | "pairs" | "skeletons" | "dig" | "sandWriting" | "labyrinth" | "picturePuzzle" | "whoseJaw" | "coloring";

// The games in their tiles' order, which never changes.
export const HOME_GAMES: readonly HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting", "labyrinth", "picturePuzzle", "whoseJaw", "coloring"];

// The featured card's progress or catalogue count beside its symbol.
type Badge = { symbol: LucideIcon; value: number | string };

export type HomePageProps = {
  language: Language;
  onLanguage: (language: Language) => void;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  ageLevel: AgeLevel;
  onAgeLevel: (level: AgeLevel) => void;
  // Times each menu's way out.
  startTimer: ParentMenuProps<string>["startTimer"];
  // Where the page keeps where the tiles' row was swiped to, through each
  // change of its layout.
  layoutKeeping: LayoutKeeping;
  // Today's featured game, whose small tile is omitted.
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
  // The dig game's tile: the dinosaur on it and how many dinosaurs have
  // been dug up, undefined until one has.
  dig: { picture: string; dugUp: number | undefined };
  // The featured card shows the collection across all levels.
  whoseJaw?: { picture: string; collected: number; total: number; onOpen: () => void } | undefined;
  coloring?: { picture: string; completed: number | null | undefined; onOpen: () => void } | undefined;
  picturePuzzle?: { picture: string; collected: number; onOpen: () => void } | undefined;
  // The dinosaur whose shape stands on the tile of the games still to
  // come.
  labyrinth: { picture: string; stars: number | undefined };
  moreComing: string;
  onCompareDinosaurs: () => void;
  onCatalogue: () => void;
  onCare: () => void;
  onSort: () => void;
  onPairs: () => void;
  onSkeletons: () => void;
  // The skeleton game's museum, opened straight from the home page.
  onMuseum: () => void;
  onDig: () => void;
  onSandWriting: () => void;
  onLabyrinth: () => void;
};

const HOME_TILE_LABELS: Record<Language, Record<HomeGame | "moreComing", string>> = {
  en: { compare: "COMPARE", catalogue: "EXPLORE", care: "CARE", sort: "SORT", pairs: "PAIRS", skeletons: "BONES", dig: "DIG", coloring: "COLOR", whoseJaw: "TEETH", picturePuzzle: "PUZZLE", labyrinth: "MAZE", sandWriting: "DRAW", moreComing: "SOON" },
  ru: { compare: "СРАВНИ", catalogue: "ЯЩЕРЫ", care: "ЗАБОТА", sort: "СОРТИРУЙ", pairs: "ПАРЫ", skeletons: "КОСТИ", dig: "КОПАЙ", coloring: "РАСКРАСЬ", whoseJaw: "ЗУБЫ", picturePuzzle: "ПАЗЛ", labyrinth: "ЛАБИРИНТ", sandWriting: "РИСУЙ", moreComing: "СКОРО" }
};

// The tooth uses the same outline stroke as the other tile symbols.
function Tooth() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5C10 2 4 2 4 7c0 3 2 4 2 7 0 3 1 6 2 6s1-7 4-7 3 7 4 7 2-3 2-6c0-3 2-4 2-7 0-5-6-5-8-2Z" /></svg>;
}

type Menu = "language" | "theme" | "ageLevel";

export function HomePage({
  language,
  onLanguage,
  theme,
  onTheme,
  ageLevel,
  onAgeLevel,
  startTimer,
  layoutKeeping,
  featured,
  faceOff,
  best,
  catalogue,
  care,
  sort,
  pairs,
  skeletons,
  dig,
  labyrinth,
  moreComing,
  picturePuzzle,
  whoseJaw,
  coloring,
  onCompareDinosaurs,
  onCatalogue,
  onCare,
  onSort,
  onPairs,
  onSkeletons,
  onMuseum,
  onDig,
  onSandWriting,
  onLabyrinth
}: HomePageProps) {
  const text = TEXTS[language];
  const [openMenu, setOpenMenu] = useState<Menu>();
  const menu = (name: Menu) => ({
    open: openMenu === name,
    onOpen: () => setOpenMenu(name),
    onClose: () => setOpenMenu(undefined),
    startTimer
  });
  const ThemeSymbol = THEME_SYMBOLS[theme];
  // Both doors share artwork and navigation; rewards belong to the hero.
  type GameEntry = { name: string; symbol: LucideIcon; picture: ReactNode; badge: Badge | undefined; onOpen: () => void };
  const games: Record<Exclude<HomeGame, "picturePuzzle" | "whoseJaw" | "coloring">, GameEntry> & { picturePuzzle: GameEntry | undefined; whoseJaw: GameEntry | undefined; coloring: GameEntry | undefined } = {
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
      picture: <Picture className="catalogue-tile-picture" src={catalogue.picture} alt="" width={800} height={600} />,
      badge: { symbol: Footprints, value: catalogue.count },
      onOpen: onCatalogue
    },
    care: {
      name: text.care,
      symbol: Heart,
      picture: <Picture className="care-tile-picture" src={care.picture} alt="" width={800} height={600} />,
      badge: care.best === undefined ? undefined : { symbol: Trophy, value: care.best },
      onOpen: onCare
    },
    sort: {
      name: text.sort,
      symbol: Shapes,
      picture: <Picture className="sort-tile-picture" src={sort.picture} alt="" width={800} height={600} />,
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
      picture: <Picture className="skeletons-tile-picture" src={skeletons.picture} alt="" width={800} height={600} />,
      badge: skeletons.best === undefined ? undefined : { symbol: Trophy, value: skeletons.best },
      onOpen: onSkeletons
    },
    dig: {
      name: text.dig,
      symbol: Brush,
      picture: <Picture className="dig-tile-picture" src={dig.picture} alt="" width={800} height={600} />,
      badge: dig.dugUp === undefined ? undefined : { symbol: Star, value: dig.dugUp },
      onOpen: onDig
    },
    coloring: coloring && {
      name: text.coloring, symbol: Pencil,
      picture: <Picture className="coloring-tile-picture" src={coloring.picture} alt="" width={800} height={600} />,
      badge: coloring.completed === undefined ? undefined : coloring.completed === null ? { symbol: TriangleAlert, value: "?" } : { symbol: Star, value: coloring.completed },
      onOpen: coloring.onOpen
    },
    whoseJaw: whoseJaw && {
      name: text.whoseJaw, symbol: Landmark,
      picture: <Picture className="whose-jaw-tile-picture" src={whoseJaw.picture} alt="" width={600} height={450} />,
      badge: { symbol: Landmark, value: `${whoseJaw.collected}/${whoseJaw.total}` }, onOpen: whoseJaw.onOpen
    },
    picturePuzzle: picturePuzzle && {
      name: text.picturePuzzle,
      symbol: Puzzle,
      picture: <span className="picture-puzzle-tile-art"><PicturePuzzlePicture src={picturePuzzle.picture} /></span>,
      badge: { symbol: Star, value: `${picturePuzzle.collected}/3` },
      onOpen: picturePuzzle.onOpen
    },
    labyrinth: {
      name: text.labyrinth,
      symbol: Route,
      picture: <Picture className="labyrinth-tile-picture" src={labyrinth.picture} alt="" width={800} height={600} />,
      badge: labyrinth.stars === undefined ? undefined : { symbol: Star, value: labyrinth.stars },
      onOpen: onLabyrinth
    },
    sandWriting: {
      name: text.sandWriting,
      symbol: Pencil,
      picture: <SandWritingPicture />,
      badge: undefined,
      onOpen: onSandWriting
    }
  };
  const labels = HOME_TILE_LABELS[language];
  const tiles = Object.fromEntries(HOME_GAMES.map((game) => {
    const entry = games[game];
    if (!entry) return [game, undefined];
    const prefix = game.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const Symbol = entry.symbol;
    return [game, (
      <Button key={game} className={`card ${prefix}-tile`} data-turn-part={`tile-${game}`} aria-label={labels[game]} onClick={entry.onOpen}>
        {entry.picture}
        <span className={`${prefix}-tile-row home-tile-footer`}>
          <span className={`${prefix}-tile-symbol home-tile-symbol`} aria-hidden="true">
            {game === "whoseJaw" ? <Tooth /> : <Symbol size={20} />}
          </span>
          <span className={`${prefix}-tile-title home-tile-title`}>{labels[game]}</span>
        </span>
      </Button>
    )];
  }));
  const featuredGame = (featured === "picturePuzzle" && !picturePuzzle) || (featured === "whoseJaw" && !whoseJaw) || (featured === "coloring" && !coloring) ? "compare" : featured;
  const shown = HOME_GAMES.filter((game) => game !== featuredGame && (game !== "picturePuzzle" || picturePuzzle !== undefined) && (game !== "whoseJaw" || whoseJaw !== undefined) && (game !== "coloring" || coloring !== undefined));
  const tilesRow = useKeptRow(layoutKeeping, tileColumns);
  const today = games[featuredGame] ?? games.compare;
  const FeaturedSymbol = today.symbol;
  // Each part both layouts share is marked, so it glides to its place in
  // the other as the window turns; a tile's name holds its game, so it
  // pairs with itself wherever it stands. The bands of rock, along the
  // bottom of a page each layout makes otherwise tall, fade in where the
  // new one puts them; upright their holder draws no box to fade.
  return (
    <main className="home">
      <div className="strata" aria-hidden="true">
        <div className="stratum stratum-1" data-turn-fade="" />
        <div className="stratum stratum-2" data-turn-fade="" />
        <div className="stratum stratum-3" data-turn-fade="" />
      </div>
      <p className="wordmark" data-turn-part="wordmark">
        <span className="wordmark-mark" aria-hidden="true" />
        <span className="narrow-hidden">{BRAND}</span>
      </p>
      {/* The corner holds the museum, for the child, beside the menus for
          parents. An open menu's backdrop is stacked here too, over the
          museum and under the menus, so a tap on the museum then only
          closes the menu. An open menu hangs in it, so it moves with its
          button as the window turns. */}
      <div className="home-corner" data-turn-part="corner">
        {/* An open menu is closed by a tap anywhere outside it, and that tap
            does nothing else: a parent closing a menu never starts a round. */}
        {openMenu && <div className="menu-backdrop" onClick={() => setOpenMenu(undefined)} />}
        <Button className="card home-museum" onClick={onMuseum}>
          <Landmark size={24} aria-hidden="true" />
          <span className="narrow-hidden">{text.museum}</span>
        </Button>
        {/* The menus are for parents: small, in the soft ink and out of the
            way in the top-right corner, and only here, never during a round. */}
        <div className="parent-menus">
          <ParentMenu
            label={text.languageMenu}
            button={<span className="language-flag" aria-hidden="true">{LANGUAGE_FLAGS[language]}</span>}
            choices={LANGUAGES.map((option) => ({
              value: option,
              name: LANGUAGE_NAMES[option],
              lang: option,
              symbol: (
                <span className="language-flag" aria-hidden="true">
                  {LANGUAGE_FLAGS[option]}
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
          <ParentMenu
            label={text.ageLevelMenu}
            button={<AgeLevelPicture level={ageLevel} />}
            choices={AGE_LEVELS.map((level) => ({
              value: level,
              name: text.ageLevels[level].name,
              note: text.ageLevels[level].age,
              symbol: <AgeLevelPicture level={level} />
            }))}
            chosen={ageLevel}
            onChoose={onAgeLevel}
            {...menu("ageLevel")}
          />
        </div>
      </div>
      <h1 className="greeting" data-turn-part="greeting">{text.greeting}</h1>
      <div className="games">
        {/* The large card is today's game's door, its tile left out of
            the row. It stays as the tiles scroll. */}
        <Button
          className="card featured-card"
          data-game={featuredGame}
          data-turn-part="featured-card"
          aria-label={today.name}
          onClick={today.onOpen}
        >
          {today.picture}
          <span className="featured-card-footer">
            <span className="featured-card-symbol" aria-hidden="true">
              <FeaturedSymbol size={28} />
            </span>
            <span className="featured-card-title">{today.name}</span>
          </span>
          {/* The badge sits in the card's corner, over the picture: the footer keeps its width for the name. */}
          <BadgeChip badge={today.badge} className="featured-card-badge" size={22} />
        </Button>
        {/* The other games stand in columns of two, in a fixed order, and
            scroll sideways beside the large card when they do not fit. The
            games still to come stand under the last of them. */}
        <div
          ref={tilesRow.ref}
          className="games-tiles"
          data-turn-part="tiles"
          onScroll={tilesRow.onScroll}
        >
          <div className="tiles-grid">
            {shown.map((game) => tiles[game])}
            {/* The games still to come are a picture, not a button: a tap on
                it does nothing, and nothing on it invites one. */}
            <div className="more-coming" data-turn-part="more-coming">
              <Picture className="more-coming-picture" src={moreComing} alt="" width={800} height={600} />
              <span className="more-coming-row home-tile-footer">
                <span className="home-tile-symbol" aria-hidden="true"><Lock size={20} /></span>
                <span className="more-coming-title home-tile-title">{labels.moreComing}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// An age level's picture, beside its name or standing for it.
function AgeLevelPicture({ level }: { level: AgeLevel }) {
  return (
    <span className="parent-menu-picture" aria-hidden="true">
      {AGE_LEVEL_PICTURES[level]}
    </span>
  );
}

// The quiz's picture: two dinosaurs facing off.
function FaceOff({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <span className="face-off" role="img" aria-label={label}>
      <Picture className="face-off-picture face-off-left" src={left} alt="" width={800} height={600} />
      <Picture className="face-off-picture face-off-right" src={right} alt="" width={800} height={600} />
    </span>
  );
}

// Find the pair's picture: two cards of one dinosaur with a face-down
// card between them.
function PairsArt({ picture }: { picture: string }) {
  return (
    <span className="pairs-tile-art" aria-hidden="true">
      <span className="pairs-tile-card pairs-tile-card-first">
        <Picture className="pairs-tile-picture" src={picture} alt="" width={800} height={600} />
      </span>
      <span className="pairs-tile-card pairs-tile-back">
        <Footprints size={44} />
      </span>
      <span className="pairs-tile-card pairs-tile-card-second">
        <Picture className="pairs-tile-picture" src={picture} alt="" width={800} height={600} />
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
