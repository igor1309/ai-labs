// Contract test: production app input, touch scrolling, Canvas and IndexedDB
// in Chromium with iPhone/iPad emulation. Native Safari callouts need a device.
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { chromium, devices } = require("playwright");

// Check real rendered descendants, including text, SVG, pictures and controls.
async function protection(page) {
  const failures = await page.evaluate(() => [...document.body.querySelectorAll("*")].flatMap(element => {
    const style = getComputedStyle(element);
    const name = `${element.tagName}.${element.getAttribute("class") || ""}`;
    const failures = [];
    if (style.userSelect !== "none" || style.webkitUserSelect !== "none") failures.push(`${name}: selectable`);
    for (const type of ["contextmenu", "selectstart"]) {
      if (element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))) failures.push(`${name}: ${type} allowed`);
    }
    return failures;
  }));
  assert.deepEqual(failures, []);
}

async function check(browser, files, device) {
  const context = await browser.newContext({ ...devices[device], reducedMotion: "reduce", serviceWorkers: "block" });
  try {
    await context.route("http://touch.test/**", async route => {
      const path = new URL(route.request().url()).pathname.slice(1) || "index.html";
      const body = files.get(path) ?? await readFile(resolve(__dirname, "../public", path));
      const contentType = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : undefined;
      await route.fulfill({ body, contentType });
    });
    await context.addInitScript(() => {
      localStorage.setItem("rexlab-language", "en");
      localStorage.setItem("rexlab-age-level", JSON.stringify({ level: "hatchling", revision: "touch" }));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const settle = async () => {
      await page.waitForFunction(() => !document.documentElement.hasAttribute("data-turning"));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
    };
    const home = async () => { await page.goto("http://touch.test/"); await page.locator(".home").waitFor(); await settle(); };
    const enter = async game => {
      await page.locator(`[data-turn-part="tile-${game}"], .featured-card[data-game="${game}"]`).press("Enter");
      await page.locator(".home").waitFor({ state: "detached" });
      await settle();
    };
    const press = async name => { await page.getByRole("button", { name, exact: true }).press("Enter"); await settle(); };
    const cancel = () => page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true })));
    await home();
    await protection(page);
    assert.equal(await page.locator("body").evaluate(e => getComputedStyle(e).touchAction), "manipulation");
    assert(!await page.locator('meta[name="viewport"]').getAttribute("content").then(value => /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/.test(value)));

    // A nested Home scroller must still accept a native finger swipe.
    const cdp = await context.newCDPSession(page);
    const row = page.locator(".games-tiles");
    const box = await row.boundingBox();
    const before = await row.evaluate(e => e.scrollLeft);
    await cdp.send("Input.synthesizeScrollGesture", { x: Math.round(Math.min(box.x + box.width / 2, page.viewportSize().width - 30)), y: Math.round(box.y + box.height / 2), xDistance: -180, yDistance: 0, gestureSourceType: "touch" });
    await page.waitForFunction(before => document.querySelector(".games-tiles").scrollLeft > before, before);

    // Every game's entry and the catalogue/dinosaur page use the shared policy.
    for (const game of ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting", "picturePuzzle", "whoseJaw"]) {
      await home(); await enter(game); await protection(page);
      if (game === "catalogue") {
        await page.locator(".catalogue-card").first().press("Enter");
        await page.locator(".dinosaur-page").waitFor(); await settle(); await protection(page);
      }
    }

    await home(); await enter("labyrinth"); await protection(page);
    // Labyrinth retains its landscape-only contract; the portrait gate is
    // protected too, and rotation must leave the same board ready for input.
    const portrait = page.viewportSize().width < page.viewportSize().height;
    if (portrait) {
      assert.equal(await page.locator('.orientation-gate[data-shown="true"]').count(), 1);
      const { width, height } = page.viewportSize();
      await page.setViewportSize({ width: height, height: width }); await settle();
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: Math.min(height / 1024, 1) });
    }
    assert.equal(await page.locator(".labyrinth-maze").evaluate(e => getComputedStyle(e).touchAction), "none");
    const start = await page.locator('[aria-current="location"]').getAttribute("aria-label");
    const step = page.locator("button[data-legal]").first();
    const next = await step.getAttribute("aria-label");
    await step.tap();
    await page.waitForFunction(next => document.querySelector('[aria-current="location"]').getAttribute("aria-label").startsWith(next), next);
    const back = page.getByRole("button", { name: start.replace(" · BABY", ""), exact: true });
    await back.press("Enter");
    assert.equal(await page.locator('[aria-current="location"]').getAttribute("aria-label"), start);
    // Event timestamps, rather than runner speed, define the duplicate burst.
    await cancel();
    await page.evaluate(({ next, start }) => {
      const cell = label => [...document.querySelectorAll(".labyrinth-cell")].find(e => e.getAttribute("aria-label") === label);
      const tap = (element, time) => {
        const box = element.getBoundingClientRect();
        const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
        for (const [type, stamp] of [["pointerdown", time], ["pointerup", time + 30]]) {
          const event = new PointerEvent(type, { ...point, pointerId: 1, pointerType: "touch", button: 0, bubbles: true, cancelable: true });
          Object.defineProperty(event, "timeStamp", { value: stamp });
          element.dispatchEvent(event);
        }
        element.dispatchEvent(new MouseEvent("click", { ...point, detail: 1, bubbles: true, cancelable: true }));
      };
      const forward = cell(next), backward = cell(start);
      tap(forward, 1000); tap(backward, 1200);
    }, { next, start });
    await page.waitForFunction(next => document.querySelector('[aria-current="location"]').getAttribute("aria-label").startsWith(next), next);
    await protection(page);
    await cancel(); await back.tap();
    assert.equal(await page.locator('[aria-current="location"]').getAttribute("aria-label"), start);
    await press("HOME"); await page.locator(".home").waitFor();
    if (portrait) { await page.setViewportSize(devices[device].viewport); await settle(); }

    await enter("coloring"); await page.locator('.gallery-works[aria-busy="false"]').waitFor(); await protection(page);
    await press("NEW WORK"); await page.locator(".coloring-workshop canvas").waitFor(); await protection(page);
    const canvas = page.locator(".coloring-workshop canvas");
    assert.equal(await canvas.evaluate(e => getComputedStyle(e).touchAction), "none");
    const saved = () => page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent === "SAVED");
    const pixel = () => canvas.evaluate(c => [...c.getContext("2d").getImageData(420, 330, 1, 1).data]);
    const paint = async () => {
      const bounds = await canvas.boundingBox();
      const x = bounds.x + bounds.width * 420 / 920, y = bounds.y + bounds.height * 330 / 620;
      await cancel();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 20, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await saved();
      assert.deepEqual(await pixel(), [239, 83, 80, 255]);
    };
    await paint(); await protection(page);
    await press("UNDO"); await saved();
    assert.notDeepEqual(await pixel(), [239, 83, 80, 255]);
    await paint(); await press("DONE"); await page.locator(".coloring-result").waitFor(); await protection(page);
    await press("EDIT"); await page.locator(".coloring-workshop canvas").waitFor();
    await press("UNDO"); await saved(); assert.notDeepEqual(await pixel(), [239, 83, 80, 255]);
    await paint(); await press("HOME"); await page.locator(".home").waitFor(); await protection(page);
    assert.deepEqual(errors, []);
    console.log(`PASS ${device}: shared protection, scrolling, labyrinth taps, coloring strokes and keyboard navigation`);
  } finally { await context.close(); }
}

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const bundle = await build({ root: resolve(__dirname, ".."), logLevel: "error", build: { write: false } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
    for (const device of ["iPhone 13", "iPhone 13 landscape", "iPad Pro 11", "iPad Pro 11 landscape"]) await check(browser, files, device);
    console.log("PASS native touch browser contract: 4 emulated layouts (physical Safari not verified)");
  } finally {
    await browser?.close();
  }
})().catch(error => {
  console.error(error);
  console.error(`FAIL native touch browser contract: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
});
