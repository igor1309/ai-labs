// Contract test: released Home layout, fonts, scrolling and navigation in Chromium.
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');

const labels = {
  en: ['COMPARE', 'EXPLORE', 'PAIRS', 'BONES', 'DIG', 'SORT', 'CARE', 'DRAW', 'MAZE', 'PUZZLE', 'TEETH', 'COLOR', 'SOON'],
  ru: ['СРАВНИ', 'ЯЩЕРЫ', 'ПАРЫ', 'КОСТИ', 'КОПАЙ', 'СОРТИРУЙ', 'ЗАБОТА', 'РИСУЙ', 'ЛАБИРИНТ', 'ПАЗЛ', 'ЗУБЫ', 'РАСКРАСЬ', 'СКОРО']
};
const games = ['compare', 'catalogue', 'pairs', 'skeletons', 'dig', 'sort', 'care', 'sandWriting', 'labyrinth', 'picturePuzzle', 'whoseJaw', 'coloring'];
// Approved hero frames in CSS pixels; small tiles cannot influence them.
const sizes = [
  [390, 844, [20, 156, 350, 271.296875]],
  [844, 390, [20, 80, 404, 290]],
  [820, 1180, [56, 192, 708, 463.203125]],
  [1180, 820, [56, 222, 445.71875, 440]],
  [1440, 900, [56, 222, 557.140625, 520]]
];
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .1, `${label}: ${actual} != ${expected}`);
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-turning'));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function check(browser, files, width, height, hero, language, level, featured) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    // Route the production build directly, with no listening server or external network.
    await context.route('http://home.test/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
      await route.fulfill({ body: files.get(file) ?? await readFile(resolve(__dirname, '../public', file)), contentType: types[extname(file)] });
    });
    await context.addInitScript(({ language, level, featured }) => {
      localStorage.setItem('rexlab-language', language);
      localStorage.setItem('rexlab-theme', 'light');
      localStorage.setItem('rexlab-age-level', JSON.stringify({ level, revision: 'home-layout' }));
      const date = new Date();
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: { 'home-featured': { starts: {}, featured: { day, game: featured } } } }));
    }, { language, level, featured });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto('http://home.test/');
    await page.locator('.home').waitFor();
    await settle(page);
    const measured = await page.evaluate(() => {
      const box = el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height }; };
      return {
        hero: box(document.querySelector('.featured-card')),
        tiles: [...document.querySelector('.tiles-grid').children].map(card => {
          const footer = card.querySelector('.home-tile-footer'), icon = footer.querySelector('.home-tile-symbol'), title = footer.querySelector('.home-tile-title');
          const fs = getComputedStyle(footer), ts = getComputedStyle(title);
          return { card: box(card), footer: box(footer), icon: box(icon), svg: box(icon.querySelector('svg')), title: box(title), name: title.textContent,
            fits: title.scrollWidth <= title.clientWidth + .5, font: [ts.fontSize, ts.lineHeight, ts.fontWeight, ts.letterSpacing === "normal" ? "0px" : ts.letterSpacing], background: fs.backgroundColor, padding: fs.padding, gap: fs.gap };
        }), badges: document.querySelectorAll('.games-tiles [class$="-tile-best"], .games-tiles [class$="-tile-count"], .games-tiles [class$="-tile-stars"]').length
      };
    });
    for (const [index, property] of ['x', 'y', 'width', 'height'].entries()) near(measured.hero[property], hero[index], `hero ${property}`);
    assert.equal(measured.badges, 0);
    assert.deepEqual(measured.tiles.map(t => t.name), labels[language].filter((_, index) => games[index] !== featured));
    for (const tile of measured.tiles) {
      near(tile.card.width, tile.card.height * 4 / 3, `${tile.name} aspect ratio`);
      near(tile.footer.height, 48, 'footer height'); near(tile.footer.width, tile.card.width, 'footer width');
      near(tile.footer.y + tile.footer.height, tile.card.y + tile.card.height, 'footer bottom');
      near(tile.icon.x - tile.card.x, 8, 'icon inset'); near(tile.icon.y - tile.footer.y, 12, 'icon vertical inset');
      near(tile.icon.width, 24, 'icon badge'); near(tile.svg.width, 20, 'outline icon');
      near(tile.title.x - tile.icon.x - tile.icon.width, 4, 'title gap');
      assert.equal(tile.fits, true, tile.name);
      assert.deepEqual(tile.font, ['20px', '24px', '700', '0px']);
      assert.equal(tile.background, 'rgba(0, 0, 0, 0.1)'); assert.equal(tile.padding, '8px'); assert.equal(tile.gap, '4px');
    }
    // Keep a middle column and the end through both orientation changes.
    for (const end of [false, true]) {
      await page.locator('.games-tiles').evaluate((row, end) => {
        const grid = row.querySelector('.tiles-grid'), style = getComputedStyle(grid);
        row.scrollLeft = end ? row.scrollWidth - row.clientWidth : parseFloat(style.gridAutoColumns) + parseFloat(style.columnGap);
        row.dispatchEvent(new Event('scroll'));
      }, end);
      for (const viewport of [{ width: height, height: width }, { width, height }]) {
        await page.setViewportSize(viewport);
        const expectedSize = viewport.width < viewport.height ? (viewport.width < 600 ? 'tall-narrow' : 'tall') : (viewport.height < 600 ? 'wide-short' : 'wide');
        await page.waitForFunction(size => document.documentElement.dataset.size === size, expectedSize);
        await settle(page);
        const row = await page.locator('.games-tiles').evaluate(row => {
          const style = getComputedStyle(row.querySelector('.tiles-grid'));
          return { scroll: row.scrollLeft, maximum: row.scrollWidth - row.clientWidth, step: parseFloat(style.gridAutoColumns) + parseFloat(style.columnGap) };
        });
        assert(Math.abs(row.scroll - (end ? row.maximum : Math.min(row.step, row.maximum))) <= 1, JSON.stringify(row));
      }
    }
    await page.locator('[data-turn-part="tile-coloring"]').press('Enter');
    await page.locator('.coloring-gallery').waitFor();
    assert.equal(await page.locator('.home').count(), 0);
  } finally { await context.close(); }
}
(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const bundle = await build({ root: resolve(__dirname, ".."), logLevel: "error", build: { write: false } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
    for (const [width, height, hero] of sizes) for (const language of ['en', 'ru']) for (const level of ['hatchling', 'explorer', 'paleontologist']) for (const featured of ['compare', 'catalogue']) {
      await check(browser, files, width, height, hero, language, level, featured);
    }
    console.log('PASS Home: all 12 games as tiles, 5 viewports, 2 languages, 3 ages; footers, hero, rotations and navigation');
  } finally { await browser?.close(); }
})().catch(error => { console.error(`FAIL Home browser checks: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
