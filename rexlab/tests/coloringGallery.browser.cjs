// Contract test: production gallery/workshop composition, durable IndexedDB,
// thumbnail pixels, shared tap filtering and responsive layouts in Chromium.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const bundle = await build({ root: resolve(__dirname, ".."), configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "coloringGalleryHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("http://gallery.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gallery contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}` });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: files.get(path) });
    });
    await page.goto("http://gallery.test/");
    const mount = async options => {
      await page.evaluate(async options => { window.gallery = await import("/harness.js"); await window.gallery.mount(options); }, options);
      await page.locator('.gallery-works[aria-busy="false"]').waitFor();
      await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
    };
    const press = async name => {
      await page.getByRole("button", { name, exact: true }).press("Enter");
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
    };
    const listed = () => page.evaluate(async () => {
      const c = await window.gallery.list(); return { ...c, works: c.works.map(r => ({ ...r, thumbnail: null })) };
    });
    const saved = () => page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent.includes("SAVED"));
    const back = async () => { await press("GALLERY"); await page.locator('.gallery-works[aria-busy="false"]').waitFor(); };
    const pixel = async id => {
      const image = page.locator(`[data-work-id="${id}"] img`);
      await image.evaluate(img => img.decode());
      return image.evaluate(img => {
        const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(126, 99, 1, 1).data];
      });
    };
    await mount({});
    assert.equal((await listed()).works.length, 0);
    assert.equal(await page.getByRole("button", { name: "CONTINUE", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.gallery.counts()), { starts: 0, homes: 0 });
    await press("NEW WORK"); await page.locator("canvas").waitFor();
    await back(); assert.equal((await listed()).works.length, 0);
    assert.equal((await page.evaluate(() => window.gallery.counts())).starts, 1);

    await mount({ seed: true });
    assert.deepEqual(await pixel("red"), [239, 83, 80, 255]);
    assert.deepEqual(await pixel("blue"), [66, 165, 245, 255]);
    assert.equal(await page.locator('[data-work-id="red"] .gallery-earned-star').count(), 1);
    assert.equal(await page.locator('[data-work-id="blue"] .gallery-earned-star').count(), 0);
    await press("CONTINUE"); await page.locator("canvas").waitFor();
    await press("GREEN"); await press("FILL");
    const fill = async () => {
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.click(box.x + box.width * 420 / 920, box.y + box.height * 330 / 620);
    };
    await fill(); await saved(); await back();
    assert.deepEqual(await pixel("blue"), [156, 204, 101, 255]); assert.deepEqual(await pixel("red"), [239, 83, 80, 255]);
    await press("HOME"); await press("ENTER COLORING"); await page.getByRole("button", { name: "CONTINUE", exact: true }).waitFor();
    assert.equal((await listed()).recentId, "blue");
    await page.reload(); await mount({});
    const restoredStarts = (await page.evaluate(() => window.gallery.counts())).starts;
    assert.equal((await listed()).recentId, "blue");
    await press("CONTINUE"); await press("UNDO"); await saved(); await back();
    assert.deepEqual(await pixel("blue"), [66, 165, 245, 255]);
    await page.locator('[data-work-id="red"] button').press("Enter");
    await press("UNDO"); await saved();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await back();
    assert.deepEqual(await pixel("red"), [255, 240, 207, 255]);
    assert.equal(await page.locator('[data-work-id="red"] .gallery-earned-star').count(), 1);
    assert.equal((await listed()).recentId, "red");

    // A failed write keeps its blue preview in the workshop until retry.
    await press("CONTINUE"); await press("BLUE"); await press("FILL");
    await page.evaluate(() => window.gallery.writeFailure(true));
    await fill(); await page.getByRole("alertdialog").waitFor();
    await press("KEEP EDITING"); await press("GALLERY"); await page.getByRole("alertdialog").waitFor();
    assert.equal(await page.locator(".coloring-gallery").count(), 0);
    await page.evaluate(() => window.gallery.writeFailure(false)); await press("RETRY");
    await page.locator('.gallery-works[aria-busy="false"]').waitFor();
    assert.deepEqual(await pixel("red"), [66, 165, 245, 255]);
    assert.equal((await listed()).completedCount, 1);
    assert.equal((await page.evaluate(() => window.gallery.counts())).starts, restoredStarts);

    // A double tap on NEW WORK cannot activate workshop controls or count twice.
    await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
    const b = await page.getByRole("button", { name: "NEW WORK", exact: true }).boundingBox();
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2, { delay: 30 });
    await page.locator("canvas").waitFor();
    assert.equal((await page.evaluate(() => window.gallery.counts())).starts, restoredStarts + 1);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await back(); assert.equal((await listed()).works.length, 2);

    // Every layout keeps the page fixed, allows an internal collection scroller,
    // and fits two saved thumbnails and all visible controls at child tap size.
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
        await mount({ language, theme });
        const layout = await page.evaluate(() => ({
          scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          background: getComputedStyle(document.querySelector(".gallery-card")).backgroundColor,
          buttons: [...document.querySelectorAll("button")].map(b => { const r = b.getBoundingClientRect(); return { text: b.textContent, x: r.x, y: r.y, w: r.width, h: r.height }; })
        }));
        const context = JSON.stringify({ viewport, language, theme, layout });
        assert.deepEqual(layout.scroll, [viewport.width, viewport.height], context);
        assert.equal(layout.background, theme === "dark" ? "rgb(24, 30, 46)" : "rgb(255, 253, 248)", context);
        for (const b of layout.buttons) assert(b.w >= 60 && b.h >= 60 && b.x >= 0 && b.y >= 0 && b.x + b.w <= viewport.width + 1 && b.y + b.h <= viewport.height + 1, context);
        for (const image of await page.locator(".gallery-thumbnail img").all()) {
          const box = await image.boundingBox(); assert(box && box.width > 50 && box.height > 35, context);
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" }); await mount({});
    assert.equal(await page.locator(".coloring-gallery").evaluate(el => getComputedStyle(el).animationName), "fade-in");

    // Readable receipts preserve the damaged work's star and permit new works.
    await page.evaluate(() => window.gallery.damage("red", "paint")); await mount({});
    assert.equal((await listed()).completedCount, 1);
    assert.equal(await page.getByText("UNAVAILABLE", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "NEW WORK", exact: true }).isEnabled(), true);
    await page.evaluate(() => window.gallery.damage("red", "history")); await mount({});
    assert.equal((await listed()).completedCount, null);
    assert.equal(await page.getByRole("button", { name: "NEW WORK", exact: true }).isDisabled(), true);
    await press("VIEW"); await page.getByRole("dialog", { name: "VIEW ONLY", exact: true }).waitFor(); await press("BACK");
    await press("PARENT RECOVERY"); await press("CANCEL"); assert.equal((await listed()).works.length, 1);
    await press("PARENT RECOVERY"); await page.evaluate(() => window.gallery.writeFailure(true)); await press("RESET COLORING");
    await page.getByText("COULDN’T RESET", { exact: true }).waitFor();
    await page.evaluate(() => window.gallery.writeFailure(false)); await press("RESET COLORING");
    await page.getByText("LET’S PAINT A DINOSAUR!", { exact: true }).waitFor();
    assert.equal((await listed()).completedCount, 0); assert.deepEqual((await listed()).unavailable, []);
    // A failed read is a warning with retry, never the empty-gallery message.
    await page.evaluate(() => window.gallery.readFailure(true)); await press("NEW WORK");
    await page.getByRole("alert").waitFor();
    await page.evaluate(() => window.gallery.readFailure(false)); await press("RETRY");
    assert.deepEqual(errors, []);
    console.log("PASS gallery: independent durable thumbnails/statuses/continue, workshop saves and retry, empty drafts, corruption/recovery, tap safety, 24 RU/EN/theme layouts and reduced motion");
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL gallery: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
