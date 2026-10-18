import { describe, expect, it } from "vitest";
import { transitionFor } from "../src/App.tsx";
import { beatBest } from "../src/bestScore.ts";
import { finishVisit, give, NO_CARE, startVisit } from "../src/care/index.ts";
import { transitionFor as careTransitionFor } from "../src/careGame.tsx";
import { stepFrom, type Step } from "../src/catalogue.ts";
import { NEXT_DINOSAUR, PREVIOUS_DINOSAUR } from "../src/DinosaurPage.tsx";
import { dealBoard, finishBoard as finishPairs, NO_PAIRS, turn } from "../src/pairs/index.ts";
import { transitionFor as pairsTransitionFor } from "../src/pairsGame.tsx";
import { NEXT_QUESTION } from "../src/QuestionScreen.tsx";
import { choose, finishPlay, next, startRound } from "../src/quiz/index.ts";
import { SCREEN_CHANGE } from "../src/screens.ts";
import { CLOSE_DINOSAUR, OPEN_DINOSAUR } from "../src/SharedPicture.tsx";
import { finishSkeleton, openCollection, PIECES, startPuzzle, wait } from "../src/skeletons/index.ts";
import { transitionFor as skeletonTransitionFor } from "../src/skeletonGame.tsx";
import { drop, finishBoard as finishSorting, startBoard } from "../src/sorting/index.ts";
import { transitionFor as sortingTransitionFor } from "../src/sortingGame.tsx";
import { SHIPPED_DINOSAURS, SHIPPED_PALS, SHIPPED_SKELETONS, SHIPPED_SORTABLES, SHIPPED_VISITORS, seededRandom } from "./support.ts";

type AppScreen = Parameters<typeof transitionFor>[0];

const first = startRound(SHIPPED_DINOSAURS, seededRandom(1));
const firstQuestion = first.round[0];
if (!firstQuestion) throw new Error("Expected a first question");
const answered = choose(first, firstQuestion.left.id);
const question = (play = first): AppScreen => ({ kind: "question", play });

// One screen of each kind of the app's, as a change starts or ends on it.
const APP: AppScreen[] = [
  { kind: "home" },
  question(),
  { kind: "result", result: finishPlay(answered, undefined, beatBest) },
  { kind: "catalogue", returning: undefined },
  { kind: "dinosaur", index: 0 },
  { kind: "care" },
  { kind: "sorting" },
  { kind: "pairs" },
  { kind: "skeletons" }
];

// The transition each change between two kinds of the app's screen has,
// beyond the plain screen change between two kinds, and none within one.
const APP_TYPES: Partial<Record<string, string>> = {
  "catalogue dinosaur": OPEN_DINOSAUR,
  "dinosaur catalogue": CLOSE_DINOSAUR
};

const STEPS: Record<Step, string> = { next: NEXT_DINOSAUR, previous: PREVIOUS_DINOSAUR };

describe("the app's transition for each change", () => {
  it.each(APP.flatMap((from) => APP.map((to) => ({ from, to }))))("from $from.kind to $to.kind", ({ from, to }) => {
    const plain = from.kind === to.kind ? undefined : SCREEN_CHANGE;

    expect(transitionFor(from, to, undefined)).toBe(APP_TYPES[`${from.kind} ${to.kind}`] ?? plain);
  });

  it.each([
    ["an answer chosen", question(), question(answered), undefined],
    ["the next question", question(answered), question(next(answered)), NEXT_QUESTION],
    ["a food chosen", { kind: "catalogue", returning: undefined }, { kind: "catalogue", returning: undefined }, undefined],
    ["a page closed to its card", { kind: "dinosaur", index: 3 }, { kind: "catalogue", returning: "stegosaurus" }, CLOSE_DINOSAUR]
  ] satisfies Array<[string, AppScreen, AppScreen, string | undefined]>)("for %s", (_change, from, to, type) => {
    expect(transitionFor(from, to, undefined)).toBe(type);
  });

  // Every place of a catalogue of one, two and five dinosaurs, stepped
  // both ways: from the last and the first too, where a step wraps, and
  // on a catalogue of one or two, where the two places alone cannot tell
  // previous from next.
  const steps = [1, 2, 5].flatMap((total) =>
    Array.from({ length: total }, (_, at) => at).flatMap((at) => (["next", "previous"] as const).map((step) => ({ total, at, step, to: stepFrom(at, step, total) })))
  );

  it.each(steps)("slides the page $step from $at to $to of $total in the arrow's direction", ({ at, step, to }) => {
    expect(transitionFor({ kind: "dinosaur", index: at }, { kind: "dinosaur", index: to }, step)).toBe(STEPS[step]);
  });
});

// Every pair of `screens`, with the plain screen change between two kinds
// and none within one.
function plainChanges<Screen>(screens: readonly Screen[], kind: (screen: Screen) => string | undefined) {
  return screens.flatMap((from) => screens.map((to) => ({ from, to, fromKind: kind(from), toKind: kind(to), type: kind(from) === kind(to) ? undefined : SCREEN_CHANGE })));
}

describe("dinosaur care's transition for each change", () => {
  type CareScreen = Parameters<typeof careTransitionFor>[0];
  const visitor = SHIPPED_VISITORS[0];
  if (!visitor) throw new Error("Expected a visitor");
  const visit = startVisit(visitor);
  const order = SHIPPED_VISITORS.map(({ id }) => id);
  const screens: CareScreen[] = [
    { kind: "welcome" },
    { kind: "visit", visit, leaving: false },
    { kind: "result", result: finishVisit({ progress: NO_CARE, readable: true }, visit, order, beatBest).result },
    { kind: "friends" }
  ];

  it.each(plainChanges(screens, ({ kind }) => kind))("from $fromKind to $toKind", ({ from, to, type }) => {
    expect(careTransitionFor(from, to)).toBe(type);
  });

  it("changes a visit at once as its visitor reacts", () => {
    const reacting = give(visit, "plants");

    expect(careTransitionFor({ kind: "visit", visit, leaving: false }, { kind: "visit", visit: reacting, leaving: true })).toBeUndefined();
  });
});

describe("the sorting game's transition for each change", () => {
  type SortingScreen = Parameters<typeof sortingTransitionFor>[0];
  const sorting = startBoard(SHIPPED_SORTABLES, seededRandom(1));
  const screens: SortingScreen[] = [undefined, { kind: "board", sorting }, { kind: "result", result: finishSorting(sorting, undefined, beatBest) }];

  it.each(plainChanges(screens, (screen) => screen?.kind))("from $fromKind to $toKind", ({ from, to, type }) => {
    expect(sortingTransitionFor(from, to, undefined)).toBe(type);
  });

  it("changes a board at once as a card is dropped", () => {
    const card = sorting.board.cards[0];
    if (!card) throw new Error("Expected a card");

    expect(sortingTransitionFor({ kind: "board", sorting }, { kind: "board", sorting: drop(sorting, card.dinosaur.id, card.basket) }, undefined)).toBeUndefined();
  });

  it("shows a board started over the board kept from before as the plain screen change", () => {
    const next = startBoard(SHIPPED_SORTABLES, seededRandom(2), sorting);

    expect(sortingTransitionFor({ kind: "board", sorting }, { kind: "board", sorting: next }, "start")).toBe(SCREEN_CHANGE);
    expect(sortingTransitionFor(undefined, { kind: "board", sorting: next }, "start")).toBe(SCREEN_CHANGE);
  });
});

describe("find the pair's transition for each change", () => {
  type PairsScreen = Parameters<typeof pairsTransitionFor>[0];
  const board = dealBoard(SHIPPED_PALS, 1, seededRandom(1));
  const order = SHIPPED_PALS.map(({ id }) => id);
  // Every pair turned over, card by card, each with its match.
  const found = board.cards.reduce((turned, card, place) => {
    const match = board.cards.findIndex((other, at) => at > place && other.pal.id === card.pal.id);
    return match < 0 ? turned : turn(turn(turned, place), match);
  }, board);
  const screens: PairsScreen[] = [
    { kind: "welcome" },
    { kind: "board", board, finished: false },
    { kind: "result", result: finishPairs({ progress: NO_PAIRS, readable: true }, found, order).result }
  ];

  it.each(plainChanges(screens, ({ kind }) => kind))("from $fromKind to $toKind", ({ from, to, type }) => {
    expect(pairsTransitionFor(from, to)).toBe(type);
  });

  it("changes a board at once as a card turns", () => {
    expect(pairsTransitionFor({ kind: "board", board, finished: false }, { kind: "board", board: turn(board, 0), finished: false })).toBeUndefined();
  });
});

describe("the skeleton game's transition for each change", () => {
  type SkeletonScreen = Parameters<typeof skeletonTransitionFor>[0];
  const skeleton = SHIPPED_SKELETONS[0];
  if (!skeleton) throw new Error("Expected a skeleton");
  const puzzle = startPuzzle(skeleton);
  const order = SHIPPED_SKELETONS.map(({ id }) => id);
  const screens: SkeletonScreen[] = [
    { kind: "choice" },
    { kind: "puzzle", puzzle, scatter: false },
    { kind: "result", result: finishSkeleton(openCollection(undefined, order), { ...puzzle, fitted: [...PIECES] }, order, beatBest).result },
    { kind: "museum" }
  ];

  it.each(plainChanges(screens, ({ kind }) => kind))("from $fromKind to $toKind", ({ from, to, type }) => {
    expect(skeletonTransitionFor(from, to)).toBe(type);
  });

  it("changes a puzzle at once as time counts towards help", () => {
    expect(skeletonTransitionFor({ kind: "puzzle", puzzle, scatter: false }, { kind: "puzzle", puzzle: wait(puzzle, 1000), scatter: false })).toBeUndefined();
  });
});
