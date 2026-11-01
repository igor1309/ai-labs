// Contract test: Mosasaurus geometry, hit targets and Canvas 2D rasterization in Chromium.
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { resolve } = require("node:path");

module.exports = async function mosasaurusScenes(page) {
  const output = process.env.MOSASAURUS_SCREENSHOTS || "/tmp/lab-897/browser";
  await mkdir(output, { recursive: true });
  for (const version of ["mosasaurus-hatchling-1", "mosasaurus-explorer-1"]) {
    await page.evaluate(async version => {
      const { artworkFor, createPainter, COLORS } = await import("/harness.js");
      document.body.replaceChildren();
      document.body.style.cssText = "margin:0;display:grid;place-items:center;min-height:100vh;background:#fff9ec";
      const geometry = artworkFor(version).geometry;
      const painter = createPainter(() => document.createElement("canvas"), geometry);
      const canvas = painter.canvas();
      canvas.style.cssText = "display:block;width:min(100vw,148.387vh);height:auto";
      document.body.append(canvas);
      const colors = { sand: COLORS[3], tail: COLORS[6], body: COLORS[6], head: COLORS[6], "tail-fin": COLORS[5],
        "flipper-near-front": COLORS[5], "flipper-near-back": COLORS[5], "flipper-far-front": COLORS[7], "flipper-far-back": COLORS[7],
        belly: COLORS[3], "back-mark": COLORS[7], "tail-mark": COLORS[7], "head-mark": COLORS[7],
        sky: COLORS[3], water: COLORS[5], "fish-top": COLORS[2], "fish-low": COLORS[1],
        ammonite: COLORS[10], rock: COLORS[10], "rock-face": COLORS[2] };
      window.mosasaurusRender = painted => painter.render(canvas, painted ? geometry.regions.map(({ id }) =>
        ({ kind: "fill", region: id, color: colors[id] || COLORS[5] })) : []);
      window.mosasaurusRender(false);
    }, version);
    for (const [width, height] of [[1024, 768], [1180, 820], [1366, 1024], [1024, 600]]) {
      await page.setViewportSize({ width, height });
      const box = await page.locator("canvas").boundingBox();
      assert(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
        `${version} fits ${width} × ${height}`);
      await page.screenshot({ path: resolve(output, `${version}-${width}x${height}-unpainted.png`) });
      await page.evaluate(() => window.mosasaurusRender(true));
      await page.screenshot({ path: resolve(output, `${version}-${width}x${height}-painted.png`) });
      await page.evaluate(() => window.mosasaurusRender(false));
    }
  }
  const failures = [];
  for (const version of ["mosasaurus-hatchling-1", "mosasaurus-explorer-1"]) {
    try {
      console.log(await page.evaluate(async version => {
        const { artworkFor, createPainter, WIDTH, HEIGHT, VECTOR_SCALE, BASE_COLOR,
          mosasaurusHatchlingProbes, mosasaurusExplorerProbes, mosasaurusProtectedProbes } = await import("/harness.js");
        const geometry = artworkFor(version).geometry;
        const probes = version === "mosasaurus-hatchling-1" ? mosasaurusHatchlingProbes : mosasaurusExplorerProbes;
        const check = (value, message) => { if (!value) throw new Error(`${version}: ${message}`); };
        const painter = createPainter(() => document.createElement("canvas"), geometry), canvas = painter.canvas();
        const rgb = color => [...color.slice(1).match(/../g).map(byte => parseInt(byte, 16)), 255];
        const base = rgb(BASE_COLOR), red = rgb("#ef5350");
        const pixelEquals = (pixels, x, y, expected) => expected.every((v, i) => pixels[(y * WIDTH + x) * 4 + i] === v);
        painter.render(canvas, []);
        const blank = painter.pixels(canvas);
        check(JSON.stringify(probes.map(([, , id]) => id)) === JSON.stringify(geometry.artwork.regions), "every region has an independent landmark");
        const incorrect = probes.filter(([x, y, id]) => painter.regionAt({ x, y }) !== id || !pixelEquals(blank, x, y, base));
        check(!incorrect.length, `interior landmarks: ${JSON.stringify(incorrect.map(([x, y, id]) => ({ id, x, y, hit: painter.regionAt({ x, y }) })))}`);
        const unprotected = mosasaurusProtectedProbes.filter(([x, y]) => painter.regionAt({ x, y }) !== undefined);
        check(!unprotected.length, `protected landmarks: ${JSON.stringify(unprotected)}`);
        // An independent SVG ownership mask proves fills beyond the chosen landmarks.
        const shape = node => `<path d="${node.path}" transform="translate(${node.x} ${node.y})"/>`;
        const defs = geometry.regions.map(node => `<clipPath id="${node.id}">${shape(node)}</clipPath>`).join("");
        const smallTargets = [];
        for (const [, , id] of probes) {
          const paths = geometry.regions.map(node => {
            let drawing = `<g fill="${node.id === id ? "white" : "black"}">${shape(node)}</g>`, parent = node.parent;
            while (parent) {
              drawing = `<g clip-path="url(#${parent})">${drawing}</g>`;
              parent = geometry.regions.find(node => node.id === parent).parent;
            }
            return drawing;
          }).join("");
          const image = new Image();
          image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><g transform="scale(${VECTOR_SCALE})"><defs>${defs}</defs>${paths}</g></svg>`)}`;
          await image.decode();
          const mask = painter.canvas(), ctx = mask.getContext("2d"); ctx.drawImage(image, 0, 0);
          const ownership = painter.pixels(mask);
          painter.render(canvas, [{ kind: "fill", region: id, color: "#ef5350" }]);
          const painted = painter.pixels(canvas);
          for (const [px, py, other] of probes) check(pixelEquals(painted, px, py, other === id ? red : base), `${id} fills independently of ${other}`);
          let area = 0, minX = WIDTH, maxX = 0, minY = HEIGHT, maxY = 0, largestPatch = 0;
          const squares = new Uint16Array(WIDTH * HEIGHT);
          for (let offset = 0; offset < blank.length; offset += 4) {
            const differs = [0, 1, 2, 3].some(i => Math.abs(painted[offset + i] - blank[offset + i]) > 1);
            if (differs) check(ownership[offset] !== 0, `${id} cannot paint outside its visible mask at ${offset / 4}`);
            if (ownership[offset] === 255 && ownership[offset + 3] === 255 && base.every((v, i) => blank[offset + i] === v)) {
              check(red.every((v, i) => Math.abs(painted[offset + i] - v) <= 1), `${id} fills every opaque base interior`);
              area++;
              const px = offset / 4 % WIDTH, py = Math.floor(offset / 4 / WIDTH);
              minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
              const i = offset / 4;
              squares[i] = 1 + (px && py ? Math.min(squares[i - 1], squares[i - WIDTH], squares[i - WIDTH - 1]) : 0);
              largestPatch = Math.max(largestPatch, squares[i]);
            }
          }
          const primary = /^(head|body|tail)$/.test(id);
          if (area <= (primary ? 2000 : 1000)) smallTargets.push(`${id} visible area: ${area}`);
          if (maxX - minX < 24 || maxY - minY < 24) smallTargets.push(`${id} interior spans: ${maxX - minX},${maxY - minY}`);
          // A solid two-dimensional patch excludes long, hair-thin targets.
          if (largestPatch < (primary ? 40 : 24)) smallTargets.push(`${id} solid tap patch: ${largestPatch}`);
        }
        check(!smallTargets.length, `generous targets: ${smallTargets.join("; ")}`);
        const covered = geometry.artwork.regions.map(region => ({ kind: "fill", region, color: "#ef5350" }));
        covered.push(...mosasaurusProtectedProbes.map(([x, y]) => ({ kind: "stroke", color: "#42a5f5", size: 40, points: [{ x, y }] })));
        painter.render(canvas, covered);
        const painted = painter.pixels(canvas);
        for (let offset = 0; offset < blank.length; offset += 4) {
          const ink = blank[offset] === 9 && blank[offset + 1] === 30 && blank[offset + 2] === 64 && blank[offset + 3] === 255;
          const highlight = blank[offset] === 255 && blank[offset + 1] === 255 && blank[offset + 2] === 255 && blank[offset + 3] === 255;
          if (ink || highlight) check([0, 1, 2, 3].every(i => Math.abs(blank[offset + i] - painted[offset + i]) <= 1), `ink and eye highlights survive at ${offset / 4}`);
          if (blank[offset + 3] === 0) check(painted[offset + 3] === 0, "brush stays inside the scene");
        }
        for (let x = 0; x < WIDTH; x++) check(blank[x * 4 + 3] === 0 && blank[((HEIGHT - 1) * WIDTH + x) * 4 + 3] === 0, "top/bottom margin");
        for (let y = 0; y < HEIGHT; y++) check(blank[y * WIDTH * 4 + 3] === 0 && blank[(y * WIDTH + WIDTH - 1) * 4 + 3] === 0, "left/right margin");
        return `PASS ${version}: ${probes.length} independent complete fills, broad tap targets, protected ink/eyes, clipped brush and scene margins`;
      }, version));
    } catch (error) { failures.push(error.message); }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log("PASS Mosasaurus rendered screenshots: both scenes, unpainted/painted, four tablet landscape viewports");
};
