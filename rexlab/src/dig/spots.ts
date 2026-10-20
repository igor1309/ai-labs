// The details a child finds on a dinosaur's body picture, by the word
// the card names them with (the texts' `spotKinds`).
export const SPOT_KINDS = ["eye", "foot", "tail", "claw", "horn", "plate", "crest", "sail", "frill", "beak"] as const;

export type SpotKind = (typeof SPOT_KINDS)[number];

// The kinds only some dinosaurs show, so a clue of one tells a dinosaur
// from others; every dinosaur shows an eye, feet, a tail and claws.
export const TELLING_KINDS: readonly SpotKind[] = ["horn", "plate", "crest", "sail", "frill", "beak"];

// The frame a body picture is drawn in, in its pixels, and the grid of
// cells the sand over it counts in.
export const FRAME = { width: 800, height: 600 } as const;
export const GRID = { columns: 40, rows: 30 } as const;

// A detail on the picture: a round place, its middle and radius in the
// frame's pixels, and its kind.
export type Spot = { kind: SpotKind; x: number; y: number; r: number };

// Which cells lie over the dinosaur, row by row, top to bottom, each row
// left to right.
export type Cells = readonly (readonly boolean[])[];

// A dinosaur's dig data, with its telling traits: the telling kinds its
// picture shows, whether or not one is among its spots.
export type DigDinosaur = { id: string; traits: readonly SpotKind[]; spots: readonly Spot[]; cells: Cells };

// The dig file, `dig.json`, in its own format: by dinosaur id, its spots
// and its cells, a string of `0` and `1` per row, read as any values, as
// the JSON gives them.
export type DigFile = Readonly<Record<string, Readonly<{ traits?: unknown; spots?: unknown; cells?: unknown }>>>;

// A round picks three spots of one dinosaur, and each must be of a kind
// of its own, so a dinosaur has at least three; five keeps a round's
// choice among details a child would point at.
const SPOTS = { fewest: 3, most: 5 } as const;

// Every dinosaur of `ids`, in their order, with its spots and cells. A
// dinosaur with no entry, an entry of no dinosaur in the list, too few
// or too many spots, a spot of no kind, of a kind twice or past the
// frame, or cells not of the grid fail here, when the app is put
// together, rather than as a round with nothing to find.
export function readDig(ids: readonly string[], file: DigFile): DigDinosaur[] {
  const stray = Object.keys(file).find((id) => !ids.includes(id));
  if (stray !== undefined) throw new Error(`The dig entry ${stray} is of no dinosaur in the list`);
  return ids.map((id) => {
    const entry = file[id];
    if (entry === undefined) throw new Error(`${id} has no dig entry`);
    const traits = readTraits(id, entry.traits);
    const spots = readSpots(id, entry.spots);
    const untold = spots.find(({ kind }) => TELLING_KINDS.includes(kind) && !traits.includes(kind));
    if (untold !== undefined) throw new Error(`${id} has a ${untold.kind} spot but no ${untold.kind} among its traits`);
    return { id, traits, spots, cells: readCells(id, entry.cells) };
  });
}

function readTraits(id: string, traits: unknown): SpotKind[] {
  const known = (trait: unknown) => TELLING_KINDS.find((kind) => kind === trait);
  if (!Array.isArray(traits) || traits.some((trait) => known(trait) === undefined) || new Set(traits).size !== traits.length) {
    throw new Error(`${id} has no list of telling traits: ${JSON.stringify(traits)}`);
  }
  return traits.map((trait) => known(trait) as SpotKind);
}

function readSpots(id: string, spots: unknown): Spot[] {
  if (!Array.isArray(spots) || spots.length < SPOTS.fewest || spots.length > SPOTS.most) {
    throw new Error(`${id} has no ${SPOTS.fewest} to ${SPOTS.most} spots: ${JSON.stringify(spots)}`);
  }
  const kinds = new Set<SpotKind>();
  return spots.map((spot: unknown, at) => {
    const { kind, x, y, r } = (typeof spot === "object" && spot !== null ? spot : {}) as Record<string, unknown>;
    const known = SPOT_KINDS.find((each) => each === kind);
    if (known === undefined || kinds.has(known)) throw new Error(`${id}'s spot ${at + 1} has no kind of its own: ${JSON.stringify(kind)}`);
    kinds.add(known);
    if (!isNumber(x) || !isNumber(y) || !isNumber(r) || r <= 0 || x - r < 0 || y - r < 0 || x + r > FRAME.width || y + r > FRAME.height) {
      throw new Error(`${id} has no ${known} in its ${FRAME.width}×${FRAME.height} frame: ${JSON.stringify(spot)}`);
    }
    return { kind: known, x, y, r };
  });
}

function readCells(id: string, cells: unknown): Cells {
  const isRow = (row: unknown): row is string => typeof row === "string" && new RegExp(`^[01]{${GRID.columns}}$`).test(row);
  if (!Array.isArray(cells) || cells.length !== GRID.rows || !cells.every(isRow)) {
    throw new Error(`${id} has no ${GRID.columns}×${GRID.rows} cells`);
  }
  return cells.map((row) => [...row].map((cell) => cell === "1"));
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// The cells a spot counts in: the dinosaur's cells whose middle lies in
// its circle, each as its column and row.
export function spotCells({ x, y, r }: Spot, cells: Cells): Array<[number, number]> {
  const [width, height] = [FRAME.width / GRID.columns, FRAME.height / GRID.rows];
  return cells.flatMap((row, rowAt) =>
    row.flatMap((over, columnAt): Array<[number, number]> => {
      const [middleX, middleY] = [(columnAt + 0.5) * width, (rowAt + 0.5) * height];
      return over && (middleX - x) ** 2 + (middleY - y) ** 2 <= r * r ? [[columnAt, rowAt]] : [];
    })
  );
}
