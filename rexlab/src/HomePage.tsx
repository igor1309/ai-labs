import { Route, Bone, BookOpen, Brush, Copy, Footprints, Globe, Heart, Landmark, Lock, Monitor, Moon, Pencil, Puzzle, Scale, Shapes, Star, Sun, TriangleAlert, Trophy, type LucideIcon } from "lucide-react";
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import { Button } from "./Button.tsx";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { ParentMenu, type ParentMenuProps } from "./ParentMenu.tsx";
import { Picture } from "./Picture.tsx";
import { PicturePuzzlePicture } from "./PicturePuzzlePicture.tsx";
import { SandWritingPicture } from "./SandWritingPicture.tsx";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";
import { NARROW_ROW_START, ROW_START, SHORT_TILE_GAP, TILE_COLUMN, TILE_GAP, shortTileColumn, tileColumnWidth } from "./tileColumns.ts";
import { useKeptRow, type LayoutKeeping } from "./useKeptRow.ts";

const THEME_SYMBOLS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

// The app's name, the same in every language.
const BRAND = "RexLab";

// The games the home page offers, each on a tile of its own.
export type HomeGame = "compare" | "catalogue" | "care" | "sort" | "pairs" | "skeletons" | "dig" | "sandWriting" | "labyrinth" | "picturePuzzle" | "whoseJaw" | "coloring";

// The games in their tiles' order, which never changes.
export const HOME_GAMES: readonly HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting", "labyrinth", "picturePuzzle", "whoseJaw", "coloring"];

// What a game's tile shows in its picture's corner: a number beside its
// symbol.
type Badge = { symbol: LucideIcon; value: number | string };

// The window's width and its changes.
export type WindowWidth = {
  width(): number;
  subscribe(onChange: () => void): () => void;
};

export type HomePageProps = {
  language: Language;
  onLanguage: (language: Language) => void;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  ageLevel: AgeLevel;
  onAgeLevel: (level: AgeLevel) => void;
  // Times each menu's way out.
  startTimer: ParentMenuProps<string>["startTimer"];
  // The window, whose width the tiles' columns follow upright.
  viewport: WindowWidth;
  // Whether the window stands upright, where the tiles' columns narrow
  // with its width, and whether it is narrow too, as an iPhone upright,
  // where the page's sides are narrower, and whether it is short, as an
  // iPhone on its side, where the columns are a share of the row's width.
  upright: boolean;
  narrow?: boolean;
  short?: boolean;
  // Where the page keeps where the tiles' row was swiped to, through each
  // change of its layout.
  layoutKeeping: LayoutKeeping;
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
  // The dig game's tile: the dinosaur on it and how many dinosaurs have
  // been dug up, undefined until one has.
  dig: { picture: string; dugUp: number | undefined };
  // Its tile and featured card share the collection across all levels.
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

type Menu = "language" | "theme" | "ageLevel";

export function HomePage({
  language,
  onLanguage,
  theme,
  onTheme,
  ageLevel,
  onAgeLevel,
  startTimer,
  viewport,
  upright,
  narrow = false,
  short = false,
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
  const windowWidth = useSyncExternalStore(viewport.subscribe, viewport.width);
  const [openMenu, setOpenMenu] = useState<Menu>();
  const menu = (name: Menu) => ({
    open: openMenu === name,
    onOpen: () => setOpenMenu(name),
    onClose: () => setOpenMenu(undefined),
    startTimer
  });
  const ThemeSymbol = THEME_SYMBOLS[theme];
  // Each game's own parts, which its tile and the large card both show,
  // so the two never tell the child different things.
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
  // Each game's tile. The large card's game has none in the row, so no
  // game is on the page twice.
  const tiles: Record<HomeGame, ReactNode> = {
    compare: (
      <Button key="compare" className="card compare-tile" data-turn-part="tile-compare" aria-label={games.compare.name} onClick={games.compare.onOpen}>
        {games.compare.picture}
        <span className="compare-tile-row">
          <span className="compare-tile-symbol" aria-hidden="true">
            <Scale size={20} />
          </span>
          <span className="compare-tile-title">{games.compare.name}</span>
        </span>
        <BadgeChip badge={games.compare.badge} className="compare-tile-best" size={18} />
      </Button>
    ),
    catalogue: (
      <Button key="catalogue" className="card catalogue-tile" data-turn-part="tile-catalogue" aria-label={games.catalogue.name} onClick={games.catalogue.onOpen}>
        {games.catalogue.picture}
        {/* The book sits in the picture's other corner: beside the
            title it would leave ANCIENT REPTILES too little of the row on
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
      </Button>
    ),
    care: (
      <Button key="care" className="card care-tile" data-turn-part="tile-care" aria-label={games.care.name} onClick={games.care.onOpen}>
        {games.care.picture}
        <span className="care-tile-row">
          <span className="care-tile-symbol" aria-hidden="true">
            <Heart size={20} />
          </span>
          <span className="care-tile-title">{games.care.name}</span>
        </span>
        <BadgeChip badge={games.care.badge} className="care-tile-best" size={18} />
      </Button>
    ),
    sort: (
      <Button key="sort" className="card sort-tile" data-turn-part="tile-sort" aria-label={games.sort.name} onClick={games.sort.onOpen}>
        {games.sort.picture}
        <span className="sort-tile-row">
          <span className="sort-tile-symbol" aria-hidden="true">
            <Shapes size={20} />
          </span>
          <span className="sort-tile-title">{games.sort.name}</span>
        </span>
        <BadgeChip badge={games.sort.badge} className="sort-tile-best" size={18} />
      </Button>
    ),
    pairs: (
      <Button key="pairs" className="card pairs-tile" data-turn-part="tile-pairs" aria-label={games.pairs.name} onClick={games.pairs.onOpen}>
        {games.pairs.picture}
        <span className="pairs-tile-row">
          <span className="pairs-tile-symbol" aria-hidden="true">
            <Copy size={24} />
          </span>
          <span className="pairs-tile-title">{games.pairs.name}</span>
        </span>
        <BadgeChip badge={games.pairs.badge} className="pairs-tile-stars" size={18} />
      </Button>
    ),
    skeletons: (
      <Button key="skeletons" className="card skeletons-tile" data-turn-part="tile-skeletons" aria-label={games.skeletons.name} onClick={games.skeletons.onOpen}>
        {games.skeletons.picture}
        <span className="skeletons-tile-row">
          <span className="skeletons-tile-symbol" aria-hidden="true">
            <Bone size={20} />
          </span>
          <span className="skeletons-tile-title">{games.skeletons.name}</span>
        </span>
        <BadgeChip badge={games.skeletons.badge} className="skeletons-tile-best" size={18} />
      </Button>
    ),
    dig: (
      <Button key="dig" className="card dig-tile" data-turn-part="tile-dig" aria-label={games.dig.name} onClick={games.dig.onOpen}>
        {games.dig.picture}
        <span className="dig-tile-row">
          <span className="dig-tile-symbol" aria-hidden="true">
            <Brush size={20} />
          </span>
          <span className="dig-tile-title">{games.dig.name}</span>
        </span>
        <BadgeChip badge={games.dig.badge} className="dig-tile-count" size={18} />
      </Button>
    ),
    coloring: games.coloring && (
      <Button key="coloring" className="card coloring-tile" data-turn-part="tile-coloring" aria-label={games.coloring.name} onClick={games.coloring.onOpen}>
        {games.coloring.picture}
        <span className="coloring-tile-row"><span className="coloring-tile-symbol" aria-hidden="true"><Pencil size={20} /></span><span>{games.coloring.name}</span></span>
        <BadgeChip badge={games.coloring.badge} className="coloring-tile-count" size={18} />
      </Button>
    ),
    whoseJaw: games.whoseJaw && (
      <Button key="whoseJaw" className="card whose-jaw-tile" data-turn-part="tile-whoseJaw" aria-label={games.whoseJaw.name} onClick={games.whoseJaw.onOpen}>
        {games.whoseJaw.picture}
        <span className="whose-jaw-tile-row"><span aria-hidden="true">🦷</span><span>{games.whoseJaw.name}</span></span>
        <BadgeChip badge={games.whoseJaw.badge} className="whose-jaw-tile-count" size={18} />
      </Button>
    ),
    picturePuzzle: games.picturePuzzle && (
      <Button key="picturePuzzle" className="card picture-puzzle-tile" data-turn-part="tile-picturePuzzle" aria-label={games.picturePuzzle.name} onClick={games.picturePuzzle.onOpen}>
        {games.picturePuzzle.picture}
        <span className="picture-puzzle-tile-row">
          <span className="picture-puzzle-tile-symbol" aria-hidden="true"><Puzzle size={20} /></span>
          <span className="picture-puzzle-tile-title">{games.picturePuzzle.name}</span>
        </span>
        <BadgeChip badge={games.picturePuzzle.badge} className="picture-puzzle-tile-count" size={18} />
      </Button>
    ),
    labyrinth: (
      <Button key="labyrinth" className="card labyrinth-tile" data-turn-part="tile-labyrinth" aria-label={games.labyrinth.name} onClick={games.labyrinth.onOpen}>
        {games.labyrinth.picture}
        <span className="labyrinth-tile-row">
          <span className="labyrinth-tile-symbol" aria-hidden="true"><Route size={20} /></span>
          <span className="labyrinth-tile-title">{games.labyrinth.name}</span>
        </span>
        <BadgeChip badge={games.labyrinth.badge} className="labyrinth-tile-best" size={18} />
      </Button>
    ),
    sandWriting: (
      <Button key="sandWriting" className="card sand-writing-tile" data-turn-part="tile-sandWriting" aria-label={games.sandWriting.name} onClick={games.sandWriting.onOpen}>
        {games.sandWriting.picture}
        <span className="sand-writing-tile-row">
          <span className="sand-writing-tile-symbol" aria-hidden="true">
            <Pencil size={20} />
          </span>
          <span className="sand-writing-tile-title">{games.sandWriting.name}</span>
        </span>
      </Button>
    )
  };
  const featuredGame = (featured === "picturePuzzle" && !picturePuzzle) || (featured === "whoseJaw" && !whoseJaw) || (featured === "coloring" && !coloring) ? "compare" : featured;
  const shown = HOME_GAMES.filter((game) => game !== featuredGame && (game !== "picturePuzzle" || picturePuzzle !== undefined) && (game !== "whoseJaw" || whoseJaw !== undefined) && (game !== "coloring" || coloring !== undefined));
  // The tiles and the games still to come, in columns of two.
  const columns = Math.ceil((shown.length + 1) / 2);
  const rowStart = narrow ? NARROW_ROW_START : ROW_START;
  const column = upright ? tileColumnWidth(windowWidth, columns, rowStart) : TILE_COLUMN;
  const tilesRow = useKeptRow(layoutKeeping, short ? { column: shortTileColumn, gap: SHORT_TILE_GAP } : { column, gap: TILE_GAP });
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
          {/* The badge sits in the card's corner, over the picture, as on
              the tiles: the footer keeps its width for the name. */}
          <BadgeChip badge={today.badge} className="featured-card-badge" size={22} />
        </Button>
        {/* The other games stand in columns of two, in a fixed order, and
            scroll sideways beside the large card when they do not fit. The
            games still to come stand under the last of them. Upright,
            the columns narrow by the window's width so the next one
            peeks in, which the stylesheet cannot work out. */}
        <div
          ref={tilesRow.ref}
          className="games-tiles"
          data-turn-part="tiles"
          style={{ "--tile-column": `${tileColumnWidth(windowWidth, columns, rowStart)}px` } as CSSProperties}
          onScroll={tilesRow.onScroll}
        >
          {shown.map((game) => tiles[game])}
          {/* The games still to come are a picture, not a button: a tap on
              it does nothing, and nothing on it invites one. */}
          <div className="more-coming" data-turn-part="more-coming">
            <Picture className="more-coming-picture" src={moreComing} alt="" width={800} height={600} />
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
