import { afterEach, expect, it, vi } from "vitest";
import { ARTWORKS } from "../src/coloring/artworks.ts";
import { createPainter } from "../src/coloring/painter.ts";
import { coloringWorkshopRoot, coloringVersionsFor } from "../src/coloringWorkshopRoot.ts";

vi.mock("../src/coloring/painter.ts", () => ({
  createPainter: vi.fn(() => ({
    render: vi.fn(),
    inspection: { same: vi.fn(() => true) }
  }))
}));
afterEach(() => vi.clearAllMocks());

it("wires every gallery preview to its cached artwork painter with empty actions", () => {
  const canvas = {} as HTMLCanvasElement;
  const document = { createElement: vi.fn(() => canvas) };
  const factory = { open: vi.fn(() => { throw new Error("Unexpected database access"); }) };
  const root = coloringWorkshopRoot(factory, document);
  expect(createPainter).not.toHaveBeenCalled();
  expect(root.artworks.map(({ version, names }) => ({ version, names }))).toEqual(
    ARTWORKS.map(({ geometry, names }) => ({ version: geometry.artwork.version, names }))
  );
  for (const [index, artwork] of root.artworks.entries()) {
    expect(Object.keys(artwork).sort()).toEqual(["names", "preview", "version"]);
    expect(artwork.preview.width).toBe(276);
    expect(artwork.preview.height).toBe(186);
    artwork.preview.render(canvas);
    const painter = root.painterFor(artwork.version);
    expect(painter.render).toHaveBeenCalledExactlyOnceWith(canvas, []);
    expect(createPainter).toHaveBeenNthCalledWith(index + 1, expect.any(Function), ARTWORKS[index]!.geometry);
    artwork.preview.render(canvas);
    expect(painter.render).toHaveBeenNthCalledWith(2, canvas, []);
    expect(vi.mocked(createPainter).mock.calls[index]![0]()).toBe(canvas);
    expect(document.createElement).toHaveBeenLastCalledWith("canvas");
  }
  expect(root.painterFor(root.artworks[0]!.version)).not.toBe(root.painterFor(root.artworks[1]!.version));
  expect(createPainter).toHaveBeenCalledTimes(ARTWORKS.length);
  expect(factory.open).not.toHaveBeenCalled();
});

it.each([
  ["hatchling", "stegosaurus-production-1", "triceratops-production-2"],
  ["explorer", "stegosaurus-explorer-2", "triceratops-explorer-2"],
  ["paleontologist", "stegosaurus-explorer-2", "triceratops-explorer-2"]
] as const)("offers age-appropriate creatures and excludes the archived Ankylosaurus for %s", (level, stegosaurus, triceratops) => {
  expect(coloringVersionsFor(level)).toEqual([stegosaurus, triceratops, level === "hatchling" ? "ankylosaurus-hatchling-3" : "ankylosaurus-explorer-2", level === "hatchling" ? "trex-hatchling-2" : "trex-explorer-5", level === "hatchling" ? "mosasaurus-hatchling-2" : "mosasaurus-explorer-3", level === "hatchling" ? "brachiosaurus-hatchling-2" : "brachiosaurus-explorer-3", level === "hatchling" ? "pteranodon-hatchling-2" : "pteranodon-explorer-3", level === "hatchling" ? "parasaurolophus-hatchling-2" : "parasaurolophus-explorer-3", level === "hatchling" ? "spinosaurus-hatchling-2" : "spinosaurus-explorer-5"]);
});
