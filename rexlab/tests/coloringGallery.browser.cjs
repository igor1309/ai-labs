// Contract test: production gallery/workshop composition, durable IndexedDB,
// thumbnail pixels, shared tap filtering and responsive layouts in Chromium.
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    const artifacts = resolve(process.env.COLORING_ARTIFACT_DIR || join(tmpdir(), "rexlab-coloring-artifacts"));
    await mkdir(artifacts, { recursive: true });
    const { build } = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const bundle = await build({ root: resolve(__dirname, ".."), configFile: false, logLevel: "error", plugins: [react()],
      build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: resolve(__dirname, "coloringGalleryHarness.tsx"), output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const css = [...files.keys()].filter(name => name.endsWith(".css"));
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROMIUM_SINGLE_PROCESS === "1" ? { args: ["--single-process", "--in-process-gpu"] } : {}) });
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
    for (const [width, height] of [[320, 568], [390, 844], [393, 852], [430, 932], [844, 390]]) {
      await page.setViewportSize({ width, height });
      for (const language of ["en", "ru"]) {
        await mount({ language, theme: "dark" });
        const bounds = await page.locator(".gallery-new").evaluateAll(buttons => buttons.map(button => {
          const r = button.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, width: r.width, left: r.left, right: r.right,
            clipped: button.scrollHeight > button.clientHeight + 1 };
        }));
        assert.equal(bounds.length, 5);
        for (const b of bounds) {
          const context = JSON.stringify({ width, height, language, bounds });
          const row = bounds.filter(other => Math.abs(other.top - b.top) < 1);
          assert(row.every(other => Math.abs(other.bottom - b.bottom) < 1), context);
          assert(b.bottom - b.top >= 60 && b.width >= 60, context);
          assert(b.left >= 0 && b.right <= width + 1 && b.bottom <= height, context);
          assert(!b.clipped, context);
        }
      }
    }
    await page.setViewportSize({ width: 1180, height: 820 });
    await mount({});
    assert.equal((await listed()).works.length, 0);
    assert.equal(await page.getByRole("button", { name: "CONTINUE", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.gallery.counts()), { starts: 0, homes: 0 });
    await press("NEW WORK"); await page.locator(".coloring-workshop canvas").waitFor();
    await back(); assert.equal((await listed()).works.length, 0);
    assert.equal((await page.evaluate(() => window.gallery.counts())).starts, 1);

    await mount({ seed: true });
    assert.deepEqual(await pixel("red"), [239, 83, 80, 255]);
    assert.deepEqual(await pixel("blue"), [66, 165, 245, 255]);
    assert.equal(await page.locator('[data-work-id="red"] .gallery-earned-star').count(), 1);
    assert.equal(await page.locator('[data-work-id="blue"] .gallery-earned-star').count(), 0);
    await press("CONTINUE"); await page.locator(".coloring-workshop canvas").waitFor();
    await press("COLOR"); await press("GREEN"); await press("FILL");
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
    await press("CONTINUE"); await press("COLOR"); await press("BLUE"); await press("FILL");
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
    await page.locator(".coloring-workshop canvas").waitFor();
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

    const histories = [
      { id: "brush-only", actions: [
        { kind: "stroke", color: "#ef5350", size: 40, points: [{ x: 380, y: 330 }, { x: 420, y: 330 }, { x: 420, y: 365 }] },
        { kind: "stroke", color: "#42a5f5", size: 20, points: [{ x: 300, y: 120 }, { x: 320, y: 120 }] },
        { kind: "stroke", color: "#9ccc65", size: 40, points: [{ x: 220, y: 510 }, { x: 240, y: 510 }] }
      ] },
      { id: "mixed", actions: [
        { kind: "stroke", color: "#ab67cb", size: 20, points: [{ x: 300, y: 120 }, { x: 320, y: 120 }] },
        { kind: "stroke", color: "#ef5350", size: 40, points: [{ x: 380, y: 330 }, { x: 420, y: 330 }] },
        { kind: "fill", color: "#42a5f5", region: "body" },
        { kind: "stroke", color: "#9ccc65", size: 20, points: [{ x: 400, y: 330 }, { x: 440, y: 330 }] },
        { kind: "fill", color: "#ff9345", region: "front-far" },
        { kind: "stroke", color: "#f78fbd", size: 40, points: [{ x: 550, y: 130 }, { x: 565, y: 130 }] }
      ] }
    ];
    const reference = (actions, geometry = "stegosaurus-production-1") => page.evaluate(({ actions, geometry }) => {
      const painter = window.gallery.painterFor(geometry);
      const canvas = painter.canvas(276, 186);
      // Replay the fixture, independently of the saved journal and thumbnail adapter.
      painter.render(canvas, actions);
      return canvas.toDataURL("image/png");
    }, { actions, geometry });
    const thumbnailMatches = async (id, actions, referenceImage) => {
      const comparison = await page.evaluate(async ({ id, referenceImage }) => {
        const record = (await window.gallery.list()).works.find(r => r.document.id === id);
        const actual = await createImageBitmap(record.thumbnail);
        const expected = await createImageBitmap(await (await fetch(referenceImage)).blob());
        const pixels = image => {
          const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        try {
          const actualPixels = pixels(actual), expectedPixels = pixels(expected);
          let differentChannels = 0;
          for (let i = 0; i < expectedPixels.length; i++) if (actualPixels[i] !== expectedPixels[i]) differentChannels++;
          return { width: actual.width, height: actual.height, differentChannels };
        } finally { actual.close(); expected.close(); }
      }, { id, referenceImage });
      assert.deepEqual(comparison, { width: 276, height: 186, differentChannels: 0 }, `${id}: thumbnail must match every replayed pixel`);
      assert.deepEqual((await listed()).works.find(r => r.document.id === id).document.actions, actions);
    };
    const undoneReferences = new Map();
    for (const { id, actions } of histories) {
      const accepted = await page.evaluate(async ({ id, actions }) => {
        const session = await window.gallery.newWork(id);
        for (const action of actions) { session.append(action); await session.settled(); }
        const state = session.getSnapshot();
        return { save: state.save, actions: state.work.actions };
      }, { id, actions });
      assert.deepEqual(accepted, { save: "saved", actions }, `${id}: all fixture actions must be accepted and saved`);
      const expected = await reference(actions);
      await thumbnailMatches(id, actions, expected);
      await page.reload(); await mount({});
      // Keep the same pixel oracle: reload must preserve the saved image exactly.
      await thumbnailMatches(id, actions, expected);
      await page.locator(`[data-work-id="${id}"] button`).press("Enter");
      await page.locator(".coloring-workshop canvas").waitFor(); await press("UNDO"); await saved(); await back();
      const undone = await reference(actions.slice(0, -1));
      undoneReferences.set(id, undone);
      await thumbnailMatches(id, actions.slice(0, -1), undone);
    }
    await page.reload(); await mount({});
    for (const { id, actions } of histories) await thumbnailMatches(id, actions.slice(0, -1), undoneReferences.get(id));
    // A legacy journal without the newer history receipt keeps its geometry,
    // ordered paint and one earned star beside the new creature.
    await page.evaluate(async () => {
      await window.gallery.reset();
      const painter = window.gallery.painter();
      const document = { schema: 1, geometry: "stegosaurus-production-1", id: "legacy-stego", revision: 3,
        actions: [{ kind: "fill", color: "#42a5f5", region: "body" },
          { kind: "stroke", color: "#ef5350", size: 20, points: [{ x: 420, y: 330 }] }], completed: true, rewarded: true };
      const canvas = painter.canvas(276, 186); painter.render(canvas, document.actions);
      const thumbnail = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("rexlab-coloring"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("works", "readwrite"); tx.objectStore("works").put({ document, thumbnail }, document.id);
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    });
    await page.setViewportSize({ width: 1180, height: 820 });
    await mount({});
    assert.equal((await listed()).completedCount, 1);
    assert.equal(await page.getByRole("button", { name: "TRICERATOPS", exact: true }).count(), 1);
    await press("CONTINUE");
    await page.locator('canvas[aria-label="STEGOSAURUS"]').waitFor();
    await press("UNDO"); await saved();
    const surfacePixel = (x, y) => page.locator("canvas").evaluate((canvas, { x, y }) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data], { x, y });
    assert.deepEqual(await surfacePixel(420, 330), [66, 165, 245, 255]);
    await back();
    const legacy = (await listed()).works.find(r => r.document.id === "legacy-stego").document;
    assert.deepEqual(legacy.actions, [{ kind: "fill", color: "#42a5f5", region: "body" }]);
    assert.equal(legacy.rewarded, true);

    await press("TRICERATOPS");
    await page.locator('canvas[aria-label="TRICERATOPS"]').waitFor();
    const probes = [
      [140, 340, "tail"], [330, 520, "rear-far"], [586, 520, "front-far"],
      [280, 360, "body"], [440, 400, "belly"], [308, 304, "spot-1"], [402, 294, "spot-2"],
      [280, 522, "rear-near"], [540, 520, "front-near"], [600, 280, "frill"],
      [720, 400, "head"], [730, 250, "horn-far"], [790, 290, "horn-near"], [858, 354, "horn-nose"]
    ];
    const contract = await page.evaluate(probes => {
      const painter = window.gallery.painterFor("triceratops-production-1"), canvas = painter.canvas();
      const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
      const cases = probes.map(([x, y, region]) => {
        painter.render(canvas, [{ kind: "fill", region, color: "#ef5350" }]);
        return { region, hit: painter.regionAt({ x, y }), pixels: probes.map(([x, y]) => pixel(x, y)), eye: pixel(746, 370) };
      });
      painter.render(canvas, [{ kind: "stroke", color: "#ab67cb", size: 40, points: [{ x: 600, y: 280 }] }]);
      return { cases, brush: pixel(600, 280), outside: pixel(0, 0), borderHit: painter.regionAt({ x: 70, y: 278 }) ?? null };
    }, probes);
    for (const [index, test] of contract.cases.entries()) {
      assert.equal(test.hit, test.region, `tap owns ${test.region}`);
      for (const [other, sample] of test.pixels.entries()) assert.deepEqual(sample, index === other ? [239, 83, 80, 255] : [255, 240, 207, 255], `${test.region} changes only its own enclosed region, sample ${probes[other][2]}`);
      assert.deepEqual(test.eye, [9, 30, 64, 255]);
    }
    assert.deepEqual(contract.brush, [171, 103, 203, 255]);
    assert.deepEqual(contract.outside, [0, 0, 0, 0]); assert.equal(contract.borderHit, null);
    const tap = async (x, y) => {
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.click(box.x + x * box.width / 920, box.y + y * box.height / 620);
    };
    await press("FILL"); await tap(600, 280); await saved();
    assert.deepEqual(await surfacePixel(600, 280), [239, 83, 80, 255]);
    assert.deepEqual(await surfacePixel(280, 360), [255, 240, 207, 255]);
    await press("COLOR"); await press("BLUE"); await tap(280, 360); await saved();
    const tric = (await listed()).works.find(r => r.document.geometry === "triceratops-production-1").document;
    assert.deepEqual(tric.actions, [{ kind: "fill", color: "#ef5350", region: "frill" }, { kind: "fill", color: "#42a5f5", region: "body" }]);
    await back();
    assert.equal(await page.locator(`[data-work-id="${tric.id}"] img`).getAttribute("alt"), "TRICERATOPS · 1");
    const thumbnailPixel = async (id, x, y) => {
      const image = page.locator(`[data-work-id="${id}"] img`); await image.evaluate(img => img.decode());
      return image.evaluate((img, { x, y }) => {
        const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        return [...ctx.getImageData(Math.floor(x * canvas.width / 920), Math.floor(y * canvas.height / 620), 1, 1).data];
      }, { x, y });
    };
    assert.deepEqual(await thumbnailPixel(tric.id, 600, 280), [239, 83, 80, 255]);
    assert.deepEqual(await thumbnailPixel(tric.id, 280, 360), [66, 165, 245, 255]);
    await page.reload(); await mount({}); await press("CONTINUE");
    await page.locator('canvas[aria-label="TRICERATOPS"]').waitFor();
    assert.deepEqual(await surfacePixel(600, 280), [239, 83, 80, 255]);
    assert.deepEqual(await surfacePixel(280, 360), [66, 165, 245, 255]);
    await press("UNDO"); await saved();
    assert.deepEqual(await surfacePixel(280, 360), [255, 240, 207, 255]);
    assert.deepEqual(await surfacePixel(600, 280), [239, 83, 80, 255]);
    await press("FILL"); await press("COLOR"); await press("BASE"); await tap(600, 280); await saved();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await press("UNDO"); await saved();
    await press("DONE"); await page.getByRole("heading", { name: "YOUR TRICERATOPS!", exact: true }).waitFor();
    assert.equal((await listed()).completedCount, 2);
    await press("EDIT"); await press("DONE");
    await page.getByText("YOUR STAR", { exact: true }).waitFor(); assert.equal((await listed()).completedCount, 2);
    await press("NEW WORK"); await page.locator('canvas[aria-label="TRICERATOPS"]').waitFor();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await back(); assert.equal((await listed()).works.length, 2);
    await page.locator('[data-work-id="legacy-stego"] button').press("Enter");
    await page.locator('canvas[aria-label="STEGOSAURUS"]').waitFor();
    assert.deepEqual(await surfacePixel(420, 330), [66, 165, 245, 255]);
    await press("DONE"); await page.getByText("YOUR STAR", { exact: true }).waitFor();
    assert.equal((await listed()).completedCount, 2);
    await press("NEW WORK"); await page.locator('canvas[aria-label="STEGOSAURUS"]').waitFor(); await back();
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1180, height: 820 }]) {
      await page.setViewportSize(viewport);
      for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
        await mount({ language, theme });
        const name = language === "en" ? "TRICERATOPS" : "ТРИЦЕРАТОПС";
        await press(name); await page.locator(`canvas[aria-label="${name}"]`).waitFor();
        const box = await page.locator("canvas").boundingBox();
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify({ viewport, language, theme, box }));
        assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [viewport.width, viewport.height]);
        if (viewport.width === 1180 && language === "en" && theme === "light") {
          await page.evaluate(async () => {
            await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
          });
          await page.screenshot({ path: join(artifacts, "triceratops.png") });
        }
        await press(language === "en" ? "GALLERY" : "ГАЛЕРЕЯ");
      }
    }
    // Explorer replaces the new-work Triceratops choice, while every saved
    // geometry stays editable and keeps its localized name at either level.
    await mount({ level: "explorer" });
    assert.equal(await page.locator(".gallery-new").count(), 5);
    assert.equal(await page.getByRole("button", { name: "TRICERATOPS", exact: true }).count(), 1);
    await page.locator(`[data-work-id="${tric.id}"] button`).press("Enter");
    await page.locator('canvas[aria-label="TRICERATOPS"]').waitFor();
    assert.deepEqual(await surfacePixel(600, 280), [239, 83, 80, 255]);
    await back(); await press("TRICERATOPS");
    await page.locator('canvas[aria-label="TRICERATOPS"]').waitFor();
    const richContract = await page.evaluate(() => {
      const painter = window.gallery.painterFor("triceratops-explorer-1"), canvas = painter.canvas();
      const probes = window.gallery.explorerProbes;
      const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
      const cases = probes.map(([x, y, region]) => {
        painter.render(canvas, [{ kind: "fill", region, color: "#ef5350" }]);
        return { region, hit: painter.regionAt({ x, y }), pixels: probes.map(([x, y]) => pixel(x, y)), eye: pixel(728, 364) };
      });
      painter.render(canvas, [{ kind: "stroke", color: "#ab67cb", size: 40, points: [{ x: 424, y: 370 }] }]);
      return { cases, brush: pixel(424, 370), outside: pixel(0, 0) };
    });
    for (const [index, test] of richContract.cases.entries()) {
      assert.equal(test.hit, test.region, `Explorer tap owns ${test.region}`);
      for (const [other, sample] of test.pixels.entries()) assert.deepEqual(sample, index === other ? [239, 83, 80, 255] : [255, 240, 207, 255], `${test.region} fills independently of ${richContract.cases[other].region}`);
      assert.deepEqual(test.eye, [9, 30, 64, 255]);
    }
    assert.deepEqual(richContract.brush, [171, 103, 203, 255]);
    assert.deepEqual(richContract.outside, [0, 0, 0, 0]);
    await press("FILL"); await tap(602, 206); await saved();
    await press("COLOR"); await press("BLUE"); await tap(424, 370); await saved();
    const rich = (await listed()).works.find(r => r.document.geometry === "triceratops-explorer-1").document;
    assert.deepEqual(rich.actions, [{ kind: "fill", color: "#ef5350", region: "frill-panel-crown" }, { kind: "fill", color: "#42a5f5", region: "flank" }]);
    await back();
    assert.deepEqual(await thumbnailPixel(rich.id, 602, 206), [239, 83, 80, 255]);
    assert.deepEqual(await thumbnailPixel(rich.id, 424, 370), [66, 165, 245, 255]);
    await page.reload(); await mount({ level: "hatchling", language: "ru" });
    assert.equal(await page.locator(".gallery-new").count(), 5);
    assert.equal(await page.locator(`[data-work-id="${rich.id}"] img`).getAttribute("alt"), "ТРИЦЕРАТОПС · 1");
    await page.locator(`[data-work-id="${rich.id}"] button`).press("Enter");
    await page.locator('canvas[aria-label="ТРИЦЕРАТОПС"]').waitFor();
    assert.deepEqual(await surfacePixel(424, 370), [66, 165, 245, 255]);
    await press("ОТМЕНИТЬ"); await page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent === "СОХРАНЕНО");
    assert.deepEqual(await surfacePixel(424, 370), [255, 240, 207, 255]);
    assert.deepEqual(await surfacePixel(602, 206), [239, 83, 80, 255]);
    await press("ГОТОВО"); await page.getByRole("heading", { name: "ТВОЙ ТРИЦЕРАТОПС!", exact: true }).waitFor();
    assert.equal((await listed()).completedCount, 3);
    await press("ДОМОЙ"); await press("ENTER COLORING");
    for (const level of ["explorer", "paleontologist"]) {
      for (const viewport of [{ width: 1024, height: 768 }, { width: 1180, height: 820 }]) {
        await page.setViewportSize(viewport);
        for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
          await mount({ level, language, theme });
          assert.equal(await page.locator(".gallery-new").count(), 5);
          const name = language === "en" ? "TRICERATOPS" : "ТРИЦЕРАТОПС";
          await press(name); await page.locator(`canvas[aria-label="${name}"]`).waitFor();
          const box = await page.locator("canvas").boundingBox();
          assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
          assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [viewport.width, viewport.height]);
          if (level === "explorer" && viewport.width === 1180 && language === "en" && theme === "light") {
            await page.evaluate(async () => {
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
            });
            await page.screenshot({ path: join(artifacts, "triceratops-explorer.png") });
          }
          await press(language === "en" ? "GALLERY" : "ГАЛЕРЕЯ");
        }
      }
    }
    // Each Stegosaurus keeps its own fill ownership, including inset panels,
    // tiny toes, protected details and regions hidden behind later paths.
    const stegoContracts = await page.evaluate(async () => {
      const shape = (node, attributes) => {
        if ("path" in node) return `<path d="${node.path}" transform="translate(${node.x} ${node.y})" ${attributes}/>`;
        return `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" transform="translate(${node.x} ${node.y}) rotate(${-node.rotation} ${node.width / 2} ${node.height / 2})" ${attributes}/>`;
      };
      const results = [];
      for (const [geometry, probes, protectedPoints] of [
        [window.gallery.STEGOSAURUS, window.gallery.stegosaurusHatchlingProbes, [[83, 280], [82, 275], [30, 298], [50, 315], [465, 380], [476, 440]]],
        [window.gallery.STEGOSAURUS_EXPLORER, window.gallery.stegosaurusExplorerProbes, [[151, 382], [148, 376], [118, 420], [384, 544], [28, 570], [468, 84]]]
      ]) {
        const painter = window.gallery.painterFor(geometry.artwork.version), canvas = painter.canvas();
        const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
        painter.render(canvas, []);
        const blank = painter.pixels(canvas);
        const protectedPixels = protectedPoints.map(([x, y]) => pixel(x, y));
        const cases = [];
        const defs = geometry.regions.map(node => `<clipPath id="${node.id}">${shape(node, "")}</clipPath>`).join("");
        for (const [x, y, region] of probes) {
          // SVG masks rasterize the vector ownership independently of the
          // painter's compositing, hit testing and saved action validation.
          const paths = geometry.regions.map(node => {
            let drawing = shape(node, `fill="${node.id === region ? "white" : "black"}"`), parent = node.parent;
            while (parent) {
              drawing = `<g clip-path="url(#${parent})">${drawing}</g>`;
              parent = geometry.regions.find(node => node.id === parent).parent;
            }
            return drawing;
          }).join("");
          const image = new Image();
          image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="920" height="620"><defs>${defs}</defs><g transform="scale(2)">${paths}</g></svg>`)}`;
          await image.decode();
          const mask = document.createElement("canvas"); mask.width = 920; mask.height = 620;
          const ctx = mask.getContext("2d"); ctx.drawImage(image, 0, 0);
          const ownership = ctx.getImageData(0, 0, 920, 620).data;
          painter.render(canvas, [{ kind: "fill", region, color: "#ef5350" }]);
          const painted = painter.pixels(canvas);
          let changed = 0, leaked = 0, erased = 0;
          for (let i = 0; i < blank.length; i += 4) {
            // A single channel unit at antialiased edges is the painter's
            // existing visible-pixel tolerance, rather than a paint change.
            if (Math.abs(blank[i] - painted[i]) <= 1 && Math.abs(blank[i + 1] - painted[i + 1]) <= 1 &&
                Math.abs(blank[i + 2] - painted[i + 2]) <= 1 && Math.abs(blank[i + 3] - painted[i + 3]) <= 1) continue;
            changed++;
            if (ownership[i] === 0) leaked++;
            if (blank[i + 3] === 255 && ((blank[i] === 9 && blank[i + 1] === 30 && blank[i + 2] === 64) ||
                (blank[i] === 7 && blank[i + 1] === 9 && blank[i + 2] === 10))) erased++;
          }
          cases.push({ region, hit: painter.regionAt({ x, y }), pixels: probes.map(([x, y]) => pixel(x, y)),
            protectedPixels: protectedPoints.map(([x, y]) => pixel(x, y)), changed, leaked, erased });
        }
        painter.render(canvas, [{ kind: "stroke", color: "#ab67cb", size: 40, points: protectedPoints.map(([x, y]) => ({ x, y })) }]);
        results.push({ version: geometry.artwork.version, regions: geometry.artwork.regions, probes, cases, protectedPixels,
          protectedHits: protectedPoints.map(([x, y]) => painter.regionAt({ x, y }) ?? null),
          brushedDetails: protectedPoints.map(([x, y]) => pixel(x, y)), outside: pixel(0, 0) });
      }
      return results;
    });
    for (const contract of stegoContracts) {
      assert.deepEqual(contract.probes.map(([, , region]) => region), contract.regions, `${contract.version}: every region has an interior probe`);
      for (const [index, test] of contract.cases.entries()) {
        const context = `${contract.version}/${test.region}`;
        assert.equal(test.hit, test.region, `${context}: tap ownership`);
        for (const [other, pixel] of test.pixels.entries()) assert.deepEqual(pixel, index === other ? [239, 83, 80, 255] : [255, 240, 207, 255], `${context}: independent interior ${contract.probes[other][2]}`);
        assert(test.changed > 0, `${context}: visible fill`);
        assert.equal(test.leaked, 0, `${context}: no pixels outside its visible mask`);
        assert.equal(test.erased, 0, `${context}: outlines and ink retained`);
        assert.deepEqual(test.protectedPixels, contract.protectedPixels, `${context}: protected details retained`);
      }
      assert.deepEqual(contract.protectedHits, contract.protectedHits.map(() => null), `${contract.version}: protected taps reject fills`);
      assert.deepEqual(contract.brushedDetails, contract.protectedPixels, `${contract.version}: brush preserves details`);
      assert.deepEqual(contract.outside, [0, 0, 0, 0]);
    }

    // Gallery previews and new selections use the global age, while saved
    // thumbnails and edit sessions continue to use the saved geometry.
    await page.setViewportSize({ width: 1024, height: 768 });
    const stegoWorks = [];
    for (const level of ["hatchling", "explorer", "paleontologist"]) {
      const version = level === "hatchling" ? "stegosaurus-production-1" : "stegosaurus-explorer-1";
      const [x, y, region] = level === "hatchling" ? [420, 330, "body"] : [440, 396, "flank"];
      const [otherX, otherY, otherRegion] = level === "hatchling" ? [326, 135, "plate-2"] : [460, 178, "plate-panel-4"];
      await mount({ level });
      assert.equal(await page.locator(".gallery-new").count(), 5);
      assert(await page.locator(".gallery-new").first().locator("canvas").evaluate((canvas, version) => {
        const expected = window.gallery.painterFor(version).canvas(canvas.width, canvas.height);
        window.gallery.painterFor(version).render(expected, []);
        return canvas.toDataURL() === expected.toDataURL();
      }, version), `${level}: gallery preview matches selected geometry`);
      await press("NEW WORK"); await page.locator('canvas[aria-label="STEGOSAURUS"]').waitFor();
      await press("FILL"); await tap(x, y); await saved();
      assert.deepEqual(await surfacePixel(x, y), [239, 83, 80, 255]);
      assert.deepEqual(await surfacePixel(otherX, otherY), [255, 240, 207, 255]);
      const created = (await listed()).works.find(r => !r.document.completed && r.document.geometry === version).document;
      assert.deepEqual(created.actions, [{ kind: "fill", region, color: "#ef5350" }], `${level}: new selection saves its own region`);
      if (level === "paleontologist") {
        await press("UNDO"); await saved(); await back();
        continue;
      }
      await press("COLOR"); await press("BLUE"); await tap(otherX, otherY); await saved();
      await press("COLOR"); await press("BASE"); await tap(x, y); await saved();
      assert.deepEqual(await surfacePixel(x, y), [255, 240, 207, 255]);
      assert.deepEqual(await surfacePixel(otherX, otherY), [66, 165, 245, 255]);
      await press("UNDO"); await saved();
      assert.deepEqual(await surfacePixel(x, y), [239, 83, 80, 255]);
      await press("COLOR"); await press("GREEN"); await press("BRUSH");
      // This deliberate brush contact repeats the preceding base-fill point;
      // keep it outside the app's 500 ms double-tap suppression window.
      await page.waitForTimeout(510); await tap(x, y); await saved();
      assert.equal((await listed()).works.find(r => r.document.id === created.id).document.actions.at(-1).kind, "stroke");
      assert.deepEqual(await surfacePixel(x, y), [156, 204, 101, 255]);
      await press("UNDO"); await saved();
      assert.deepEqual(await surfacePixel(x, y), [239, 83, 80, 255]);
      const snapshot = await page.locator("canvas").evaluate(canvas => canvas.toDataURL());
      await page.screenshot({ path: join(artifacts, `stegosaurus-${level}.png`) });
      await press("DONE"); await page.getByRole("heading", { name: "YOUR STEGOSAURUS!", exact: true }).waitFor();
      await press("HOME"); await press("ENTER COLORING");
      await page.locator('.gallery-works[aria-busy="false"]').waitFor();
      const work = (await listed()).works.find(r => r.document.id === created.id).document;
      assert.equal(work.completed, true); assert.equal(work.rewarded, true);
      assert.deepEqual(work.actions, [{ kind: "fill", region, color: "#ef5350" }, { kind: "fill", region: otherRegion, color: "#42a5f5" }]);
      const thumbnail = await reference(work.actions, version);
      await thumbnailMatches(work.id, work.actions, thumbnail);
      stegoWorks.push({ work, snapshot, thumbnail, x, y, otherX, otherY });
    }
    assert.equal((await listed()).completedCount, 5);
    // Preserve the original persisted image byte-for-byte across age switches.
    const legacyThumbnail = await page.evaluate(async () => {
      const record = (await window.gallery.list()).works.find(r => r.document.id === "legacy-stego");
      return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error); reader.readAsDataURL(record.thumbnail);
      });
    });
    for (const level of ["paleontologist", "hatchling", "explorer"]) {
      for (const language of ["en", "ru"]) {
        await page.reload(); await mount({ level, language });
        const starts = (await page.evaluate(() => window.gallery.counts())).starts;
        for (const { work, snapshot, thumbnail, x, y, otherX, otherY } of stegoWorks) {
          const name = language === "en" ? "STEGOSAURUS" : "СТЕГОЗАВР";
          await thumbnailMatches(work.id, work.actions, thumbnail);
          assert.match(await page.locator(`[data-work-id="${work.id}"] img`).getAttribute("alt"), new RegExp(`^${name} · `));
          assert.equal(await page.locator(`[data-work-id="${work.id}"] .gallery-earned-star`).count(), 1);
          await page.locator(`[data-work-id="${work.id}"] button`).press("Enter");
          await page.locator(`canvas[aria-label="${name}"]`).waitFor();
          assert.equal(await page.locator("canvas").evaluate(canvas => canvas.toDataURL()), snapshot, `${level}: reopened pixels keep ${work.geometry}`);
          await press(language === "en" ? "UNDO" : "ОТМЕНИТЬ");
          await page.waitForFunction(() => /^(SAVED|СОХРАНЕНО)$/.test(document.querySelector(".coloring-save")?.textContent));
          assert.deepEqual(await surfacePixel(otherX, otherY), [255, 240, 207, 255]);
          assert.deepEqual(await surfacePixel(x, y), [239, 83, 80, 255]);
          await press(language === "en" ? "COLOR" : "ЦВЕТ"); await press(language === "en" ? "BLUE" : "ГОЛУБОЙ");
          await press(language === "en" ? "FILL" : "ЗАЛИВКА"); await tap(otherX, otherY);
          await page.waitForFunction(() => /^(SAVED|СОХРАНЕНО)$/.test(document.querySelector(".coloring-save")?.textContent));
          await press(language === "en" ? "DONE" : "ГОТОВО"); await page.locator(".coloring-result").waitFor();
          assert.equal(await page.locator(".coloring-result-earned, .celebration").count(), 0);
          assert.equal((await listed()).completedCount, 5);
          await press(language === "en" ? "NEW WORK" : "НОВЫЙ РИСУНОК");
          await page.locator(`canvas[aria-label="${name}"]`).waitFor();
          assert.equal(await page.getByRole("button", { name: language === "en" ? "DONE" : "ГОТОВО", exact: true }).isDisabled(), true);
          assert(await page.locator("canvas").evaluate((canvas, version) => {
            const painter = window.gallery.painterFor(version), expected = painter.canvas();
            painter.render(expected, []);
            return canvas.toDataURL() === expected.toDataURL();
          }, work.geometry), `${level}: NEW WORK retains ${work.geometry}`);
          await press(language === "en" ? "GALLERY" : "ГАЛЕРЕЯ");
          await page.locator('.gallery-works[aria-busy="false"]').waitFor();
          await thumbnailMatches(work.id, work.actions, thumbnail);
        }
        // The pre-variant save has no new geometry inferred from today's age.
        await thumbnailMatches(legacy.id, legacy.actions, legacyThumbnail);
        assert.equal(await page.locator('[data-work-id="legacy-stego"] .gallery-earned-star').count(), 1);
        await page.locator('[data-work-id="legacy-stego"] button').press("Enter");
        await page.locator(".coloring-workshop canvas").waitFor();
        assert.deepEqual(await surfacePixel(420, 330), [66, 165, 245, 255]);
        assert.equal((await listed()).works.find(r => r.document.id === "legacy-stego").document.geometry, "stegosaurus-production-1");
        await press(language === "en" ? "GALLERY" : "ГАЛЕРЕЯ");
        await page.locator('.gallery-works[aria-busy="false"]').waitFor();
        assert.equal((await page.evaluate(() => window.gallery.counts())).starts, starts + stegoWorks.length);
      }
    }
    await mount({});
    const ankyPreview = page.getByRole("button", { name: "ANKYLOSAURUS", exact: true }).locator("canvas");
    assert.equal(await ankyPreview.evaluate(c => {
      const painter = window.gallery.painterFor("ankylosaurus-hatchling-2"), expected = painter.canvas(c.width, c.height);
      painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
    }), true);
    const ankyContract = await page.evaluate(() => {
      const probes = window.gallery.ankylosaurusProbes;
      const painter = window.gallery.painterFor("ankylosaurus-production-1"), canvas = painter.canvas();
      const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
      painter.render(canvas, []);
      const blank = painter.pixels(canvas);
      const cases = probes.map(([x, y, region]) => {
        painter.render(canvas, [{ kind: "fill", region, color: "#ef5350" }]);
        return { region, hit: painter.regionAt({ x, y }), pixels: probes.map(([x, y]) => pixel(x, y)) };
      });
      painter.render(canvas, [
        ...probes.map(([, , region]) => ({ kind: "fill", region, color: "#42a5f5" })),
        { kind: "stroke", color: "#ef5350", size: 40, points: [{ x: -30, y: 384 }, { x: 940, y: 384 }] }
      ]);
      const covered = painter.pixels(canvas);
      let protectedInk = 0;
      for (let i = 0; i < blank.length; i += 4) {
        if (blank[i] === 9 && blank[i + 1] === 30 && blank[i + 2] === 64 && blank[i + 3] === 255) {
          if (!covered.slice(i, i + 4).every((v, c) => Math.abs(v - blank[i + c]) <= 1)) throw new Error(`Ankylosaurus ink lost at ${i / 4}`);
          protectedInk++;
        }
      }
      const eye = pixel(746, 386), highlight = pixel(745, 376), outside = pixel(0, 384);
      const protectedHit = painter.regionAt({ x: 746, y: 386 }) ?? null;
      painter.render(canvas, [{ kind: "stroke", color: "#ab67cb", size: 40, points: [{ x: 454, y: 384 }] }]);
      return { cases, protectedInk, eye, highlight, outside, protectedHit, brush: pixel(454, 384) };
    });
    for (const [index, test] of ankyContract.cases.entries()) {
      assert.equal(test.hit, test.region, `Ankylosaurus tap owns ${test.region}`);
      for (const [other, sample] of test.pixels.entries()) assert.deepEqual(sample, index === other ? [239, 83, 80, 255] : [255, 240, 207, 255], `${test.region} fills independently of ${ankyContract.cases[other].region}`);
    }
    assert(ankyContract.protectedInk > 5000);
    assert.deepEqual(ankyContract.eye, [9, 30, 64, 255]);
    assert.deepEqual(ankyContract.highlight, [255, 255, 255, 255]);
    assert.deepEqual(ankyContract.outside, [0, 0, 0, 0]);
    assert.equal(ankyContract.protectedHit, null);
    assert.deepEqual(ankyContract.brush, [171, 103, 203, 255]);
    await page.evaluate(async () => {
      const legacy = await window.gallery.newWork("legacy-anky", "ankylosaurus-production-1");
      legacy.append({ kind: "fill", color: "#ef5350", region: "armor-6" }); await legacy.settled();
      legacy.undo(); await legacy.settled();
    });
    await mount({});
    await page.locator('[data-work-id="legacy-anky"] button').press("Enter");
    await page.locator('canvas[aria-label="ANKYLOSAURUS"]').waitFor();
    await press("FILL"); await tap(454, 384); await saved();
    await press("COLOR"); await press("BLUE"); await tap(110, 280); await saved();
    const anky = (await listed()).works.find(r => r.document.geometry === "ankylosaurus-production-1").document;
    assert.deepEqual(anky.actions, [{ kind: "fill", color: "#ef5350", region: "armor-6" }, { kind: "fill", color: "#42a5f5", region: "tail-club" }]);
    await back();
    assert.equal(await page.locator(`[data-work-id="${anky.id}"] img`).getAttribute("alt"), "ANKYLOSAURUS · 1");
    assert.deepEqual(await thumbnailPixel(anky.id, 454, 384), [239, 83, 80, 255]);
    assert.deepEqual(await thumbnailPixel(anky.id, 110, 280), [66, 165, 245, 255]);
    await page.reload(); await mount({}); await press("CONTINUE");
    await page.locator('canvas[aria-label="ANKYLOSAURUS"]').waitFor();
    assert.deepEqual(await surfacePixel(454, 384), [239, 83, 80, 255]);
    assert.deepEqual(await surfacePixel(110, 280), [66, 165, 245, 255]);
    await press("UNDO"); await saved();
    assert.deepEqual(await surfacePixel(110, 280), [255, 240, 207, 255]);
    await press("FILL"); await press("COLOR"); await press("BASE"); await tap(454, 384); await saved();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await press("UNDO"); await saved(); await press("DONE");
    await page.getByRole("heading", { name: "YOUR ANKYLOSAURUS!", exact: true }).waitFor();
    assert.equal((await listed()).completedCount, 6);
    await press("NEW WORK"); await page.locator('canvas[aria-label="ANKYLOSAURUS"]').waitFor();
    assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
    await press("FILL"); await tap(110, 280); await saved();
    const another = (await listed()).works.find(r => r.document.id !== anky.id && r.document.geometry === "ankylosaurus-production-1").document;
    assert.notEqual(another.id, anky.id);
    assert.deepEqual((await listed()).works.find(r => r.document.id === anky.id).document.actions, [{ kind: "fill", color: "#ef5350", region: "armor-6" }]);
    await back();
    for (const level of ["hatchling", "explorer", "paleontologist"]) {
      for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport);
        for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
          await mount({ level, language, theme });
          const name = language === "en" ? "ANKYLOSAURUS" : "АНКИЛОЗАВР";
          assert.equal(await page.locator(".gallery-new").count(), 5);
          assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
          await page.locator(`[data-work-id="${anky.id}"] button`).press("Enter");
          await page.locator(`canvas[aria-label="${name}"]`).waitFor();
          assert.deepEqual(await surfacePixel(454, 384), [239, 83, 80, 255]);
          const boxes = await page.locator(".coloring-workshop").evaluate(s => [...s.querySelectorAll("button, canvas")].filter(e => e.getBoundingClientRect().width > 0).map(e => {
            const b = e.getBoundingClientRect(); return { canvas: e.tagName === "CANVAS", x: b.x, y: b.y, w: b.width, h: b.height };
          }));
          const canvas = boxes.find(b => b.canvas);
          for (const b of boxes) {
            assert(b.x >= -1 && b.y >= -1 && b.x + b.w <= viewport.width + 1 && b.y + b.h <= viewport.height + 1);
            if (!b.canvas) { assert(b.w >= 48 && b.h >= 48); assert(b.x + b.w <= canvas.x + 1 || b.x >= canvas.x + canvas.w - 1 || b.y + b.h <= canvas.y + 1 || b.y >= canvas.y + canvas.h - 1); }
          }
          assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [viewport.width, viewport.height]);
          if (level === "hatchling" && viewport.width === 1180 && language === "en" && theme === "light") {
            await press("FILL"); await press("COLOR"); await press("GREEN"); await tap(450, 454); await saved();
            await press("COLOR"); await press("BLUE"); await tap(110, 280); await saved();
            await page.screenshot({ path: join(artifacts, "ankylosaurus-legacy.png") });
            await press("UNDO"); await saved(); await press("UNDO"); await saved();
          }
          await press(language === "en" ? "DONE" : "ГОТОВО");
          await page.getByRole("heading", { name: language === "en" ? "YOUR ANKYLOSAURUS!" : "ТВОЙ АНКИЛОЗАВР!", exact: true }).waitFor();
          assert.equal((await listed()).completedCount, 6);
        }
      }
    }
    console.log("PASS Ankylosaurus: every region isolated, protected ink/eyes, brush, preview/thumbnail, save/reload/undo/base, same-art new work, cross-age reopen/reward, 24 RU/EN/theme/age iPad layouts; archived artwork retained");
    const newAnkylosaurusWorks = [];
    for (const level of ["hatchling", "explorer"]) {
      const version = level === "hatchling" ? "ankylosaurus-hatchling-2" : "ankylosaurus-explorer-1";
      const probes = await page.evaluate(level => level === "hatchling" ? window.gallery.ankylosaurusHatchlingProbes : window.gallery.ankylosaurusExplorerProbes, level);
      const contract = await page.evaluate(({ version, probes }) => {
        const painter = window.gallery.painterFor(version), canvas = painter.canvas();
        const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
        painter.render(canvas, []); const blank = painter.pixels(canvas);
        const cases = probes.map(([x, y, region]) => {
          painter.render(canvas, [{ kind: "fill", region, color: "#ef5350" }]);
          return { region, hit: painter.regionAt({ x, y }), pixels: probes.map(([x, y]) => pixel(x, y)) };
        });
        const brushPoint = probes.find(([, , id]) => id === "scute-10");
        painter.render(canvas, [{ kind: "stroke", color: "#ab67cb", size: 40, points: [{ x: brushPoint[0], y: brushPoint[1] }] }]);
        const brush = pixel(brushPoint[0], brushPoint[1]);
        painter.render(canvas, [
          ...probes.map(([, , region]) => ({ kind: "fill", region, color: "#42a5f5" })),
          { kind: "stroke", color: "#ef5350", size: 1000, points: [{ x: 460, y: 310 }] }
        ]);
        const covered = painter.pixels(canvas); let protectedInk = 0;
        for (let i = 0; i < blank.length; i += 4) {
          if (blank[i] === 9 && blank[i + 1] === 30 && blank[i + 2] === 64 && blank[i + 3] === 255) {
            assertPixel(i); protectedInk++;
          }
          if (blank[i + 3] === 0 && covered[i + 3] !== 0) throw new Error(`${version}: brush escaped silhouette`);
        }
        function assertPixel(i) {
          if ([0, 1, 2, 3].some(c => Math.abs(covered[i + c] - blank[i + c]) > 1)) throw new Error(`${version}: lost ink at ${i / 4}`);
        }
        return { cases, protectedInk, brush, eye: pixel(737, 400), highlight: pixel(732, 392), eyeHit: painter.regionAt({ x: 737, y: 400 }) ?? null };
      }, { version, probes });
      for (const [i, test] of contract.cases.entries()) {
        assert.equal(test.hit, test.region, `${version}: tap owns ${test.region}`);
        for (const [j, pixel] of test.pixels.entries()) assert.deepEqual(pixel, i === j ? [239, 83, 80, 255] : [255, 240, 207, 255], `${version}: ${test.region} fills independently of ${contract.cases[j].region}`);
      }
      assert(contract.protectedInk > 12000);
      assert.deepEqual(contract.eye, [9, 30, 64, 255]);
      assert.deepEqual(contract.highlight, [255, 255, 255, 255]);
      assert.equal(contract.eyeHit, null);
      assert.deepEqual(contract.brush, [171, 103, 203, 255]);
      await page.setViewportSize({ width: 1180, height: 820 }); await mount({ level });
      const preview = page.getByRole("button", { name: "ANKYLOSAURUS", exact: true }).locator("canvas");
      assert.equal(await preview.evaluate((c, version) => {
        const painter = window.gallery.painterFor(version), expected = painter.canvas(c.width, c.height);
        painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
      }, version), true);
      await press("ANKYLOSAURUS"); await page.locator(".coloring-workshop canvas").waitFor();
      const shield = probes.find(([, , id]) => id === "scute-10"), club = probes.find(([, , id]) => id === "tail-club");
      await press("FILL"); await tap(shield[0], shield[1]); await saved();
      await press("COLOR"); await press("BLUE"); await tap(club[0], club[1]); await saved();
      const work = (await listed()).works.find(r => r.document.geometry === version).document;
      assert.deepEqual(work.actions, [{ kind: "fill", color: "#ef5350", region: "scute-10" }, { kind: "fill", color: "#42a5f5", region: "tail-club" }]);
      const body = probes.find(([, , id]) => id === "body");
      await press("COLOR"); await press("GREEN"); await tap(body[0], body[1]); await saved();
      await page.screenshot({ path: join(artifacts, `ankylosaurus-${level}-1180x820.png`) });
      await press("UNDO"); await saved(); await back();
      await thumbnailMatches(work.id, work.actions, await reference(work.actions, version));
      await page.reload(); await mount({ level: level === "hatchling" ? "paleontologist" : "hatchling" });
      await page.locator(`[data-work-id="${work.id}"] button`).press("Enter");
      await page.locator(".coloring-workshop canvas").waitFor();
      assert.deepEqual(await surfacePixel(shield[0], shield[1]), [239, 83, 80, 255]);
      assert.deepEqual(await surfacePixel(club[0], club[1]), [66, 165, 245, 255]);
      await press("UNDO"); await saved();
      assert.deepEqual(await surfacePixel(club[0], club[1]), [255, 240, 207, 255]);
      await press("FILL"); await press("COLOR"); await press("BASE"); await tap(shield[0], shield[1]); await saved();
      assert.equal(await page.getByRole("button", { name: "DONE", exact: true }).isDisabled(), true);
      await press("UNDO"); await saved(); await press("DONE"); await page.locator(".coloring-result").waitFor();
      newAnkylosaurusWorks.push({ id: work.id, version, shield });
      assert.equal((await listed()).completedCount, 6 + newAnkylosaurusWorks.length);
      await press("NEW WORK"); await page.locator(".coloring-workshop canvas").waitFor();
      assert.equal(await page.locator("canvas").evaluate((c, version) => {
        const painter = window.gallery.painterFor(version), expected = painter.canvas();
        painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
      }, version), true, "result NEW WORK preserves the saved variant across age changes");
      await press("FILL"); await tap(shield[0], shield[1]); await saved(); await back();
      const another = (await listed()).works.find(r => r.document.geometry === version && r.document.id !== work.id).document;
      assert.notEqual(another.id, work.id);
      assert.deepEqual((await listed()).works.find(r => r.document.id === work.id).document.actions, [{ kind: "fill", color: "#ef5350", region: "scute-10" }]);
    }
    for (const level of ["hatchling", "explorer", "paleontologist"]) {
      for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport);
        for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
          await mount({ level, language, theme });
          const name = language === "en" ? "ANKYLOSAURUS" : "АНКИЛОЗАВР";
          const version = level === "hatchling" ? "ankylosaurus-hatchling-2" : "ankylosaurus-explorer-1";
          assert.equal(await page.locator(".gallery-new").count(), 5);
          assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
          await press(name); await page.locator(".coloring-workshop canvas").waitFor();
          assert.equal(await page.locator("canvas").evaluate((c, version) => {
            const painter = window.gallery.painterFor(version), expected = painter.canvas();
            painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
          }, version), true, `${level}: only the new age-selected artwork is offered`);
          const boxes = await page.locator(".coloring-workshop").evaluate(s => [...s.querySelectorAll("button, canvas")].filter(e => e.getBoundingClientRect().width > 0).map(e => {
            const b = e.getBoundingClientRect(); return { canvas: e.tagName === "CANVAS", x: b.x, y: b.y, w: b.width, h: b.height };
          }));
          const canvas = boxes.find(b => b.canvas);
          for (const b of boxes) {
            assert(b.x >= -1 && b.y >= -1 && b.x + b.w <= viewport.width + 1 && b.y + b.h <= viewport.height + 1);
            if (!b.canvas) { assert(b.w >= 48 && b.h >= 48); assert(b.x + b.w <= canvas.x + 1 || b.x >= canvas.x + canvas.w - 1 || b.y + b.h <= canvas.y + 1 || b.y >= canvas.y + canvas.h - 1); }
          }
          assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [viewport.width, viewport.height]);
          await press(language === "en" ? "GALLERY" : "ГАЛЕРЕЯ"); await page.locator('.gallery-works[aria-busy="false"]').waitFor();
          for (const work of newAnkylosaurusWorks) {
            await page.locator(`[data-work-id="${work.id}"] button`).press("Enter"); await page.locator(".coloring-workshop canvas").waitFor();
            assert.deepEqual(await surfacePixel(work.shield[0], work.shield[1]), [239, 83, 80, 255]);
            assert.equal((await listed()).works.find(r => r.document.id === work.id).document.geometry, work.version);
            await press(language === "en" ? "DONE" : "ГОТОВО"); await page.locator(".coloring-result").waitFor();
            assert.equal((await listed()).completedCount, 8);
            await press(language === "en" ? "GALLERY" : "ГАЛЕРЕЯ"); await page.locator('.gallery-works[aria-busy="false"]').waitFor();
          }
        }
      }
    }
    console.log(`PASS new Ankylosaurus variants: every-region fill/hit/brush/ink, previews, save/reload/reset/undo, cross-age reward/reopen, 24 layouts; workshop captures ${artifacts}`);
    const beforeTrex = await listed();
    const trexWorks = [];
    for (const level of ["hatchling", "explorer"]) {
      const version = level === "hatchling" ? "trex-hatchling-1" : "trex-explorer-1";
      await page.setViewportSize({ width: 1180, height: 820 }); await mount({ level });
      const choice = page.getByRole("button", { name: "T-REX", exact: true });
      assert.equal(await choice.count(), 1);
      assert.equal(await choice.locator("canvas").evaluate((c, version) => {
        const painter = window.gallery.painterFor(version), expected = painter.canvas(c.width, c.height);
        painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
      }, version), true, "T-Rex preview uses the selected age geometry");
      const starts = (await page.evaluate(() => window.gallery.counts())).starts;
      await press("T-REX"); await page.locator('canvas[aria-label="T-REX"]').waitFor();
      assert.equal(await page.locator("canvas").evaluate((c, version) => {
        const painter = window.gallery.painterFor(version), expected = painter.canvas();
        painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
      }, version), true, "new T-Rex is unpainted");
      assert.equal((await page.evaluate(() => window.gallery.counts())).starts, starts + 1);
      const protectedPixels = () => page.locator("canvas").evaluate(c => window.gallery.trexProtectedProbes.map(([x, y]) =>
        [...c.getContext("2d").getImageData(x, y, 1, 1).data]));
      const ink = await protectedPixels();
      await press("FILL"); await press("COLOR"); await press("GREEN"); await tap(704, 179); await saved();
      const body = level === "hatchling" ? [456, 366] : [490, 359];
      await press("COLOR"); await press("BLUE"); await tap(...body); await saved();
      const fills = [{ kind: "fill", color: "#9ccc65", region: "head" }, { kind: "fill", color: "#42a5f5", region: "body" }];
      const work = (await listed()).works.find(r => r.document.geometry === version).document;
      assert.deepEqual(work.actions, fills);
      for (const [width, height, language, theme] of [[1180, 820, "en", "light"], [1024, 768, "ru", "dark"]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(({ language, theme }) => window.gallery.appearance(language, theme), { language, theme });
        await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
        const boxes = await page.locator(".coloring-workshop").evaluate(s => [...s.querySelectorAll("button, canvas")].filter(e => e.getBoundingClientRect().width > 0).map(e => {
          const b = e.getBoundingClientRect(); return { canvas: e.tagName === "CANVAS", x: b.x, y: b.y, w: b.width, h: b.height };
        }));
        const canvas = boxes.find(b => b.canvas);
        for (const b of boxes) {
          assert(b.x >= -1 && b.y >= -1 && b.x + b.w <= width + 1 && b.y + b.h <= height + 1, `${version} fits ${width} × ${height}`);
          if (!b.canvas) { assert(b.w >= 48 && b.h >= 48); assert(b.x + b.w <= canvas.x + 1 || b.x >= canvas.x + canvas.w - 1 || b.y + b.h <= canvas.y + 1 || b.y >= canvas.y + canvas.h - 1); }
        }
        assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [width, height]);
        await page.screenshot({ path: join(artifacts, `${version}-workshop-${width}x${height}.png`) });
      }
      await page.setViewportSize({ width: 1180, height: 820 });
      await page.evaluate(() => window.gallery.appearance("en", "light"));
      await press("BRUSH"); await press("COLOR"); await press("PURPLE");
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.move(box.x + 570 * box.width / 920, box.y + 174 * box.height / 620);
      await page.mouse.down(); await page.mouse.move(box.x + 704 * box.width / 920, box.y + 179 * box.height / 620, { steps: 6 }); await page.mouse.up(); await saved();
      const painted = (await listed()).works.find(r => r.document.id === work.id).document;
      assert.equal(painted.actions.length, 3); assert.equal(painted.actions[2].kind, "stroke");
      assert.deepEqual(await protectedPixels(), ink, "workshop brush and fills preserve outlines and decorative details");
      assert.deepEqual(await surfacePixel(704, 179), [171, 103, 203, 255]);
      await back(); await thumbnailMatches(work.id, painted.actions, await reference(painted.actions, version));
      assert.match(await page.locator(`[data-work-id="${work.id}"] img`).getAttribute("alt"), /^T-REX/);
      await page.reload(); await mount({ level: level === "hatchling" ? "paleontologist" : "hatchling" });
      await press("CONTINUE"); await page.locator('canvas[aria-label="T-REX"]').waitFor();
      assert.deepEqual(await surfacePixel(...body), [66, 165, 245, 255]);
      assert.deepEqual(await surfacePixel(704, 179), [171, 103, 203, 255]);
      assert.equal((await listed()).works.find(r => r.document.id === work.id).document.geometry, version);
      await press("UNDO"); await saved();
      assert.deepEqual(await surfacePixel(704, 179), [156, 204, 101, 255]);
      await press("UNDO"); await saved();
      assert.deepEqual(await surfacePixel(...body), [255, 240, 207, 255]);
      await press("DONE"); await page.locator(".coloring-result").waitFor();
      trexWorks.push(work);
      assert.equal((await listed()).completedCount, beforeTrex.completedCount + trexWorks.length);
      assert.equal(await page.locator(".coloring-result-earned").count(), 1);
      await press("HOME"); await press("ENTER COLORING"); await page.locator('.gallery-works[aria-busy="false"]').waitFor();
      await page.reload(); await mount({ level: level === "hatchling" ? "explorer" : "hatchling", language: "ru" });
      const currentPreview = page.getByRole("button", { name: "ТИРАННОЗАВР", exact: true }).locator("canvas");
      assert.equal(await currentPreview.evaluate((c, version) => {
        const painter = window.gallery.painterFor(version), expected = painter.canvas(c.width, c.height);
        painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
      }, level === "hatchling" ? "trex-explorer-1" : "trex-hatchling-1"), true, "returning gallery offers the current age variant");
      assert.match(await page.locator(`[data-work-id="${work.id}"] img`).getAttribute("alt"), /^ТИРАННОЗАВР/);
      await page.locator(`[data-work-id="${work.id}"] button`).press("Enter"); await page.locator('canvas[aria-label="ТИРАННОЗАВР"]').waitFor();
      await press("ГОТОВО"); await page.locator(".coloring-result").waitFor();
      assert.equal((await listed()).completedCount, beforeTrex.completedCount + trexWorks.length);
      assert.equal(await page.locator(".coloring-result-earned").count(), 0);
      await press("НОВЫЙ РИСУНОК"); await page.locator(".coloring-workshop").waitFor();
      assert.equal(await page.locator("canvas").evaluate((c, version) => {
        const painter = window.gallery.painterFor(version), expected = painter.canvas();
        painter.render(expected, []); return c.toDataURL() === expected.toDataURL();
      }, version), true, "result NEW WORK keeps the saved T-Rex geometry after an age change");
      await press("ЗАЛИВКА"); await tap(704, 179);
      await page.waitForFunction(() => document.querySelector(".coloring-save")?.textContent === "СОХРАНЕНО");
      const other = (await listed()).works.find(r => r.document.geometry === version && r.document.id !== work.id).document;
      assert.notEqual(other.id, work.id);
      assert.deepEqual((await listed()).works.find(r => r.document.id === work.id).document.actions, fills.slice(0, 1));
    }
    const afterTrex = await listed();
    for (const record of beforeTrex.works) assert.deepEqual(afterTrex.works.find(r => r.document.id === record.document.id), record, "T-Rex leaves every older work unchanged");
    console.log("PASS T-Rex gallery: age-selected preview, independent works, fill/brush/protected ink, undo, reload, thumbnails, cross-age geometry, returning navigation and one reward per work");
    // Unknown versions retain their receipt and never borrow another renderer.
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open("rexlab-coloring"); request.onsuccess = () => resolve(request.result); });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("works", "readwrite"), store = tx.objectStore("works"), request = store.get("legacy-stego");
          request.onsuccess = () => { const row = request.result; row.document.geometry = "unknown-artwork-9"; store.put(row, "legacy-stego"); };
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    });
    await mount({}); assert.deepEqual((await listed()).unavailable, ["legacy-stego"]);
    assert.equal((await listed()).completedCount, 10);
    await page.evaluate(() => window.gallery.damage("legacy-stego", "history")); await mount({});
    await press("PARENT RECOVERY"); await press("RESET COLORING");
    await page.getByText("LET’S PAINT A DINOSAUR!", { exact: true }).waitFor();
    assert.equal((await listed()).completedCount, 0); assert.deepEqual((await listed()).works, []);
    console.log(`PASS creatures: both Stegosaurus variants and Triceratops, every-region Canvas fills and masks, age-selected previews, cross-age saves/undo/thumbnails, controls, rewards and reset; screenshots ${artifacts}`);
    assert.deepEqual(errors, []);
    console.log("PASS gallery: independent durable thumbnails/statuses/continue, full-pixel brush/mixed thumbnails and undo/reload, workshop saves and retry, empty drafts, corruption/recovery, tap safety, 24 RU/EN/theme layouts and reduced motion");
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL gallery: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
