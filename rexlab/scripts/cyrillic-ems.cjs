#!/usr/bin/env node
// Measures every Cyrillic entry of the tests' word-width tables in
// Manrope, the face the app bundles for Russian, and writes each width
// back in ems rounded up to a tenth. jsdom lays nothing out, so the fit
// tests read these widths instead of measuring.
//
//   node scripts/cyrillic-ems.cjs          rewrite the tables
//   node scripts/cyrillic-ems.cjs --check  fail if any table is out of date

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const TABLES = ["basketWidths", "digRevealWords", "digFieldGuideWords", "homeTitles", "levelEms", "nameWidths"];
// Bold words are drawn at Manrope's heaviest weight. The field guide's
// HOME and BACK are semibold, and the age lines are regular.
const SEMIBOLD = new Set(["digFieldGuideWords:ДОМОЙ", "digFieldGuideWords:НАЗАД"]);
const weightOf = (table, word) => SEMIBOLD.has(`${table}:${word}`) ? 600 : table === "levelEms" && /лет/.test(word) ? 400 : 800;

const ENTRY = /^(\s+)(["']?)([^"':\n]*[А-ЯЁа-яё][^"':\n]*)\2:(\s*)([\d.]+)/gm;

function cyrillicFont() {
  const dir = path.join(ROOT, "node_modules/@fontsource-variable/manrope/files");
  const name = fs.readdirSync(dir).find((file) => /-cyrillic-wght-normal\.woff2$/.test(file));
  if (!name) throw new Error(`No Cyrillic Manrope file in ${dir}`);
  return fs.readFileSync(path.join(dir, name)).toString("base64");
}

async function main() {
  const check = process.argv.includes("--check");
  const sources = Object.fromEntries(TABLES.map((table) => [table, fs.readFileSync(path.join(ROOT, "tests", `${table}.ts`), "utf8")]));
  const words = TABLES.flatMap((table) => [...sources[table].matchAll(ENTRY)].map((match) => ({ table, word: match[3], weight: weightOf(table, match[3]) })));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>@font-face{font-family:M;src:url(data:font/woff2;base64,${cyrillicFont()}) format("woff2");font-weight:200 800}</style>`);
    const ems = await page.evaluate(async (words) => {
      const context = document.createElement("canvas").getContext("2d");
      const out = [];
      for (const { word, weight } of words) {
        await document.fonts.load(`${weight} 100px M`, word);
        context.font = `${weight} 100px M`;
        out.push(Math.ceil(context.measureText(word).width / 10 - 1e-9) / 10);
      }
      return out;
    }, words);
    const measured = new Map(words.map(({ table, word }, index) => [`${table}:${word}`, ems[index]]));

    const stale = [];
    for (const table of TABLES) {
      const next = sources[table].replace(ENTRY, (line, indent, quote, word, space, value) => {
        const width = measured.get(`${table}:${word}`);
        if (Number(value) !== width) stale.push(`${table} ${word}: ${value} → ${width}`);
        return `${indent}${quote}${word}${quote}:${space}${width}`;
      });
      if (!check) fs.writeFileSync(path.join(ROOT, "tests", `${table}.ts`), next);
    }
    if (check && stale.length) { console.error(`Out of date:\n${stale.join("\n")}`); process.exitCode = 1; }
    else console.log(`${words.length} Cyrillic widths ${check ? "match Manrope" : `measured; ${stale.length} changed`}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
