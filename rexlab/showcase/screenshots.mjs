// Takes the public README's screenshots of a running RexLab, iPad landscape
// at 2x, in English: node showcase/screenshots.mjs <url> <output directory>.
// Playwright comes from the ai-labs root, which rexlab does not depend on.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error("Usage: node showcase/screenshots.mjs <url> <output directory>");

// Each screenshot: its theme and the buttons pressed from home to reach it.
const SHOTS = {
  "home-light": { theme: "light", steps: [] },
  "home-dark": { theme: "dark", steps: [] },
  compare: { theme: "light", steps: ["COMPARE"] },
  catalogue: { theme: "light", steps: ["ANCIENT REPTILES"] },
  "skeleton-puzzle": { theme: "light", steps: ["SKELETONS", "TRICERATOPS"] },
  "care-visit": { theme: "light", steps: ["CARE", "NEW VISITOR"] },
  sort: { theme: "light", steps: ["SORT"] },
};

const browser = await chromium.launch();
for (const [name, { theme, steps }] of Object.entries(SHOTS)) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: theme });
  await context.addInitScript((choice) => {
    localStorage.setItem("rexlab-theme", choice);
    localStorage.setItem("rexlab-language", "en");
  }, theme);
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForTimeout(1500);
  for (const step of steps) {
    await page.getByRole("button", { name: step, exact: true }).first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  await context.close();
}
await browser.close();
