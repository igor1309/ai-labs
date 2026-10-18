import type { Language } from "../language/language.ts";

// A dinosaur that may be dealt. Dinosaurs of one look-alike group have
// silhouettes too alike to tell apart, so a silhouette board deals at most
// one of each group.
export type Pal = {
  id: string;
  name: Record<Language, string>;
  lookAlike: string;
};

// A random number in [0, 1), as Math.random gives.
export type Random = () => number;

export type Level = 1 | 2 | 3 | 4;

export const TOP_LEVEL: Level = 4;

// Each level's board: how many pairs, in how many rows of how many cards,
// and whether each picture is matched to its silhouette rather than to
// the same picture.
export const LEVELS: Record<Level, { pairs: number; rows: number; columns: number; silhouettes: boolean }> = {
  1: { pairs: 3, rows: 2, columns: 3, silhouettes: false },
  2: { pairs: 4, rows: 2, columns: 4, silhouettes: false },
  3: { pairs: 4, rows: 2, columns: 4, silhouettes: true },
  4: { pairs: 6, rows: 3, columns: 4, silhouettes: true }
};

// What a card shows once turned over.
export type Face = "picture" | "silhouette";

export type Card = { pal: Pal; face: Face };

export type Board = {
  level: Level;
  // The board's dinosaurs, in the order they were dealt.
  pals: readonly Pal[];
  // The cards, in their places on the board, row by row.
  cards: readonly Card[];
  // The places of the cards turned over and not yet found: none, one, or
  // the two of a miss while it shows.
  open: readonly number[];
  // The ids of the dinosaurs whose pair is found, in the order found.
  found: readonly string[];
  // Each two cards turned is one try, matched or not.
  tries: number;
};

// Deals a board of `level`: its pairs are of different dinosaurs, none of
// them on the board before it, and on a silhouette board none from the
// same look-alike group. Its cards are shuffled.
export function dealBoard(pals: readonly Pal[], level: Level, random: Random, previous?: Board): Board {
  const { pairs, silhouettes } = LEVELS[level];
  const dealtBefore = new Set(previous?.pals.map(({ id }) => id));
  const groups = new Set<string>();
  const dealt: Pal[] = [];
  for (const pal of shuffled(
    pals.filter(({ id }) => !dealtBefore.has(id)),
    random
  )) {
    if (dealt.length === pairs) break;
    if (silhouettes && groups.has(pal.lookAlike)) continue;
    groups.add(pal.lookAlike);
    dealt.push(pal);
  }
  if (dealt.length < pairs) {
    throw new Error(`Too few dinosaurs for a level ${level} board`);
  }
  const cards = dealt.flatMap((pal): Card[] => [
    { pal, face: "picture" },
    { pal, face: silhouettes ? "silhouette" : "picture" }
  ]);
  return { level, pals: dealt, cards: shuffled(cards, random), open: [], found: [], tries: 0 };
}

// Two different cards are open: they stay so until turned back, and no
// other card turns meanwhile.
export function isMiss(board: Board): boolean {
  return board.open.length === 2;
}

// Turns over the card at `index`. A found card, an open card, or any card
// while a miss shows, stays as it is, so a second tap changes nothing. The
// second card turned is a try: a match is found at once, a miss stays
// open until turned back.
export function turn(board: Board, index: number): Board {
  const card = board.cards[index];
  if (card === undefined || isMiss(board) || board.open.includes(index) || board.found.includes(card.pal.id)) {
    return board;
  }
  const [first] = board.open;
  if (first === undefined) {
    return { ...board, open: [index] };
  }
  const tries = board.tries + 1;
  if (board.cards[first]?.pal.id === card.pal.id) {
    return { ...board, open: [], found: [...board.found, card.pal.id], tries };
  }
  return { ...board, open: [first, index], tries };
}

// Turns a miss face down again.
export function turnBack(board: Board): Board {
  return isMiss(board) ? { ...board, open: [] } : board;
}

export function isFinished(board: Board): boolean {
  return board.found.length === board.pals.length;
}

// Fisher–Yates, so every order is as likely.
function shuffled<T>(items: readonly T[], random: Random): T[] {
  const order = [...items];
  for (let at = order.length - 1; at > 0; at--) {
    const other = Math.floor(random() * (at + 1));
    [order[at], order[other]] = [order[other] as T, order[at] as T];
  }
  return order;
}
