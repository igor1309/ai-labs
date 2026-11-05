// Contract test: the tooth game's dig-site welcome and board laid out, fitted and moving in Chromium.
const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { resolve, extname, join } = require('node:path');
const { chromium } = require('playwright');
// Each size's sand top and bedrock height, as its board draws them; a
// window no board draws takes its shape's.
const sizes = [[1133, 744, 206, 60], [744, 1133, 206, 50], [393, 852, 208, 30], [375, 667, 186, 14], [852, 393, 124, 0], [1440, 900, 206, 60]];
const returning = { best: { hatchling: 3, explorer: 2, paleontologist: null }, earned: ['tyrannosaurus', 'triceratops', 'stegosaurus', 'brachiosaurus', 'velociraptor'] };
// A screen's layout turn starts from an effect after it is drawn, so a
// slow machine can show the new screen a frame before the turn begins:
// the page is still only when two frames in a row show no turn and no
// finite animation.
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const moving = () => document.documentElement.hasAttribute('data-turning') ||
      document.getAnimations().some(a => a.timeline === document.timeline && a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    for (let still = 0; still < 2;) {
      if (moving()) {
        still = 0;
        await Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline && a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      }
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
async function welcome(page, width, height, label, { sandTop, bedrock, phone, best }) {
  const measured = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const fits = e => e.scrollWidth <= e.clientWidth + 1;
    const shown = e => getComputedStyle(e).position !== 'absolute';
    const hit = e => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e.contains(top) || (top ? `${top.tagName}.${top.className}` : "nothing"); };
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
  for (const tap of measured.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: ${tap.label} is a tap target: ${JSON.stringify(tap)}`);
  for (const word of measured.words) assert(word.fits && word.size >= 18 && word.width > 1, `${label}: ${word.text} readable: ${JSON.stringify(word)}`);
  assert.equal(measured.homeWord, !phone, `${label}: HOME's word`);
  for (const name of measured.names) {
    assert.equal(name.shown, !phone || name.chosen, `${label}: which level names show`);
    assert(name.fits && name.size >= 13, `${label}: level name fits: ${JSON.stringify(name)}`);
  }
}
const LEVELS = ['hatchling', 'explorer', 'paleontologist'];
// Every part of the board a step shows, measured as it is drawn.
async function measureBoard(page) {
  return page.evaluate(() => {
    const q = s => document.querySelector(s);
    const all = s => [...document.querySelectorAll(s)];
    const box = e => { const { x, y, width, height, top, right, bottom, left } = e.getBoundingClientRect(); return { x, y, width, height, top, right, bottom, left }; };
    const shown = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    const hit = e => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e.contains(top) || (top ? `${top.tagName}.${top.className}` : "nothing"); };
    const body = q('.jaw-sand-body');
    const bar = [...q('.whose-jaw-board-bar').children].filter(shown);
    const cue = q('.jaw-feedback p');
    return {
      phase: q('.whose-jaw-board').dataset.phase,
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      scrolls: body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1,
      sand: box(q('.jaw-sand')), wave: box(q('.jaw-sand-wave')),
      bedrock: getComputedStyle(q('.jaw-bedrock')).display === 'none' ? 0 : box(q('.jaw-bedrock')).height,
      bar: bar.map(e => ({ name: e.className, ...box(e) })),
      title: box(q('.jaw-board-title')), choices: box(q('.jaw-choices')), tray: box(q('.jaw-tray')),
      cards: all('.jaw-dinosaur').map(card => ({
        name: card.getAttribute('aria-label'), ...box(card), pocket: box(card.querySelector('.jaw-pocket')),
        tag: card.querySelector('.jaw-food-tag') && box(card.querySelector('.jaw-food-tag')),
        label: card.querySelector('.jaw-name') && box(card.querySelector('.jaw-name'))
      })),
      jaw: shown(q('.jaw-loose')) ? box(q('.jaw-loose')) : null,
      ghost: q('.jaw-ghost') && box(q('.jaw-ghost')),
      prompt: shown(q('.jaw-prompt')) ? box(q('.jaw-prompt')) : null,
      promptPicture: !!q('.jaw-prompt img'),
      cue: cue && { ...box(cue), wrong: q('.whose-jaw-board').dataset.phase === 'wrong' },
      next: q('.jaw-next') && box(q('.jaw-next')),
      taps: [...q('.whose-jaw-board-bar').querySelectorAll('button'), ...all('.jaw-dinosaur'), ...all('.jaw-loose, .jaw-next')].filter(shown)
        .map(e => ({ label: e.getAttribute('aria-label') || e.textContent, ...box(e), hit: hit(e) })),
      words: all('.jaw-board-word, .jaw-name, .jaw-food-tag > span, .jaw-prompt > span, .jaw-feedback p, .jaw-next').filter(shown)
        .map(e => ({ text: e.textContent, fits: e.scrollWidth <= e.clientWidth + 1, size: parseFloat(getComputedStyle(e).fontSize), ...box(e) })),
      pictures: all('.jaw-sand img').filter(shown).map(e => e.complete && e.naturalWidth > 0),
      loading: all('.whose-jaw-board .picture[data-picture="loading"]').length,
      motion: [getComputedStyle(q('.jaw-breath')).animationName, q('.jaw-loose-art') && getComputedStyle(q('.jaw-loose-art')).animationName]
    };
  });
}
// What every step of the board holds to: it fits the window without
// scrolling, its parts stay apart and its words are whole and readable.
function boardFits(measured, width, height, label, { sandTop, bedrock, phone }) {
  assert.deepEqual(measured.overflow, [false, false], `${label}: the page scrolls`);
  assert(!measured.scrolls, `${label}: the sand scrolls`);
  assert.equal(measured.sand.y, sandTop, `${label}: sand starts at the board's edge`);
  assert.deepEqual([measured.wave.x, measured.wave.width], [0, width], `${label}: the wave reaches both sides`);
  assert.equal(measured.bedrock, bedrock, `${label}: bedrock height`);
  const ground = height - bedrock;
  for (const part of measured.bar) inside(part, width, measured.sand.y, `${label} ${part.name} in the sky`);
  for (const [i, a] of measured.bar.entries()) for (const b of measured.bar.slice(i + 1)) apart(a, b, `${label} ${a.name}/${b.name}`);
  for (const part of measured.bar) apart(part, measured.title, `${label} ${part.name}/title`);
  assert(measured.title.bottom <= sandTop + .5, `${label}: title stays in the sky`);
  inside(measured.title, width, height, `${label} title`);
  for (const name of ['choices', 'tray']) {
    inside(measured[name], width, ground, `${label} ${name} over the bedrock`);
    assert(measured[name].top >= sandTop - .5, `${label}: ${name} on the sand`);
  }
  apart(measured.choices, measured.tray, `${label} cards/tray`);
  for (const [i, a] of measured.cards.entries()) {
    for (const b of measured.cards.slice(i + 1)) apart(a, b, `${label} ${a.name}/${b.name}`);
    for (const part of [a.tag, a.label].filter(Boolean)) {
      assert(part.top >= a.pocket.bottom - .5 && part.bottom <= a.bottom + .5 && part.left >= a.left - .5 && part.right <= a.right + .5, `${label}: ${a.name}'s tag or name under its picture`);
    }
  }
  const tray = [measured.jaw, measured.prompt, measured.next, measured.cue && !measured.cue.wrong && measured.cue].filter(Boolean);
  for (const part of tray) assert(part.left >= measured.tray.left - .5 && part.right <= measured.tray.right + .5 && part.top >= measured.tray.top - .5 && part.bottom <= measured.tray.bottom + .5, `${label}: ${JSON.stringify(part)} in the tray`);
  for (const [i, a] of tray.entries()) for (const b of tray.slice(i + 1)) apart(a, b, `${label} tray parts`);
  for (const tap of measured.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: ${tap.label} is a tap target: ${JSON.stringify(tap)}`);
  for (const word of measured.words) {
    assert(word.fits && word.width > 1 && word.size >= (phone ? 13 : 16), `${label}: ${word.text} readable: ${JSON.stringify(word)}`);
    inside(word, width, height, `${label} ${word.text}`);
  }
  if (!measured.loading) assert(measured.pictures.every(Boolean), `${label}: pictures drawn`);
  assert.deepEqual(measured.motion.filter(Boolean), measured.motion[1] ? ['none', 'none'] : ['none'], `${label}: reduced motion keeps the dinosaurs and the jaw still`);
}
// The cue stands on the wrong card's top-right corner, inside the window
// and clear of the sky's controls.
function cueOn(measured, wrong, width, height, label) {
  const card = measured.cards.find(card => card.name === wrong);
  const { cue } = measured;
  assert(cue?.wrong, `${label}: the cue shows`);
  inside(cue, width, height, `${label} cue`);
  assert(cue.left <= card.right + .5 && cue.right >= card.right - .5, `${label}: cue over the card's right edge: ${JSON.stringify([cue, card])}`);
  assert(cue.top <= card.top + 4.5 && cue.bottom >= card.top - .5, `${label}: cue on the card's top edge: ${JSON.stringify([cue, card])}`);
  for (const part of [...measured.bar, measured.title]) apart(cue, part, `${label} cue/sky`);
  apart(cue, measured.tray, `${label} cue/tray`);
}
const phaseIs = (page, phase) => page.waitForFunction(phase => document.querySelector('.whose-jaw-board')?.dataset.phase === phase, phase);
async function owner(page) {
  const id = (await page.locator('.jaw-loose img').getAttribute('src')).match(/\/([^/]+)\/[^/]+\.webp/)[1];
  const cards = page.locator('.jaw-dinosaur');
  const names = await cards.evaluateAll(cards => cards.map(card => [card.getAttribute('aria-label'), card.querySelector('.jaw-gummy').getAttribute('src')]));
  const right = names.find(([, src]) => src.includes(`/${id}/`))[0];
  return { right, wrong: names.find(([name]) => name !== right)[0] };
}
const card = (page, name) => page.locator(`.jaw-dinosaur[aria-label="${name}"]`);
async function waiting(page) {
  await phaseIs(page, 'waiting');
  await page.waitForFunction(() => [...document.querySelectorAll('.jaw-sand img')].every(e => e.complete && e.naturalWidth > 0));
  await settle(page);
}
// Puts the jaw on a card by tapping both; the cue's wrong step lasts
// only as long as the game shows it, so it is measured as it comes.
async function tapPlace(page, name) {
  await page.locator('.jaw-loose').click();
  await card(page, name).click();
}
async function wrongStep(page, name) {
  await tapPlace(page, name);
  await phaseIs(page, 'wrong');
  await page.waitForFunction(() => document.querySelector('.jaw-feedback')?.style.getPropertyValue('--cue-x'));
  return measureBoard(page);
}
async function rightStep(page, name) {
  await tapPlace(page, name);
  await phaseIs(page, 'reading');
  await settle(page);
  return measureBoard(page);
}
// A board's sockets keep their size filled or empty, so the fifth jaw's
// board differs from the first's only in them: the walk to it, five of
// the game's own right steps long, is made once per size.
async function board(page, width, height, label, fit, level, shoot, fifth) {
  const steps = [];
  const check = (step, measured) => { boardFits(measured, width, height, `${label} ${level} ${step}`, fit); steps.push(step); return measured; };
  const first = await measureBoard(page);
  if (first.loading) check('pictures loading', first);
  await page.evaluate(() => window.__release());
  await waiting(page);
  const shown = check('jaw waiting', await measureBoard(page));
  assert.equal(shown.cards.length, LEVELS.indexOf(level) + 2, `${label} ${level}: cards`);
  assert.equal(shown.cards.filter(card => card.tag).length, level === 'hatchling' ? 2 : 0, `${label} ${level}: food tags`);
  assert.equal(shown.cards.filter(card => card.label).length, level === 'paleontologist' ? 4 : 0, `${label} ${level}: names`);
  assert(shown.prompt && shown.jaw, `${label} ${level}: jaw and prompt in the tray`);
  await shoot(`${level}-waiting`);
  const { right, wrong } = await owner(page);
  if (level === 'hatchling') {
    await page.locator('.jaw-loose').click();
    const held = check('jaw picked up', await measureBoard(page));
    assert.equal(held.prompt, null, `${label}: the held jaw clears the prompt`);
    await shoot(`${level}-picked`);
    await card(page, wrong).click();
    await phaseIs(page, 'wrong');
    await page.waitForFunction(() => document.querySelector('.jaw-feedback')?.style.getPropertyValue('--cue-x'));
    cueOn(check('wrong', await measureBoard(page)), wrong, width, height, `${label} ${level}`);
    await waiting(page);
    await wrongStep(page, wrong);
    await waiting(page);
    const hint = check('hint', await measureBoard(page));
    assert(hint.promptPicture, `${label}: the hint's food in the tray`);
    await shoot(`${level}-hint`);
  } else if (level === 'explorer') {
    const jaw = await page.locator('.jaw-loose').boundingBox(), to = await card(page, wrong).boundingBox();
    await page.mouse.move(jaw.x + jaw.width / 2, jaw.y + jaw.height / 2);
    await page.mouse.down();
    await page.mouse.move((jaw.x + jaw.width / 2 + to.x + to.width / 2) / 2, (jaw.y + jaw.height / 2 + to.y + to.height / 2) / 2, { steps: 4 });
    const dragged = await measureBoard(page);
    assert(dragged.ghost, `${label}: a faint jaw stays in the tray while one is dragged`);
    await shoot(`${level}-dragging`);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    await page.mouse.up();
    await phaseIs(page, 'wrong');
    await page.waitForFunction(() => document.querySelector('.jaw-feedback')?.style.getPropertyValue('--cue-x'));
    cueOn(check('wrong', await measureBoard(page)), wrong, width, height, `${label} ${level}`);
    await settle(page);
    await shoot(`${level}-wrong`);
    await waiting(page);
  } else {
    cueOn(check('look-alike', await wrongStep(page, wrong)), wrong, width, height, `${label} ${level}`);
    await settle(page);
    await shoot(`${level}-wrong`);
    await waiting(page);
    for (let jaw = 1; fifth && jaw < 5; jaw++) {
      await rightStep(page, (await owner(page)).right);
      await page.locator('.jaw-next').press('Enter');
      await waiting(page);
    }
  }
  const read = check(level === 'paleontologist' && fifth ? 'fifth jaw right' : 'right', await rightStep(page, (await owner(page)).right));
  if (level === 'paleontologist' && fifth) assert.equal(await page.locator('.jaw-socket[data-filled]').count(), 5, `${label}: five jaws placed`);
  assert(read.next, `${label} ${level}: NEXT waits`);
  assert.equal(!!read.cue, level === 'paleontologist', `${label} ${level}: the fact only for a paleontologist`);
  await shoot(`${level}-right`);
  return steps;
}
// Render the real result with the app's pictures, timer and size classifier,
// so presentation cases do not depend on the board's deal or scoring.
const resultHarness = `
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WhoseJawResultScreen } from './src/WhoseJawResultScreen.tsx';
import { GameAudioButton } from './src/GameAudioButton.tsx';
import { PicturesProvider } from './src/Picture.tsx';
import { appProps } from './src/root.ts';
import '@fontsource-variable/lexend';
import './src/app.css';
const app = appProps(window);
const root = createRoot(document.getElementById('root'));
window.showResult = ({ language, theme, stars, celebration, newly, offer = false, pictures = 'loaded' }) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.size = app.viewport.sizeClass();
  window.resultActions = [];
  const action = name => () => window.resultActions.push(name);
  const jaws = app.whoseJaw.jaws.slice(0, 5).map(({ id, name }, i) => ({ id, name, picture: app.whoseJaw.jawFor(id), newly: i < newly }));
  const store = pictures === 'loaded' ? app.pictures : { request() {}, status: () => pictures === 'failed' ? 'failed' : 'loading', subscribe: () => () => {} };
  flushSync(() => root.render(h(PicturesProvider, { key: JSON.stringify([stars, celebration, newly, offer, pictures]), store, startTimer: app.startTimer },
    h(WhoseJawResultScreen, { language, result: { stars, best: 3, beaten: celebration === 'new-best' ? 1 : undefined, celebration, jaws },
      audioControl: h(GameAudioButton, { language, muted: false, onToggle: action('audio') }),
      onPlayAgain: action('play'), onShelf: action('shelf'), onHome: action('home'),
      offer: offer ? { level: 'paleontologist', startTimer: app.startTimer, onShown: action('shown'), onYes: action('yes'), onNotNow: action('not-now') } : undefined
    }))));
};
`;
async function result(page, width, height, label, newly, pictures) {
  const measured = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = e => e.getBoundingClientRect().toJSON();
    const hit = e => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e.contains(top) || (top ? `${top.tagName}.${top.className}` : "nothing"); };
    return {
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      scrolls: [...document.querySelectorAll('.whose-jaw-result, .jaw-result-body, .jaw-result-rewards')].some(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1),
      parts: Object.fromEntries(['pile', 'rewards', 'actions', 'audio'].map(name => [name, box(q('.jaw-result-' + name))])),
      rewards: [...q('.jaw-result-rewards').children].map(box),
      cards: [...document.querySelectorAll('.jaw-result-jaws li')].map(box),
      finds: [...document.querySelectorAll('.jaw-result-find')].map(box),
      shelf: q('.jaw-result-shelf') && box(q('.jaw-result-shelf')),
      buttons: [...document.querySelectorAll('.whose-jaw-result button')].map(e => ({ label: e.textContent, ...box(e), hit: hit(e) })),
      words: [...document.querySelectorAll('.jaw-result-title, .jaw-result-action-word, .jaw-result-new-label, .celebration-text')].filter(e => e.getClientRects().length > 0).map(e => ({ text: e.textContent, minimum: e.matches('.celebration-text, .jaw-result-new-label') ? 14 : 18, fits: e.scrollWidth <= e.clientWidth + 1, size: parseFloat(getComputedStyle(e).fontSize), ...box(e) })),
      record: box(q('.jaw-result-record')),
      recordParts: [...document.querySelectorAll('.jaw-result-record > *')].map(box),
      bedrock: getComputedStyle(q('.jaw-result-bedrock')).display === 'none' ? innerHeight : box(q('.jaw-result-bedrock')).top - 10,
      wave: box(q('.jaw-result-wave')),
      pictures: [...document.querySelectorAll('.jaw-result-jaws .picture, .jaw-result-find .picture')].map(e => ({ look: e.dataset.picture, drawn: e.naturalWidth > 0 && getComputedStyle(e).opacity === '1' })),
      motion: [...document.querySelectorAll('.jaw-result-jaws li, .jaw-result-find')].map(e => getComputedStyle(e).animationName),
      version: getComputedStyle(q('#version')).display
    };
  });
  assert.deepEqual(measured.overflow, [false, false], `${label}: page scrolls`);
  assert(!measured.scrolls, `${label}: result content scrolls or is clipped`);
  assert.equal(measured.version, 'none', `${label}: version hidden`);
  assert.deepEqual([measured.wave.x, measured.wave.width], [0, width], `${label}: full width earth edge`);
  for (const [name, part] of Object.entries(measured.parts)) inside(part, width, measured.bedrock, `${label} ${name}`);
  for (const [i, a] of Object.values(measured.parts).entries()) for (const b of Object.values(measured.parts).slice(i + 1)) apart(a, b, `${label} result regions`);
  for (const [i, a] of measured.rewards.entries()) for (const b of measured.rewards.slice(i + 1)) apart(a, b, `${label} rewards`);
  for (const card of measured.cards) inside(card, width, measured.bedrock, `${label} jaw card`);
  assert.equal(measured.cards.length, 5, `${label}: five returned jaws`);
  assert.equal(measured.finds.length, newly, `${label}: new finds`);
  for (const find of measured.finds) {
    assert(find.bottom <= measured.shelf.bottom && find.left >= measured.shelf.left && find.right <= measured.shelf.right, `${label}: find on plank`);
    inside(find, width, measured.bedrock, `${label} find`);
  }
  for (const [i, a] of measured.buttons.entries()) {
    assert(a.width >= 44 && a.height >= 44 && a.hit === true, `${label}: reachable action ${JSON.stringify(a)}`);
    for (const b of measured.buttons.slice(i + 1)) apart(a, b, `${label} buttons`);
  }
  for (const word of measured.words) assert(word.fits && word.width > 1 && word.size >= word.minimum, `${label}: readable label ${JSON.stringify(word)}`);
  for (const child of measured.recordParts) assert(child.left >= measured.record.left && child.right <= measured.record.right + .5, `${label}: best chip fits`);
  assert(measured.pictures.every(p => pictures === 'loaded' ? p.drawn : p.look === pictures), `${label}: picture places: ${JSON.stringify(measured.pictures)}`);
  assert(measured.motion.every(name => name === 'fade-in'), `${label}: reduced motion fades`);
}
async function shelf(page, width, height, label, earned) {
  await page.locator('.whose-jaw-shelf').press('Enter');
  await page.locator('.whose-jaw-shelf-screen').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.jaw-shelf-picture')].every(e => ['appearing', 'shown'].includes(e.dataset.picture)));
  await settle(page);
  const measured = await page.evaluate(() => {
    const box = e => { const { top, right, bottom, left, width, height } = e.getBoundingClientRect(); return { top, right, bottom, left, width, height }; };
    const fits = e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1;
    return {
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      content: box(document.querySelector('.jaw-shelf-content')),
      rows: [...document.querySelectorAll('.jaw-shelf-row')].map(e => ({ box: box(e), places: e.querySelectorAll('.jaw-shelf-place').length, plank: getComputedStyle(e, '::after').backgroundColor })),
      taps: [...document.querySelectorAll('.whose-jaw-shelf-screen button:not(:disabled)')].map(e => ({ ...box(e), hit: e.contains(document.elementFromPoint(e.getBoundingClientRect().x + e.clientWidth / 2, e.getBoundingClientRect().y + e.clientHeight / 2)) })),
      labels: [...document.querySelectorAll('.jaw-shelf-name, .jaw-shelf-title, .jaw-shelf-labels > span')].map(e => ({ text: e.textContent, fits: fits(e), size: parseFloat(getComputedStyle(e).fontSize), ...box(e) })),
      places: [...document.querySelectorAll('.jaw-shelf-place')].map(e => ({ box: box(e), disabled: e.disabled, unknown: !!e.querySelector('.jaw-shelf-unknown'), opacity: e.querySelector('.jaw-shelf-silhouette') && getComputedStyle(e.querySelector('.jaw-shelf-silhouette')).opacity })),
      count: document.querySelector('.jaw-shelf-count').textContent,
      version: getComputedStyle(document.querySelector('#version')).display,
      motion: getComputedStyle(document.querySelector('.jaw-shelf-row')).animationName
    };
  });
  assert.deepEqual(measured.overflow, [false, false], `${label}: shelf page scrolls`);
  inside(measured.content, width, height, `${label}: shelf content`);
  assert.equal(measured.version, 'none', `${label}: version hidden`);
  assert.equal(measured.motion, 'fade-in', `${label}: reduced shelf motion`);
  assert.equal(measured.count, `${earned}/ 16`, `${label}: collection count`);
  assert.equal(measured.rows.length, 4);
  for (const [i, row] of measured.rows.entries()) {
    assert.equal(row.places, 4);
    assert.notEqual(row.plank, 'rgba(0, 0, 0, 0)', `${label}: plank`);
    inside(row.box, width, height, `${label}: row ${i}`);
    for (const other of measured.rows.slice(i + 1)) apart(row.box, other.box, `${label}: rows`);
  }
  assert.equal(measured.places.filter(e => !e.disabled).length, earned);
  for (const [i, place] of measured.places.entries()) {
    inside(place.box, width, height, `${label}: place ${i}`);
    assert.equal(place.unknown, place.disabled);
    if (place.disabled) assert.equal(place.opacity, '0.12');
    for (const other of measured.places.slice(i + 1)) apart(place.box, other.box, `${label}: places`);
  }
  for (const tap of measured.taps) assert(tap.width >= 44 && tap.height >= 44 && tap.hit === true, `${label}: shelf tap ${JSON.stringify(tap)}`);
  for (const word of measured.labels) assert(word.fits && word.size >= 11, `${label}: shelf word ${JSON.stringify(word)}`);
  if (process.env.TEETH_SCREENSHOTS) await page.screenshot({ path: join(process.env.TEETH_SCREENSHOTS, `shelf-${label.replaceAll(' ', '-')}.png`) });
  const openers = page.locator('.jaw-shelf-place:not(:disabled)');
  // The full collection exercises every localized name and fact, including
  // the longest, against the card's available space.
  for (let i = 0; i < await openers.count(); i++) {
    const opener = openers.nth(i);
    await opener.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.jaw-shelf-card img')].every(e => ['appearing', 'shown'].includes(e.dataset.picture)));
    await settle(page);
    const card = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const box = e => { const { top, right, bottom, left } = e.getBoundingClientRect(); return { top, right, bottom, left }; };
      const selectors = ['.jaw-card-pictures', '.jaw-shelf-card h2', '.jaw-card-diet', '.jaw-card-fact', '.jaw-card-controls'];
      return {
        box: box(q('.jaw-shelf-card')),
        scrolls: q('.jaw-shelf-card').scrollHeight > q('.jaw-shelf-card').clientHeight + 1,
        parts: selectors.map(s => box(q(s))),
        labels: ['.jaw-card-title', '.jaw-card-fact', '.jaw-card-diet'].map(s => ({ text: q(s).textContent, fits: q(s).scrollWidth <= q(s).clientWidth + 1, size: parseFloat(getComputedStyle(q(s)).fontSize) })),
        motion: getComputedStyle(q('.jaw-card-chomp')).animationName,
        pictures: [...document.querySelectorAll('.jaw-shelf-card img')].every(e => e.naturalWidth > 0),
        focus: q('.jaw-shelf-card').contains(document.activeElement)
      };
    });
    inside(card.box, width, height, `${label}: card`);
    assert(!card.scrolls && card.focus && card.pictures, `${label}: card visible, loaded and focused`);
    assert.equal(card.motion, 'fade-in', `${label}: reduced chomp motion`);
    for (const [j, a] of card.parts.entries()) {
      inside(a, width, height, `${label}: card part ${j}`);
      for (const b of card.parts.slice(j + 1)) apart(a, b, `${label}: card parts`);
    }
    for (const word of card.labels) assert(word.fits && word.size >= 16, `${label}: card word ${JSON.stringify(word)}`);
    if (i === 0 && process.env.TEETH_SCREENSHOTS) await page.screenshot({ path: join(process.env.TEETH_SCREENSHOTS, `card-${label.replaceAll(' ', '-')}.png`) });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert(await opener.evaluate(e => document.activeElement === e), `${label}: focus returns to the shelf place`);
  }
}

async function main() {
  const { build } = await import('vite');
  const bundle = await build({ root: resolve(__dirname, '..'), logLevel: 'error',
    plugins: [{ name: 'result-presentation', resolveId(id) { if (id === 'virtual:jaw-result') return resolve(__dirname, '../result-harness.js'); },
      load(id) { if (id === resolve(__dirname, '../result-harness.js')) return resultHarness; } }],
    build: { write: false, rollupOptions: { input: { app: resolve(__dirname, '../index.html'), 'jaw-result': 'virtual:jaw-result' } } }
  });
  const files = new Map(bundle.output.map(f => [f.fileName, f.type === 'chunk' ? f.code : f.source]));
  const resultEntry = bundle.output.find(f => f.type === 'chunk' && f.name === 'jaw-result').fileName;
  files.set('result.html', String(files.get('index.html')).replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, `<script type="module" src="/${resultEntry}"></script>`));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let checked = 0, boardSteps = 0, shelfViews = 0;
  try {
    // The checks measure layout, which a theme leaves alone: each size runs
    // in one theme, alternating, and screenshots take both.
    const themesAt = at => process.env.TEETH_SCREENSHOTS ? ['light', 'dark'] : [at % 2 ? 'dark' : 'light'];
    const configs = [...sizes.entries()].flatMap(([at, size]) => ['en', 'ru'].flatMap(language => themesAt(at).map((theme, _, themes) => [size, language, theme, themes])));
    // Each configuration has its own context, so a few run side by side.
    const run = async ([[width, height, sandTop, bedrock], language, theme, themes]) => {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        // Pictures asked for while holding wait until the page releases
        // them, so a board can be seen with its pictures loading.
        let holding = false;
        const held = [];
        await context.exposeFunction('__hold', () => { holding = true; });
        await context.exposeFunction('__release', () => { holding = false; held.splice(0).forEach(release => release()); });
        await context.route('http://teeth.test/**', async route => {
          const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          if (holding && extname(file) === '.webp') await new Promise(release => held.push(release));
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
        for (const level of LEVELS) {
          const label = `${width}x${height} ${language} ${theme}`;
          await page.reload();
          await page.locator('[data-turn-part="tile-whoseJaw"]').press('Enter');
          await page.locator('.whose-jaw-welcome').waitFor();
          // Keys, not taps: the app takes a second tap this close to the
          // first for half of a double tap.
          const choice = page.locator('.whose-jaw-welcome .level-switch-level').nth(LEVELS.indexOf(level));
          if (await choice.getAttribute('aria-pressed') !== 'true') await choice.press('Enter');
          await page.waitForFunction(at => document.querySelectorAll('.whose-jaw-welcome .level-switch-level')[at]?.getAttribute('aria-pressed') === 'true', LEVELS.indexOf(level));
          await settle(page);
          await page.evaluate(() => window.__hold());
          await page.locator('.whose-jaw-play').press('Enter');
          await page.locator('.whose-jaw-board').waitFor();
          await settle(page);
          const shoot = async name => {
            if (!process.env.TEETH_SCREENSHOTS) return;
            await page.screenshot({ path: join(process.env.TEETH_SCREENSHOTS, `board-${width}x${height}-${language}-${theme}-${name}.png`) });
          };
          // Counted after the await: runs side by side would lose each other's.
          const steps = await board(page, width, height, label, { sandTop, bedrock, phone: width < 600 || height < 600 }, level, shoot, language === 'en' && theme === themes[0]);
          boardSteps += steps.length;
        }
        for (const saved of [undefined, returning, { ...returning, earned: require('../src/data/jaws.json').map(jaw => jaw.id) }]) {
          await page.goto('http://teeth.test/');
          await page.evaluate(saved => localStorage.setItem('rexlab-progress', JSON.stringify({ schemaVersion: 1, games: { 'whose-jaw': saved, 'home-featured': { featured: { game: 'compare', visit: 1 }, starts: {} } } })), saved);
          await page.reload();
          await page.locator('[data-turn-part="tile-whoseJaw"]').press('Enter');
          await page.locator('.whose-jaw-welcome').waitFor();
          await settle(page);
          await shelf(page, width, height, `${width}x${height} ${language} ${theme} ${saved?.earned.length || 0}`, saved?.earned.length || 0);
          shelfViews++;
        }
        await page.goto('http://teeth.test/result.html');
        await page.waitForFunction(() => !!window.showResult);
        const cases = [
          { stars: 3, celebration: 'first-best', newly: 5, pictures: 'loaded' },
          { stars: 2, celebration: 'new-best', newly: 2, pictures: 'loaded' },
          { stars: 1, celebration: null, newly: 0, pictures: 'loaded' },
          { stars: 3, celebration: 'first-best', newly: 5, pictures: 'loading' },
          { stars: 3, celebration: 'first-best', newly: 5, pictures: 'failed' }
        ];
        for (const scenario of cases) {
          await page.evaluate(options => window.showResult(options), { language, theme, ...scenario });
          await page.locator('.whose-jaw-result').waitFor();
          if (scenario.pictures === 'loaded') await page.waitForFunction(() => [...document.querySelectorAll('.whose-jaw-result .picture')].every(e => ['appearing', 'shown'].includes(e.dataset.picture)));
          await settle(page);
          const label = `${width}x${height} ${language} ${theme} result ${scenario.celebration || 'ordinary'} ${scenario.pictures}`;
          if (process.env.TEETH_SCREENSHOTS) {
            await mkdir(process.env.TEETH_SCREENSHOTS, { recursive: true });
            await page.screenshot({ path: join(process.env.TEETH_SCREENSHOTS, `result-${width}x${height}-${language}-${theme}-${scenario.celebration || 'ordinary'}-${scenario.pictures}.png`) });
          }
          await result(page, width, height, label, scenario.newly, scenario.pictures);
          for (const action of ['play', 'visit', 'home']) await page.locator('.jaw-result-' + action).press('Enter');
          assert.deepEqual(await page.evaluate(() => window.resultActions), ['play', 'shelf', 'home'], `${label}: actions`);
          checked++;
        }
        await page.evaluate(options => window.showResult(options), { language, theme, stars: 2, celebration: null, newly: 0, offer: true });
        await page.getByRole('dialog').waitFor();
        assert(await page.locator('.whose-jaw-result').evaluate(e => e.inert), 'offer blocks the result');
        const offer = await page.getByRole('dialog').boundingBox();
        inside({ left: offer.x, right: offer.x + offer.width, top: offer.y, bottom: offer.y + offer.height }, width, height, 'level offer');
        await page.locator('.pairs-offer-not-now').press('Enter');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.jaw-result-play').evaluate(e => e === document.activeElement && !e.disabled), true, 'result regains focus after offer');
        assert.deepEqual(await page.evaluate(() => window.resultActions), ['shown', 'not-now']);
        assert.deepEqual(errors, [], `${width}x${height} ${language} ${theme}: page errors`);
      } finally { await context.close(); }
    };
    const queue = [...configs];
    await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await run(queue.shift()); }));
    console.log(`PASS ${checked} WHOSE JAW? welcome/result configurations, ${shelfViews} shelf views and ${boardSteps} board steps: layout, fit, overlap, scrolling, labels and motion`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
