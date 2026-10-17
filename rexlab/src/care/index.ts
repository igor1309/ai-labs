// Dinosaur care's API: its use cases and the types the app speaks with it.
// Everything else under care/ is reached only through this file.
import { currentNeed, NEEDS, suitableItems, type Item, type Need, type Visit, type Visitor } from "./visit.ts";

export type { CareProgress, CareResult, Celebration, KeptCare } from "./progress.ts";
export type { Diet, Item, Need, Reaction, Random, Visit, Visitor } from "./visit.ts";
export { finishVisit, NO_CARE } from "./progress.ts";
export { give, isFinished, ITEMS, MOST_HEARTS, NEEDS, pickVisitor, settle, startVisit } from "./visit.ts";

export type NeedState = "met" | "current" | "pending";

// What the visit screen shows of a visit.
export type VisitState = {
  visitor: Visitor;
  // Each need, in the order asked, with whether it is met, asked now or
  // still to come.
  needs: ReadonlyArray<{ need: Need; state: NeedState }>;
  hearts: number;
  // The need asked now: undefined while the visitor enjoys what met the
  // last one, so the next is asked only once that reaction has played,
  // and once all four are met.
  need: Need | undefined;
  // What the need's bubble pictures: an empty bowl for hunger, the same
  // for every dinosaur, so the bubble never tells which food; after a
  // refusal, what would meet the need. Empty once every need is met.
  bubble: ReadonlyArray<Item | "bowl">;
  // The items to try after a refusal, none before one.
  suggested: readonly Item[];
  // The unsuitable items offered for the need now asked.
  refused: readonly Item[];
  reacting: Visit["reacting"];
};

export function visitState(visit: Visit): VisitState {
  const need = visit.reacting?.reaction === "happy" ? undefined : currentNeed(visit);
  const retried = visit.refused.length > 0;
  const suggested = need !== undefined && retried ? suitableItems(visit.visitor, need) : [];
  return {
    visitor: visit.visitor,
    needs: NEEDS.map((each, at) => ({ need: each, state: at < visit.met ? "met" : each === need ? "current" : "pending" })),
    hearts: visit.hearts,
    need,
    bubble: need === undefined ? [] : need === "hungry" && !retried ? ["bowl"] : suitableItems(visit.visitor, need),
    suggested,
    refused: visit.refused,
    reacting: visit.reacting
  };
}

// The visitors who are friends, in the visitors' order. A friend no
// longer among them has no card and is not counted.
export function friendsOf(friends: readonly string[], visitors: readonly Visitor[]): Visitor[] {
  return visitors.filter(({ id }) => friends.includes(id));
}
