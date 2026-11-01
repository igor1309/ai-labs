// Contract test: production coloring result with real Canvas, IndexedDB
// commit/abort, shared input filtering, animation and browser layout.
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
    await page.route("http://result.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coloring result contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}` });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: files.get(path) });
    });
    await page.goto("http://result.test/");
    const mount = async () => {
      await page.evaluate(async () => { window.gallery = await import("/harness.js"); await window.gallery.mount({ seed: true }); });
      await page.locator('.gallery-works[aria-busy="false"]').waitFor();
    };
    const animations = () => page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    });
    const press = async name => { await page.getByRole("button", { name, exact: true }).press("Enter"); await animations(); };
    const result = async () => { await page.locator(".coloring-result").waitFor(); await animations(); };
    const workshop = () => page.locator(".coloring-workshop canvas").waitFor();
    const collection = () => page.evaluate(async () => {
      const c = await window.gallery.list(); return { ...c, works: c.works.map(r => ({ document: r.document })) };
    });
    const pixel = () => page.locator("canvas").evaluate(canvas => [...canvas.getContext("2d").getImageData(420, 330, 1, 1).data]);
    const fill = async color => {
      await press("COLOR"); await press(color); await press("FILL");
      const canvas = page.locator("canvas");
      // CSS entry motion is finished before mapping the logical hit point.
      await animations();
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + box.width * 420 / 920, box.y + box.height * 330 / 620);
      await page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent.includes("SAVED"));
    };
    await mount(); await press("CONTINUE"); await workshop();
    assert.deepEqual(await pixel(), [66, 165, 245, 255]);
    await press("DONE"); await result();
    assert.equal((await collection()).completedCount, 2);
    assert.equal(await page.getByText("+1 STAR", { exact: true }).count(), 1);
    assert.equal(await page.locator(".coloring-result-count strong").textContent(), "2");
    assert.equal(await page.locator(".celebration").textContent(), "NEW BEST!");
    assert.deepEqual(await pixel(), [66, 165, 245, 255]);
    assert.equal(await page.locator("canvas").evaluate(el => getComputedStyle(el).animationName), "coloring-result-alive");
    const transforms = await page.locator("canvas").evaluate(canvas => {
      const animation = canvas.getAnimations()[0]; animation.pause();
      animation.currentTime = 0; const first = getComputedStyle(canvas).transform;
      animation.currentTime = Number(animation.effect.getComputedTiming().duration) / 2;
      const second = getComputedStyle(canvas).transform; animation.play(); return [first, second];
    });
    assert.notEqual(transforms[0], transforms[1]);

    // Every configuration keeps the same accepted artwork, count and controls.
    for (const viewport of [{ width: 1180, height: 820 }, { width: 744, height: 1133 }, { width: 393, height: 852 }, { width: 852, height: 393 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
        await page.evaluate(({ language, theme }) => window.gallery.appearance(language, theme), { language, theme });
        await animations();
        const layout = await page.evaluate(() => ({
          scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          paper: getComputedStyle(document.querySelector(".coloring-result-paper")).backgroundColor,
          boxes: [...document.querySelectorAll("button, canvas, .coloring-result-star, .coloring-result-count, .coloring-result-best")].map(el => {
            const b = el.getBoundingClientRect(); return { tag: el.tagName, text: el.textContent, x: b.x, y: b.y, w: b.width, h: b.height, symbol: !!el.querySelector("svg") };
          })
        }));
        const context = JSON.stringify({ viewport, language, theme, layout });
        assert.deepEqual(layout.scroll, [viewport.width, viewport.height], context);
        assert.equal(layout.paper, theme === "dark" ? "rgb(24, 30, 46)" : "rgb(255, 253, 248)", context);
        for (const box of layout.boxes) {
          assert(box.x >= -1 && box.y >= -1 && box.x + box.w <= viewport.width + 1 && box.y + box.h <= viewport.height + 1, context);
          if (box.tag === "BUTTON") assert(box.w >= 60 && box.h >= 60 && box.symbol, context);
          if (box.tag === "CANVAS") assert(box.w > 100 && box.h > 65, context);
        }
        assert.deepEqual(await pixel(), [66, 165, 245, 255]);
      }
    }
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.evaluate(() => window.gallery.appearance("en", "light"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator("canvas").evaluate(el => getComputedStyle(el).animationName), "fade-in");
    assert.equal(await page.locator(".coloring-result-earned > svg").evaluate(el => getComputedStyle(el).animationName), "fade-in");
    assert.equal(await page.locator("canvas").evaluate(el => getComputedStyle(el).transform), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Opening failure retains the accepted result and EDIT retries its read.
    await page.evaluate(() => window.gallery.readFailure(true)); await press("EDIT");
    await page.getByRole("alert").waitFor(); assert.deepEqual(await pixel(), [66, 165, 245, 255]);
    await page.evaluate(() => window.gallery.readFailure(false)); await press("EDIT"); await workshop();
    await fill("GREEN"); await press("DONE"); await result();
    assert.deepEqual(await pixel(), [156, 204, 101, 255]);
    assert.equal(await page.locator(".coloring-result-earned, .celebration").count(), 0);
    assert.equal(await page.getByText("YOUR STAR", { exact: true }).count(), 1);
    assert.equal((await collection()).completedCount, 2);
    await press("EDIT"); await workshop(); await press("UNDO");
    await page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent.includes("SAVED"));
    assert.deepEqual(await pixel(), [66, 165, 245, 255]);
    await press("DONE"); await result();
    await page.reload(); await mount(); await press("CONTINUE"); await workshop(); await press("DONE"); await result();
    assert.equal(await page.locator(".coloring-result-earned, .celebration").count(), 0);
    assert.equal((await collection()).completedCount, 2);

    // A separate identity earns independently. An aborted completion leaves its
    // durable paint/history/thumbnail as a draft; retry is the only reward.
    await press("NEW WORK"); await workshop();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await fill("RED");
    const before = await collection(); const id = before.recentId;
    await page.evaluate(() => window.gallery.completionAbort(true)); await press("DONE");
    await page.getByRole("alertdialog").waitFor();
    assert.equal(await page.locator(".coloring-result").count(), 0);
    assert.deepEqual(await collection(), before);
    assert.deepEqual(await pixel(), [239, 83, 80, 255]);
    await page.evaluate(() => window.gallery.completionAbort(false)); await press("RETRY"); await result();
    const after = await collection();
    assert.equal(after.completedCount, 3); assert.equal(after.works.find(r => r.document.id === id).document.rewarded, true);
    assert.equal(await page.getByText("+1 STAR", { exact: true }).count(), 1);
    assert.equal(await page.locator(".coloring-result-count strong").textContent(), "3");
    // The result canvas and durable thumbnail show the same accepted composition.
    assert.deepEqual(await page.evaluate(async id => {
      const record = (await window.gallery.list()).works.find(r => r.document.id === id);
      const image = await createImageBitmap(record.thumbnail); const target = document.createElement("canvas");
      target.width = image.width; target.height = image.height; const ctx = target.getContext("2d"); ctx.drawImage(image, 0, 0); image.close();
      return [...ctx.getImageData(126, 99, 1, 1).data];
    }, id), await pixel());

    // The shared filter swallows the second tap as result EDIT leaves.
    await animations();
    const edit = await page.getByRole("button", { name: "EDIT", exact: true }).boundingBox();
    await page.mouse.dblclick(edit.x + edit.width / 2, edit.y + edit.height / 2, { delay: 30 }); await workshop();
    assert.deepEqual((await collection()).works.find(r => r.document.id === id).document.actions, before.works.find(r => r.document.id === id).document.actions);
    await press("UNDO"); await page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent.includes("SAVED"));
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "DONE", exact: true }).dispatchEvent("click");
    assert.equal(await page.locator(".coloring-result").count(), 0);
    assert.equal((await collection()).completedCount, 3);
    await press("GALLERY"); await page.locator('.gallery-works[aria-busy="false"]').waitFor();
    assert.equal(await page.locator(`[data-work-id="${id}"] .gallery-earned-star`).count(), 1);
    await press("HOME"); assert.equal((await page.evaluate(() => window.gallery.counts())).homes, 1);
    assert.deepEqual(errors, []);
    console.log("PASS result: own painted animation, atomic abort/retry and thumbnail, durable repeat rewards/history, result actions/tap safety, 24 RU/EN/theme layouts and reduced motion");
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL result: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
