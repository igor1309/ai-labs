import { BASE_COLOR, coloringModel, type Action, type Artwork, type Color } from "../src/coloring/index.ts";

// A tiny illustration double: two regions, with one protected pixel between them.
// Rendering geometry itself belongs to the illustration adapter's contracts.
export function coloringFixture(artwork: Artwork = { version: "test-stegosaurus-1", regions: ["body", "head"] }) {
  function pixels(actions: readonly Action[]) {
    const result: Color[] = [BASE_COLOR, BASE_COLOR, BASE_COLOR, BASE_COLOR];
    for (const action of actions) {
      if (action.kind === "fill") {
        const start = action.region === "body" ? 0 : 2;
        result[start] = action.color; result[start + 1] = action.color;
      } else {
        for (const point of action.points) {
          if (point.y === 0 && Number.isInteger(point.x) && point.x >= 0 && point.x < 4) result[point.x] = action.color;
        }
      }
    }
    return result;
  }
  const model = coloringModel(artwork, {
    same(before, after) { return JSON.stringify(pixels(before)) === JSON.stringify(pixels(after)); }
  });
  const dot: Action = { kind: "stroke", color: "#ef5350", size: 20, points: [{ x: 0, y: 0 }] };
  const thumbnail = () => new Blob(["thumbnail"], { type: "image/png" });
  return { model, dot, thumbnail };
}
