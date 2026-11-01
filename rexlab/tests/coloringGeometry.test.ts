import { artworkFor } from "../src/coloring/artworks.ts";
import { MOSASAURUS_HATCHLING, MOSASAURUS_EXPLORER } from "../src/coloring/mosasaurusScene.ts";
import { mosasaurusHatchlingProbes, mosasaurusExplorerProbes } from "./mosasaurusSceneProbes.ts";
import { TREX_HATCHLING, TREX_EXPLORER } from "../src/coloring/trexScene.ts";
import { trexHatchlingProbes, trexExplorerProbes } from "./trexSceneProbes.ts";
import { ANKYLOSAURUS_HATCHLING, ANKYLOSAURUS_EXPLORER } from "../src/coloring/ankylosaurusScene.ts";
import { ankylosaurusHatchlingProbes, ankylosaurusExplorerProbes } from "./ankylosaurusSceneProbes.ts";
import { ANKYLOSAURUS } from "../src/coloring/ankylosaurus.ts";
import { ankylosaurusProbes } from "./ankylosaurusProbes.ts";
import { TRICERATOPS_EXPLORER } from "../src/coloring/triceratopsExplorer.ts";
import { STEGOSAURUS_EXPLORER } from "../src/coloring/stegosaurusExplorer.ts";
import { stegosaurusExplorerProbes } from "./stegosaurusExplorerProbes.ts";
import { explorerProbes } from "./triceratopsExplorerProbes.ts";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TRICERATOPS } from "../src/coloring/triceratops.ts";
import { ARTWORK, DETAILS, HEIGHT, REGIONS, VECTOR_SCALE, WIDTH, STEGOSAURUS, type Geometry, type VectorShape } from "../src/coloring/geometry.ts";

function shape(node: VectorShape, attributes: string) {
  const transform = `translate(${node.x} ${node.y})`;
  if ("path" in node) return `<path d="${node.path}" transform="${transform}" ${attributes}/>`;
  return `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}"
    transform="${transform} rotate(${-node.rotation} ${node.width / 2} ${node.height / 2})" ${attributes}/>`;
}

async function illustration(geometry: Geometry = STEGOSAURUS, filled?: string, mask = false) {
  const { regions: REGIONS, details: DETAILS } = geometry;
  const defs = REGIONS.map(region => `<clipPath id="${region.id}">${shape(region, "")}</clipPath>`).join("");
  const regions = REGIONS.map(region => {
    const fill = mask ? (region.id === filled ? "#ffffff" : "#000000") : (region.id === filled ? "#ef5350" : "#fff0cf");
    const drawing = shape(region, `fill="${fill}" stroke="${mask ? "none" : "#091e40"}" stroke-width="${region.outline}"`);
    let parent = region.parent, result = drawing;
    while (parent) {
      result = `<g clip-path="url(#${parent})">${result}</g>`;
      parent = REGIONS.find(node => node.id === parent)?.parent;
    }
    return result;
  }).join("");
  const details = mask ? "" : DETAILS.map(detail => shape(detail, `fill="${detail.fill ?? "none"}" stroke="${detail.stroke ?? "none"}" stroke-width="${detail.strokeWidth ?? 0}"`)).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <g transform="scale(${VECTOR_SCALE})" stroke-linecap="round" stroke-linejoin="round"><defs>${defs}</defs>${regions}${details}</g></svg>`)).ensureAlpha().raw().toBuffer();
}

describe("T-Rex workshop scenes", () => {
  it.each([
    [TREX_HATCHLING, "trex-hatchling-1", trexHatchlingProbes],
    [TREX_EXPLORER, "trex-explorer-1", trexExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(geometry.artwork.version).toBe(version);
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    expect(geometry.regions.filter(({ id }) => id.startsWith("arm-")).map(({ id }) => id)).toEqual(["arm-far", "arm-near"]);
    expect(geometry.regions.filter(({ id }) => id.startsWith("leg-")).map(({ id }) => id)).toEqual(["leg-far", "leg-near"]);
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(1.7);
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
      const visited = new Set([region.id]);
      let parent = region.parent;
      while (parent) {
        expect(visited.has(parent), `${region.id} has no parent cycle`).toBe(false);
        visited.add(parent);
        const container = geometry.regions.find(({ id }) => id === parent);
        expect(container).toBeDefined();
        parent = container?.parent;
      }
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === TREX_HATCHLING ? [] : [
        ["tail-mark", "tail"], ["belly", "body"], ["back-mark", "body"], ["thigh-mark", "leg-near"], ["rock-face", "rock"]
      ]
    );
  });

  it.each([
    ["Hatchling", TREX_HATCHLING, trexHatchlingProbes],
    ["Explorer", TREX_EXPLORER, trexExplorerProbes]
  ] as const)("keeps every %s animal and landscape target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(TREX_EXPLORER.regions.length).toBeGreaterThan(TREX_HATCHLING.regions.length * 2);
    expect(TREX_HATCHLING.artwork.regions).not.toContain("belly");
  });
});

describe("Mosasaurus workshop scenes", () => {
  it.each([
    [MOSASAURUS_HATCHLING, "mosasaurus-hatchling-1", mosasaurusHatchlingProbes],
    [MOSASAURUS_EXPLORER, "mosasaurus-explorer-1", mosasaurusExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(geometry.artwork.version).toBe(version);
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    expect(geometry.regions.filter(({ id }) => id.startsWith("flipper-")).map(({ id }) => id)).toEqual(
      ["flipper-far-back", "flipper-far-front", "flipper-near-back", "flipper-near-front"]);
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(1.7);
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === MOSASAURUS_HATCHLING ? [] : [
        ["rock-face", "rock"], ["tail-mark", "tail"], ["belly", "body"], ["back-mark", "body"], ["head-mark", "head"]
      ]
    );
  });

  it.each([
    ["Hatchling", MOSASAURUS_HATCHLING, mosasaurusHatchlingProbes],
    ["Explorer", MOSASAURUS_EXPLORER, mosasaurusExplorerProbes]
  ] as const)("keeps every %s animal and sea target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(MOSASAURUS_EXPLORER.regions.length).toBeGreaterThan(MOSASAURUS_HATCHLING.regions.length * 1.8);
    expect(MOSASAURUS_HATCHLING.artwork.regions).not.toContain("water");
  });
});

describe("production dinosaur vectors", () => {
  it("preserves the design silhouette, four feet, staggered plates and long spiked tail", async () => {
    const actual = await illustration();
    const reference = await sharp(await readFile(new URL("../design/images/colour/SNc97.png", import.meta.url))).ensureAlpha().raw().toBuffer();
    let intersection = 0, union = 0;
    for (let i = 3; i < actual.length; i += 4) {
      const a = actual[i]! >= 128, b = reference[i]! >= 128;
      if (a && b) intersection++;
      if (a || b) union++;
    }
    expect(intersection / union).toBeGreaterThan(0.985);
    const pixel = (x: number, y: number) => [...actual.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
    for (const [x, y] of [[230, 510], [300, 530], [440, 520], [575, 530], [440, 100], [845, 115], [870, 160]]) {
      expect(pixel(x!, y!)[3], `design landmark ${x},${y}`).toBe(255);
    }
    for (const [x, y] of [[320, 530], [865, 175]]) {
      expect(pixel(x!, y!), `fillable interior ${x},${y}`).toEqual([255, 240, 207, 255]);
    }
    expect(pixel(83, 280)).toEqual([7, 9, 10, 255]);
    expect(pixel(82, 275)).toEqual([255, 255, 255, 255]);
    expect(pixel(460, 600)[3]).toBe(0);
  });

  it("has stable unique fill identities and acyclic containing regions", () => {
    expect(ARTWORK.version).toBe("stegosaurus-production-1");
    expect(new Set(ARTWORK.regions).size).toBe(REGIONS.length);
    expect(ARTWORK.regions).toContain("body");
    expect(REGIONS.filter(region => region.id.startsWith("plate-"))).toHaveLength(15);
    expect(REGIONS.filter(region => region.id.startsWith("spike-"))).toHaveLength(4);
    for (const region of REGIONS) {
      let parent = region.parent;
      const visited = new Set([region.id]);
      while (parent) {
        expect(visited.has(parent)).toBe(false); visited.add(parent);
        const container = REGIONS.find(candidate => candidate.id === parent);
        expect(container, `${region.id} container`).toBeDefined();
        parent = container?.parent;
      }
    }
  });
});

describe("Explorer Stegosaurus scene", () => {
  it("keeps every visible region independently fillable with protected ink and no mask leaks", async () => {
    const geometry = STEGOSAURUS_EXPLORER;
    expect(geometry.artwork.version).toBe("stegosaurus-explorer-1");
    expect(geometry.artwork.regions).toEqual(stegosaurusExplorerProbes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    expect(geometry.regions.filter(region => /^plate-\d+$/.test(region.id))).toHaveLength(8);
    expect(geometry.regions.filter(region => region.id.startsWith("plate-panel-"))).toHaveLength(4);
    expect(geometry.regions.filter(region => region.id.startsWith("spike-"))).toHaveLength(4);
    expect(geometry.regions.filter(region => /^(rear|front)-(near|far)$/.test(region.id))).toHaveLength(4);
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(2);
      if ("path" in region) expect(region.path).toMatch(/Z$/);
      if (region.parent) {
        const parent = geometry.regions.find(candidate => candidate.id === region.parent);
        expect(parent).toBeDefined(); expect(parent!.parent).toBeUndefined();
      }
    }
    const actual = await illustration(geometry);
    const pixel = (image: Buffer, x: number, y: number) => [...image.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
    for (const [x, y, id] of stegosaurusExplorerProbes) {
      expect(pixel(actual, x, y), id).toEqual([255, 240, 207, 255]);
    }
    // The eye, smile, foot creases and landscape outlines stay above paint.
    for (const [x, y] of [[151, 382], [118, 420], [384, 544], [28, 570], [468, 84]]) {
      expect(pixel(actual, x!, y!)).toEqual([9, 30, 64, 255]);
    }
    for (const [index, [, , id]] of stegosaurusExplorerProbes.entries()) {
      const painted = await illustration(geometry, id);
      const mask = await illustration(geometry, id, true);
      for (const [other, [x, y, sample]] of stegosaurusExplorerProbes.entries()) {
        expect(pixel(painted, x, y), `${id} at ${sample}`).toEqual(index === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
        expect(pixel(mask, x, y), `${id} mask at ${sample}`).toEqual(index === other ? [255, 255, 255, 255] : [0, 0, 0, 255]);
      }
      let leaked = 0, erasedInk = 0, changed = 0;
      for (let offset = 0; offset < actual.length; offset += 4) {
        // The paint inspector treats a one-channel-unit rounding difference
        // at antialiased edges as unchanged, rather than erased ink.
        const differs = [0, 1, 2, 3].some(channel => Math.abs(actual[offset + channel]! - painted[offset + channel]!) > 1);
        if (!differs) continue;
        changed++;
        if (mask[offset] === 0) leaked++;
        if (actual[offset] === 9 && actual[offset + 1] === 30 && actual[offset + 2] === 64 && actual[offset + 3] === 255) erasedInk++;
      }
      expect(changed, `${id} visible fill area`).toBeGreaterThan(100);
      expect(leaked, `${id} outside visible mask`).toBe(0);
      expect(erasedInk, `${id} retained outlines and details`).toBe(0);
    }
    for (let x = 0; x < WIDTH; x++) {
      expect(pixel(actual, x, 0)[3]).toBe(0); expect(pixel(actual, x, HEIGHT - 1)[3]).toBe(0);
    }
    for (let y = 0; y < HEIGHT; y++) {
      expect(pixel(actual, 0, y)[3]).toBe(0); expect(pixel(actual, WIDTH - 1, y)[3]).toBe(0);
    }
  });
});


describe("Triceratops vectors", () => {
  it("has three independently fillable horns, a broad frill, large regions and stable identities", () => {
    expect(TRICERATOPS.artwork.version).toBe("triceratops-production-1");
    expect(TRICERATOPS.regions.filter(region => region.id.startsWith("horn-")).map(region => region.id)).toEqual(["horn-far", "horn-near", "horn-nose"]);
    expect(TRICERATOPS.artwork.regions).toEqual(TRICERATOPS.regions.map(region => region.id));
    expect(new Set(TRICERATOPS.artwork.regions).size).toBe(TRICERATOPS.regions.length);
    for (const id of ["body", "belly", "frill", "head", "rear-near", "front-near"]) {
      expect(TRICERATOPS.artwork.regions).toContain(id);
    }
    for (const region of TRICERATOPS.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(2);
      if ("path" in region) expect(region.path).toMatch(/Z$/);
      if (region.parent) expect(region.parent).toBe("body");
    }
  });

  it("keeps its silhouette and thick outlines inside the shared landscape coordinate space", async () => {
    const actual = await illustration(TRICERATOPS);
    const pixel = (x: number, y: number) => [...actual.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
    for (const [x, y] of [[280, 360], [440, 400], [600, 280], [720, 400], [730, 250], [790, 290], [858, 354]]) {
      expect(pixel(x!, y!), `fillable interior ${x},${y}`).toEqual([255, 240, 207, 255]);
    }
    expect(pixel(746, 370)).toEqual([9, 30, 64, 255]);
    for (let x = 0; x < WIDTH; x++) {
      expect(pixel(x, 0)[3]).toBe(0); expect(pixel(x, HEIGHT - 1)[3]).toBe(0);
    }
    for (let y = 0; y < HEIGHT; y++) {
      expect(pixel(0, y)[3]).toBe(0); expect(pixel(WIDTH - 1, y)[3]).toBe(0);
    }
  });
});


describe("Explorer Triceratops scene", () => {
  it("provides a visible enclosed touch interior for every animal and landscape region", async () => {
    const geometry = TRICERATOPS_EXPLORER;
    expect(geometry.artwork.version).toBe("triceratops-explorer-1");
    expect(geometry.artwork.regions).toEqual(explorerProbes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    expect(geometry.regions.filter(region => region.id.startsWith("horn-")).map(region => region.id)).toEqual(["horn-far", "horn-near", "horn-nose"]);
    expect(geometry.regions.length).toBeGreaterThan(TRICERATOPS.regions.length * 2);
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(2);
      if ("path" in region) expect(region.path).toMatch(/Z$/);
      if (region.parent) {
        const parent = geometry.regions.find(candidate => candidate.id === region.parent);
        expect(parent).toBeDefined(); expect(parent!.parent).toBeUndefined();
      }
    }
    const actual = await illustration(geometry);
    const pixel = (x: number, y: number) => [...actual.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
    for (const [x, y, id] of explorerProbes) {
      expect(pixel(x, y), id).toEqual([255, 240, 207, 255]);
    }
    for (const [index, [, , id]] of explorerProbes.entries()) {
      const painted = await illustration(geometry, id);
      for (const [other, [x, y, sample]] of explorerProbes.entries()) {
        const offset = (y * WIDTH + x) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${sample}`).toEqual(index === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    for (let x = 0; x < WIDTH; x++) {
      expect(pixel(x, 0)[3]).toBe(0); expect(pixel(x, HEIGHT - 1)[3]).toBe(0);
    }
    for (let y = 0; y < HEIGHT; y++) {
      expect(pixel(0, y)[3]).toBe(0); expect(pixel(WIDTH - 1, y)[3]).toBe(0);
    }
  });
});

describe("Ankylosaurus vectors", () => {
  it("encloses broad armor panels, four short legs and a separate club inside the landscape canvas", async () => {
    const geometry = ANKYLOSAURUS;
    expect(geometry.artwork.version).toBe("ankylosaurus-production-1");
    expect(geometry.artwork.regions).toEqual(ankylosaurusProbes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(2.5);
      if ("path" in region) expect(region.path).toMatch(/Z$/);
      if (region.parent) {
        const parent = geometry.regions.find(candidate => candidate.id === region.parent);
        expect(parent).toBeDefined();
        expect(parent!.parent).toBeUndefined();
      }
    }
    const blank = await illustration(geometry);
    for (const [index, [, , id]] of ankylosaurusProbes.entries()) {
      const painted = await illustration(geometry, id);
      for (const [other, [x, y, sample]] of ankylosaurusProbes.entries()) {
        const offset = (y * WIDTH + x) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${sample}`).toEqual(index === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
      let interior = 0;
      for (let i = 0; i < painted.length; i += 4) {
        if (painted[i] === 239 && painted[i + 1] === 83 && painted[i + 2] === 80 && painted[i + 3] === 255) interior++;
      }
      expect(interior, `${id} touch area`).toBeGreaterThan(id.startsWith("armor-") ? 3000 : 800);
    }
    for (let x = 0; x < WIDTH; x++) {
      expect(blank[x * 4 + 3]).toBe(0);
      expect(blank[((HEIGHT - 1) * WIDTH + x) * 4 + 3]).toBe(0);
    }
    for (let y = 0; y < HEIGHT; y++) {
      expect(blank[y * WIDTH * 4 + 3]).toBe(0);
      expect(blank[(y * WIDTH + WIDTH - 1) * 4 + 3]).toBe(0);
    }
  });
});


describe("Ankylosaurus prehistoric scenes", () => {
  it("resolves the archived artwork and both new versions without substituting saved regions", () => {
    for (const geometry of [ANKYLOSAURUS, ANKYLOSAURUS_HATCHLING, ANKYLOSAURUS_EXPLORER]) {
      expect(artworkFor(geometry.artwork.version).geometry).toBe(geometry);
      expect(artworkFor(geometry.artwork.version).names).toEqual({ en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" });
    }
    expect(ANKYLOSAURUS_HATCHLING.artwork.version).toBe("ankylosaurus-hatchling-2");
    expect(ANKYLOSAURUS_EXPLORER.artwork.version).toBe("ankylosaurus-explorer-1");
    expect(ANKYLOSAURUS_EXPLORER.artwork.regions).toEqual(expect.arrayContaining([
      "river", "ridge-face", "club-lobe"
    ]));
    expect(ANKYLOSAURUS_HATCHLING.artwork.regions).not.toContain("cheek-scale");
  });

  it.each([
    ["Hatchling", ANKYLOSAURUS_HATCHLING, ankylosaurusHatchlingProbes, 12, 1200],
    ["Explorer", ANKYLOSAURUS_EXPLORER, ankylosaurusExplorerProbes, 17, 1000]
  ] as const)("keeps every %s shield, limb, horn and scenery region visible and independently colorable", async (_, geometry, probes, shields, minimumShieldArea) => {
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    expect(geometry.regions.filter(({ id }) => id.startsWith("scute-"))).toHaveLength(shields);
    expect(geometry.regions.filter(({ id }) => /^(rear|front)-(near|far)$/.test(id))).toHaveLength(4);
    expect(geometry.artwork.regions).toEqual(expect.arrayContaining([
      "tail", "tail-club", "body", "head", "beak", "cheek-horn", "fern-left-1", "fern-right-3", "distant-ridge"
    ]));
    for (const region of geometry.regions) {
      if ("path" in region) expect(region.path).toMatch(/Z$/);
      const visited = new Set([region.id]);
      let parent = region.parent;
      while (parent) {
        expect(visited.has(parent)).toBe(false);
        visited.add(parent);
        const container = geometry.regions.find(({ id }) => id === parent);
        expect(container).toBeDefined();
        parent = container?.parent;
      }
    }
    const blank = await illustration(geometry);
    const pixel = (x: number, y: number) => [...blank.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];
    expect(pixel(737, 400)).toEqual([9, 30, 64, 255]);
    expect(pixel(732, 392)).toEqual([255, 255, 255, 255]);
    for (const [index, [, , id]] of probes.entries()) {
      const painted = await illustration(geometry, id);
      const mask = await illustration(geometry, id, true);
      for (const [other, [x, y, sample]] of probes.entries()) {
        const offset = (y * WIDTH + x) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${sample}`).toEqual(index === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
      let interior = 0;
      let minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0;
      let changedInk = 0, leaks = 0, outsideMask = 0;
      for (let i = 0; i < painted.length; i += 4) {
        if (painted[i] === 239 && painted[i + 1] === 83 && painted[i + 2] === 80 && painted[i + 3] === 255) interior++;
        const differs = [0, 1, 2, 3].some(channel => Math.abs(painted[i + channel]! - blank[i + channel]!) > 1);
        if (differs && mask[i] === 0) outsideMask++;
        if (blank[i] === 9 && blank[i + 1] === 30 && blank[i + 2] === 64 && blank[i + 3] === 255) {
          if (differs) changedInk++;
        }
        if (blank[i + 3] === 0 && painted[i + 3] !== 0) leaks++;
      }
      expect(changedInk, `${id} preserves every ink pixel`).toBe(0);
      expect(leaks, `${id} stays inside silhouette`).toBe(0);
      expect(outsideMask, `${id} stays inside its visible region`).toBe(0);
      for (let i = 0; i < painted.length; i += 4) {
        if (painted[i] === 239 && painted[i + 1] === 83 && painted[i + 2] === 80 && painted[i + 3] === 255) {
          const x = (i / 4) % WIDTH, y = Math.floor(i / 4 / WIDTH);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      expect(maxX - minX, `${id} interior width`).toBeGreaterThanOrEqual(24);
      expect(maxY - minY, `${id} interior height`).toBeGreaterThanOrEqual(24);
      const primary = /^(tail|tail-club|head|(rear|front)-(near|far))$/.test(id);
      expect(interior, `${id} visible colorable area`).toBeGreaterThan(id.startsWith("scute-") ? minimumShieldArea : primary ? 2000 : 1000);
    }
    for (let x = 0; x < WIDTH; x++) {
      expect(pixel(x, 0)[3]).toBe(0); expect(pixel(x, HEIGHT - 1)[3]).toBe(0);
    }
    for (let y = 0; y < HEIGHT; y++) {
      expect(pixel(0, y)[3]).toBe(0); expect(pixel(WIDTH - 1, y)[3]).toBe(0);
    }
  });
});
