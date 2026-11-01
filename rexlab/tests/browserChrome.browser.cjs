// WebKit page rendering only: native iOS status-bar sampling requires a device.
const assert = require('node:assert/strict');
const { mkdtemp, rm, mkdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { webkit } = require('playwright');

(async () => {
  const output = await mkdtemp(join(tmpdir(), 'rexlab-chrome-'));
  let server, browser;
  try {
    const { build, preview } = await import('vite');
    const root = resolve(__dirname, '..');
    await build({ root, logLevel: 'error', build: { outDir: output } });
    server = await preview({ root, logLevel: 'error', build: { outDir: output }, preview: { host: '127.0.0.1', port: 0, open: false } });
    browser = await webkit.launch();
    const sizes = [['phone-portrait', 393, 852], ['phone-landscape', 852, 393], ['tablet-portrait', 820, 1180], ['tablet-landscape', 1180, 820], ['mac', 1440, 900]];
    const screenshots = process.env.REXLAB_SCREENSHOTS;
    if (screenshots) await mkdir(screenshots, { recursive: true });
    let checked = 0;
    for (const theme of ['light', 'dark']) for (const level of ['hatchling', 'explorer', 'paleontologist']) for (const [name, width, height] of sizes) {
      // Opposite device appearance proves that an explicit parent choice wins.
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' });
      try {
        await context.addInitScript(({ theme, level }) => {
          localStorage.setItem('rexlab-language', 'en');
          localStorage.setItem('rexlab-theme', theme);
          localStorage.setItem('rexlab-age-level', JSON.stringify({ level, revision: 'parent' }));
        }, { theme, level });
        const page = await context.newPage();
        await page.goto(server.resolvedUrls.local[0]);
        await page.locator('.home').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const expected = theme === 'dark' ? 'rgb(15, 19, 32)' : 'rgb(242, 239, 232)';
        const check = async () => {
          const colours = await page.evaluate(() => [document.documentElement, document.body, document.querySelector('.app-top-edge')].map(el => getComputedStyle(el).backgroundColor));
          assert.deepEqual(colours, [expected, expected, expected]);
          assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), theme === 'dark' ? '#0f1320' : '#f2efe8');
        };
        await check();
        const image = await page.locator('.wordmark-mark').evaluate(async el => {
          const css = getComputedStyle(el).backgroundImage;
          const url = css.match(/url\(["']?(.*?)["']?\)/)?.[1];
          if (!url) return false;
          const image = new Image(); image.src = url;
          await image.decode();
          return image.naturalWidth === 180;
        });
        assert(image, `${theme}/${level}/${name}: app icon missing`);
        if (screenshots) await page.screenshot({ path: join(screenshots, `${theme}-${level}-${name}-home.png`) });
        await page.getByRole('button', { name: 'COLOR A DINOSAUR', exact: true }).press('Enter');
        await page.locator('.gallery-works[aria-busy="false"]').waitFor();
        await check();
        if (screenshots) await page.screenshot({ path: join(screenshots, `${theme}-${level}-${name}-gallery.png`) });
        checked++;
      } finally { await context.close(); }
    }
    console.log(`PASS: WebKit home and gallery, ${checked} theme/age/viewport combinations`);
  } finally {
    await browser?.close();
    await server?.httpServer.close();
    await rm(output, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
