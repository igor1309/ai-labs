import type { CareResult, Celebration as CareCelebration, Item, Need, NeedState as CareNeedState, VisitState, Visitor } from "./care/index.ts";
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
import type { CareItem, CareNeed, NeedState, VisitView } from "./VisitScreen.tsx";

// How the app shows the quiz, the catalogue and dinosaur care: the
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
const NEED_STATES: Record<CareNeedState, NeedState> = { met: "met", current: "current", pending: "pending" };
const CARE_CELEBRATIONS: Record<CareCelebration, ShownCareCelebration> = { "first-best": "first-best", "new-best": "new-best" };

export function presentVisit(state: VisitState, leaving: boolean, language: Language, bodyPicture: (dinosaurId: string) => string): VisitView {
  const { visitor, needs, hearts, need, bubble, suggested, refused, reacting } = state;
  return {
    id: visitor.id,
    name: visitor.name[language],
    picture: bodyPicture(visitor.id),
    needs: needs.map((each) => ({ need: NEEDS[each.need], state: NEED_STATES[each.state] })),
    hearts,
    need: need === undefined ? undefined : NEEDS[need],
    bubble: bubble.map((shown) => (shown === "bowl" ? "bowl" : ITEMS[shown])),
    suggested: suggested.map((item) => ITEMS[item]),
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
