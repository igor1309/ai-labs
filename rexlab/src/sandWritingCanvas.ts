import type { SandPoint, SandSegment } from "./sandWriting.ts";

// The sand and its marks, shared with the home tile's picture of them.
export const SAND = { bed: "#d9b77e", lip: "#f0daac", groove: "#98723f" } as const;

// What the canvas paints with: the bed under everything, or none where the
// screen's own sand shows through; the specks' colours and how many cells
// cells, one in every so many, carry one and how big; the lip and the groove.
export type SandPalette = { bed: string | null; specks: readonly string[]; every: number; grain: number; lip: string; groove: string };
export const SAND_PALETTE: SandPalette = { ...SAND, specks: ["#e8cc98", "#c9a46a"], every: 1, grain: 1 };

function line(context: CanvasRenderingContext2D, from: SandPoint, to: SandPoint, width: number, colour: string, offset = 0) {
  context.fillStyle = context.strokeStyle = colour;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (from.x === to.x && from.y === to.y) {
    context.arc(to.x + offset, to.y + offset, width / 2, 0, 2 * Math.PI);
    context.fill();
  } else {
    context.moveTo(from.x + offset, from.y + offset);
    context.lineTo(to.x + offset, to.y + offset);
    context.stroke();
  }
}

// The lip lies below every groove, so adding a segment never paints light
// sand over an earlier segment's dark, rounded join.
export function sandWritingCanvas(base: CanvasRenderingContext2D, grooves: CanvasRenderingContext2D, palette: () => SandPalette = () => SAND_PALETTE) {
  return {
    cover(width: number, height: number, ratio: number) {
      base.setTransform(ratio, 0, 0, ratio, 0, 0);
      grooves.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Clear the whole rounded bitmap, including fractional CSS edges.
      const bitmapWidth = Math.round(width * ratio) / ratio;
      const bitmapHeight = Math.round(height * ratio) / ratio;
      grooves.clearRect(0, 0, bitmapWidth, bitmapHeight);
      const { bed, specks, every, grain } = palette();
      if (bed) {
        base.fillStyle = bed;
        base.fillRect(0, 0, bitmapWidth, bitmapHeight);
      } else base.clearRect(0, 0, bitmapWidth, bitmapHeight);
      // A coordinate-based texture stays in place when the viewport grows.
      for (let y = 0; y < height; y += 6) {
        for (let x = 0; x < width; x += 6) {
          const seed = ((x * 7919 + y * 104729) >>> 0);
          if ((seed >>> 7) % every) continue;
          base.fillStyle = specks[(seed >>> 4) % specks.length]!;
          base.fillRect(x + seed % 5, y + (seed >>> 3) % 5, (0.7 + (seed % 3) * 0.3) * grain, 0.7 * grain);
        }
      }
    },
    draw({ from, to, width }: SandSegment) {
      const { lip, groove } = palette();
      line(base, from, to, width + 1.4, lip, 0.7);
      line(grooves, from, to, width, groove);
    }
  };
}
