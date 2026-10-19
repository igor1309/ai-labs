import { Star } from "lucide-react";
import type { AgeLevel } from "./ageLevel.ts";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { DigBar } from "./DigBar.tsx";
import { Picture } from "./Picture.tsx";

// A point on the body picture, in the pixels of its frame.
export type SandPoint = { x: number; y: number };

// A stroke of the brush across the sand, a tap from a point to itself,
// `radius` wide either side, in the frame's pixels.
export type SandMark = { from: SandPoint; to: SandPoint; radius: number };

// The 2D context the sand is drawn with on its canvas, or null where the
// browser draws none.
export type SandContext = (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;

export type DigBoardScreenProps = {
  language: Language;
  // The dinosaur's body picture, under the sand, and its frame's size.
  picture: string;
  frame: { width: number; height: number };
  // Every stroke brushed so far, in order.
  marks: readonly SandMark[];
  // Which cells are clear, as rows of 0 and 1 joined by spaces, and the
  // share of the dinosaur's cells that are, for what cannot read the
  // canvas.
  clear: string;
  cleared: number;
  // The gust has blown the rest of the sand away.
  blown: boolean;
  // The age level the round plays.
  level: AgeLevel;
  // The brush's width, in CSS pixels, whatever the board's size.
  brush: number;
  // Whether grains puff from the brush: not with reduced motion.
  grains: boolean;
  // The dinosaurs dug up so far, out of all of them; undefined when
  // stored progress cannot be read, so there is no count to show.
  dugUp: number | undefined;
  total: number;
  sandContext: SandContext;
  onBrush: (mark: SandMark) => void;
  onHome: () => void;
};

// The sand's colour and its grains', drawn the same on every redraw.
const SAND = "#d9b77e";
const GRAIN_COLOURS = ["#c9a46a", "#e8cc98", "#b98f55"];
// The canvas pixels per grain drawn over the sand.
const GRAIN_AREA = 160;
// The brush stamps along a stroke at a third of its radius, so its soft
// edges overlap into one path.
const STAMPS_PER_RADIUS = 3;
// The grains of one puff, and the most puffs in the air at once.
const PUFF_GRAINS = 6;
const PUFFS = 3;
// The way each grain of a puff flies, spread round the brush.
const GRAIN_WAYS = Array.from({ length: PUFF_GRAINS }, (_, grain): CSSProperties => {
  const angle = (2 * Math.PI * grain) / PUFF_GRAINS - Math.PI / 2;
  return { "--grain-x": Math.cos(angle).toFixed(2), "--grain-y": Math.sin(angle).toFixed(2) } as CSSProperties;
});

// The canvas pixels per CSS pixel: twice on a Retina screen, never more,
// as the sand is soft and a larger canvas only costs.
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

// Covers the whole canvas with sand.
function cover(context: CanvasRenderingContext2D, width: number, height: number) {
  context.globalCompositeOperation = "source-over";
  context.fillStyle = SAND;
  context.fillRect(0, 0, width, height);
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let grain = 0; grain < (width * height) / GRAIN_AREA; grain++) {
    context.fillStyle = GRAIN_COLOURS[grain % GRAIN_COLOURS.length] ?? SAND;
    context.fillRect(next() * width, next() * height, 1 + next() * 2, 1 + next() * 2);
  }
}

// Takes the sand off along `mark` with a soft-edged round brush, `scale`
// canvas pixels to the frame's pixel.
function clearAlong(context: CanvasRenderingContext2D, { from, to, radius }: SandMark, scale: number) {
  context.globalCompositeOperation = "destination-out";
  const reach = radius * scale;
  const stamps = Math.ceil((Math.hypot(to.x - from.x, to.y - from.y) * scale * STAMPS_PER_RADIUS) / reach);
  for (let stamp = 0; stamp <= stamps; stamp++) {
    const along = stamps === 0 ? 0 : stamp / stamps;
    const x = (from.x + (to.x - from.x) * along) * scale;
    const y = (from.y + (to.y - from.y) * along) * scale;
    const soft = context.createRadialGradient(x, y, 0, x, y, reach);
    soft.addColorStop(0, "rgba(0, 0, 0, 1)");
    soft.addColorStop(0.6, "rgba(0, 0, 0, 0.9)");
    soft.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = soft;
    context.beginPath();
    context.arc(x, y, reach, 0, 2 * Math.PI);
    context.fill();
  }
}

// The finger, pen or mouse brushing: its pointer, the board as it was
// pressed, the brush's radius in the frame's pixels, where it last was
// and where its last grains puffed, in the frame's pixels.
type Stroke = { pointerId: number; rect: DOMRect; radius: number; last: SandPoint; puffed: SandPoint };

// A puff of grains, where it rises, as fractions of the board.
type Puff = { id: number; left: number; top: number };

const percent = (fraction: number) => `${fraction * 100}%`;

export function DigBoardScreen({
  language,
  picture,
  frame,
  marks,
  clear,
  cleared,
  blown,
  level,
  brush,
  grains,
  dugUp,
  total,
  sandContext,
  onBrush,
  onHome
}: DigBoardScreenProps) {
  const text = TEXTS[language];
  const board = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Stroke>(undefined);
  const [brushAt, setBrushAt] = useState<SandPoint>();
  const [puffs, setPuffs] = useState<Puff[]>([]);
  // The listeners on the window and the redraw read the props as they
  // are now, not as they were when they were added.
  const latest = useRef({ marks, onBrush, grains, brush });
  latest.current = { marks, onBrush, grains, brush };
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const drawn = useRef(0);

  // The canvas is as large as the board shows, so the sand is sharp at
  // any size: on every resize it is covered anew and every mark taken off
  // again, scaled with the board.
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = pixelRatio();
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.current = sandContext(element);
      drawn.current = 0;
      if (!context.current) return;
      cover(context.current, element.width, element.height);
      for (const mark of latest.current.marks) clearAlong(context.current, mark, element.width / frame.width);
      drawn.current = latest.current.marks.length;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [sandContext, frame.width]);

  // Each new mark is taken off the sand already drawn.
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || !context.current) return;
    for (const mark of marks.slice(drawn.current)) clearAlong(context.current, mark, element.width / frame.width);
    drawn.current = marks.length;
  }, [marks, frame.width]);

  const toFrame = (rect: DOMRect, x: number, y: number): SandPoint => ({ x: ((x - rect.left) * frame.width) / rect.width, y: ((y - rect.top) * frame.height) / rect.height });

  // Grains puff from the brush each time it has moved half its width.
  const puff = (current: Stroke, at: SandPoint, force: boolean) => {
    if (!latest.current.grains) return;
    if (!force && Math.hypot(at.x - current.puffed.x, at.y - current.puffed.y) < current.radius) return;
    current.puffed = at;
    setPuffs((all) => [...all.slice(1 - PUFFS), { id: (all.at(-1)?.id ?? 0) + 1, left: at.x / frame.width, top: at.y / frame.height }]);
  };

  // Only the pointer that pressed first brushes, so a second finger
  // neither brushes nor stops the first. Moves and the release are
  // followed on the window, so the brush keeps on past the board's edge.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = stroke.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const at = toFrame(current.rect, event.clientX, event.clientY);
      latest.current.onBrush({ from: current.last, to: at, radius: current.radius });
      current.last = at;
      setBrushAt(at);
      puff(current, at, false);
    };
    const end = (event: PointerEvent) => {
      if (stroke.current?.pointerId !== event.pointerId) return;
      stroke.current = undefined;
      setBrushAt(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  // A press brushes the spot under it at once, so a tap clears a round
  // spot. The brush is a set number of CSS pixels wide, so its radius in
  // the frame's pixels follows the board's size as it is pressed.
  const press = (event: ReactPointerEvent) => {
    const rect = board.current?.getBoundingClientRect();
    if (stroke.current || blown || event.button !== 0 || !rect || rect.width === 0) return;
    const at = toFrame(rect, event.clientX, event.clientY);
    const current = { pointerId: event.pointerId, rect, radius: (brush / 2) * (frame.width / rect.width), last: at, puffed: at };
    stroke.current = current;
    onBrush({ from: at, to: at, radius: current.radius });
    setBrushAt(at);
    puff(current, at, true);
  };

  // The gust ends any stroke: the sand is gone.
  useEffect(() => {
    if (!blown) return;
    stroke.current = undefined;
    setBrushAt(undefined);
  }, [blown]);

  return (
    <main className="dig-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <DigBar language={language} onHome={onHome}>
        {dugUp !== undefined && (
          <p className="dig-chip" aria-label={text.dugUp}>
            <Star size={20} aria-hidden="true" />
            {dugUp}/{total}
          </p>
        )}
      </DigBar>
      <div className="dig-body">
        <div
          ref={board}
          className="dig-board"
          role="group"
          aria-label={text.sand}
          data-clear={clear}
          data-cleared={cleared}
          data-blown={blown || undefined}
          data-level={level}
          style={{ "--frame-width": frame.width, "--frame-height": frame.height, "--brush": `${brush}px` } as CSSProperties}
          onPointerDown={press}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Picture className="dig-picture" src={picture} alt="" width={frame.width} height={frame.height} />
          <canvas ref={canvas} className="dig-sand" aria-hidden="true" />
          {grains &&
            puffs.map((each) => (
              <span key={each.id} className="dig-puff" aria-hidden="true" style={{ left: percent(each.left), top: percent(each.top) }}>
                {Array.from({ length: PUFF_GRAINS }, (_, grain) => (
                  <span key={grain} className="dig-grain" style={GRAIN_WAYS[grain]} />
                ))}
              </span>
            ))}
          {brushAt && <span className="dig-brush" aria-hidden="true" style={{ left: percent(brushAt.x / frame.width), top: percent(brushAt.y / frame.height) }} />}
        </div>
      </div>
    </main>
  );
}
