import { afterEach, expect, it, vi } from "vitest";
import { createPainter } from "../src/coloring/painter.ts";
import { COLORS, type Action, type Point } from "../src/coloring/index.ts";

// Canvas spies measure geometry ingestion. Pixel
// equivalence belongs to the Chromium contract using the real rasterizer.
function drawing() {
  class Path {
    addPath() {} ellipse() {} moveTo() {} arc() {} closePath() {} lineTo() {}
  }
  class Matrix {
    scale() { return this; } translate() { return this; } translateSelf() { return this; } rotateSelf() { return this; }
  }
  vi.stubGlobal("Path2D", Path);
  vi.stubGlobal("DOMMatrix", Matrix);
  const surfaces: { target: HTMLCanvasElement; ctx: Record<string, ReturnType<typeof vi.fn>>; getContext: ReturnType<typeof vi.fn> }[] = [];
  const painter = createPainter(() => {
    const ctx: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["save", "restore", "resetTransform", "clearRect", "scale", "clip", "drawImage", "stroke", "fill", "fillRect", "beginPath", "rect", "isPointInPath", "isPointInStroke"]) ctx[method] = vi.fn();
    const getContext = vi.fn(); getContext.mockImplementation(() => ctx);
    const target = { width: 0, height: 0, getContext } as unknown as HTMLCanvasElement;
    surfaces.push({ target, ctx, getContext });
    return target;
  });
  return { painter, surfaces };
}

afterEach(() => vi.unstubAllGlobals());

it.each([0, 100].flatMap(history => [32, 2048].map(samples => ({ history, samples }))))(
  "ingests only new geometry after $history history actions and $samples contact samples", ({ history, samples }) => {
    const { painter, surfaces } = drawing();
    let historyReadable = true, oldestReadable = 0;
    const committed = new Proxy(Array.from({ length: history }, (_, i): Action => ({ kind: "stroke", color: COLORS[1 + i % 3]!, size: 20, points: [{ x: i, y: 320 }] })), {
      get(target, key, receiver) {
        if (!historyReadable) throw new Error("Live drawing reread committed history");
        return Reflect.get(target, key, receiver);
      }
    });
    const points: Point[] = Array.from({ length: samples }, (_, i) => ({ x: 200 + i / 20, y: 320 }));
    const active = { kind: "stroke" as const, color: COLORS[1], size: 20 as const, points: new Proxy(points, {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key) && Number(key) < oldestReadable) throw new Error("Live drawing reread old contact samples");
        return Reflect.get(target, key, receiver);
      }
    }) };
    const target = painter.canvas();
    painter.preview(target, committed, active);
    historyReadable = false; oldestReadable = samples - 1;
    points.push({ x: points.at(-1)!.x + 2, y: 322 });
    painter.preview(target, committed, active);
    const ctx = surfaces.find(surface => surface.target === target)!.ctx;
    const calls = ctx.clearRect!.mock.calls.length;
    painter.preview(target, committed, active);
    expect(ctx.clearRect!.mock.calls).toHaveLength(calls);
  }
);

it("releases a preview on replay", () => {
  const { painter, surfaces } = drawing();
  const target = painter.canvas();
  const committed: Action[] = [];
  const active = { kind: "stroke" as const, color: COLORS[1], size: 20 as const, points: [{ x: 420, y: 330 }] };
  painter.preview(target, committed, active);
  painter.render(target, committed);
  const ctx = surfaces.find(surface => surface.target === target)!.ctx;
  const calls = ctx.clearRect!.mock.calls.length;
  painter.preview(target, committed, active);
  expect(ctx.clearRect!.mock.calls).toHaveLength(calls + 1);
});
