import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomePage, type HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { SHIPPED_CATALOGUE, fakeBodyPicture, fakeSkeletonPicture } from "./support.ts";

// Every game the home page offers, in its tiles' order, with the text
// that names it.
export const HOME_GAMES: Array<[HomeGame, "quizCard" | "catalogueTile" | "care" | "sort" | "pairs" | "skeletons"]> = [
  ["compare", "quizCard"],
  ["catalogue", "catalogueTile"],
  ["care", "care"],
  ["sort", "sort"],
  ["pairs", "pairs"],
  ["skeletons", "skeletons"]
];

const nothing = () => {};

// The home page alone, featuring `featured`, with every game's badge
// filled in when `scored` and every one that can be empty left empty
// when not; each game's opening counted in `opened`.
export function renderHomePageFeaturing(featured: HomeGame, { language = "en", scored = true }: { language?: Language; scored?: boolean } = {}) {
  const opened: HomeGame[] = [];
  const score = (value: number) => (scored ? value : undefined);
  const view = render(
    <HomePage
      language={language}
      onLanguage={nothing}
      theme="light"
      onTheme={nothing}
      featured={featured}
      faceOff={{ left: fakeBodyPicture("tyrannosaurus"), right: fakeBodyPicture("brachiosaurus") }}
      best={score(7)}
      catalogue={{ picture: fakeBodyPicture("stegosaurus"), count: SHIPPED_CATALOGUE.length }}
      care={{ picture: fakeBodyPicture("parasaurolophus"), best: score(8) }}
      sort={{ picture: fakeBodyPicture("triceratops"), best: score(6) }}
      pairs={{ picture: fakeBodyPicture("stegosaurus"), stars: score(120) }}
      skeletons={{ picture: fakeSkeletonPicture("triceratops", "skeleton"), best: score(3) }}
      moreComing={fakeBodyPicture("triceratops")}
      onCompareDinosaurs={() => opened.push("compare")}
      onCatalogue={() => opened.push("catalogue")}
      onCare={() => opened.push("care")}
      onSort={() => opened.push("sort")}
      onPairs={() => opened.push("pairs")}
      onSkeletons={() => opened.push("skeletons")}
    />
  );
  return { user: userEvent.setup(), opened, unmount: view.unmount };
}

// The parts of a tile or the large card: its symbol's square, the row or
// footer its name stands in, and the badge in its corner.
export const symbolSquareOf = (card: Element) => card.querySelector('[class$="-tile-symbol"], .featured-card-symbol');
export const nameRowOf = (card: Element) => card.querySelector('[class$="-tile-row"], .featured-card-footer');
export const badgeOf = (card: Element) =>
  card.querySelector(".compare-tile-best, .catalogue-tile-count, .care-tile-best, .sort-tile-best, .pairs-tile-stars, .skeletons-tile-best, .featured-card-badge");
