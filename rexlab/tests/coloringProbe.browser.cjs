// Contract test: real Canvas 2D, pointer routing, layout and IndexedDB transactions in Chromium.
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

async function canvasAndStorage(page) {
  return page.evaluate(async () => {
    const { createPainter } = await import("/harness.js");
    const { newWork, append, undo, readRecord, readWork } = await import("/harness.js");
    const { BASE, COLORS, REGIONS, WIDTH, HEIGHT } = await import("/harness.js");
    const { indexedWorks } = await import("/harness.js");
    const check = (value, message) => { if (!value) throw new Error(message); };
    const equal = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
    const painter = createPainter(() => document.createElement("canvas"));
    const canvas = painter.canvas();
    const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
    const rgb = color => color.match(/\w\w/g).map(byte => parseInt(byte, 16));
    const isColor = (x, y, color) => pixel(x, y).slice(0, 3).join() === rgb(color).join();
    const dot = { kind: "stroke", color: COLORS[1], size: 20, points: [{ x: 400, y: 400 }] };
    painter.render(canvas, []);
    const blank = painter.pixels(canvas);
    if (painter.changed(canvas, [], { ...dot, color: BASE })) {
      const candidate = painter.canvas(); painter.render(candidate, [{ ...dot, color: BASE }]);
      const actual = painter.pixels(candidate); const diffs = [];
      for (let i = 0; i < blank.length && diffs.length < 10; i++) if (blank[i] !== actual[i]) diffs.push([i % 4, Math.floor(i / 4) % WIDTH, Math.floor(i / 4 / WIDTH), blank[i], actual[i]]);
      throw new Error(`base dot must be a no-op: ${JSON.stringify(diffs)}`);
    }
    check(!painter.changed(canvas, [], { kind: "fill", color: BASE, region: "body" }), "base fill must be a no-op");
    check(!painter.changed(canvas, [], { ...dot, points: [{ x: 10, y: 10 }] }), "outside contact must be a no-op");
    for (const size of [8, 20, 40]) {
      painter.render(canvas, [{ ...dot, size }]);
      check(isColor(400, 400, COLORS[1]), "round dot center");
      check(isColor(400 + size / 2 + 2, 400, BASE), "round dot diameter");
      check(isColor(400 + size / 2, 400 + size / 2, BASE), "round dot corner");
    }
    const paths = REGIONS.map(region => new Path2D(region.path));
    const ctx = canvas.getContext("2d");
    for (let y = 1; y < HEIGHT; y += 3) for (let x = 1; x < WIDTH; x += 3) check(paths.filter(path => ctx.isPointInPath(path, x + .3, y + .3)).length <= 1, `region overlap ${x},${y}: ${REGIONS.filter((_, i) => ctx.isPointInPath(paths[i], x + .3, y + .3)).map(region => region.id)}`);
    painter.render(canvas, [{ kind: "stroke", color: COLORS[2], size: 40, points: [{ x: 0, y: 404 }, { x: 1024, y: 404 }, { x: 0, y: 250 }, { x: 400, y: 400 }] }]);
    check(pixel(5, 404)[3] === 0, "brush clipped outside silhouette");
    const eye = pixel(144, 404); check(eye.join() === [...rgb("#3c4358"), 255].join(), "eye stays above brush");
    const plateDot = { ...dot, color: COLORS[4], points: [{ x: 420, y: 180 }] };
    const bodyFill = { kind: "fill", color: COLORS[6], region: "body" };
    painter.render(canvas, [plateDot, bodyFill]);
    check(isColor(420, 180, COLORS[4]), "body fill preserves earlier neighboring plate stroke");
    check(isColor(400, 400, COLORS[6]), "regional fill colors body");
    painter.render(canvas, [bodyFill, dot]);
    check(isColor(400, 400, COLORS[1]), "stroke after fill stays visible");
    check(isColor(500, 420, COLORS[6]), "later stroke leaves remaining fill intact");
    const original = append(append(newWork("real-a"), dot), { kind: "fill", color: COLORS[6], region: "body" });
    painter.render(canvas, original.actions);
    check(isColor(400, 400, COLORS[6]), "fill replaces earlier brush");
    check(isColor(310, 210, BASE), "fill leaves neighboring plate alone");
    check(!painter.changed(canvas, original.actions, original.actions.at(-1)), "same fill must be a no-op");
    check(painter.regionAt({ x: 400, y: 400 }) === "body", "body hit");
    check(painter.regionAt({ x: 144, y: 404 }) === undefined, "eye rejects fill");
    check(painter.regionAt({ x: 210, y: 425 }) === undefined, "outline rejects fill");
    const painted = painter.pixels(canvas);
    const store = indexedWorks(indexedDB, "lab801-contract");
    async function assertThumbnail(blob, source, label) {
      const expected = document.createElement("canvas"); expected.width = 256; expected.height = 192;
      expected.getContext("2d").drawImage(source, 0, 0, 256, 192);
      const actual = document.createElement("canvas"); actual.width = 256; actual.height = 192;
      const bitmap = await createImageBitmap(blob);
      actual.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
      const expectedPixels = expected.getContext("2d").getImageData(0, 0, 256, 192).data;
      const actualPixels = actual.getContext("2d").getImageData(0, 0, 256, 192).data;
      check(equal(expectedPixels, actualPixels), label);
    }
    const thumbnail = await painter.thumbnail(canvas);
    await assertThumbnail(thumbnail, canvas, "thumbnail shows original painted composition");
    await store.write({ document: original, thumbnail }, null);
    const entry = (await store.list())[0];
    const restored = readRecord(entry.value, entry.id).document;
    painter.render(canvas, restored.actions);
    check(equal(painter.pixels(canvas), painted), "pixel exact round trip");
    const undone = undo(restored); painter.render(canvas, undone.actions);
    check(isColor(400, 400, COLORS[1]), "undo after restore returns brush");
    const continued = append(undone, { ...dot, color: COLORS[4], points: [{ x: 450, y: 400 }] });
    painter.render(canvas, continued.actions);
    await store.write({ document: continued, thumbnail: await painter.thumbnail(canvas) }, original.revision);
    const second = append(newWork("real-b"), { kind: "fill", color: COLORS[2], region: "head" });
    painter.render(canvas, second.actions);
    await store.write({ document: second, thumbnail: await painter.thumbnail(canvas) }, null);
    const firstAgain = readRecord((await store.list()).find(entry => entry.id === "real-a").value, "real-a");
    check(JSON.stringify(firstAgain.document) === JSON.stringify(continued), "independent journals");
    const secondRecord = readRecord((await store.list()).find(entry => entry.id === "real-b").value, "real-b");
    await assertThumbnail(secondRecord.thumbnail, canvas, "second work thumbnail shows its own paint");
    painter.render(canvas, continued.actions);
    await assertThumbnail(firstAgain.thumbnail, canvas, "continued work thumbnail shows latest revision");
    check(!equal([...new Uint8Array(await firstAgain.thumbnail.arrayBuffer())], [...new Uint8Array(await secondRecord.thumbnail.arrayBuffer())]), "distinct compositions have distinct thumbnails");
    const stableThumbnail = [...new Uint8Array(await firstAgain.thumbnail.arrayBuffer())];
    let rejected = false;
    try { await store.write({ document: append(continued, dot), thumbnail }, original.revision); } catch { rejected = true; }
    check(rejected, "stale writer rejected");
    check(JSON.stringify(readRecord((await store.list()).find(entry => entry.id === "real-a").value, "real-a").document) === JSON.stringify(continued), "conflict retains durable journal");
    check(equal([...new Uint8Array(await readRecord((await store.list()).find(entry => entry.id === "real-a").value, "real-a").thumbnail.arrayBuffer())], stableThumbnail), "conflict retains durable thumbnail");
    // Abort a real readwrite transaction after put, before its completion.
    const abortingFactory = { open: (...args) => {
      const request = indexedDB.open(...args);
      return new Proxy(request, {
        set(target, key, value) {
          if (key === "onsuccess") target.onsuccess = () => value({ target: { result: target.result } });
          else Reflect.set(target, key, value); return true;
        },
        get(target, key) {
          if (key === "result") return new Proxy(target.result, { get(db, property) {
            if (property === "transaction") return (...args) => {
              const tx = db.transaction(...args);
              if (args[1] !== "readwrite") return tx;
              return new Proxy(tx, { get(transaction, name) {
                if (name === "objectStore") return (...args) => {
                  const objectStore = transaction.objectStore(...args);
                  return new Proxy(objectStore, { get(object, method) {
                    if (method === "put") return (...args) => { const result = object.put(...args); transaction.abort(); return result; };
                    const member = Reflect.get(object, method); return typeof member === "function" ? member.bind(object) : member;
                  } });
                };
                const member = Reflect.get(transaction, name); return typeof member === "function" ? member.bind(transaction) : member;
              }, set(transaction, name, value) { Reflect.set(transaction, name, value); return true; } });
            };
            const member = Reflect.get(db, property); return typeof member === "function" ? member.bind(db) : member;
          }, set(db, property, value) { Reflect.set(db, property, value); return true; } });
          const member = Reflect.get(target, key); return typeof member === "function" ? member.bind(target) : member;
        }
      });
    } };
    const abortingStore = indexedWorks(abortingFactory, "lab801-contract");
    rejected = false;
    try { await abortingStore.write({ document: append(continued, dot), thumbnail }, continued.revision); } catch { rejected = true; }
    check(rejected, "aborted transaction must not acknowledge put");
    const intact = readRecord((await store.list()).find(entry => entry.id === "real-a").value, "real-a");
    check(intact.document.revision === continued.revision, "abort preserves previous revision");
    check(equal([...new Uint8Array(await intact.thumbnail.arrayBuffer())], stableThumbnail), "abort preserves thumbnail atomically");
    await abortingStore.close();
    // The invalid row is a regular fixture, never a replacement for a valid work.
    const raw = await new Promise((yes, no) => { const request = indexedDB.open("lab801-contract", 1); request.onsuccess = () => yes(request.result); request.onerror = () => no(request.error); });
    await new Promise((yes, no) => { const tx = raw.transaction("works", "readwrite"); tx.objectStore("works").put({ document: { ...newWork("damaged"), schema: 99 }, thumbnail }, "damaged"); tx.oncomplete = yes; tx.onabort = () => no(tx.error); });
    rejected = false;
    try { await store.write({ document: append(newWork("damaged"), dot), thumbnail }, null); } catch { rejected = true; }
    check(rejected, "unknown document must not be overwritten");
    const rows = await store.list();
    check(rows.length === 3 && rows.find(entry => entry.id === "damaged").value.document.schema === 99, "damaged row retained alongside readable works");
    const unreadable = indexedWorks({ open() { throw new Error("Read denied"); } }, "unreadable");
    rejected = false; try { await unreadable.list(); } catch { rejected = true; }
    check(rejected, "read error must not become empty collection");
    raw.close(); await store.close();
    painter.render(canvas, []); check(equal(blank, painter.pixels(canvas)), "blank render stable");
    return "Canvas semantics, exact restore/undo/continue, independent works, CAS, atomic abort and corruption preservation passed";
  });
}

async function metrics(page) {
  return page.evaluate(async () => {
    const { createPainter } = await import("/harness.js");
    const { newWork, readRecord } = await import("/harness.js");
    const { COLORS } = await import("/harness.js");
    const { indexedWorks } = await import("/harness.js");
    const painter = createPainter(() => document.createElement("canvas")); const canvas = painter.canvas();
    const result = [];
    for (const strokes of [10, 1000]) {
      const pointsPerStroke = strokes === 10 ? 8 : 24;
      const actions = Array.from({ length: strokes }, (_, i) => ({ kind: "stroke", color: COLORS[1 + i % 11], size: [8, 20, 40][i % 3], points: Array.from({ length: pointsPerStroke }, (_, j) => ({ x: 250 + (i * 37 + j * 7) % 380, y: 340 + (i * 13 + j * 3) % 150 })) }));
      const startRender = performance.now(); painter.render(canvas, actions); const initialRenderMs = performance.now() - startRender;
      const startThumbnail = performance.now(); const thumbnail = await painter.thumbnail(canvas); const thumbnailMs = performance.now() - startThumbnail;
      for (const count of [1, 10, 50]) {
        const store = indexedWorks(indexedDB, `lab801-measure-${strokes}-${count}`);
        const records = Array.from({ length: count }, (_, i) => ({ document: { ...newWork(`measure-${i}`), revision: strokes, actions }, thumbnail }));
        const journalBytes = records.reduce((sum, record) => sum + new Blob([JSON.stringify(record.document)]).size, 0);
        const thumbnailBytes = count * thumbnail.size;
        const saves = [];
        const startSave = performance.now();
        for (const record of records) { const start = performance.now(); await store.write(record, null); saves.push(performance.now() - start); }
        const saveMs = performance.now() - startSave;
        const startRestore = performance.now(); const restored = (await store.list()).map(entry => readRecord(entry.value, entry.id)); const restoreMs = performance.now() - startRestore;
        const renders = []; const startRenderAll = performance.now();
        for (const record of restored) { const start = performance.now(); painter.render(canvas, record.document.actions); renders.push(performance.now() - start); }
        const renderAllMs = performance.now() - startRenderAll;
        const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1] }; };
        result.push({ strokes, pointsPerStroke, pointsPerWork: strokes * pointsPerStroke, count, journalBytes, thumbnailBytes, payloadBytes: journalBytes + thumbnailBytes, saveMs, restoreMs, renderAllMs, savePerWorkMs: stats(saves), renderPerWorkMs: stats(renders), initialRenderMs, thumbnailMs });
        await store.close();
      }
    }
    return { userAgent: navigator.userAgent, devicePixelRatio, logicalCanvas: [1024, 768], rows: result };
  });
}

async function ui(page, output) {
  await page.goto(`${output.url}/prototypes/coloring.html`);
  await page.waitForFunction(() => document.querySelector("#drawing")?.dataset.work);
  const drawing = page.locator("#drawing");
  const initialId = await drawing.getAttribute("data-work");
  async function pointer(type, id, x, y) {
    await drawing.evaluate((element, { type, id, x, y }) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: "touch", isPrimary: id === 1, button: 0, clientX: rect.left + x / 1024 * rect.width, clientY: rect.top + y / 768 * rect.height }));
    }, { type, id, x, y });
  }
  // Synthetic pointers exercise cancellation and the extra-finger gate; real mouse below exercises capture.
  // Synthetic IDs cannot call native setPointerCapture, so use real mouse for accepted strokes.
  async function stroke(x = 400, y = 400) {
    const rect = await drawing.boundingBox();
    await page.mouse.move(rect.x + x / 1024 * rect.width, rect.y + y / 768 * rect.height);
    await page.mouse.down();
    await page.mouse.move(rect.x + (x + 50) / 1024 * rect.width, rect.y + (y + 20) / 768 * rect.height);
    await page.mouse.up();
  }
  await stroke();
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  assert.equal(await drawing.getAttribute("data-revision"), "1");
  const before = await drawing.evaluate(canvas => canvas.toDataURL());
  await page.reload(); await page.waitForFunction(() => document.querySelector("#drawing")?.dataset.revision === "1");
  assert.equal(await drawing.getAttribute("data-work"), initialId);
  assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), before);
  await page.locator("#undo").focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  assert.equal(await drawing.getAttribute("data-revision"), "2");
  await stroke(450, 420);
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  const committedBeforeCancel = await drawing.evaluate(canvas => canvas.toDataURL());
  const rect = await drawing.boundingBox();
  await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height * .5); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .45, rect.y + rect.height * .55);
  assert.notEqual(await drawing.evaluate(canvas => canvas.toDataURL()), committedBeforeCancel, "gesture preview visibly changes canvas");
  const revision = await drawing.getAttribute("data-revision");
  await pointer("pointerdown", 2, 500, 450); await pointer("pointermove", 2, 700, 500); await pointer("pointerup", 2, 700, 500);
  await page.evaluate(() => document.querySelector("#language").click());
  assert.equal(await page.locator("html").getAttribute("lang"), "en", "controls ignored during stroke");
  await page.evaluate(() => window.dispatchEvent(new Event("resize"))); await page.mouse.up();
  assert.equal(await drawing.getAttribute("data-revision"), revision, "rotation discards uncommitted stroke");
  assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), committedBeforeCancel, "rotation removes preview pixels");
  await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height * .5); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .46, rect.y + rect.height * .57);
  assert.notEqual(await drawing.evaluate(canvas => canvas.toDataURL()), committedBeforeCancel, "second preview visibly changes canvas");
  await drawing.dispatchEvent("pointercancel", { pointerId: 1 }); await page.mouse.up();
  assert.equal(await drawing.getAttribute("data-revision"), revision, "pointercancel discards uncommitted stroke");
  assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), committedBeforeCancel, "pointercancel removes preview pixels");
  async function checkAnimation() {
    const paintedBaseline = await drawing.evaluate(canvas => canvas.toDataURL());
    for (const [preference, animation] of [["reduce", "probe-fade"], ["no-preference", "probe-alive"]]) {
      await page.emulateMedia({ reducedMotion: preference });
      await page.locator("#animate").focus(); await page.keyboard.press("Enter");
      assert.equal(await drawing.evaluate(canvas => getComputedStyle(canvas).animationName), animation);
      assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), paintedBaseline, "animation preserves pre-entry paint");
      await page.locator("#animate").focus(); await page.keyboard.press("Enter");
      assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), paintedBaseline, "leaving animation preserves paint");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await checkAnimation();
  // Wait-free double tap uses the actual browser event times and shared filter.
  const tap = await drawing.boundingBox();
  const revisionBeforeTap = Number(await drawing.getAttribute("data-revision"));
  await page.mouse.dblclick(tap.x + tap.width * .5, tap.y + tap.height * .5, { delay: 20 });
  assert.equal(Number(await drawing.getAttribute("data-revision")), revisionBeforeTap + 1, "double tap adds one dot");
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  await page.locator("#works").focus(); await page.keyboard.press("Enter");
  await page.locator("#new").focus(); await page.keyboard.press("Enter");
  assert.notEqual(await drawing.getAttribute("data-work"), initialId);
  assert.equal(await drawing.getAttribute("data-revision"), "0");
  for (const [width, height] of [[1024, 768], [768, 1024], [390, 844], [320, 568], [844, 390], [568, 320]]) {
    await page.setViewportSize({ width, height });
    for (const language of ["en", "ru"]) for (const theme of ["light", "dark"]) {
      if (await page.locator("html").getAttribute("lang") !== language) { await page.locator("#language").focus(); await page.keyboard.press("Enter"); }
      if (await page.locator("#probe").getAttribute("data-theme") !== theme) { await page.locator("#theme").focus(); await page.keyboard.press("Enter"); }
      const layout = await page.evaluate(() => ({
        overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
        controls: [...document.querySelectorAll("button")].filter(button => button.getClientRects().length && !button.closest("[hidden]")).map(button => {
          const rect = button.getBoundingClientRect(); return { label: button.textContent, width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }),
        canvas: (() => { const rect = document.querySelector("canvas").getBoundingClientRect(); const stage = document.querySelector("#stage").getBoundingClientRect(); return { width: rect.width, height: rect.height, inside: rect.left >= stage.left - .5 && rect.right <= stage.right + .5 && rect.top >= stage.top - .5 && rect.bottom <= stage.bottom + .5 }; })()
      }));
      assert.deepEqual(layout.overflow, [false, false], `${width}x${height} overflow`);
      for (const control of layout.controls) assert(control.width >= 60 && control.height >= 60 && control.left >= 0 && control.right <= width + .5 && control.top >= 0 && control.bottom <= height + .5, JSON.stringify(control));
      assert(layout.canvas.width > 100 && layout.canvas.height > 100, JSON.stringify(layout.canvas));
      assert(layout.canvas.inside, `${width}x${height} clips the drawing: ${JSON.stringify(layout.canvas)}`);
      assert(Math.abs(layout.canvas.width / layout.canvas.height - 4 / 3) < .01, "canvas keeps undistorted logical coordinates");
      for (const chooser of ["colors", "sizes", "works"]) {
        await page.locator(`#${chooser}`).evaluate(button => button.click());
        assert.equal(await page.locator("#sheet").isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
        await page.locator("#close").evaluate(button => button.click());
      }
    }
    await page.screenshot({ path: resolve(output.directory, `probe-${width}x${height}.png`) });
  }
  // Drive tool selection and observable paint through the actual page.
  await page.setViewportSize({ width: 1024, height: 768 });
  if (await page.locator("html").getAttribute("lang") !== "en") { await page.locator("#language").focus(); await page.keyboard.press("Enter"); }
  async function press(selector) { await page.locator(selector).evaluate(button => button.click()); }
  async function chooseColor(index) { await press("#colors"); await press(`button[aria-label="COLOR ${index}"]`); }
  async function dotAt(x, y) {
    const box = await drawing.boundingBox();
    await page.mouse.click(box.x + x / 1024 * box.width, box.y + y / 768 * box.height);
  }
  async function pixelAt(x, y) { return drawing.evaluate((canvas, point) => [...canvas.getContext("2d").getImageData(point.x, point.y, 1, 1).data], { x, y }); }
  const pristine = await drawing.evaluate(canvas => canvas.toDataURL());
  await chooseColor(1); await dotAt(400, 400);
  assert.equal(await drawing.getAttribute("data-revision"), "0", "base contact creates no history");
  assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), pristine);
  assert(await page.locator("#undo").isDisabled());
  await chooseColor(7); await dotAt(5, 5);
  assert.equal(await drawing.getAttribute("data-revision"), "0", "outside contact creates no history");
  assert(await page.locator("#undo").isDisabled());
  for (const size of [8, 20, 40]) {
    await press("#sizes"); await press(`#choices button:has-text("${size}")`);
    await stroke(400, 400);
    await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
    assert.deepEqual(await pixelAt(400, 400), [66, 165, 245, 255]);
    assert.deepEqual(await pixelAt(400, 400 - size / 2 - 2), [255, 240, 207, 255], "selected brush diameter");
    await press("#undo");
    await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
    assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), pristine, "undo restores chosen brush action");
  }
  await chooseColor(3); await press("#tool"); await dotAt(400, 400);
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  assert.deepEqual(await pixelAt(500, 420), [255, 147, 69, 255], "page fill paints distant body point");
  assert.deepEqual(await pixelAt(420, 180), [255, 240, 207, 255], "page fill leaves plate unchanged");
  await checkAnimation();
  await press("#undo");
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), pristine, "page fill is undoable");
  await press("#tool");
  // Per-work damage is visible and a healthy work remains editable after reload.
  await page.evaluate(async () => {
    const db = await new Promise((yes, no) => { const request = indexedDB.open("rexlab-coloring-probe-1", 1); request.onsuccess = () => yes(request.result); request.onerror = () => no(request.error); });
    await new Promise((yes, no) => { const tx = db.transaction("works", "readwrite"); tx.objectStore("works").put({ document: { schema: 99 } }, "unknown-work"); tx.oncomplete = yes; tx.onabort = no; }); db.close();
  });
  await page.reload(); await page.waitForFunction(() => document.querySelector("#drawing")?.dataset.work);
  await page.locator("#works").focus(); await page.keyboard.press("Enter");
  assert.equal(await page.locator("#choices button:disabled").count(), 1);
  assert(await page.locator("#choices .work").count() >= 1);
  // A damaged sibling must not divert a healthy work's failed-save RETRY.
  await page.locator("#close").evaluate(button => button.click());
  await page.setViewportSize({ width: 1024, height: 768 });
  if (await page.locator("html").getAttribute("lang") !== "en") { await page.locator("#language").focus(); await page.keyboard.press("Enter"); }
  const healthyId = await drawing.getAttribute("data-work");
  async function durable(id) {
    return page.evaluate(async id => {
      const { indexedWorks } = await import("/harness.js");
      const store = indexedWorks(indexedDB, "rexlab-coloring-probe-1");
      try {
        const entries = await store.list(); const record = entries.find(entry => entry.id === id).value;
        return { document: record.document, thumbnail: [...new Uint8Array(await record.thumbnail.arrayBuffer())], damaged: entries.find(entry => entry.id === "unknown-work").value };
      } finally { await store.close(); }
    }, id);
  }
  const lastGood = await durable(healthyId);
  await page.evaluate(() => {
    window.probeOriginalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
  });
  await stroke(600, 400);
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVE FAILED"));
  const retainedPaint = await drawing.evaluate(canvas => canvas.toDataURL());
  const retainedRevision = Number(await drawing.getAttribute("data-revision"));
  assert.equal(retainedRevision, lastGood.document.revision + 1);
  assert.deepEqual(await durable(healthyId), lastGood, "failure preserves prior document, thumbnail and damaged sibling");
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.probeOriginalToBlob; delete window.probeOriginalToBlob; });
  await page.locator("#retry").focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("SAVED"));
  assert.equal(await drawing.evaluate(canvas => canvas.toDataURL()), retainedPaint, "retry retains the current paint");
  const recovered = await durable(healthyId);
  assert.equal(recovered.document.revision, retainedRevision, "retry saves the failed current revision");
  assert.notDeepEqual(recovered.thumbnail, lastGood.thumbnail, "retry saves the changed thumbnail");
  assert.deepEqual(recovered.damaged, lastGood.damaged, "retry never overwrites the damaged sibling");
  await page.addInitScript(() => {
    const factory = window.indexedDB;
    window.allowProbeStorage = false;
    Object.defineProperty(window, "indexedDB", { configurable: true, get() {
      if (!window.allowProbeStorage) throw new Error("Storage denied");
      return factory;
    } });
  });
  await page.reload(); await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("READ FAILED"));
  assert.equal(await drawing.getAttribute("data-work"), "");
  assert.equal(await page.locator("#new").isDisabled(), true, "read failure cannot offer an empty replacement collection");
  await page.evaluate(() => { window.allowProbeStorage = true; });
  await page.locator("#retry").focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#drawing")?.dataset.work);
  assert.equal(await drawing.getAttribute("data-work"), healthyId, "retry restores the existing collection");
  return "UI: restore/undo/continue, cancellation, second finger, double tap, exact animation, 24 device/language/theme layouts, damaged-work chooser and denied-storage retry passed";
}

(async () => {
  const directory = process.env.PROBE_OUTPUT || "/tmp/lab-801/browser";
  await mkdir(directory, { recursive: true });
  let browser;
  try {
    const { build } = await import("vite");
    const root = resolve(__dirname, "..");
    const bundle = await build({ root, configFile: false, logLevel: "error", plugins: [{
      name: "coloring-contract-harness",
      resolveId(id) { if (id === "coloring-contract-harness") return "\0coloring-contract-harness"; },
      load(id) { if (id === "\0coloring-contract-harness") return ["geometry", "model", "painter", "store"].map(name => `export * from ${JSON.stringify(resolve(root, `src/coloringProbe/${name}.ts`))}`).join(";\n"); }
    }], build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: { probe: resolve(root, "prototypes/coloring.html"), harness: "coloring-contract-harness" }, output: { entryFileNames: chunk => chunk.name === "harness" ? "harness.js" : "assets/[name]-[hash].js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    const url = "http://localhost";
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: "en-US", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      // Local-network HTTP does not expose randomUUID on iPad Safari.
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    });
    await context.route(`${url}/**`, route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      const body = files.get(path);
      const contentType = path.endsWith(".html") ? "text/html" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
      return route.fulfill({ status: body === undefined ? 404 : 200, contentType, body: body === undefined ? "Not found" : typeof body === "string" ? body : Buffer.from(body) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${url}/prototypes/coloring.html`);
    console.log(await canvasAndStorage(page));
    const measured = await metrics(page);
    await writeFile(resolve(directory, "metrics.json"), JSON.stringify({ measuredAt: new Date().toISOString(), browser: browser.version(), ...measured }, null, 2));
    console.log(await ui(page, { url, directory }));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS coloring probe: canvas, IndexedDB, UI and measured 1/10/50-work payloads; results ${directory}/metrics.json`);
  } finally { if (browser) await browser.close(); }
})().catch(error => { console.error(error); console.error(`FAIL coloring probe: ${error.message.split("\n")[0]}`); process.exitCode = 1; });
