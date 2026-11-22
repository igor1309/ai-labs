import { artworkFor } from "../src/coloring/artworks.ts";
import { SPINOSAURUS_HATCHLING, SPINOSAURUS_EXPLORER_1 } from "../src/coloring/spinosaurusScene.ts";
import { SPINOSAURUS_EXPLORER_3 } from "../src/coloring/spinosaurusExplorer.ts";
import { SPINOSAURUS_EXPLORER } from "../src/coloring/spinosaurusExplorer4.ts";
import { SPINOSAURUS_EXPLORER_2 } from "../src/coloring/spinosaurusExplorer2.ts";
import { spinosaurusHatchlingProbes, spinosaurusExplorerProbes, spinosaurusExplorer1Probes, spinosaurusExplorer2Probes, spinosaurusExplorer3Probes } from "./spinosaurusSceneProbes.ts";
import { coloringVersionsFor } from "../src/coloringWorkshopRoot.ts";
import { PARASAUROLOPHUS_HATCHLING, PARASAUROLOPHUS_EXPLORER } from "../src/coloring/parasaurolophusScene.ts";
import { parasaurolophusHatchlingProbes, parasaurolophusExplorerProbes } from "./parasaurolophusSceneProbes.ts";
import { PTERANODON_HATCHLING, PTERANODON_EXPLORER } from "../src/coloring/pteranodonScene.ts";
import { pteranodonHatchlingProbes, pteranodonExplorerProbes } from "./pteranodonSceneProbes.ts";
import { BRACHIOSAURUS_HATCHLING, BRACHIOSAURUS_EXPLORER_1 } from "../src/coloring/brachiosaurusScene.ts";
import { BRACHIOSAURUS_EXPLORER } from "../src/coloring/brachiosaurusExplorer2.ts";
import { brachiosaurusHatchlingProbes, brachiosaurusExplorerProbes, brachiosaurusExplorer1Probes } from "./brachiosaurusSceneProbes.ts";
import { MOSASAURUS_HATCHLING, MOSASAURUS_EXPLORER_1 } from "../src/coloring/mosasaurusScene.ts";
import { MOSASAURUS_EXPLORER } from "../src/coloring/mosasaurusExplorer2.ts";
import { mosasaurusHatchlingProbes, mosasaurusExplorerProbes, mosasaurusExplorer1Probes } from "./mosasaurusSceneProbes.ts";
import { TREX_HATCHLING, TREX_EXPLORER_1 } from "../src/coloring/trexScene.ts";
import { TREX_EXPLORER_3 } from "../src/coloring/trexExplorer.ts";
import { TREX_EXPLORER } from "../src/coloring/trexExplorer4.ts";
import { TREX_EXPLORER_2 } from "../src/coloring/trexExplorer2.ts";
import { trexHatchlingProbes, trexExplorerProbes, trexExplorer1Probes, trexExplorer2Probes, trexExplorer3Probes } from "./trexSceneProbes.ts";
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
    [TREX_EXPLORER_1, "trex-explorer-1", trexExplorer1Probes],
    [TREX_EXPLORER_2, "trex-explorer-2", trexExplorer2Probes],
    [TREX_EXPLORER_3, "trex-explorer-3", trexExplorer3Probes],
    [TREX_EXPLORER, "trex-explorer-4", trexExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(geometry.artwork.version).toBe(version);
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    // The traced scene draws every line as one protected ink layer; its tiny arms are ink inside
    // the neighbouring stripe and throat, since they are narrower than a fingertip target.
    const traced = geometry === TREX_EXPLORER;
    expect(geometry.regions.filter(({ id }) => id.startsWith("arm-")).map(({ id }) => id)).toEqual(traced ? [] : ["arm-far", "arm-near"]);
    expect(geometry.regions.filter(({ id }) => id.startsWith("leg-")).map(({ id }) => id)).toEqual(["leg-far", "leg-near"]);
    for (const region of geometry.regions) {
      expect(region.outline).toBe(traced ? 0 : Math.max(region.outline, 1.7));
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
      geometry === TREX_HATCHLING || geometry === TREX_EXPLORER ? [] : geometry === TREX_EXPLORER_1 ? [
        ["tail-mark", "tail"], ["belly", "body"], ["back-mark", "body"], ["thigh-mark", "leg-near"], ["rock-face", "rock"]
      ] : geometry === TREX_EXPLORER_3 ? [
        ["lava", "volcano"], ["rock-face", "rock"], ["tail-stripe-1", "tail"], ["tail-stripe-2", "tail"], ["tail-stripe-3", "tail"],
        ["back-stripe-1", "body"], ["back-stripe-2", "body"], ["back-stripe-3", "body"], ["back-stripe-4", "body"], ["belly", "body"]
      ] : [
        ["lava", "volcano"], ["rock-face", "rock"], ["tail-stripe-1", "tail"], ["tail-stripe-2", "tail"], ["tail-stripe-3", "tail"],
        ["back-stripe-1", "body"], ["back-stripe-2", "body"], ["back-stripe-3", "body"], ["belly", "body"], ["hip-patch", "thigh"],
        ["brow", "head"], ["jaw-muscle", "head"]
      ]
    );
  });

  it.each([
    ["Hatchling", TREX_HATCHLING, trexHatchlingProbes],
    ["first Explorer", TREX_EXPLORER_1, trexExplorer1Probes],
    ["second Explorer", TREX_EXPLORER_2, trexExplorer2Probes],
    ["third Explorer", TREX_EXPLORER_3, trexExplorer3Probes],
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
    [MOSASAURUS_EXPLORER_1, "mosasaurus-explorer-1", mosasaurusExplorer1Probes],
    [MOSASAURUS_EXPLORER, "mosasaurus-explorer-2", mosasaurusExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(geometry.artwork.version).toBe(version);
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    expect(new Set(geometry.artwork.regions).size).toBe(geometry.regions.length);
    expect(geometry.regions.filter(({ id }) => id.startsWith("flipper-")).map(({ id }) => id).sort()).toEqual(
      ["flipper-far-back", "flipper-far-front", "flipper-near-back", "flipper-near-front"]);
    // The traced scene draws every line as one protected ink layer above regions that tile the picture.
    const traced = geometry === MOSASAURUS_EXPLORER;
    for (const region of geometry.regions) {
      expect(region.outline).toBe(traced ? 0 : Math.max(region.outline, 1.7));
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === MOSASAURUS_EXPLORER_1 ? [
        ["rock-face", "rock"], ["tail-mark", "tail"], ["belly", "body"], ["back-mark", "body"], ["head-mark", "head"]
      ] : []
    );
  });

  it.each([
    ["Hatchling", MOSASAURUS_HATCHLING, mosasaurusHatchlingProbes],
    ["first Explorer", MOSASAURUS_EXPLORER_1, mosasaurusExplorer1Probes],
    ["Explorer", MOSASAURUS_EXPLORER, mosasaurusExplorerProbes]
  ] as const)("keeps every %s animal and sea target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(MOSASAURUS_EXPLORER.regions.length).toBeGreaterThan(MOSASAURUS_HATCHLING.regions.length * 2);
    expect(MOSASAURUS_EXPLORER.artwork.regions).toEqual(expect.arrayContaining(["head", "tail-fin", "belly", "back-band-1", "tail-band-1", "tail-band-2"]));
    expect(MOSASAURUS_HATCHLING.artwork.regions).not.toContain("water");
  });
});

describe("Parasaurolophus workshop scenes", () => {
  it.each([
    [PARASAUROLOPHUS_HATCHLING, "parasaurolophus-hatchling-1", parasaurolophusHatchlingProbes],
    [PARASAUROLOPHUS_EXPLORER, "parasaurolophus-explorer-1", parasaurolophusExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "PARASAUROLOPHUS", ru: "ПАРАЗАУРОЛОФ" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(1.7);
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === PARASAUROLOPHUS_HATCHLING ? [["belly", "body"]] : [["tail-tip", "body"], ["belly", "body"], ["stripe-hip", "body"], ["stripe-back", "body"], ["stripe-shoulder", "body"], ["crest-tip", "crest"]]
    );
  });

  it.each([
    ["Hatchling", PARASAUROLOPHUS_HATCHLING, parasaurolophusHatchlingProbes],
    ["Explorer", PARASAUROLOPHUS_EXPLORER, parasaurolophusExplorerProbes]
  ] as const)("keeps every %s animal and scenery target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(PARASAUROLOPHUS_EXPLORER.regions.length).toBeGreaterThan(PARASAUROLOPHUS_HATCHLING.regions.length * 1.8);
    expect(PARASAUROLOPHUS_HATCHLING.artwork.regions).not.toContain("sky");
  });
});

describe("Spinosaurus workshop scenes", () => {
  it.each([
    [SPINOSAURUS_HATCHLING, "spinosaurus-hatchling-1", spinosaurusHatchlingProbes],
    [SPINOSAURUS_EXPLORER_1, "spinosaurus-explorer-1", spinosaurusExplorer1Probes],
    [SPINOSAURUS_EXPLORER_2, "spinosaurus-explorer-2", spinosaurusExplorer2Probes],
    [SPINOSAURUS_EXPLORER_3, "spinosaurus-explorer-3", spinosaurusExplorer3Probes],
    [SPINOSAURUS_EXPLORER, "spinosaurus-explorer-4", spinosaurusExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    // The traced scene draws every line as one protected ink layer above regions that tile the picture.
    const traced = geometry === SPINOSAURUS_EXPLORER;
    for (const region of geometry.regions) {
      expect(region.outline).toBe(traced ? 0 : Math.max(region.outline, 1.7));
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === SPINOSAURUS_HATCHLING ? [["belly", "body"]]
        : traced ? []
        : geometry === SPINOSAURUS_EXPLORER_1 ? [["sail-stripe-1", "sail"], ["sail-stripe-2", "sail"], ["sail-stripe-3", "sail"], ["tail-tip", "body"], ["belly", "body"]]
        : geometry === SPINOSAURUS_EXPLORER_3 ? [["tail-stripe-1", "tail"], ["tail-stripe-2", "tail"], ["tail-stripe-3", "tail"], ["sail-rim", "sail"], ["sail-band-1", "sail"], ["sail-band-2", "sail"],
          ["flank-stripe-1", "body"], ["flank-stripe-2", "body"], ["flank-stripe-3", "body"], ["belly", "body"]]
        : [["tail-band-1", "tail"], ["tail-band-2", "tail"], ["tail-band-3", "tail"], ["sail-edge", "sail"], ["sail-band-1", "sail"], ["sail-band-2", "sail"], ["sail-band-3", "sail"],
          ["flank-stripe-1", "body"], ["flank-stripe-2", "body"], ["flank-stripe-3", "body"], ["belly", "body"], ["snout", "head"]]
    );
  });

  it.each([
    ["Hatchling", SPINOSAURUS_HATCHLING, spinosaurusHatchlingProbes],
    ["first Explorer", SPINOSAURUS_EXPLORER_1, spinosaurusExplorer1Probes],
    ["second Explorer", SPINOSAURUS_EXPLORER_2, spinosaurusExplorer2Probes],
    ["third Explorer", SPINOSAURUS_EXPLORER_3, spinosaurusExplorer3Probes],
    ["Explorer", SPINOSAURUS_EXPLORER, spinosaurusExplorerProbes]
  ] as const)("keeps every %s animal and scenery target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(SPINOSAURUS_EXPLORER.regions.length).toBeGreaterThan(SPINOSAURUS_HATCHLING.regions.length * 1.8);
    expect(SPINOSAURUS_HATCHLING.artwork.regions).not.toContain("sky");
  });
});

describe("Pteranodon workshop scenes", () => {
  it.each([
    [PTERANODON_HATCHLING, "pteranodon-hatchling-1", pteranodonHatchlingProbes],
    [PTERANODON_EXPLORER, "pteranodon-explorer-1", pteranodonExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "PTERANODON", ru: "ПТЕРАНОДОН" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    for (const region of geometry.regions) {
      expect(region.outline).toBeGreaterThanOrEqual(1.7);
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === PTERANODON_HATCHLING ? [] : [["cliff-right-top", "cliff-right"], ["cliff-left-top", "cliff-left"], ["wing-left-arm", "wing-left"], ["wing-right-arm", "wing-right"], ["belly", "body"], ["crest-tip", "crest"], ["jaw", "beak"]]
    );
  });

  it.each([
    ["Hatchling", PTERANODON_HATCHLING, pteranodonHatchlingProbes],
    ["Explorer", PTERANODON_EXPLORER, pteranodonExplorerProbes]
  ] as const)("keeps every %s animal and scenery target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(PTERANODON_EXPLORER.regions.length).toBeGreaterThan(PTERANODON_HATCHLING.regions.length * 1.8);
    expect(PTERANODON_HATCHLING.artwork.regions).not.toContain("sky");
  });
});

describe("Brachiosaurus workshop scenes", () => {
  it.each([
    [BRACHIOSAURUS_HATCHLING, "brachiosaurus-hatchling-1", brachiosaurusHatchlingProbes],
    [BRACHIOSAURUS_EXPLORER_1, "brachiosaurus-explorer-1", brachiosaurusExplorer1Probes],
    [BRACHIOSAURUS_EXPLORER, "brachiosaurus-explorer-2", brachiosaurusExplorerProbes]
  ] as const)("registers enclosed regions with matching parents (scene %#)", (geometry, version, probes) => {
    // The traced scene draws every line as one protected ink layer above regions that tile the picture.
    const traced = geometry === BRACHIOSAURUS_EXPLORER;
    expect(geometry.artwork.version).toBe(version);
    expect(artworkFor(version)).toEqual({ geometry, names: { en: "BRACHIOSAURUS", ru: "БРАХИОЗАВР" } });
    expect(geometry.artwork.regions).toEqual(probes.map(([, , id]) => id));
    expect(geometry.regions.filter(({ id }) => id.startsWith("leg-")).map(({ id }) => id)).toEqual(
      ["leg-far-hind", "leg-far-front", "leg-near-hind", "leg-near-front"]);
    for (const region of geometry.regions) {
      expect(region.outline).toBe(traced ? 0 : Math.max(region.outline, 1.7));
      expect("path" in region && region.path.endsWith(" Z")).toBe(true);
    }
    expect(geometry.regions.filter(({ parent }) => parent).map(({ id, parent }) => [id, parent])).toEqual(
      geometry === BRACHIOSAURUS_HATCHLING || traced ? [] : [["tail-mark", "tail"], ["back-mark", "body"], ["belly", "body"], ["rock-face", "rock"]]
    );
  });

  it.each([
    ["Hatchling", BRACHIOSAURUS_HATCHLING, brachiosaurusHatchlingProbes],
    ["first Explorer", BRACHIOSAURUS_EXPLORER_1, brachiosaurusExplorer1Probes],
    ["Explorer", BRACHIOSAURUS_EXPLORER, brachiosaurusExplorerProbes]
  ] as const)("keeps every %s animal and scenery target independently fillable", async (_, geometry, probes) => {
    for (const [, , id] of probes) {
      const painted = await illustration(geometry, id);
      for (const [px, py, other] of probes) {
        const offset = (py * WIDTH + px) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${other}`).toEqual(id === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
    }
    expect(BRACHIOSAURUS_EXPLORER.regions.length).toBeGreaterThan(BRACHIOSAURUS_HATCHLING.regions.length * 1.8);
    expect(BRACHIOSAURUS_HATCHLING.artwork.regions).not.toContain("tree-trunk");
    expect(BRACHIOSAURUS_EXPLORER.artwork.regions).toEqual(expect.arrayContaining(["head", "neck-band-1", "neck-band-4", "back-patch-1", "tail-band-1", "tail-tip", "belly", "flank"]));
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
    // Render every region's painted and mask pictures at once: sharp works on
    // its own threads, so the renders overlap instead of queueing one by one.
    const renders = await Promise.all(probes.map(([, , id]) => Promise.all([illustration(geometry, id), illustration(geometry, id, true)])));
    for (const [index, [, , id]] of probes.entries()) {
      const [painted, mask] = renders[index]!;
      for (const [other, [x, y, sample]] of probes.entries()) {
        const offset = (y * WIDTH + x) * 4;
        expect([...painted.subarray(offset, offset + 4)], `${id} at ${sample}`).toEqual(index === other ? [239, 83, 80, 255] : [255, 240, 207, 255]);
      }
      let interior = 0;
      let minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0;
      let changedInk = 0, leaks = 0, outsideMask = 0;
      for (let i = 0; i < painted.length; i += 4) {
        if (painted[i] === 239 && painted[i + 1] === 83 && painted[i + 2] === 80 && painted[i + 3] === 255) interior++;
        const differs = Math.abs(painted[i]! - blank[i]!) > 1 || Math.abs(painted[i + 1]! - blank[i + 1]!) > 1
          || Math.abs(painted[i + 2]! - blank[i + 2]!) > 1 || Math.abs(painted[i + 3]! - blank[i + 3]!) > 1;
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

describe("Explorer coloring standard", () => {
  // Scenes drawn before the standard, each awaiting its redraw.
  const awaitingRedraw = ["pteranodon-explorer-1", "parasaurolophus-explorer-1"];

  it.each(["explorer", "paleontologist"] as const)("offers %s pictures of at least 35 regions", level => {
    const counts = coloringVersionsFor(level).filter(version => !awaitingRedraw.includes(version))
      .map(version => [version, artworkFor(version).geometry.regions.length] as const);
    expect(counts.filter(([, count]) => count < 35)).toEqual([]);
    expect(counts.map(([version]) => version)).toEqual(expect.arrayContaining(["spinosaurus-explorer-4", "trex-explorer-4", "brachiosaurus-explorer-2", "mosasaurus-explorer-2"]));
  });
});
