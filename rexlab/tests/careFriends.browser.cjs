// Contract test: Friends' rendered layout, pictures, scrolling in Chromium.
const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { resolve, extname, join } = require('node:path');
const { chromium } = require('playwright');
const sizes = [[1133, 744, 5, 196, 116], [744, 1133, 2, 210, 220], [393, 852, 2, 216, 110], [375, 667, 2, 170, 96], [852, 393, 3, 130, 84], [600, 1000, 2, 210, 220], [1440, 900, 7, 196, 116], [320, 568, 2, 170, 96]];
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-turning'));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function main() {
  const { build } = await import('vite');
  const bundle = await build({ root: resolve(__dirname, '..'), logLevel: 'error', build: { write: false } });
  const files = new Map(bundle.output.map(f => [f.fileName, f.type === 'chunk' ? f.code : f.source]));
  const records = JSON.parse(await readFile(resolve(__dirname, '../src/data/dinosaurs.json'), 'utf8'));
  const ids = records.filter(d => d.group === 'dinosaur').map(d => d.id);
  assert.equal(ids.length, 42);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let checked = 0;
  try {
    for (const [width, height, columns, sandTop, pocketHeight] of sizes) for (const language of ['en', 'ru']) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        await context.route('http://friends.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
          await route.fulfill({ body: files.get(file) ?? await readFile(resolve(__dirname, '../public', file)), contentType: types[extname(file)] });
        });
        await context.addInitScript(({ language, theme }) => {
          Math.random = () => 0;
          localStorage.setItem('rexlab-language', language);
          localStorage.setItem('rexlab-theme', theme);
          localStorage.setItem('rexlab-age-level', JSON.stringify({ level: 'explorer', revision: 'friends' }));
        }, { language, theme });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        for (const count of [0, 5, 42]) {
          await page.goto('http://friends.test/');
          await page.evaluate(friends => {
            localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: {
              'dinosaur-care': { bestScore: 8, visitsFinished: friends.length, friends },
              'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} }
            } }));
          }, ids.slice(0, count));
          await page.reload();
          await page.locator('.care-tile').press('Enter');
          await page.locator('.friends-card').press('Enter');
          await page.locator('.friends-dig-site').waitFor();
          await settle(page);
          const label = `${width}x${height} ${language} ${theme} ${count}`;
          const measured = await page.evaluate(() => {
            const q = s => document.querySelector(s);
            const box = s => q(s).getBoundingClientRect().toJSON();
            const style = s => getComputedStyle(q(s));
            const fitting = e => e.scrollWidth <= e.clientWidth + 1;
            const cards = [...document.querySelectorAll('.friend-card')];
            const countPocket = () => q('.friend-art')?.getBoundingClientRect().height;
            const bar = [...q('.friends-bar').children].filter(e => !e.classList.contains('friends-invite')).map(e => e.getBoundingClientRect().toJSON());
            return {
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
              count: q('.friends-bar .friend-count').textContent,
              title: box('.friends-title'), bar,
              columns: q('.friends-grid') ? style('.friends-grid').gridTemplateColumns.split(' ').length : 0,
              cardNames: [...document.querySelectorAll('.friend-name')].every(fitting),
              titleFits: fitting(q('.friends-title-word')),
              action: box('.new-visitor-button, .no-friends-button'),
              actionFits: fitting(q('.new-visitor-button, .no-friends-button')),
              wave: box('.friends-sand-wave'), pathWidth: q('.friends-sand-wave path').getBBox().width, sand: box('.friends-sand'),
              pocketHeight: countPocket(),
              noHearts: cards.every(e => !e.querySelector('.friend-footer svg')),
              home: !!q('.friends-home svg.lucide-house'), back: !!q('.friends-back svg.lucide-arrow-left'),
              pit: q('.no-friends-picture') ? box('.no-friends-picture') : null,
              animations: cards.map(e => getComputedStyle(e).animationName),
              grid: q('.friends-grid') ? box('.friends-grid') : null
            };
          });
          assert(!measured.horizontalOverflow, `${label}: horizontal overflow`);
          assert.equal(measured.count, `${count}`, label);
          assert(measured.home && measured.back, `${label}: navigation`);
          assert(measured.title.width > 1 && measured.titleFits, `${label}: visible title fits`);
          assert(measured.bar.every(b => Math.abs(b.y + b.height / 2 - (measured.bar[0].y + measured.bar[0].height / 2)) < 1), `${label}: bar stays one row`);
          assert(measured.cardNames && measured.actionFits && measured.noHearts, `${label}: complete names and action fit`);
          assert(measured.action.x >= 0 && measured.action.right <= width + 1, `${label}: action inside window`);
          assert.equal(measured.wave.width, width, `${label}: wave reaches both sides`);
          assert.equal(measured.wave.x, 0, label);
          assert.equal(measured.pathWidth, 1440, `${label}: path covers the entire viewBox`);
          assert.equal(measured.columns, count ? columns : 0, label);
          assert.equal(measured.sand.y, sandTop, `${label}: sand starts at the design edge`);
          if (count) assert.equal(measured.pocketHeight, pocketHeight, `${label}: picture pocket height`);
          if (!count) assert.deepEqual([measured.pit.width, measured.pit.height], width < 600 ? [150, 150] : [200, 200], label);
          if (count) {
            assert(measured.animations.every(n => n === 'fade-in'), `${label}: reduced motion fades`);
            const sky = await page.locator('.friends-sky').boundingBox();
            await page.locator('.friends-grid').evaluate(e => { e.scrollTop = e.scrollHeight; });
            await page.locator('.friend-card').last().scrollIntoViewIfNeeded();
            assert.deepEqual(await page.locator('.friends-sky').boundingBox(), sky, `${label}: sky stays still`);
            const last = await page.locator('.friend-card').last().boundingBox();
            const floor = await page.locator('.friends-bedrock').isVisible() ? (await page.locator('.friends-bedrock').boundingBox()).y - 20 : height;
            assert(last.y >= measured.grid.y && last.y + last.height <= floor + 1, `${label}: last card clears the bottom layer`);
          }
          if (process.env.FRIENDS_SCREENSHOTS && [0, 5].includes(count)) {
            await mkdir(process.env.FRIENDS_SCREENSHOTS, { recursive: true });
            await page.locator('.friends-grid').evaluateAll(es => es.forEach(e => { e.scrollTop = 0; }));
            await page.screenshot({ path: join(process.env.FRIENDS_SCREENSHOTS, `${width}x${height}-${language}-${theme}-${count}.png`) });
          }
          checked++;
        }
      } finally { await context.close(); }
    }
    console.log(`PASS ${checked} Friends configurations: layout, tokens, empty state, names, motion and scrolling`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
