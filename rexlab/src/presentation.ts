import { askedNeed, NEEDS as CARE_NEEDS, suitableItems, type CareResult, type Celebration as CareCelebration, type Item, type Need, type Visit, type Visitor } from "./care/index.ts";
import type { CareCelebration as ShownCareCelebration, CareResultScreenProps } from "./CareResultScreen.tsx";
import type { CatalogueEntry, Diet } from "./catalogue.ts";
import type { CatalogueCardView } from "./CatalogueScreen.tsx";
import type { Diet as ShownDiet } from "./DietTag.tsx";
import type { DinosaurPageView } from "./DinosaurPage.tsx";
import { formatHeight, formatMass } from "./formatValue.ts";
import type { Language } from "./language/language.ts";
import { CLIMB_LEVELS, shapeOf, type Board, type Celebration as PairsCelebration, type LargeLevel, type PairsResult } from "./pairs/index.ts";
import type { PairCardView, PairsBoardScreenProps } from "./PairsBoardScreen.tsx";
import type { PairsCelebration as ShownPairsCelebration, PairsResultScreenProps } from "./PairsResultScreen.tsx";
import type { Attribute, Celebration, Option, QuestionState, RoundResult } from "./quiz/index.ts";
import type { DinosaurCardView, Prompt, QuestionScreenProps } from "./QuestionScreen.tsx";
import type { ResultScreenProps, Celebration as ShownCelebration } from "./ResultScreen.tsx";
import type { Celebration as ShownSkeletonCelebration } from "./ResultParts.tsx";
import type { SkeletonChoiceView } from "./SkeletonChoiceScreen.tsx";
import type { ShownStand, SkeletonMuseumScreenProps } from "./SkeletonMuseumScreen.tsx";
import type { ShownArea, ShownHelpStep, ShownHint, ShownRegion, SkeletonPuzzleScreenProps } from "./SkeletonPuzzleScreen.tsx";
import type { SkeletonResultScreenProps } from "./SkeletonResultScreen.tsx";
import {
  help,
  isComplete,
  strayId,
  trayOf,
  type Celebration as SkeletonCelebration,
  type Museum,
  type BodyArea,
  type HelpStep,
  type Puzzle,
  type Skeleton,
  type SkeletonResult,
  type StandState
} from "./skeletons/index.ts";
import type { BoardState, CardState, Basket as SortBasket, Celebration as SortingCelebration, SortingResult } from "./sorting/index.ts";
import type { Basket as ShownBasket, SortScreenProps } from "./SortScreen.tsx";
import type { CareItem, CareNeed, NeedState, VisitView } from "./VisitScreen.tsx";

// How the app shows the quiz, the catalogue, dinosaur care, find the pair,
// the sorting game and the skeleton game: the composition root's
// translation from their APIs to what each screen renders. A new
// attribute, celebration, food type, need, item, basket, bone piece or
// museum stand fails the typecheck here until it is given a presentation.

const PROMPTS: Record<Attribute, Prompt> = { mass: "mass", height: "height" };

const FORMATS: Record<Attribute, (value: number, language: Language) => string> = {
  mass: formatMass,
  height: formatHeight
};

const CELEBRATIONS: Record<Celebration, ShownCelebration> = { "first-best": "first-best", "new-best": "new-best" };

export type QuestionView = Pick<QuestionScreenProps, "prompt" | "number" | "total" | "left" | "right" | "answered" | "last">;

export function presentQuestion(question: QuestionState, language: Language, bodyPicture: (dinosaurId: string) => string): QuestionView {
  // Once answered, the right answer is marked whichever card was tapped,
  // so a wrong answer still shows the child which one is larger.
  const card = ({ dinosaur, value, correct, chosen }: Option): DinosaurCardView => ({
    id: dinosaur.id,
    name: dinosaur.name[language],
    picture: bodyPicture(dinosaur.id),
    value: question.answered ? FORMATS[question.attribute](value, language) : undefined,
    mark: !question.answered ? undefined : correct ? "correct" : chosen ? "wrong" : undefined,
    chosen
  });
  return {
    prompt: PROMPTS[question.attribute],
    number: question.number,
    total: question.total,
    left: card(question.left),
    right: card(question.right),
    answered: question.answered,
    last: question.last
  };
}

export type ResultView = Pick<ResultScreenProps, "score" | "total" | "best" | "beaten" | "celebration">;

// What every game's result shows of a finished round's score.
function presentScore(score: number, total: number, best: number | undefined, previousBest: number | undefined, celebration: ShownCelebration | null): ResultView {
  // Only a new best shows the best it beat: a first best beat none.
  return { score, total, best, beaten: celebration === "new-best" ? previousBest : undefined, celebration };
}

export function presentResult({ score, total, progress, previousBest, celebration }: RoundResult): ResultView {
  return presentScore(score, total, progress?.bestScore, previousBest, celebration && CELEBRATIONS[celebration]);
}

const DIETS: Record<Diet, ShownDiet> = { meat: "meat", plants: "plants", both: "both" };

// `found` is the ids of the dinosaurs found in find the pair.
export function presentCatalogueCard(
  entry: CatalogueEntry,
  language: Language,
  bodyPicture: (dinosaurId: string) => string,
  found: readonly string[]
): CatalogueCardView {
  return {
    id: entry.id,
    name: entry.name[language],
    picture: bodyPicture(entry.id),
    height: formatHeight(entry.height, language),
    mass: formatMass(entry.mass, language),
    diet: DIETS[entry.diet],
    found: found.includes(entry.id)
  };
}

export function presentDinosaurPage(
  entry: CatalogueEntry,
  language: Language,
  bodyPicture: (dinosaurId: string) => string,
  found: readonly string[]
): DinosaurPageView {
  return { ...presentCatalogueCard(entry, language, bodyPicture, found), description: entry.description[language] };
}

const ITEMS: Record<Item, CareItem> = { plants: "plants", meat: "meat", water: "water", bath: "bath", nest: "nest" };
const NEEDS: Record<Need, CareNeed> = { hungry: "hungry", thirsty: "thirsty", dirty: "dirty", tired: "tired" };
const CARE_CELEBRATIONS: Record<CareCelebration, ShownCareCelebration> = { "first-best": "first-best", "new-best": "new-best" };

// The visit screen's view of a visit. Each need, in the order asked, is
// met, asked now or still to come. The bubble pictures the need asked
// now: an empty bowl for hunger, the same for every dinosaur, so it never
// tells which food; after a refusal, what would meet the need, which the
// tray then suggests. It is empty while no need is asked.
export function presentVisit(visit: Visit, leaving: boolean, language: Language, bodyPicture: (dinosaurId: string) => string): VisitView {
  const { visitor, met, hearts, refused, reacting } = visit;
  const need = askedNeed(visit);
  const retried = refused.length > 0;
  const meeting = need === undefined ? [] : suitableItems(visitor, need).map((item) => ITEMS[item]);
  const state = (each: Need, at: number): NeedState => (at < met ? "met" : each === need ? "current" : "pending");
  return {
    id: visitor.id,
    name: visitor.name[language],
    picture: bodyPicture(visitor.id),
    needs: CARE_NEEDS.map((each, at) => ({ need: NEEDS[each], state: state(each, at) })),
    hearts,
    need: need === undefined ? undefined : NEEDS[need],
    bubble: need === "hungry" && !retried ? ["bowl"] : meeting,
    suggested: retried ? meeting : [],
    refused: refused.map((item) => ITEMS[item]),
    reacting: reacting && { ...reacting, item: ITEMS[reacting.item] },
    leaving
  };
}

export type CareResultView = Pick<CareResultScreenProps, "visitor" | "score" | "total" | "best" | "beaten" | "celebration" | "newFriend">;

export function presentCareResult(result: CareResult, language: Language, bodyPicture: (dinosaurId: string) => string): CareResultView {
  const { visitor, score, total, best, previousBest, celebration, newFriend } = result;
  return {
    visitor: { name: visitor.name[language], picture: bodyPicture(visitor.id) },
    ...presentScore(score, total, best, previousBest, celebration && CARE_CELEBRATIONS[celebration]),
    newFriend
  };
}

export function presentFriend(visitor: Visitor, language: Language, bodyPicture: (dinosaurId: string) => string) {
  return { id: visitor.id, name: visitor.name[language], picture: bodyPicture(visitor.id) };
}

const BASKETS: Record<SortBasket, ShownBasket> = {
  "two-legs": "two-legs",
  "four-legs": "four-legs",
  plants: "plants",
  meat: "meat",
  big: "big",
  small: "small",
  horns: "horns",
  "no-horns": "no-horns",
  feathers: "feathers",
  "no-feathers": "no-feathers"
};

const DROPPED = Object.fromEntries(Object.entries(BASKETS).map(([basket, shown]) => [shown, basket])) as Record<ShownBasket, SortBasket>;

// The sorting game's basket a card was dropped on, from the board's.
export function droppedOn(basket: ShownBasket): SortBasket {
  return DROPPED[basket];
}

export type BoardView = Pick<SortScreenProps, "tray" | "baskets" | "sorted" | "total" | "glow">;

// The board as the child sees it: a card on the tray carries its right
// basket's symbol from its first miss until it lands.
export function presentBoard(board: BoardState, language: Language, bodyPicture: (dinosaurId: string) => string): BoardView {
  const { cards, landed, lastMiss } = board;
  const card = ({ dinosaur }: CardState) => ({ id: dinosaur.id, name: dinosaur.name[language], picture: bodyPicture(dinosaur.id) });
  const [first, second] = board.baskets.map((basket) => ({
    basket: BASKETS[basket],
    cards: landed.filter((each) => each.basket === basket).map(card)
  }));
  if (!first || !second) throw new Error("A board has two baskets");
  return {
    tray: cards.map((each) => (each.landed ? null : { ...card(each), hint: each.missed ? BASKETS[each.basket] : undefined })),
    baskets: [first, second],
    sorted: landed.length,
    total: cards.length,
    glow: lastMiss && { basket: BASKETS[lastMiss.basket], count: lastMiss.misses }
  };
}

const SORTING_CELEBRATIONS: Record<SortingCelebration, ShownCelebration> = { "first-best": "first-best", "new-best": "new-best" };

// A finished board shows on the quiz's result screen, a star for each card.
export function presentSortingResult({ score, total, progress, previousBest, celebration }: SortingResult): ResultView {
  return presentScore(score, total, progress?.bestScore, previousBest, celebration && SORTING_CELEBRATIONS[celebration]);
}

const PAIRS_CELEBRATIONS: Record<PairsCelebration, ShownPairsCelebration> = { "first-best": "first-best", "new-best": "new-best" };

export type PairsBoardView = Pick<PairsBoardScreenProps, "climbLevel" | "tries" | "rows" | "columns" | "cardFloor" | "cards">;

// The smallest a card may be, in CSS pixels: 150 on the climb's boards, as
// find-the-pair-start.feature says, and on a larger level's board its size
// on the smallest screen of the fit table of find-the-pair-levels.feature.
const CLIMB_CARD_FLOOR = 150;
const LARGE_CARD_FLOORS: Record<LargeLevel, number> = { explorer: 130, paleontologist: 120 };

// A card is found once its pair is, open while turned over, and face down
// otherwise. Only a board of the climb shows its climb level.
export function presentPairsBoard(board: Board, language: Language, bodyPicture: (dinosaurId: string) => string): PairsBoardView {
  const { rows, columns } = shapeOf(board.level);
  return {
    climbLevel: "climbLevel" in board.level ? board.level.climbLevel : undefined,
    tries: board.tries,
    rows,
    columns,
    cardFloor: "climbLevel" in board.level ? CLIMB_CARD_FLOOR : LARGE_CARD_FLOORS[board.level.large],
    cards: board.cards.map(
      ({ pal, face }, place): PairCardView => ({
        id: pal.id,
        name: pal.name[language],
        picture: bodyPicture(pal.id),
        face,
        state: board.found.includes(pal.id) ? "found" : board.open.includes(place) ? "open" : "down"
      })
    )
  };
}

export type PairsResultView = Pick<PairsResultScreenProps, "pals" | "tries" | "stars" | "best" | "beaten" | "celebration" | "levelUp">;

export function presentPairsResult(result: PairsResult, language: Language, bodyPicture: (dinosaurId: string) => string): PairsResultView {
  const { pals, tries, stars, best, previousBest, celebration, levelUp, newlyFound } = result;
  return {
    pals: pals.map(({ id, name }) => ({ id, name: name[language], picture: bodyPicture(id), newlyFound: newlyFound.includes(id) })),
    tries,
    stars,
    best,
    // Only a new best shows the best it beat: a first best beat none.
    beaten: celebration === "new-best" ? previousBest : undefined,
    celebration: celebration === null ? null : PAIRS_CELEBRATIONS[celebration],
    levelUp: levelUp === null ? null : { level: levelUp, rows: CLIMB_LEVELS[levelUp].rows, columns: CLIMB_LEVELS[levelUp].columns }
  };
}

// Each dinosaur to build is shown by its body picture, which its skeleton
// is traced from, with its star once its skeleton is finished. `earned` is
// the ids of the dinosaurs with a star.
export function presentSkeletonChoices(
  skeletons: readonly Skeleton[],
  language: Language,
  bodyPicture: (dinosaurId: string) => string,
  earned: readonly string[]
): SkeletonChoiceView[] {
  return skeletons.map(({ id, name }) => ({ id, name: name[language], picture: bodyPicture(id), earned: earned.includes(id) }));
}

export type SkeletonPuzzleView = Pick<SkeletonPuzzleScreenProps, "name" | "outline" | "silhouette" | "frame" | "slots" | "strays" | "tray" | "told" | "hint" | "complete">;

// The pictures of a skeleton: the whole of it, "skeleton", or one of its
// pieces, by the piece's id.
export type SkeletonPicture = (dinosaurId: string, part: string) => string;

// Each body area, as the puzzle screen colours it.
const SHOWN_AREAS: Record<BodyArea, ShownArea> = { head: "head", neck: "neck", back: "back", hips: "hips", legs: "legs", tail: "tail" };

const SHOWN_STEPS: Record<HelpStep, ShownHelpStep> = { glow: "glow", region: "region", ghost: "ghost", move: "move" };

// The body region the ladder's help shows for `piece`: around every piece
// of its cut in the same body area, as fractions of the frame.
function regionOf({ skeleton, cut }: Puzzle, piece: string): ShownRegion | undefined {
  const area = cut.find(({ id }) => id === piece)?.area;
  const places = cut.filter((each) => each.area === area).map(({ place }) => place);
  if (places.length === 0) return undefined;
  const left = Math.min(...places.map(({ x }) => x));
  const top = Math.min(...places.map(({ y }) => y));
  const right = Math.max(...places.map(({ x, width }) => x + width));
  const bottom = Math.max(...places.map(({ y, height }) => y + height));
  const { width, height } = skeleton.frame;
  return { left: left / width, top: top / height, width: (right - left) / width, height: (bottom - top) / height };
}

// Each slot is placed as a fraction of the frame, so the outline and its
// pieces scale together to any board. A puzzle `coloured` by body area
// gives each slot its piece's area; one on a `silhouette` shows its
// outline as the skeleton's shape alone. Other skeletons' bones wait in
// the tray among the pieces, each its own skeleton's picture, sized as
// the pieces are.
export function presentPuzzle(
  puzzle: Puzzle,
  language: Language,
  skeletonPicture: SkeletonPicture,
  { coloured = false, silhouette = false }: { coloured?: boolean; silhouette?: boolean } = {}
): SkeletonPuzzleView {
  const { skeleton, cut, fitted, distractors, told } = puzzle;
  const { id, name, frame } = skeleton;
  return {
    name: name[language],
    outline: skeletonPicture(id, "skeleton"),
    silhouette,
    frame,
    strays: distractors.map((distractor) => ({
      piece: strayId(distractor),
      name: distractor.name[language],
      picture: skeletonPicture(distractor.skeleton, distractor.id),
      width: distractor.place.width / frame.width,
      height: distractor.place.height / frame.height
    })),
    tray: trayOf(puzzle),
    told: told?.name[language],
    slots: cut.map((piece) => {
      const { x, y, width, height } = piece.place;
      return {
        piece: piece.id,
        name: piece.name[language],
        picture: skeletonPicture(id, piece.id),
        area: coloured ? SHOWN_AREAS[piece.area] : undefined,
        left: x / frame.width,
        top: y / frame.height,
        width: width / frame.width,
        height: height / frame.height,
        fitted: fitted.includes(piece.id)
      };
    }),
    hint: hintOf(puzzle),
    complete: isComplete(puzzle)
  };
}

// Help as the screen shows it: the ladder's steps with their region.
function hintOf(puzzle: Puzzle): ShownHint | undefined {
  const shown = help(puzzle);
  if (shown === undefined) return undefined;
  return { piece: shown.piece, step: SHOWN_STEPS[shown.step], region: shown.step === "glow" ? undefined : regionOf(puzzle, shown.piece) };
}

const SKELETON_CELEBRATIONS: Record<SkeletonCelebration, ShownSkeletonCelebration> = { "first-best": "first-best", "new-best": "new-best" };

export type SkeletonResultView = Pick<
  SkeletonResultScreenProps,
  "name" | "fact" | "skeleton" | "body" | "frame" | "score" | "total" | "best" | "beaten" | "celebration" | "newStar"
>;

// A finished skeleton is revealed as its dinosaur, its body picture over
// the whole skeleton in the frame they share.
export function presentSkeletonResult(
  { skeleton, score, total, best, previousBest, celebration, newStar }: SkeletonResult,
  language: Language,
  skeletonPicture: SkeletonPicture,
  bodyPicture: (dinosaurId: string) => string
): SkeletonResultView {
  const { id, name, fact, frame } = skeleton;
  return {
    name: name[language],
    fact: fact[language],
    skeleton: skeletonPicture(id, "skeleton"),
    body: bodyPicture(id),
    frame,
    score,
    total,
    best,
    // Only a new best shows the best it beat: a first best beat none.
    beaten: celebration === "new-best" ? previousBest : undefined,
    celebration: celebration === null ? null : SKELETON_CELEBRATIONS[celebration],
    newStar
  };
}

const STANDS: Record<StandState, ShownStand> = { built: "built", rebuilding: "rebuilding", empty: "empty" };

export type SkeletonMuseumView = Pick<SkeletonMuseumScreenProps, "stands" | "score" | "total" | "best">;

// Each stand shows its whole skeleton, drawn as a silhouette while it is
// not standing there.
export function presentSkeletonMuseum({ stands, score, total, best }: Museum, language: Language, skeletonPicture: SkeletonPicture): SkeletonMuseumView {
  return {
    stands: stands.map(({ skeleton: { id, name }, state }) => ({ id, name: name[language], skeleton: skeletonPicture(id, "skeleton"), state: STANDS[state] })),
    score,
    total,
    best
  };
}
