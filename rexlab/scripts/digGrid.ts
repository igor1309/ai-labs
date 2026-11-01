// What the dig data is measured on: a body picture's alpha and the cells
// of the grid it shows in. The cells script writes the data with it and
// the tests check the data against it.
import sharp from "sharp";
import { GRID } from "../src/dig/index.ts";

// A picture's alpha channel, row by row, from 0 to 255.
export type Alpha = { alpha: Uint8Array; width: number; height: number };

// A pixel shows the dinosaur once it is at least half opaque: the soft
// edge fading out round it does not.
export const SHOWS = 128;

// A cell is the dinosaur's when more than this share of its pixels show.
export const CELL_SHARE = 0.1;

export const bodyPicture = (id: string) => `src/assets/dinos/${id}/body.webp`;

export async function alphaOf(file: string): Promise<Alpha> {
  const { data, info } = await sharp(file).ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  return { alpha: new Uint8Array(data), width: info.width, height: info.height };
}

const shows = ({ alpha, width }: Alpha, x: number, y: number) => (alpha[y * width + x] ?? 0) >= SHOWS;

// The grid's rows, top to bottom, each a `1` for a cell of the dinosaur
// and a `0` for one of the empty ground round it, left to right.
export function cellsOf(picture: Alpha): string[] {
  const [width, height] = [picture.width / GRID.columns, picture.height / GRID.rows];
  return Array.from({ length: GRID.rows }, (_, row) =>
    Array.from({ length: GRID.columns }, (_, column) => {
      let shown = 0;
      for (let y = row * height; y < (row + 1) * height; y++) {
        for (let x = column * width; x < (column + 1) * width; x++) if (shows(picture, x, y)) shown++;
      }
      return shown > CELL_SHARE * width * height ? "1" : "0";
    }).join("")
  );
}
