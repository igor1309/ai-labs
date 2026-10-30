import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ARTWORK, DETAILS, HEIGHT, REGIONS, VECTOR_SCALE, WIDTH, type VectorShape } from "../src/coloring/geometry.ts";

function shape(node: VectorShape, attributes: string) {
  const transform = `translate(${node.x} ${node.y})`;
  if ("path" in node) return `<path d="${node.path}" transform="${transform}" ${attributes}/>`;
  return `<ellipse cx="${node.width / 2}" cy="${node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}"
    transform="${transform} rotate(${-node.rotation} ${node.width / 2} ${node.height / 2})" ${attributes}/>`;
}

async function illustration() {
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
