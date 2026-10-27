import { en } from "./en.ts";
import type { Language } from "./language.ts";
import { ru } from "./ru.ts";

// Every string the app shows or reads out, in one language. Both
// dictionaries are typed by it, so a text missing from one fails the
// typecheck. Children are just learning to read, so every text for them,
// shown or read out, is written in capitals here rather than styled so.
export type Texts = {
  labyrinthResult: { title: string; earned: string; total: (stars: number) => string; again: string };
  labyrinthBoard: {
    title: string;
    hint: string;
    maze: string;
    goal: string;
    baby: string;
    parent: string;
    bringHome: string;
    tapStep: string;
    cell: (column: number, row: number) => string;
  };
  greeting: string;
  quizCard: string;
  quizCardPicture: string;
  // The language menu is for parents, so its label is in normal case.
  languageMenu: string;
  // So is the theme menu, with its label and its choices.
  themeMenu: string;
  themes: { system: string; light: string; dark: string };
  // The age level menu is for parents too, with its label and each
  // level's age, but each level's name is the children's word for it, in
  // capitals.
  ageLevelMenu: string;
  ageLevels: { hatchling: AgeLevelWords; explorer: AgeLevelWords; paleontologist: AgeLevelWords };
  // The version footer's name, read out by a screen reader, for parents
  // too.
  versionLabel: string;
  turnSideways: string;
  makeWindowWider: string;
  portraitLayoutComing: string;
  home: string;
  sandWriting: string;
  sandTipPicker: string;
  sandTip: (width: number) => string;
  sandClear: string;
  progress: string;
  // A group of creatures, dinosaurs or not, read out.
  creatures: string;
  // Between the two dinosaur cards.
  versus: string;
  prompts: { mass: string; height: string; lighter: string; shorter: string; longer: string };
  marks: { correct: string; wrong: string };
  next: string;
  seeResult: string;
  units: { grams: string; kilograms: string; tonnes: string; metres: string };
  celebrations: { "first-best": Celebrated; "new-best": Celebrated };
  stars: (score: number, total: number) => string;
  score: string;
  wellDone: string;
  bestScore: string;
  best: string;
  playAgain: string;
  // The catalogue of every creature: its title, and its home tile's,
  // short enough for a tile among many.
  catalogue: string;
  catalogueTile: string;
  diets: { meat: string; plants: string; both: string };
  // The catalogue's chips that choose the dinosaurs shown by their food,
  // and the chip that shows them all.
  foodChoice: string;
  everyFood: string;
  // What a creature's size measures: its height, wingspan or length.
  measures: { height: string; wingspan: string; length: string };
  // The groups of creatures that are not dinosaurs, named on their pages.
  groups: { "flying-reptile": string; "sea-reptile": string };
  heavy: string;
  // A dinosaur's place among those of the food chosen, such as "1 / 30".
  position: string;
  previousDinosaur: string;
  nextDinosaur: string;
  // The note under a dinosaur's facts is for parents, so it is in normal
  // case: it names the sources the facts were checked with.
  sourceNote: string;
  // Dinosaur care: its title, also on its home tile.
  care: string;
  newVisitor: string;
  friends: string;
  back: string;
  items: { plants: string; meat: string; water: string; bath: string; nest: string };
  // The four-need display, and each need read out on its symbol.
  needsLabel: string;
  needs: { hungry: string; thirsty: string; dirty: string; tired: string };
  // How a need stands, read out after its name.
  needStates: { met: string; current: string; pending: string };
  // The hearts of the visit so far.
  hearts: string;
  // The hearts a finished visit earned, such as "6 OF 8 HEARTS".
  heartsOf: (hearts: number, total: number) => string;
  newFriend: string;
  // The friend a visit made, or met again, read out on its chip.
  friend: string;
  noFriends: string;
  // The sorting game: its card on the home page.
  sort: string;
  // The sorting game's prompt over its board.
  sortPrompt: string;
  // The sorting game's baskets, each named by what its dinosaurs share.
  baskets: {
    "two-legs": string;
    "four-legs": string;
    plants: string;
    meat: string;
    big: string;
    small: string;
    horns: string;
    "no-horns": string;
    feathers: string;
    "no-feathers": string;
    // The third basket a level adds to a board.
    both: string;
    "two-or-four": string;
    "not-known-yet": string;
  };
  // The home tile of the games still to come.
  moreComing: string;
  // Find the pair: its title, also on its home tile.
  pairs: string;
  play: string;
  // The climb level reached, read out on its chip.
  level: string;
  // A game's own switch of the age level it is played at, read out on it.
  ageLevelSwitch: string;
  // The stars earned, read out on their chip.
  starsEarned: string;
  // Each two cards turned on a board, read out on their chip.
  tries: string;
  // The board's cards, and a face-down card by its place, such as "CARD 3".
  cards: string;
  card: (place: number) => string;
  // The level a finished board moved the child up to, such as "NEW LEVEL 2".
  newLevel: (level: number) => string;
  // The badge of a dinosaur found for the first time.
  newlyFound: string;
  levelOffer: { question: (level: string) => string; yes: string; notNow: string };
  // The dinosaurs found in find the pair, read out on the catalogue's
  // count and stamps.
  found: string;
  // The skeleton game: its home tile, the title over its dinosaurs to
  // build, and its museum.
  skeletons: string;
  skeletonTitle: string;
  museum: string;
  // The skeleton being built and its tray of bones.
  skeleton: string;
  bones: string;
  // The bones fitted so far, read out on their chip.
  fitted: string;
  // The line that says whose bone another dinosaur's bone in the tray
  // is, by its name, once it is dropped.
  otherBone: (name: string) => string;
  // The star a finished skeleton earns, read out on its badge, and the
  // way back to the choice of dinosaurs.
  star: string;
  buildAnother: string;
  // The mystery skeleton's tile, read out, and the question its finished
  // skeleton asks.
  mystery: string;
  whoseSkeleton: string;
  // A level badge's name.
  badges: { explorer: string; paleontologist: string };
  // The museum's stands, and a stand's ways to build its skeleton: the
  // first time, again from the start once it stands there, and on once it
  // has been knocked down.
  stands: string;
  build: string;
  rebuild: string;
  keepBuilding: string;
  // The dig game: its title, also on its home tile, the sand on its
  // board, the dinosaurs dug up, read out on their count, the mark of one
  // dug up for the first time, the way to the next round, and the trophy
  // of every dinosaur dug up, read out.
  dig: string;
  whoIsIt: string;
  digChoice: { right: string; tryAnother: string };
  sand: string;
  dugUp: string;
  dugUpNew: string;
  digAgain: string;
  allDugUp: string;
  // The FIELD GUIDE of the treasures found, read out on its button, and
  // the mark by it as the first treasure of a kind lands.
  fieldGuide: string;
  treasureNew: string;
  // The brush picker's two buttons, read out.
  brush: string;
  wideBrush: string;
  // The name of the phone's menu of brushes.
  brushMenu: string;
  // The FIELD GUIDE's page: its cards, read out, the kinds of treasure
  // found, read out on their count, and each kind's name.
  treasureCards: string;
  kindsFound: string;
  treasures: { shell: string; tooth: string; amber: string; "egg-nest": string; "golden-fossil": string };
};

// A celebration's label, read out, and its text, shown.
type Celebrated = { label: string; text: string };

// An age level's name, in capitals, and the age it suits, a parents'
// footnote in normal case.
type AgeLevelWords = { name: string; age: string };

export const TEXTS: Record<Language, Texts> = { en, ru };
