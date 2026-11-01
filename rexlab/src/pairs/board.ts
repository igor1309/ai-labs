import type { Language } from "../language/language.ts";

// A dinosaur that may be dealt. Dinosaurs of one look-alike group have
// silhouettes too alike to tell apart, so a silhouette board deals at most
// one of each group, and a skeleton board too. `skeleton` is whether a
// whole skeleton is drawn of it, which a skeleton board needs.
export type Pal = {
  id: string;
  name: Record<Language, string>;
  lookAlike: string;
  skeleton: boolean;
};

// A random number in [0, 1), as Math.random gives.
export type Random = () => number;

// The climb Hatchling plays, one level after another: its own levels, apart
// from the age levels the game is played at.
export type ClimbLevel = 1 | 2 | 3 | 4;

export const TOP_CLIMB_LEVEL: ClimbLevel = 4;

// What a card shows once turned over.
export type Face = "picture" | "silhouette" | "skeleton";

// A board's shape: how many pairs, in how many rows of how many cards, and
// what each picture is matched to: the same picture, its silhouette or its
// skeleton.
export type BoardShape = { pairs: number; rows: number; columns: number; match: Face };

export const CLIMB_LEVELS: Record<ClimbLevel, BoardShape> = {
  1: { pairs: 3, rows: 2, columns: 3, match: "picture" },
  2: { pairs: 4, rows: 2, columns: 4, match: "picture" },
  3: { pairs: 4, rows: 2, columns: 4, match: "silhouette" },
  4: { pairs: 6, rows: 3, columns: 4, match: "silhouette" }
};

// The levels above Hatchling's climb, Explorer and Paleontologist, each
// dealing one larger board.
export type LargeLevel = "explorer" | "paleontologist";

export const LARGE_LEVELS: Record<LargeLevel, BoardShape> = {
  explorer: { pairs: 9, rows: 3, columns: 6, match: "silhouette" },
  paleontologist: { pairs: 12, rows: 4, columns: 6, match: "skeleton" }
};

// What a board is dealt at: one of Hatchling's climb levels, or a larger
// level's board.
export type BoardLevel = { climbLevel: ClimbLevel } | { large: LargeLevel };

export function shapeOf(level: BoardLevel): BoardShape {
  return "climbLevel" in level ? CLIMB_LEVELS[level.climbLevel] : LARGE_LEVELS[level.large];
}

export type Card = { pal: Pal; face: Face };

export type Board = {
  level: BoardLevel;
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

// Deals a board at `level`, whatever level the board before it was: its
// pairs are of different dinosaurs, on a silhouette or skeleton board each
// of another look-alike group, on a skeleton board each with a whole
// skeleton, and as few of them on the board before as that
// allows. The board before's dinosaurs are taken last: by then the others
// have taken one of every group they are in, so only a group none of them
// is in is left to the board before's, and no other choice deals fewer of
// them. Its cards are shuffled.
export function dealBoard(pals: readonly Pal[], level: BoardLevel, random: Random, previous?: Board): Board {
  const { pairs, match } = shapeOf(level);
  const alike = match !== "picture";
  const dealtBefore = new Set(previous?.pals.map(({ id }) => id));
  const order = shuffled(match === "skeleton" ? pals.filter(({ skeleton }) => skeleton) : pals, random);
  const groups = new Set<string>();
  const dealt: Pal[] = [];
  for (const pal of [...order.filter(({ id }) => !dealtBefore.has(id)), ...order.filter(({ id }) => dealtBefore.has(id))]) {
    if (dealt.length === pairs) break;
    if (alike && groups.has(pal.lookAlike)) continue;
    groups.add(pal.lookAlike);
    dealt.push(pal);
  }
  if (dealt.length < pairs) {
    throw new Error(`Too few dinosaurs for ${"climbLevel" in level ? `a level ${level.climbLevel} board` : `the ${level.large} board`}`);
  }
  const cards = dealt.flatMap((pal): Card[] => [
    { pal, face: "picture" },
    { pal, face: match }
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
