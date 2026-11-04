// Contract test: the tooth game's dig-site screens laid out, fitted and moving in Chromium.
const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { resolve, extname, join } = require('node:path');
const { chromium } = require('playwright');
// Each size's sand top and bedrock height, as its board draws them; a
// window no board draws takes its shape's.
const sizes = [[1133, 744, 206, 60], [744, 1133, 206, 50], [393, 852, 208, 30], [375, 667, 186, 14], [852, 393, 124, 0], [1440, 900, 206, 60]];
const returning = { best: { hatchling: 3, explorer: 2, paleontologist: null }, earned: ['tyrannosaurus', 'triceratops', 'stegosaurus', 'brachiosaurus', 'velociraptor'] };
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-turning'));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
function inside(box, width, height, label) {
  assert(box.left >= -.5 && box.top >= -.5 && box.right <= width + .5 && box.bottom <= height + .5, `${label}: ${JSON.stringify(box)} leaves the window`);
}
function apart(a, b, label) {
  assert(a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5, `${label} overlap: ${JSON.stringify([a, b])}`);
}
async function welcome(page, width, height, label, { sandTop, bedrock, phone, best }) {
  const measured = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const fits = e => e.scrollWidth <= e.clientWidth + 1;
    const shown = e => getComputedStyle(e).position !== 'absolute';
    const hit = e => { const b = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); };
    const body = q('.whose-jaw-welcome-body');
    const levels = [...document.querySelectorAll('.whose-jaw-welcome .level-switch-level')];
    return {
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      scrolls: body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1,
      parts: {
        home: box(q('.whose-jaw-welcome-home')), audio: box(q('.whose-jaw-welcome .game-audio-button')),
        title: box(q('.whose-jaw-welcome-title')), hero: box(q('.whose-jaw-hero')), jaw: box(q('.whose-jaw-chomp')),
        badges: box(q('.whose-jaw-badges')), levels: box(q('.whose-jaw-welcome .level-switch')),
        play: box(q('.whose-jaw-play')), shelf: box(q('.whose-jaw-shelf'))
      },
      chips: [...document.querySelectorAll('.whose-jaw-badges p')].map(box),
      taps: [...document.querySelectorAll('.whose-jaw-welcome button')].map(e => ({ label: e.getAttribute('aria-label') || e.textContent, ...box(e), hit: hit(e) })),
      words: [...document.querySelectorAll('.whose-jaw-welcome-word, .whose-jaw-action-word')].map(e => ({ text: e.textContent, fits: fits(e), size: parseFloat(getComputedStyle(e).fontSize), width: box(e).width })),
      names: levels.map(e => { const name = e.querySelector('.level-switch-name'); return { chosen: e.getAttribute('aria-pressed') === 'true', shown: shown(name), fits: fits(e) && name.getBoundingClientRect().right <= e.getBoundingClientRect().right + .5, size: parseFloat(getComputedStyle(name).fontSize) }; }),
      homeWord: getComputedStyle(q('.whose-jaw-welcome-home span')).display !== 'none',
      sand: box(q('.whose-jaw-welcome-sand')), wave: box(q('.whose-jaw-welcome-wave')),
      bedrock: getComputedStyle(q('.whose-jaw-welcome-bedrock')).display === 'none' ? 0 : box(q('.whose-jaw-welcome-bedrock')).height,
      pictures: [...document.querySelectorAll('.whose-jaw-hero img')].map(e => e.naturalWidth > 0 && getComputedStyle(e).opacity === '1'),
      chomp: getComputedStyle(q('.whose-jaw-chomp')).animationName,
      version: getComputedStyle(q('#version')).display
    };
  });
  assert.deepEqual(measured.overflow, [false, false], `${label}: the page scrolls`);
  assert(!measured.scrolls, `${label}: the sand scrolls`);
  assert.equal(measured.sand.y, sandTop, `${label}: sand starts at the board's edge`);
  assert.deepEqual([measured.wave.x, measured.wave.width], [0, width], `${label}: the wave reaches both sides`);
  assert.equal(measured.bedrock, bedrock, `${label}: bedrock height`);
  assert.equal(measured.version, 'none', `${label}: no version over the bedrock`);
  assert(measured.pictures.every(Boolean), `${label}: jaw and gummy drawn`);
  assert.equal(measured.chomp, 'fade-in', `${label}: reduced motion fades the jaw in`);
  const { parts } = measured;
  for (const [name, part] of Object.entries(parts)) inside(part, width, height, `${label} ${name}`);
  inside(parts.jaw, width, bedrock ? height - bedrock : height, `${label} jaw over the bedrock`);
  for (const name of ['play', 'shelf', 'levels', 'badges']) assert(parts[name].bottom <= height - bedrock + .5, `${label}: ${name} clears the bedrock`);
  const separate = ['title', 'hero', 'badges', 'levels', 'play', 'shelf'];
  for (const [i, a] of separate.entries()) for (const b of separate.slice(i + 1)) apart(parts[a], parts[b], `${label} ${a}/${b}`);
  for (const a of ['home', 'audio']) for (const b of separate) apart(parts[a], parts[b], `${label} ${a}/${b}`);
  apart(parts.home, parts.audio, `${label} home/audio`);
  assert(parts.title.bottom <= sandTop, `${label}: title stays in the sky`);
  assert.equal(measured.chips.length, best ? 2 : 1, `${label}: best chip only with a best`);
  for (const tap of measured.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit, `${label}: ${tap.label} is a tap target: ${JSON.stringify(tap)}`);
  for (const word of measured.words) assert(word.fits && word.size >= 18 && word.width > 1, `${label}: ${word.text} readable: ${JSON.stringify(word)}`);
  assert.equal(measured.homeWord, !phone, `${label}: HOME's word`);
  for (const name of measured.names) {
    assert.equal(name.shown, !phone || name.chosen, `${label}: which level names show`);
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
    for (const [width, height, sandTop, bedrock] of sizes) for (const language of ['en', 'ru']) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        await context.route('http://teeth.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
          await route.fulfill({ body: files.get(file) ?? await readFile(resolve(__dirname, '../public', file)), contentType: types[extname(file)] });
        });
        await context.addInitScript(({ language, theme }) => {
          Math.random = () => 0;
          localStorage.setItem('rexlab-language', language);
          localStorage.setItem('rexlab-theme', theme);
          localStorage.setItem('rexlab-age-level', JSON.stringify({ level: 'explorer', revision: 'teeth' }));
        }, { language, theme });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const saved of [undefined, returning]) {
          await page.goto('http://teeth.test/');
          await page.evaluate(saved => {
            localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: {
              ...(saved ? { 'whose-jaw': saved } : {}),
              'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} }
            } }));
          }, saved);
          await page.reload();
          await page.locator('[data-turn-part="tile-whoseJaw"]').press('Enter');
          await page.locator('.whose-jaw-welcome').waitFor();
          await page.waitForFunction(() => [...document.querySelectorAll('.whose-jaw-hero img')].every(e => ['appearing', 'shown'].includes(e.dataset.picture)));
          await settle(page);
          const label = `${width}x${height} ${language} ${theme} ${saved ? 'returning' : 'first visit'}`;
          await welcome(page, width, height, label, { sandTop, bedrock, phone: width < 600 || height < 600, best: !!saved });
          if (process.env.TEETH_SCREENSHOTS) {
            await mkdir(process.env.TEETH_SCREENSHOTS, { recursive: true });
            await page.screenshot({ path: join(process.env.TEETH_SCREENSHOTS, `welcome-${width}x${height}-${language}-${theme}-${saved ? 'returning' : 'first'}.png`) });
          }
          checked++;
        }
        assert.deepEqual(errors, [], `${width}x${height} ${language} ${theme}: page errors`);
      } finally { await context.close(); }
    }
    console.log(`PASS ${checked} WHOSE JAW? welcome configurations: layout, fit, overlap, scrolling, labels and motion`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
