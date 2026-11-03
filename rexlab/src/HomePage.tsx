import { Route, Bone, BookOpen, Brush, Compass, Egg, Pickaxe, Copy, Footprints, Heart, Landmark, Lock, Monitor, Moon, Palette, Pencil, Play, Puzzle, Scale, Shapes, Star, Sun, Sparkles, TriangleAlert, Trophy, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { HomeMotion } from "./homeMotion.ts";
import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import { LANGUAGE_FLAGS, LANGUAGE_NAMES, LANGUAGES, type Language } from "./language/language.ts";
import { SandWritingPicture } from "./SandWritingPicture.tsx";
import { LanguageFlag } from "./LanguageFlag.tsx";
import { TEXTS } from "./language/texts.ts";
import { ParentMenu, type ParentMenuProps } from "./ParentMenu.tsx";
import { Picture } from "./Picture.tsx";
import { THEME_CHOICES, type ThemeChoice } from "./theme.ts";

const THEME_SYMBOLS: Record<ThemeChoice, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };
// The age level menu's button shows the chosen level as a line symbol.
const LEVEL_SYMBOLS: Record<AgeLevel, LucideIcon> = { hatchling: Egg, explorer: Compass, paleontologist: Pickaxe };

// The app's name, the same in every language.
const BRAND = "RexLab";

// The games the home page offers, each on a tile of its own.
export type HomeGame = "compare" | "catalogue" | "care" | "sort" | "pairs" | "skeletons" | "dig" | "sandWriting" | "labyrinth" | "picturePuzzle" | "whoseJaw" | "coloring";

// The games in their tiles' order, which never changes.
export const HOME_GAMES: readonly HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting", "labyrinth", "picturePuzzle", "whoseJaw", "coloring"];

// The featured card's progress or catalogue count beside its symbol.
type Badge = { symbol: LucideIcon; value: number | string };

export type HomePageProps = {
  motion: HomeMotion;
  newGames: readonly string[];
  version: string;
  language: Language;
  onLanguage: (language: Language) => void;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  ageLevel: AgeLevel;
  onAgeLevel: (level: AgeLevel) => void;
  // Times each menu's way out.
  startTimer: ParentMenuProps<string>["startTimer"];
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
  // The jaw stands in the sky when the game is today's; its dinosaur stands on the tile.
  whoseJaw?: { picture: string; jaw: string; collected: number; total: number; onOpen: () => void } | undefined;
  coloring?: { picture: string; page: string; completed: number | null | undefined; onOpen: () => void } | undefined;
  picturePuzzle?: { picture: string; collected: number; onOpen: () => void } | undefined;
  // The dinosaur whose shape stands on the tile of the games still to
  // come.
  labyrinth: { picture: string; stars: number | undefined };
  moreComing: string;
  // How many tiles share a row; each row is its own layer of earth.
  tilesPerLayer: number;
  onCompareDinosaurs: () => void;
  onCatalogue: () => void;
  onCare: () => void;
  onSort: () => void;
  onPairs: () => void;
  onSkeletons: () => void;
  // The skeleton game's museum, opened straight from the home page.
  onMuseum: () => void;
  onDig: () => void;
  // Sand writing's tile picture.
  sandWritingPicture: string;
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
  motion,
  newGames,
  version,
  language,
  onLanguage,
  theme,
  onTheme,
  ageLevel,
  onAgeLevel,
  startTimer,
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
  sandWritingPicture,
  onSandWriting,
  onLabyrinth,
  tilesPerLayer
}: HomePageProps) {
  const page = useRef<HTMLElement>(null);
  useLayoutEffect(() => motion(page.current!), [motion]);
  // The browser shows the page's own colour past the ground: the bedrock.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("home-page");
    return () => root.classList.remove("home-page");
  }, []);
  const text = TEXTS[language];
  const [openMenu, setOpenMenu] = useState<Menu>();
  const menu = (name: Menu) => ({
    open: openMenu === name,
    onOpen: () => setOpenMenu(name),
    onClose: () => setOpenMenu(undefined),
    startTimer
  });
  const ThemeSymbol = THEME_SYMBOLS[theme];
  const LevelSymbol = LEVEL_SYMBOLS[ageLevel];
  // Both doors share artwork and navigation; rewards belong to the hero.
  type GameEntry = { name: string; symbol: LucideIcon; picture: ReactNode; skyPicture?: ReactNode; badge: Badge | undefined; onOpen: () => void };
  const games: Record<Exclude<HomeGame, "picturePuzzle" | "whoseJaw" | "coloring">, GameEntry> & { picturePuzzle: GameEntry | undefined; whoseJaw: GameEntry | undefined; coloring: GameEntry | undefined } = {
    compare: {
      name: text.quizCard,
      symbol: Scale,
      picture: <FaceOff label={text.quizCardPicture} {...faceOff} />,
      badge: best === undefined ? undefined : { symbol: Trophy, value: best },
      onOpen: onCompareDinosaurs
    },
    catalogue: {
      name: text.catalogue,
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
      picture: <Picture className="pairs-dino-picture" src={pairs.picture} alt="" width={800} height={600} />,
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
      picture: <Picture className="dig-fossil-picture" src={dig.picture} alt="" width={800} height={600} />,
      badge: dig.dugUp === undefined ? undefined : { symbol: Star, value: dig.dugUp },
      onOpen: onDig
    },
    coloring: coloring && {
      name: text.coloring, symbol: Palette,
      picture: <Picture className="coloring-tile-picture" src={coloring.picture} alt="" width={800} height={600} />,
      skyPicture: <Picture className="coloring-sky-picture" src={coloring.page} alt="" width={1104} height={744} />,
      badge: coloring.completed === undefined ? undefined : coloring.completed === null ? { symbol: TriangleAlert, value: "?" } : { symbol: Star, value: coloring.completed },
      onOpen: coloring.onOpen
    },
    whoseJaw: whoseJaw && {
      name: text.whoseJaw, symbol: Landmark,
      picture: <Picture className="whose-jaw-tile-picture" src={whoseJaw.picture} alt="" width={600} height={450} />,
      skyPicture: <Picture className="whose-jaw-sky-picture" src={whoseJaw.jaw} alt="" width={600} height={450} />,
      badge: { symbol: Landmark, value: `${whoseJaw.collected}/${whoseJaw.total}` }, onOpen: whoseJaw.onOpen
    },
    picturePuzzle: picturePuzzle && {
      name: text.picturePuzzle,
      symbol: Puzzle,
      picture: <Picture className="picture-puzzle-tile-picture" src={picturePuzzle.picture} alt="" width={800} height={600} />,
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
      picture: <Picture className="sand-writing-tile-picture" src={sandWritingPicture} alt="" width={800} height={600} />,
      skyPicture: <SandWritingPicture />,
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
      <Button key={game} className={`card home-ground-tile ${prefix}-tile`} data-turn-part={`tile-${game}`} aria-label={labels[game]} onClick={entry.onOpen}>
        <span className="home-tile-pocket">{entry.picture}</span>
        {newGames.includes(game) && <span className="home-new" role="img" aria-label={text.homeNew}><Sparkles size={14} aria-hidden="true" /></span>}
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
  const today = games[featuredGame] ?? games.compare;
  const FeaturedSymbol = today.symbol;
  const moreComingTile = (
    <div key="moreComing" className="more-coming home-ground-tile" data-turn-part="more-coming" role="img" aria-label={labels.moreComing}>
      <span className="home-tile-pocket"><Picture className="more-coming-picture" src={moreComing} alt="" width={800} height={600} /></span>
      <span className="more-coming-row home-tile-footer" aria-hidden="true">
        <span className="home-tile-symbol" aria-hidden="true"><Lock size={18} /></span>
        <span className="more-coming-title home-tile-title">{labels.moreComing}</span>
      </span>
    </div>
  );
  return (
    <main ref={page} className="home home-dig-site">
      <header className="home-header">
        <p className="wordmark" data-turn-part="wordmark">
          <span className="wordmark-mark" aria-hidden="true" />
          <span className="home-brand-name">{BRAND}</span>
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
            <Landmark size={18} aria-hidden="true" />
            <span className="home-museum-word">{text.museum}</span>
          </Button>
          {/* The menus are for parents: small, in the soft ink and out of the
              way in the top-right corner, and only here, never during a round. */}
          <div className="parent-menus">
            <ParentMenu
              label={text.languageMenu}
              button={<LanguageFlag language={language} />}
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
              button={<ThemeSymbol size={24} />}
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
              button={<LevelSymbol size={24} aria-hidden="true" />}
              choices={AGE_LEVELS.map((level) => {
                const ChoiceSymbol = LEVEL_SYMBOLS[level];
                return { value: level, name: text.ageLevels[level].name, note: text.ageLevels[level].age, symbol: <ChoiceSymbol size={18} /> };
              })}
              chosen={ageLevel}
              onChoose={onAgeLevel}
              {...menu("ageLevel")}
            />
          </div>
        </div>
      </header>
      <section className="home-sky" aria-label={text.today}>
        <div className="home-sky-body" aria-hidden="true"><span /></div>
        <Button
          className="featured-card"
          data-game={featuredGame}
          data-turn-part="featured-card"
          aria-label={today.name}
          onClick={today.onOpen}
        >
          <span className="home-today-copy">
            <span className="featured-card-footer">
              <span className="featured-card-symbol" aria-hidden="true">
                {featuredGame === "whoseJaw" ? <Tooth /> : <FeaturedSymbol size={36} />}
              </span>
              <span className="featured-card-title" style={{ "--title-chars": today.name.length } as CSSProperties}>{today.name}</span>
            </span>
            <span className="home-today-actions">
              <span className="home-play"><Play aria-hidden="true" />{text.play}</span>
              {today.badge && <span className="home-today-progress">
                <BadgeChip badge={today.badge} className="featured-card-badge" size={18} />
                {featuredGame === "compare" && <span className="home-progress-total">/ 10</span>}
              </span>}
            </span>
          </span>
          <span className="home-today-art">{today.skyPicture ?? today.picture}</span>
        </Button>
        <svg className="home-sky-wave" viewBox="0 0 1440 30" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 10q60-10 120 0t120 0q60 10 120 0t120 0q60-10 120 0t120 0q60 10 120 0t120 0q60-10 120 0t120 0q60 10 120 0t120 0l0 20-1440 0z" />
        </svg>
      </section>
      <div className="home-ground games-tiles">
        {layersOf([...shown, "moreComing" as const], tilesPerLayer).map((layer, index) => (
          <div className="home-layer" data-depth={index % 2 + 1} key={index}>
            {index > 0 && <EarthEdge />}
            <div className="tiles-grid" style={{ "--tiles-per-layer": tilesPerLayer } as CSSProperties}>
              {layer.map((game) => game === "moreComing" ? moreComingTile : tiles[game])}
            </div>
          </div>
        ))}
      </div>
      <footer className="home-bedrock">
        <EarthEdge />
        <p className="home-parent-note">{text.homeParentNote}</p>
        <span className="home-version" aria-label={text.versionLabel}>{version}</span>
      </footer>
    </main>
  );
}

// The tiles, a layer of earth to each row.
function layersOf<Tile>(tiles: readonly Tile[], perLayer: number): Tile[][] {
  return Array.from({ length: Math.ceil(tiles.length / perLayer) }, (_, at) => tiles.slice(at * perLayer, (at + 1) * perLayer));
}

function EarthEdge() {
  return <svg className="home-earth-wave" viewBox="0 0 1440 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 10q60-10 120 0t120 0q60 10 120 0t120 0q60-10 120 0t120 0q60 10 120 0t120 0q60-10 120 0t120 0q60 10 120 0t120 0l0 20-1440 0z" />
  </svg>;
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
