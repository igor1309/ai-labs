import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomePage, type HomeGame } from "../src/HomePage.tsx";
import type { HomeMotion } from "../src/homeMotion.ts";
import type { Language } from "../src/language/language.ts";
import { SHIPPED_CATALOGUE, fakeBodyPicture, fakeSkeletonPicture } from "./support.ts";
import { withPictures } from "./pictures.tsx";

// Every game the home page offers, in its tiles' order, with the text
// that names it.
export const HOME_GAMES: Array<[HomeGame, "quizCard" | "catalogue" | "care" | "sort" | "pairs" | "skeletons" | "dig" | "sandWriting" | "labyrinth"]> = [
  ["compare", "quizCard"],
  ["catalogue", "catalogue"],
  ["pairs", "pairs"],
  ["skeletons", "skeletons"],
  ["dig", "dig"],
  ["sort", "sort"],
  ["care", "care"],
  ["sandWriting", "sandWriting"],
  ["labyrinth", "labyrinth"]
];

const nothing = () => {};
const still: HomeMotion = () => nothing;

// The home page alone, featuring `featured`, with every game's badge
// filled in when `scored` and every one that can be empty left empty
// when not; each game's opening counted in `opened`.
export function renderHomePageFeaturing(featured: HomeGame, { language = "en", scored = true, allGames = false, best = 7, newGames = [], motion = still }: { motion?: HomeMotion; language?: Language; scored?: boolean; allGames?: boolean; best?: number; newGames?: readonly string[] } = {}) {
  const opened: HomeGame[] = [];
  const score = (value: number) => (scored ? value : undefined);
  const view = render(
    <HomePage
      motion={motion}
      tilesPerLayer={6}
      language={language}
      onLanguage={nothing}
      theme="light"
      onTheme={nothing}
      ageLevel="explorer"
      onAgeLevel={nothing}
      startTimer={() => nothing}
      newGames={newGames}
      version="v1.2.3"
      featured={featured}
      faceOff={{ left: fakeBodyPicture("tyrannosaurus"), right: fakeBodyPicture("brachiosaurus") }}
      best={score(best)}
      catalogue={{ picture: fakeBodyPicture("stegosaurus"), count: SHIPPED_CATALOGUE.length }}
      care={{ picture: fakeBodyPicture("parasaurolophus"), best: score(8) }}
      sort={{ picture: fakeBodyPicture("triceratops"), best: score(6) }}
      pairs={{ picture: fakeBodyPicture("stegosaurus"), stars: score(120) }}
      skeletons={{ picture: fakeSkeletonPicture("triceratops", "skeleton"), best: score(3) }}
      dig={{ picture: fakeBodyPicture("stegosaurus"), dugUp: score(4) }}
      labyrinth={{ picture: fakeBodyPicture("triceratops"), stars: score(9) }}
      {...(allGames && {
        coloring: { picture: fakeBodyPicture("triceratops"), page: "page.webp", completed: scored ? 4 : undefined, onOpen: () => opened.push("coloring") },
        whoseJaw: { picture: "baryonyx.webp", jaw: "jaw.webp", collected: scored ? 5 : 0, total: 16, onOpen: () => opened.push("whoseJaw") },
        picturePuzzle: { picture: fakeBodyPicture("triceratops"), collected: scored ? 2 : 0, onOpen: () => opened.push("picturePuzzle") }
      })}
      moreComing={fakeBodyPicture("triceratops")}
      onCompareDinosaurs={() => opened.push("compare")}
      onCatalogue={() => opened.push("catalogue")}
      onCare={() => opened.push("care")}
      onSort={() => opened.push("sort")}
      onPairs={() => opened.push("pairs")}
      onSkeletons={() => opened.push("skeletons")}
      onMuseum={nothing}
      onDig={() => opened.push("dig")}
      sandWritingPicture="/sand.webp"
      onSandWriting={() => opened.push("sandWriting")}
      onLabyrinth={() => opened.push("labyrinth")}
    />,
    withPictures
  );
  return { user: userEvent.setup({ delay: null }), opened, unmount: view.unmount };
}

// The parts of a tile or the large card: its symbol's square, the row or
// footer its name stands in, and the badge in its corner.
export const symbolSquareOf = (card: Element) => card.querySelector('[class$="-tile-symbol"], .featured-card-symbol');
export const nameRowOf = (card: Element) => card.querySelector('[class$="-tile-row"], .featured-card-footer');
export const badgeOf = (card: Element) =>
  card.querySelector(".compare-tile-best, .catalogue-tile-count, .care-tile-best, .sort-tile-best, .pairs-tile-stars, .skeletons-tile-best, .dig-tile-count, .labyrinth-tile-best, .featured-card-badge");
