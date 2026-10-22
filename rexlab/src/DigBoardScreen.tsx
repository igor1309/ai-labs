import { Sparkles, Star } from "lucide-react";
import type { AgeLevel } from "./ageLevel.ts";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { useGateShown } from "./OrientationGate.tsx";
import { BrushPicker, DigBar, FieldGuideButton } from "./DigBar.tsx";
import { Picture, PictureImage, usePicture, type PictureLook } from "./Picture.tsx";
import type { StartTimer } from "./ownedTimers.ts";

// The view and the round's timers share the durations of each arrival.
export const BOARD_DROP = { motion: 500, reduced: 160 };
export const GUST = { motion: 800, reduced: 160 };
export const LIFT = { motion: 500, reduced: 160 };
export const COUNT_SETTLE = { motion: 160, reduced: 0 };
// A found treasure glows and hops in its place for the first 40% of its
// flight, then flies into the FIELD GUIDE; under reduced motion it fades.
// Each is shorter than the gust and lift together, so a treasure found by
// the stroke that brings the gust still lands, and is kept, on the board.
export const TREASURE_FLIGHT = { motion: 1250, reduced: 300 };

export type BoardFinish = {
  newStar: boolean;
  phase: "gust" | "lift" | "counted";
  startTimer: StartTimer;
  onLifted: () => void;
};

export type DigSpotView = { id: string; x: number; y: number; r: number; found: boolean; helped: boolean };

// The treasure the sand hides: its kind and picture, its top left corner
// and its side, in the frame's pixels.
export type DigTreasureView = { kind: string; picture: string; x: number; y: number; size: number };

// A found treasure flies into the FIELD GUIDE, `onLanded` called as it
// lands there, then has landed, kept; `fresh` when it was the first of its
// kind.
export type TreasureFlight = { phase: "flying"; startTimer: StartTimer; onLanded: () => void } | { phase: "landed"; fresh: boolean };

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
  arrivalWait?: number;
  // The board has dropped in already and is given back, as from the
  // FIELD GUIDE: it shows at once, with no drop and no landing grains.
  dropped?: boolean | undefined;
  gustWait?: number;
  liftWait?: number;
  flightWait?: number;
  finish?: BoardFinish | undefined;
  // The dinosaur's body picture, under the sand, and its frame's size.
  picture: string;
  pictureLook?: PictureLook;
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
  spots: readonly DigSpotView[];
  treasure: DigTreasureView | undefined;
  treasureFlight?: TreasureFlight | undefined;
  // The round asks who it is once enough of the dinosaur shows, so the
  // board stands beside the choices' column from the start.
  asks: boolean;
  // Whether enough of the dinosaur shows for the question, kept through
  // the gust and lift after the right pick.
  questionShown: boolean;
  // How visible the choices are, from 0 to 1, as the digging shows them;
  // their empty cards take the rest.
  choicesShown: number;
  // How many slots the question's column holds from the round's start.
  choiceCount: number;
  // The round's dinosaurs, present even before the question unlocks.
  choices: readonly { id: string; name: string; picture: string; rejected: boolean; correct: boolean }[];
  // The age level the round plays.
  level: AgeLevel;
  // The picked brush's width, in CSS pixels, whatever the board's size,
  // and whether the wide brush is picked; a stroke keeps the width it
  // began with.
  brush: number;
  wide: boolean;
  // Whether the board moves, grains puff and a find shines; false for
  // the short fades of reduced motion.
  grains: boolean;
  // The dinosaurs dug up so far, out of all of them; undefined when
  // stored progress cannot be read, so there is no count to show.
  dugUp: number | undefined;
  total: number;
  // The treasures found so far, of every kind.
  treasures: number;
  sandContext: SandContext;
  onBrush: (mark: SandMark) => void;
  onPick?: (id: string) => void;
  onWide: (wide: boolean) => void;
  onHome: () => void;
  onFieldGuide?: (() => void) | undefined;
};

// The sand's colour and its grains', drawn the same on every redraw, and
// the damp sand of the bed the dinosaur lies in, darker, under the
// picture where the brush has dug.
const SAND = "#d9b77e";
const GRAIN_COLOURS = ["#c9a46a", "#e8cc98", "#b98f55"];
const BED = "#b0905f";
const BED_GRAINS = ["#a07f50", "#bf9f6c", "#94744a"];
// The canvas pixels per grain drawn over the sand.
const GRAIN_AREA = 160;
// The brush stamps along a stroke at a third of its radius, so its soft
// edges overlap into one path.
const STAMPS_PER_RADIUS = 3;
// Each stamp knocks crumbs off the sand round its rim, so the hollow's
// edge is ragged; its pale lip of loose grains lies along both sides of
// the stroke, twice over, the wider one fainter, for a soft edge.
const CRUMBS = 3;
const LIPS = [{ width: 1.5, colour: "rgba(240, 218, 172, 0.2)" }, { width: 1.3, colour: "rgba(240, 218, 172, 0.3)" }];
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

// Numbers from 0 to 1, the same ones for the same seed.
function seeded(seed: number) {
  let state = Math.abs(Math.round(seed)) % 2147483646 + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// Covers the whole canvas with `colour`, strewn with grains of `grains`.
function cover(context: CanvasRenderingContext2D, width: number, height: number, colour = SAND, grains = GRAIN_COLOURS) {
  context.globalCompositeOperation = "source-over";
  context.fillStyle = colour;
  context.fillRect(0, 0, width, height);
  const next = seeded(7);
  for (let grain = 0; grain < (width * height) / GRAIN_AREA; grain++) {
    context.fillStyle = grains[grain % grains.length] ?? colour;
    context.fillRect(next() * width, next() * height, 1 + next() * 2, 1 + next() * 2);
  }
}

// Takes the sand off along `mark` with a soft-edged round brush, `scale`
// canvas pixels to the frame's pixel, leaving a pale lip of grains on the
// sand along it and crumbs knocked off its edge. The crumbs fall where
// the mark's own seed puts them, so a redraw puts them back the same.
function clearAlong(context: CanvasRenderingContext2D, { from, to, radius }: SandMark, scale: number) {
  const reach = radius * scale;
  context.globalCompositeOperation = "source-atop";
  context.lineCap = "round";
  for (const lip of LIPS) {
    context.strokeStyle = lip.colour;
    context.lineWidth = 2 * reach * lip.width;
    context.beginPath();
    context.moveTo(from.x * scale, from.y * scale);
    context.lineTo(to.x * scale, to.y * scale);
    context.stroke();
  }
  context.globalCompositeOperation = "destination-out";
  const next = seeded(from.x * 7919 + from.y * 104729 + to.x * 31 + to.y);
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
    context.fillStyle = "#000";
    for (let crumb = 0; crumb < CRUMBS; crumb++) {
      const angle = next() * 2 * Math.PI;
      const out = reach * (0.75 + 0.2 * next());
      context.beginPath();
      context.arc(x + Math.cos(angle) * out, y + Math.sin(angle) * out, reach * (0.12 + 0.14 * next()), 0, 2 * Math.PI);
      context.fill();
    }
  }
}

// The finger, pen or mouse brushing: its pointer, the board as it was
// pressed, which stays where it is through the round, the brush's radius
// in the frame's pixels, where it last was and where its last grains
// puffed, in the frame's pixels.
type Stroke = { pointerId: number; rect: DOMRect; radius: number; last: SandPoint; puffed: SandPoint };

// A puff of grains, where it rises, as fractions of the board.
type Puff = { id: number; left: number; top: number };

const percent = (fraction: number) => `${fraction * 100}%`;

// The same body picture, enlarged and offset in a round window. Loading
// and failure occupy the disc itself, so their symbols remain readable.
function SpotPicture({ picture, frame, spot }: { picture: string; frame: { width: number; height: number }; spot: DigSpotView }) {
  const look = usePicture(picture);
  return (
    <span className="dig-spot-picture" style={{
      "--crop-width": percent(frame.width / (2 * spot.r)),
      "--crop-height": percent(frame.height / (2 * spot.r)),
      "--crop-left": percent((spot.r - spot.x) / (2 * spot.r)),
      "--crop-top": percent((spot.r - spot.y) / (2 * spot.r))
    } as CSSProperties}>
      <PictureImage look={look} src={picture} alt="" className="dig-close-up" />
    </span>
  );
}

export function DigBoardScreen({
  language,
  arrivalWait = BOARD_DROP.motion,
  dropped = false,
  gustWait = GUST.motion,
  liftWait = LIFT.motion,
  flightWait = TREASURE_FLIGHT.motion,
  finish,
  picture,
  pictureLook,
  frame,
  marks,
  clear,
  cleared,
  blown,
  spots,
  treasure,
  treasureFlight,
  asks,
  questionShown,
  choicesShown,
  choiceCount,
  choices,
  level,
  brush,
  wide,
  grains,
  dugUp,
  total,
  treasures,
  sandContext,
  onBrush,
  onPick,
  onWide,
  onHome,
  onFieldGuide
}: DigBoardScreenProps) {
  const gateShown = useGateShown();
  const text = TEXTS[language];
  const chipStar = useRef<SVGSVGElement>(null);
  const [flight, setFlight] = useState<CSSProperties>({});
  const book = useRef<SVGSVGElement>(null);
  const [treasureWay, setTreasureWay] = useState<CSSProperties>({});
  const [treasurePath, setTreasurePath] = useState("");
  // The gate stops the lift, the star's flight and the treasure's flight
  // where they are, and each starts again from its beginning as the gate
  // goes, the star and the treasure flying anew with their waits.
  const inFlight = treasureFlight?.phase === "flying" && !gateShown ? treasureFlight : undefined;
  const treasureFlying = treasure !== undefined && inFlight !== undefined;
  const lifting = finish !== undefined && finish.phase !== "gust";
  const lift = finish?.phase === "lift" && !gateShown ? finish : undefined;
  const flying = lift !== undefined && lift.newStar && dugUp !== undefined;
  // The lift's wait belongs to the board shown, so a callback delivered
  // after it stopped finishes nothing.
  useEffect(() => {
    if (!lift) return;
    let active = true;
    const stop = lift.startTimer(liftWait, () => {
      if (active) lift.onLifted();
    });
    return () => {
      active = false;
      stop();
    };
  }, [lift, liftWait]);
  // The treasure lands, and is kept, only as the flight shown ends.
  useEffect(() => {
    if (!inFlight) return;
    let active = true;
    const stop = inFlight.startTimer(flightWait, () => {
      if (active) inFlight.onLanded();
    });
    return () => {
      active = false;
      stop();
    };
  }, [inFlight, flightWait]);
  // The count ticks up as the star lands; under reduced motion it simply
  // changes.
  const shownCount = dugUp !== undefined && grains && finish?.newStar && finish.phase !== "counted" ? dugUp - 1 : dugUp;
  const board = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bed = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Stroke>(undefined);
  useLayoutEffect(() => {
    if (gateShown) stroke.current = undefined;
  }, [gateShown]);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const seenFinds = useRef(new Set(spots.filter(({ found }) => found).map(({ id }) => id)));
  const [celebrating, setCelebrating] = useState<string[]>([]);
  useEffect(() => {
    const fresh = spots.filter(({ id, found }) => found && !seenFinds.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach(({ id }) => seenFinds.current.add(id));
    if (grains) setCelebrating((current) => [...current, ...fresh.map(({ id }) => id)]);
  }, [spots, grains]);
  // The listeners on the window and the redraw read the props as they
  // are now, not as they were when they were added.
  const latest = useRef({ marks, onBrush, grains, brush, locked: blown });
  latest.current = { marks, onBrush, grains, brush, locked: blown };
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const drawn = useRef(0);

  // Measure the endpoints in viewport pixels so the flight reaches the
  // chip even when the reserved column or the viewport changes size.
  useLayoutEffect(() => {
    if (!flying) return;
    const measure = () => {
      const from = board.current?.getBoundingClientRect();
      const to = chipStar.current?.getBoundingClientRect();
      if (!from || !to) return;
      const x = to.left + to.width / 2;
      const y = to.top + to.height / 2;
      setFlight({ left: x, top: y, "--star-x": `${from.left + from.width / 2 - x}px`, "--star-y": `${from.top + from.height / 2 - y}px` } as CSSProperties);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [flying]);

  // The treasure flies from its place on the board to the FIELD GUIDE's
  // book, measured as the star's flight is.
  useLayoutEffect(() => {
    if (!treasureFlying) return;
    const measure = () => {
      const from = board.current?.getBoundingClientRect();
      const to = book.current?.getBoundingClientRect();
      if (!from || !to) return;
      const x = to.left + to.width / 2;
      const y = to.top + to.height / 2;
      const middleX = from.left + ((treasure.x + treasure.size / 2) * from.width) / frame.width;
      const middleY = from.top + ((treasure.y + treasure.size / 2) * from.height) / frame.height;
      setTreasureWay({ left: x, top: y, width: (treasure.size * from.width) / frame.width, "--treasure-x": `${middleX - x}px`, "--treasure-y": `${middleY - y}px` } as CSSProperties);
      setTreasurePath(`M ${middleX} ${middleY} L ${x} ${y}`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [treasureFlying, treasure, frame.width, frame.height]);

  // The canvases are as large as the board shows, so the sand is sharp at
  // any size: on every resize the bed and any remaining sand are covered
  // anew and every mark taken off again, scaled with the board. After the
  // gust only the bed remains.
  useLayoutEffect(() => {
    const element = canvas.current ?? bed.current;
    if (!element) return;
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = pixelRatio();
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      if (bed.current) {
        bed.current.width = element.width;
        bed.current.height = element.height;
        const under = sandContext(bed.current);
        if (under) cover(under, element.width, element.height, BED, BED_GRAINS);
      }
      context.current = canvas.current ? sandContext(canvas.current) : null;
      drawn.current = 0;
      if (!context.current) return;
      cover(context.current, element.width, element.height);
      for (const mark of latest.current.marks) clearAlong(context.current, mark, element.width / frame.width);
      drawn.current = latest.current.marks.length;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [sandContext, frame.width, lifting]);

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
      if (!current || latest.current.locked || event.pointerId !== current.pointerId) return;
      const at = toFrame(current.rect, event.clientX, event.clientY);
      latest.current.onBrush({ from: current.last, to: at, radius: current.radius });
      current.last = at;
      puff(current, at, false);
    };
    const end = (event: PointerEvent) => {
      if (stroke.current?.pointerId !== event.pointerId) return;
      stroke.current = undefined;
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
    puff(current, at, true);
  };

  // The gust ends any stroke; the choices showing do not.
  useEffect(() => {
    if (blown) stroke.current = undefined;
  }, [blown]);

  return (
    <main className="dig-screen dig-board-screen" data-motion={grains || undefined}
      style={{ "--dig-drop": `${arrivalWait}ms`, "--dig-gust": `${gustWait}ms`, "--dig-lift": `${liftWait}ms`, "--dig-treasure": `${flightWait}ms` } as CSSProperties}>
      <div className="stratum stratum-1" aria-hidden="true" />
      <DigBar language={language} title={questionShown ? text.whoIsIt : text.dig} onHome={onHome}>
        <BrushPicker language={language} wide={wide} disabled={blown} onWide={onWide} />
        <FieldGuideButton language={language} count={treasures} motion={grains} bookRef={book} onFieldGuide={onFieldGuide}
          landed={treasureFlight?.phase === "landed" ? (treasureFlight.fresh ? "new" : "again") : undefined} />
        {dugUp !== undefined && (
          <p className="dig-chip" aria-label={text.dugUp} data-counted={finish?.phase === "counted" || undefined}>
            <Star ref={chipStar} size={20} aria-hidden="true" />
            <span>{shownCount}/{total}</span>
          </p>
        )}
      </DigBar>
      {flying && <Star className="dig-board-star" size={24} aria-hidden="true" style={flight} />}
      {treasureFlying && grains && treasurePath && <svg className="dig-treasure-route" aria-hidden="true">
        <path d={treasurePath} pathLength="1" />
      </svg>}
      {treasureFlying && grains && <span className="dig-treasure-flight" data-kind={treasure.kind} aria-hidden="true" style={treasureWay}>
        <Picture className="dig-treasure-picture" src={treasure.picture} alt="" width={400} height={400} />
      </span>}
      <div className="dig-body" data-asks={asks || undefined}>
        <div
          ref={board}
          className="dig-board"
          role="group"
          aria-label={text.sand}
          data-clear={clear}
          data-cleared={cleared}
          data-blown={blown || undefined}
          data-lifting={lifting || undefined}
          data-dropped={dropped || undefined}
          data-level={level}
          data-found={spots.filter(({ found }) => found).map(({ id }) => id).join(" ")}
          data-helped={spots.filter(({ helped }) => helped).map(({ id }) => id).join(" ")}
          style={{ "--frame-width": frame.width, "--frame-height": frame.height } as CSSProperties}
          onPointerDown={press}
          onContextMenu={(event) => event.preventDefault()}
        >
          {treasureFlying && <span className="dig-treasure-name" aria-live="polite"
            style={{ left: percent((treasure.x + treasure.size / 2) / frame.width), top: percent((treasure.y + treasure.size) / frame.height) }}>
            {text.treasures[treasure.kind as keyof typeof text.treasures]}
          </span>}
          <div className="dig-board-surface">
            <canvas ref={bed} className="dig-bed" aria-hidden="true" />
            {pictureLook ? <PictureImage look={pictureLook} className="dig-picture" src={picture} alt="" width={frame.width} height={frame.height} /> : <Picture className="dig-picture" src={picture} alt="" width={frame.width} height={frame.height} />}
            {treasure && !lifting && treasureFlight === undefined && <span className="dig-treasure" data-kind={treasure.kind} aria-hidden="true"
              style={{ left: percent(treasure.x / frame.width), top: percent(treasure.y / frame.height), width: percent(treasure.size / frame.width), height: percent(treasure.size / frame.height) }}>
              <Picture className="dig-treasure-picture" src={treasure.picture} alt="" width={400} height={400} />
            </span>}
            {!lifting && <canvas ref={canvas} className="dig-sand" aria-hidden="true" />}
            {treasure && treasureFlying && <span className="dig-treasure-found" data-kind={treasure.kind} aria-hidden="true"
              style={{ left: percent(treasure.x / frame.width), top: percent(treasure.y / frame.height), width: percent(treasure.size / frame.width), height: percent(treasure.size / frame.height) }}>
              <Picture className="dig-treasure-picture" src={treasure.picture} alt="" width={400} height={400} />
            </span>}
            {spots.filter(({ helped, found }) => helped && !found && !blown).map((spot) => (
              <span key={spot.id} className="dig-help-window" data-spot={spot.id} data-motion={grains || undefined} aria-hidden="true"
                style={{ left: percent((spot.x - spot.r) / frame.width), top: percent((spot.y - spot.r) / frame.height), width: percent(2 * spot.r / frame.width), height: percent(2 * spot.r / frame.height) }}>
                <SpotPicture picture={picture} frame={frame} spot={spot} />
              </span>
            ))}
            {spots.filter(({ id }) => celebrating.includes(id)).map((spot) => (
              <span key={spot.id} className="dig-find-pop" aria-hidden="true" data-spot={spot.id}
                style={{ left: percent(spot.x / frame.width), top: percent(spot.y / frame.height) }}
                onAnimationEnd={(event) => { if (event.target === event.currentTarget) setCelebrating((current) => current.filter((id) => id !== spot.id)); }}>
                <span className="dig-detail-ring" />
                <Star className="dig-detail-star" size={30} />
                <Sparkles className="dig-detail-sparkle" size={48} />
              </span>
            ))}
            {grains &&
              puffs.map((each) => (
                <span key={each.id} className="dig-puff" aria-hidden="true" style={{ left: percent(each.left), top: percent(each.top) }}>
                  {Array.from({ length: PUFF_GRAINS }, (_, grain) => (
                    <span key={grain} className="dig-grain" style={GRAIN_WAYS[grain]} />
                  ))}
                </span>
              ))}
          </div>
          {grains && !lifting && !dropped && <span className="dig-landing" aria-hidden="true">
            {Array.from({ length: 12 }, (_, grain) => <span key={grain} className="dig-grain" style={{ left: `${grain * 100 / 11}%`, "--grain-x": (grain - 5.5) / 3, "--grain-y": -1 - grain % 3 } as CSSProperties} />)}
          </span>}
        </div>
        {/* Both cards occupy the same slot so digging changes only their
            opacity, never the board's position or the choice's identity. */}
        {asks && <div className="dig-choice-cards" role={questionShown ? "group" : undefined}
          aria-label={questionShown ? text.whoIsIt : undefined} aria-hidden={questionShown ? undefined : true}>
          {Array.from({ length: choiceCount }, (_, at) => {
            const card = choices[at];
            return (
              <div key={at} className="dig-choice-slot">
                <span className="dig-empty-card" aria-hidden="true" style={{ opacity: 1 - choicesShown }}>?</span>
                {card && <Button className="dig-choice-card" data-choice={card.id} data-rejected={card.rejected || undefined} data-correct={card.correct || undefined}
                  style={{ opacity: choicesShown }} disabled={!questionShown || blown || card.rejected} tabIndex={questionShown ? undefined : -1}
                  aria-label={`${text.whoIsIt}: ${card.name.toLocaleUpperCase(language)}${card.correct ? `: ${text.digChoice.right}` : card.rejected ? `: ${text.digChoice.tryAnother}` : ""}`} onClick={() => onPick?.(card.id)}>
                  <Picture className="dig-choice-picture" src={card.picture} alt="" width={800} height={600} />
                  <span className="dig-choice-name" style={{ "--letters": card.name.length } as CSSProperties}>{card.name.toLocaleUpperCase(language)}</span>
                  {card.correct && <span className="dig-choice-mark dig-choice-mark-correct" aria-hidden="true">✓</span>}
                  {card.rejected && <span className="dig-choice-mark dig-choice-mark-rejected" aria-hidden="true">↻ {text.digChoice.tryAnother}</span>}
                </Button>}
              </div>
            );
          })}
        </div>}
      </div>
    </main>
  );
}
