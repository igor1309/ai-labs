import { ArrowLeft, ChevronLeft, ChevronRight, Eye, House, Lightbulb, Puzzle, RotateCcw } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { OrientationGate, useGateShown } from "./OrientationGate.tsx";
import { fitPicturePiece, pictureDropFits, type PicturePuzzle } from "./picturePuzzle/index.ts";
import { pictureBoardLayout } from "./picturePuzzleLayout.ts";
import { PicturePuzzlePicture } from "./PicturePuzzlePicture.tsx";

export type PicturePuzzleBoardScreenProps = {
  language: Language;
  puzzle: PicturePuzzle;
  picture: string;
  onFit: (piece: number) => void;
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

export function PicturePuzzleBoardScreen({ language, puzzle, picture, onFit, onBack, onHome }: PicturePuzzleBoardScreenProps) {
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
  const latest = useRef<PicturePuzzle>(puzzle);
  latest.current = puzzle;
  const layout = pictureBoardLayout(room, puzzle.cut);
  const gated = externalGate || !layout.fits || room.upright;
  const blocked = useRef<boolean>(gated);
  blocked.current = gated;
  const unplaced = puzzle.order.filter((id) => !puzzle.fitted.includes(id));
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
    if (blocked.current || document.hidden) return false;
    const next = fitPicturePiece(latest.current, piece, slot);
    if (next === latest.current) return false;
    latest.current = next;
    setSelected(undefined);
    setHint(undefined);
    // Keep the current slice after removals, including a shrinking last page.
    setPage(shownPage);
    onFit(piece);
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
        if (event.type !== "pointerup" || blocked.current || document.hidden) {
          cancel();
          return;
        }
        updateHold(undefined);
        if (current.source.hasPointerCapture?.(current.pointer)) current.source.releasePointerCapture(current.pointer);
        const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 8;
        if (!moved) return;
        skipClick.current = true;
        const bounds = board.current?.getBoundingClientRect();
        const piece = latest.current.cut.pieces.find(({ id }) => id === current.piece);
        const accepted = bounds && piece && pictureDropFits(piece, latest.current.cut,
          { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }, { x: event.clientX, y: event.clientY });
        const fitted = Boolean(accepted && fit(current.piece, current.piece));
        const destination = fitted && bounds && piece ? {
          left: bounds.left + piece.column * bounds.width / puzzle.cut.columns,
          top: bounds.top + piece.row * bounds.height / puzzle.cut.rows,
          width: current.width, height: current.height
        } : current.source.getBoundingClientRect();
        setRelease((before) => ({ piece: current.piece, x: event.clientX - destination.left - destination.width / 2,
          y: event.clientY - destination.top - destination.height / 2, count: (before?.count ?? 0) + 1, fitted }));
      }
      const pressed = tap.current;
      if (pressed && pressed.pointer === event.pointerId) {
        tap.current = undefined;
        const bounds = board.current?.getBoundingClientRect();
        const piece = latest.current.cut.pieces.find(({ id }) => id === pressed.slot);
        const inside = bounds && event.clientX >= bounds.left && event.clientX < bounds.right
          && event.clientY >= bounds.top && event.clientY < bounds.bottom;
        if (event.type === "pointerup" && !blocked.current && inside && piece && bounds
          && pictureDropFits(piece, latest.current.cut, { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }, { x: event.clientX, y: event.clientY })
          && event.target instanceof Node && pressed.source.contains(event.target)) {
          placeSelected(pressed.slot);
        }
      }
    };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  });

  useEffect(() => () => {
    const current = hold.current;
    hold.current = undefined;
    tap.current = undefined;
    if (current?.source.hasPointerCapture?.(current.pointer)) current.source.releasePointerCapture(current.pointer);
  }, []);

  const select = (piece: number) => {
    if (blocked.current || hold.current || tap.current || document.hidden) return;
    setSelected(piece);
    setHint(undefined);
    setRelease(undefined);
  };
  const press = (piece: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (blocked.current || hold.current || tap.current || document.hidden || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    select(piece);
    const bounds = board.current?.getBoundingClientRect();
    updateHold({ pointer: event.pointerId, piece, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, moved: false,
      width: (bounds?.width ?? layout.width) / puzzle.cut.columns,
      height: (bounds?.height ?? layout.height) / puzzle.cut.rows, source: event.currentTarget });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const placeSelected = (slot: number) => {
    if (selected === undefined || hold.current || blocked.current || document.hidden) return;
    if (!fit(selected, slot)) setRelease((before) => ({ piece: selected, x: 0, y: 0, count: (before?.count ?? 0) + 1, fitted: false }));
  };
  const askHint = () => {
    const piece = selected ?? visible[0];
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
        if (blocked.current || hold.current || tap.current || document.hidden || (event.detail > 0 && skipClick.current)) {
          event.preventDefault(); event.stopPropagation();
        }
      }}>
        <header className="picture-puzzle-board-bar">
          <Button className="picture-puzzle-control" onClick={() => leave(onBack)}><ArrowLeft aria-hidden="true" />{text.back}</Button>
          <h1>{puzzle.dinosaur.name[language].toLocaleUpperCase(language)}</h1>
          <p role="status" aria-label={text.pictureFitted}><Puzzle aria-hidden="true" /><span key={puzzle.fitted.length}>{puzzle.fitted.length}/{puzzle.cut.pieces.length}</span></p>
          <Button className="picture-puzzle-control" onClick={() => leave(onHome)}><House aria-hidden="true" />{text.home}</Button>
        </header>
        <div className="picture-puzzle-stage" ref={stage}>
          <div className="picture-puzzle-board" ref={board} role="group" aria-label={text.pictureBoard}
            style={{ width: layout.width, height: layout.height, gridTemplateColumns: `repeat(${puzzle.cut.columns}, 1fr)`, gridTemplateRows: `repeat(${puzzle.cut.rows}, 1fr)` }}>
            {puzzle.level === "hatchling" && <span className="picture-puzzle-guide"><BoardPicture src={picture} /></span>}
            {puzzle.cut.pieces.map((piece) => {
              const fitted = puzzle.fitted.includes(piece.id);
              return <Button key={piece.id} className="picture-puzzle-slot" aria-label={text.pictureSlot(piece.id + 1)}
                aria-disabled={fitted} data-fitted={fitted || undefined} data-hint={hint === piece.id || undefined}
                onPointerDown={(event) => {
                  if (!blocked.current && !hold.current && !tap.current && !fitted && event.button === 0 && event.isPrimary !== false) {
                    tap.current = { pointer: event.pointerId, slot: piece.id, source: event.currentTarget };
                  }
                }} onClick={(event) => { if (!fitted && event.detail === 0) placeSelected(piece.id); }}>
                {fitted && <span key={release?.piece === piece.id ? release.count : 0} className="picture-puzzle-fitted" style={releasedStyle(piece.id, true)}>
                  <BoardPicture src={picture} crop={piece.home} />
                </span>}
              </Button>;
            })}
          </div>
          <aside className="picture-puzzle-tools">
            <div className="picture-puzzle-tray" role="group" aria-label={text.picturePieces}>
              {visible.map((id) => {
                const piece = puzzle.cut.pieces[id]!;
                const retry = release?.piece === id && !release.fitted;
                return <Button key={id} className="picture-puzzle-tray-piece" style={{ "--tile-aspect": piece.home.width / piece.home.height } as CSSProperties} aria-label={text.picturePiece(id + 1)} aria-pressed={selected === id}
                  onPointerDown={(event) => press(id, event)} onLostPointerCapture={(event) => { if (hold.current?.pointer === event.pointerId) cancel(); }}
                  onClick={(event) => { if (event.detail === 0) select(id); }}>
                  <span key={retry ? release.count : 0} className="picture-puzzle-tray-art" data-held={held?.piece === id && held.moved || undefined}
                    data-retry={retry || undefined} style={releasedStyle(id, false)}><BoardPicture src={picture} crop={piece.home} /></span>
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
        <BoardPicture src={picture} crop={puzzle.cut.pieces[held.piece]!.home} />
      </span>}
    </OrientationGate>
  );
}
