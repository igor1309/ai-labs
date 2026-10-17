import { en } from "./en.ts";
import type { Language } from "./language.ts";
import { ru } from "./ru.ts";

// Every string the app shows or reads out, in one language. Both
// dictionaries are typed by it, so a text missing from one fails the
// typecheck. Children are just learning to read, so every text for them,
// shown or read out, is written in capitals here rather than styled so.
export type Texts = {
  greeting: string;
  quizCard: string;
  quizCardPicture: string;
  // The home page's card of the games still to come.
  moreComing: string;
  // The language menu is for parents, so its label is in normal case.
  languageMenu: string;
  // So is the theme menu, with its label and its choices.
  themeMenu: string;
  themes: { system: string; light: string; dark: string };
  turnSideways: string;
  home: string;
  progress: string;
  dinosaurs: string;
  // Between the two dinosaur cards.
  versus: string;
  prompts: { mass: string; height: string };
  marks: { correct: string; wrong: string };
  next: string;
  seeResult: string;
  units: { kilograms: string; tonnes: string; metres: string };
  celebrations: { "first-best": Celebrated; "new-best": Celebrated };
  stars: (score: number, total: number) => string;
  score: string;
  wellDone: string;
  bestScore: string;
  best: string;
  playAgain: string;
  // The catalogue of every dinosaur: its title, also on its home tile.
  catalogue: string;
  diets: { meat: string; plants: string; both: string };
  tall: string;
  heavy: string;
  // A dinosaur's place in the catalogue, such as "1 / 30".
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
  };
};

// A celebration's label, read out, and its text, shown.
type Celebrated = { label: string; text: string };

export const TEXTS: Record<Language, Texts> = { en, ru };
