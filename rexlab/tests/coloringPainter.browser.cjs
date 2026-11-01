// Contract test: production vector paths and real Canvas 2D pixels in Chromium.
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  let browser;
  try {
    const { build } = await import("vite");
    const root = resolve(__dirname, "..");
    const bundle = await build({ root, configFile: false, logLevel: "error", plugins: [{
      name: "production-coloring-contract",
      resolveId(id) { if (id === "coloring-harness") return "\0coloring-harness"; },
      load(id) {
        if (id === "\0coloring-harness") return ["index", "geometry", "painter", "stegosaurusExplorer"]
          .map(name => `export * from ${JSON.stringify(resolve(root, `src/coloring/${name}.ts`))}`).join(";\n");
      }
    }], build: { write: false, rolldownOptions: { preserveEntrySignatures: "strict", input: "coloring-harness", output: { entryFileNames: "harness.js" } } } });
    const files = new Map(bundle.output.map(file => [file.fileName, file.type === "chunk" ? file.code : file.source]));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route("http://coloring.test/**", route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      if (!path) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Canvas contract</title>" });
      assert(files.has(path), `Missing browser module ${path}`);
      return route.fulfill({ contentType: "text/javascript", body: files.get(path) });
    });
    await page.goto("http://coloring.test/");
    console.log(await page.evaluate(async () => {
      const { ARTWORK, BASE_COLOR, BRUSH_SIZES, COLORS, WIDTH, HEIGHT, createPainter, coloringModel } = await import("/harness.js");
      const check = (value, message) => { if (!value) throw new Error(message); };
      const equal = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
      const rgb = color => [...color.slice(1).match(/../g).map(byte => parseInt(byte, 16)), 255];
      const painter = createPainter(() => document.createElement("canvas"));
      const model = coloringModel(ARTWORK, painter.inspection);
      const canvas = painter.canvas();
      const pixel = (x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
      const colorAt = (x, y, color, message) => check(equal(pixel(x, y), rgb(color)), `${message}: ${pixel(x, y)}`);
      const dot = (x, y, color = COLORS[1], size = 20) => ({ kind: "stroke", color, size, points: [{ x, y }] });
      const fill = (region, color) => ({ kind: "fill", color, region });
      const empty = model.newWork("production");
      painter.render(canvas, []);
      const blank = painter.pixels(canvas);
      check(canvas.width === WIDTH && canvas.height === HEIGHT, "fixed saved coordinate space");
      check(ARTWORK.version !== "stegosaurus-1", "production art cannot reinterpret probe journals");
      // Independent landmarks pin the long-tailed, four-legged design geometry.
      const samples = [
        [80, 302, "body"], [420, 330, "body"], [230, 510, "front-far"], [320, 530, "body"],
        [440, 520, "rear-far"], [575, 530, "body"], [440, 100, "plate-1"],
        [310, 120, "plate-2"], [555, 130, "plate-9"], [665, 245, "plate-12"],
        [845, 115, "spike-2"], [865, 175, "spike-4"], [410, 200, "back"], [288, 340, "spot-2"]
      ];
      for (const [x, y, region] of samples) {
        check(painter.regionAt({ x, y }) === region, `${x},${y} should hit ${region}, got ${painter.regionAt({ x, y })}`);
        colorAt(x, y, BASE_COLOR, `unpainted ${region}`);
      }
      const protectedPoints = [[83, 280], [82, 275], [30, 298], [50, 315], [465, 380], [476, 440]];
      for (const [x, y] of protectedPoints) check(painter.regionAt({ x, y }) === undefined, `protected hit ${x},${y}`);
      // Fill rejection includes the half-pixel guard around protected strokes.
      for (const [x, y] of [[462, 41], [300, 530], [870, 160]]) {
        check(painter.regionAt({ x, y }) === undefined, `protected outline rejects fill ${x},${y}`);
      }
      for (const [x, y] of [[0, 0], [460, 600], [919, 300], [-5, 200], [NaN, 200]]) {
        check(painter.regionAt({ x, y }) === undefined, "outside hits reject fill");
      }
      for (const size of BRUSH_SIZES) {
        for (const [x, y] of [[420, 330], [10, 303], [440, 42], [83, 280]]) {
          check(model.append(empty, dot(x, y, BASE_COLOR, size)).revision === 0, `base ${size} contact at ${x},${y} is empty`);
        }
        check(model.append(empty, dot(0, 0, COLORS[1], size)).revision === 0, "outside brush is a no-op");
        const action = dot(420, 330, COLORS[1], size);
        const work = model.append(empty, action);
        check(work.actions.length === 1 && !model.isEmpty(work), "round dot accepted once");
        check(model.append(work, action).revision === work.revision, "repeated round dot is a no-op, including antialiased edges");
        painter.render(canvas, work.actions);
        colorAt(420, 330, COLORS[1], "round dot center");
        colorAt(420 + size / 2 + 2, 330, BASE_COLOR, "round dot diameter");
        colorAt(420 + size / 2, 330 + size / 2, BASE_COLOR, "round dot corner");
      }
      const bent = { kind: "stroke", color: COLORS[1], size: 20, points: [
        { x: 380, y: 330 }, { x: 420, y: 330 }, { x: 420, y: 370 }, { x: 420, y: 370 }
      ] };
      painter.render(canvas, [bent]);
      colorAt(400, 330, COLORS[1], "continuous stroke segment");
      colorAt(374, 330, COLORS[1], "round starting cap");
      colorAt(368, 330, BASE_COLOR, "cap stays within brush radius");
      colorAt(426, 324, COLORS[1], "round outside join");
      colorAt(429, 321, BASE_COLOR, "join has no square corner");
      check(model.append(empty, dot(83, 280, COLORS[1], 8)).revision === 0, "fully protected eye contact is a no-op");
      for (const region of ARTWORK.regions) {
        check(model.append(empty, fill(region, BASE_COLOR)).revision === 0, `${region} base fill is empty`);
        check(model.append(empty, fill(region, COLORS[6])).revision === 1, `${region} has visible fillable pixels`);
      }
      painter.render(canvas, [{ kind: "stroke", color: COLORS[1], size: 20, points: [{ x: -20, y: 330 }, { x: 420, y: 330 }] }]);
      colorAt(420, 330, COLORS[1], "stroke starting outside paints its interior path");
      check(pixel(1, 330)[3] === 0, "outside start leaves no stray paint");
      const broad = { kind: "stroke", color: COLORS[2], size: 40, points: [
        { x: -30, y: 280 }, { x: 950, y: 280 }, { x: 950, y: 580 },
        { x: 10, y: 580 }, { x: 10, y: 310 }, { x: 500, y: 420 }
      ] };
      painter.render(canvas, [broad]);
      for (const [x, y] of [[1, 280], [919, 280], [500, 590], [10, 400]]) check(pixel(x, y)[3] === 0, "stroke stays clipped outside dinosaur");
      for (const [x, y] of protectedPoints) {
        const start = (y * WIDTH + x) * 4;
        check(equal(pixel(x, y), blank.slice(start, start + 4)), `protected pixels survive brushing ${x},${y}`);
      }
      // Flood every region and cross every detail, then compare opaque ink/eye pixels.
      const covered = [...ARTWORK.regions.map(region => fill(region, COLORS[6])), ...protectedPoints.map(([x, y]) => dot(x, y, COLORS[1], 40))];
      painter.render(canvas, covered);
      const coveredPixels = painter.pixels(canvas);
      for (let i = 0; i < blank.length; i += 4) {
        if (blank[i + 3] === 255 && ((blank[i] === 9 && blank[i + 1] === 30 && blank[i + 2] === 64) ||
            (blank[i] === 7 && blank[i + 1] === 9 && blank[i + 2] === 10))) {
          // Canvas compositing may round an opaque-looking edge by one channel unit.
          check(coveredPixels.slice(i, i + 4).every((value, channel) => Math.abs(value - blank[i + channel]) <= 1), `opaque outline/eye survives at pixel ${i / 4}: ${[...coveredPixels.slice(i,i+4)]}`);
        }
      }
      colorAt(82, 275, "#ffffff", "eye highlight survives all paint");
      let painted = model.append(empty, dot(420, 330));
      painted = model.append(painted, dot(310, 120, COLORS[4]));
      painted = model.append(painted, dot(288, 340, COLORS[4], 8));
      painter.render(canvas, painted.actions);
      const prior = painter.pixels(canvas);
      const filled = model.append(painted, fill("body", COLORS[6]));
      check(filled.actions.length === painted.actions.length + 1, "fill is one action");
      painter.render(canvas, filled.actions);
      colorAt(420, 330, COLORS[6], "fill replaces earlier body brush");
      colorAt(80, 302, COLORS[6], "whole head/body region filled");
      colorAt(310, 120, COLORS[4], "fill preserves neighboring plate paint");
      colorAt(288, 340, COLORS[4], "body fill preserves independent spot paint");
      colorAt(320, 530, COLORS[6], "body fill reaches connected near leg");
      colorAt(230, 510, BASE_COLOR, "body fill preserves separate far leg");
      check(model.append(filled, fill("body", COLORS[6])).revision === filled.revision, "uniform refill is a no-op");
      const continued = model.append(filled, dot(420, 330));
      painter.render(canvas, continued.actions);
      colorAt(420, 330, COLORS[1], "brush after fill remains visible");
      colorAt(400, 340, COLORS[6], "remaining region retains fill");
      const restored = model.readWork(JSON.parse(JSON.stringify(filled)));
      painter.render(canvas, model.undo(restored).actions);
      check(equal(painter.pixels(canvas), prior), "undo restored fill returns pixel-exact prior strokes in every region");
      let erased = model.newWork("erase");
      for (const [x, y] of [[420, 330], [310, 120], [288, 340]]) erased = model.append(erased, dot(x, y));
      const colored = erased;
      for (const region of ARTWORK.regions) erased = model.append(erased, fill(region, BASE_COLOR));
      check(model.isEmpty(erased) && erased.id === colored.id && erased.actions.length > colored.actions.length, "base replacement returns to empty while preserving identity/history");
      check(!model.isEmpty(model.undo(erased)), "undo base fill restores colored pixels");
      painter.render(canvas, erased.actions);
      check(equal(painter.pixels(canvas), blank), "base replacement reproduces exact unpainted pixels");
      painter.preview(canvas, painted.actions, broad);
      const preview = painter.pixels(canvas);
      painter.render(canvas, [...painted.actions, broad]);
      check(equal(painter.pixels(canvas), preview), "preview exactly matches committed rendering with protected edges");
      painter.render(canvas, painted.actions);
      check(equal(painter.pixels(canvas), prior), "discarding preview restores committed pixels exactly");
      // Live contacts cross region/fill boundaries and their own same-color
      // antialiased edges; every intermediate frame has replay's exact pixels.
      const history = [bent, fill("body", COLORS[6]), dot(288, 340), fill("plate-2", COLORS[4]), bent];
      for (const [width, height] of [[WIDTH, HEIGHT], [276, 186], [WIDTH * 2, HEIGHT * 2]]) {
        const live = painter.canvas(width, height), replay = painter.canvas(width, height);
        for (const size of BRUSH_SIZES) {
          const active = { kind: "stroke", color: COLORS[1], size, points: [] };
          const samples = [
            ...bent.points, { x: 380, y: 330 }, { x: 83, y: 280 }, { x: -30, y: 280 },
            { x: 440.3, y: 42.7 }, { x: 310, y: 120 }, { x: 288, y: 340 },
            { x: 476.2, y: 440.6 }, { x: 950, y: 580 }, { x: 575, y: 530 }
          ];
          for (const point of samples) {
            active.points.push(point);
            painter.preview(live, history, active);
            painter.render(replay, [...history, active]);
            check(equal(painter.pixels(live), painter.pixels(replay)), `incremental preview equals replay at ${width}x${height}, size ${size}, point ${active.points.length}`);
            // Inspection and thumbnails share the painter but cannot invalidate
            // another target's live geometry or cached fill layers.
            painter.render(painter.canvas(92, 62), history);
          }
          painter.render(live, history);
          painter.render(replay, history);
          check(equal(painter.pixels(live), painter.pixels(replay)), "cancel drops every live capsule");
          painter.preview(live, history.slice(0, -1), active);
          painter.render(replay, [...history.slice(0, -1), active]);
          check(equal(painter.pixels(live), painter.pixels(replay)), "changed history rebuilds cached layers after undo");
          live.width = 460; live.height = 310;
          painter.preview(live, history, active);
          replay.width = 460; replay.height = 310;
          painter.render(replay, [...history, active]);
          check(equal(painter.pixels(live), painter.pixels(replay)), "resized preview uses its target's coordinate scale");
          live.width = width; live.height = height; replay.width = width; replay.height = height;
        }
      }
      const large = painter.canvas(WIDTH * 2, HEIGHT * 2);
      painter.render(large, filled.actions);
      check(equal([...large.getContext("2d").getImageData(840, 660, 1, 1).data], rgb(COLORS[6])), "DPR rendering preserves artwork coordinates");
      painter.render(canvas, filled.actions);
      check(painter.regionAt({ x: 420, y: 330 }) === "body", "hit testing stays in saved coordinates after DPR rendering");
      window.productionCanvas = canvas;
      document.body.append(canvas);
      return "PASS production coloring: design geometry, hits, clipped round strokes, no-ops/base, protected details, fill/undo, replay, incremental preview, interleaved thumbnails and DPR pixels";
    }));
    console.log(await page.evaluate(async () => {
      const { STEGOSAURUS, STEGOSAURUS_EXPLORER, BASE_COLOR, VECTOR_SCALE, WIDTH, HEIGHT, createPainter } = await import("/harness.js");
      const base = [...BASE_COLOR.slice(1).match(/../g).map(byte => parseInt(byte, 16)), 255];
      const fill = [239, 83, 80, 255];
      const shape = node => {
        if ("path" in node) return `<path d="${node.path}" transform="translate(${node.x} ${node.y})"/>`;
        return `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" transform="translate(${node.x} ${node.y}) rotate(${-node.rotation} ${node.width / 2} ${node.height / 2})"/>`;
      };
      for (const geometry of [STEGOSAURUS, STEGOSAURUS_EXPLORER]) {
        const painter = createPainter(() => document.createElement("canvas"), geometry), canvas = painter.canvas();
        painter.render(canvas, []);
        const blank = painter.pixels(canvas);
        const defs = geometry.regions.map(region => `<clipPath id="${region.id}">${shape(region)}</clipPath>`).join("");
        for (const region of geometry.regions) {
          const paths = geometry.regions.map(node => {
            let drawing = `<g fill="${node.id === region.id ? "white" : "black"}">${shape(node)}</g>`, parent = node.parent;
            while (parent) {
              drawing = `<g clip-path="url(#${parent})">${drawing}</g>`;
              parent = geometry.regions.find(node => node.id === parent).parent;
            }
            return drawing;
          }).join("");
          const image = new Image();
          image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs>${defs}</defs><g transform="scale(${VECTOR_SCALE})">${paths}</g></svg>`)}`;
          await image.decode();
          const mask = painter.canvas(), ctx = mask.getContext("2d"); ctx.drawImage(image, 0, 0);
          const ownership = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
          painter.render(canvas, [{ kind: "fill", region: region.id, color: "#ef5350" }]);
          const painted = painter.pixels(canvas);
          let eligible = 0;
          for (let offset = 0; offset < blank.length; offset += 4) {
            // Fully owned, base-colored pixels exclude ink, protected details
            // and partially covered antialiased boundaries.
            if (ownership[offset] !== 255 || ownership[offset + 3] !== 255 ||
                !base.every((channel, index) => blank[offset + index] === channel)) continue;
            eligible++;
            if (!fill.every((channel, index) => Math.abs(painted[offset + index] - channel) <= 1)) {
              throw new Error(`${geometry.artwork.version}/${region.id}: incomplete fill at ${offset / 4 % WIDTH},${Math.floor(offset / 4 / WIDTH)}`);
            }
          }
          if (!eligible) throw new Error(`${geometry.artwork.version}/${region.id}: no visible interior checked`);
        }
      }
      return "PASS complete fills: every opaque base interior in both Stegosaurus variants";
    }));
    if (process.env.COLORING_SCREENSHOT) await page.screenshot({ path: process.env.COLORING_SCREENSHOT });
  } finally { if (browser) await browser.close(); }
})().catch(error => {
  console.error(error);
  console.error(`FAIL production coloring: ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
});
