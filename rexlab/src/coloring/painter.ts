import { BASE_COLOR, type Action, type PaintInspection, type Point } from "./index.ts";
import { DETAILS, HEIGHT, REGIONS, VECTOR_SCALE, WIDTH, type VectorShape } from "./geometry.ts";

const INK = "#091e40";
type Stroke = Extract<Action, { kind: "stroke" }>;
type Group = { color: string; shape: Path2D; primitives: Set<string> };

function groupsAfter(actions: readonly Action[], lastFill: number): Group[] {
  const groups: Group[] = [];
  for (let i = lastFill + 1; i < actions.length; i++) {
    const action = actions[i]!;
    if (action.kind !== "stroke") continue;
    let group = groups.at(-1);
    if (group?.color !== action.color) {
      group = { color: action.color, shape: new Path2D(), primitives: new Set() }; groups.push(group);
    }
    addStroke(group.shape, action, group.primitives);
  }
  return groups;
}

function lastFillIn(actions: readonly Action[], id: string): number {
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i]!;
    if (action.kind === "fill" && action.region === id) return i;
  }
  return -1;
}

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
function addStroke(path: Path2D, action: Stroke, primitives: Set<string>, from = 0) {
  const radius = action.size / 2;
  for (let i = from; i < action.points.length; i++) {
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
  const before = canvas(), after = canvas();

  type PreviewLayer = { base: HTMLCanvasElement; surface: HTMLCanvasElement; group: Group };
  type Preview = {
    committed: readonly Action[]; active: Stroke; count: number;
    width: number; height: number; layers: Map<number, PreviewLayer>; fills: number[];
  };
  const previews = new WeakMap<HTMLCanvasElement, Preview>();

  function composite(target: HTMLCanvasElement, regionLayer: (index: number) => HTMLCanvasElement) {
    if (target.width <= 0 || target.height <= 0) throw new Error("Paint surface must have a size");
    const ctx = context(target);
    ctx.save(); ctx.resetTransform();
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.scale(target.width / WIDTH, target.height / HEIGHT);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (let i = 0; i < paths.length; i++) {
      const region = paths[i]!;
      const source = regionLayer(i);
      ctx.save();
      region.clips.forEach(path => ctx.clip(path));
      ctx.save(); ctx.clip(region.shape);
      ctx.drawImage(source, 0, 0, WIDTH, HEIGHT); ctx.restore();
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

  function paintGroups(target: HTMLCanvasElement, color: string, groups: readonly Group[]) {
    const ctx = context(target);
    ctx.resetTransform(); ctx.fillStyle = color;
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.save(); ctx.scale(target.width / WIDTH, target.height / HEIGHT);
    for (const group of groups) { ctx.fillStyle = group.color; ctx.fill(group.shape); }
    ctx.restore();
  }

  function render(target: HTMLCanvasElement, actions: readonly Action[]) {
    previews.delete(target);
    // Each region is composited only once, so painting the base color cannot
    // strengthen a translucent silhouette edge and invent a visible edit.
    if (layer.width !== target.width || layer.height !== target.height) {
      layer.width = target.width; layer.height = target.height;
    }
    const batches = new Map<number, Group[]>();
    let paintedFrom: number | undefined;
    composite(target, i => {
      const lastFill = lastFillIn(actions, paths[i]!.id);
      if (paintedFrom !== lastFill) {
        let groups = batches.get(lastFill);
        if (!groups) { groups = groupsAfter(actions, lastFill); batches.set(lastFill, groups); }
        const fill = actions[lastFill];
        paintGroups(layer, fill?.kind === "fill" ? fill.color : BASE_COLOR, groups);
        paintedFrom = lastFill;
      }
      return layer;
    });
  }

  function preview(target: HTMLCanvasElement, committed: readonly Action[], active: Stroke) {
    let cached = previews.get(target);
    if (!cached || cached.committed !== committed || cached.active !== active || cached.count > active.points.length ||
        cached.width !== target.width || cached.height !== target.height) {
      const fills = paths.map(region => lastFillIn(committed, region.id));
      const layers = new Map<number, PreviewLayer>();
      for (const lastFill of new Set(fills)) {
        const groups = groupsAfter(committed, lastFill);
        const tail = groups.at(-1);
        // The live contact must share its union with the preceding same-color
        // batch; overlaying two rasters would darken their antialiased edges.
        const group = tail?.color === active.color ? groups.pop()! :
          { color: active.color, shape: new Path2D(), primitives: new Set<string>() };
        const base = canvas(target.width, target.height), surface = canvas(target.width, target.height);
        const fill = committed[lastFill];
        paintGroups(base, fill?.kind === "fill" ? fill.color : BASE_COLOR, groups);
        layers.set(lastFill, { base, surface, group });
      }
      cached = { committed, active, count: 0, width: target.width, height: target.height, layers, fills };
      previews.set(target, cached);
    }
    if (cached.count === active.points.length) return;
    const scaleX = target.width / WIDTH, scaleY = target.height / HEIGHT;
    // Repaint cached rasters as a whole: clipping a combined brush path can
    // change antialias coverage beyond the new segment's bounds. Geometry and
    // committed color layers stay cached, so this does not replay the journal.
    for (const { base, surface, group } of cached.layers.values()) {
      addStroke(group.shape, active, group.primitives, cached.count);
      const ctx = context(surface);
      ctx.save(); ctx.resetTransform();
      ctx.clearRect(0, 0, surface.width, surface.height);
      ctx.drawImage(base, 0, 0);
      ctx.scale(scaleX, scaleY); ctx.fillStyle = group.color; ctx.fill(group.shape);
      ctx.restore();
    }
    cached.count = active.points.length;
    composite(target, i => cached.layers.get(cached.fills[i]!)!.surface);
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
    width: WIDTH, height: HEIGHT,
    canvas, render, pixels, inspection,
    preview,
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
