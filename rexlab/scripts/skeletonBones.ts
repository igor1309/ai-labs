// The bones a skeleton picture draws: each light shape its dark outlines
// close, found the same way by the script that cuts the pieces along them
// and by the test that no piece splits one.

// A picture's pixels, four bytes each, red, green, blue and alpha, row by
// row.
export type Picture = { data: Uint8Array; width: number; height: number };

type Point = readonly [x: number, y: number];

// One shape split into parts, each by points inside it.
type Seam = readonly (readonly Point[])[];

// A pixel is bone, not outline, when it shows and is lighter than this,
// on 0 to 255.
const LIGHT = 110;

// A light shape of fewer pixels is a speck in the outline, not a bone.
const SPECK = 30;

// Shapes the art draws as one though they are two bones, each with
// points inside its parts: a part reaches as far as the faint line drawn
// between it and the next. Triceratops's skull runs into its frill.
export const SEAMS: Readonly<Record<string, readonly Seam[]>> = {
  triceratops: [
    [
      [
        [160, 215],
        [120, 250]
      ],
      [
        [306, 149],
        [330, 250]
      ]
    ]
  ]
};

const lightOf = (data: Uint8Array, at: number) => ((data[at * 4] ?? 0) * 299 + (data[at * 4 + 1] ?? 0) * 587 + (data[at * 4 + 2] ?? 0) * 114) / 1000;

// Each pixel's bone, numbered from 1, or 0 for one that is outline or
// shows nothing, or is a speck. A shape `seams` splits is one bone for each of its parts.
export function bonesOf({ data, width, height }: Picture, seams: readonly Seam[] = []): Int32Array {
  const size = width * height;
  const bone = new Int32Array(size);
  const isBone = (at: number) => (data[at * 4 + 3] ?? 0) > 0 && lightOf(data, at) > LIGHT;
  const near = (at: number) => {
    const [x, y] = [at % width, Math.floor(at / width)];
    return [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, y > 0 ? at - width : -1, y < height - 1 ? at + width : -1].filter((each) => each >= 0);
  };
  const seen = new Uint8Array(size);
  let count = 0;
  for (let start = 0; start < size; start++) {
    if (seen[start] !== 0 || !isBone(start)) continue;
    seen[start] = 1;
    const shape = [start];
    for (let at = 0; at < shape.length; at++) {
      for (const other of near(shape[at] ?? 0)) {
        if (seen[other] === 0 && isBone(other)) {
          seen[other] = 1;
          shape.push(other);
        }
      }
    }
    if (shape.length < SPECK) continue;
    count++;
    for (const at of shape) bone[at] = count;
  }
  for (const parts of seams) count = split(bone, parts, count, { data, width, height }, near);
  return bone;
}

// Splits the shape the parts' points lie in by flooding it from them,
// lightest pixels first, so the parts meet along its darkest line.
function split(bone: Int32Array, parts: Seam, count: number, { data, width }: Picture, near: (at: number) => number[]): number {
  const seeds = parts.map((points) => points.map(([x, y]) => y * width + x));
  const shape = bone[seeds[0]?.[0] ?? 0] ?? 0;
  if (shape === 0 || seeds.some((points) => points.some((at) => bone[at] !== shape))) throw new Error(`A seam's points are not all in one bone: ${JSON.stringify(parts)}`);
  // Pixels waiting to be reached, by how dark they are.
  const waiting: number[][] = Array.from({ length: 256 }, () => []);
  const darkness = (at: number) => 255 - Math.round(lightOf(data, at));
  for (const [part, points] of seeds.entries()) {
    for (const at of points) {
      bone[at] = count + part + 1;
      waiting[darkness(at)]?.push(at);
    }
  }
  for (let level = 0; level < waiting.length; level++) {
    const atLevel = waiting[level] ?? [];
    for (let next = atLevel.pop(); next !== undefined; next = atLevel.pop()) {
      for (const other of near(next)) {
        if (bone[other] !== shape) continue;
        bone[other] = bone[next] ?? 0;
        waiting[Math.max(level, darkness(other))]?.push(other);
      }
    }
  }
  return count + parts.length;
}
