import { Bone } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { SkeletonBar } from "./SkeletonBar.tsx";

export type ShownPiece = "skull" | "spine" | "legs" | "tail";

// Where a piece goes on the outline, as fractions of the outline's width
// and height, and whether it is fitted there.
export type SkeletonSlotView = {
  piece: ShownPiece;
  picture: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fitted: boolean;
};

// A point on the outline, in pixels of the skeleton's frame.
export type FramePoint = { x: number; y: number };

export type SkeletonPuzzleScreenProps = {
  language: Language;
  // The dinosaur being built.
  name: string;
  // The whole skeleton, drawn faint as the outline the pieces fit on, and
  // its frame's size.
  outline: string;
  frame: { width: number; height: number };
  // Every piece's slot, in the tray's order: a piece not yet fitted waits
  // in its spot in the tray, and a fitted one leaves its spot empty, so
  // the other pieces never move.
  slots: readonly SkeletonSlotView[];
  // The piece help points at, if any: it and its slot glow alike.
  hint: ShownPiece | undefined;
  // Every piece is fitted.
  complete: boolean;
  // The skeleton was knocked down from its stand: each piece scatters from
  // its home on the outline to its spot in the tray as the puzzle starts.
  scatter: boolean;
  // A piece let go with its centre at `centre`, and how far from its home
  // it still fits, both in pixels of the frame.
  onDrop: (piece: ShownPiece, centre: FramePoint, reach: number) => void;
  onMuseum: () => void;
  onHome: () => void;
};

// How near its home a dropped piece's centre fits, in CSS pixels:
// generous, so a child's near miss still fits.
export const SNAP = 48;

// A piece held by a finger, a pen or the mouse: where the pointer is, the
// size the piece is drawn at on the board, and the help showing as it
// was picked up, which stays as it is until the piece is let go.
type Hold = { pointerId: number; piece: ShownPiece; x: number; y: number; width: number; height: number; hint: ShownPiece | undefined };

// Where a piece was let go, from the centre of its slot and of its spot in
// the tray, in CSS pixels, so it slides from there to whichever it ends
// in. Each release has its own count, so each one slides anew.
type Offset = { dx: number; dy: number };
type Release = { slot: Offset; spot: Offset; count: number };

const percent = (fraction: number) => `${fraction * 100}%`;

const NO_RECT = { left: 0, top: 0, width: 0, height: 0 };

const offsetFrom = (x: number, y: number, { left, top, width, height }: typeof NO_RECT): Offset => ({ dx: x - (left + width / 2), dy: y - (top + height / 2) });

const fromStyle = ({ dx, dy }: Offset) => ({ "--from-x": `${dx}px`, "--from-y": `${dy}px` }) as CSSProperties;

// Where a scattered piece starts, from the centre of its picture in the
// tray, and how much larger it is drawn in its home than there.
type Scattered = Offset & { scale: number };

export function SkeletonPuzzleScreen({ language, name, outline, frame, slots, hint, complete, scatter, onDrop, onMuseum, onHome }: SkeletonPuzzleScreenProps) {
  const text = TEXTS[language];
  const fitted = slots.filter((slot) => slot.fitted).length;
  const [held, setHeld] = useState<Hold>();
  const [releases, setReleases] = useState<Partial<Record<ShownPiece, Release>>>({});
  const [scattered, setScattered] = useState<Partial<Record<ShownPiece, Scattered>>>({});
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

  // The rectangle of a piece's slot on the screen.
  const slotRect = (piece: ShownPiece) => {
    const board = boardRect();
    const slot = slots.find((each) => each.piece === piece);
    if (!slot) return NO_RECT;
    return { left: board.left + slot.left * board.width, top: board.top + slot.top * board.height, width: slot.width * board.width, height: slot.height * board.height };
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
  // the iPad turns, goes back to the tray without a drop. The listeners
  // are added anew on each render, so they drop on the board as it is.
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
      const { piece } = current;
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
    holdPiece({ pointerId: event.pointerId, piece, x: event.clientX, y: event.clientY, width, height, hint });
  };

  // Help that falls due while a piece is held waits until it is let go,
  // so nothing new lights up under the child's finger.
  const shownHint = held ? held.hint : hint;
  const lifted = held && slots.find((slot) => slot.piece === held.piece);

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
          <img className="skeleton-outline" src={outline} alt="" draggable={false} />
          {slots.map((slot) => {
            const release = releases[slot.piece];
            return (
              <span
                key={slot.piece}
                className="skeleton-slot"
                data-piece={slot.piece}
                data-state={slot.fitted ? "fitted" : "empty"}
                data-target={held?.piece === slot.piece || undefined}
                data-hint={shownHint === slot.piece || undefined}
                style={{ left: percent(slot.left), top: percent(slot.top), width: percent(slot.width), height: percent(slot.height) }}
              >
                {shownHint === slot.piece && <span className="skeleton-glow" aria-hidden="true" />}
                {slot.fitted && (
                  <img
                    className="skeleton-fitted"
                    src={slot.picture}
                    alt={text.pieces[slot.piece]}
                    draggable={false}
                    data-snapped={release ? true : undefined}
                    style={release && fromStyle(release.slot)}
                  />
                )}
              </span>
            );
          })}
        </div>
        <div className="skeleton-tray" role="group" aria-label={text.bones} data-scatter={scatter || undefined}>
          {slots.map((slot, index) => {
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
                data-hint={(!slot.fitted && shownHint === slot.piece) || undefined}
                style={{ "--piece": index } as CSSProperties}
                onPointerDown={slot.fitted ? undefined : press(slot.piece)}
              >
                {!slot.fitted && shownHint === slot.piece && <span className="skeleton-glow" aria-hidden="true" />}
                {/* The whole spot picks its piece up. A piece let go is
                    drawn anew where it was let go, so it floats back from
                    there each time. It stays in its spot while held, only
                    unseen, so the touch that holds it keeps its target. */}
                {!slot.fitted && (
                  <img
                    key={release?.count ?? 0}
                    className="skeleton-piece"
                    src={slot.picture}
                    alt={text.pieces[slot.piece]}
                    draggable={false}
                    data-held={held?.piece === slot.piece || undefined}
                    data-returning={release ? true : undefined}
                    data-scattering={scattering ? true : undefined}
                    style={release ? fromStyle(release.spot) : scattering && ({ ...fromStyle(scattering), "--from-scale": scattering.scale } as CSSProperties)}
                  />
                )}
              </span>
            );
          })}
        </div>
        {held && lifted && (
          <img
            className="skeleton-lifted"
            data-piece={held.piece}
            src={lifted.picture}
            alt=""
            draggable={false}
            style={{ width: held.width, height: held.height, translate: `${held.x - held.width / 2}px ${held.y - held.height / 2}px` }}
          />
        )}
      </div>
    </main>
  );
}
