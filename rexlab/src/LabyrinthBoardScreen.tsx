import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Footprints, House, Lightbulb, Route, Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "./Button.tsx";
import { DigGround } from "./DigBar.tsx";
import "./labyrinthBoard.css";
import { Picture } from "./Picture.tsx";
import type { AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import { follow, markerFor, moreBeyond, type Box, type Edge } from "./labyrinthView.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export type LabyrinthCellView = { open: boolean; legal: boolean };

export type LabyrinthBoardScreenProps = {
  language: Language;
  level: AgeLevel;
  columns: number;
  rows: number;
  cells: readonly LabyrinthCellView[];
  baby: number;
  from: number;
  goal: number;
  hint: number | undefined;
  finished: boolean;
  // The same existing body picture is used for both family members.
  picture: string;
  onMove: (place: number) => void;
  onHint: () => void;
  onHome: () => void;
};

const ARROWS = { left: ArrowLeft, right: ArrowRight, top: ArrowUp, bottom: ArrowDown } as const;
const EDGES: readonly Edge[] = ["left", "right", "top", "bottom"];
// A step keeps a cell and a half of maze ahead of the baby in view.
const AHEAD = 1.5;

type Seen = { more: Record<Edge, boolean>; marker: { edge: Edge; along: number } | undefined };

// Where a maze cell lies in the view's scrolled content.
function boxOf(maze: HTMLElement, place: number): Box | undefined {
  const cell = maze.children[place];
  if (!(cell instanceof HTMLElement)) return undefined;
  return { left: maze.offsetLeft + cell.offsetLeft, top: maze.offsetTop + cell.offsetTop, width: cell.offsetWidth, height: cell.offsetHeight };
}

// A window too small for the maze pans a view over it. The view follows
// the baby, fades where more maze lies, and a parent marker on the edge
// toward home points to it while home is out of view.
function useMazeView(baby: number, goal: number) {
  const view = useRef<HTMLDivElement>(null);
  const maze = useRef<HTMLDivElement>(null);
  const followed = useRef(false);
  const [seen, setSeen] = useState<Seen>({ more: { left: false, right: false, top: false, bottom: false }, marker: undefined });
  const look = useCallback(() => {
    const window = view.current;
    const goalBox = maze.current && boxOf(maze.current, goal);
    if (!window || !goalBox) return;
    const size = { width: window.clientWidth, height: window.clientHeight };
    const scroll = { left: window.scrollLeft, top: window.scrollTop };
    const more = moreBeyond(size, { width: window.scrollWidth, height: window.scrollHeight }, scroll);
    const marker = markerFor(size, goalBox, scroll);
    setSeen((last) => EDGES.every((edge) => last.more[edge] === more[edge]) && last.marker?.edge === marker?.edge && last.marker?.along === marker?.along ? last : { more, marker });
  }, [goal]);
  const keepInView = useCallback((instant: boolean) => {
    const window = view.current;
    const cell = maze.current && boxOf(maze.current, baby);
    if (!window || !cell) return;
    const to = follow({ width: window.clientWidth, height: window.clientHeight }, { width: window.scrollWidth, height: window.scrollHeight },
      cell, { left: window.scrollLeft, top: window.scrollTop }, cell.width * AHEAD);
    if (to.left !== window.scrollLeft || to.top !== window.scrollTop) window.scrollTo?.({ ...to, ...instant && { behavior: "instant" } });
    look();
  }, [baby, look]);
  // The first look is instant, each step after it glides.
  useLayoutEffect(() => {
    keepInView(!followed.current);
    followed.current = true;
  }, [keepInView]);
  useEffect(() => {
    const resized = () => keepInView(true);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, [keepInView]);
  return { view, maze, seen, look };
}

export function LabyrinthBoardScreen({ language, level, columns, rows, cells, baby, from, goal, hint, finished, picture, onMove, onHint, onHome }: LabyrinthBoardScreenProps) {
  const text = TEXTS[language];
  const words = text.labyrinthBoard;
  const guidance = useId();
  const compact = Math.max(columns, rows) > 9;
  const { view, maze, seen, look } = useMazeView(baby, goal);
  const move = (place: number) => {
    if (!finished && cells[place]?.legal) onMove(place);
  };
  const keyMove = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const offsets: Record<string, number> = { ArrowUp: -columns, ArrowRight: 1, ArrowDown: columns, ArrowLeft: -1 };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = baby + offset;
    if (Math.abs(next % columns - baby % columns) + Math.abs(Math.floor(next / columns) - Math.floor(baby / columns)) === 1) move(next);
  };

  const home = <House className="labyrinth-goal-symbol" aria-hidden="true" />;
  return (
    <main className="labyrinth-board-screen" data-level={level} data-compact={compact || undefined} data-finished={finished || undefined}
      onContextMenu={(event) => event.preventDefault()}>
      <DigGround />
      <header className="labyrinth-bar">
        <Button className="home-button" aria-label={text.home} onClick={onHome}><House aria-hidden="true" /><span className="labyrinth-home-word">{text.home}</span></Button>
        <h1>{compact
          ? <><span className="labyrinth-level-picture" aria-hidden="true">{AGE_LEVEL_PICTURES[level]}</span>{text.ageLevels[level].name}</>
          : <><span className="labyrinth-mark" aria-hidden="true"><Route /></span>{words.title}</>}</h1>
        <Button className="labyrinth-hint-button" onClick={onHint} disabled={finished} data-showing={hint !== undefined || undefined} aria-label={words.hint}>
          <Lightbulb aria-hidden="true" /><span className="labyrinth-hint-word">{words.hint}</span>
        </Button>
      </header>
      <div className="labyrinth-room">
        <div className="labyrinth-view">
        <div ref={view} className="labyrinth-window" onScroll={look}>
        <div ref={maze} className="labyrinth-maze" role="group" aria-label={words.maze} aria-describedby={guidance} tabIndex={0} onKeyDown={keyMove}
          style={{ "--columns": columns, "--rows": rows } as CSSProperties}>
          {cells.map((cell, place) => cell.open ? (
            <Button key={place} className="labyrinth-cell" tabIndex={-1} aria-label={`${words.cell(place % columns + 1, Math.floor(place / columns) + 1)}${place === goal ? ` · ${words.goal}` : ""}${place === baby ? ` · ${words.baby}` : ""}`}
              aria-current={place === baby ? "location" : undefined} aria-disabled={finished || !cell.legal}
              data-legal={!finished && cell.legal || undefined} data-hint={hint === place || undefined} data-goal={place === goal || undefined} onClick={() => move(place)}>
              {/* The stylesheet shows the parent on home or the house alone. */}
              {place === goal && <>
                <Picture src={picture} alt={compact || finished ? words.parent : ""} className="labyrinth-goal-picture" width={800} height={600} />
                {!finished && <span className="labyrinth-goal-badge">{home}</span>}
                {!finished && <span className="labyrinth-goal-house">{home}</span>}
              </>}
              {!finished && cell.legal && <span className="labyrinth-spot">
                <Footprints className="labyrinth-footprint" aria-hidden="true" />
                {hint === place && <Sparkles className="labyrinth-hint" aria-hidden="true" />}
              </span>}
            </Button>
          ) : <span key={place} className="labyrinth-wall" aria-hidden="true" />)}
          <span className="labyrinth-baby" aria-hidden="true" style={{
            "--baby-x": baby % columns, "--baby-y": Math.floor(baby / columns),
            "--step-x": from % columns - baby % columns, "--step-y": Math.floor(from / columns) - Math.floor(baby / columns)
          } as CSSProperties}>
            <span key={`${from}-${baby}`} className="labyrinth-step"><Picture src={picture} alt="" className="labyrinth-baby-picture" width={800} height={600} /></span>
          </span>
        </div>
        </div>
        {EDGES.filter((edge) => seen.more[edge]).map((edge) => <span key={edge} className="labyrinth-fade" data-edge={edge} aria-hidden="true" />)}
        {!finished && seen.marker && <MarkerHome edge={seen.marker.edge} along={seen.marker.along} picture={picture} />}
        </div>
        <aside className="labyrinth-side">
          <section className="labyrinth-parent" aria-label={words.goal}>
            <span className="labyrinth-parent-ground">
              {finished && <Sparkles className="labyrinth-reunion-sparkles" aria-hidden="true" />}
              <Picture src={picture} alt={compact || finished ? "" : words.parent} className="labyrinth-parent-picture" width={800} height={600} />
            </span>
            <p><span className="labyrinth-house-badge"><House aria-hidden="true" /></span>{finished ? text.labyrinthResult.title : words.bringHome}</p>
          </section>
          <p id={guidance} className="labyrinth-guidance"><Footprints aria-hidden="true" />{words.tapStep}</p>
        </aside>
      </div>
    </main>
  );
}

function MarkerHome({ edge, along, picture }: { edge: Edge; along: number; picture: string }) {
  const Arrow = ARROWS[edge];
  return (
    <span className="labyrinth-marker" data-edge={edge} aria-hidden="true" style={{ "--along": `${along}px` } as CSSProperties}>
      <Picture src={picture} alt="" className="labyrinth-marker-picture" width={800} height={600} />
      <Arrow className="labyrinth-marker-arrow" />
    </span>
  );
}
