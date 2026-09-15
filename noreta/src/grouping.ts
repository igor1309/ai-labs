// A group holds the records the caller handed in, so they come back as whatever
// the caller keeps. `key` is whatever the accessor returned for the group's
// first item, `undefined` included: every item belongs to exactly one group,
// and the items an accessor has no key for form theirs. Naming that group is
// the reader's job, not this module's.
export type Group<
  Item,
  Key extends string | number | bigint | boolean | null | undefined,
> = {
  key: Key;
  items: Item[];
};

// What to group by is the caller's reading of its own record, taken as an
// accessor rather than a field name this module would have to know the words
// of.
//
// The key is one the `Map` below can compare by value. What the constraint
// leaves out is everything compared by identity: every object, and `symbol`
// too, primitive though it is. Under such a key two readings that are equal —
// two `Date`s of the same instant, say — would each get a group of their own,
// and the caller would read that as grouping quietly not working. A caller
// holding one reduces it to a value first, choosing what "the same" means
// for it.
export function groupBy<
  Item,
  Key extends string | number | bigint | boolean | null | undefined,
>(
  items: Item[],
  keyOf: (item: Item) => Key,
): Group<Item, Key>[] {
  const groups = new Map<Key, Item[]>();

  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      // Owned by this call, so appending cannot disturb the caller's list.
      group.push(item);
    }
  }

  return [...groups].map(([key, grouped]) => ({ key, items: grouped }));
}
