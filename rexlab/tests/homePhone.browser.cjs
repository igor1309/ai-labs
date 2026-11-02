const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium } = require("playwright");

const phones = [[320, 568], [375, 667], [390, 664], [390, 844], [393, 852], [430, 932]];
const games = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting", "labyrinth", "picturePuzzle", "whoseJaw", "coloring"];

(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ root: join(__dirname, ".."), server: { host: "127.0.0.1", port: 0, open: false } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
    const output = process.env.HOME_SCREENSHOTS;
    if (output) await mkdir(output, { recursive: true });
    let checked = 0;
    for (const [width, height] of phones) for (const language of ["en", "ru"]) for (const level of ["hatchling", "explorer", "paleontologist"]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      await page.addInitScript(({ language, level }) => {
        localStorage.setItem("rexlab-language", language);
        localStorage.setItem("rexlab-theme", "dark");
        localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "phone-fit" }));
        // The same deterministic draw on every visit still exercises each featured game.
        Math.random = () => 0.78;
      }, { language, level });
      await page.goto(server.resolvedUrls.local[0]);
      await page.locator(".home").waitFor();
      await page.evaluate(() => document.fonts.ready);
      // At the smallest size every possible featured card must fit too.
      for (const game of width === 320 && level === "explorer" ? games : [null]) {
        if (game) {
          await page.evaluate((game) => {
            const progress = JSON.parse(localStorage.getItem("rexlab-progress"));
            progress.games["home-featured"].featured.game = game;
            localStorage.setItem("rexlab-progress", JSON.stringify(progress));
          }, game);
          await page.reload();
          await page.locator(`.featured-card[data-game="${game}"]`).waitFor();
          await page.evaluate(() => document.fonts.ready);
        }
        const result = await page.evaluate(() => {
          const box = (element) => {
            const { top, bottom, left, right, height } = element.getBoundingClientRect();
            return { top, bottom, left, right, height };
          };
          const row = document.querySelector(".games-tiles");
          return {
            overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
            boxes: [".greeting", ".featured-card", ".games-tiles", "#version"].map((selector) => box(document.querySelector(selector))),
            tiles: [...row.querySelector(".tiles-grid").children].map(box),
            swipe: row.scrollWidth > row.clientWidth,
            title: box(document.querySelector(".featured-card-title")),
            card: box(document.querySelector(".featured-card"))
          };
        });
        const label = `${width}x${height} ${language} ${level} ${game || "daily"}`;
        assert.deepEqual(result.overflow, [false, false], label);
        for (const box of [...result.boxes, ...result.tiles]) {
          assert(box.top >= 0 && box.bottom <= height && box.height > 0, `${label}: ${JSON.stringify(box)}`);
        }
        assert(result.tiles.every((tile) => tile.height >= 44), `${label}: tile hit targets`);
        assert(result.title.bottom <= result.card.bottom && result.title.top >= result.card.top, `${label}: featured title clipped`);
        assert(result.swipe, `${label}: tiles must remain horizontally scrollable`);
        await page.locator(".games-tiles").evaluate((row) => { row.scrollLeft = row.scrollWidth; });
        assert(await page.locator(".games-tiles").evaluate((row) => row.scrollLeft > 0), label);
        await page.locator(".games-tiles").evaluate((row) => { row.scrollLeft = 0; });
        checked++;
      }
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().filter((animation) =>
          animation.effect?.getComputedTiming().iterations !== Infinity
        ).map((animation) => animation.finished.catch(() => {})));
      });
      if (output && width === 390 && height === 844 && language === "en") {
        await page.screenshot({ path: join(output, `home-phone-${level}.png`) });
      }
      await page.close();
    }
    console.log(`PASS ${checked} phone home configurations: no document overflow, cards visible, horizontal browsing works`);
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
