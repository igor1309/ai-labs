// Screenshots of CARE's welcome in the released app, for review against the
// CARE frames of design/dig-site.pen:
// node tests/careShots.cjs <directory> [width height]
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { appDir, root } = require("./appBuild.cjs");
const { chromium } = require("playwright");

const [out = "care-shots", width = "1133", height = "744"] = process.argv.slice(2);
const FRIENDS = ["tyrannosaurus", "triceratops", "stegosaurus", "brachiosaurus", "parasaurolophus"];
const SHOTS = [
  ["welcome-first", { progress: null }],
  ["welcome-returning", { progress: { bestScore: 7, visitsFinished: 6, friends: FRIENDS } }],
  ["welcome-returning-dark", { progress: { bestScore: 7, visitsFinished: 6, friends: FRIENDS }, theme: "dark" }],
  ["welcome-returning-ru", { progress: { bestScore: 7, visitsFinished: 6, friends: FRIENDS }, language: "ru" }]
];

(async () => {
  mkdirSync(out, { recursive: true });
  const app = await appDir();
  const { preview } = await import("vite");
  const server = await preview({ root, logLevel: "error", build: { outDir: app.dir }, preview: { host: "127.0.0.1", port: 0 } });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, { progress, theme = "light", language = "en" }] of SHOTS) {
      if (process.env.ONLY && !name.startsWith(process.env.ONLY)) continue;
      const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, reducedMotion: "reduce" });
      await page.goto(server.resolvedUrls.local[0]);
      await page.evaluate(({ progress, theme, language }) => {
        localStorage.setItem("rexlab-language", language); localStorage.setItem("rexlab-theme", theme);
        if (progress) localStorage.setItem("rexlab-progress", JSON.stringify({ schemaVersion: 1, games: { "dinosaur-care": progress } }));
      }, { progress, theme, language });
      await page.reload();
      await page.locator(".home").waitFor();
      await page.locator('[data-turn-part="tile-care"], .featured-card[data-game="care"]').first().press("Enter");
      await page.locator(".care-welcome").waitFor();
      await page.waitForFunction(() => !document.documentElement.hasAttribute("data-turning") && !document.querySelector('main [data-picture="loading"]'));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, `${name}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
    server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve));
    await app.done();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
