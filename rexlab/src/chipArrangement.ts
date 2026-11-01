// How the food chips stand in a tall window: in one row at their
// landscape spacing, in one row closed up, or two by two ("ALL" with the
// first food chip, the other two under them) at their landscape spacing.
export type ChipArrangement = "spaced" | "closed" | "stacked";

// What a food chip holds, each part as wide as it is laid out: its
// symbols, its word and its count's shade. None of them changes as the
// chips close up; only the room around them does.
export type ChipContent = { symbols: number; word: number; count: number };

// The room around a food chip's parts: its padding before the symbols and
// after the count, the gap between its parts, and the gap between chips.
type Spacing = { before: number; after: number; between: number; apart: number };

const LANDSCAPE: Spacing = { before: 20, after: 10, between: 10, apart: 12 };
const CLOSED: Spacing = { before: 14, after: 8, between: 8, apart: 8 };
// "ALL" is a round button, its symbol alone, whatever the spacing.
const ALL = 56;

const chipWidth = ({ symbols, word, count }: ChipContent, { before, after, between }: Spacing) => before + symbols + between + word + between + count + after;

// The least width of "ALL" and the food chips in one row at `spacing`,
// each food chip as wide as its content.
const rowWidth = (chips: readonly ChipContent[], spacing: Spacing) => chips.reduce((width, chip) => width + spacing.apart + chipWidth(chip, spacing), ALL);

// How the chips stand in a row `row` wide, the food chips holding
// `chips`: at their landscape spacing where they fit, else every food
// chip closed up at once where that fits, else two by two. The width
// left over in a row is shared out by the stylesheet, so only the least
// width counts here.
export function chipArrangement(row: number, chips: readonly ChipContent[]): ChipArrangement {
  if (rowWidth(chips, LANDSCAPE) <= row) return "spaced";
  if (rowWidth(chips, CLOSED) <= row) return "closed";
  return "stacked";
}
