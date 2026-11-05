// Contract test: the catalogue fits each size class at its edges and on the
// shipped devices, as Chromium lays it out (catalogue-portrait.feature,
// window-fit.feature): HOME and the food symbols on one row of taps, every
// card whole with its name on one line as large as in landscape, and the
// list scrolling to its last card clear of the home indicator.
const assert = require("node:assert/strict");
const { box, boxes, inside, noOverflow, oneRow, run, safeArea, settle, tapTargets, windows } = require("./fitBrowser.cjs");

// The name's size on a 1024 by 768 landscape iPad's card, the narrowest
// there: no card's name is smaller.
const LANDSCAPE_NAME = Math.min(20, 0.07 * 213);

const cases = windows().flatMap((window) => ["en", "ru"].map((language) => ({ ...window, language })));

run("catalogue fit", cases, async (page, window) => {
  await page.locator('[data-turn-part="tile-catalogue"], .featured-card[data-game="catalogue"]').first().click();
  const list = page.locator(".catalogue-grid");
  await list.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".catalogue-picture")].every((image) => image.complete));
  await settle(page);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.size), window.size, "size class");
  await noOverflow(page, "catalogue");
  const safe = safeArea(window);

  const controls = await boxes(page.locator(".catalogue-bar button"));
  oneRow(controls, "HOME and the food symbols");
  controls.forEach((control) => inside(control, safe, "a control"));
  tapTargets(controls, window.size === "wide-short" ? 48 : 44, "a control");

  const listBox = await box(list);
  const cards = await page.locator(".catalogue-card").evaluateAll((elements) => elements.map((card) => {
    const rect = (element) => { const { left, top, right, bottom, width, height } = element.getBoundingClientRect(); return { left, top, right, bottom, width, height }; };
    const name = card.querySelector(".catalogue-name");
    return {
      label: card.getAttribute("aria-label"), box: rect(card), art: rect(card.querySelector(".catalogue-art")), name: rect(name),
      nameSize: parseFloat(getComputedStyle(name).fontSize), chips: [...card.querySelectorAll(".catalogue-chip, .diet-tag")].map(rect)
    };
  }));
  assert.equal(cards.length, 52, "every dinosaur's card");
  const firstRow = cards.filter(({ box }) => Math.abs(box.top - cards[0].box.top) < 1);
  if (window.size === "wide") assert.equal(firstRow.length, 4, "four cards to a row");
  for (const card of firstRow) inside({ ...card.box, top: listBox.top, bottom: listBox.top }, { ...listBox, left: Math.max(listBox.left, safe.left), right: Math.min(listBox.right, safe.right) }, `${card.label} across the list`);
  for (const card of cards) {
    inside(card.art, card.box, `${card.label}'s picture`);
    inside(card.name, card.box, `${card.label}'s name`);
    assert(card.name.height <= card.nameSize * 1.5, `${card.label}'s name wraps`);
    assert(card.nameSize >= LANDSCAPE_NAME - 0.01, `${card.label}'s name is ${card.nameSize}px`);
    oneRow(card.chips, `${card.label}'s chips`);
    card.chips.forEach((chip) => inside(chip, card.box, `${card.label}'s chip`));
  }
  if (window.size === "wide-short") assert(cards[0].box.height <= listBox.height, "a card stands whole under the bar");

  await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(50);
  const last = await box(page.locator(".catalogue-card").last());
  assert(last.top >= listBox.top - 0.5, "the last card starts in the list");
  assert(last.bottom <= safe.bottom + 0.5, `the last card ends at ${last.bottom}, under the home indicator at ${safe.bottom}`);
}).catch((error) => { console.error(`FAIL catalogue fit: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
