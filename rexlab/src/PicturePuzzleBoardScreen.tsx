import { ArrowLeft, ChevronLeft, ChevronRight, Eye, House, Lightbulb, Puzzle, RotateCcw } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { OrientationGate, useGateShown } from "./OrientationGate.tsx";
import { pictureBoardLayout } from "./picturePuzzleLayout.ts";
import { PicturePuzzlePicture, type PictureCrop } from "./PicturePuzzlePicture.tsx";

export type BoardPresence = {
  isHidden(): boolean;
  subscribe(onChange: () => void): () => void;
};
export type BoardBounds = { x: number; y: number; width: number; height: number };
export type BoardPoint = { x: number; y: number };
export type BoardTile = { id: number; crop: PictureCrop };
export type PictureBoard = {
  name: string;
  columns: number;
  rows: number;
  guide: boolean;
  slots: readonly (BoardTile & { filled: boolean })[];
  tray: readonly BoardTile[];
};
export type PicturePuzzleBoardScreenProps = {
  language: Language;
  scene: PictureBoard;
  picture: string;
  presence: BoardPresence;
  onPlace: (piece: number, slot: number) => boolean;
  dropFits: (piece: number, bounds: BoardBounds, point: BoardPoint) => boolean;
  onBack: () => void;
  onHome: () => void;
};

type Hold = {
  pointer: number; piece: number; x: number; y: number; startX: number; startY: number;
  moved: boolean; width: number; height: number; source: HTMLButtonElement;
};
type SlotTap = { pointer: number; slot: number; source: HTMLButtonElement };
type Release = { piece: number; x: number; y: number; count: number; fitted: boolean };

// Following a pointer changes the held tile, while fitted scenes stay still.
const BoardPicture = memo(PicturePuzzlePicture);

export function PicturePuzzleBoardScreen({ language, scene, picture, presence, onPlace, dropFits, onBack, onHome }: PicturePuzzleBoardScreenProps) {
  const text = TEXTS[language];
  const externalGate = useGateShown();
  const [selected, setSelected] = useState<number>();
  const [hint, setHint] = useState<number>();
  const [preview, setPreview] = useState<boolean>(false);
  const [page, setPage] = useState<number>(0);
  const [held, setHeld] = useState<Hold>();
  const [release, setRelease] = useState<Release>();
  const [room, setRoom] = useState<{ width: number; height: number; upright: boolean }>(() => ({
    width: window.innerWidth - 48, height: window.innerHeight - 136, upright: window.innerHeight > window.innerWidth
  }));
  const stage = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const hold = useRef<Hold>(undefined);
  const tap = useRef<SlotTap>(undefined);
  const skipClick = useRef<boolean>(false);
  const layout = pictureBoardLayout(room, scene);
  const gated = externalGate || !layout.fits || room.upright;
  const blocked = useRef<boolean>(gated);
  blocked.current = gated;
  const fittedCount = scene.slots.filter((slot) => slot.filled).length;
  const unplaced = scene.tray;
  const pages = Math.max(1, Math.ceil(unplaced.length / 4));
  const shownPage = Math.min(page, pages - 1);
  const visible = unplaced.slice(shownPage * 4, shownPage * 4 + 4);

  const updateHold = (next: Hold | undefined) => {
    hold.current = next;
    setHeld(next);
  };
  const cancel = () => {
    const current = hold.current;
    updateHold(undefined);
    tap.current = undefined;
    skipClick.current = true;
    if (current?.moved) {
      const destination = current.source.getBoundingClientRect();
      setRelease((before) => ({ piece: current.piece, x: current.x - destination.left - destination.width / 2,
        y: current.y - destination.top - destination.height / 2, count: (before?.count ?? 0) + 1, fitted: false }));
    }
    if (current?.source.hasPointerCapture?.(current.pointer)) current.source.releasePointerCapture(current.pointer);
  };

  useLayoutEffect(() => {
    const measure = () => {
      cancel();
      const bounds = stage.current?.getBoundingClientRect();
      setRoom({
        width: bounds?.width || window.innerWidth - 48,
        height: bounds?.height || window.innerHeight - 136,
        upright: window.innerHeight > window.innerWidth
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (stage.current) observer?.observe(stage.current);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useLayoutEffect(() => { if (gated) cancel(); }, [gated]);

  const fit = (piece: number, slot: number): boolean => {
    if (blocked.current || presence.isHidden()) return false;
    if (!onPlace(piece, slot)) return false;
    setSelected(undefined);
    setHint(undefined);
    // Keep the current slice after removals, including a shrinking last page.
    setPage(shownPage);
    return true;
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = hold.current;
      if (!current || event.pointerId !== current.pointer) return;
      event.preventDefault();
      updateHold({ ...current, x: event.clientX, y: event.clientY,
        moved: current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 8 });
    };
    const end = (event: PointerEvent) => {
      const current = hold.current;
      if (current && event.pointerId === current.pointer) {
        if (event.type !== "pointerup" || blocked.current || presence.isHidden()) {
          cancel();
          return;
        }
        updateHold(undefined);
        if (current.source.hasPointerCapture?.(current.pointer)) current.source.releasePointerCapture(current.pointer);
        const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 8;
        if (!moved) return;
        skipClick.current = true;
        const bounds = board.current?.getBoundingClientRect();
        const piece = scene.slots.find(({ id }) => id === current.piece);
        const accepted = bounds && piece && dropFits(piece.id,
          { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }, { x: event.clientX, y: event.clientY });
        const fitted = Boolean(accepted && fit(current.piece, current.piece));
        const destination = fitted && bounds && piece ? {
          left: bounds.left + scene.slots.indexOf(piece) % scene.columns * bounds.width / scene.columns,
          top: bounds.top + Math.floor(scene.slots.indexOf(piece) / scene.columns) * bounds.height / scene.rows,
          width: current.width, height: current.height
        } : current.source.getBoundingClientRect();
        setRelease((before) => ({ piece: current.piece, x: event.clientX - destination.left - destination.width / 2,
          y: event.clientY - destination.top - destination.height / 2, count: (before?.count ?? 0) + 1, fitted }));
      }
      const pressed = tap.current;
      if (pressed && pressed.pointer === event.pointerId) {
        tap.current = undefined;
        const bounds = board.current?.getBoundingClientRect();
        const piece = scene.slots.find(({ id }) => id === pressed.slot);
        const inside = bounds && event.clientX >= bounds.left && event.clientX < bounds.right
          && event.clientY >= bounds.top && event.clientY < bounds.bottom;
        if (event.type === "pointerup" && !blocked.current && inside && piece && bounds
          && dropFits(piece.id, { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }, { x: event.clientX, y: event.clientY })
          && event.target instanceof Node && pressed.source.contains(event.target)) {
          placeSelected(pressed.slot);
        }
      }
    };
    const hidden = () => { if (presence.isHidden()) cancel(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", cancel);
    const stopPresence = presence.subscribe(hidden);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", cancel);
      stopPresence();
    };
  });

  useEffect(() => () => {
    const current = hold.current;
    hold.current = undefined;
    tap.current = undefined;
    if (current?.source.hasPointerCapture?.(current.pointer)) current.source.releasePointerCapture(current.pointer);
  }, []);

  const select = (piece: number) => {
    if (blocked.current || hold.current || tap.current || presence.isHidden()) return;
    setSelected(piece);
    setHint(undefined);
    setRelease(undefined);
  };
  const press = (piece: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (blocked.current || hold.current || tap.current || presence.isHidden() || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    select(piece);
    const bounds = board.current?.getBoundingClientRect();
    updateHold({ pointer: event.pointerId, piece, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, moved: false,
      width: (bounds?.width ?? layout.width) / scene.columns,
      height: (bounds?.height ?? layout.height) / scene.rows, source: event.currentTarget });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const placeSelected = (slot: number) => {
    if (selected === undefined || hold.current || blocked.current || presence.isHidden()) return;
    if (!fit(selected, slot)) setRelease((before) => ({ piece: selected, x: 0, y: 0, count: (before?.count ?? 0) + 1, fitted: false }));
  };
  const askHint = () => {
    const piece = selected ?? visible[0]?.id;
    if (piece === undefined) return;
    setSelected(piece);
    setHint(piece);
    setRelease(undefined);
  };
  const leave = (action: () => void) => { cancel(); action(); };
  const releasedStyle = (piece: number, fitted: boolean): CSSProperties | undefined => release?.piece === piece && release.fitted === fitted
    ? { "--from-x": `${release.x}px`, "--from-y": `${release.y}px` } as CSSProperties : undefined;

  return (
    <OrientationGate shown={!layout.fits || room.upright} screenUpright={room.upright} language={language}>
      <main className="picture-puzzle-board-screen" onPointerDownCapture={() => {
        if (!hold.current && !tap.current) skipClick.current = false;
      }} onClickCapture={(event) => {
        if (blocked.current || hold.current || tap.current || presence.isHidden() || (event.detail > 0 && skipClick.current)) {
          event.preventDefault(); event.stopPropagation();
        }
      }}>
        <header className="picture-puzzle-board-bar">
          <Button className="picture-puzzle-control" onClick={() => leave(onBack)}><ArrowLeft aria-hidden="true" />{text.back}</Button>
          <h1>{scene.name.toLocaleUpperCase(language)}</h1>
          <p role="status" aria-label={text.pictureFitted}><Puzzle aria-hidden="true" /><span key={fittedCount}>{fittedCount}/{scene.slots.length}</span></p>
          <Button className="picture-puzzle-control" onClick={() => leave(onHome)}><House aria-hidden="true" />{text.home}</Button>
        </header>
        <div className="picture-puzzle-stage" ref={stage}>
          <div className="picture-puzzle-board" ref={board} role="group" aria-label={text.pictureBoard}
            style={{ width: layout.width, height: layout.height, gridTemplateColumns: `repeat(${scene.columns}, 1fr)`, gridTemplateRows: `repeat(${scene.rows}, 1fr)` }}>
            {scene.guide && <span className="picture-puzzle-guide"><BoardPicture src={picture} /></span>}
            {scene.slots.map((piece) => {
              const fitted = piece.filled;
              return <Button key={piece.id} className="picture-puzzle-slot" aria-label={text.pictureSlot(piece.id + 1)}
                aria-disabled={fitted} data-fitted={fitted || undefined} data-hint={hint === piece.id || undefined}
                onPointerDown={(event) => {
                  if (!blocked.current && !presence.isHidden() && !hold.current && !tap.current && !fitted && event.button === 0 && event.isPrimary !== false) {
                    tap.current = { pointer: event.pointerId, slot: piece.id, source: event.currentTarget };
                  }
                }} onClick={(event) => { if (!fitted && event.detail === 0) placeSelected(piece.id); }}>
                {fitted && <span key={release?.piece === piece.id ? release.count : 0} className="picture-puzzle-fitted" style={releasedStyle(piece.id, true)}>
                  <BoardPicture src={picture} crop={piece.crop} />
                </span>}
              </Button>;
            })}
          </div>
          <aside className="picture-puzzle-tools">
            <div className="picture-puzzle-tray" role="group" aria-label={text.picturePieces}>
              {visible.map((piece) => {
                const { id } = piece;
                const retry = release?.piece === id && !release.fitted;
                return <Button key={id} className="picture-puzzle-tray-piece" style={{ "--tile-aspect": piece.crop.width / piece.crop.height } as CSSProperties} aria-label={text.picturePiece(id + 1)} aria-pressed={selected === id}
                  onPointerDown={(event) => press(id, event)} onLostPointerCapture={(event) => { if (hold.current?.pointer === event.pointerId) cancel(); }}
                  onClick={(event) => { if (event.detail === 0) select(id); }}>
                  <span key={retry ? release.count : 0} className="picture-puzzle-tray-art" data-held={held?.piece === id && held.moved || undefined}
                    data-retry={retry || undefined} style={releasedStyle(id, false)}><BoardPicture src={picture} crop={piece.crop} /></span>
                </Button>;
              })}
            </div>
            <nav className="picture-puzzle-pages" aria-label={text.picturePieces}>
              <Button className="picture-puzzle-control" aria-label={text.picturePrevious} disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}><ChevronLeft aria-hidden="true" /></Button>
              <span>{shownPage + 1}/{pages}</span>
              <Button className="picture-puzzle-control" aria-label={text.pictureNext} disabled={shownPage === pages - 1} onClick={() => setPage(shownPage + 1)}><ChevronRight aria-hidden="true" /></Button>
            </nav>
            <Button className="picture-puzzle-control" disabled={unplaced.length === 0} onClick={askHint}><Lightbulb aria-hidden="true" />{text.pictureHint}</Button>
            <Button className="picture-puzzle-control" aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye aria-hidden="true" />{text.picturePreview}</Button>
            <p className="picture-puzzle-retry" role="status">{release && !release.fitted && <span key={release.count}><RotateCcw aria-hidden="true" />{text.pictureRetry}</span>}</p>
          </aside>
          <div className="picture-puzzle-preview" data-shown={preview || undefined} aria-hidden={!preview}>
            <BoardPicture src={picture} />
          </div>
        </div>
      </main>
      {held?.moved && <span className="picture-puzzle-lifted" style={{ width: held.width, height: held.height, left: held.x - held.width / 2, top: held.y - held.height / 2 }}>
        <BoardPicture src={picture} crop={scene.slots.find(({ id }) => id === held.piece)!.crop} />
      </span>}
    </OrientationGate>
  );
}
