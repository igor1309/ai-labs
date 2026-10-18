import { MOST_HEARTS, type Visit, type Visitor } from "./visit.ts";

// What a child has done in care: the best score of a finished visit, null
// until one is finished, how many visits were finished, and the ids of the
// dinosaurs befriended, in the dinosaur list's order.
export type CareProgress = {
  bestScore: number | null;
  visitsFinished: number;
  friends: readonly string[];
};

export const NO_CARE: CareProgress = { bestScore: null, visitsFinished: 0, friends: [] };

export type Celebration = "first-best" | "new-best";

// The best after a visit, and what the visit celebrates.
export type Beaten = { best: number; celebration: Celebration | null };

// The best-score rule a visit is scored by, which the app gives: the best
// after a visit of `score` hearts, from the best before it, null until a
// visit is finished.
export type BeatBest = (previous: number | null, score: number) => Beaten;

// The progress care goes by while the app is open. When stored progress
// cannot be read there is no best to compare with, but friends made meanwhile
// are still kept.
export type KeptCare = { progress: CareProgress; readable: boolean };

export type CareResult = {
  visitor: Visitor;
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to show.
  best: number | undefined;
  // The best before this visit, undefined when there was none or it cannot
  // be read.
  previousBest: number | undefined;
  celebration: Celebration | null;
  // This visit made the visitor a friend; it was not one before.
  newFriend: boolean;
};

// A finished visit is scored by the best-score rule and makes its visitor
// a friend once. `order` is the dinosaur list's ids: friends are kept in
// its order, and a friend no longer in it is kept after them, untouched.
export function finishVisit(kept: KeptCare, visit: Visit, order: readonly string[], beatBest: BeatBest): { result: CareResult; kept: KeptCare } {
  const { bestScore, visitsFinished, friends } = kept.progress;
  const score = visit.hearts;
  const id = visit.visitor.id;
  const befriended = new Set([...friends, id]);
  const beaten = beatBest(bestScore, score);
  const progress: CareProgress = {
    bestScore: beaten.best,
    visitsFinished: visitsFinished + 1,
    friends: [...order.filter((known) => befriended.has(known)), ...friends.filter((friend) => !order.includes(friend))]
  };
  const celebration = kept.readable ? beaten.celebration : null;
  return {
    result: {
      visitor: visit.visitor,
      score,
      total: MOST_HEARTS,
      best: kept.readable ? beaten.best : undefined,
      previousBest: kept.readable ? (bestScore ?? undefined) : undefined,
      celebration,
      newFriend: !friends.includes(id)
    },
    kept: { progress, readable: kept.readable }
  };
}
