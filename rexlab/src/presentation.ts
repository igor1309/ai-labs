import { askedNeed, NEEDS as CARE_NEEDS, suitableItems, type CareResult, type Celebration as CareCelebration, type Item, type Need, type Visit, type Visitor } from "./care/index.ts";
import type { CareCelebration as ShownCareCelebration, CareResultScreenProps } from "./CareResultScreen.tsx";
import type { CatalogueEntry, Diet } from "./catalogue.ts";
import type { CatalogueCardView } from "./CatalogueScreen.tsx";
import type { Diet as ShownDiet } from "./DietTag.tsx";
import type { DinosaurPageView } from "./DinosaurPage.tsx";
import { formatHeight, formatMass } from "./formatValue.ts";
import type { Language } from "./language/language.ts";
import type { Attribute, Celebration, Option, QuestionState, RoundResult } from "./quiz/index.ts";
import type { DinosaurCardView, Prompt, QuestionScreenProps } from "./QuestionScreen.tsx";
import type { ResultScreenProps, Celebration as ShownCelebration } from "./ResultScreen.tsx";
import type { BoardState, CardState, Basket as SortBasket, Celebration as SortingCelebration, SortingResult } from "./sorting/index.ts";
import type { Basket as ShownBasket, SortScreenProps } from "./SortScreen.tsx";
import type { CareItem, CareNeed, NeedState, VisitView } from "./VisitScreen.tsx";

// How the app shows the quiz, the catalogue, dinosaur care and the
// sorting game: the composition root's translation from their APIs to what
// each screen renders. A new attribute, celebration, food type, need, item
// or basket fails the typecheck here until it is given a presentation.

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

export function presentCatalogueCard(entry: CatalogueEntry, language: Language, bodyPicture: (dinosaurId: string) => string): CatalogueCardView {
  return {
    id: entry.id,
    name: entry.name[language],
    picture: bodyPicture(entry.id),
    height: formatHeight(entry.height, language),
    mass: formatMass(entry.mass, language),
    diet: DIETS[entry.diet]
  };
}

export function presentDinosaurPage(entry: CatalogueEntry, language: Language, bodyPicture: (dinosaurId: string) => string): DinosaurPageView {
  return { ...presentCatalogueCard(entry, language, bodyPicture), description: entry.description[language] };
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
