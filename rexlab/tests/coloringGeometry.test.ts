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

async function illustration(geometry: Geometry = STEGOSAURUS) {
  const { regions: REGIONS, details: DETAILS } = geometry;
  const defs = REGIONS.map(region => `<clipPath id="${region.id}">${shape(region, "")}</clipPath>`).join("");
  const regions = REGIONS.map(region => {
    const drawing = shape(region, `fill="#fff0cf" stroke="#091e40" stroke-width="${region.outline}"`);
    let parent = region.parent, result = drawing;
    while (parent) {
      result = `<g clip-path="url(#${parent})">${result}</g>`;
      parent = REGIONS.find(node => node.id === parent)?.parent;
    }
    return result;
  }).join("");
  const details = DETAILS.map(detail => shape(detail, `fill="${detail.fill ?? "none"}" stroke="${detail.stroke ?? "none"}" stroke-width="${detail.strokeWidth ?? 0}"`)).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <g transform="scale(${VECTOR_SCALE})" stroke-linecap="round" stroke-linejoin="round"><defs>${defs}</defs>${regions}${details}</g></svg>`)).ensureAlpha().raw().toBuffer();
}

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
