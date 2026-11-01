import { expect, it } from "vitest";
import { TIP_WIDTHS } from "../src/sandWriting.ts";
import { sandWritingCanvas } from "../src/sandWritingCanvas.ts";
import { writingCanvasSpy } from "./sandWritingCanvasSpy.ts";

it.each([1, 1.5, 2])("paints rounded CSS pixel grooves and displaced light lips at density %s", (ratio) => {
  const base = writingCanvasSpy(), grooves = writingCanvasSpy();
  const renderer = sandWritingCanvas(base.context, grooves.context);
  renderer.cover(80, 60, ratio);
  for (const width of TIP_WIDTHS) {
    renderer.draw({ from: { x: 10, y: 20 }, to: { x: 40, y: 50 }, width });
    renderer.draw({ from: { x: 60, y: 30 }, to: { x: 60, y: 30 }, width });
  }
  expect(base.transforms).toEqual([[ratio, 0, 0, ratio, 0, 0]]);
  expect(grooves.transforms).toEqual(base.transforms);
  expect(grooves.cleared).toEqual([[0, 0, 80, 60]]);
  expect(base.rectangles[0]).toEqual({ colour: "#d9b77e", box: [0, 0, 80, 60] });
  expect(new Set(base.rectangles.slice(1).map(({ colour }) => colour))).toEqual(new Set(["#e8cc98", "#c9a46a"]));
  expect(grooves.paths.filter(({ colour }) => colour === "#98723f")).toEqual(TIP_WIDTHS.flatMap((width) => [
    { colour: "#98723f", width, points: [[10, 20], [40, 50]], rounded: true },
    { colour: "#98723f", width, points: [[60, 30, width / 2]], rounded: true }
  ]));
  expect(base.paths.filter(({ points }) => points.length === 2)).toEqual(TIP_WIDTHS.map((width) => ({
    colour: "#f0daac", width: width + 1.4, points: [[10.7, 20.7], [40.7, 50.7]], rounded: true
  })));
});

it("keeps grains at their CSS coordinates through a shrink and grow", () => {
  const base = writingCanvasSpy(), grooves = writingCanvasSpy();
  const renderer = sandWritingCanvas(base.context, grooves.context);
  renderer.cover(60, 40, 1);
  const original = [...base.rectangles];
  base.rectangles.length = 0;
  renderer.cover(30, 20, 2);
  // Boundary grains may fall past the bitmap's edge, where canvas clips them.
  const visible = ({ box }: { box: number[] }) => box[0]! < 30 && box[1]! < 20;
  expect(base.rectangles.slice(1).filter(visible)).toEqual(original.slice(1).filter(visible));
  base.rectangles.length = 0;
  renderer.cover(60, 40, 1);
  expect(base.rectangles).toEqual(original);
});

it.each([1, 1.5, 2])("clears every backing pixel at fractional CSS edges, density %s", (ratio) => {
  const base = writingCanvasSpy(), grooves = writingCanvasSpy();
  sandWritingCanvas(base.context, grooves.context).cover(80.4, 60.4, ratio);
  const box = [0, 0, Math.round(80.4 * ratio) / ratio, Math.round(60.4 * ratio) / ratio];
  expect(grooves.cleared).toEqual([box]);
  expect(base.rectangles[0]).toEqual({ colour: "#d9b77e", box });
});
