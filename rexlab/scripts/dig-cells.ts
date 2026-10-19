// Writes each dinosaur's cells in src/data/dig.json from its body
// picture, keeping the spots and telling traits the file gives it: a
// dinosaur the file has no entry for gets none, to be placed by eye. Run from rexlab/:
// npx tsx scripts/dig-cells.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { alphaOf, bodyPicture, cellsOf } from "./digGrid.ts";

type Entry = { traits: unknown[]; spots: unknown[]; cells: string[] };

const FILE = "src/data/dig.json";

const records: Array<{ id: string }> = JSON.parse(readFileSync("src/data/dinosaurs.json", "utf8"));
const kept: Record<string, Partial<Entry>> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};

const entries: Array<[string, Entry]> = [];
for (const { id } of records) entries.push([id, { traits: kept[id]?.traits ?? [], spots: kept[id]?.spots ?? [], cells: cellsOf(await alphaOf(bodyPicture(id))) }]);

writeFileSync(FILE, format(entries));

// One spot or row of cells a line, so a change to the data reads as the
// spots and cells it moves.
function format(entries: ReadonlyArray<[string, Entry]>): string {
  const list = (items: readonly unknown[]) => (items.length === 0 ? "[]" : `[\n${items.map((item) => `      ${JSON.stringify(item).replaceAll(/([,:])/g, "$1 ").replace(/^\{/, "{ ").replace(/\}$/, " }")}`).join(",\n")}\n    ]`);
  const body = entries.map(([id, { traits, spots, cells }]) => `  ${JSON.stringify(id)}: {\n    "traits": ${JSON.stringify(traits).replaceAll(",", ", ")},\n    "spots": ${list(spots)},\n    "cells": ${list(cells)}\n  }`);
  return `{\n${body.join(",\n")}\n}\n`;
}
