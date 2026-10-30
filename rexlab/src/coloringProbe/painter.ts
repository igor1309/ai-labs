import { BASE, DETAILS, HEIGHT, REGIONS, WIDTH, type Point, type Region } from "./geometry.ts";
import type { Action } from "./model.ts";

export function createPainter(makeCanvas: () => HTMLCanvasElement) {
  const paths = REGIONS.map(region => ({ ...region, shape: new Path2D(region.path) }));
  const mask = new Path2D();
  paths.forEach(region => mask.addPath(region.shape));
  const canvas = () => {
    const result = makeCanvas(); result.width = WIDTH; result.height = HEIGHT;
    return result;
  };
  const context = (target: HTMLCanvasElement) => {
    const ctx = target.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    return ctx;
  };
  const stroke = (ctx: CanvasRenderingContext2D, action: Extract<Action, { kind: "stroke" }>) => {
    const first = action.points[0]!;
    ctx.fillStyle = action.color; ctx.strokeStyle = action.color; ctx.lineWidth = action.size;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.arc(first.x, first.y, action.size / 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(first.x, first.y);
    action.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y)); ctx.stroke();
  };
  const details = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#3c4358"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    paths.forEach(region => ctx.stroke(region.shape));
    ctx.stroke(new Path2D(DETAILS.smile)); ctx.stroke(new Path2D(DETAILS.toes));
    ctx.fillStyle = "#3c4358"; ctx.beginPath(); ctx.arc(DETAILS.eye.x, DETAILS.eye.y, DETAILS.eye.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(141, 400, 4, 0, Math.PI * 2); ctx.fill();
  };
  const layer = canvas();
  const paint = context(layer);
  function render(target: HTMLCanvasElement, actions: readonly Action[]) {
    const ctx = context(target); ctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (const region of paths) {
      // A fill replaces everything before it in its own closed region.
      let lastFill = -1;
      for (let i = actions.length - 1; i >= 0; i--) {
        const action = actions[i]!;
        if (action.kind === "fill" && action.region === region.id) { lastFill = i; break; }
      }
      const fill = actions[lastFill];
      paint.fillStyle = fill?.kind === "fill" ? fill.color : BASE;
      paint.fillRect(0, 0, WIDTH, HEIGHT);
      for (let i = lastFill + 1; i < actions.length; i++) {
        const action = actions[i]!;
        if (action.kind === "stroke") stroke(paint, action);
      }
      ctx.save(); ctx.clip(region.shape); ctx.drawImage(layer, 0, 0); ctx.restore();
    }
    details(ctx);
  }
  const pixels = (target: HTMLCanvasElement) => context(target).getImageData(0, 0, WIDTH, HEIGHT).data;
  // Source-over antialiasing can round an unchanged color by one channel unit.
  // That invisible rounding is not a paint action; restored journals still replay exactly.
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]!) <= 1);
  const scratch = canvas();
  return {
    canvas, render, pixels,
    changed(current: HTMLCanvasElement, actions: readonly Action[], action: Action): boolean {
      render(scratch, [...actions, action]);
      return !same(pixels(current), pixels(scratch));
    },
    preview(target: HTMLCanvasElement, committed: HTMLCanvasElement, action: Extract<Action, { kind: "stroke" }>) {
      const ctx = context(target); ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(committed, 0, 0);
      ctx.save(); ctx.clip(mask); stroke(ctx, action); ctx.restore(); details(ctx);
    },
    regionAt(point: Point): Region | undefined {
      const ctx = context(scratch);
      // Protected lines and details never accept a fill.
      ctx.lineWidth = 7;
      if (Math.hypot(point.x - DETAILS.eye.x, point.y - DETAILS.eye.y) <= DETAILS.eye.radius + 2 || ctx.isPointInStroke(new Path2D(DETAILS.smile), point.x, point.y) || ctx.isPointInStroke(new Path2D(DETAILS.toes), point.x, point.y) || paths.some(region => ctx.isPointInStroke(region.shape, point.x, point.y))) return undefined;
      return paths.find(region => ctx.isPointInPath(region.shape, point.x, point.y))?.id;
    },
    async thumbnail(target: HTMLCanvasElement): Promise<Blob> {
      const small = makeCanvas(); small.width = 256; small.height = 192;
      context(small).drawImage(target, 0, 0, 256, 192);
      return new Promise((resolve, reject) => small.toBlob(blob => blob ? resolve(blob) : reject(new Error("Thumbnail failed")), "image/png"));
    }
  };
}
export type Painter = ReturnType<typeof createPainter>;
