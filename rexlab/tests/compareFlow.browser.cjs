// Contract test: production COMPARE composition, browser input, pictures,
// responsive layout, motion and localStorage in Chromium.
const assert = require('node:assert/strict');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const { join, resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const dinosaurs = require('../src/data/dinosaurs.json');

const levels = ['hatchling', 'explorer', 'paleontologist'];
const bestKeys = ['bestScore', 'explorerBest', 'paleontologistBest'];
const sizes = [[1180, 820, false], [1133, 744, false], [744, 1133, false], [393, 852, false], [852, 393, false], [375, 667, true], [320, 568, true], [1440, 900, false]];
const words = {
  en: { home: 'HOME', next: 'NEXT', result: 'SEE RESULT', replay: 'PLAY AGAIN', progress: 'PROGRESS', score: 'SCORE', best: 'BEST SCORE', levels: ['HATCHLING', 'EXPLORER', 'PALEONTOLOGIST'], prompts: ['WHO IS TALLER?', 'WHO IS LONGER?', 'WHO IS SHORTER?'] },
  ru: { home: 'ДОМОЙ', next: 'ДАЛЬШЕ', result: 'РЕЗУЛЬТАТ', replay: 'ЕЩЁ РАЗ', progress: 'ПРОГРЕСС', score: 'СЧЁТ', best: 'РЕКОРД', levels: ['ДЕТЁНЫШ', 'ИССЛЕДОВАТЕЛЬ', 'ПАЛЕОНТОЛОГ'], prompts: ['КТО ВЫШЕ?', 'КТО ДЛИННЕЕ?', 'КТО НИЖЕ?'] }
};

async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('main .picture[data-picture="loading"], main .picture[data-picture="failed"]'));
  // Layout changes schedule turn motion on the following frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Scroll-driven Home parallax has no timed completion to wait for.
  await page.waitForFunction(() =>
    document.fonts.status === 'loaded' &&
    [...document.images].filter(img => img.src).every(img => img.complete && img.naturalWidth > 0) &&
    !document.documentElement.hasAttribute('data-turning') &&
    document.getAnimations().every(animation =>
      animation.timeline !== document.timeline ||
      animation.effect?.getComputedTiming().iterations === Infinity || animation.playState === 'finished'
    )
  ).catch(async error => {
    console.error('Unsettled page', await page.evaluate(() => ({
      title: document.querySelector('main')?.className,
      animations: document.getAnimations().map(a => ({ name: a.animationName, state: a.playState, iterations: a.effect?.getComputedTiming().iterations })),
      images: [...document.images].filter(img => img.src && (!img.complete || !img.naturalWidth)).map(img => img.src)
    })));
    throw error;
  });
  // Finishing an animation can queue its native start/end events.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const quiz = page => page.evaluate(() => JSON.parse(localStorage.getItem('rexlab-progress')).games['compare-dinosaurs']);
const starts = page => page.evaluate(() => JSON.parse(localStorage.getItem('rexlab-progress')).games['home-featured'].starts.compare);
const press = async (page, name) => { await page.getByRole('button', { name, exact: true }).press('Enter'); await settle(page); };
const entry = page => page.locator('[data-turn-part="tile-compare"], .featured-card[data-game="compare"]');
const content = (page, screen) => page.locator(screen).evaluate(root => ({
  text: root.textContent,
  cards: [...root.querySelectorAll('.dinosaur-card')].map(el => [el.getAttribute('aria-label'), el.getAttribute('data-mark'), el.getAttribute('data-chosen')]),
  levels: [...root.querySelectorAll('.level-switch button')].map(el => el.getAttribute('aria-pressed'))
}));

async function appearance(page, screen, language, level, artifacts, captures) {
  const state = await content(page, screen);
  const held = await quiz(page);
  const identity = await page.locator(screen === '.question' ? '.dinosaur-card' : '.result-score-value').first().elementHandle();
  for (const [width, height, scrolls] of sizes) for (const theme of ['light', 'dark']) {
    await page.evaluate(stage => window.rewardStage = stage, `${width}x${height}/${theme}`);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    await settle(page);
    await page.evaluate(() => scrollTo(0, 0));
    const label = `${screen}/${width}x${height}/${language}/${theme}/${level}`;
    const geometry = await page.locator(screen).evaluate(root => {
      const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      return {
        horizontal: document.scrollingElement.scrollWidth > innerWidth,
        scrolls: document.scrollingElement.scrollHeight > innerHeight + 1,
        nested: [...root.querySelectorAll('*')].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map(el => el.className),
        buttons: [...root.querySelectorAll('button')].map(box),
        footer: getComputedStyle(document.querySelector('#version')).display === 'none' ? null : box(document.querySelector('#version')),
        pictures: [...root.querySelectorAll('.dinosaur-picture, .result-hero')].map(box)
      };
    });
    assert(!geometry.horizontal, `${label}: no horizontal overflow`);
    assert.equal(geometry.scrolls, scrolls, `${label}: whole-page scroll ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.nested, [], `${label}: no nested scroll`);
    for (const b of geometry.buttons) assert(b.width >= 44 && b.height >= 44 && b.x >= 0 && b.right <= width + 1, `${label}: tap target ${JSON.stringify(b)}`);
    if (geometry.footer) for (const b of geometry.buttons) {
      const f = geometry.footer;
      assert(f.right <= b.x || f.x >= b.right || f.bottom <= b.y || f.y >= b.bottom, `${label}: version overlaps control`);
    }
    for (const b of geometry.pictures) assert(b.height >= (screen === '.question' ? 110 : 120) - 1, `${label}: picture minimum`);
    assert(await identity.evaluate((el, screen) => el === document.querySelector(screen === '.question' ? '.dinosaur-card' : '.result-score-value'), screen), `${label}: screen identity`);
    assert.deepEqual(await content(page, screen), state, `${label}: content survives appearance and resize`);
    assert.deepEqual(await quiz(page), held, `${label}: no progress writes`);
    for (const button of await page.locator(`${screen} button`).all()) {
      await button.scrollIntoViewIfNeeded();
      const b = await button.boundingBox();
      assert(b.y >= -1 && b.y + b.height <= height + 1, `${label}: every control reachable`);
    }
    await page.evaluate(() => scrollTo(0, 0));
    if (artifacts) {
      const path = join(artifacts, `${screen.slice(1)}-${level}-${width}x${height}-${language}-${theme}.png`);
      await page.screenshot({ path, fullPage: true });
      captures.push({ path, screen: screen.slice(1), level, language, theme, width, height, reducedMotion: language === 'ru' });
    }
  }
  await identity.dispose();
  await page.setViewportSize({ width: 1180, height: 820 });
  await settle(page);
}

async function answer(page, language, level, number, right) {
  const text = words[language];
  await page.waitForFunction(({ progress, number }) => document.querySelector(`.question [aria-label="${progress}"]`)?.textContent === `${number}/10`, { progress: text.progress, number });
  assert.equal(await page.getByLabel(text.progress, { exact: true }).textContent(), `${number}/10`);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), text.prompts[levels.indexOf(level)]);
  const names = await page.locator('.dinosaur-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')));
  const pair = names.map(name => dinosaurs.find(d => d.name[language] === name));
  assert(pair.every(Boolean), 'two shipped dinosaurs');
  const attribute = level === 'explorer' ? 'lengthMeters' : 'heightMeters';
  const leftIsRight = level === 'paleontologist' ? pair[0].attributes[attribute] < pair[1].attributes[attribute] : pair[0].attributes[attribute] > pair[1].attributes[attribute];
  const index = (right ? leftIsRight : !leftIsRight) ? 0 : 1;
  const chosen = page.locator('.dinosaur-card').nth(index);
  // Real pointer input exercises the root filter; subsequent deliberate actions
  // use keyboard input, which has no double-tap time window.
  if (number === 1) {
    const b = await chosen.boundingBox();
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2, { delay: 30 });
    await settle(page);
  } else { await chosen.press('Enter'); await settle(page); }
  assert.equal(await page.locator('.dinosaur-card[data-chosen="true"]').count(), 1);
  assert.equal(await page.locator('.dinosaur-card[data-chosen="true"]').getAttribute('data-mark'), right ? 'correct' : 'wrong');
  assert.equal(await page.locator('.dinosaur-value-chip').count(), 2);
  assert.equal(await page.locator('.dinosaur-card[aria-disabled="true"]').count(), 2);
  const marks = await page.locator('.dinosaur-card').evaluateAll(cards => cards.map(c => [c.getAttribute('data-mark'), c.getAttribute('data-chosen')]));
  await page.locator('.dinosaur-card').nth(1 - index).press('Enter');
  await settle(page);
  assert.deepEqual(await page.locator('.dinosaur-card').evaluateAll(cards => cards.map(c => [c.getAttribute('data-mark'), c.getAttribute('data-chosen')])), marks, 'a second answer changes nothing');
}

async function run() {
  let browser;
  const artifacts = process.env.REXLAB_COMPARE_SCREENSHOTS;
  const captures = [];
  try {
    const { build } = await import('vite');
    const root = resolve(__dirname, '..');
    const bundle = await build({ root, logLevel: 'error', build: { write: false } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source]));
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
    if (artifacts) await mkdir(artifacts, { recursive: true });
    for (const language of ['en', 'ru']) for (const level of levels) {
      const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, reducedMotion: language === 'ru' ? 'reduce' : 'no-preference', colorScheme: 'light', serviceWorkers: 'block' });
      try {
        const errors = [];
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.on('pageerror', error => errors.push(error.message));
        await context.route('http://compare.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
          await route.fulfill({ body: files.get(file) ?? await readFile(join(root, 'public', file)), contentType: types[extname(file)] || 'application/octet-stream' });
        });
        await context.addInitScript(({ language, level }) => {
          // A constant draw gives each level a distinct prompt kind. The real
          // generator still chooses fair, non-repeating pairs.
          Math.random = () => 0.7;
          if (localStorage.getItem('rexlab-language')) return;
          localStorage.setItem('rexlab-language', language);
          localStorage.setItem('rexlab-theme', 'system');
          localStorage.setItem('rexlab-age-level', JSON.stringify({ level, revision: 'parent' }));
          localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: {
            'compare-dinosaurs': { bestScore: 5, explorerBest: 5, paleontologistBest: 5, roundsPlayed: 3 },
            'sort-dinosaurs': { bestScore: 8, explorerBest: 6, paleontologistBest: 4, roundsPlayed: 9 }
          } }));
        }, { language, level });
        const text = words[language];
        await page.goto('http://compare.test/');
        await page.locator('.home').waitFor();
        await settle(page);
        const initialStarts = (await starts(page)) ?? 0;
        await entry(page).press('Enter');
        await page.locator('.question').waitFor();
        await settle(page);
        const initial = await quiz(page);

        // Question boundary: actions never persist an unfinished round.
        for (let number = 1; number <= 10; number++) {
          await answer(page, language, level, number, number <= 7);
          if (number === 1) await appearance(page, '.question', language, level, artifacts, captures);
          assert.deepEqual(await quiz(page), initial);
          if (number < 10) await press(page, text.next);
        }
        console.log(`PASS ${language}/${level}: answers, double tap, picture decode, resize and no premature save`);

        // Result boundary: completion writes once, switching retains rewards.
        await press(page, text.result);
        await page.locator('.compare-result').waitFor();
        await settle(page);
        assert.equal(await page.getByLabel(text.score, { exact: true }).textContent(), '7/10');
        assert.equal(await page.locator('.star-won').count(), 7);
        assert.equal(await page.locator('.best-score-value').textContent(), '7');
        assert.equal(await page.locator('.best-score-beaten').textContent(), '5');
        const finished = { ...initial, [bestKeys[levels.indexOf(level)]]: 7, roundsPlayed: 4 };
        assert.deepEqual(await quiz(page), finished);
        assert.equal(await starts(page), initialStarts + 1);
        await page.evaluate(() => {
          window.rewardReplays = [];
          document.querySelector('.result').addEventListener('animationstart', event => {
            if (event.target.matches('.result-score-value, .star-won, .celebration')) window.rewardReplays.push({ animation: event.animationName, target: event.target.className, frame: event.target.hasAttribute('data-turn-frame'), size: document.documentElement.dataset.size, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, elapsed: event.elapsedTime, stage: window.rewardStage });
          });
        });
        await appearance(page, '.result', language, level, artifacts, captures);
        const reward = await page.locator('.result-content').elementHandle();
        const nextLevel = levels[(levels.indexOf(level) + 1) % levels.length];
        let currentLevel = level;
        let expected = finished;
        for (const choice of levels) {
          await press(page, text.levels[levels.indexOf(choice)]);
          if (choice !== currentLevel) expected = { ...finished, levelChoice: { level: choice, revision: 'parent' } };
          currentLevel = choice;
          assert.equal(await page.locator('.level-switch button[aria-pressed="true"] .level-switch-name').textContent(), text.levels[levels.indexOf(choice)]);
          assert.equal(await page.getByLabel(text.score, { exact: true }).textContent(), '7/10');
          assert.equal(await page.locator('.best-score-value').textContent(), '7');
          assert(await reward.evaluate(el => el === document.querySelector('.result-content')));
          assert.equal(await starts(page), initialStarts + 1);
          assert.deepEqual(await quiz(page), expected);
        }
        await press(page, text.levels[levels.indexOf(nextLevel)]);
        const kept = await quiz(page);
        assert.deepEqual(kept, { ...finished, levelChoice: { level: nextLevel, revision: 'parent' } });
        assert.deepEqual(await page.evaluate(() => window.rewardReplays), [], 'turn, appearance and level choice do not replay rewards');
        await reward.dispose();
        console.log(`PASS ${language}/${level}: result, responsive controls, reward identity and all level choices`);

        // Replay/Home boundary: only a finished round earns another write.
        const replay = await page.getByRole('button', { name: text.replay, exact: true }).boundingBox();
        await page.mouse.dblclick(replay.x + replay.width / 2, replay.y + replay.height / 2, { delay: 30 });
        await page.locator('.question').waitFor();
        await settle(page);
        assert.equal(await starts(page), initialStarts + 2);
        assert.equal(await page.getByLabel(text.progress, { exact: true }).textContent(), '1/10');
        assert.equal(await page.locator('.dinosaur-card[data-chosen]').count(), 0);
        await answer(page, language, nextLevel, 1, false);
        await press(page, text.home);
        await page.locator('.home').waitFor();
        assert.deepEqual(await quiz(page), kept);
        await page.reload();
        await page.locator('.home').waitFor();
        await entry(page).press('Enter');
        await page.locator('.question').waitFor();
        await settle(page);
        assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), text.prompts[levels.indexOf(nextLevel)]);
        assert.deepEqual(await quiz(page), kept);
        await press(page, text.home);
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rexlab-progress')).games['sort-dinosaurs']), { bestScore: 8, explorerBest: 6, paleontologistBest: 4, roundsPlayed: 9 });
        assert.deepEqual(errors, []);
        console.log(`PASS ${language}/${level}: chosen-level replay, HOME, reload persistence and independent SORT progress`);
      } finally { await context.close(); }
    }
    if (artifacts) await writeFile(join(artifacts, 'manifest.json'), JSON.stringify({ browser: browser.version(), captures }, null, 2) + '\n');
    console.log('PASS COMPARE production flow: 6 rounds, 192 responsive states, both motion preferences, level choice, replay and HOME');
  } finally { await browser?.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
