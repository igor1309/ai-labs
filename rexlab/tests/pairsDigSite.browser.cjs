// Contract test: find the pair's dig-site welcome, board, result and offer laid
// out and fitted in Chromium, the copies a turn draws of its pictures, and one
// walk through the screens with and without motion.
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
// Each welcome measured, and whether its board is: a first visit at each
// level, and returns whose stored climb level deals Hatchling's later
// boards. A larger level deals its one board on a return too, so a return
// there measures only its welcome.
const VISITS = [
  ...LEVELS.map(level => ({ level, visit: 'first', saved: undefined, boards: true })),
  ...[2, 3, 4].map(climb => ({ level: 'hatchling', visit: `returning-climb${climb}`, saved: { ...returning, level: climb }, boards: true })),
  ...LEVELS.slice(1).map(level => ({ level, visit: 'returning', saved: returning, boards: false }))
];
// The results the levels show, as controlled states: each count of
// dinosaurs a board deals, with NEW finds, each reward and new level, and
// the offer of the next age level where one is due. Those marked `failed`
// are shown again with every picture failing.
const RESULTS = [
  { count: 3, newly: 3, tries: 3, stars: 1, best: 3, celebration: 'first-best', levelUp: { level: 2, rows: 2, columns: 4 }, failed: true },
  { count: 4, newly: 2, tries: 6, stars: 2, best: 5, beaten: 7, celebration: 'new-best', levelUp: { level: 3, rows: 2, columns: 4 } },
  { count: 4, newly: 1, tries: 9, stars: 3, celebration: null, levelUp: { level: 4, rows: 3, columns: 4 } },
  { count: 6, newly: 0, tries: 12, stars: 4, best: 8, celebration: null, levelUp: null, offer: 'explorer' },
  { count: 9, newly: 4, tries: 14, stars: 12, best: 11, celebration: null, levelUp: null, offer: 'paleontologist' },
  { count: 12, newly: 12, tries: 30, stars: 23, best: 30, celebration: 'first-best', levelUp: null, failed: true }
];
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

// Plays a board out, turning each card and remembering the dinosaur it
// names once open, or by the pairs already known; returns the pairs for a
// perfect replay. A pair's cards share a name, not always a picture: a
// skeleton is matched to its dinosaur's picture.
async function playOut(page, known) {
  const count = await page.locator('.pair-card').count();
  const turn = async index => {
    await page.locator(`.pair-card[data-turn-part="pair-card-${index}"]`).press('Enter');
    await page.waitForFunction(i => { const c = document.querySelector(`[data-turn-part="pair-card-${i}"]`); return c.dataset.state !== 'down' && c.querySelector('img'); }, index);
    return page.locator(`.pair-card[data-turn-part="pair-card-${index}"]`).getAttribute('aria-label');
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
      badges: all('.pairs-new-badge').map(e => ({ badge: box(e), card: box(e.parentElement), name: box(e.parentElement.querySelector('.pairs-found-name')) })),
      arts: all('.pairs-found-art').map(e => { const picture = e.querySelector('.picture'); return { height: box(e).height, look: picture.dataset.picture, failure: getComputedStyle(picture).backgroundImage.startsWith('url("data:image/svg+xml') }; }),
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
  for (const { badge, card, name } of m.badges) {
    assert(badge.left >= card.left - .5 && badge.right <= card.right + .5 && badge.top >= card.top - .5, `${label}: NEW inside its card`);
    apart(badge, name, `${label} NEW/name`);
  }
  for (const name of m.names) assert(name.fits && name.size >= 9, `${label}: ${name.text} readable: ${JSON.stringify(name)}`);
  for (const word of m.words) assert(word.fits, `${label}: ${word.text} fits`);
  if (m.bedrock) for (const card of m.cards) assert(card.bottom <= m.sand.top + .5, `${label}: dinosaur over the sand`);
  if (m.bedrock) for (const action of m.actions) assert(action.top >= m.sand.top - .5 && action.bottom <= m.bedrock.top + .5, `${label}: action on the sand`);
  for (const tap of m.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: ${tap.text} is a tap target: ${JSON.stringify(tap)}`);
  return m.arts;
}
// The offer fits its window over the result, its answers tap targets.
async function offer(page, width, height, label) {
  const m = await page.evaluate(() => {
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const q = document.querySelector('.pairs-offer-question');
    return { card: box(document.querySelector('.pairs-offer')), lines: (() => { const text = document.createRange(); text.selectNodeContents(q); return new Set([...text.getClientRects()].map(r => Math.round(r.top))).size; })(), buttons: [...document.querySelectorAll('.pairs-offer-answers button')].map(e => ({ ...box(e), fits: e.scrollWidth <= e.clientWidth + 1 })), overflow: [document.documentElement.scrollWidth > innerWidth] };
  });
  inside(m.card, width, height, `${label} offer`);
  assert(m.lines <= 3, `${label}: the question takes ${m.lines} lines`);
  for (const button of m.buttons) { inside(button, m.card.right, m.card.bottom, `${label} answer`); assert(button.fits && button.width >= 44 && button.height >= 44, `${label}: answer ${JSON.stringify(button)}`); }
}

// What travels just after a screen changes: finite animations whose keyframes
// cover a distance. Reduced motion keeps its fades, whose moves are all zero.
async function motionAfter(page, selector) {
  await page.locator(selector).waitFor();
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const still = /^(none|0(px|deg|%)?( 0(px|deg|%)?)*|1( 1)*|[xyz] 0deg|matrix\(1, 0, 0, 1, 0, 0\))$/;
    return document.getAnimations()
      .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
      .filter(a => a.effect.getKeyframes().some(k => ['transform', 'translate', 'scale', 'rotate'].some(p => k[p] !== undefined && !still.test(String(k[p]).trim()))))
      .map(a => a.animationName || a.effect.pseudoElement || 'transition');
  });
}

// One walk through the screens, split at each screen change so that a part
// starts from stored progress and no part plays what another has played.
async function flow(open, reducedMotion) {
  const { page, errors, close } = await open({ width: 1133, height: 744 }, 'en', 'light', reducedMotion);
  const seen = {};
  const enter = async () => {
    await page.goto('http://pairs.test/');
    await page.evaluate(() => {
      localStorage.setItem('rexlab-age-level', JSON.stringify({ level: 'hatchling', revision: 'pairs' }));
      localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: { 'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} } } }));
    });
    await page.reload();
    await page.locator('[data-turn-part="tile-pairs"]').press('Enter');
    seen.welcome = await motionAfter(page, '.pairs-welcome');
    await settle(page);
  };
  const toBoard = async button => {
    await page.locator(button).press('Enter');
    seen.board = await motionAfter(page, '.pair-board');
    await settle(page);
  };
  const toResult = async () => {
    await enter();
    await toBoard('.pairs-play-button');
    await playOut(page);
    seen.result = await motionAfter(page, '.pairs-result');
    await settle(page);
  };
  try {
    await enter();
    const folds = await climbFold(page);
    for (const fold of folds) {
      if (reducedMotion === 'reduce') assert.deepEqual(fold, ['opacity'], 'the climb level moves under reduced motion');
      else assert(fold.includes('opacity') && fold.some(property => property !== 'opacity'), `the climb level does not fold: ${fold}`);
    }
    await toBoard('.pairs-play-button');
    await toResult();
    await toBoard('.pairs-result-actions .play-again-button');
    await toResult();
    await page.locator('.pairs-result-back').press('Enter');
    seen.back = await motionAfter(page, '.pairs-welcome');
    await settle(page);
    await toResult();
    await page.locator('.pairs-result-home').press('Enter');
    seen.home = await motionAfter(page, '[data-turn-part="tile-pairs"]');
    await settle(page);
    for (const [screen, moving] of Object.entries(seen)) {
      if (reducedMotion === 'reduce') assert.deepEqual(moving, [], `${screen}: moves under reduced motion`);
      else assert(moving.length > 0, `${screen}: arrives without moving`);
    }
    assert.deepEqual(Object.keys(seen).sort(), ['back', 'board', 'home', 'result', 'welcome'], 'flow: every screen change walked');
    assert.deepEqual(errors, [], `flow, ${reducedMotion}: page errors`);
  } finally { await close(); }
}

// What the climb level's chip transitions as the level switch leaves
// Hatchling and comes back, as the stylesheet's cascade gives it.
async function climbFold(page) {
  const folds = [];
  for (const level of [1, 0]) {
    await page.locator('.pairs-welcome .level-switch-level').nth(level).press('Enter');
    await page.waitForFunction(level => document.querySelector('.pairs-climb').hasAttribute('data-shown') === (level === 0), level);
    folds.push(await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [...new Set(document.querySelector('.pairs-climb').getAnimations().map(a => a.transitionProperty))].sort();
    }));
    await settle(page);
  }
  return folds;
}

// Records each copy a turn draws of a picture part as its glide starts:
// every box inside the copy drawn where it lands, from its own corner, and
// the same of the part as laid out there. The glide then runs as drawn.
async function recordCopies(page) {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    const layout = root => {
      const r = root.getBoundingClientRect();
      return [...root.querySelectorAll('*')].map(e => { const b = e.getBoundingClientRect(); return [e.getAttribute('class'), b.left - r.left, b.top - r.top, b.width, b.height]; });
    };
    window.drawnCopies = [];
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.hasAttribute('data-fitted-picture')) {
        animation.pause();
        animation.currentTime = animation.effect.getComputedTiming().endTime;
        const part = this.matches('.pairs-hero') ? document.querySelector('.pairs-hero[data-turn-part]') : document.querySelector(`.pairs-found-card[data-turn-part="pairs-found-${this.style.getPropertyValue('--card').trim()}"]`);
        window.drawnCopies.push({ name: this.className, copy: layout(this), part: part && layout(part) });
        animation.currentTime = 0;
        animation.play();
      }
      return animation;
    };
  });
}
// Turns the window to `size` and returns the copies its turn drew.
async function turnTo(page, size) {
  await page.evaluate(() => { window.drawnCopies = []; });
  await page.setViewportSize(size);
  await page.waitForFunction(() => window.drawnCopies.length > 0);
  await settle(page);
  return page.evaluate(() => window.drawnCopies);
}
function drawnAsLaidOut(drawn, label) {
  for (const { name, copy, part } of drawn) {
    assert(part, `${label}: ${name} has no part laid out`);
    assert.deepEqual(copy.map(([kind]) => kind), part.map(([kind]) => kind), `${label}: ${name}'s copy holds its parts`);
    for (const [i, [kind, ...box]] of copy.entries()) assert(box.every((value, k) => Math.abs(value - part[i][k + 1]) <= 1), `${label}: ${name}'s ${kind} drawn at ${box}, laid out at ${part[i].slice(1)}`);
  }
}
// Turning an iPad redraws the welcome's cards and the result's dinosaurs
// on copies that glide: each copy draws what it holds as the part lays it
// out where it lands.
async function rotation(open) {
  const { page, errors, close } = await open({ width: 1180, height: 820 }, 'en', 'light', 'no-preference');
  try {
    await page.goto('http://pairs.test/');
    await page.evaluate(() => {
      localStorage.setItem('rexlab-age-level', JSON.stringify({ level: 'hatchling', revision: 'pairs' }));
      localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: { 'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} } } }));
    });
    await page.reload();
    await recordCopies(page);
    await page.locator('[data-turn-part="tile-pairs"]').press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.pairs-hero img')].every(e => e.dataset.picture === 'shown' || e.dataset.picture === 'appearing'));
    await settle(page);
    const welcome = await turnTo(page, { width: 820, height: 1180 });
    // A turn may follow the window through more than one change of size,
    // each drawing its copies again.
    assert.deepEqual([...new Set(welcome.map(({ name }) => name))], ['pairs-hero'], 'the welcome turns its cards on a copy');
    drawnAsLaidOut(welcome, 'welcome turned upright');
    await page.locator('.pairs-play-button').press('Enter');
    await page.locator('.pair-board').waitFor();
    await settle(page);
    await playOut(page);
    await page.locator('.pairs-result').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.pairs-found-picture')].every(e => e.dataset.picture === 'shown' || e.dataset.picture === 'appearing'));
    await settle(page);
    const found = await turnTo(page, { width: 1180, height: 820 });
    assert.deepEqual([...new Set(found.map(({ name }) => name))], ['pairs-found-card'], 'the result turns its dinosaurs on copies');
    assert(found.length >= 3, `the result turns its three dinosaurs on copies, ${found.length} drawn`);
    drawnAsLaidOut(found, 'result turned on its side');
    assert.deepEqual(errors, [], 'rotation: page errors');
  } finally { await close(); }
}

async function main() {
  const { build } = await import('vite');
  const root = resolve(__dirname, '..');
  const input = { main: join(root, 'index.html'), result: join(__dirname, 'pairsResult.fixture.html'), sw: join(root, 'src/offline/sw.ts') };
  const bundle = await build({ root, logLevel: 'error', build: { write: false, rolldownOptions: { input } } });
  const files = new Map(bundle.output.map(f => [f.fileName, f.type === 'chunk' ? f.code : f.source]));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let checked = 0;
  try {
    // Layout is measured in Russian, the longer text; screenshots take
    // both languages and both themes.
    const shots = process.env.PAIRS_SCREENSHOTS;
    if (shots) await mkdir(shots, { recursive: true });
    const configs = sizes.flatMap(size => (shots ? ['en', 'ru'] : ['ru']).flatMap(language => (shots ? ['light', 'dark'] : ['light']).map(theme => [size, language, theme])));
    const open = async ({ width, height }, language, theme, reducedMotion) => {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
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
      return { page, errors, close: () => context.close() };
    };
    // The app opened on find the pair's welcome at `level` with `saved`
    // progress, or with none.
    const enterAt = async (page, level, saved) => {
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
    };
    // The pairs of each level's board, learnt by its first play: with
    // Math.random at 0 a level deals the same board every time.
    const known = {};
    // Each level's result in the running app, played out, and the offer
    // over Explorer's once two strong boards make it due, for screenshots.
    const shoot = async (page, name) => {
      const offered = { stars: 2, level: 1, boardsOnLevel: 0, best: {}, found: [], offer: { level: 'explorer', strong: 2, declined: [] } };
      for (const [level, saved, shot] of [...LEVELS.map(level => [level, undefined, `result-${name}-${level}`]), ['explorer', offered, `offer-${name}`]]) {
        await enterAt(page, level, saved);
        await page.locator('.pairs-play-button').press('Enter');
        await page.locator('.pair-board').waitFor();
        await settle(page);
        known[level] = await playOut(page, known[level]);
        await page.locator(saved ? '.pairs-offer' : '.pairs-result').waitFor({ timeout: 30000 });
        await page.waitForFunction(() => [...document.querySelectorAll('.pairs-found-picture')].every(e => e.dataset.picture === 'shown' || e.dataset.picture === 'appearing'));
        await settle(page);
        await page.screenshot({ path: join(shots, `${shot}.png`), fullPage: !saved });
      }
    };
    const run = async ([[width, height, sandTop, boardSand, bedrock], language, theme]) => {
      const { page, errors, close } = await open({ width, height }, language, theme, 'reduce');
      try {
        const phone = width < 600 || height < 600;
        for (const { level, visit, saved, boards } of VISITS) {
          await enterAt(page, level, saved);
          await page.waitForFunction(() => [...document.querySelectorAll('.pairs-hero img')].every(e => ['appearing', 'shown'].includes(e.dataset.picture)));
          await settle(page);
          const label = `${width}x${height} ${language} ${theme} ${visit} ${level}`;
          if (shots) await page.screenshot({ path: join(shots, `welcome-${width}x${height}-${language}-${theme}-${visit}-${level}.png`) });
          await welcome(page, width, height, label, { sandTop, bedrock, phone, short: height < 600, climbing: level === 'hatchling' });
          checked++;
          if (!boards) continue;
          const dealt = visit === 'first' ? level : `${level}-${visit.replace('returning-', '')}`;
          await page.locator('.pairs-play-button').press('Enter');
          await page.locator('.pair-board').waitFor();
          await settle(page);
          if (shots) await page.screenshot({ path: join(shots, `board-${width}x${height}-${language}-${theme}-${dealt}.png`) });
          await board(page, width, height, `${label} board`, { sandTop: boardSand, bedrock, phone, short: height < 600, opened: false });
          await page.locator('.pair-card').first().press('Enter');
          await page.waitForFunction(() => ['appearing', 'shown'].includes(document.querySelector('.pair-card[data-state="open"] img')?.dataset.picture));
          await settle(page);
          if (shots) await page.screenshot({ path: join(shots, `board-open-${width}x${height}-${language}-${theme}-${dealt}.png`) });
          await board(page, width, height, `${label} board open`, { sandTop: boardSand, bedrock, phone, short: height < 600, opened: true });
          checked += 2;
        }
        // Each result and offer the levels show, from its controlled state.
        await page.goto('http://pairs.test/tests/pairsResult.fixture.html');
        const show = async state => {
          await page.evaluate(state => { scrollTo(0, 0); window.showPairsResult(state); }, { ...state, language, theme });
          await settle(page);
        };
        for (const { offer: offered, failed, ...state } of RESULTS) {
          const label = `${width}x${height} ${language} ${theme} ${state.count} dinosaurs`;
          await show(state);
          const arts = await result(page, width, height, label, { scrolls: height < 900 && width < 500 });
          assert(arts.every(({ look, height }) => look !== 'failed' && height > 0), `${label}: dinosaurs drawn: ${JSON.stringify(arts)}`);
          checked++;
          if (failed) {
            await show({ ...state, failed });
            const failedArts = await result(page, width, height, `${label} failed`, { scrolls: height < 900 && width < 500 });
            assert.deepEqual(failedArts.map(({ look, failure }) => [look, failure]), arts.map(() => ['failed', true]), `${label}: the failure look`);
            for (const [i, { height: kept }] of failedArts.entries()) assert(Math.abs(kept - arts[i].height) <= .5, `${label}: a failed picture keeps its place, ${kept} for ${arts[i].height}`);
            checked++;
          }
          if (offered) {
            await show({ ...state, offer: offered });
            await page.locator('.pairs-offer').waitFor();
            await settle(page);
            await offer(page, width, height, `${label} ${offered} offer`);
            checked++;
          }
        }
        if (shots) await shoot(page, `${width}x${height}-${language}-${theme}`);
        assert.deepEqual(errors, [], `${width}x${height} ${language} ${theme}: page errors`);
      } finally { await close(); }
    };
    for (const reducedMotion of ['no-preference', 'reduce']) { await flow(open, reducedMotion); checked++; }
    await rotation(open);
    checked++;
    const queue = [...configs];
    await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await run(queue.shift()); }));
    console.log(`PASS ${checked} find the pair welcome, board, result, offer, turn and flow configurations: layout, fit, overlap, scrolling, labels, tap targets and motion`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
