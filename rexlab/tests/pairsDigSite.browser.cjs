// Contract test: find the pair's dig-site welcome, board and result laid out and fitted in Chromium.
const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { resolve, extname, join } = require('node:path');
const { chromium } = require('playwright');
// Each size's sand top on the welcome and on the board, and bedrock
// height, as its boards draw them; a window no board draws takes its
// shape's.
const sizes = [[1133, 744, 206, 108, 60], [1180, 820, 206, 108, 60], [744, 1133, 206, 116, 50], [820, 1180, 206, 116, 50], [393, 852, 216, 144, 30], [375, 667, 216, 144, 14], [852, 393, 166, 78, 0], [1440, 900, 206, 108, 60]];
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
      pictures: [...document.querySelectorAll('.pairs-hero img')].map(e => e.naturalWidth > 0).concat(getComputedStyle(q('.pairs-hero-shadow')).display === 'block', getComputedStyle(q('.pairs-hero-picture-card img')).opacity === '1'),
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

// The board fits its window whole: the bar in the sky, every card on the
// sand clear of the bedrock and of each other, nothing scrolling.
async function board(page, width, height, label, { sandTop, bedrock, phone, short, opened }) {
  const measured = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const shown = e => e && getComputedStyle(e).position !== 'absolute' && getComputedStyle(e).display !== 'none';
    const hit = e => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e.contains(top) || (top ? `${top.tagName}.${top.className}` : 'nothing'); };
    const main = q('.pairs-board-screen');
    const open = q('.pair-card[data-state="open"]');
    return {
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      scrolls: main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1,
      sandTop: box(q('.pairs-board-sand')).y, wave: box(q('.pairs-board-wave')),
      bedrock: getComputedStyle(q('.pairs-board-bedrock')).display === 'none' ? 0 : box(q('.pairs-board-bedrock')).height,
      bar: [...document.querySelectorAll('.pairs-bar button, .pairs-bar-chip')].map(box).concat(shown(q('.pairs-bar-title')) ? [box(q('.pairs-bar-title'))] : []),
      cards: [...document.querySelectorAll('.pair-card')].map(box),
      taps: [...document.querySelectorAll('.pairs-board-screen button')].map(e => ({ label: e.getAttribute('aria-label') || e.textContent, ...box(e), hit: hit(e) })),
      words: [...document.querySelectorAll('.pairs-bar-word, .pairs-bar-name, .pairs-bar-number')].filter(shown).map(e => ({ text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= e.parentElement.getBoundingClientRect().right + .5, size: parseFloat(getComputedStyle(e).fontSize) })),
      title: shown(q('.pairs-bar-title')), homeWord: shown(q('.pairs-bar-home .pairs-bar-name')),
      picture: open && (() => { const img = open.querySelector('img'); const card = box(open), art = box(img); return img.naturalWidth > 0 && art.left >= card.left && art.right <= card.right + .5 && art.top >= card.top && art.bottom <= card.bottom + .5; })(),
      version: getComputedStyle(q('#version')).display
    };
  });
  assert.deepEqual(measured.overflow, [false, false], `${label}: the page scrolls`);
  assert(!measured.scrolls, `${label}: the board scrolls`);
  assert(Math.abs(measured.sandTop - sandTop) <= 1, `${label}: sand starts at ${measured.sandTop}, the board's at ${sandTop}`);
  assert.deepEqual([measured.wave.x, measured.wave.width], [0, width], `${label}: the wave reaches both sides`);
  assert.equal(measured.bedrock, bedrock, `${label}: bedrock height`);
  assert.equal(measured.version, 'none', `${label}: no version over the bedrock`);
  for (const part of measured.bar) { inside(part, width, height, `${label} bar`); assert(part.bottom <= sandTop + .5, `${label}: the bar stays in the sky`); }
  for (const [i, a] of measured.bar.entries()) for (const b of measured.bar.slice(i + 1)) apart(a, b, `${label} bar`);
  for (const card of measured.cards) { inside(card, width, height - bedrock, `${label} card over the bedrock`); assert(card.top >= sandTop - .5, `${label}: card on the sand`); }
  for (const [i, a] of measured.cards.entries()) for (const b of measured.cards.slice(i + 1)) apart(a, b, `${label} cards`);
  for (const tap of measured.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: ${tap.label} is a tap target: ${JSON.stringify(tap)}`);
  for (const word of measured.words) assert(word.fits && word.size >= 15, `${label}: ${word.text} readable: ${JSON.stringify(word)}`);
  assert.equal(measured.title, !phone || short, `${label}: the title shows`);
  assert.equal(measured.homeWord, !phone, `${label}: HOME's word`);
  if (opened) assert.equal(measured.picture, true, `${label}: the open card's picture drawn inside it`);
}

// Plays a board out, turning each card and remembering its picture, or
// by the pairs already known; returns the pairs for a perfect replay.
async function playOut(page, known) {
  const count = await page.locator('.pair-card').count();
  const turn = async index => {
    await page.locator(`.pair-card[data-turn-part="pair-card-${index}"]`).press('Enter');
    await page.waitForFunction(i => { const c = document.querySelector(`[data-turn-part="pair-card-${i}"]`); return c.dataset.state !== 'down' && c.querySelector('img'); }, index);
    return page.locator(`.pair-card[data-turn-part="pair-card-${index}"] img`).getAttribute('src');
  };
  const settled = () => page.waitForFunction(() => !document.querySelector('.pair-card[data-state="open"]') || document.querySelector('.pairs-result'));
  if (known) {
    for (const [a, b] of known) { await turn(a); await turn(b); await settled(); }
    return known;
  }
  const seen = new Map(), pairs = [];
  let pending = [...Array(count).keys()];
  while (pending.length) {
    const first = pending.shift(), picture = await turn(first);
    if (seen.has(picture)) {
      const other = seen.get(picture);
      await turn(other); pairs.push([other, first]); seen.delete(picture); await settled();
      continue;
    }
    seen.set(picture, first);
    const second = pending.shift(), secondPicture = await turn(second);
    if (secondPicture === picture) { pairs.push([first, second]); seen.delete(picture); await settled(); continue; }
    await settled();
    if (seen.has(secondPicture)) {
      const other = seen.get(secondPicture);
      await turn(other); await turn(second); pairs.push([other, second]); seen.delete(secondPicture); await settled();
    } else seen.set(secondPicture, second);
  }
  return pairs;
}
// The result fits its window: nothing crosses a side, nothing overlaps,
// the dinosaurs and the words readable, the actions on the sand and clear
// of the bedrock. Only a window too short for its column scrolls.
async function result(page, width, height, label, { scrolls }) {
  const m = await page.evaluate(() => {
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const all = s => [...document.querySelectorAll(s)];
    const hit = e => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); };
    const parts = all('.pairs-level-up, .pairs-result-tries, .pairs-result-stars, .pairs-result-title, .pairs-best').map(box);
    const measured = {
      overflowX: document.documentElement.scrollWidth > innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      cards: all('.pairs-found-card').map(box), parts, actions: all('.pairs-result-actions button').map(box),
      badges: all('.pairs-new-badge').map(e => ({ badge: box(e), card: box(e.parentElement) })),
      names: all('.pairs-found-name').map(e => ({ text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1, size: parseFloat(getComputedStyle(e).fontSize) })),
      words: all('.pairs-result-actions button, .pairs-level-up, .celebration-text').map(e => ({ text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1 })),
      sand: box(document.querySelector('.pairs-result-sand')),
      bedrock: getComputedStyle(document.querySelector('.pairs-result-bedrock')).display === 'none' ? null : box(document.querySelector('.pairs-result-bedrock'))
    };
    measured.taps = all('.pairs-result-actions button').map(e => ({ text: e.textContent, ...box(e), hit: hit(e) }));
    scrollTo(0, 0);
    return measured;
  });
  assert(!m.overflowX, `${label}: scrolls sideways`);
  if (!scrolls) assert(m.pageHeight <= height + 1, `${label}: the result scrolls, ${m.pageHeight} tall`);
  for (const part of [...m.cards, ...m.parts, ...m.actions]) inside(part, width, m.pageHeight, `${label} part`);
  for (const group of [m.cards, m.parts, m.actions, [...m.cards, ...m.parts, ...m.actions]]) for (const [i, a] of group.entries()) for (const b of group.slice(i + 1)) apart(a, b, label);
  for (const { badge, card } of m.badges) assert(badge.left >= card.left - .5 && badge.right <= card.right + .5 && badge.top >= card.top - .5, `${label}: NEW inside its card`);
  for (const name of m.names) assert(name.fits && name.size >= 12, `${label}: ${name.text} readable: ${JSON.stringify(name)}`);
  for (const word of m.words) assert(word.fits, `${label}: ${word.text} fits`);
  if (m.bedrock) for (const card of m.cards) assert(card.bottom <= m.sand.top + .5, `${label}: dinosaur over the sand`);
  if (m.bedrock) for (const action of m.actions) assert(action.top >= m.sand.top - .5 && action.bottom <= m.bedrock.top + .5, `${label}: action on the sand`);
  for (const tap of m.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: ${tap.text} is a tap target: ${JSON.stringify(tap)}`);
}
// The offer fits its window over the result, its answers tap targets.
async function offer(page, width, height, label) {
  const m = await page.evaluate(() => {
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const q = document.querySelector('.pairs-offer-question');
    return { card: box(document.querySelector('.pairs-offer')), lines: Math.round(q.getBoundingClientRect().height / parseFloat(getComputedStyle(q).lineHeight)), buttons: [...document.querySelectorAll('.pairs-offer-answers button')].map(e => ({ ...box(e), fits: e.scrollWidth <= e.clientWidth + 1 })), overflow: [document.documentElement.scrollWidth > innerWidth] };
  });
  inside(m.card, width, height, `${label} offer`);
  assert(m.lines <= 3, `${label}: the question takes ${m.lines} lines`);
  for (const button of m.buttons) { inside(button, m.card.right, m.card.bottom, `${label} answer`); assert(button.fits && button.width >= 44 && button.height >= 44, `${label}: answer ${JSON.stringify(button)}`); }
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
    const run = async ([[width, height, sandTop, boardSand, bedrock], language, theme]) => {
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
          // Only a first visit's boards: a return deals the same shapes.
          if (saved) continue;
          await page.locator('.pairs-play-button').press('Enter');
          await page.locator('.pair-board').waitFor();
          await settle(page);
          if (shots) await page.screenshot({ path: join(shots, `board-${width}x${height}-${language}-${theme}-${level}.png`) });
          await board(page, width, height, `${label} board`, { sandTop: boardSand, bedrock, phone, short: height < 600, opened: false });
          await page.locator('.pair-card').first().press('Enter');
          await page.waitForFunction(() => ['appearing', 'shown'].includes(document.querySelector('.pair-card[data-state="open"] img')?.dataset.picture));
          await settle(page);
          if (shots) await page.screenshot({ path: join(shots, `board-open-${width}x${height}-${language}-${theme}-${level}.png`) });
          await board(page, width, height, `${label} board open`, { sandTop: boardSand, bedrock, phone, short: height < 600, opened: true });
          checked += 2;
        }
        // The fullest result a level deals, then a perfect replay of it
        // after two strong boards, to the offer.
        const seed = async offered => {
          await page.goto('http://pairs.test/');
          await page.evaluate(({ offered }) => {
            localStorage.setItem('rexlab-age-level', JSON.stringify({ level: 'explorer', revision: 'pairs' }));
            localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: {
              ...(offered ? { 'find-the-pair': { stars: 2, level: 1, boardsOnLevel: 0, best: {}, found: [], offer: { level: 'explorer', strong: 2, declined: [] } } } : {}),
              'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} }
            } }));
          }, { offered });
          await page.reload();
          await page.locator('[data-turn-part="tile-pairs"]').press('Enter');
          await page.locator('.pairs-play-button').press('Enter');
          await page.locator('.pair-board').waitFor();
          await settle(page);
        };
        const showResult = async () => { await page.locator('.pairs-result').waitFor({ timeout: 30000 }); await settle(page); };
        await seed(false);
        const pairs = await playOut(page);
        await showResult();
        if (shots) await page.screenshot({ path: join(shots, `result-${width}x${height}-${language}-${theme}.png`), fullPage: true });
        await result(page, width, height, `${width}x${height} ${language} result`, { scrolls: height < 900 && width < 500 });
        await seed(true);
        await playOut(page, pairs);
        await showResult();
        await page.locator('.pairs-offer').waitFor({ timeout: 15000 });
        await settle(page);
        if (shots) await page.screenshot({ path: join(shots, `offer-${width}x${height}-${language}-${theme}.png`) });
        await offer(page, width, height, `${width}x${height} ${language}`);
        checked += 2;
        assert.deepEqual(errors, [], `${width}x${height} ${language} ${theme}: page errors`);
      } finally { await context.close(); }
    };
    const queue = [...configs];
    await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await run(queue.shift()); }));
    console.log(`PASS ${checked} find the pair welcome, board, result and offer configurations: layout, fit, overlap, scrolling, labels and tap targets`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
