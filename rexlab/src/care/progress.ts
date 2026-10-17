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

// The progress care goes by while the app is open. When stored progress
// cannot be read there is no best to compare with, but friends made meanwhile
// are still kept.
export type KeptCare = { progress: CareProgress; readable: boolean };

export type Celebration = "first-best" | "new-best";

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

// A finished visit is compared with the highest score so far, never with
// the last one, and makes its visitor a friend once. `order` is the
// dinosaur list's ids: friends are kept in its order, and a friend no
// longer in it is kept after them, untouched.
export function finishVisit(kept: KeptCare, visit: Visit, order: readonly string[]): { result: CareResult; kept: KeptCare } {
  const { bestScore, visitsFinished, friends } = kept.progress;
  const score = visit.hearts;
  const id = visit.visitor.id;
  const befriended = new Set([...friends, id]);
  const progress: CareProgress = {
    bestScore: bestScore === null ? score : Math.max(bestScore, score),
    visitsFinished: visitsFinished + 1,
    friends: [...order.filter((known) => befriended.has(known)), ...friends.filter((friend) => !order.includes(friend))]
  };
  const celebration = !kept.readable ? null : bestScore === null ? (score > 0 ? "first-best" : null) : score > bestScore ? "new-best" : null;
  return {
    result: {
      visitor: visit.visitor,
      score,
      total: MOST_HEARTS,
      best: kept.readable ? (progress.bestScore ?? undefined) : undefined,
      previousBest: kept.readable ? (bestScore ?? undefined) : undefined,
      celebration,
      newFriend: !friends.includes(id)
    },
    kept: { progress, readable: kept.readable }
  };
}
