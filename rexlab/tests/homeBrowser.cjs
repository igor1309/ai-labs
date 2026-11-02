const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { resolve, extname, join } = require('node:path');
const { chromium } = require('playwright');

const games = ['compare', 'catalogue', 'pairs', 'skeletons', 'dig', 'sort', 'care', 'sandWriting', 'labyrinth', 'picturePuzzle', 'whoseJaw', 'coloring'];
const levels = ['hatchling', 'explorer', 'paleontologist'];
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-turning'));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
exports.runHome = async function(sizes) {
  const { build } = await import('vite');
  const bundle = await build({ root: resolve(__dirname, '..'), logLevel: 'error', build: { write: false } });
  const files = new Map(bundle.output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source]));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let checked = 0;
  try {
    if (process.env.HOME_SCREENSHOTS) await mkdir(process.env.HOME_SCREENSHOTS, { recursive: true });
    for (const [width, height] of sizes) for (const language of ['en', 'ru']) for (const theme of ['light', 'dark']) for (const level of levels) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        await context.route('http://home.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
          await route.fulfill({ body: files.get(file) ?? await readFile(resolve(__dirname, '../public', file)), contentType: types[extname(file)] });
        });
        await context.addInitScript(({ language, theme, level }) => {
          localStorage.setItem('rexlab-language', language);
          localStorage.setItem('rexlab-theme', theme);
          localStorage.setItem('rexlab-age-level', JSON.stringify({ level, revision: 'home-sky' }));
          Math.random = () => 0;
        }, { language, theme, level });
        const page = await context.newPage();
        await page.goto('http://home.test/');
        await page.locator('.home').waitFor();
        await settle(page);
        // All artwork and full names fit at the narrowest phone and at an iPad.
        const variants = level === 'explorer' && theme === 'light' && (width === 1180 || width === 393 || width === 320) ? games : ['compare'];
        for (const game of variants) {
          if (game !== 'compare') {
            await page.evaluate(game => {
              const record = JSON.parse(localStorage.getItem('rexlab-progress'));
              record.games['home-featured'].featured.game = game;
              localStorage.setItem('rexlab-progress', JSON.stringify(record));
            }, game);
            await page.reload();
            await settle(page);
          }
          const label = `${width}x${height} ${language} ${theme} ${level} ${game}`;
          const measured = await page.evaluate(() => {
            const part = selector => document.querySelector(selector);
            const box = element => { const { x, y, width, height, right, bottom } = element.getBoundingClientRect(); return { x, y, width, height, right, bottom, cropped: !!element.closest(".picture-puzzle-crop") }; };
            const title = part('.featured-card-title');
            const sky = part('.home-sky');
            const museumWord = part('.home-museum-word');
            return {
              overflow: document.documentElement.scrollWidth > innerWidth,
              header: box(part('.home-header')),
              brand: box(part('.wordmark')),
              corner: box(part('.home-corner')),
              controls: [...part('.home-corner').querySelectorAll('button')].map(box),
              museumHidden: getComputedStyle(museumWord).clipPath === 'inset(50%)',
              museumWrap: getComputedStyle(part('.home-museum')).whiteSpace,
              title: box(title), actions: box(part('.home-today-actions')), art: box(part('.home-today-art')), sky: box(sky),
              titleFits: title.scrollWidth <= title.clientWidth + 1,
              images: [...part('.home-today-art').querySelectorAll('img')].map(box),
              tiles: [...document.querySelectorAll('.tiles-grid > *')].map(box),
              layerColumns: [...document.querySelectorAll('.tiles-grid')].map(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
              pocketHeights: [...document.querySelectorAll('.home-tile-pocket')].map(e => e.getBoundingClientRect().height),
              bands: [...document.querySelectorAll('.home-layer')].map(e => getComputedStyle(e).backgroundColor),
              bedrock: getComputedStyle(part('.home-bedrock')).backgroundColor,
              note: part('.home-parent-note').textContent,
              version: part('.home-version').textContent,
              release: part('meta[name="rexlab-version"]').content,
              groundScroll: part('.games-tiles').scrollWidth > part('.games-tiles').clientWidth,
              titlesFit: [...part('.games-tiles').querySelectorAll('.home-tile-title')].every(t => t.scrollWidth <= t.clientWidth + 1),
              noFeaturedTile: !part(`.games-tiles [data-turn-part="tile-${part('.featured-card').dataset.game}"]`),
              tag: part('.home-today-tag').textContent,
              play: part('.home-play').textContent,
              animations: [part('.home-today-copy'), part('.home-today-art')].map(e => getComputedStyle(e).animationName),
              skyCore: getComputedStyle(part('.home-sky-body span')).backgroundColor,
              coreToken: getComputedStyle(document.documentElement).getPropertyValue('--ds-sky-core').trim()
            };
          });
          assert(!measured.overflow, `${label}: horizontal page overflow`);
          assert(measured.brand.right + 4 <= measured.corner.x, `${label}: header overlaps`);
          assert.equal(measured.museumHidden, Math.min(width, height) < 600, `${label}: museum word`);
          assert.equal(measured.museumWrap, 'nowrap', label);
          assert(measured.controls.every(b => b.width >= 44 && b.height >= 44), `${label}: control targets`);
          assert(measured.header.bottom <= measured.title.y, `${label}: header meets title`);
          assert(measured.titleFits, `${label}: full title`);
          assert(measured.actions.bottom <= measured.sky.bottom, `${label}: actions clipped`);
          assert(measured.images.every(b => b.width > 0 && b.height > 0 && (b.cropped || (b.x >= 0 && b.right <= width + 1 && b.bottom <= measured.sky.bottom))), `${label}: artwork clipped`);
          assert(measured.tiles.every(b => b.height >= 44), `${label}: tile targets`);
          assert(measured.titlesFit, `${label}: tile names clipped`);
          assert(measured.noFeaturedTile, `${label}: featured tile repeated`);
          assert.equal(measured.tag, language === 'en' ? 'TODAY' : 'СЕГОДНЯ', label);
          assert.equal(measured.play, language === 'en' ? 'PLAY' : 'ИГРАТЬ', label);
          assert.deepEqual(measured.animations, ['fade-in', 'fade-in'], label);
          assert(!measured.groundScroll, `${label}: ground scrolls sideways`);
          if (width === 1180 || width === 1133) assert.deepEqual(measured.layerColumns, [6, 6], `${label}: six iPad tiles per band`);
          if (width === 393 || width === 375) assert.deepEqual(measured.layerColumns, [3, 3], `${label}: three phone tiles per row`);
          assert(measured.pocketHeights.every(h => h === (Math.min(width, height) < 600 ? 88 : 96)), `${label}: pocket size`);
          assert.notEqual(measured.bands[0], measured.bands[1], `${label}: earth deepens`);
          assert.notEqual(measured.bands[1], measured.bedrock, `${label}: bedrock`);
          assert(measured.note.includes(language === 'en' ? 'Settings' : 'Настройки'), `${label}: parents' note`);
          assert.equal(measured.version, measured.release, `${label}: release version`);
          checked++;
        }
        if (variants.length > 1) {
          await page.evaluate(() => {
            const record = JSON.parse(localStorage.getItem('rexlab-progress'));
            record.games['home-featured'].featured.game = 'compare';
            localStorage.setItem('rexlab-progress', JSON.stringify(record));
          });
          await page.reload();
          await settle(page);
        }
        if (language === 'en' && process.env.HOME_SCREENSHOTS) {
          await page.screenshot({ path: join(process.env.HOME_SCREENSHOTS, `sky-${width}x${height}-${theme}-${level}.png`), fullPage: true });
        }
        if (language === 'en' && theme === 'light' && level === 'explorer') {
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          assert.deepEqual(await page.locator('.home-today-copy, .home-today-art').evaluateAll(elements => elements.map(e => getComputedStyle(e).animationName)), ['rise-in', 'rise-in']);
          await page.emulateMedia({ reducedMotion: 'reduce' });
        }
        if (language === 'en' && theme === 'light' && level === 'explorer') {
          await page.evaluate(games => {
            const record = JSON.parse(localStorage.getItem('rexlab-progress'));
            record.games['home-first-visit'] = { games: games.filter(game => game !== 'catalogue') };
            localStorage.setItem('rexlab-progress', JSON.stringify(record));
          }, games);
          await page.reload();
          await settle(page);
          assert.deepEqual(await page.locator('.home-new').allTextContents(), ['NEW']);
          assert.equal(await page.locator('.catalogue-tile .home-new').textContent(), 'NEW');
          await page.locator('.catalogue-tile').press('Enter');
          await page.locator('.catalogue').waitFor();
          await settle(page);
          await page.locator('.catalogue .home-button').press('Enter');
          await page.locator('.home').waitFor();
          await settle(page);
          assert.equal(await page.locator('.home-new').count(), 0);
        }
        // Turning keeps today's game and an open parents' menu.
        const featuredBeforeTurn = await page.locator('.featured-card').getAttribute('data-game');
        await page.locator('.parent-menu-button').first().click();
        await page.setViewportSize({ width: height, height: width });
        await settle(page);
        assert.equal(await page.getByRole('menu').count(), 1);
        assert.equal(await page.locator('.featured-card').getAttribute('data-game'), featuredBeforeTurn);
        const museum = await page.locator('.home-museum').boundingBox();
        await page.mouse.click(museum.x + museum.width / 2, museum.y + museum.height / 2);
        await settle(page);
        assert.equal(await page.locator('.home').count(), 1);
        await page.locator('.home-museum').press('Enter');
        await page.locator('.skeleton-museum-screen').waitFor();
      } finally { await context.close(); }
    }
    console.log(`PASS ${checked} Home configurations: sky, pocket tiles, earth bands, bedrock, menus and museum`);
  } finally { await browser.close(); }
};
