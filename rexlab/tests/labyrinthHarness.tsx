import "@fontsource-variable/lexend";
import "@fontsource-variable/manrope";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useState } from "react";
import "../src/app.css";
import { LabyrinthBoardScreen } from "../src/LabyrinthBoardScreen.tsx";
import { adjacentPaths, hintInMaze, isPath, mazeSolved, moveInMaze, nextMaze, startMaze, type LabyrinthRound, type MazeLevel } from "../src/labyrinth/index.ts";
import type { Language } from "../src/language/language.ts";
import { mediaViewport } from "../src/mediaViewport.ts";
import { PicturesProvider, pictureStore } from "../src/Picture.tsx";
import triceratops from "../src/assets/dinos/triceratops/body.webp";

const sizeViewport = mediaViewport(window.matchMedia.bind(window), window.screen.orientation, window, () => getComputedStyle(document.documentElement));
const applySize = () => { document.documentElement.dataset.size = sizeViewport.sizeClass(); };
applySize();
sizeViewport.subscribe(applySize);

// A board in one of its states, playable from there: at the start, with
// HINT pressed, one step on, or home reached.
export type BoardState = "start" | "hint" | "step" | "home";

function roundIn(level: MazeLevel, state: BoardState): LabyrinthRound {
  const start = startMaze(nextMaze(level, undefined, 0.25));
  if (state === "start") return start;
  if (state === "hint") return hintInMaze(start);
  const first = moveInMaze(start, hintInMaze(start).hint!);
  if (state === "step") return first;
  let round = start;
  while (!mazeSolved(round)) round = moveInMaze(round, hintInMaze(round).hint!);
  return round;
}

function Board({ language, level, state }: { language: Language; level: MazeLevel; state: BoardState }) {
  const [round, setRound] = useState(() => roundIn(level, state));
  const { maze } = round;
  const columns = maze.rows[0]!.length;
  const legal = adjacentPaths(maze, round.position);
  return <LabyrinthBoardScreen language={language} level={level} columns={columns} rows={maze.rows.length}
    cells={Array.from({ length: maze.rows.length * columns }, (_, place) => ({ open: isPath(maze, place), legal: legal.includes(place) }))}
    baby={round.position} from={round.from} goal={maze.goal} hint={round.hint} finished={mazeSolved(round)} picture={triceratops}
    onMove={(place) => setRound((current) => moveInMaze(current, place))} onHint={() => setRound(hintInMaze)} onHome={() => undefined} />;
}

let root: Root | undefined;
const loaded = pictureStore((_url, done) => done("loaded"));
const loading = pictureStore(() => {});

export function mount(options: { language?: Language; theme?: "light" | "dark"; level?: MazeLevel; state?: BoardState; loading?: boolean }) {
  root?.unmount();
  const language = options.language ?? "en";
  document.documentElement.dataset.theme = options.theme ?? "light";
  document.documentElement.lang = language;
  const host = document.getElementById("root") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "root" }));
  root = createRoot(host);
  flushSync(() => root!.render(
    <PicturesProvider store={options.loading ? loading : loaded} startTimer={() => () => {}}>
      <Board language={language} level={options.level ?? "hatchling"} state={options.state ?? "start"} />
    </PicturesProvider>
  ));
}
