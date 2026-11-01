// Fisher–Yates, so every order is as likely, drawing from `random`, a
// number from 0 up to but not including 1, as Math.random gives. Each
// place takes one of the items not yet placed, and a draw of 0 takes the
// first of them, so draws of 0 alone keep the items' order.
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const order = [...items];
  for (let at = 0; at < order.length - 1; at++) {
    const other = at + Math.floor(random() * (order.length - at));
    [order[at], order[other]] = [order[other] as T, order[at] as T];
  }
  return order;
}
