export type PaintedPath = { colour: string | CanvasGradient | CanvasPattern; width: number; points: number[][]; rounded: boolean };

// The renderer's canvas boundary: paths and the CSS-to-bitmap transform,
// without replacing the stroke model or the rendering policy.
export function writingCanvasSpy() {
  const paths: PaintedPath[] = [];
  const rectangles: { colour: string | CanvasGradient | CanvasPattern; box: number[] }[] = [];
  const transforms: number[][] = [];
  const cleared: number[][] = [];
  let points: number[][] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    beginPath: () => { points = []; },
    moveTo: (x: number, y: number) => { points.push([x, y]); },
    lineTo: (x: number, y: number) => { points.push([x, y]); },
    arc: (x: number, y: number, radius: number) => { points.push([x, y, radius]); },
    stroke: () => { paths.push({ colour: context.strokeStyle, width: context.lineWidth, points, rounded: context.lineCap === "round" && context.lineJoin === "round" }); },
    fill: () => { paths.push({ colour: context.fillStyle, width: context.lineWidth, points, rounded: true }); },
    fillRect: (...box: number[]) => { rectangles.push({ colour: context.fillStyle, box }); },
    clearRect: (...box: number[]) => { cleared.push(box); },
    setTransform: (...transform: number[]) => { transforms.push(transform); }
  };
  return { context: context as unknown as CanvasRenderingContext2D, paths, rectangles, transforms, cleared };
}
