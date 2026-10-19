import { Bone, RotateCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture, usePicture } from "./Picture.tsx";
import { SkeletonBar } from "./SkeletonBar.tsx";

// A piece, by its id in its cut.
export type ShownPiece = string;

// The body area whose colour a piece and its empty slot carry, as a cue
// to where it goes.
export type ShownArea = "head" | "neck" | "back" | "hips" | "legs" | "tail";

// Where a piece goes on the outline, as fractions of the outline's width
// and height, and whether it is fitted there, with the piece's name and
// picture, and its body area when the puzzle is coloured by area.
export type SkeletonSlotView = {
  piece: ShownPiece;
  name: string;
  picture: string;
  area: ShownArea | undefined;
  left: number;
  top: number;
  width: number;
  height: number;
  fitted: boolean;
};

// Another skeleton's bone in the tray, which fits nowhere: its name, its
// picture and its size, as fractions of the outline's width and height.
export type ShownStray = { piece: ShownPiece; name: string; picture: string; width: number; height: number };

// A point on the outline, in pixels of the skeleton's frame.
export type FramePoint = { x: number; y: number };

// Help's step: Hatchling's glow on a piece and its slot, or the ladder's,
// each adding to the ones before: the piece's body region on the outline,
// a faint ghost of it at its home, then the piece moving towards its home
// and back.
export type ShownHelpStep = "glow" | "region" | "ghost" | "move";

// Part of the outline, as fractions of its width and height.
export type ShownRegion = { left: number; top: number; width: number; height: number };

// The piece help points at, the step it has reached and, on the ladder,
// the body region it shows.
export type ShownHint = { piece: ShownPiece; step: ShownHelpStep; region: ShownRegion | undefined };

export type SkeletonPuzzleScreenProps = {
  language: Language;
  // The dinosaur being built.
  name: string;
  // The whole skeleton, drawn faint as the outline the pieces fit on, or
  // as its `silhouette` alone, with no bone drawn in it, and its frame's
  // size.
  outline: string;
  silhouette: boolean;
  // Whether a held piece's home is outlined, so the youngest see where it
  // goes; older children find it themselves.
  homeShown: boolean;
  frame: { width: number; height: number };
  // Every piece's slot, in the cut's order: a piece not yet fitted waits
  // in its spot in the tray, and a fitted one leaves its spot empty, so
  // the other pieces never move.
  slots: readonly SkeletonSlotView[];
  // Other skeletons' bones in the tray, and the order of every spot in
  // it, the pieces' and theirs.
  strays: readonly ShownStray[];
  tray: readonly ShownPiece[];
  // The name of the other skeleton's bone last dropped, until the next
  // drop, so a line says whose bone it is.
  told: string | undefined;
  // Whether a tap on a piece in the tray turns it, and how many quarter
  // turns, clockwise, each piece of the cut lies turned; none for one the
  // right way up.
  turning: boolean;
  turns: Readonly<Partial<Record<ShownPiece, number>>>;
  // The help showing, if any: Hatchling's glow on the piece and its slot
  // alike, or the ladder's steps.
  hint: ShownHint | undefined;
  // Every piece is fitted.
  complete: boolean;
  // The skeleton was knocked down from its stand: each piece scatters from
  // its home on the outline to its spot in the tray as the puzzle starts.
  scatter: boolean;
  // A piece let go with its centre at `centre`, and how far from its home
  // it still fits, both in pixels of the frame.
  onDrop: (piece: ShownPiece, centre: FramePoint, reach: number) => void;
  // A piece of the cut tapped in the tray, on a puzzle that turns.
  onTurn: (piece: ShownPiece) => void;
  // Help's last step has shown: a piece moved towards its home.
  onLastStep: () => void;
  onMuseum: () => void;
  onHome: () => void;
};

// A spot in the tray: a piece of the cut, or another skeleton's bone,
// which is never fitted and has no body area.
type TraySpot = Pick<SkeletonSlotView, "piece" | "name" | "picture" | "area" | "fitted">;

// The most spots the tray stacks in one column before it needs two.
const TRAY_COLUMN = 4;

// How near its home a dropped piece's centre fits, in CSS pixels:
// generous, so a child's near miss still fits.
export const SNAP = 48;

// How far a pointer may move between pressing a piece and letting it go
// for it to be a tap, in CSS pixels.
export const TAP = 12;

// A quarter turn and the number of them that bring a piece back.
const QUARTER = 90;
const QUARTERS = 4;

// A piece held by a finger, a pen or the mouse: where the pointer is and
// where it pressed, the size the piece is drawn at on the board, and the
// help showing as it was picked up, which stays as it is until the piece
// is let go.
type Hold = { pointerId: number; piece: ShownPiece; x: number; y: number; from: { x: number; y: number }; width: number; height: number; hint: ShownHint | undefined };

// Where a piece was let go, from the centre of its slot and of its spot in
// the tray, in CSS pixels, so it slides from there to whichever it ends
// in. Each release has its own count, so each one slides anew.
type Offset = { dx: number; dy: number };
type Release = { slot: Offset; spot: Offset; count: number };

const percent = (fraction: number) => `${fraction * 100}%`;

const NO_RECT = { left: 0, top: 0, width: 0, height: 0 };

// A picture turned by its quarters, or as it is for none.
const turnStyle = (quarters: number): CSSProperties | undefined => (quarters === 0 ? undefined : { rotate: `${quarters * QUARTER}deg` });

const offsetFrom = (x: number, y: number, { left, top, width, height }: typeof NO_RECT): Offset => ({ dx: x - (left + width / 2), dy: y - (top + height / 2) });

const fromStyle = ({ dx, dy }: Offset) => ({ "--from-x": `${dx}px`, "--from-y": `${dy}px` }) as CSSProperties;

// Where a scattered piece starts, from the centre of its picture in the
// tray, and how much larger it is drawn in its home than there.
type Scattered = Offset & { scale: number };

export function SkeletonPuzzleScreen({
  language,
  name,
  outline,
  silhouette,
  homeShown,
  frame,
  slots,
  strays,
  tray,
  told,
  turning,
  turns,
  hint,
  complete,
  scatter,
  onDrop,
  onTurn,
  onLastStep,
  onMuseum,
  onHome
}: SkeletonPuzzleScreenProps) {
  const text = TEXTS[language];
  const fitted = slots.filter((slot) => slot.fitted).length;
  const [held, setHeld] = useState<Hold>();
  const [releases, setReleases] = useState<Partial<Record<ShownPiece, Release>>>({});
  const [scattered, setScattered] = useState<Partial<Record<ShownPiece, Scattered>>>({});
  // How many whole turns each piece has made from tapping, so it turns on
  // clockwise from three quarters, never back.
  const [laps, setLaps] = useState<Partial<Record<ShownPiece, number>>>({});
  // The listeners on the window read the hold as it is now, not as it was
  // when they were rendered.
  const hold = useRef<Hold>(undefined);
  const boardElement = useRef<HTMLDivElement>(null);
  const spotElements = useRef(new Map<ShownPiece, HTMLElement>());

  const holdPiece = (next: Hold | undefined) => {
    hold.current = next;
    setHeld(next);
  };

  const boardRect = () => boardElement.current?.getBoundingClientRect() ?? NO_RECT;

  // The rectangle of a piece's slot on the screen. Another skeleton's
  // bone has no slot, only its size on the board.
  const slotRect = (piece: ShownPiece) => {
    const board = boardRect();
    const slot: Omit<ShownStray, "name" | "picture"> & { left?: number; top?: number } | undefined = slots.find((each) => each.piece === piece) ?? strays.find((each) => each.piece === piece);
    if (!slot) return NO_RECT;
    const { left = 0, top = 0, width, height } = slot;
    return { left: board.left + left * board.width, top: board.top + top * board.height, width: width * board.width, height: height * board.height };
  };

  // Only the puzzle as it starts scatters: each piece is measured where
  // the puzzle first lays it out, before it is painted, so it is first
  // seen whole in its home. The picture keeps its home's shape, so it is
  // drawn as wide as its spot lets it.
  useLayoutEffect(() => {
    if (!scatter) return;
    setScattered(
      Object.fromEntries(
        slots.map(({ piece }) => {
          const home = slotRect(piece);
          const picture = spotElements.current.get(piece)?.querySelector(".skeleton-piece")?.getBoundingClientRect() ?? NO_RECT;
          const drawn = Math.min(picture.width, home.height === 0 ? 0 : (picture.height * home.width) / home.height);
          const { dx, dy } = offsetFrom(home.left + home.width / 2, home.top + home.height / 2, picture);
          return [piece, { dx, dy, scale: drawn === 0 ? 1 : home.width / drawn }];
        })
      )
    );
  }, []);

  // Only the pointer that holds a piece moves it, so a second finger
  // neither picks up nor drops anything while one piece is held. A piece
  // let go is dropped where it is; one whose touch is cancelled, as when
  // the iPad turns, goes back to the tray without a drop. On a puzzle that
  // turns, a piece of the cut let go where it was pressed is tapped: it
  // turns in its spot instead. The listeners are added anew on each
  // render, so they drop on the board as it is.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = hold.current;
      if (!current || event.pointerId !== current.pointerId) return;
      holdPiece({ ...current, x: event.clientX, y: event.clientY });
    };
    const end = (event: PointerEvent) => {
      const current = hold.current;
      if (!current || event.pointerId !== current.pointerId) return;
      holdPiece(undefined);
      const { piece, from } = current;
      if (event.type === "pointerup" && turning && slots.some((slot) => slot.piece === piece) && Math.hypot(event.clientX - from.x, event.clientY - from.y) < TAP) {
        if ((turns[piece] ?? 0) === QUARTERS - 1) setLaps((all) => ({ ...all, [piece]: (all[piece] ?? 0) + 1 }));
        onTurn(piece);
        return;
      }
      const [x, y] = event.type === "pointerup" ? [event.clientX, event.clientY] : [current.x, current.y];
      const spot = spotElements.current.get(piece)?.getBoundingClientRect() ?? NO_RECT;
      const slot = offsetFrom(x, y, slotRect(piece));
      setReleases((all) => ({ ...all, [piece]: { slot, spot: offsetFrom(x, y, spot), count: (all[piece]?.count ?? 0) + 1 } }));
      const board = boardRect();
      if (event.type !== "pointerup" || board.width === 0) return;
      const scale = frame.width / board.width;
      onDrop(piece, { x: (x - board.left) * scale, y: (y - board.top) * scale }, SNAP * scale);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  });

  // A piece is picked up at the size it fits on the board, centred under
  // the pointer.
  const press = (piece: ShownPiece) => (event: ReactPointerEvent) => {
    if (hold.current || event.button !== 0) return;
    const { width, height } = slotRect(piece);
    holdPiece({ pointerId: event.pointerId, piece, x: event.clientX, y: event.clientY, from: { x: event.clientX, y: event.clientY }, width, height, hint });
  };

  // Help that falls due while a piece is held waits until it is let go,
  // so nothing new lights up or moves under the child's finger.
  const shownHint = held ? held.hint : hint;

  // Help's last step moves its piece from its spot towards its home and
  // back, measured as the step shows, which is when the game learns it
  // has.
  const [nudge, setNudge] = useState<Offset & { piece: ShownPiece }>();
  const moving = shownHint?.step === "move" ? shownHint.piece : undefined;
  useLayoutEffect(() => {
    if (moving === undefined) {
      setNudge(undefined);
      return;
    }
    const home = slotRect(moving);
    const spot = spotElements.current.get(moving)?.getBoundingClientRect() ?? NO_RECT;
    const { dx, dy } = offsetFrom(home.left + home.width / 2, home.top + home.height / 2, spot);
    setNudge({ piece: moving, dx, dy });
    onLastStep();
  }, [moving]);

  // Each spot in the tray, in its order: a piece of the cut, or another
  // skeleton's bone, which is never fitted.
  const spots = tray.flatMap((piece): TraySpot[] => {
    const slot = slots.find((each) => each.piece === piece);
    if (slot) return [slot];
    return strays.filter((stray) => stray.piece === piece).map(({ name, picture }) => ({ piece, name, picture, area: undefined, fitted: false }));
  });
  const lifted = held && spots.find((spot) => spot.piece === held.piece);
  const glowing = shownHint?.step === "glow" ? shownHint.piece : undefined;
  const ghost = shownHint?.step === "ghost" || shownHint?.step === "move" ? shownHint.piece : undefined;
  const region = shownHint?.region;
  // The quarters a piece is drawn turned by, counting its whole turns.
  const quartersOf = (piece: ShownPiece) => (turns[piece] ?? 0) + QUARTERS * (laps[piece] ?? 0);

  return (
    <main className="skeleton-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <SkeletonBar language={language} title={name.toLocaleUpperCase(language)} onMuseum={onMuseum} onHome={onHome}>
        <p className="skeleton-chip" aria-label={text.fitted}>
          <Bone size={20} aria-hidden="true" />
          {fitted}/{slots.length}
        </p>
      </SkeletonBar>
      <div className="skeleton-puzzle">
        <div
          ref={boardElement}
          className="skeleton-board"
          role="group"
          aria-label={text.skeleton}
          data-complete={complete || undefined}
          style={{ "--frame-width": frame.width, "--frame-height": frame.height } as CSSProperties}
        >
          {/* The outline is faint and comes in with the screen on a wrapper,
              so its picture's shimmer and fade never replace either. */}
          <span className="skeleton-outline" data-silhouette={silhouette || undefined}>
            {silhouette ? (
              <Silhouette src={outline} />
            ) : (
              <Picture className="skeleton-outline-picture" src={outline} alt="" />
            )}
          </span>
          {region && (
            <span
              key={shownHint?.piece}
              className="skeleton-region"
              aria-hidden="true"
              style={{ left: `calc(${percent(region.left)} - 12px)`, top: `calc(${percent(region.top)} - 12px)`, width: `calc(${percent(region.width)} + 24px)`, height: `calc(${percent(region.height)} + 24px)` }}
            />
          )}
          {slots.map((slot) => {
            const release = releases[slot.piece];
            return (
              <span
                key={slot.piece}
                className="skeleton-slot"
                data-piece={slot.piece}
                data-state={slot.fitted ? "fitted" : "empty"}
                data-target={(homeShown && held?.piece === slot.piece) || undefined}
                data-hint={glowing === slot.piece || undefined}
                data-area={(!slot.fitted && slot.area) || undefined}
                style={{ left: percent(slot.left), top: percent(slot.top), width: percent(slot.width), height: percent(slot.height) }}
              >
                {glowing === slot.piece && <span className="skeleton-glow" aria-hidden="true" />}
                {/* An empty slot of a coloured puzzle shows its bone's
                    shape in its body area's colour. */}
                {!slot.fitted && slot.area && <span className="skeleton-slot-area" aria-hidden="true" style={{ "--piece-picture": `url("${slot.picture}")` } as CSSProperties} />}
                {/* The piece settles on a wrapper, so its picture's
                    shimmer and fade never replace the movement. */}
                {/* Help's ghost of the piece, faint in its slot, which
                    nothing can pick up. */}
                {!slot.fitted && ghost === slot.piece && (
                  <span className="skeleton-ghost" aria-hidden="true">
                    <Picture className="skeleton-ghost-picture" src={slot.picture} alt="" />
                  </span>
                )}
                {slot.fitted && (
                  <span className="skeleton-fitted" data-snapped={release ? true : undefined} style={release && fromStyle(release.slot)}>
                    <Picture className="skeleton-fitted-picture" src={slot.picture} alt={slot.name} />
                  </span>
                )}
              </span>
            );
          })}
          {/* Whose bone another skeleton's bone is, said once it is
              dropped, until the next drop. */}
          {strays.length > 0 && (
            <p className="skeleton-told" role="status">
              {told !== undefined && (
                <span key={told} className="skeleton-told-line">
                  {text.otherBone(told)}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="skeleton-tray" role="group" aria-label={text.bones} data-scatter={scatter || undefined} data-turning={turning || undefined} data-columns={spots.length > TRAY_COLUMN ? 2 : undefined}>
          {spots.map((slot, index) => {
            const release = releases[slot.piece];
            // A piece once let go floats back from where it was let go
            // instead.
            const scattering = release ? undefined : scattered[slot.piece];
            return (
              <span
                key={slot.piece}
                ref={(element) => {
                  if (element) spotElements.current.set(slot.piece, element);
                  return () => {
                    spotElements.current.delete(slot.piece);
                  };
                }}
                className="skeleton-tray-spot"
                data-piece={slot.piece}
                data-hint={(!slot.fitted && shownHint?.piece === slot.piece) || undefined}
                data-area={(!slot.fitted && slot.area) || undefined}
                style={{ "--piece": index } as CSSProperties}
                onPointerDown={slot.fitted ? undefined : press(slot.piece)}
              >
                {!slot.fitted && shownHint?.piece === slot.piece && <span className="skeleton-glow" aria-hidden="true" />}
                {/* A turned piece carries a mark that it turns. */}
                {!slot.fitted && (turns[slot.piece] ?? 0) > 0 && (
                  <span className="skeleton-turn-mark" aria-hidden="true">
                    <RotateCw size={20} />
                  </span>
                )}
                {/* The whole spot picks its piece up. A piece let go is
                    drawn anew where it was let go, so it floats back from
                    there each time. It stays in its spot while held, only
                    unseen, so the touch that holds it keeps its target. */}
                {!slot.fitted && (
                  <span
                    key={release?.count ?? 0}
                    className="skeleton-piece"
                    data-held={held?.piece === slot.piece || undefined}
                    data-returning={release ? true : undefined}
                    data-scattering={scattering ? true : undefined}
                    data-nudge={nudge?.piece === slot.piece || undefined}
                    data-turns={turns[slot.piece] || undefined}
                    style={{
                      ...(release ? fromStyle(release.spot) : scattering ? ({ ...fromStyle(scattering), "--from-scale": scattering.scale } as CSSProperties) : undefined),
                      // The nudge's own offsets, whatever the piece did
                      // before: its animation follows the others'.
                      ...(nudge?.piece === slot.piece ? ({ "--nudge-x": `${nudge.dx}px`, "--nudge-y": `${nudge.dy}px` } as CSSProperties) : undefined),
                      ...turnStyle(quartersOf(slot.piece))
                    }}
                  >
                    <Picture className="skeleton-piece-picture" src={slot.picture} alt={slot.name} />
                  </span>
                )}
              </span>
            );
          })}
        </div>
        {held && lifted && (
          <span
            className="skeleton-lifted"
            data-piece={held.piece}
            style={{ width: held.width, height: held.height, translate: `${held.x - held.width / 2}px ${held.y - held.height / 2}px`, ...turnStyle(quartersOf(held.piece)) }}
          >
            <Picture className="skeleton-lifted-picture" src={lifted.picture} alt="" />
          </span>
        )}
      </div>
    </main>
  );
}

// Paleontologist's outline: the skeleton's shape alone, masked from its
// picture once loaded, which shimmers, fades in and fails as every
// picture does.
function Silhouette({ src }: { src: string }) {
  const look = usePicture(src);
  const loaded = look === "appearing" || look === "shown";
  return <span className="picture skeleton-outline-silhouette" data-picture={look} aria-hidden="true" style={loaded ? ({ "--outline-picture": `url("${src}")` } as CSSProperties) : undefined} />;
}
