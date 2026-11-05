// Contract test: find the pair's dig-site welcome laid out and fitted in Chromium.
const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { resolve, extname, join } = require('node:path');
const { chromium } = require('playwright');
// Each size's sand top and bedrock height, as its board draws them; a
// window no board draws takes its shape's.
const sizes = [[1133, 744, 206, 60], [1180, 820, 206, 60], [744, 1133, 206, 50], [820, 1180, 206, 50], [393, 852, 216, 30], [375, 667, 216, 14], [852, 393, 166, 0], [1440, 900, 206, 60]];
const LEVELS = ['hatchling', 'explorer', 'paleontologist'];
const returning = { stars: 23, level: 4, boardsOnLevel: 1, best: {}, found: ['triceratops', 'stegosaurus'] };
// The page is still only when two frames in a row show no turn and no
// finite animation.
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const running = () => document.getAnimations().filter(a => a.timeline === document.timeline && a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    const moving = () => document.documentElement.hasAttribute('data-turning') || running().length > 0;
    for (let still = 0; still < 2;) {
      if (moving()) { still = 0; await Promise.all(running().map(a => a.finished.catch(() => {}))); }
      await frame();
      still = moving() ? 0 : still + 1;
    }
  });
}
function inside(box, width, height, label) {
  assert(box.left >= -.5 && box.top >= -.5 && box.right <= width + .5 && box.bottom <= height + .5, `${label}: ${JSON.stringify(box)} leaves the window`);
}
function apart(a, b, label) {
  assert(a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5, `${label} overlap: ${JSON.stringify([a, b])}`);
}
async function welcome(page, width, height, label, { sandTop, bedrock, phone, short, climbing }) {
  const measured = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const fits = e => e.scrollWidth <= e.clientWidth + 1;
    const hit = e => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e.contains(top) || (top ? `${top.tagName}.${top.className}` : 'nothing'); };
    const body = q('.pairs-welcome-body');
    const main = q('.pairs-welcome');
    // On a phone on its side the sand is the screen's own backdrop.
    const sandTop = getComputedStyle(body).display === 'contents' ? parseFloat(getComputedStyle(main, '::before').top) : box(q('.pairs-welcome-sand')).y;
    return {
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      scrolls: [main, getComputedStyle(body).display === 'contents' ? main : body].some(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1),
      sandTop, wave: box(q('.pairs-welcome-wave')),
      bedrock: getComputedStyle(q('.pairs-welcome-bedrock')).display === 'none' ? 0 : box(q('.pairs-welcome-bedrock')).height,
      parts: {
        home: box(q('.pairs-welcome-home')), title: box(q('.pairs-title')), hero: box(q('.pairs-hero')),
        chips: box(q('.pairs-chips')), levels: box(q('.pairs-welcome .level-switch')), play: box(q('.pairs-play-button'))
      },
      cards: [...document.querySelectorAll('.pairs-hero-card')].map(box),
      chips: [...document.querySelectorAll('.pairs-chip')].filter(e => getComputedStyle(e.closest('.pairs-climb') ?? e).opacity !== '0').map(box),
      taps: [...document.querySelectorAll('.pairs-welcome button')].map(e => ({ label: e.getAttribute('aria-label') || e.textContent, ...box(e), hit: hit(e) })),
      words: [...document.querySelectorAll('.pairs-title-word, .pairs-play-word')].map(e => ({ text: e.textContent, fits: fits(e), size: parseFloat(getComputedStyle(e).fontSize), width: box(e).width })),
      names: [...document.querySelectorAll('.pairs-welcome .level-switch-level')].map(e => { const name = e.querySelector('.level-switch-name'); return { chosen: e.getAttribute('aria-pressed') === 'true', shown: getComputedStyle(name).position !== 'absolute', fits: fits(e) && name.getBoundingClientRect().right <= e.getBoundingClientRect().right + .5, size: parseFloat(getComputedStyle(name).fontSize) }; }),
      homeWord: getComputedStyle(q('.pairs-welcome-home span')).display !== 'none',
      pictures: [...document.querySelectorAll('.pairs-hero img')].map(e => e.naturalWidth > 0 && parseFloat(getComputedStyle(e).opacity) >= .85),
      version: getComputedStyle(q('#version')).display
    };
  });
  assert.deepEqual(measured.overflow, [false, false], `${label}: the page scrolls`);
  assert(!measured.scrolls, `${label}: the sand scrolls`);
  assert(Math.abs(measured.sandTop - sandTop) <= 1, `${label}: sand starts at ${measured.sandTop}, the board's at ${sandTop}`);
  assert.deepEqual([measured.wave.x, measured.wave.width], [0, width], `${label}: the wave reaches both sides`);
  assert.equal(measured.bedrock, bedrock, `${label}: bedrock height`);
  assert.equal(measured.version, 'none', `${label}: no version over the bedrock`);
  assert(measured.pictures.every(Boolean), `${label}: the dinosaur drawn`);
  const { parts } = measured;
  for (const [name, part] of Object.entries(parts)) inside(part, width, height, `${label} ${name}`);
  for (const card of measured.cards) inside(card, width, height - bedrock, `${label} card over the bedrock`);
  for (const name of ['chips', 'levels', 'play']) assert(parts[name].bottom <= height - bedrock + .5, `${label}: ${name} clears the bedrock`);
  const separate = ['title', 'hero', 'chips', 'levels', 'play'];
  for (const [i, a] of separate.entries()) for (const b of separate.slice(i + 1)) apart(parts[a], parts[b], `${label} ${a}/${b}`);
  for (const b of separate) apart(parts.home, parts[b], `${label} home/${b}`);
  if (!short) assert(parts.title.bottom <= sandTop + .5, `${label}: title stays in the sky`);
  assert.equal(measured.chips.length, climbing ? 2 : 1, `${label}: the climb level only at Hatchling`);
  for (const [i, a] of measured.chips.entries()) for (const b of measured.chips.slice(i + 1)) apart(a, b, `${label} chips`);
  for (const tap of measured.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: ${tap.label} is a tap target: ${JSON.stringify(tap)}`);
  for (const word of measured.words) assert(word.fits && word.size >= 18 && word.width > 1, `${label}: ${word.text} readable: ${JSON.stringify(word)}`);
  assert.equal(measured.homeWord, !phone, `${label}: HOME's word`);
  for (const name of measured.names) {
    assert.equal(name.shown, !phone || (!short && name.chosen), `${label}: which level names show`);
    assert(name.fits && name.size >= 13, `${label}: level name fits: ${JSON.stringify(name)}`);
  }
}

async function main() {
  const { build } = await import('vite');
  const bundle = await build({ root: resolve(__dirname, '..'), logLevel: 'error', build: { write: false } });
  const files = new Map(bundle.output.map(f => [f.fileName, f.type === 'chunk' ? f.code : f.source]));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let checked = 0;
  try {
    // Layout is measured in Russian, the longer text; screenshots take
    // both languages and both themes.
    const shots = process.env.PAIRS_SCREENSHOTS;
    const configs = sizes.flatMap(size => (shots ? ['en', 'ru'] : ['ru']).flatMap(language => (shots ? ['light', 'dark'] : ['light']).map(theme => [size, language, theme])));
    const run = async ([[width, height, sandTop, bedrock], language, theme]) => {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        await context.route('http://pairs.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
          await route.fulfill({ body: files.get(file) ?? await readFile(resolve(__dirname, '../public', file)), contentType: types[extname(file)] });
        });
        await context.addInitScript(({ language, theme }) => {
          Math.random = () => 0;
          localStorage.setItem('rexlab-language', language);
          localStorage.setItem('rexlab-theme', theme);
        }, { language, theme });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const phone = width < 600 || height < 600;
        for (const saved of [undefined, returning]) for (const level of LEVELS) {
          await page.goto('http://pairs.test/');
          await page.evaluate(({ saved, level }) => {
            localStorage.setItem('rexlab-age-level', JSON.stringify({ level, revision: 'pairs' }));
            localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: {
              ...(saved ? { 'find-the-pair': saved } : {}),
              'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} }
            } }));
          }, { saved, level });
          await page.reload();
          await page.locator('[data-turn-part="tile-pairs"]').press('Enter');
          await page.locator('.pairs-welcome').waitFor();
          await page.waitForFunction(() => [...document.querySelectorAll('.pairs-hero img')].every(e => ['appearing', 'shown'].includes(e.dataset.picture)));
          await settle(page);
          const visit = saved ? 'returning' : 'first';
          const label = `${width}x${height} ${language} ${theme} ${visit} ${level}`;
          if (shots) {
            await mkdir(shots, { recursive: true });
            await page.screenshot({ path: join(shots, `welcome-${width}x${height}-${language}-${theme}-${visit}-${level}.png`) });
          }
          await welcome(page, width, height, label, { sandTop, bedrock, phone, short: height < 600, climbing: level === 'hatchling' });
          checked++;
        }
        assert.deepEqual(errors, [], `${width}x${height} ${language} ${theme}: page errors`);
      } finally { await context.close(); }
    };
    const queue = [...configs];
    await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await run(queue.shift()); }));
    console.log(`PASS ${checked} find the pair welcome configurations: layout, fit, overlap, scrolling, labels and tap targets`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
