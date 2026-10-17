// Dinosaur care's API: its use cases and the types the app speaks with it.
// Everything else under care/ is reached only through this file.
import type { Visitor } from "./visit.ts";

export type { CareProgress, CareResult, Celebration, KeptCare } from "./progress.ts";
export type { Diet, Item, Need, Reaction, Random, Visit, Visitor } from "./visit.ts";
export { finishVisit, NO_CARE } from "./progress.ts";
export { askedNeed, give, isFinished, ITEMS, MOST_HEARTS, NEEDS, pickVisitor, settle, startVisit, suitableItems } from "./visit.ts";

// The visitors who are friends, in the visitors' order. A friend no
// longer among them has no card and is not counted.
export function friendsOf(friends: readonly string[], visitors: readonly Visitor[]): Visitor[] {
  return visitors.filter(({ id }) => friends.includes(id));
}
