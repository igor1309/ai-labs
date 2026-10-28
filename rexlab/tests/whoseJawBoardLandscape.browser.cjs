// Run against the app's separately started dev server, with Playwright on NODE_PATH:
// BOARD_URL=http://127.0.0.1:5188 node tests/whoseJawBoardLandscape.browser.cjs
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium } = require("playwright");
const jaws = require("../src/data/jaws.json");

const url = process.env.BOARD_URL || "http://127.0.0.1:5188";
const screenshots = process.env.BOARD_SCREENSHOTS || "/tmp/lab-705";
const sizes = [[1180, 820], [1366, 956], [844, 390], [390, 844], [820, 1180]];

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter((animation) =>
      animation.effect?.getComputedTiming().iterations !== Infinity
    ).map((animation) => animation.finished.catch(() => {})));
  });
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
      return { x, y, width, height, top, right, bottom, left };
    };
    const get = (selector) => rect(document.querySelector(selector));
    const painted = (image) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let left = canvas.width, right = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 32) {
          left = Math.min(left, x); right = Math.max(right, x);
        }
      }
      return (right - left + 1) * image.getBoundingClientRect().width / canvas.width;
    };
    const controls = [...document.querySelectorAll(".whose-jaw-board-bar button, .jaw-next")].map((button) => {
      const box = rect(button);
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { ...box, hit: button.contains(hit), label: button.getAttribute("aria-label") || button.textContent };
    });
    const loose = document.querySelector(".jaw-loose");
    const feedback = document.querySelector(".jaw-feedback p");
    return {
      overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      title: get(".jaw-board-title"), choices: get(".jaw-choices"), tray: get(".jaw-tray"),
      cards: [...document.querySelectorAll(".jaw-dinosaur")].map((card) => ({
        ...rect(card), border: parseFloat(getComputedStyle(card).borderTopWidth),
        art: rect(card.querySelector(".jaw-gummy")),
        name: card.querySelector(".jaw-name") && rect(card.querySelector(".jaw-name"))
      })),
      jaw: getComputedStyle(loose).display === "none" ? null : { ...rect(loose), paintedWidth: painted(loose.querySelector("img")) },
      feedback: feedback && rect(feedback), next: document.querySelector(".jaw-next") && get(".jaw-next"), controls,
      breathing: getComputedStyle(document.querySelector(".jaw-breath")).animationName
    };
  });
}

function fits(measured, width, height) {
  assert.deepEqual(measured.overflow, [false, false], "page overflow");
  for (const box of [measured.title, measured.choices, measured.tray, measured.feedback, measured.next].filter(Boolean)) {
    assert(box.left >= 0 && box.right <= width + .5 && box.top >= 0 && box.bottom <= height + .5, JSON.stringify(box));
  }
  for (const control of measured.controls) {
    assert(control.width >= 48 && control.height >= 48 && control.hit, JSON.stringify(control));
  }
}

async function check(browser, width, height, language, theme, level, reducedMotion = "reduce") {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, colorScheme: theme });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const tag = `${width}x${height}-${language}-${theme}-${level}-${reducedMotion}`;
  try {
    await page.addInitScript(({ language, theme, level }) => {
      localStorage.setItem("rexlab-language", language);
      localStorage.setItem("rexlab-theme", theme);
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level: ["hatchling", "explorer", "paleontologist"][level], revision: "browser-layout" }));
      // A repeatable deal keeps the geometry and interaction cases reproducible.
      let seed = 705;
      Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    }, { language, theme, level });
    await page.goto(url);
    await page.getByRole("button", { name: language === "en" ? "WHOSE JAW?" : "ЧЬЯ ЧЕЛЮСТЬ?", exact: true }).click();
    await settle(page);
    await page.waitForTimeout(600);
    await page.locator(".whose-jaw-play").click();
    await page.waitForFunction(() => document.querySelector(".whose-jaw-board")?.dataset.phase === "waiting");
    await page.waitForFunction(() => [...document.querySelectorAll(".jaw-loose img, .jaw-gummy")].every((image) => image.complete && image.naturalWidth > 0));
    await settle(page);
    const waiting = await geometry(page);
    fits(waiting, width, height);
    assert.equal(waiting.cards.length, level + 2);
    assert(waiting.cards.every((card) => card.border >= 2 && card.width >= 48 && card.height >= 48));
    for (const card of waiting.cards) {
      assert(card.art.left >= card.left && card.art.right <= card.right + .5 && card.art.bottom <= card.bottom + .5, "art fits its card");
      if (card.name) assert(card.name.top >= card.art.bottom - .5 && card.name.bottom <= card.bottom + .5, "name fits below art");
    }
    if (width > height) {
      assert(waiting.choices.top - waiting.title.bottom <= 20, "choices must stay near title");
      assert(waiting.cards.every((card) => Math.abs(card.top - waiting.cards[0].top) < 1), "one landscape row");
      assert(waiting.tray.width <= waiting.jaw.width + 24, "tray wraps artwork");
      if (height >= 600) {
        assert(waiting.jaw.paintedWidth >= 320 && waiting.jaw.paintedWidth <= 440, "inspectable painted jaw");
        assert(waiting.tray.top >= waiting.choices.bottom && waiting.tray.top - waiting.choices.bottom <= 48);
      } else {
        assert(waiting.jaw.width >= 160);
        assert(waiting.tray.left >= waiting.choices.right, "short landscape side tray");
      }
    }
    if (reducedMotion === "reduce") assert.equal(waiting.breathing, "none");
    await page.screenshot({ path: join(screenshots, `landscape-${tag}-waiting.png`) });
    const id = (await page.locator(".jaw-loose img").getAttribute("src")).match(/\/([^/]+)\.webp/)[1];
    const owner = page.locator(`.jaw-dinosaur:has(.jaw-gummy[src*="/${id}/gummy.webp"])`);
    const jaw = page.locator(".jaw-loose");
    if (level === 0) {
      await jaw.click();
      await owner.click();
    } else if (level === 1) {
      await jaw.focus();
      await page.keyboard.press("Space");
      await owner.focus();
      await page.keyboard.press("Enter");
    } else {
      const start = await jaw.boundingBox(), end = await owner.boundingBox();
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForFunction(() => document.querySelector(".whose-jaw-board")?.dataset.phase === "reading");
    await settle(page);
    if (level === 2) {
      assert((await page.locator(".jaw-feedback p").textContent()).includes(jaws.find((jaw) => jaw.id === id).fact[language]));
    } else {
      assert.equal(await page.locator(".jaw-feedback p").count(), 0);
    }
    assert(await page.locator(".jaw-next").isEnabled());
    const reading = await geometry(page);
    fits(reading, width, height);
    assert.equal(reading.jaw, null, "hidden jaw releases layout space");
    if (reading.feedback) {
      assert(reading.feedback.top >= reading.choices.bottom, "fact below choices");
      assert(reading.next.right <= reading.feedback.left || reading.next.left >= reading.feedback.right || reading.next.bottom <= reading.feedback.top || reading.next.top >= reading.feedback.bottom, "fact and Next do not overlap");
    }
    await page.screenshot({ path: join(screenshots, `landscape-${tag}-reading.png`) });
    await page.locator(".jaw-next").click();
    await page.waitForFunction(() => document.querySelector(".whose-jaw-board")?.dataset.phase === "waiting");
    assert.equal(await page.locator(".jaw-socket[data-filled]").count(), 1);
    assert.equal(await page.locator(".jaw-feedback p").count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${tag}: waiting, reading, Next and placement geometry`);
  } catch (error) {
    await page.screenshot({ path: join(screenshots, `landscape-${tag}-failure.png`), fullPage: true }).catch(() => {});
    throw new Error(`${tag}: ${error.message}`, { cause: error });
  } finally {
    await context.close();
  }
}

(async () => {
  await mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
  try {
    for (const [width, height] of sizes) for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) for (const level of [0, 1, 2]) {
      await check(browser, width, height, language, theme, level);
    }
    await check(browser, 1180, 820, "en", "light", 2, "no-preference");
    console.log("PASS 61 board configurations: all geometry and interactions fit");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  console.error(`FAIL board browser checks: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
});
