import { Footprints, House, Lightbulb, Route, Sparkles } from "lucide-react";
import { useId, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "./Button.tsx";
import { Picture } from "./Picture.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export type LabyrinthCellView = { open: boolean; legal: boolean };

export type LabyrinthBoardScreenProps = {
  language: Language;
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

export function LabyrinthBoardScreen({ language, columns, rows, cells, baby, from, goal, hint, finished, picture, onMove, onHint, onHome }: LabyrinthBoardScreenProps) {
  const text = TEXTS[language];
  const words = text.labyrinthBoard;
  const guidance = useId();
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

  return (
    <main className="labyrinth-board-screen">
      <header className="labyrinth-bar">
        <Button className="home-button" onClick={onHome}><House size={26} aria-hidden="true" />{text.home}</Button>
        <h1><Route size={30} aria-hidden="true" />{words.title}</h1>
        <Button className="home-button" onClick={onHint} disabled={finished}><Lightbulb size={26} aria-hidden="true" />{words.hint}</Button>
      </header>
      <div className="labyrinth-room">
        <div className="labyrinth-maze" role="group" aria-label={words.maze} aria-describedby={guidance} tabIndex={0} onKeyDown={keyMove}
          style={{ "--columns": columns, "--rows": rows } as CSSProperties}>
          {cells.map((cell, place) => cell.open ? (
            <Button key={place} className="labyrinth-cell" tabIndex={-1} aria-label={`${words.cell(place % columns + 1, Math.floor(place / columns) + 1)}${place === goal ? ` · ${words.goal}` : ""}${place === baby ? ` · ${words.baby}` : ""}`}
              aria-current={place === baby ? "location" : undefined} aria-disabled={finished || !cell.legal}
              data-legal={!finished && cell.legal || undefined} data-hint={hint === place || undefined} data-goal={place === goal || undefined} onClick={() => move(place)}>
              {place === goal ? <House size={34} aria-hidden="true" /> : !finished && cell.legal ? <Footprints size={28} aria-hidden="true" /> : null}
              {hint === place && <Sparkles className="labyrinth-hint" size={22} aria-hidden="true" />}
            </Button>
          ) : <span key={place} className="labyrinth-wall" aria-hidden="true" />)}
          <span className="labyrinth-baby" aria-hidden="true" style={{
            "--baby-x": baby % columns, "--baby-y": Math.floor(baby / columns),
            "--step-x": from % columns - baby % columns, "--step-y": Math.floor(from / columns) - Math.floor(baby / columns)
          } as CSSProperties}>
            <span key={`${from}-${baby}`} className="labyrinth-step"><Picture src={picture} alt="" className="labyrinth-baby-picture" width={800} height={600} /></span>
          </span>
        </div>
        <aside className="labyrinth-parent" aria-label={words.goal}>
          <Picture src={picture} alt={words.parent} className="labyrinth-parent-picture" width={800} height={600} />
          <p><House size={30} aria-hidden="true" />{words.bringHome}</p>
        </aside>
      </div>
      <p id={guidance} className="labyrinth-guidance"><Footprints size={26} aria-hidden="true" />{words.tapStep}</p>
    </main>
  );
}
