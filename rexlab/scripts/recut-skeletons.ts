// Re-cuts each skeleton's Explorer and Paleontologist pieces along the
// bones its picture draws, so no piece shows part of a bone and part of
// its neighbour: every bone goes whole to the piece that holds most of
// it, and each outline pixel to the bone nearest it. The pieces are
// written again from skeleton.webp, each cropped to what it shows, and
// their places in src/data/skeletons.json with them. Hatchling's pieces
// stay as they are. Run from rexlab/: npx tsx scripts/recut-skeletons.ts
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { bonesOf, SEAMS, type Picture } from "./skeletonBones.ts";

type Piece = { id: string; x: number; y: number; width: number; height: number };
type Entry = { cuts: Record<string, Piece[]> };

const FILE = "src/data/skeletons.json";
// Paleontologist's finer cut first: a piece Explorer shares with it is
// cut as it is there.
const RECUT = ["paleontologist", "explorer"];

const pictureFile = (dinosaur: string, part: string) => `src/assets/skeletons/${dinosaur}/${part}.webp`;

async function read(file: string): Promise<Picture> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

// The pixels of the whole picture each piece shows now, by its index in
// the cut, -1 where none does: where two pieces' soft edges meet, the one
// that shows more of it.
async function ownersOf(dinosaur: string, cut: readonly Piece[], width: number, height: number): Promise<Int32Array> {
  const owner = new Int32Array(width * height).fill(-1);
  const shown = new Uint8Array(width * height);
  for (const [index, piece] of cut.entries()) {
    const { data } = await read(pictureFile(dinosaur, piece.id));
    for (let row = 0; row < piece.height; row++) {
      for (let column = 0; column < piece.width; column++) {
        const [alpha, at] = [data[(row * piece.width + column) * 4 + 3] ?? 0, (piece.y + row) * width + piece.x + column];
        if (alpha <= (shown[at] ?? 0)) continue;
        owner[at] = index;
        shown[at] = alpha;
      }
    }
  }
  return owner;
}

// Fills each pixel `empty` marks with the label nearest it, out from the
// labelled ones a ring at a time, through every pixel, then clears the
// pixels that show nothing.
function spread(whole: Picture, labels: Int32Array, empty: number): Int32Array {
  const { width, height } = whole;
  const filled = Int32Array.from(labels);
  let reached = [...filled.keys()].filter((at) => filled[at] !== empty);
  while (reached.length > 0) {
    const next: number[] = [];
    for (const at of reached) {
      const [x, y] = [at % width, Math.floor(at / width)];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [x + dx, y + dy];
          const other = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || filled[other] !== empty) continue;
          filled[other] = filled[at] ?? empty;
          next.push(other);
        }
      }
    }
    reached = next;
  }
  for (let at = 0; at < filled.length; at++) if ((whole.data[at * 4 + 3] ?? 0) === 0) filled[at] = empty;
  return filled;
}

// Each bone to the piece of the cut that holds most of it. A piece an
// earlier cut shares, `taken`, gets the bones it got there, and no other.
function piecesOfBones(bone: Int32Array, owner: Int32Array, cut: readonly Piece[], taken: ReadonlyMap<string, ReadonlySet<number>>): Map<number, number> {
  const votes = new Map<number, number[]>();
  for (const [at, each] of bone.entries()) {
    const index = owner[at] ?? -1;
    if (each === 0 || index < 0) continue;
    const counted = votes.get(each) ?? cut.map(() => 0);
    counted[index] = (counted[index] ?? 0) + 1;
    votes.set(each, counted);
  }
  const open = cut.map(({ id }) => !taken.has(id));
  return new Map(
    [...votes].map(([each, counted]) => {
      const shared = cut.findIndex(({ id }) => taken.get(id)?.has(each));
      if (shared >= 0) return [each, shared];
      const most = Math.max(...counted.filter((_, index) => open[index]));
      if (!(most > 0)) throw new Error(`Bone ${each} lies only in pieces an earlier cut has settled: ${JSON.stringify(cut.map(({ id }, index) => [id, counted[index], taken.has(id)]))} ${JSON.stringify([...taken].filter(([, bones]) => bones.has(each)).map(([id]) => id))}`);
      return [each, counted.findIndex((count, index) => open[index] && count === most)];
    })
  );
}

// The piece's pixels of the whole picture, cropped to what it shows.
function pieceOf(whole: Picture, cut: Int32Array, index: number) {
  const { width } = whole;
  let [left, top, right, bottom] = [width, whole.height, -1, -1];
  for (const [at, each] of cut.entries()) {
    if (each !== index) continue;
    const [x, y] = [at % width, Math.floor(at / width)];
    [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
  }
  if (right < 0) throw new Error(`Piece ${index} is left with no bone`);
  const place = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const data = new Uint8Array(place.width * place.height * 4);
  for (let row = 0; row < place.height; row++) {
    for (let column = 0; column < place.width; column++) {
      const at = (place.y + row) * width + place.x + column;
      if (cut[at] === index) data.set(whole.data.subarray(at * 4, at * 4 + 4), (row * place.width + column) * 4);
    }
  }
  return { place, data };
}

const file = JSON.parse(readFileSync(FILE, "utf8")) as { dinosaurs: Record<string, Entry> };
for (const [dinosaur, { cuts }] of Object.entries(file.dinosaurs)) {
  const whole = await read(pictureFile(dinosaur, "skeleton"));
  const bone = bonesOf(whole, SEAMS[dinosaur]);
  // Each pixel that shows, by the bone nearest it, so an outline goes
  // with the bone it draws.
  const nearest = spread(whole, bone, 0);
  const hatchling = new Set((cuts.hatchling ?? []).map(({ id }) => id));
  // Every cut is read before any piece is written, as the cuts share
  // pictures.
  const taken = new Map<string, Set<number>>();
  const recuts = [];
  for (const level of RECUT) {
    const cut = cuts[level] ?? [];
    const kept = cut.find(({ id }) => hatchling.has(id));
    if (kept) throw new Error(`${dinosaur}'s ${level} piece ${kept.id} is Hatchling's too, which stays as it is`);
    const owner = await ownersOf(dinosaur, cut, whole.width, whole.height);
    const ofBone = piecesOfBones(bone, owner, cut, taken);
    for (const [each, index] of ofBone) {
      const id = cut[index]?.id ?? "";
      if (!taken.has(id) || level === RECUT[0]) taken.set(id, (taken.get(id) ?? new Set()).add(each));
    }
    // A bone no piece showed goes to the piece nearest it.
    const pixels = spread(whole, nearest.map((each) => ofBone.get(each) ?? -1), -1);
    recuts.push({ level, pieces: cut.map((piece, index) => ({ piece, ...pieceOf(whole, pixels, index) })) });
  }
  const written = new Map<string, string>();
  for (const { level, pieces } of recuts) {
    for (const { piece, place, data } of pieces) {
      // A piece two cuts share is one picture, so both must cut it alike.
      const drawn = JSON.stringify(place) + Buffer.from(data).toString("base64");
      if (written.has(piece.id) && written.get(piece.id) !== drawn) throw new Error(`${dinosaur}'s ${piece.id} comes out differently at ${level}`);
      Object.assign(piece, place);
      if (written.has(piece.id)) continue;
      written.set(piece.id, drawn);
      await sharp(data, { raw: { width: place.width, height: place.height, channels: 4 } })
        .webp({ lossless: true })
        .toFile(pictureFile(dinosaur, piece.id));
    }
  }
}
writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`);
