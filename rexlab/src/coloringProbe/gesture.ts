import type { Point } from "./geometry.ts";
import type { Action } from "./model.ts";
export function gesture() {
  let active: { pointer: number; stroke: Extract<Action, { kind: "stroke" }> } | undefined;
  return {
    get busy() { return !!active; },
    start(pointer: number, point: Point, color: string, size: number) {
      if (active) return undefined;
      active = { pointer, stroke: { kind: "stroke", color, size, points: [point] } };
      return active.stroke;
    },
    move(pointer: number, point: Point) {
      if (!active || active.pointer !== pointer) return undefined;
      const last = active.stroke.points[active.stroke.points.length - 1]!;
      if (point.x !== last.x || point.y !== last.y) active.stroke.points.push(point);
      return active.stroke;
    },
    end(pointer: number, point: Point) {
      if (!active || active.pointer !== pointer) return undefined;
      this.move(pointer, point);
      const result = active.stroke; active = undefined; return result;
    },
    cancel() { active = undefined; }
  };
}
