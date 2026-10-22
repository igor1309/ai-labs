import type { SandPoint, SandSegment } from "./sandWriting.ts";

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
export function sandWritingCanvas(base: CanvasRenderingContext2D, grooves: CanvasRenderingContext2D) {
  return {
    cover(width: number, height: number, ratio: number) {
      base.setTransform(ratio, 0, 0, ratio, 0, 0);
      grooves.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Clear the whole rounded bitmap, including fractional CSS edges.
      const bitmapWidth = Math.round(width * ratio) / ratio;
      const bitmapHeight = Math.round(height * ratio) / ratio;
      grooves.clearRect(0, 0, bitmapWidth, bitmapHeight);
      base.fillStyle = "#d9b77e";
      base.fillRect(0, 0, bitmapWidth, bitmapHeight);
      // A coordinate-based texture stays in place when the viewport grows.
      for (let y = 0; y < height; y += 6) {
        for (let x = 0; x < width; x += 6) {
          const seed = ((x * 7919 + y * 104729) >>> 0);
          base.fillStyle = (seed >>> 4) % 2 ? "#e8cc98" : "#c9a46a";
          base.fillRect(x + seed % 5, y + (seed >>> 3) % 5, 0.7 + (seed % 3) * 0.3, 0.7);
        }
      }
    },
    draw({ from, to, width }: SandSegment) {
      line(base, from, to, width + 1.4, "#f0daac", 0.7);
      line(grooves, from, to, width, "#98723f");
    }
  };
}
