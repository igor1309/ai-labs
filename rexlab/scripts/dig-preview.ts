// Draws a preview sheet of each dinosaur's dig data for review by eye:
// its body picture over its cells, tinted, and each spot circled and
// labelled with its kind and the number of the dinosaur's cells it
// counts in.
// The sheets are for review only, never committed. Run from rexlab/:
// npx tsx scripts/dig-preview.ts <out-dir>
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { FRAME, GRID, readDig, spotCells } from "../src/dig/index.ts";
import { bodyPicture } from "./digGrid.ts";

const out = process.argv[2];
if (!out) throw new Error("Usage: npx tsx scripts/dig-preview.ts <out-dir>");
mkdirSync(out, { recursive: true });

const records: Array<{ id: string }> = JSON.parse(readFileSync("src/data/dinosaurs.json", "utf8"));
const dinosaurs = readDig(
  records.map(({ id }) => id),
  JSON.parse(readFileSync("src/data/dig.json", "utf8"))
);

const [cellWidth, cellHeight] = [FRAME.width / GRID.columns, FRAME.height / GRID.rows];

for (const { id, spots, cells } of dinosaurs) {
  const tint = cells.flatMap((row, y) => row.flatMap((over, x) => (over ? [`<rect x="${x * cellWidth}" y="${y * cellHeight}" width="${cellWidth}" height="${cellHeight}"/>`] : [])));
  const circles = spots.map((spot) => {
    const { kind, x, y, r } = spot;
    const count = spotCells(spot, cells).length;
    const [labelX, labelY] = [Math.min(Math.max(x, 60), FRAME.width - 60), y - r > 24 ? y - r - 6 : y + r + 20];
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#e5005a" stroke-width="4"/><circle cx="${x}" cy="${y}" r="4" fill="#e5005a"/><text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="#e5005a" stroke="#ffffff" stroke-width="4" paint-order="stroke">${kind.toUpperCase()} ${count}</text>`;
  });
  const under = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME.width}" height="${FRAME.height}"><rect width="100%" height="100%" fill="#f6ead0"/><g fill="#9ad0f5" fill-opacity="0.5">${tint.join("")}</g></svg>`;
  const over = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME.width}" height="${FRAME.height}">${circles.join("")}<text x="12" y="${FRAME.height - 12}" font-family="sans-serif" font-size="22" font-weight="bold" fill="#333333">${id}</text></svg>`;
  await sharp(Buffer.from(under))
    .composite([{ input: bodyPicture(id) }, { input: Buffer.from(over) }])
    .png()
    .toFile(join(out, `${id}.png`));
}
