// Contract test: the bundled GLB, WebGL canvas, fallback and Home navigation in Chromium.
const assert = require('node:assert/strict');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { join, resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const { appFiles } = require('./appBuild.cjs');

const sizes = process.env.SKELETON_SIZES ? JSON.parse(process.env.SKELETON_SIZES) : [[1180, 820], [744, 1133], [852, 393], [393, 852], [1440, 900], [320, 568], [667, 375], [1133, 744], [1920, 1080]];
const levels = ['hatchling', 'explorer', 'paleontologist'];
const output = process.env.SKELETON_SCREENSHOTS;
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function featureBones(page) {
  await page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('rexlab-progress'));
    progress.games['home-featured'].featured.game = 'skeletons';
    localStorage.setItem('rexlab-progress', JSON.stringify(progress));
  });
  await page.reload();
}
async function ready(page) {
  await page.locator('.home-skeleton-hero[data-ready]').waitFor();
  await settle(page);
}
async function frames(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  });
}
async function visibleFallback(page) {
  await page.waitForFunction(() => {
    const hero = document.querySelector('.home-skeleton-hero');
    const image = hero?.querySelector('img');
    return hero && !hero.hasAttribute('data-ready') && image?.complete && image.naturalWidth > 0;
  });
  await settle(page);
  assert.equal(await page.locator('.skeletons-hero-fallback').evaluate(e => getComputedStyle(e).opacity), '1');
}
async function run() {
  const files = await appFiles();
  const glb = [...files.keys()].find(file => /tyrannosaurus.*\.glb$/.test(file));
  assert(glb && files.get(glb).length < 2_000_000, 'self-contained optimized GLB ships with the app');
  assert(files.get('sw.js').includes(Buffer.from(glb)), 'release includes GLB in its offline file list');
  if (output) await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  const errors = [];
  let captures = 0;
  try {
    for (const [width, height] of sizes) for (const level of levels) for (const theme of width === 1180 || width === 393 ? ['light', 'dark'] : ['light']) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const requests = [];
        await context.route('http://skeleton.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          requests.push(file);
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary' };
          await route.fulfill({ body: files.get(file) ?? await readFile(resolve(__dirname, '../public', file)), contentType: types[extname(file)] || 'application/octet-stream' });
        });
        await context.addInitScript(({ level, theme }) => {
          localStorage.setItem('rexlab-language', 'en');
          localStorage.setItem('rexlab-theme', theme);
          localStorage.setItem('rexlab-age-level', JSON.stringify({ level, revision: 'home-sky' }));
          Math.random = () => 0;
          window.skeletonDraws = 0;
          const draw = WebGL2RenderingContext.prototype.drawElements;
          WebGL2RenderingContext.prototype.drawElements = function(...args) {
            window.skeletonDraws++;
            return draw.apply(this, args);
          };
        }, { level, theme });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://skeleton.test/');
        await page.locator('.home').waitFor();
        await settle(page);
        assert(!requests.some(file => /skeletonHeroScene|\.glb$/.test(file)), 'other featured games do not load 3D dependencies');
        await featureBones(page);
        await ready(page);
        const box = await page.locator('.home-skeleton-hero canvas').boundingBox();
        const artBox = await page.locator('.home-today-art').boundingBox();
        const skyBox = await page.locator('.home-sky').boundingBox();
        // Landscape Home scrolls: the drawing surface fits its existing art slot,
        // whose bottom clears the earth's wave; it need not fit the viewport height.
        assert.deepEqual(box, artBox, `${width}x${height}: canvas fills the existing hero space`);
        assert(box.width > 0 && box.height > 0 && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= skyBox.y + skyBox.height - 26, `${width}x${height}: hero fits sky ${JSON.stringify({ box, artBox, skyBox })}`);
        const layout = await page.evaluate(() => {
          const art = document.querySelector('.home-skeleton-hero');
          const canvas = art.querySelector('canvas');
          return {
            size: document.documentElement.dataset.size,
            canvas: [canvas.width, canvas.height],
            interactive: getComputedStyle(canvas).pointerEvents,
            fallback: getComputedStyle(art.querySelector('.skeletons-hero-fallback')).opacity,
            overflow: document.documentElement.scrollWidth > innerWidth,
            title: document.querySelector('.featured-card-title').textContent,
            play: document.querySelector('.home-play').textContent
          };
        });
        assert(layout.canvas.every(n => n > 0) && layout.interactive === 'none' && layout.fallback === '0' && !layout.overflow, 'canvas renders decoratively, without overflow');
        assert(layout.title.includes('SKELETON') && layout.play === 'PLAY', 'title and PLAY retained');
        const controls = await page.locator('.featured-card-title, .home-play, .home-today-progress, .home-header').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
        assert(controls.every(rect => rect.x >= 0 && rect.y >= 0 && rect.right <= width + 1 && rect.bottom <= height + 1), `${width}x${height}: title, PLAY, saved progress and top menus fit the first viewport`);
        if (output) {
          const name = `${width}x${height}-${level}-${theme}`;
          for (const tile of await page.locator('.home-ground-tile').all()) {
            await tile.scrollIntoViewIfNeeded();
            await page.waitForFunction(e => e.dataset.homeEntrance === 'revealed', await tile.elementHandle());
          }
          await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
          await frames(page); await settle(page);
          await page.screenshot({ path: join(output, `${name}.png`) });
          await page.screenshot({ path: join(output, `${name}-page.png`), fullPage: true });
          await page.locator('.home-skeleton-hero').screenshot({ path: join(output, `${name}-hero.png`) });
          captures++;
        }
        if (width === 1180 && level === 'explorer' && theme === 'light') {
          const staticDraws = await page.evaluate(() => window.skeletonDraws);
          await frames(page);
          assert.equal(await page.evaluate(() => window.skeletonDraws), staticDraws, 'reduced motion has no continuous GPU draws');
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await frames(page);
          assert(await page.evaluate(() => window.skeletonDraws) > staticDraws, 'normal motion renders continuously');
          await page.evaluate(() => {
            window.heroVisible = false;
            Object.defineProperty(document, 'visibilityState', { get: () => window.heroVisible ? 'visible' : 'hidden', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
          });
          const pausedDraws = await page.evaluate(() => window.skeletonDraws);
          await frames(page);
          assert.equal(await page.evaluate(() => window.skeletonDraws), pausedDraws, 'hidden page pauses GPU draws');
          await page.evaluate(() => {
            window.heroVisible = true;
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await frames(page);
          assert(await page.evaluate(() => window.skeletonDraws) > pausedDraws, 'visible page resumes GPU draws');
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await settle(page);
          // The same canvas survives resizing without replaying its ready state.
          const canvas = await page.locator('.home-skeleton-hero canvas').elementHandle();
          await page.setViewportSize({ width: 744, height: 1133 }); await ready(page);
          assert(await canvas.evaluate(e => e === document.querySelector('.home-skeleton-hero canvas')), 'resize retains renderer');
          await page.setViewportSize({ width, height }); await ready(page);
          await page.evaluate(() => document.querySelector('.home-skeleton-hero canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
          await visibleFallback(page);
          if (output) await page.screenshot({ path: join(output, 'context-loss-fallback.png'), fullPage: true });
          await page.locator('.featured-card').press('Enter');
          await page.locator('.skeleton-choices').waitFor();
          assert.equal(await page.locator('.home-skeleton-hero').count(), 0, 'leaving Home removes canvas');
          await page.getByRole('button', { name: 'HOME', exact: true }).press('Enter');
          await ready(page);
          // A double tap on artwork opens once and never chooses a dinosaur.
          await page.locator('.home-today-art').dblclick({ delay: 50 });
          await page.locator('.skeleton-choices').waitFor();
          assert.equal(await page.locator('.skeleton-choices').count(), 1);
          await page.getByRole('button', { name: 'HOME', exact: true }).press('Enter'); await ready(page);
          // A failed asset leaves the original picture and the same working door.
          await context.route('**/*.glb', route => route.abort());
          await page.reload(); await visibleFallback(page);
          await page.locator('.featured-card').press('Enter'); await page.locator('.skeleton-choices').waitFor();
          await context.unroute('**/*.glb');
          await page.getByRole('button', { name: 'HOME', exact: true }).press('Enter'); await ready(page);
          // No WebGL: fail renderer construction, keeping ordinary navigation.
          await context.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /^webgl/.test(type) ? null : original.call(this, type, ...args); };
          });
          await page.reload(); await visibleFallback(page);
          await page.locator('.featured-card').press('Enter'); await page.locator('.skeleton-choices').waitFor();
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    if (output) await writeFile(join(output, 'manifest.json'), JSON.stringify({ captures, sizes, levels }, null, 2));
    console.log(`PASS Home skeleton: ${captures} screenshot layouts; real GLB, lazy dependencies, resize, fallback, context loss and navigation`);
  } finally { await browser.close(); }
}
run().catch(error => { console.error(`FAIL Home skeleton: ${error.stack}`); process.exitCode = 1; });
