// Contract test: production React screen, Canvas pixels, pointer capture,
// shared root tap filtering, layout and durable IndexedDB in Chromium.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const root = resolve(__dirname, "..");
    const bundle = await build({ root, configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "coloringWorkshopHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://workshop.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workshop contract</title>${css.map(name => `<link rel="stylesheet" href="/${name}">`).join("")}` });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: files.get(path) });
    });
    await page.goto("http://workshop.test/");
    const mount = options => page.evaluate(async options => { window.workshop = await import("/harness.js"); await window.workshop.mount(options); document.getAnimations().forEach(animation => animation.finish()); }, options);
    const state = () => page.evaluate(() => window.workshop.snapshot());
    const settle = async () => { await page.evaluate(() => window.workshop.settled()); await page.waitForFunction(() => !document.querySelector('[role="status"]').textContent.includes("SAVING")); };
    const canvas = page.locator("canvas");
    const coords = async (x, y) => {
      const box = await canvas.boundingBox();
      return { x: box.x + x * box.width / 920, y: box.y + y * box.height / 620 };
    };
    const pointer = (target, kind, id, x, y, time) => page.evaluate(({ target, kind, id, x, y, time }) => {
      const element = target === "canvas" ? document.querySelector("canvas") : document.querySelector(target);
      const event = new PointerEvent(kind, { pointerId: id, clientX: x, clientY: y, button: 0, pointerType: "touch", bubbles: true, cancelable: true });
      Object.defineProperty(event, "timeStamp", { value: time });
      // Synthetic events do not own native capture; the real mouse stroke does.
      const surface = document.querySelector("canvas");
      surface.setPointerCapture = () => {}; surface.hasPointerCapture = () => false;
      element.dispatchEvent(event);
    }, { target, kind, id, x, y, time });
    const tap = async (x, y, time, id = 1) => {
      const p = await coords(x, y);
      await pointer("canvas", "pointerdown", id, p.x, p.y, time);
      await pointer("canvas", "pointerup", id, p.x, p.y, time + 30);
    };
    const pixel = (x, y) => page.evaluate(({ x, y }) => [...document.querySelector("canvas").getContext("2d").getImageData(x, y, 1, 1).data], { x, y });

    await mount({ id: "drawing" });
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("group", { name: "COLOR", exact: true }).getByRole("button").count(), 12);
    // Real mouse captures a stroke starting outside and crossing the silhouette.
    const start = await coords(0, 330), end = await coords(420, 330);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up(); await settle();
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    assert.equal((await pixel(1, 330))[3], 0);
    assert.equal((await state()).work.actions.length, 1);
    // Fill replaces prior brush, uniform refill is a no-op, undo restores it.
    await page.getByRole("button", { name: "BLUE", exact: true }).press("Enter");
    await page.getByRole("button", { name: "FILL", exact: true }).press("Enter");
    await tap(420, 330, 10000); await settle();
    assert.deepEqual(await pixel(80, 302), [66, 165, 245, 255]);
    await tap(420, 330, 11000); await settle();
    assert.equal((await state()).work.revision, 2);
    await page.getByRole("button", { name: "UNDO", exact: true }).press("Enter"); await settle();
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    await page.reload(); await mount({ id: "drawing", resume: true });
    assert.equal((await state()).work.revision, 3);
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    await page.getByRole("button", { name: "UNDO", exact: true }).press("Enter"); await settle();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    assert.equal((await state()).work.id, "drawing");
    await tap(420, 330, 20000); await settle();
    await page.getByRole("button", { name: "DONE", exact: true }).press("Enter"); await settle();
    assert.deepEqual(await page.evaluate(() => window.workshop.departures().map(n => [n.destination, n.work.completed, n.work.rewarded])), [["result", true, true]]);
    await page.reload(); await mount({ id: "drawing", resume: true });
    await page.getByRole("button", { name: "UNDO", exact: true }).press("Enter"); await settle();
    assert.equal((await state()).work.completed, true);
    assert.equal((await state()).work.actions.length, 0);

    // Double taps are filtered; a drag opens no double-tap window.
    await mount({ id: "contacts" });
    await tap(420, 330, 30000); await settle();
    await page.getByRole("button", { name: "BLUE", exact: true }).evaluate(el => el.click());
    await tap(420, 330, 30200); await settle();
    assert.equal((await state()).work.revision, 1);
    let p = await coords(420, 330), q = await coords(500, 350);
    await pointer("canvas", "pointerdown", 1, p.x, p.y, 31000);
    await pointer("canvas", "pointermove", 1, q.x, q.y, 31030);
    // Controls and extra fingers stay ignored even after the active finger ends.
    await pointer('button[aria-label="FILL"]', "pointerdown", 2, q.x + 180, q.y, 31040);
    await page.getByRole("button", { name: "FILL", exact: true }).evaluate(el => el.click());
    await pointer("canvas", "pointerup", 1, q.x, q.y, 31060); await settle();
    await pointer('button[aria-label="FILL"]', "pointerup", 2, q.x + 180, q.y, 31070);
    await page.getByRole("button", { name: "FILL", exact: true }).evaluate(el => el.dispatchEvent(new PointerEvent("click", { pointerId: 2, bubbles: true, cancelable: true })));
    assert.equal(await page.getByRole("button", { name: "BRUSH MEDIUM", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "RED", exact: true }).press("Enter");
    await tap(500, 350, 31100); await settle();
    assert.equal((await state()).work.revision, 3);
    // Every interruption discards preview, without a revision or an undo entry.
    for (const interruption of ["pointercancel", "lostpointercapture", "resize", "orientationchange", "blur", "visibilitychange"]) {
      p = await coords(440, 100);
      await pointer("canvas", "pointerdown", 1, p.x, p.y, 33000);
      assert.notDeepEqual(await pixel(440, 100), [255, 240, 207, 255]);
      if (interruption === "pointercancel" || interruption === "lostpointercapture") await pointer("canvas", interruption, 1, p.x, p.y, 33050);
      else await page.evaluate(type => {
        if (type === "visibilitychange") Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        (type === "visibilitychange" ? document : window).dispatchEvent(new Event(type));
      }, interruption);
      assert.deepEqual(await pixel(440, 100), [255, 240, 207, 255]);
      assert.equal((await state()).work.revision, 3);
    }

    // Delayed/error UI exercises genuine paint and the session's storage seam.
    await page.reload(); await mount({ id: "failures", gate: true });
    await tap(420, 330, 40000);
    await page.waitForFunction(() => window.workshop.writeCount() === 1);
    assert.match(await page.getByRole("status").textContent(), /SAVING/);
    await page.getByRole("button", { name: "DONE", exact: true }).press("Enter");
    assert.equal(await page.getByRole("button", { name: "UNDO", exact: true }).isDisabled(), true);
    await page.evaluate(() => window.workshop.fail()); await page.evaluate(() => window.workshop.settled());
    await page.getByRole("alertdialog").waitFor();
    assert.deepEqual(await pixel(420, 330), [239, 83, 80, 255]);
    assert.equal((await state()).work.completed, false);
    await page.getByRole("button", { name: "HOME WITHOUT SAVING", exact: true }).press("Enter");
    await page.getByRole("button", { name: "STAY", exact: true }).press("Enter");
    assert.deepEqual(await page.evaluate(() => window.workshop.departures()), []);
    await page.getByRole("button", { name: "KEEP EDITING", exact: true }).press("Enter");
    assert.match(await page.getByRole("status").textContent(), /COULDN’T SAVE/);
    await page.getByRole("button", { name: "GALLERY", exact: true }).press("Enter");
    await page.getByRole("button", { name: "RETRY", exact: true }).press("Enter");
    await page.waitForFunction(() => window.workshop.writeCount() === 2);
    await page.evaluate(() => window.workshop.release()); await settle();
    assert.deepEqual(await page.evaluate(() => window.workshop.departures().map(n => n.destination)), ["gallery"]);
    assert.equal((await state()).work.completed, false);

    // No scrolling, clipped art or overlapping controls in both themes/languages.
    let layoutId = 0;
    for (const viewport of [{ width: 1180, height: 820 }, { width: 744, height: 1133 }, { width: 393, height: 852 }, { width: 852, height: 393 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
        await mount({ id: `layout-${++layoutId}`, language, theme });
        const layout = await page.evaluate(() => {
          const canvas = document.querySelector("canvas").getBoundingClientRect();
          const dock = document.querySelector(".coloring-tools").getBoundingClientRect();
          const buttons = [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => {
            const r = b.getBoundingClientRect(); return { text: b.textContent || b.getAttribute("aria-label"), x: r.x, y: r.y, w: r.width, h: r.height, dock: !!b.closest(".coloring-tools") };
          });
          return { scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], canvas: { x: canvas.x, y: canvas.y, w: canvas.width, h: canvas.height }, dock: { x: dock.x, y: dock.y, w: dock.width, h: dock.height }, buttons, background: getComputedStyle(document.querySelector(".coloring-paper")).backgroundColor };
        });
        const context = JSON.stringify({ viewport, language, theme, layout });
        assert.deepEqual(layout.scroll, [viewport.width, viewport.height], context);
        assert(layout.canvas.w > 80 && layout.canvas.h > 50, context);
        assert(Math.abs(layout.canvas.w / layout.canvas.h - 920 / 620) < .01, context);
        assert.equal(layout.background, theme === "dark" ? "rgb(24, 30, 46)" : "rgb(255, 253, 248)");
        for (const b of layout.buttons) {
          // Painting controls use the accepted 48-point targets; compact navigation also uses 48.
          assert(b.w >= 48 && b.h >= 48 && b.x >= 0 && b.y >= 0 && b.x + b.w <= viewport.width + 1 && b.y + b.h <= viewport.height + 1, context);
          assert(b.x + b.w <= layout.canvas.x + 1 || b.x >= layout.canvas.x + layout.canvas.w - 1 || b.y + b.h <= layout.canvas.y + 1 || b.y >= layout.canvas.y + layout.canvas.h - 1, context);
        }
        assert.equal(layout.dock.h, 52, context);
        assert(layout.dock.y >= layout.canvas.y + layout.canvas.h, context);
        const wide = viewport.width >= 1000 && viewport.height >= 600;
        const dockButtons = layout.buttons.filter(b => b.dock);
        assert.equal(dockButtons.length, wide ? 17 : 6, context);
        for (const b of dockButtons) {
          assert(b.y >= layout.dock.y && b.y + b.h <= layout.dock.y + 52, context);
        }
        for (let i = 0; i < layout.buttons.length; i++) for (const b of layout.buttons.slice(i + 1)) {
          const a = layout.buttons[i];
          assert(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, context);
        }
        assert.equal(await page.getByRole("group", { name: language === "en" ? "SIZE" : "РАЗМЕР", exact: true }).getByRole("button").count(), 3);
        if (wide) {
          const colors = await page.getByRole("group", { name: language === "en" ? "COLOR" : "ЦВЕТ", exact: true }).getByRole("button").all();
          assert.equal(colors.length, 12);
          for (const button of colors) {
            const r = await button.boundingBox();
            assert.equal(r.width, 48); assert.equal(r.height, 48);
          }
        } else {
          const trigger = page.getByRole("button", { name: language === "en" ? "COLOR" : "ЦВЕТ", exact: true });
          const originalCanvas = await canvas.elementHandle();
          const originalBox = await canvas.boundingBox();
          await trigger.press("Enter");
          await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
          const dialog = page.getByRole("dialog");
          assert.equal(await dialog.getByRole("button").count(), 13);
          assert.deepEqual(await canvas.boundingBox(), originalBox, context);
          assert(await page.evaluate(original => original === document.querySelector("canvas"), originalCanvas), context);
          const picker = await dialog.boundingBox();
          assert(picker.x < originalBox.x + originalBox.width && picker.x + picker.width > originalBox.x && picker.y < originalBox.y + originalBox.height && picker.y + picker.height > originalBox.y, context);
          for (const button of await dialog.getByRole("button").all()) {
            const r = await button.boundingBox();
            assert(r && r.width === 48 && r.height === 48 && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width + 1 && r.y + r.height <= viewport.height + 1, context);
          }
          const grid = await dialog.getByRole("group").getByRole("button").all();
          const cells = await Promise.all(grid.map(b => b.boundingBox()));
          assert.equal(new Set(cells.map(r => r.x)).size, 4, context);
          assert.equal(new Set(cells.map(r => r.y)).size, 3, context);
          await dialog.getByRole("button", { name: language === "en" ? "BLUE" : "ГОЛУБОЙ", exact: true }).press("Enter");
          assert.equal(await dialog.count(), 0);
          assert(await trigger.evaluate(el => el === document.activeElement));
          assert.equal(await trigger.locator(".coloring-swatch").evaluate(el => el.style.backgroundColor), "rgb(66, 165, 245)");
          assert.equal((await state()).work.revision, 0);
          await trigger.press("Enter");
          // An outside contact reaches the shield for the entire tap.
          const outside = { x: 4, y: viewport.height / 2 };
          assert(await page.evaluate(p => document.elementFromPoint(p.x, p.y).classList.contains("coloring-picker-layer"), outside), context);
          await pointer(".coloring-picker-layer", "pointerdown", 1, outside.x, outside.y, 50000 + layoutId * 1000);
          await pointer(".coloring-picker-layer", "pointerup", 1, outside.x, outside.y, 50030 + layoutId * 1000);
          await page.locator(".coloring-picker-layer").evaluate((el, p) => el.dispatchEvent(new PointerEvent("click", { pointerId: 1, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })), outside);
          assert.equal(await dialog.count(), 0);
          assert.equal((await state()).work.revision, 0);
          assert.deepEqual((await state()).work.actions, []);
          assert.deepEqual(await canvas.boundingBox(), originalBox, context);
          assert(await trigger.evaluate(el => el === document.activeElement));
          await originalCanvas.dispose();
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-amount").trim()), "0");
    assert.deepEqual(errors, []);
    if (process.env.COLORING_SCREENSHOT) await page.screenshot({ path: process.env.COLORING_SCREENSHOT });
    console.log("PASS workshop: production paint/restore/undo/completion, tap safety, contact isolation/cancellation, save failures/retry, 24 single-row RU/EN/theme layouts, temporary 4x3 overlay pickers and reduced motion");
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL workshop: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
