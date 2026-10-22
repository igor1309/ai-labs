export const TIP_WIDTHS = [2, 4, 8] as const;
export type TipWidth = (typeof TIP_WIDTHS)[number];
export type SandPoint = { x: number; y: number };
export type SandSegment = { from: SandPoint; to: SandPoint; width: TipWidth };

type Stroke = { width: TipWidth; points: SandPoint[] };

// Coordinates and widths belong to the CSS canvas, never its backing bitmap.
// Keeping the full strokes lets a smaller viewport clip without losing marks.
export function sandWriting(draw: (segment: SandSegment) => void) {
  const strokes: Stroke[] = [];
  let active: { pointer: number; stroke: Stroke } | undefined;
  return {
    begin(pointer: number, point: SandPoint, width: TipWidth): boolean {
      if (active) return false;
      const stroke: Stroke = { width, points: [point] };
      strokes.push(stroke);
      active = { pointer, stroke };
      draw({ from: point, to: point, width });
      return true;
    },
    move(pointer: number, points: readonly SandPoint[]) {
      if (active?.pointer !== pointer) return;
      const { stroke } = active;
      for (const to of points) {
        const from = stroke.points.at(-1)!;
        if (from.x === to.x && from.y === to.y) continue;
        stroke.points.push(to);
        draw({ from, to, width: stroke.width });
      }
    },
    end(pointer: number) {
      if (active?.pointer === pointer) active = undefined;
    },
    get pointer(): number | undefined { return active?.pointer; },
    clear() {
      active = undefined;
      strokes.length = 0;
    },
    redraw() {
      for (const { width, points } of strokes) {
        points.forEach((to, index) => draw({ from: points[Math.max(0, index - 1)]!, to, width }));
      }
    }
  };
}
