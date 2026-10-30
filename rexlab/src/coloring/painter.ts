import { BASE_COLOR, type Action, type PaintInspection, type Point } from "./index.ts";
import { DETAILS, HEIGHT, REGIONS, VECTOR_SCALE, WIDTH, type VectorShape } from "./geometry.ts";

const INK = "#091e40";
type Stroke = Extract<Action, { kind: "stroke" }>;

function vector(shape: VectorShape): Path2D {
  let local: Path2D;
  const matrix = new DOMMatrix().scale(VECTOR_SCALE).translate(shape.x, shape.y);
  if ("path" in shape) {
    local = new Path2D(shape.path);
  } else {
    local = new Path2D();
    local.ellipse(shape.width / 2, shape.height / 2, shape.width / 2, shape.height / 2, 0, 0, 2 * Math.PI);
    matrix.translateSelf(shape.width / 2, shape.height / 2).rotateSelf(-shape.rotation).translateSelf(-shape.width / 2, -shape.height / 2);
  }
  const path = new Path2D(); path.addPath(local, matrix);
  return path;
}

// A single union of round capsules avoids darkening the antialiased edges when
// an opaque brush retraces itself, or another contact repeats the same color.
function addStroke(path: Path2D, action: Stroke, primitives: Set<string>) {
  const radius = action.size / 2;
  for (let i = 0; i < action.points.length; i++) {
    const point = action.points[i]!;
    const circle = `dot:${point.x},${point.y},${radius}`;
    if (!primitives.has(circle)) {
      primitives.add(circle);
      path.moveTo(point.x + radius, point.y);
      path.arc(point.x, point.y, radius, 0, 2 * Math.PI);
      path.closePath();
    }
    const previous = action.points[i - 1];
    if (!previous) continue;
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (!length) continue;
    const ends = [[previous.x, previous.y], [point.x, point.y]].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    const segment = `segment:${ends.flat().join(",")},${radius}`;
    if (primitives.has(segment)) continue;
    primitives.add(segment);
    const dx = (point.y - previous.y) * radius / length;
    const dy = (previous.x - point.x) * radius / length;
    path.moveTo(previous.x + dx, previous.y + dy);
    path.lineTo(point.x + dx, point.y + dy);
    path.lineTo(point.x - dx, point.y - dy);
    path.lineTo(previous.x - dx, previous.y - dy);
    path.closePath();
  }
}

export function createPainter(makeCanvas: () => HTMLCanvasElement) {
  const regions = REGIONS.map(region => ({ ...region, shape: vector(region) }));
  const details = DETAILS.map(detail => ({ ...detail, shape: vector(detail) }));
  const byId = new Map(regions.map(region => [region.id, region]));
  function ancestors(region: typeof regions[number]): Path2D[] {
    if (!region.parent) return [];
    const parent = byId.get(region.parent);
    if (!parent) throw new Error("Missing paint region parent");
    return [...ancestors(parent), parent.shape];
  }
  const paths = regions.map(region => ({ ...region, clips: ancestors(region) }));
  function canvas(width = WIDTH, height = HEIGHT) {
    const result = makeCanvas(); result.width = width; result.height = height;
    return result;
  }
  function context(target: HTMLCanvasElement) {
    const ctx = target.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    return ctx;
  }
  const layer = canvas();
  const paint = context(layer);
  const before = canvas(), after = canvas();

  function render(target: HTMLCanvasElement, actions: readonly Action[]) {
    if (target.width <= 0 || target.height <= 0) throw new Error("Paint surface must have a size");
    // Each region is composited only once, so painting the base color cannot
    // strengthen a translucent silhouette edge and invent a visible edit.
    if (layer.width !== target.width || layer.height !== target.height) {
      layer.width = target.width; layer.height = target.height;
    }
    const ctx = context(target);
    ctx.save(); ctx.resetTransform(); ctx.clearRect(0, 0, target.width, target.height);
    ctx.scale(target.width / WIDTH, target.height / HEIGHT);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const batches = new Map<number, { color: string; shape: Path2D; primitives: Set<string> }[]>();
    let paintedFrom: number | undefined;
    for (const region of paths) {
      let lastFill = -1;
      for (let i = actions.length - 1; i >= 0; i--) {
        const action = actions[i]!;
        if (action.kind === "fill" && action.region === region.id) { lastFill = i; break; }
      }
      if (paintedFrom !== lastFill) {
        let groups = batches.get(lastFill);
        if (!groups) {
          groups = [];
          for (let i = lastFill + 1; i < actions.length; i++) {
            const action = actions[i]!;
            if (action.kind !== "stroke") continue;
            let group = groups.at(-1);
            if (group?.color !== action.color) {
              group = { color: action.color, shape: new Path2D(), primitives: new Set() }; groups.push(group);
            }
            addStroke(group.shape, action, group.primitives);
          }
          batches.set(lastFill, groups);
        }
        paint.resetTransform();
        const fill = actions[lastFill];
        paint.fillStyle = fill?.kind === "fill" ? fill.color : BASE_COLOR;
        paint.fillRect(0, 0, layer.width, layer.height);
        paint.save(); paint.scale(target.width / WIDTH, target.height / HEIGHT);
        for (const group of groups) { paint.fillStyle = group.color; paint.fill(group.shape); }
        paint.restore(); paintedFrom = lastFill;
      }
      ctx.save();
      region.clips.forEach(path => ctx.clip(path));
      ctx.save(); ctx.clip(region.shape);
      ctx.drawImage(layer, 0, 0, WIDTH, HEIGHT); ctx.restore();
      if (region.outline) {
        ctx.strokeStyle = INK; ctx.lineWidth = region.outline * VECTOR_SCALE; ctx.stroke(region.shape);
      }
      ctx.restore();
    }
    for (const detail of details) {
      if (detail.fill) { ctx.fillStyle = detail.fill; ctx.fill(detail.shape); }
      if (detail.stroke) {
        ctx.strokeStyle = detail.stroke; ctx.lineWidth = detail.strokeWidth! * VECTOR_SCALE; ctx.stroke(detail.shape);
      }
    }
    ctx.restore();
  }
  const pixels = (target: HTMLCanvasElement) => context(target).getImageData(0, 0, target.width, target.height).data;
  const inspection: PaintInspection = {
    same(a, b) {
      render(before, a); render(after, b);
      const first = pixels(before), second = pixels(after);
      // One channel unit is Canvas compositing roundoff, not visible paint.
      return first.every((value, i) => Math.abs(value - second[i]!) <= 1);
    }
  };
  return {
    canvas, render, pixels, inspection,
    preview(target: HTMLCanvasElement, committed: readonly Action[], active: Stroke) {
      render(target, [...committed, active]);
    },
    regionAt(point: Point): string | undefined {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
      const ctx = context(before);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      for (const detail of details) {
        if (detail.fill && ctx.isPointInPath(detail.shape, point.x, point.y)) return undefined;
        if (detail.stroke) {
          ctx.lineWidth = detail.strokeWidth! * VECTOR_SCALE + 1;
          if (ctx.isPointInStroke(detail.shape, point.x, point.y)) return undefined;
        }
      }
      // Reverse paint order gives overlapping regions the same owner for taps
      // and pixels; hidden plate edges cannot block a body fill.
      for (let i = paths.length - 1; i >= 0; i--) {
        const region = paths[i]!;
        if (!region.clips.every(path => ctx.isPointInPath(path, point.x, point.y))) continue;
        ctx.lineWidth = region.outline * VECTOR_SCALE + 1;
        if (region.outline && ctx.isPointInStroke(region.shape, point.x, point.y)) return undefined;
        if (ctx.isPointInPath(region.shape, point.x, point.y)) return region.id;
      }
      return undefined;
    }
  };
}
export type Painter = ReturnType<typeof createPainter>;
