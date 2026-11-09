// Screenshots of both prototypes from a running dev server, for review.
// Usage, from rexlab/: node prototypes/trex-3d/shots.cjs <out-dir> [base-url]
const { chromium } = require('playwright');
const [out, base = 'http://127.0.0.1:5199'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const name of ['index', 'inflated']) {
    await page.goto(`${base}/prototypes/trex-3d/${name}.html`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}-picture-view.png` });
    // drag to turn it front on
    await page.mouse.move(960, 360); await page.mouse.down();
    await page.mouse.move(1110, 360, { steps: 5 }); await page.mouse.up();
    await page.screenshot({ path: `${out}/${name}-turned.png` });
  }
  await browser.close();
  if (errors.length) { console.error(errors); process.exit(1); }
})();
