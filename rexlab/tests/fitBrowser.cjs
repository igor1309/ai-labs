// Shared parts of the browser fit contracts: a dev server, a page opened at
// a window size with the app's settings and safe-area insets, and checks
// on what the browser laid out. Each contract measures its screen's parts
// with boundingBox(); none of them models the stylesheet.
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { chromium } = require("playwright");

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const LEVELS = ["hatchling", "explorer", "paleontologist"];

// The windows each screen's size classes change at, and the devices the
// app ships for. Each size class is opened at both of its edges.
const EDGES = {
  wide: [[900, 600], [1024, 690], [1920, 1080]],
  "wide-short": [[899, 599], [1508, 594], [568, 320], [667, 375]],
  tall: [[600, 800], [1024, 1366]],
  "tall-narrow": [[599, 1000], [320, 568], [567, 400]]
};

const DEVICES = {
  wide: [[1024, 768], [1133, 744], [1180, 820], [1376, 1032], [1440, 900]],
  "wide-short": [[852, 393, { top: 0, right: 59, bottom: 21, left: 59 }], [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }]],
  tall: [[744, 1133, { top: 24, right: 0, bottom: 20, left: 0 }], [820, 1180]],
  "tall-narrow": [[375, 667], [393, 852, { top: 59, right: 0, bottom: 34, left: 0 }]]
};

// Every window a screen's fit is checked at, with its size class.
function windows() {
  return Object.keys(EDGES).flatMap((size) => [...EDGES[size], ...DEVICES[size]].map(([width, height, insets = NO_INSETS]) => ({ size, width, height, insets })));
}

async function startServer() {
  if (process.env.FIT_URL) return { url: process.env.FIT_URL, close: async () => {} };
  const { createServer } = await import("vite");
  const server = await createServer({ root: join(__dirname, ".."), logLevel: "error", server: { host: "127.0.0.1", port: 0, open: false } });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });

// A page `width` by `height` with the app's settings. Chromium gives no
// safe-area insets, so the stylesheets are served with each env() inset
// as the device would resolve it.
async function openPage(browser, url, { width, height, insets = NO_INSETS, language = "en", theme = "light", level = 1 }) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", colorScheme: theme, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\.css(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g, (_, side) => `${insets[side]}px`);
    await route.fulfill({ response, body });
  });
  await page.addInitScript(({ language, theme, level }) => {
    localStorage.setItem("rexlab-language", language);
    localStorage.setItem("rexlab-theme", theme);
    localStorage.setItem("rexlab-age-level", JSON.stringify({ level, revision: "browser-fit" }));
    let seed = 705;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  }, { language, theme, level: LEVELS[level] });
  await page.goto(url);
  return { page, errors, close: () => context.close() };
}

// Fonts loaded and every finite animation finished.
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter((animation) =>
      animation.effect?.getComputedTiming().iterations !== Infinity
    ).map((animation) => animation.finished.catch(() => {})));
  });
}

// The boxes of every element `locator` matches.
async function boxes(locator) {
  return Promise.all((await locator.all()).map(async (each) => {
    const box = await each.boundingBox();
    assert(box, "a part is not laid out");
    return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height, width: box.width, height: box.height };
  }));
}

const box = async (locator) => (await boxes(locator.first()))[0];

const SLACK = 0.5;

function inside(inner, outer, what) {
  assert(inner.left >= outer.left - SLACK && inner.right <= outer.right + SLACK && inner.top >= outer.top - SLACK && inner.bottom <= outer.bottom + SLACK,
    `${what}: ${JSON.stringify(inner)} is not inside ${JSON.stringify(outer)}`);
}

// The part of the window clear of the safe-area insets.
const safeArea = ({ width, height, insets }) => ({ left: insets.left, top: insets.top, right: width - insets.right, bottom: height - insets.bottom });

// Boxes that stand in one row: their vertical centres agree.
function oneRow(row, what) {
  const middles = row.map(({ top, bottom }) => (top + bottom) / 2);
  assert(Math.max(...middles) - Math.min(...middles) <= 2, `${what} are not on one row: ${JSON.stringify(row)}`);
}

function tapTargets(row, least, what) {
  for (const each of row) assert(each.width >= least - SLACK && each.height >= least - SLACK, `${what} under ${least}: ${JSON.stringify(each)}`);
}

// The page neither scrolls nor overflows the window.
async function noOverflow(page, what) {
  const [x, y] = await page.evaluate(() => [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight]);
  assert.deepEqual([x, y], [false, false], `${what}: the page overflows`);
}

// The text of each element `locator` matches that its box clips or wraps.
async function clippedText(locator) {
  return locator.evaluateAll((elements) => elements.filter((element) => {
    const lines = Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight));
    return element.scrollWidth > element.clientWidth + 1 || lines > 1;
  }).map((element) => element.textContent));
}

// Runs `check` for each case on a shared server and browser, reporting
// each failure and setting the exit code.
async function run(name, cases, check) {
  const server = await startServer();
  const browser = await launch();
  let failed = 0;
  try {
    for (const each of cases) {
      const label = `${name} ${each.size ?? ""} ${each.width}x${each.height} ${each.language ?? "en"}${each.level === undefined ? "" : ` level ${each.level}`}`;
      const opened = await openPage(browser, server.url, each);
      try {
        await check(opened.page, each);
        assert.deepEqual(opened.errors, [], "page errors");
        console.log(`ok ${label}`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${label}: ${error.message.split("\n")[0]}`);
      } finally {
        await opened.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failed) {
    console.error(`${failed} of ${cases.length} ${name} cases failed`);
    process.exitCode = 1;
  }
}

module.exports = { NO_INSETS, EDGES, DEVICES, windows, settle, boxes, box, inside, safeArea, oneRow, tapTargets, noOverflow, clippedText, run };
