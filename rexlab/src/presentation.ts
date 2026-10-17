import { askedNeed, NEEDS as CARE_NEEDS, suitableItems, type CareResult, type Celebration as CareCelebration, type Item, type Need, type Visit, type Visitor } from "./care/index.ts";
import type { CareCelebration as ShownCareCelebration, CareResultScreenProps } from "./CareResultScreen.tsx";
import type { CatalogueEntry, Diet } from "./catalogue.ts";
import type { CatalogueCardView } from "./CatalogueScreen.tsx";
import type { Diet as ShownDiet } from "./DietTag.tsx";
import type { DinosaurPageView } from "./DinosaurPage.tsx";
import { formatHeight, formatMass } from "./formatValue.ts";
import type { Language } from "./language/language.ts";
import { LEVELS, type Board, type Celebration as PairsCelebration, type PairsResult } from "./pairs/index.ts";
import type { PairCardView, PairsBoardScreenProps } from "./PairsBoardScreen.tsx";
import type { PairsCelebration as ShownPairsCelebration, PairsResultScreenProps } from "./PairsResultScreen.tsx";
import type { Attribute, Celebration, Option, QuestionState, RoundResult } from "./quiz/index.ts";
import type { DinosaurCardView, Prompt, QuestionScreenProps } from "./QuestionScreen.tsx";
import type { ResultScreenProps, Celebration as ShownCelebration } from "./ResultScreen.tsx";
import type { CareItem, CareNeed, NeedState, VisitView } from "./VisitScreen.tsx";

// How the app shows the quiz, the catalogue, dinosaur care and find the
// pair: the
// composition root's translation from their APIs to what each screen
// renders. A new attribute, celebration, food type, need or item fails the
// typecheck here until it is given a presentation.

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

export function presentResult({ score, total, progress, previousBest, celebration }: RoundResult): ResultView {
  return {
    score,
    total,
    best: progress?.bestScore,
    // Only a new best shows the best it beat: a first best beat none.
    beaten: celebration === "new-best" ? previousBest : undefined,
    celebration: celebration === null ? null : CELEBRATIONS[celebration]
  };
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
    score,
    total,
    best,
    // Only a new best shows the best it beat: a first best beat none.
    beaten: celebration === "new-best" ? previousBest : undefined,
    celebration: celebration === null ? null : CARE_CELEBRATIONS[celebration],
    newFriend
  };
}

export function presentFriend(visitor: Visitor, language: Language, bodyPicture: (dinosaurId: string) => string) {
  return { id: visitor.id, name: visitor.name[language], picture: bodyPicture(visitor.id) };
}

const PAIRS_CELEBRATIONS: Record<PairsCelebration, ShownPairsCelebration> = { "first-best": "first-best", "new-best": "new-best" };

export type PairsBoardView = Pick<PairsBoardScreenProps, "level" | "tries" | "rows" | "columns" | "cards">;

// A card is found once its pair is, open while turned over, and face down
// otherwise.
export function presentPairsBoard(board: Board, language: Language, bodyPicture: (dinosaurId: string) => string): PairsBoardView {
  const { rows, columns } = LEVELS[board.level];
  return {
    level: board.level,
    tries: board.tries,
    rows,
    columns,
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
    levelUp: levelUp === null ? null : { level: levelUp, rows: LEVELS[levelUp].rows, columns: LEVELS[levelUp].columns }
  };
}
