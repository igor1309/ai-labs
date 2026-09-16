// The key is one the `Map` in `groupBy` can compare by value. What the
// constraint leaves out is everything compared by identity: every object, and
// `symbol` too, primitive though it is. Under such a key two readings that are
// equal — two `Date`s of the same instant, say — would each get a group of
// their own, and the caller would read that as grouping quietly not working. A
// caller holding one reduces it to a value first, choosing what "the same"
// means for it.
type GroupKey = string | number | bigint | boolean | null | undefined;

export type Group<Item, Key extends GroupKey> = {
  key: Key;
  items: Item[];
};

export function groupBy<Item, Key extends GroupKey>(
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
